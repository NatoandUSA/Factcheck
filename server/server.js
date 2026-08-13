const express = require('express');
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
    res.json(rows.map(r => ({ ...r, payload: JSON.parse(r.payload) })));
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
        // Find an unprocessed trend
        db.get("SELECT * FROM market_trends WHERE processed = 0 ORDER BY discoveredAt ASC LIMIT 1", (err, trend) => {
          if (!err && trend) {
            // Mark as processed
            db.run("UPDATE market_trends SET processed = 1 WHERE id = ?", [trend.id]);
            
            const msg = `Drafting new ${trend.category} listing based on keywords: ${trend.trending_keywords}`;
            db.run("INSERT INTO agent_logs (agentId, message) VALUES (?, ?)", [agent.id, msg]);
            
            // Generate a mock payload based on our generator logic
            const payload = {
              amazonTitle: `Auto-Drafted ${trend.category} Title (${trend.trending_keywords.split(',')[0]})`,
              amazonBullets: ['[TRENDING] Built automatically by the drafter agent.', '[QUALITY] High conversion rate expected.', '...', '...', '...'],
              amazonSearchTerms: trend.trending_keywords.replace(/,/g, ''),
              etsyTitle: `New Trend ${trend.category} Gift`,
              categoryName: trend.category,
              systemNote: `Automatically generated by AI Drafter Agent using live market data: ${trend.trending_keywords}`
            };

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
