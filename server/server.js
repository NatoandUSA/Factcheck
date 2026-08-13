const express = require('express');
const { GoogleGenAI } = require('@google/genai');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

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

// Create a new listing (DRAFT/NEEDS_QA)
app.post('/api/listings', (req, res) => {
  const { amazonTitle, etsyTitle, categoryName, payload, authorId } = req.body;
  const status = 'NEEDS_QA'; // Always starts in needs QA
  
  db.run(
    "INSERT INTO listings (amazonTitle, etsyTitle, categoryName, status, authorId, payload) VALUES (?, ?, ?, ?, ?, ?)",
    [amazonTitle, etsyTitle, categoryName, status, authorId, JSON.stringify(payload)],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID, status });
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
      return { ...r, payload: parsedPayload };
    });
    res.json(safeRows);
  });
});

// Approve a listing
app.patch('/api/listings/:id/approve', (req, res) => {
  const { id } = req.params;
  const { userId, userRole } = req.body;

  if (userRole !== 'MANAGER' && userRole !== 'OWNER' && userRole !== 'ADMIN') {
    return res.status(403).json({ error: 'Only Managers can approve listings.' });
  }

  db.run("UPDATE listings SET status = 'MANAGER_APPROVED' WHERE id = ?", [id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, status: 'MANAGER_APPROVED' });
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

// Mock YTrends MCP Endpoint
app.get('/api/market-data', (req, res) => {
  const { category } = req.query;
  
  // Return mock live market data based on category
  const data = {
    searchVolume: Math.floor(Math.random() * 5000) + 1000,
    competitionScore: Math.floor(Math.random() * 40) + 20, // 0-100 (lower is better)
    trendingKeywords: ['custom', category?.toLowerCase() || 'gift', 'personalized', '2026', 'trendy'],
    saturationWarning: false
  };
  
  if (category === 'Jewelry') data.competitionScore += 30; // Highly competitive
  
  res.json(data);
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
      // Agent 1: Trend Scout (Role: RESEARCHER)
      if (agent.role === 'RESEARCHER') {
        const categories = ['Jewelry', 'Acrylic', 'Blanket', 'Embroidery'];
        const randomCat = categories[Math.floor(Math.random() * categories.length)];
        const trendId = Math.floor(Math.random() * 9000);
        
        db.run(
          "INSERT INTO market_trends (category, trending_keywords) VALUES (?, ?)",
          [randomCat, `viral_trend_${trendId}, best_gift_2026, personalized_${randomCat.toLowerCase()}`],
          function(err) {
            if (!err) {
              const msg = `Discovered new trending keyword cluster for ${randomCat}: viral_trend_${trendId}`;
              db.run("INSERT INTO agent_logs (agentId, message) VALUES (?, ?)", [agent.id, msg]);
              db.run("UPDATE agents SET lastActive = CURRENT_TIMESTAMP WHERE id = ?", [agent.id]);
            }
          }
        );
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
                  db.run("INSERT INTO agent_logs (agentId, message) VALUES (?, ?)", [agent.id, `Gemini API failed: ${apiError.message}. Falling back to mock generator.`]);
                  // fallback happens below
                }
              }
              
              if (!payload) {
                // Fallback / Mock Generator
                const msg = `Drafting new ${trend.category} listing based on keywords (Mock Fallback): ${trend.trending_keywords}`;
                db.run("INSERT INTO agent_logs (agentId, message) VALUES (?, ?)", [agent.id, msg]);
                
                payload = {
                  amazonTitle: `Auto-Drafted ${trend.category} Title (${trend.trending_keywords.split(',')[0]})`,
                  amazonBullets: ['[TRENDING] Built automatically by the drafter agent.', '[QUALITY] High conversion rate expected.', '...', '...', '...'],
                  amazonSearchTerms: trend.trending_keywords.replace(/,/g, ''),
                  etsyTitle: `New Trend ${trend.category} Gift`,
                  categoryName: trend.category,
                  systemNote: `Automatically generated by Mock AI Drafter Agent using live market data: ${trend.trending_keywords}`
                };
              }

              db.run(
                "INSERT INTO listings (amazonTitle, etsyTitle, categoryName, status, authorId, payload) VALUES (?, ?, ?, ?, ?, ?)",
                [payload.amazonTitle, payload.etsyTitle, payload.categoryName, 'NEEDS_QA', 0, JSON.stringify(payload)],
                function(insertErr) {
                  if (!insertErr) {
                    db.run("INSERT INTO agent_logs (agentId, message) VALUES (?, ?)", [agent.id, `Successfully saved draft (ID: ${this.lastID}) to NEEDS_QA queue.`]);
                    db.run("UPDATE agents SET lastActive = CURRENT_TIMESTAMP WHERE id = ?", [agent.id]);
                  }
                }
              );
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
