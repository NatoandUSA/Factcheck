const express = require('express');
const { GoogleGenAI } = require('@google/genai');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const XLSX = require('xlsx');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const ipGuard = require('./ipGuard');
const opportunityScorer = require('./opportunityScorer');
const ytrendsMcp = require('./ytuongMcpClient');
const ytrendsParser = require('./ytrendsParser');




const app = express();
app.use(cors());
app.use(express.json());

// Ensure data/imports directory exists
const importsDir = path.resolve(__dirname, '../data/imports');
if (!fs.existsSync(importsDir)) {
  fs.mkdirSync(importsDir, { recursive: true });
}

// Multer configuration for file upload
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, importsDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});
const upload = multer({ storage: storage });

const dbPath = path.resolve(__dirname, 'app.db');
const db = new sqlite3.Database(dbPath);

// Initialize DB schema
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE,
      role TEXT,
      name TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS listings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      amazonTitle TEXT,
      etsyTitle TEXT,
      categoryName TEXT,
      status TEXT,
      generatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      authorId INTEGER,
      payload TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS sales_feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      listingId INTEGER,
      views INTEGER,
      orders INTEGER,
      revenue REAL,
      action TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(listingId) REFERENCES listings(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS agents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE,
      role TEXT,
      status TEXT DEFAULT 'OFFLINE',
      lastActive DATETIME
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS agent_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agentId INTEGER,
      message TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS market_trends (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT,
      trending_keywords TEXT,
      discoveredAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      processed BOOLEAN DEFAULT 0
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `);

  // Seed default users if empty
  db.get("SELECT COUNT(*) as count FROM users", (err, row) => {
    if (row && row.count === 0) {
      console.log('Seeding initial users...');
      const stmt = db.prepare("INSERT INTO users (email, role, name) VALUES (?, ?, ?)");
      stmt.run('owner@omniseller.local', 'OWNER', 'Store Owner');
      stmt.run('manager@omniseller.local', 'MANAGER', 'Ops Manager');
      stmt.run('designer@omniseller.local', 'DESIGNER', 'Lead Designer');
      stmt.run('seller@omniseller.local', 'SELLER', 'Listing Specialist');
      stmt.finalize();
    }
  });

  // Seed default agents if empty
  db.get("SELECT COUNT(*) as count FROM agents", (err, row) => {
    if (row && row.count === 0) {
      console.log('Seeding initial agents...');
      const stmt = db.prepare("INSERT INTO agents (name, role, status) VALUES (?, ?, ?)");
      stmt.run('Trend Scout', 'RESEARCHER', 'OFFLINE');
      stmt.run('AI Drafter', 'DRAFTER', 'OFFLINE');
      stmt.finalize();
    }
  });

  // Seed Gemini API key from .env if present
  if (process.env.GEMINI_API_KEY) {
    db.run("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", ['gemini_api_key', process.env.GEMINI_API_KEY]);
    console.log('Gemini API key configured from .env environment.');
  }
});

// Mock Auth endpoint (just select a user by email for prototyping)
app.post('/api/login', (req, res) => {
  const { email } = req.body;
  db.get("SELECT * FROM users WHERE email = ?", [email], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(401).json({ error: 'User not found' });
    res.json({ user: row });
  });
});

// Create a new listing (DRAFT/NEEDS_QA or IP_RISK_BLOCKED)
app.post('/api/listings', (req, res) => {
  const { amazonTitle, etsyTitle, categoryName, payload = {}, authorId } = req.body;
  
  const listingData = { amazonTitle, etsyTitle, categoryName, ...payload };
  const ipResult = ipGuard.screenListing(listingData);
  const oppResult = opportunityScorer.calculateOpportunityScore(listingData);

  const updatedPayload = {
    ...payload,
    amazonTitle,
    etsyTitle,
    categoryName,
    ipVerdict: ipResult.verdict,
    ipHits: ipResult.hits,
    opportunityScore: oppResult.overallScore,
    verdict: oppResult.verdict,
    metrics: oppResult.metrics
  };

  const status = (ipResult.verdict === 'BLOCK') ? 'IP_RISK_BLOCKED' : 'NEEDS_QA';
  
  db.run(
    "INSERT INTO listings (amazonTitle, etsyTitle, categoryName, status, authorId, payload) VALUES (?, ?, ?, ?, ?, ?)",
    [amazonTitle, etsyTitle, categoryName, status, authorId, JSON.stringify(updatedPayload)],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID, status, payload: updatedPayload });
    }
  );
});

// Get all listings
app.get('/api/listings', (req, res) => {
  db.all("SELECT * FROM listings ORDER BY generatedAt DESC", [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const safeRows = rows.map(r => {
      let parsedPayload = {};
      try { parsedPayload = JSON.parse(r.payload); } catch (e) { parsedPayload = { error: 'Malformed AI Payload' }; }
      
      // Dynamic fallback screening if payload lacks scores
      if (!parsedPayload.ipVerdict) {
        const ipRes = ipGuard.screenListing(parsedPayload);
        const oppRes = opportunityScorer.calculateOpportunityScore(parsedPayload);
        parsedPayload.ipVerdict = ipRes.verdict;
        parsedPayload.ipHits = ipRes.hits;
        parsedPayload.opportunityScore = oppRes.overallScore;
        parsedPayload.verdict = oppRes.verdict;
        parsedPayload.metrics = oppRes.metrics;
      }

      return { ...r, payload: parsedPayload };
    });
    res.json(safeRows);
  });
});

// Approve a listing (Blocked if IP_RISK_BLOCKED)
app.patch('/api/listings/:id/approve', (req, res) => {
  const { id } = req.params;
  const { userId, userRole } = req.body;

  if (userRole !== 'MANAGER' && userRole !== 'OWNER' && userRole !== 'ADMIN') {
    return res.status(403).json({ error: 'Only Managers can approve listings.' });
  }

  db.get("SELECT * FROM listings WHERE id = ?", [id], (err, row) => {
    if (err || !row) return res.status(404).json({ error: 'Listing not found.' });

    let parsedPayload = {};
    try { parsedPayload = JSON.parse(row.payload); } catch(e) {}
    const ipCheck = ipGuard.screenListing(parsedPayload);

    if (row.status === 'IP_RISK_BLOCKED' || ipCheck.verdict === 'BLOCK') {
      return res.status(403).json({ 
        error: 'BLOCKED: Listing contains trademark/IP violations. Resolve IP risk before approval.',
        hits: ipCheck.hits
      });
    }

    db.run("UPDATE listings SET status = 'MANAGER_APPROVED' WHERE id = ?", [id], function(updateErr) {
      if (updateErr) return res.status(500).json({ error: updateErr.message });
      res.json({ success: true, status: 'MANAGER_APPROVED' });
    });
  });
});


// Submit Sales Feedback (7-day loop)
app.post('/api/listings/:id/feedback', (req, res) => {
  const { id } = req.params;
  const { views, orders, revenue } = req.body;
  
  // Basic logic for KEEP/CHANGE/KILL/SCALE based on Etsy Repo logic
  let action = 'KEEP';
  const conversionRate = (views > 0) ? (orders / views) * 100 : 0;
  
  if (orders > 5 && revenue > 100) action = 'SCALE';
  else if (views > 100 && orders === 0) action = 'CHANGE_MAIN_PHOTO_OR_PRICE';
  else if (views < 10 && orders === 0) action = 'CHANGE_TAGS_OR_TITLE';
  else if (views === 0) action = 'KILL_LISTING';
  
  db.run(
    "INSERT INTO sales_feedback (listingId, views, orders, revenue, action) VALUES (?, ?, ?, ?, ?)",
    [id, views, orders, revenue, action],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID, action, conversionRate });
    }
  );
});

// API: Get YTrends MCP Tools List from https://mcp.trends.ytuong.ai/mcp
app.get('/api/mcp/tools', async (req, res) => {
  try {
    const tools = await ytrendsMcp.listTools();
    res.json({ success: true, count: tools.length, tools });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Call YTrends MCP Tool (Universal)
app.post('/api/mcp/call', async (req, res) => {
  const { toolName, args = {} } = req.body;
  if (!toolName) return res.status(400).json({ error: 'toolName is required' });

  try {
    const result = await ytrendsMcp.callTool(toolName, args);
    res.json({ success: true, toolName, result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Explore Etsy Niche via YTrends MCP
app.get('/api/mcp/niche', async (req, res) => {
  const { seed = 'nurse sweatshirt' } = req.query;
  try {
    const data = await ytrendsMcp.exploreNiche(seed);
    res.json({ success: true, seed, data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// API: Upload and process Helium 10 / CSV reports
app.post('/api/upload-h10', upload.single('reportFile'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const filePath = req.file.path;
  const fileName = req.file.originalname;
  const targetCategory = req.body.category || 'Jewelry';

  try {
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const rawRows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);

    if (!rawRows || rawRows.length === 0) {
      return res.status(400).json({ error: 'Uploaded file contains no data rows.' });
    }

    // Detect all multi-dimensional Helium 10 & Data Dive columns
    const firstRow = rawRows[0];
    const kwKey = Object.keys(firstRow).find(k => /keyword|phrase|query|search query|search term/i.test(k)) || Object.keys(firstRow)[0];
    const volKey = Object.keys(firstRow).find(k => /^(search\s*volume|volume|searches)$/i.test(k.trim())) || Object.keys(firstRow).find(k => /volume/i.test(k));
    const compKey = Object.keys(firstRow).find(k => /competing|competition|competitors/i.test(k));
    const titleDensityKey = Object.keys(firstRow).find(k => /title\s*density|density/i.test(k));
    const cprKey = Object.keys(firstRow).find(k => /cpr/i.test(k));
    const iqKey = Object.keys(firstRow).find(k => /iq\s*score/i.test(k));

    // Common IP / Trademark / Copyright Blacklist & Competitor Brand patterns
    const IP_TRADEMARK_BLACKLIST = [
      'disney', 'marvel', 'dc comics', 'spider-man', 'spiderman', 'ghost spider', 'batman', 
      'superman', 'avengers', 'iron man', 'harry potter', 'star wars', 'pokemon', 'lego', 
      'barbie', 'hello kitty', 'snoopy', 'grinch', 'nike', 'adidas', 'gucci', 'chanel', 
      'louis vuitton', 'prada', 'pandora', 'tiffany', 'bangely', 'taylor swift', 'cricut'
    ];

    // Compute Multi-Dimensional Opportunity Score for each row (Data Dive & H10 A10 Model)
    const evaluatedKeywords = [];
    const flaggedIpKeywords = [];

    for (const r of rawRows) {
      let rawVal = String(r[kwKey] || '').trim();
      
      // Clean competitor title spam (e.g. strip pipe '|' and trailing filler)
      if (rawVal.includes('|')) {
        rawVal = rawVal.split('|')[0].trim();
      }
      rawVal = rawVal.replace(/\s+/g, ' ').replace(/^["']|["']$/g, '').trim();

      if (!rawVal || rawVal.length < 3 || rawVal.length > 80) continue;

      // IP / Trademark Screening
      const lower = rawVal.toLowerCase();
      const isIpRisk = IP_TRADEMARK_BLACKLIST.some(ip => lower.includes(ip));
      if (isIpRisk) {
        if (!flaggedIpKeywords.includes(rawVal)) {
          flaggedIpKeywords.push(rawVal);
        }
        continue; // Skip trademarked terms
      }

      // Avoid duplicates
      if (evaluatedKeywords.some(item => item.keyword.toLowerCase() === rawVal.toLowerCase())) {
        continue;
      }

      const searchVolume = volKey && Number(r[volKey]) ? Number(r[volKey]) : 0;
      const competingProducts = compKey && Number(r[compKey]) ? Number(r[compKey]) : 0;
      const titleDensity = titleDensityKey && !isNaN(Number(r[titleDensityKey])) ? Number(r[titleDensityKey]) : null;
      const cpr = cprKey && Number(r[cprKey]) ? Number(r[cprKey]) : null;
      const rawIq = iqKey && Number(r[iqKey]) ? Number(r[iqKey]) : 0;

      // Calculate A10 Golden Opportunity Score:
      // High Search Volume + Low Competing Products + Low Title Density = Highest Score
      let opportunityScore = 0;
      if (rawIq > 0) {
        opportunityScore = rawIq;
      } else if (searchVolume > 0) {
        const compFactor = Math.sqrt(competingProducts + 10);
        const tdFactor = (titleDensity !== null && titleDensity >= 0) ? (titleDensity + 1) : 4;
        // Formula balances high volume while rewarding low competition & low title density
        opportunityScore = Math.round((searchVolume / (compFactor * tdFactor)) * 100);
      } else {
        opportunityScore = 50; // default baseline if no volume column
      }

      evaluatedKeywords.push({
        keyword: rawVal,
        searchVolume,
        competingProducts,
        titleDensity,
        cpr,
        opportunityScore
      });
    }

    if (evaluatedKeywords.length === 0) {
      return res.status(400).json({ 
        error: 'Không tìm thấy từ khóa an toàn. Các từ khóa trong file có thể đã bị chặn bởi bộ lọc IP/Trademark.',
        flaggedIpKeywords
      });
    }

    // Sort by Opportunity Score Descending (Highest Potential first)
    evaluatedKeywords.sort((a, b) => b.opportunityScore - a.opportunityScore);

    // Assign Strategic Tiers (Data Dive MKL Methodology)
    const topKeywordsDetailed = evaluatedKeywords.slice(0, 15).map((item, idx) => {
      let tier = 'Tier 3 (Backend Fuel)';
      let tierBadge = '📦 Backend Terms';
      if (idx < 3) {
        tier = 'Tier 1 (Golden Launch - Title Hook)';
        tierBadge = '👑 Amazon/Etsy Title';
      } else if (idx < 8) {
        tier = 'Tier 2 (Core Feature - Bullets/Tags)';
        tierBadge = '💎 Bullets & 13 Tags';
      }
      return {
        ...item,
        rank: idx + 1,
        tier,
        tierBadge
      };
    });

    const keywords = topKeywordsDetailed.map(k => k.keyword);
    const trendingKeywordsStr = keywords.slice(0, 10).join(', ');

    // Insert into market_trends for AI Drafter
    db.run(
      "INSERT INTO market_trends (category, trending_keywords) VALUES (?, ?)",
      [targetCategory, trendingKeywordsStr],
      function(dbErr) {
        if (dbErr) return res.status(500).json({ error: dbErr.message });
        
        const trendId = this.lastID;
        const msg = `[H10 MKL ENGINE] Scored & imported ${keywords.length} keywords from "${fileName}" for ${targetCategory}. Top Opportunity: "${keywords[0]}" (Score: ${topKeywordsDetailed[0].opportunityScore})`;
        
        // Log to Agent 1 if exists
        db.run("INSERT INTO agent_logs (agentId, message) VALUES (1, ?)", [msg]);

        res.json({
          success: true,
          trendId,
          fileName,
          category: targetCategory,
          totalRows: rawRows.length,
          topKeywords: keywords,
          topKeywordsDetailed,
          flaggedIpKeywords,
          trendingKeywordsStr
        });
      }
    );
  } catch (err) {
    console.error('H10 File Parse Error:', err);
    res.status(500).json({ error: `Failed to parse file: ${err.message}` });
  }
});

// Real Analytics Summary Endpoint (Driven by real listings & feedback)
app.get('/api/analytics-summary', (req, res) => {
  db.get(`
    SELECT 
      COUNT(*) as totalListings,
      SUM(CASE WHEN status = 'MANAGER_APPROVED' THEN 1 ELSE 0 END) as approvedListings,
      SUM(CASE WHEN status = 'NEEDS_QA' THEN 1 ELSE 0 END) as pendingListings
    FROM listings
  `, [], (err, listingStats) => {
    if (err) return res.status(500).json({ error: err.message });

    db.all(`
      SELECT categoryName, COUNT(*) as count 
      FROM listings 
      GROUP BY categoryName
    `, [], (catErr, catRows) => {
      if (catErr) return res.status(500).json({ error: catErr.message });

      db.get(`
        SELECT COUNT(*) as totalTrends, SUM(CASE WHEN processed = 1 THEN 1 ELSE 0 END) as processedTrends
        FROM market_trends
      `, [], (trendErr, trendStats) => {
        if (trendErr) return res.status(500).json({ error: trendErr.message });

        db.all(`
          SELECT action, COUNT(*) as count, SUM(revenue) as totalRevenue, SUM(orders) as totalOrders, SUM(views) as totalViews
          FROM sales_feedback
          GROUP BY action
        `, [], (feedErr, feedRows) => {
          res.json({
            listingStats: listingStats || { totalListings: 0, approvedListings: 0, pendingListings: 0 },
            categoryBreakdown: catRows || [],
            trendStats: trendStats || { totalTrends: 0, processedTrends: 0 },
            feedbackStats: feedRows || []
          });
        });
      });
    });
  });
});
// API: Get all imported keyword trends
app.get('/api/trends', (req, res) => {
  db.all("SELECT * FROM market_trends ORDER BY discoveredAt DESC LIMIT 30", [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// API: Instantly Draft listing for a specific trend using Gemini 3.6 Flash
app.post('/api/trends/:id/draft', (req, res) => {
  const { id } = req.params;
  
  db.get("SELECT * FROM market_trends WHERE id = ?", [id], (err, trend) => {
    if (err || !trend) return res.status(404).json({ error: 'Trend cluster not found' });

    db.get("SELECT value FROM settings WHERE key = 'gemini_api_key'", async (sErr, setting) => {
      if (sErr || !setting || !setting.value) {
        return res.status(400).json({ error: 'Gemini API Key missing. Please set it in .env or Settings modal.' });
      }

      try {
        const client = new GoogleGenAI({ apiKey: setting.value });
        const prompt = `You are a world-class E-Commerce Copywriting & SEO Specialist with deep mastery of Amazon A10, Data Dive MKL, and Etsy Search Algorithm.
Write a highly converting, dual-platform e-commerce listing package for a ${trend.category} product targeting these curated keywords: ${trend.trending_keywords}.

STRICT PLATFORM RULES:
1. AMAZON FBM (A10 Algorithm):
   - "amazonTitle": 130-180 chars, Title Case, front-load top commercial phrases. Zero prohibited claims (no "best seller", "free shipping", "guarantee").
   - "amazonBullets": EXACTLY 5 bullet points (150-250 chars each). Each MUST start with a [CAPITALIZED HOOK].
   - "amazonSearchTerms": Space-separated generic terms strictly under 240 UTF-8 bytes. NO COMMAS.
   - "amazonDescription": High-converting HTML formatted product description (<p>, <ul>, <strong>).
   - "amazonAPlusContent": Structured A+ package:
     {
       "brandStoryHeadline": "Timeless Emotional Keepsakes",
       "brandStoryBody": "Crafting personalized gifts that celebrate lifelong relationships.",
       "modules": [
         { "moduleType": "Hero Banner Story", "heading": "...", "body": "..." },
         { "moduleType": "Three Feature Highlights", "features": [{ "title": "...", "desc": "..." }, { "title": "...", "desc": "..." }, { "title": "...", "desc": "..." }] },
         { "moduleType": "Specifications & Unboxing", "heading": "...", "body": "..." }
       ]
     }

2. ETSY (Gift-Giver & Handmade Search):
   - "etsyTitle": Max 140 chars. Front-load top gift occasion / recipient in first 40 chars for mobile.
   - "etsyTags": EXACTLY 13 multi-word long-tail tags (<=20 chars each, letters/numbers/spaces only). Focus on recipient and occasion.
   - "etsyMaterials": Array of 3-5 authentic materials.
   - "etsyPersonalizationInstructions": Step-by-step buyer guide.
   - "etsyDescription": Warm, story-driven description with details, sizing, and care instructions.

Return ONLY a valid raw JSON object without markdown code fences:
{
  "amazonTitle": "...",
  "amazonBullets": ["...", "...", "...", "...", "..."],
  "amazonSearchTerms": "...",
  "amazonDescription": "...",
  "amazonAPlusContent": {
    "brandStoryHeadline": "...",
    "brandStoryBody": "...",
    "modules": [
      { "moduleType": "Hero Banner Story", "heading": "...", "body": "..." },
      { "moduleType": "Three Feature Highlights", "features": [{ "title": "...", "desc": "..." }, { "title": "...", "desc": "..." }, { "title": "...", "desc": "..." }] },
      { "moduleType": "Specifications & Unboxing", "heading": "...", "body": "..." }
    ]
  },
  "etsyTitle": "...",
  "etsyTags": ["...", ... (13 items, <=20 chars each)],
  "etsyMaterials": ["...", "..."],
  "etsyPersonalizationInstructions": "...",
  "etsyDescription": "..."
}`;

        const interaction = await client.interactions.create({
          model: "gemini-3.6-flash",
          input: prompt,
          system_instruction: "You are an elite E-Commerce Listing & SEO Specialist for Amazon A10 & Etsy. Return ONLY raw JSON without markdown code fences."
        });

        let text = interaction.output_text;
        if (text.includes('```json')) {
          text = text.split('```json')[1].split('```')[0].trim();
        } else if (text.includes('```')) {
          text = text.split('```')[1].split('```')[0].trim();
        }
        const aiData = JSON.parse(text);

        const payload = {
          amazonTitle: aiData.amazonTitle || `Personalized ${trend.category}`,
          amazonBullets: aiData.amazonBullets || [],
          amazonSearchTerms: aiData.amazonSearchTerms || '',
          amazonDescription: aiData.amazonDescription || '',
          amazonAPlusContent: aiData.amazonAPlusContent || null,
          amazonAPlusPoints: aiData.amazonAPlusPoints || [],
          etsyTitle: aiData.etsyTitle || `Custom ${trend.category}`,
          etsyDescription: aiData.etsyDescription || '',
          etsyTags: (aiData.etsyTags || []).slice(0, 13).map(t => String(t).substring(0, 20)),
          etsyMaterials: aiData.etsyMaterials || [],
          etsyPersonalizationInstructions: aiData.etsyPersonalizationInstructions || '',
          categoryName: trend.category,
          generatedAt: new Date().toISOString(),
          status: 'NEEDS_QA'
        };

        db.run(
          "INSERT INTO listings (amazonTitle, etsyTitle, categoryName, status, authorId, payload) VALUES (?, ?, ?, ?, ?, ?)",
          [payload.amazonTitle, payload.etsyTitle, payload.categoryName, 'NEEDS_QA', 0, JSON.stringify(payload)],
          function(insertErr) {
            if (insertErr) return res.status(500).json({ error: insertErr.message });
            
            // Mark trend as processed
            db.run("UPDATE market_trends SET processed = 1 WHERE id = ?", [trend.id]);
            db.run("INSERT INTO agent_logs (agentId, message) VALUES (2, ?)", [`Manually triggered draft generated for ${trend.category} (Listing ID: ${this.lastID})`]);

            res.json({
              success: true,
              listingId: this.lastID,
              listing: { ...payload, dbId: this.lastID }
            });
          }
        );
      } catch (genErr) {
        console.error('Manual draft error:', genErr);
        res.status(500).json({ error: `AI Drafting failed: ${genErr.message}` });
      }
    });
  });
});
// API: Save API Key
app.post('/api/settings/apikey', (req, res) => {
  const { apiKey } = req.body;
  if (!apiKey) return res.status(400).json({ error: 'Missing API key' });
  db.run("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", ['gemini_api_key', apiKey], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// API: Chat Co-Pilot
app.post('/api/chat', (req, res) => {
  const { messages } = req.body;
  if (!messages || !Array.isArray(messages)) return res.status(400).json({ error: 'Messages required' });

  db.get("SELECT value FROM settings WHERE key = 'gemini_api_key'", async (err, row) => {
    if (err || !row || !row.value) {
      return res.status(400).json({ error: 'Gemini API Key missing. Please set it in Settings.' });
    }

    try {
      const client = new GoogleGenAI({ apiKey: row.value });
      const inputString = messages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n\n');
      
      const interaction = await client.interactions.create({
        model: 'gemini-3.6-flash',
        input: inputString,
        system_instruction: `You are an expert E-commerce Copywriter Co-Pilot for Amazon and Etsy.

CRITICAL RULES:
1. NEVER ask clarifying questions. Always generate a complete listing immediately.
2. When the user asks to draft, rewrite, or optimize a listing, you MUST include a JSON block in your response.
3. The JSON block MUST be wrapped in \`\`\`json ... \`\`\` markers.
4. You may include a brief intro sentence BEFORE the JSON block, but the JSON is MANDATORY.

The JSON block MUST contain ALL of these fields:
{
  "amazonTitle": "130-180 chars, keyword-dense, title case",
  "amazonBullets": ["5 bullets, each starting with [CAPITALIZED HOOK]"],
  "amazonSearchTerms": "space-separated backend keywords under 240 bytes",
  "amazonDescription": "<p>HTML formatted product description</p>",
  "amazonAPlusPoints": ["3 highlight story blurbs"],
  "etsyTitle": "Under 140 chars, front-loaded keywords",
  "etsyTags": ["exactly 13 tags", "each under 20 chars"],
  "etsyMaterials": ["3-5 material strings"],
  "etsyPersonalizationInstructions": "Clear buyer instructions",
  "etsyDescription": "Story-driven description with Details, Sizing, How to Order"
}

If the user asks a general question (not about drafting/writing), respond conversationally WITHOUT a JSON block.`,
      });
      
      const fullReply = interaction.output_text;
      
      // Try to extract JSON listing from the response
      let extractedListing = null;
      const jsonMatch = fullReply.match(/```json\s*([\s\S]*?)```/);
      if (jsonMatch && jsonMatch[1]) {
        try {
          const parsed = JSON.parse(jsonMatch[1].trim());
          // Validate it has listing fields
          if (parsed.amazonTitle || parsed.etsyTitle) {
            extractedListing = {
              amazonTitle: parsed.amazonTitle || '',
              amazonBullets: Array.isArray(parsed.amazonBullets) ? parsed.amazonBullets.slice(0, 5) : [],
              amazonSearchTerms: parsed.amazonSearchTerms || '',
              amazonDescription: parsed.amazonDescription || '',
              amazonAPlusPoints: Array.isArray(parsed.amazonAPlusPoints) ? parsed.amazonAPlusPoints : [],
              etsyTitle: parsed.etsyTitle || '',
              etsyTags: Array.isArray(parsed.etsyTags) ? parsed.etsyTags.slice(0, 13).map(t => String(t).substring(0, 20)) : [],
              etsyMaterials: Array.isArray(parsed.etsyMaterials) ? parsed.etsyMaterials : [],
              etsyPersonalizationInstructions: parsed.etsyPersonalizationInstructions || '',
              etsyDescription: parsed.etsyDescription || '',
              generatedAt: new Date().toISOString(),
              status: 'NEEDS_QA'
            };
          }
        } catch (parseErr) {
          console.warn('Could not parse listing JSON from chat response:', parseErr.message);
        }
      }

      // Clean the reply text: remove the raw JSON block for display
      let displayReply = fullReply;
      if (extractedListing) {
        displayReply = fullReply.replace(/```json\s*[\s\S]*?```/, '').trim();
        if (!displayReply) {
          displayReply = '✅ Listing draft generated and loaded into the editor!';
        } else {
          displayReply += '\n\n✅ **Listing loaded into the draft editor!**';
        }
      }

      res.json({ reply: displayReply, listing: extractedListing });
    } catch (apiError) {
      console.error('Chat API Error:', apiError);
      res.status(500).json({ error: apiError.message });
    }
  });
});

// API: Analytics Dashboard Data
app.get('/api/analytics', (req, res) => {
  // Aggregate feedback actions
  db.all(`
    SELECT action, COUNT(*) as count, SUM(revenue) as totalRevenue, SUM(orders) as totalOrders, SUM(views) as totalViews
    FROM sales_feedback
    GROUP BY action
  `, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// -----------------------------------------------------
// MULTI-AGENT AUTOMATION (BACKGROUND WORKERS)
// -----------------------------------------------------

// API: Get Agents
app.get('/api/agents', (req, res) => {
  db.all("SELECT * FROM agents", [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// API: Get Agent Logs
app.get('/api/agents/logs', (req, res) => {
  db.all(`
    SELECT l.*, a.name as agentName 
    FROM agent_logs l 
    JOIN agents a ON l.agentId = a.id 
    ORDER BY l.timestamp DESC LIMIT 50
  `, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// API: Toggle Agent Status
app.post('/api/agents/:id/toggle', (req, res) => {
  const { id } = req.params;
  const { status } = req.body; // 'ONLINE' or 'OFFLINE'
  db.run("UPDATE agents SET status = ?, lastActive = CURRENT_TIMESTAMP WHERE id = ?", [status, id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    
    // Log the action
    db.run("INSERT INTO agent_logs (agentId, message) VALUES (?, ?)", [id, `System commanded agent to go ${status}`]);
    res.json({ success: true, status });
  });
});

// Background Interval Engine (Simulates independent agents)
setInterval(() => {
  db.all("SELECT * FROM agents WHERE status = 'ONLINE'", [], (err, onlineAgents) => {
    if (err || !onlineAgents) return;

    onlineAgents.forEach(agent => {
      // Agent 1: Trend Scout (Role: RESEARCHER - Real Data Engine)
      if (agent.role === 'RESEARCHER') {
        const fs = require('fs');
        const importsDir = path.resolve(__dirname, '../data/imports');
        if (!fs.existsSync(importsDir)) {
          fs.mkdirSync(importsDir, { recursive: true });
        }

        const files = fs.readdirSync(importsDir).filter(f => f.endsWith('.csv') || f.endsWith('.xlsx') || f.endsWith('.html') || f.endsWith('.htm'));
        
        if (files.length > 0) {
          const fileToProcess = files[0];
          const fullPath = path.join(importsDir, fileToProcess);
          
          try {
            if (fileToProcess.endsWith('.html') || fileToProcess.endsWith('.htm')) {
              // Parse YTrends HTML Export
              const parsedItems = ytrendsParser.parseYTrendsFile(fullPath);
              if (parsedItems.length > 0) {
                const topKw = parsedItems[0];
                const category = topKw.keyword.includes('necklace') || topKw.keyword.includes('jewelry') ? 'Jewelry' :
                                 topKw.keyword.includes('embroidery') ? 'Embroidery' :
                                 topKw.keyword.includes('blanket') ? 'Blanket' : 'Acrylic';

                db.run(
                  "INSERT INTO market_trends (category, trending_keywords) VALUES (?, ?)",
                  [category, `${topKw.keyword}, sold24h:${topKw.sold24h || 0}, conv:${topKw.conversion || '2%'}`],
                  function(err) {
                    if (!err) {
                      const msg = `[YTRENDS HTML IMPORT] Extracted keyword "${topKw.keyword}" (Sold24h: ${topKw.sold24h}, Conv: ${topKw.conversion}) from HTML file: ${fileToProcess}`;
                      db.run("INSERT INTO agent_logs (agentId, message) VALUES (?, ?)", [agent.id, msg]);
                      db.run("UPDATE agents SET lastActive = CURRENT_TIMESTAMP WHERE id = ?", [agent.id]);
                    }
                  }
                );
              }
            } else {
              // Process Helium 10 / Amazon XLSX or CSV
              const XLSX = require('xlsx');
              const workbook = XLSX.readFile(fullPath);
              const sheetName = workbook.SheetNames[0];
              const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
              
              if (rows.length > 0) {
                const sampleRow = rows[0];
                const kwKey = Object.keys(sampleRow).find(k => /keyword|query|search/i.test(k)) || Object.keys(sampleRow)[0];
                const realKw = String(sampleRow[kwKey] || 'Custom Gift').trim();
                const category = fileToProcess.toLowerCase().includes('jewelry') ? 'Jewelry' :
                                 fileToProcess.toLowerCase().includes('embroidery') ? 'Embroidery' :
                                 fileToProcess.toLowerCase().includes('blanket') ? 'Blanket' : 'Acrylic';

                db.run(
                  "INSERT INTO market_trends (category, trending_keywords) VALUES (?, ?)",
                  [category, `${realKw}, personalized ${category.toLowerCase()}, best gift 2026`],
                  function(err) {
                    if (!err) {
                      const msg = `[AMAZON H10 IMPORT] Extracted top keyword "${realKw}" from file: ${fileToProcess}`;
                      db.run("INSERT INTO agent_logs (agentId, message) VALUES (?, ?)", [agent.id, msg]);
                      db.run("UPDATE agents SET lastActive = CURRENT_TIMESTAMP WHERE id = ?", [agent.id]);
                    }
                  }
                );
              }
            }
            // Archive processed file
            const archivedPath = path.join(importsDir, `processed_${Date.now()}_${fileToProcess}`);
            fs.renameSync(fullPath, archivedPath);
          } catch (parseErr) {
            db.run("INSERT INTO agent_logs (agentId, message) VALUES (?, ?)", [agent.id, `Error parsing data file ${fileToProcess}: ${parseErr.message}`]);
          }
        } else {

          // Query live YTrends MCP Server: https://mcp.trends.ytuong.ai/mcp
          const sampleSeeds = ['embroidered nurse sweatshirt', 'personalized initial necklace', 'custom photo blanket', 'acrylic night light'];
          const targetSeed = sampleSeeds[Math.floor(Math.random() * sampleSeeds.length)];

          ytrendsMcp.exploreNiche(targetSeed)
            .then(mcpData => {
              const overview = mcpData?.data?.overview || {};
              const adjacentTags = mcpData?.data?.adjacent_tags || [];
              const topTags = adjacentTags.slice(0, 3).map(t => t.tag).join(', ');
              const category = targetSeed.includes('necklace') ? 'Jewelry' :
                               targetSeed.includes('sweatshirt') || targetSeed.includes('embroidered') ? 'Embroidery' :
                               targetSeed.includes('blanket') ? 'Blanket' : 'Acrylic';

              const kwPayload = topTags ? `${targetSeed}, ${topTags}` : targetSeed;

              db.run(
                "INSERT INTO market_trends (category, trending_keywords) VALUES (?, ?)",
                [category, kwPayload],
                function(err) {
                  if (!err) {
                    const msg = `[YTRENDS MCP LIVE] Extracted niche data for "${targetSeed}" (Rev: $${Math.round(overview.total_revenue_usd || 0)}, OppScore: ${overview.opportunity_score || 50}). Tags: ${topTags || targetSeed}`;
                    db.run("INSERT INTO agent_logs (agentId, message) VALUES (?, ?)", [agent.id, msg]);
                    db.run("UPDATE agents SET lastActive = CURRENT_TIMESTAMP WHERE id = ?", [agent.id]);
                  }
                }
              );
            })
            .catch(mcpErr => {
              const msg = `[REAL DATA ENGINE] Standing by... Drop .csv/.xlsx report files into data/imports/. YTrends MCP error: ${mcpErr.message}`;
              db.run("INSERT INTO agent_logs (agentId, message) VALUES (?, ?)", [agent.id, msg]);
              db.run("UPDATE agents SET lastActive = CURRENT_TIMESTAMP WHERE id = ?", [agent.id]);
            });
        }
      }


      // Agent 2: AI Drafter (Role: DRAFTER)
      if (agent.role === 'DRAFTER') {
        db.get("SELECT * FROM market_trends WHERE processed = 0 ORDER BY discoveredAt ASC LIMIT 1", (err, trend) => {
          if (!err && trend) {
            db.run("UPDATE market_trends SET processed = 1 WHERE id = ?", [trend.id]);
            
            db.get("SELECT value FROM settings WHERE key = 'gemini_api_key'", async (settingsErr, setting) => {
              let payload;
              
              if (!settingsErr && setting && setting.value) {
                // We have a real API key, use Gemini!
                const msg = `Calling real Gemini AI to draft ${trend.category} listing for keywords: ${trend.trending_keywords}`;
                db.run("INSERT INTO agent_logs (agentId, message) VALUES (?, ?)", [agent.id, msg]);
                
                try {
                  const client = new GoogleGenAI({ apiKey: setting.value });
                  const prompt = `You are a world-class Amazon FBA and Etsy copywriter. Write a highly converting, SEO-optimized e-commerce listing for a ${trend.category} product targeting these trending keywords: ${trend.trending_keywords}.
                  Return ONLY valid JSON with these exact keys (do not include markdown block wrappers):
                  - "amazonTitle": max 200 chars, heavily keyword optimized.
                  - "amazonBullets": array of exactly 5 strings, each 150-250 chars, focusing on benefits, quality, and gifting.
                  - "amazonSearchTerms": comma separated backend keywords.
                  - "etsyTitle": max 140 chars, long-tail keyword stuffed for Etsy SEO.
                  - "etsyDescription": A warm, handmade-feeling description with a hook, product details, and SEO tags at the bottom.
                  - "etsyTags": array of exactly 13 long-tail keyword strings for Etsy SEO.`;
                  
                  const interaction = await client.interactions.create({
                    model: "gemini-3.6-flash",
                    input: prompt,
                    system_instruction: "You are an expert copywriter for Amazon and Etsy. Return ONLY valid JSON."
                  });
                  
                  let text = interaction.output_text;
                  if (text.includes('\`\`\`json')) {
                    text = text.split('\`\`\`json')[1].split('\`\`\`')[0].trim();
                  } else if (text.includes('\`\`\`')) {
                    text = text.split('\`\`\`')[1].split('\`\`\`')[0].trim();
                  }
                  const aiData = JSON.parse(text);
                  
                  payload = {
                    amazonTitle: aiData.amazonTitle || `Auto-Drafted ${trend.category}`,
                    amazonBullets: aiData.amazonBullets || [],
                    amazonSearchTerms: aiData.amazonSearchTerms || '',
                    etsyTitle: aiData.etsyTitle || `New Trend ${trend.category}`,
                    etsyDescription: aiData.etsyDescription || 'Description coming soon.',
                    etsyTags: aiData.etsyTags || [],
                    categoryName: trend.category,
                    systemNote: `Generated via LIVE Gemini AI Agent using real market data: ${trend.trending_keywords}`
                  };
                } catch (apiError) {
                  db.run("INSERT INTO agent_logs (agentId, message) VALUES (?, ?)", [agent.id, `Gemini API Error: ${apiError.message}. Real listing generation failed.`]);
                }

                if (payload) {
                  const ipRes = ipGuard.screenListing(payload);
                  const oppRes = opportunityScorer.calculateOpportunityScore(payload);

                  payload.ipVerdict = ipRes.verdict;
                  payload.ipHits = ipRes.hits;
                  payload.opportunityScore = oppRes.overallScore;
                  payload.verdict = oppRes.verdict;
                  payload.metrics = oppRes.metrics;

                  const listingStatus = (ipRes.verdict === 'BLOCK') ? 'IP_RISK_BLOCKED' : 'NEEDS_QA';

                  db.run(
                    "INSERT INTO listings (amazonTitle, etsyTitle, categoryName, status, authorId, payload) VALUES (?, ?, ?, ?, ?, ?)",
                    [payload.amazonTitle, payload.etsyTitle, payload.categoryName, listingStatus, 0, JSON.stringify(payload)],
                    function(insertErr) {
                      if (!insertErr) {
                        const statusNote = (listingStatus === 'IP_RISK_BLOCKED') ? 'BLOCKED due to IP Trademark risk' : 'NEEDS_QA queue';
                        db.run("INSERT INTO agent_logs (agentId, message) VALUES (?, ?)", [agent.id, `Saved draft (ID: ${this.lastID}, OppScore: ${oppRes.overallScore}/100, IP: ${ipRes.verdict}) to ${statusNote}.`]);
                        db.run("UPDATE agents SET lastActive = CURRENT_TIMESTAMP WHERE id = ?", [agent.id]);
                      }
                    }
                  );
                }

              } else {
                db.run("INSERT INTO agent_logs (agentId, message) VALUES (?, ?)", [agent.id, `[AI Drafter Standby] Gemini API key is missing in .env or Settings. Waiting for key configuration.`]);
              }
            });
          }
        });
      }
    });
  });
}, 8000); // Agents evaluate their loops every 8 seconds

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`OmniSeller Backend OS running on port ${PORT}`);
});
