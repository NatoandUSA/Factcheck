const express = require('express');
const { GoogleGenAI } = require('@google/genai');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const crypto = require('crypto');
// DOTENV_PATH lets production point at a secrets file outside the Git
// worktree (e.g. via a systemd EnvironmentFile= entry); local dev/test is
// unaffected since it must come from the real process environment, not
// from the .env file this line is about to load.
require('dotenv').config({ path: process.env.DOTENV_PATH || path.resolve(__dirname, '../.env') });

const ipGuard = require('./ipGuard');
const opportunityScorer = require('./opportunityScorer');
const ytrendsMcp = require('./ytuongMcpClient');
const ytrendsParser = require('./ytrendsParser');
const keywordRanker = require('./keywordRanker');
const researchTruth = require('./researchTruth');
const h10Mcp = require('./h10McpClient');
const asinBatcher = require('./asinBatcher');
const { fetchGoogleTrends } = require('./googleTrendsService');
const { callLLM } = require('./llmService');
const { learnFromListing } = require('./learningService');
const { parseEtsySearchResults, sanitizeStaffManualAssertions, synthesizeEtsyBatchLearnings } = require('./competitorBatchLearner');
const benchmarkService = require('./benchmarkService');
const publishGate = require('./publishGate');
const analyticsEngine = require('./analyticsEngine');
const { hashPassword, verifyPassword } = require('./security/scrypt');
const { createRateLimiter } = require('./security/rateLimiter');
const { COOKIE_NAME, SESSION_TTL_MS, createSessionRecord, verifySessionRecord, revokeSessionRecord } = require('./security/session');
const { parseCookies, extractRawToken, requireAuth, requireRole, requireCsrfOrigin, corsOptionsDelegate } = require('./middleware/auth');
const { runMigrations } = require('./database/migrations');
const { encryptSecret, decryptSecret, maskSecret } = require('./security/secretBox');
const { approvalHash } = require('./security/approval');
const { validateProductTruthCard } = require('../shared/productTruth.cjs');
const { projectVerifiedAiInput, renderVerifiedCommerceListing, validateModelClaims } = require('../shared/aiTruthBoundary.cjs');
const { readFirstWorksheet } = require('./services/spreadsheetReader');
const { UrlGuardError } = require('./security/urlGuard');
const { resolveRuntimePaths } = require('./config/paths');
const { parseEtsySearchInput } = require('./etsyPastedSearchParser');
const { buildEvidenceHealth } = require('./evidenceHealth');

// Make crashes visible instead of dying silently with no trace (systemd will
// still restart the process via Restart=always; this just ensures the cause
// is logged before that happens).
process.on('uncaughtException', (err) => {
  console.error('FATAL uncaughtException:', err);
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  console.error('FATAL unhandledRejection:', reason);
  process.exit(1);
});

const app = express();
app.set('trust proxy', 1);
app.use(cors(corsOptionsDelegate));
app.use(express.json({ limit: '100kb' }));
app.use(requireCsrfOrigin);

// Runtime state paths (DB + uploaded-report imports dir): single source of
// truth in config/paths.js. OMNI_DB_PATH / OMNI_IMPORTS_DIR let production
// relocate both outside the Git worktree; dev/test defaults are unchanged.
const { dbPath, importsDir } = resolveRuntimePaths();

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
    const workspacePrefix = (req.user && req.user.workspaceId) ? `${req.user.workspaceId}__` : 'unscoped__';
    cb(null, workspacePrefix + uniqueSuffix + '-' + file.originalname);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 60 * 1024 * 1024, files: 1 },
  fileFilter(req, file, cb) {
    const allowed = /\.(xlsx|csv|html?)$/i.test(file.originalname || '');
    cb(allowed ? null : new Error('UNSUPPORTED_UPLOAD_TYPE'), allowed);
  }
});

// Search-result source files are parsed entirely in memory. A preview must not
// leave a server-side file behind; the browser sends the same selected file
// again for the explicit confirm request.
const etsySearchUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter(req, file, cb) {
    const allowed = /\.(csv|html?|txt)$/i.test(file.originalname || '');
    cb(allowed ? null : new Error('UNSUPPORTED_ETSY_SEARCH_FILE'), allowed);
  }
});

const db = new sqlite3.Database(dbPath);


// Initialize DB schema
db.serialize(() => {
  db.run("PRAGMA foreign_keys = ON;");
  if (process.env.NODE_ENV !== 'test') {
    db.run("PRAGMA journal_mode = WAL;");
    db.run("PRAGMA synchronous = NORMAL;");
    db.run("PRAGMA busy_timeout = 5000;");
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS workspaces (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id TEXT NOT NULL,
      marketplace TEXT NOT NULL CHECK(marketplace IN ('AMAZON', 'ETSY')),
      name TEXT NOT NULL,
      status TEXT DEFAULT 'ACTIVE',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS workspace_memberships (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      workspace_id INTEGER NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('OWNER', 'MANAGER', 'SELLER')),
      status TEXT DEFAULT 'ACTIVE',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, workspace_id),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token_hash TEXT UNIQUE NOT NULL,
      user_id INTEGER NOT NULL,
      workspace_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME NOT NULL,
      revoked_at DATETIME NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
    )
  `);


  db.run(`
    CREATE TABLE IF NOT EXISTS audit_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id TEXT,
      actor_id INTEGER,
      action TEXT NOT NULL,
      resource_type TEXT NOT NULL,
      resource_id TEXT,
      outcome TEXT NOT NULL,
      ip_address TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      metadata TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS research_evidence (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id TEXT NOT NULL,
      workspace_id INTEGER NOT NULL,
      marketplace TEXT NOT NULL,
      seed_phrase TEXT NOT NULL,
      source TEXT NOT NULL,
      source_url TEXT,
      file_name TEXT,
      actor_id INTEGER NOT NULL,
      evidence_state TEXT DEFAULT 'OBSERVED',
      accepted_at DATETIME,
      accepted_by INTEGER,
      metadata TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS research_projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id TEXT NOT NULL,
      workspace_id INTEGER NOT NULL,
      marketplace TEXT NOT NULL CHECK(marketplace IN ('AMAZON', 'ETSY')),
      name TEXT NOT NULL,
      seed_phrase TEXT NOT NULL,
      state TEXT DEFAULT 'EVIDENCE_INTAKE' CHECK(state IN ('EVIDENCE_INTAKE', 'RESEARCH_ACCEPTED', 'DNA_ACCEPTED', 'MKL_FROZEN', 'PRODUCT_TRUTH_CONFIRMED', 'DRAFT_GENERATED', 'VALIDATED', 'MANAGER_APPROVED', 'PUBLISH_READY')),
      reference_asin TEXT,
      batch_count INTEGER DEFAULT 0,
      product_truth_notes TEXT,
      validated_at DATETIME,
      validated_by INTEGER,
      actor_id INTEGER NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS project_transition_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id TEXT NOT NULL,
      workspace_id INTEGER NOT NULL,
      marketplace TEXT NOT NULL,
      project_id INTEGER NOT NULL,
      previous_state TEXT NOT NULL,
      target_state TEXT NOT NULL,
      actor_id INTEGER NOT NULL,
      reason TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS evidence_acceptance_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id TEXT NOT NULL,
      workspace_id INTEGER NOT NULL,
      marketplace TEXT NOT NULL,
      project_id INTEGER NOT NULL,
      evidence_id INTEGER NOT NULL,
      actor_id INTEGER NOT NULL,
      reason TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS evidence_adoption_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id TEXT NOT NULL,
      workspace_id INTEGER NOT NULL,
      marketplace TEXT NOT NULL,
      project_id INTEGER NOT NULL,
      evidence_id INTEGER NOT NULL,
      actor_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT,
      role TEXT,
      name TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS listings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id TEXT,
      workspace_id INTEGER,
      marketplace TEXT CHECK(marketplace IN ('AMAZON', 'ETSY')),
      amazonTitle TEXT,
      etsyTitle TEXT,
      categoryName TEXT,
      status TEXT,
      generatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      authorId INTEGER,
      listing_version INTEGER DEFAULT 1,
      approved_version INTEGER,
      approved_hash TEXT,
      approved_by INTEGER,
      approved_at DATETIME,
      product_truth_notes TEXT,
      product_truth_card TEXT,
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
      tenant_id TEXT,
      workspace_id INTEGER,
      name TEXT UNIQUE,
      role TEXT,
      status TEXT DEFAULT 'OFFLINE',
      lastActive DATETIME
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS agent_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id TEXT,
      workspace_id INTEGER,
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

  db.run(`
    CREATE TABLE IF NOT EXISTS learned_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT,
      marketplace TEXT,
      category TEXT,
      title TEXT,
      bullets TEXT,
      tags TEXT,
      description TEXT,
      styleDna TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Seed default users & workspaces ONLY in test environment
  if (process.env.NODE_ENV === 'test') {
    db.get("SELECT COUNT(*) as count FROM users", async (err, row) => {
      if (row && row.count === 0) {
        console.log('Seeding test users and workspaces...');
        try {
          const defaultPasswordHash = await hashPassword('password123');
          
          // Step 1: Create Amazon Workspace first
          db.run("INSERT INTO workspaces (tenant_id, marketplace, name) VALUES (?, ?, ?)",
            ['tenant-alpha-uuid', 'AMAZON', 'Amazon Main Store'], function(err) {
              if (err) return console.error('Error creating Amazon workspace:', err);
              const amzWorkspaceId = this.lastID;

              // Step 2: Create Etsy Workspace
              db.run("INSERT INTO workspaces (tenant_id, marketplace, name) VALUES (?, ?, ?)",
                ['tenant-alpha-uuid', 'ETSY', 'Etsy Craft Studio'], function(err) {
                  if (err) return console.error('Error creating Etsy workspace:', err);
                  const etsyWorkspaceId = this.lastID;

                  // Step 3: Create Owner User and Memberships
                  db.run("INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?)", 
                    ['owner@omniseller.local', defaultPasswordHash, 'Store Owner'], function(err) {
                      if (err) return console.error('Error creating owner:', err);
                      const ownerId = this.lastID;
                      db.run("INSERT INTO workspace_memberships (user_id, workspace_id, role) VALUES (?, ?, ?)", [ownerId, amzWorkspaceId, 'OWNER']);
                      db.run("INSERT INTO workspace_memberships (user_id, workspace_id, role) VALUES (?, ?, ?)", [ownerId, etsyWorkspaceId, 'OWNER']);
                    });

                  // Step 4: Create Manager User and Membership
                  db.run("INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?)",
                    ['manager@omniseller.local', defaultPasswordHash, 'Ops Manager'], function(err) {
                      if (err) return console.error('Error creating manager:', err);
                      const managerId = this.lastID;
                      db.run("INSERT INTO workspace_memberships (user_id, workspace_id, role) VALUES (?, ?, ?)", [managerId, amzWorkspaceId, 'MANAGER']);
                    });

                  // Step 5: Create Seller User and Membership
                  db.run("INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?)",
                    ['seller@omniseller.local', defaultPasswordHash, 'Listing Specialist'], function(err) {
                      if (err) return console.error('Error creating seller:', err);
                      const sellerId = this.lastID;
                      db.run("INSERT INTO workspace_memberships (user_id, workspace_id, role) VALUES (?, ?, ?)", [sellerId, amzWorkspaceId, 'SELLER']);
                    });

                  // Step 6: Create Tenant Beta Workspace & Owner (Cross-Tenant Isolation Fixture)
                  db.run("INSERT INTO workspaces (tenant_id, marketplace, name) VALUES (?, ?, ?)",
                    ['tenant-beta-uuid', 'AMAZON', 'Tenant Beta Store'], function(err) {
                      if (err) return console.error('Error creating Beta workspace:', err);
                      const betaWorkspaceId = this.lastID;
                      db.run("INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?)",
                        ['owner-beta@omniseller.local', defaultPasswordHash, 'Tenant Beta Owner'], function(err) {
                          if (err) return console.error('Error creating Beta owner:', err);
                          const betaOwnerId = this.lastID;
                          db.run("INSERT INTO workspace_memberships (user_id, workspace_id, role) VALUES (?, ?, ?)", [betaOwnerId, betaWorkspaceId, 'OWNER']);
                        });
                    });
                });
            });
        } catch (e) {
          console.error('Seeding error:', e);
        }
      }
    });
  }



  // Seed default agents if empty
  db.get("SELECT COUNT(*) as count FROM agents", (err, row) => {
    if (row && row.count === 0) {
      console.log('Seeding initial agents...');
      const stmt = db.prepare("INSERT INTO agents (tenant_id, workspace_id, name, role, status) VALUES (?, ?, ?, ?, ?)");
      stmt.run('default', 1, 'Trend Scout', 'RESEARCHER', 'OFFLINE');
      stmt.run('default', 1, 'AI Drafter', 'DRAFTER', 'OFFLINE');
      stmt.finalize();
    }
  });

  // Environment API keys remain process secrets and are never copied into SQLite.
});

// Migrations are queued after base schema creation. Every API request waits for
// completion, so an existing app.db cannot be served through a partially
// upgraded schema.
const databaseReady = runMigrations(db);

const REAUTH_TTL_MS = 5 * 60 * 1000;
function secretContext(user, key) {
  return `${user.tenantId}:${user.workspaceId}:${key}`;
}

function logAgentAction(db, { agentId, tenantId = null, workspaceId = null, message }) {
  if (!agentId || !message) return;
  db.run(
    "INSERT INTO agent_logs (agentId, tenant_id, workspace_id, message) VALUES (?, ?, ?, ?)",
    [agentId, tenantId, workspaceId, message]
  );
}

function readWorkspaceLlmSettings(user, callback) {
  db.all(
    `SELECT key, encrypted_value FROM llm_settings
     WHERE tenant_id = ? AND workspace_id = ?`,
    [user.tenantId, user.workspaceId],
    (err, rows) => {
      if (err) return callback(err);
      try {
        const values = {};
        for (const row of rows || []) {
          values[row.key] = row.key === 'active_llm_provider'
            ? row.encrypted_value
            : decryptSecret(row.encrypted_value, secretContext(user, row.key));
        }
        callback(null, values);
      } catch (error) {
        callback(error);
      }
    }
  );
}

function consumeReauthNonce(user, rawNonce, callback) {
  if (!rawNonce || typeof rawNonce !== 'string' || rawNonce.length > 256) return callback(null, false);
  const nonceHash = crypto.createHash('sha256').update(rawNonce).digest('hex');
  db.run(
    `UPDATE reauth_nonces SET consumed_at = CURRENT_TIMESTAMP
     WHERE nonce_hash = ? AND session_id = ? AND user_id = ? AND workspace_id = ?
       AND purpose = 'RESET_DATABASE' AND consumed_at IS NULL AND expires_at > ?`,
    [nonceHash, user.sessionId, user.userId, user.workspaceId, new Date().toISOString()],
    function onConsume(err) { callback(err, !err && this.changes === 1); }
  );
}
app.use((req, res, next) => {
  databaseReady.then(() => next()).catch(error => {
    console.error('Database migration failed:', error);
    res.status(503).json({ success: false, error: 'DATABASE_MIGRATION_FAILED' });
  });
});

// ==========================================
// PR-2B: AUTHENTICATION API ENDPOINTS
// ==========================================

const loginRateLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, maxHits: 20, failOnly: true, message: 'Thao tác quá nhiều lần. Vui lòng thử lại sau 15 phút.' });

// POST /api/auth/login
app.post('/api/auth/login', loginRateLimiter, async (req, res) => {
  const { email, password, workspaceId } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({
      success: false,
      error: 'MISSING_CREDENTIALS',
      message: 'Email and password are required'
    });
  }

  // Bounded input length limits (AUTH-11)
  if (typeof email !== 'string' || email.length < 3 || email.length > 255 || typeof password !== 'string' || password.length < 6 || password.length > 128) {
    return res.status(400).json({
      success: false,
      error: 'INVALID_INPUT_LENGTH',
      message: 'Email must be 3-255 chars and password 6-128 chars'
    });
  }


  const normalizedEmail = String(email).trim().toLowerCase();

  db.get("SELECT id, email, password_hash, name FROM users WHERE LOWER(email) = ?", [normalizedEmail], async (err, user) => {
    if (err) {
      return res.status(500).json({ success: false, error: 'DATABASE_ERROR' });
    }

    const isValid = await verifyPassword(password, user ? user.password_hash : null);

    if (!user || !isValid) {
      db.run("INSERT INTO audit_events (action, resource_type, outcome, metadata) VALUES (?, ?, ?, ?)",
        ['auth:login', 'user', 'FAILURE', JSON.stringify({ email: normalizedEmail, reason: 'INVALID_CREDENTIALS' })]);
      return res.status(401).json({
        success: false,
        error: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password'
      });
    }

    // Query every active membership. Multi-workspace users must choose explicitly;
    // silently selecting the first workspace can cross marketplace boundaries.
    let membershipQuery = `
      SELECT wm.workspace_id, wm.role, w.tenant_id, w.marketplace, w.name as workspace_name
      FROM workspace_memberships wm
      JOIN workspaces w ON w.id = wm.workspace_id
      WHERE wm.user_id = ? AND wm.status = 'ACTIVE'
    `;
    const queryParams = [user.id];

    if (workspaceId) {
      membershipQuery += ` AND wm.workspace_id = ?`;
      queryParams.push(workspaceId);
    }
    membershipQuery += ` ORDER BY w.id ASC`;

    db.all(membershipQuery, queryParams, (err, memberships) => {
      if (err) {
        return res.status(500).json({ success: false, error: 'DATABASE_ERROR' });
      }
      if (!memberships || memberships.length === 0) {
        return res.status(403).json({
          success: false,
          error: 'NO_ACTIVE_WORKSPACE',
          message: 'User does not belong to the specified active workspace'
        });
      }

      if (!workspaceId && memberships.length > 1) {
        return res.status(409).json({
          success: false,
          error: 'WORKSPACE_SELECTION_REQUIRED',
          message: 'Choose an explicit workspace before a session can be created',
          workspaces: memberships.map(membership => ({
            id: membership.workspace_id,
            name: membership.workspace_name,
            marketplace: membership.marketplace,
            role: membership.role
          }))
        });
      }

      const membership = memberships[0];

      createSessionRecord(db, user.id, membership.workspace_id, membership.tenant_id, (err, session) => {
        if (err) {
          return res.status(500).json({ success: false, error: 'SESSION_CREATE_FAILED' });
        }

        const isProd = process.env.NODE_ENV === 'production';
        res.cookie(COOKIE_NAME, session.rawToken, {
          httpOnly: true,
          secure: isProd,
          sameSite: 'lax',
          path: '/',
          maxAge: SESSION_TTL_MS
        });

        db.run("INSERT INTO audit_events (tenant_id, actor_id, action, resource_type, outcome) VALUES (?, ?, ?, ?, ?)",
          [membership.tenant_id, user.id, 'auth:login', 'session', 'SUCCESS']);

        res.json({
          success: true,
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            role: membership.role,
            workspaceId: membership.workspace_id,
            tenantId: membership.tenant_id,
            marketplace: membership.marketplace
          }
        });
      });
    });
  });
});

// POST /api/auth/logout
app.post('/api/auth/logout', (req, res) => {
  const rawToken = extractRawToken(req);

  res.clearCookie(COOKIE_NAME, { path: '/' });

  if (!rawToken) {
    return res.json({ success: true, message: 'Logged out successfully' });
  }

  revokeSessionRecord(db, rawToken, (err, revoked) => {
    if (err) {
      db.run("INSERT INTO audit_events (action, resource_type, outcome, metadata) VALUES (?, ?, ?, ?)",
        ['auth:logout', 'session', 'FAILURE', JSON.stringify({ error: err.message })]);
      return res.status(500).json({
        success: false,
        error: 'LOGOUT_FAILED',
        message: 'Failed to revoke session on server'
      });
    }

    db.run("INSERT INTO audit_events (action, resource_type, outcome) VALUES (?, ?, ?)",
      ['auth:logout', 'session', 'SUCCESS']);

    res.json({ success: true, message: 'Logged out successfully' });
  });
});


const { execSync } = require('child_process');

function resolveServerRevision() {
  if (process.env.GIT_REVISION && process.env.GIT_REVISION.trim() && process.env.GIT_REVISION !== 'UNKNOWN') {
    return process.env.GIT_REVISION.trim();
  }
  const revisionFilePath = path.resolve(__dirname, '../REVISION');
  if (fs.existsSync(revisionFilePath)) {
    try {
      const content = fs.readFileSync(revisionFilePath, 'utf8').trim();
      if (content) return content;
    } catch (_) {}
  }
  try {
    return execSync('git rev-parse HEAD', { cwd: __dirname, encoding: 'utf8' }).trim();
  } catch (_) {}
  return 'UNKNOWN';
}

const SERVER_REVISION = resolveServerRevision();

// GET /api/health (Server & DB Health Check for Monitoring / Reverse Proxies)
app.get('/api/health', (req, res) => {
  db.get("SELECT 1", (err) => {
    if (err) {
      console.error('Health check DB error:', err.message);
      return res.status(500).json({
        status: 'ERROR',
        database: 'DISCONNECTED',
        timestamp: new Date().toISOString()
      });
    }
    res.json({
      status: 'OK',
      database: 'CONNECTED',
      revision: SERVER_REVISION,
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    });
  });
});

// GET /api/auth/me
app.get('/api/auth/me', requireAuth(db), (req, res) => {
  res.json({
    success: true,
    authenticated: true,
    user: req.user
  });
});

// POST /api/auth/switch-workspace - Switch session to another active workspace for this user
app.post('/api/auth/switch-workspace', requireAuth(db), (req, res) => {
  const { workspaceId, marketplace } = req.body || {};
  let query = `
    SELECT wm.workspace_id, wm.role, w.tenant_id, w.marketplace, w.name as workspace_name
    FROM workspace_memberships wm
    JOIN workspaces w ON w.id = wm.workspace_id
    WHERE wm.user_id = ? AND wm.status = 'ACTIVE'
  `;
  const params = [req.user.userId];
  if (workspaceId) {
    query += ` AND wm.workspace_id = ?`;
    params.push(workspaceId);
  } else if (marketplace) {
    query += ` AND UPPER(w.marketplace) = ?`;
    params.push(String(marketplace).toUpperCase());
  }
  query += ` LIMIT 1`;

  db.get(query, params, (err, membership) => {
    if (err) return res.status(500).json({ success: false, error: 'DATABASE_ERROR' });
    if (!membership) {
      return res.status(403).json({ success: false, error: 'NO_WORKSPACE_ACCESS', message: 'User does not belong to the requested workspace' });
    }

    createSessionRecord(db, req.user.userId, membership.workspace_id, membership.tenant_id, (sessErr, session) => {
      if (sessErr) return res.status(500).json({ success: false, error: 'SESSION_CREATE_FAILED' });

      const isProd = process.env.NODE_ENV === 'production';
      res.cookie(COOKIE_NAME, session.rawToken, {
        httpOnly: true,
        secure: isProd,
        sameSite: 'lax',
        path: '/',
        maxAge: SESSION_TTL_MS
      });

      res.json({
        success: true,
        user: {
          id: req.user.userId,
          email: req.user.email,
          name: req.user.name,
          role: membership.role,
          workspaceId: membership.workspace_id,
          tenantId: membership.tenant_id,
          marketplace: membership.marketplace
        }
      });
    });
  });
});

app.post('/api/auth/reauth', requireAuth(db), requireRole(['OWNER']), (req, res) => {
  const { password, purpose } = req.body || {};
  if (purpose !== 'RESET_DATABASE' || typeof password !== 'string' || password.length > 128) {
    return res.status(400).json({ success: false, error: 'INVALID_REAUTH_REQUEST' });
  }
  db.get('SELECT password_hash FROM users WHERE id = ?', [req.user.userId], async (err, user) => {
    if (err) return res.status(500).json({ success: false, error: 'DATABASE_ERROR' });
    if (!user || !(await verifyPassword(password, user.password_hash))) {
      return res.status(401).json({ success: false, error: 'REAUTH_FAILED' });
    }
    const rawNonce = crypto.randomBytes(32).toString('hex');
    const nonceHash = crypto.createHash('sha256').update(rawNonce).digest('hex');
    const expiresAt = new Date(Date.now() + REAUTH_TTL_MS).toISOString();
    db.run(
      `INSERT INTO reauth_nonces
       (nonce_hash, session_id, user_id, workspace_id, purpose, expires_at)
       VALUES (?, ?, ?, ?, 'RESET_DATABASE', ?)`,
      [nonceHash, req.user.sessionId, req.user.userId, req.user.workspaceId, expiresAt],
      insertErr => insertErr
        ? res.status(500).json({ success: false, error: 'REAUTH_NONCE_CREATE_FAILED' })
        : res.json({ success: true, nonce: rawNonce, expiresAt })
    );
  });
});


// GET /api/owner/users - Owner user list for workspace
app.get('/api/owner/users', requireAuth(db), requireRole(['OWNER']), (req, res) => {
  db.all(
    `SELECT u.id, u.email, u.name, wm.role, wm.status, u.created_at
     FROM users u
     JOIN workspace_memberships wm ON wm.user_id = u.id
     WHERE wm.workspace_id = ?
     ORDER BY u.id ASC`,
    [req.user.workspaceId],
    (err, rows) => {
      if (err) return res.status(500).json({ success: false, error: err.message });
      res.json({ success: true, users: rows || [] });
    }
  );
});

// POST /api/owner/users - Owner creates staff/testing user
app.post('/api/owner/users', requireAuth(db), requireRole(['OWNER']), async (req, res) => {
  const { email, password, name, role = 'SELLER' } = req.body || {};

  if (!email || !password || !name) {
    return res.status(400).json({ success: false, error: 'MISSING_FIELDS', message: 'Email, password, and name are required.' });
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const cleanName = String(name).trim();
  const targetRole = (role === 'MANAGER') ? 'MANAGER' : 'SELLER';

  if (normalizedEmail.length < 3 || normalizedEmail.length > 255 || password.length < 6 || password.length > 128) {
    return res.status(400).json({ success: false, error: 'INVALID_LENGTH', message: 'Email 3-255 chars, password 6-128 chars.' });
  }

  try {
    const passwordHash = await hashPassword(password);

    db.run(
      `INSERT INTO users (email, password_hash, role, name, tenant_id) VALUES (?, ?, ?, ?, ?)`,
      [normalizedEmail, passwordHash, targetRole, cleanName, req.user.tenantId],
      function(userErr) {
        if (userErr) {
          if (userErr.message.includes('UNIQUE')) {
            return res.status(400).json({ success: false, error: 'EMAIL_EXISTS', message: 'Email này đã tồn tại trên hệ thống.' });
          }
          return res.status(500).json({ success: false, error: userErr.message });
        }
        const newUserId = this.lastID;

        db.run(
          `INSERT INTO workspace_memberships (user_id, workspace_id, role, status) VALUES (?, ?, ?, 'ACTIVE')`,
          [newUserId, req.user.workspaceId, targetRole],
          function(wmErr) {
            if (wmErr) return res.status(500).json({ success: false, error: wmErr.message });

            res.json({
              success: true,
              user: {
                id: newUserId,
                email: normalizedEmail,
                name: cleanName,
                role: targetRole,
                workspaceId: req.user.workspaceId
              }
            });
          }
        );
      }
    );
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/evidence - Authoritative Research Evidence Ledger
app.get('/api/evidence', requireAuth(db), requireRole(['OWNER', 'MANAGER', 'SELLER']), (req, res) => {
  const sendRows = (project) => {
    const scoped = project ? ' AND project_id = ?' : '';
    const params = [req.user.tenantId, req.user.workspaceId, req.user.marketplace];
    if (project) params.push(project.id);
    db.all(
      `SELECT * FROM research_evidence
       WHERE tenant_id = ? AND workspace_id = ? AND marketplace = ?${scoped}
       ORDER BY created_at DESC`,
      params,
      (err, rows) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        const evidence = (rows || []).map(row => {
          const eligibility = getEvidenceAcceptanceEligibility(row);
          // This is display guidance only. The POST acceptance endpoint
          // independently recomputes the same decision from the DB row.
          return {
            ...row,
            acceptanceEligibility: {
              eligible: eligibility.eligible,
              error: eligibility.error || null,
              message: eligibility.message || (eligibility.eligible ? 'Evidence này có thể được OWNER/MANAGER accept.' : null)
            }
          };
        });
        res.json({ success: true, projectId: project?.id || null, count: evidence.length, evidence });
      }
    );
  };
  if (req.query.projectId !== undefined) {
    return parseAndValidateProject(db, req, req.query.projectId, (err, project) => {
      if (err) return res.status(err.status).json({ success: false, error: err.error, message: err.message });
      sendRows(project);
    });
  }
  sendRows(null);
});

// Project-scoped, read-only data-health projection. This endpoint intentionally
// does not return acceptance eligibility and cannot mutate project state.
app.get('/api/projects/:projectId/evidence-health', requireAuth(db), requireRole(['OWNER', 'MANAGER', 'SELLER']), (req, res) => {
  parseAndValidateProject(db, req, req.params.projectId, (projectErr, project) => {
    if (projectErr) return res.status(projectErr.status).json({ success: false, error: projectErr.error, message: projectErr.message });
    db.all(
      `SELECT id, source, evidence_state, metadata, created_at
       FROM research_evidence
       WHERE tenant_id = ? AND workspace_id = ? AND marketplace = ? AND project_id = ?
       ORDER BY id ASC`,
      [req.user.tenantId, req.user.workspaceId, req.user.marketplace, project.id],
      (queryErr, rows) => {
        if (queryErr) return res.status(500).json({ success: false, error: 'EVIDENCE_HEALTH_READ_FAILED' });
        res.json({
          success: true,
          projectId: project.id,
          marketplace: project.marketplace,
          health: buildEvidenceHealth(rows || [])
        });
      }
    );
  });
});

const ALLOWED_EVIDENCE_SOURCES = [
  'MCP_RETRIEVAL',
  'FILE_UPLOAD',
  'STAFF_MANUAL_ASSERTION',
  'VERIFIED_EXTERNAL_URL',
  'OWNER_ATTESTATION',
  'HELIUM10_XRAY_OBSERVED',
  'H10_XRAY_OBSERVED',
  'H10',
  'ETSY_SEARCH_OBSERVED',
  'ETSY_MCP_LIVE',
  'MANUAL'
];

// Helper: resolve active project ID from explicit request or single unambiguous project in user workspace
function resolveActiveProjectId(db, user, explicitId, callback) {
  if (explicitId !== undefined && explicitId !== null && explicitId !== '') {
    const parsed = parseInt(explicitId, 10);
    if (isNaN(parsed)) {
      return callback({ status: 400, error: 'INVALID_PROJECT_ID', message: 'projectId must be a valid integer.' }, null);
    }
    return db.get(
      `SELECT id FROM research_projects WHERE id = ? AND tenant_id = ? AND workspace_id = ? AND marketplace = ?`,
      [parsed, user.tenantId, user.workspaceId, user.marketplace],
      (err, row) => {
        if (err) return callback({ status: 500, error: 'DATABASE_ERROR', message: err.message }, null);
        if (!row) return callback({ status: 404, error: 'PROJECT_NOT_FOUND', message: 'Target project does not exist in the active workspace.' }, null);
        callback(null, row.id);
      }
    );
  }

  // Unambiguous resolution: only if exactly 1 project exists for this workspace + marketplace
  db.all(
    `SELECT id FROM research_projects 
     WHERE tenant_id = ? AND workspace_id = ? AND marketplace = ?`,
    [user.tenantId, user.workspaceId, user.marketplace],
    (err, rows) => {
      if (err) return callback({ status: 500, error: 'DATABASE_ERROR', message: err.message }, null);
      if (!rows || rows.length === 0) {
        return callback(null, null);
      }
      if (rows.length === 1) {
        return callback(null, rows[0].id);
      }
      // 2+ candidate projects -> Fail closed to prevent silent misattribution
      return callback({ status: 409, error: 'AMBIGUOUS_ACTIVE_PROJECT', message: 'Multiple active projects found. Explicit projectId is required to prevent misattribution.' }, null);
    }
  );
}

function parseAndValidateProject(db, req, rawProjectId, callback) {
  if (rawProjectId === undefined || rawProjectId === null || rawProjectId === '') {
    return callback({ status: 400, error: 'MISSING_PROJECT_ID', message: 'projectId is mandatory for this workflow action.' });
  }
  const strId = String(rawProjectId).trim();
  if (!/^\d+$/.test(strId)) {
    return callback({ status: 400, error: 'PROJECT_CONTEXT_REQUIRED', message: 'projectId must be a valid positive integer.' });
  }
  const projectId = parseInt(strId, 10);
  db.get(
    `SELECT * FROM research_projects WHERE id = ? AND tenant_id = ? AND workspace_id = ? AND marketplace = ?`,
    [projectId, req.user.tenantId, req.user.workspaceId, req.user.marketplace],
    (err, project) => {
      if (err) return callback({ status: 500, error: 'DATABASE_ERROR', message: err.message });
      if (!project) return callback({ status: 404, error: 'PROJECT_NOT_FOUND', message: 'Project not found in active workspace scope.' });
      callback(null, project);
    }
  );
}

function requireProjectContext(req, rawProjectId) {
  return new Promise((resolve, reject) => {
    parseAndValidateProject(db, req, rawProjectId, (err, project) => err ? reject(err) : resolve(project));
  });
}

// Smart Pull is an analysis artifact, not proof by itself. Only a complete
// provider retrieval may be accepted into the project workflow. In particular,
// staff-entered ASINs and partial provider responses stay observable but can
// never be promoted to ACCEPTED merely by a ledger action.
const SMART_PULL_ARTIFACT_KIND = 'SMART_PULL_ARTIFACT_V1';
const ETSY_SEARCH_PASTE_ARTIFACT_KIND = 'ETSY_SEARCH_PASTE_V1';
const ACCEPTABLE_SMART_PULL_STATES = new Set([
  'RETRIEVED_NO_OBSERVED_AT',
  'VERIFIED_RETRIEVED'
]);

function parseEvidenceMetadata(evidence) {
  if (!evidence || !evidence.metadata) return {};
  try {
    const metadata = typeof evidence.metadata === 'string' ? JSON.parse(evidence.metadata) : evidence.metadata;
    return metadata && typeof metadata === 'object' ? metadata : {};
  } catch (_) {
    return {};
  }
}

function getEvidenceAcceptanceEligibility(evidence) {
  const metadata = parseEvidenceMetadata(evidence);
  if (metadata.kind === ETSY_SEARCH_PASTE_ARTIFACT_KIND) {
    return {
      eligible: false,
      error: 'UNQUALIFIED_STAFF_PASTED_EVIDENCE',
      message: 'Staff-pasted HeyEtsy/search text is retained for analysis and audit, but it is not independently verified evidence and cannot satisfy Research Accepted.'
    };
  }
  if (metadata.kind !== SMART_PULL_ARTIFACT_KIND) return { eligible: true };

  const state = metadata.evidenceState;
  const hasContentHash = typeof metadata.contentHash === 'string' && /^[a-f0-9]{64}$/i.test(metadata.contentHash);
  const completeRetrieval = evidence.source === 'MCP_RETRIEVAL'
    && ACCEPTABLE_SMART_PULL_STATES.has(state)
    && hasContentHash;

  if (completeRetrieval) return { eligible: true };
  return {
    eligible: false,
    error: 'UNQUALIFIED_SMART_PULL_ARTIFACT',
    message: `Smart Pull artifact state ${state || 'UNKNOWN'} is not eligible for acceptance. Only complete, hashed MCP retrievals may satisfy research acceptance.`
  };
}

function persistSmartPullArtifact(req, project, source, seedPhrase, artifact) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO research_evidence (tenant_id, workspace_id, marketplace, project_id, seed_phrase, source, actor_id, evidence_state, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'OBSERVED', ?)`,
      [req.user.tenantId, req.user.workspaceId, req.user.marketplace, project.id, seedPhrase, source, req.user.userId,
        JSON.stringify({ kind: 'SMART_PULL_ARTIFACT_V1', ...artifact })],
      function(err) { if (err) reject(err); else resolve(this.lastID); }
    );
  });
}

// POST /api/evidence - Ingest new evidence record (Strictly Project-Bound & Source-Contracted)
app.post('/api/evidence', requireAuth(db), requireRole(['OWNER', 'MANAGER', 'SELLER']), (req, res) => {
  const { projectId, seedPhrase, source, sourceUrl, fileName, metadata } = req.body || {};

  parseAndValidateProject(db, req, projectId, (pErr, project) => {
    if (pErr) return res.status(pErr.status).json({ success: false, error: pErr.error, message: pErr.message });

    if (!seedPhrase || !source) {
      return res.status(400).json({ success: false, error: 'MISSING_FIELDS', message: 'seedPhrase and source are required.' });
    }

    const cleanSource = String(source).trim().toUpperCase();
    if (!ALLOWED_EVIDENCE_SOURCES.includes(cleanSource)) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_EVIDENCE_SOURCE',
        message: `source must be one of: ${ALLOWED_EVIDENCE_SOURCES.join(', ')}`
      });
    }

    const isManual = cleanSource === 'STAFF_MANUAL_ASSERTION';
    const finalMetadata = { ...(metadata || {}), isManualAssertion: isManual };

    db.run(
      `INSERT INTO research_evidence (tenant_id, workspace_id, marketplace, project_id, seed_phrase, source, source_url, file_name, actor_id, evidence_state, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'OBSERVED', ?)`,
      [
        req.user.tenantId,
        req.user.workspaceId,
        req.user.marketplace,
        project.id,
        String(seedPhrase).trim(),
        cleanSource,
        sourceUrl ? String(sourceUrl).trim() : null,
        fileName ? String(fileName).trim() : null,
        req.user.userId,
        JSON.stringify(finalMetadata)
      ],
      function(err) {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({
          success: true,
          evidenceId: this.lastID,
          projectId: project.id,
          evidenceState: 'OBSERVED',
          isManualAssertion: isManual,
          actorId: req.user.userId
        });
      }
    );
  });
});

// POST /api/evidence/:id/accept - Staff accepts research evidence (Restricted to OWNER & MANAGER)
app.post('/api/evidence/:id/accept', requireAuth(db), requireRole(['OWNER', 'MANAGER']), (req, res) => {
  const id = req.params.id;
  const now = new Date().toISOString();

  db.get(
    `SELECT * FROM research_evidence WHERE id = ? AND tenant_id = ? AND workspace_id = ? AND marketplace = ?`,
    [id, req.user.tenantId, req.user.workspaceId, req.user.marketplace],
    (eErr, evidence) => {
      if (eErr || !evidence) return res.status(404).json({ success: false, error: 'EVIDENCE_NOT_FOUND' });

      const eligibility = getEvidenceAcceptanceEligibility(evidence);
      if (!eligibility.eligible) {
        return res.status(409).json({
          success: false,
          error: eligibility.error,
          message: eligibility.message
        });
      }

      db.run(
        `UPDATE research_evidence
         SET evidence_state = 'ACCEPTED', accepted_at = ?, accepted_by = ?
         WHERE id = ? AND tenant_id = ? AND workspace_id = ? AND marketplace = ?`,
        [now, req.user.userId, id, req.user.tenantId, req.user.workspaceId, req.user.marketplace],
        function(err) {
          if (err) return res.status(500).json({ success: false, error: err.message });

          // Log append-only evidence acceptance event
          if (evidence.project_id) {
            db.run(
              `INSERT INTO evidence_acceptance_events (tenant_id, workspace_id, marketplace, project_id, evidence_id, actor_id, reason)
               VALUES (?, ?, ?, ?, ?, ?, ?)`,
              [req.user.tenantId, req.user.workspaceId, req.user.marketplace, evidence.project_id, id, req.user.userId, req.body?.reason || 'Staff accepted evidence']
            );
          }

          res.json({ success: true, evidenceId: id, evidenceState: 'ACCEPTED', acceptedBy: req.user.userId, acceptedAt: now });
        }
      );
    }
  );
});

// GET /api/projects - List research projects for workspace
app.get('/api/projects', requireAuth(db), requireRole(['OWNER', 'MANAGER', 'SELLER']), (req, res) => {
  db.all(
    `SELECT * FROM research_projects
     WHERE tenant_id = ? AND workspace_id = ? AND marketplace = ?
     ORDER BY updated_at DESC`,
    [req.user.tenantId, req.user.workspaceId, req.user.marketplace],
    (err, rows) => {
      if (err) return res.status(500).json({ success: false, error: err.message });
      res.json({ success: true, count: (rows || []).length, projects: rows || [] });
    }
  );
});

// POST /api/projects - Create new research project
app.post('/api/projects', requireAuth(db), requireRole(['OWNER', 'MANAGER', 'SELLER']), (req, res) => {
  const { name, seedPhrase, referenceAsin } = req.body || {};
  const projectName = typeof name === 'string' ? name.trim() : '';
  const normalizedSeedPhrase = typeof seedPhrase === 'string' ? seedPhrase.trim() : '';
  if (!projectName || !normalizedSeedPhrase) {
    return res.status(400).json({ success: false, error: 'MISSING_FIELDS', message: 'Project name and seedPhrase are required.' });
  }

  db.run(
    `INSERT INTO research_projects (tenant_id, workspace_id, marketplace, name, seed_phrase, state, reference_asin, actor_id)
     VALUES (?, ?, ?, ?, ?, 'EVIDENCE_INTAKE', ?, ?)`,
    [
      req.user.tenantId,
      req.user.workspaceId,
      req.user.marketplace,
      projectName,
      normalizedSeedPhrase,
      referenceAsin ? String(referenceAsin).trim() : null,
      req.user.userId
    ],
    function(err) {
      if (err) return res.status(500).json({ success: false, error: err.message });
      res.json({
        success: true,
        projectId: this.lastID,
        state: 'EVIDENCE_INTAKE',
        marketplace: req.user.marketplace
      });
    }
  );
});

// ALLOWED_PROJECT_TRANSITIONS Adjacency Map (Canonical Sequence)
const ALLOWED_PROJECT_TRANSITIONS = {
  'EVIDENCE_INTAKE': ['RESEARCH_ACCEPTED'],
  'RESEARCH_ACCEPTED': ['DNA_ACCEPTED'],
  'DNA_ACCEPTED': ['MKL_FROZEN'],
  'MKL_FROZEN': ['DRAFT_GENERATED', 'PRODUCT_TRUTH_VERIFIED', 'PRODUCT_TRUTH_CONFIRMED'],
  'DRAFT_GENERATED': ['PRODUCT_TRUTH_VERIFIED', 'VALIDATED'],
  'PRODUCT_TRUTH_VERIFIED': ['MANAGER_APPROVED'],
  'PRODUCT_TRUTH_CONFIRMED': ['DRAFT_GENERATED'],
  'VALIDATED': ['MANAGER_APPROVED'],
  'MANAGER_APPROVED': ['PUBLISH_READY'],
  'PUBLISH_READY': []
};

// PATCH /api/projects/:id/transition - Server-authoritative state transition
app.patch('/api/projects/:id/transition', requireAuth(db), requireRole(['OWNER', 'MANAGER', 'SELLER']), (req, res) => {
  const projectId = req.params.id;
  const { targetState, productTruthNotes } = req.body || {};

  db.get(
    `SELECT * FROM research_projects WHERE id = ? AND tenant_id = ? AND workspace_id = ? AND marketplace = ?`,
    [projectId, req.user.tenantId, req.user.workspaceId, req.user.marketplace],
    (err, project) => {
      if (err) return res.status(500).json({ success: false, error: 'DATABASE_ERROR' });
      if (!project) return res.status(404).json({ success: false, error: 'PROJECT_NOT_FOUND' });

      const currentState = project.state;
      const allowedNext = ALLOWED_PROJECT_TRANSITIONS[currentState] || [];

      // Role Gate: MANAGER/OWNER required for MANAGER_APPROVED or PUBLISH_READY
      if (targetState === 'MANAGER_APPROVED' || targetState === 'PUBLISH_READY') {
        if (req.user.role !== 'MANAGER' && req.user.role !== 'OWNER' && req.user.role !== 'ADMIN') {
          return res.status(403).json({
            success: false,
            error: 'FORBIDDEN_ROLE_FOR_STAGE',
            message: `Role ${req.user.role} is not authorized to approve projects to ${targetState}.`
          });
        }
      }

      if (!targetState || !allowedNext.includes(targetState)) {
        return res.status(400).json({
          success: false,
          error: 'INVALID_STATE_TRANSITION',
          message: `Illegal transition from ${currentState} to ${targetState}. Allowed next state: ${allowedNext.join(', ') || 'NONE'}`
        });
      }

      // Evidence & Artifact Precondition Validation (Strict Project-Scoped - NO legacy fallbacks)
      const checkPreconditions = (next) => {
        if (targetState === 'RESEARCH_ACCEPTED') {
          db.all(
            `SELECT * FROM research_evidence
             WHERE tenant_id = ? AND workspace_id = ? AND marketplace = ? 
               AND project_id = ? AND evidence_state = 'ACCEPTED'`,
            [req.user.tenantId, req.user.workspaceId, req.user.marketplace, projectId],
            (eErr, evidenceRows) => {
              const hasQualifyingEvidence = !eErr && (evidenceRows || []).some(row => getEvidenceAcceptanceEligibility(row).eligible);
              if (!hasQualifyingEvidence) {
                return res.status(400).json({
                  success: false,
                  error: 'MISSING_QUALIFYING_EVIDENCE_PRECONDITION',
                  message: 'Cannot accept research without at least 1 qualifying ACCEPTED evidence record bound specifically to this project.'
                });
              }
              next();
            }
          );
        } else if (targetState === 'DNA_ACCEPTED') {
          db.get(
            `SELECT COUNT(*) as cnt FROM research_evidence
             WHERE tenant_id = ? AND workspace_id = ? AND marketplace = ?
               AND project_id = ? AND evidence_state = 'ACCEPTED'`,
            [req.user.tenantId, req.user.workspaceId, req.user.marketplace, projectId],
            (dErr, dRow) => {
              if (dErr || !dRow || dRow.cnt === 0) {
                return res.status(400).json({
                  success: false,
                  error: 'MISSING_DNA_PRECONDITION',
                  message: 'Cannot accept DNA without at least 1 ACCEPTED evidence/learning artifact bound specifically to this project.'
                });
              }
              next();
            }
          );
        } else if (targetState === 'MKL_FROZEN') {
          db.get(
            `SELECT COUNT(*) as cnt FROM market_trends
             WHERE tenant_id = ? AND workspace_id = ? AND marketplace = ?
               AND project_id = ?`,
            [req.user.tenantId, req.user.workspaceId, req.user.marketplace, projectId],
            (mErr, mRow) => {
              if (mErr || !mRow || mRow.cnt === 0) {
                return res.status(400).json({
                  success: false,
                  error: 'MISSING_MKL_PRECONDITION',
                  message: 'Cannot freeze MKL without at least 1 market keyword trend entry bound specifically to this project.'
                });
              }
              next();
            }
          );
        } else if (targetState === 'PRODUCT_TRUTH_CONFIRMED') {
          const notes = (typeof productTruthNotes === 'string' && productTruthNotes.trim()) 
            ? productTruthNotes.trim() 
            : (project.product_truth_notes || '');
          if (notes.length < 5) {
            return res.status(400).json({
              success: false,
              error: 'MISSING_PRODUCT_TRUTH_PRECONDITION',
              message: 'Cannot confirm Product Truth without verified product material/dimension/specification notes.'
            });
          }
          next(notes);
        } else if (targetState === 'DRAFT_GENERATED') {
          db.get(
            `SELECT COUNT(*) as cnt FROM listings
             WHERE tenant_id = ? AND workspace_id = ? AND marketplace = ?
               AND project_id = ?`,
            [req.user.tenantId, req.user.workspaceId, req.user.marketplace, projectId],
            (lErr, lRow) => {
              if (lErr || !lRow || lRow.cnt === 0) {
                return res.status(400).json({
                  success: false,
                  error: 'MISSING_DRAFT_PRECONDITION',
                  message: 'Cannot transition to DRAFT_GENERATED without at least 1 listing draft bound specifically to this project.'
                });
              }
              next();
            }
          );
        } else if (targetState === 'PRODUCT_TRUTH_VERIFIED') {
          db.get(
            `SELECT COUNT(*) as cnt FROM listings
             WHERE tenant_id = ? AND workspace_id = ? AND marketplace = ?
               AND project_id = ? AND product_truth_notes IS NOT NULL AND length(product_truth_notes) >= 5`,
            [req.user.tenantId, req.user.workspaceId, req.user.marketplace, projectId],
            (pErr, pRow) => {
              if (pErr || !pRow || pRow.cnt === 0) {
                return res.status(400).json({
                  success: false,
                  error: 'MISSING_PRODUCT_TRUTH_PRECONDITION',
                  message: 'Cannot verify product truth without at least 1 listing with verified product truth notes bound specifically to this project.'
                });
              }
              next();
            }
          );
        } else if (targetState === 'MANAGER_APPROVED') {
          db.get(
            `SELECT COUNT(*) as cnt FROM listings
             WHERE tenant_id = ? AND workspace_id = ? AND marketplace = ?
               AND project_id = ? AND (status = 'MANAGER_APPROVED' OR status = 'PUBLISH_READY')`,
            [req.user.tenantId, req.user.workspaceId, req.user.marketplace, projectId],
            (aErr, aRow) => {
              if (aErr || !aRow || aRow.cnt === 0) {
                return res.status(400).json({
                  success: false,
                  error: 'MISSING_APPROVAL_PRECONDITION',
                  message: 'Cannot transition to MANAGER_APPROVED without at least 1 listing approved bound specifically to this project.'
                });
              }
              next();
            }
          );
        } else if (targetState === 'PUBLISH_READY') {
          db.get(
            `SELECT COUNT(*) as cnt FROM listings
             WHERE tenant_id = ? AND workspace_id = ? AND marketplace = ?
               AND project_id = ? AND status = 'PUBLISH_READY'`,
            [req.user.tenantId, req.user.workspaceId, req.user.marketplace, projectId],
            (rErr, rRow) => {
              if (rErr || !rRow || rRow.cnt === 0) {
                return res.status(400).json({
                  success: false,
                  error: 'MISSING_PUBLISH_PRECONDITION',
                  message: 'Cannot transition project to PUBLISH_READY without at least 1 primary listing marked PUBLISH_READY bound specifically to this project.'
                });
              }
              next();
            }
          );
        } else {
          next();
        }
      };

      checkPreconditions((resolvedNotes) => {
        const now = new Date().toISOString();
        const updatedNotes = resolvedNotes || project.product_truth_notes || null;
        const isValidated = (targetState === 'VALIDATED');
        const validatedAt = isValidated ? now : project.validated_at;
        const validatedBy = isValidated ? req.user.userId : project.validated_by;

        db.run(
          `UPDATE research_projects
           SET state = ?, product_truth_notes = ?, validated_at = ?, validated_by = ?, updated_at = ?
           WHERE id = ? AND tenant_id = ? AND workspace_id = ? AND marketplace = ?`,
          [targetState, updatedNotes, validatedAt, validatedBy, now, projectId, req.user.tenantId, req.user.workspaceId, req.user.marketplace],
          function(uErr) {
            if (uErr) return res.status(500).json({ success: false, error: 'DATABASE_ERROR' });

            // Append-Only Transition Event Audit Record
            db.run(
              `INSERT INTO project_transition_events (tenant_id, workspace_id, marketplace, project_id, previous_state, target_state, actor_id, reason)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
              [req.user.tenantId, req.user.workspaceId, req.user.marketplace, projectId, currentState, targetState, req.user.userId, req.body.reason || 'User initiated transition']
            );

            const auditMsg = `[PROJECT TRANSITION] Project #${projectId} (${project.name}) state moved from ${currentState} to ${targetState} by user #${req.user.userId} (${req.user.role})`;
            logAgentAction(db, { agentId: 1, tenantId: req.user.tenantId, workspaceId: req.user.workspaceId, message: auditMsg });

            res.json({ success: true, projectId, previousState: currentState, state: targetState, productTruthNotes: updatedNotes, updatedAt: now });
          }
        );
      });
    }
  );
});

// POST /api/projects/:id/adopt-evidence - Staff/Owner explicitly adopts legacy unscoped evidence into this project
app.post('/api/projects/:id/adopt-evidence', requireAuth(db), requireRole(['OWNER', 'MANAGER']), (req, res) => {
  const projectId = req.params.id;
  const { evidenceId } = req.body || {};

  if (!evidenceId) {
    return res.status(400).json({ success: false, error: 'MISSING_FIELDS', message: 'evidenceId is required.' });
  }

  db.get(
    `SELECT * FROM research_projects WHERE id = ? AND tenant_id = ? AND workspace_id = ? AND marketplace = ?`,
    [projectId, req.user.tenantId, req.user.workspaceId, req.user.marketplace],
    (pErr, project) => {
      if (pErr || !project) return res.status(404).json({ success: false, error: 'PROJECT_NOT_FOUND' });

      db.run(
        `UPDATE research_evidence
         SET project_id = ?
         WHERE id = ? AND project_id IS NULL AND tenant_id = ? AND workspace_id = ? AND marketplace = ?`,
        [projectId, evidenceId, req.user.tenantId, req.user.workspaceId, req.user.marketplace],
        function(uErr) {
          if (uErr) return res.status(500).json({ success: false, error: 'DATABASE_ERROR' });
          if (this.changes === 0) return res.status(404).json({ success: false, error: 'UNSCOPED_EVIDENCE_NOT_FOUND' });

          // Log append-only evidence adoption event
          db.run(
            `INSERT INTO evidence_adoption_events (tenant_id, workspace_id, marketplace, project_id, evidence_id, actor_id)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [req.user.tenantId, req.user.workspaceId, req.user.marketplace, projectId, evidenceId, req.user.userId]
          );

          const auditMsg = `[EXPLICIT ADOPTION] User #${req.user.userId} (${req.user.role}) adopted legacy evidence #${evidenceId} into Project #${projectId}`;
          logAgentAction(db, { agentId: 1, tenantId: req.user.tenantId, workspaceId: req.user.workspaceId, message: auditMsg });

          res.json({ success: true, projectId, evidenceId, adoptedBy: req.user.userId });
        }
      );
    }
  );
});

// API: Full Database Reset (Wipe all old listings, trends, and templates - Protected OWNER Only)
app.delete('/api/reset-database', requireAuth(db), requireRole(['OWNER']), (req, res) => {
  const expectedConfirmation = `RESET ${req.user.workspaceId}`;
  if (req.body?.confirmation !== expectedConfirmation) {
    return res.status(400).json({ success: false, error: 'RESET_CONFIRMATION_MISMATCH', expectedConfirmation });
  }
  consumeReauthNonce(req.user, req.headers['x-reset-nonce'], (nonceErr, consumed) => {
    if (nonceErr) return res.status(500).json({ success: false, error: 'REAUTH_NONCE_CHECK_FAILED' });
    if (!consumed) return res.status(403).json({ success: false, error: 'RECENT_REAUTH_REQUIRED' });
    db.serialize(() => {
    db.run(
      `DELETE FROM listings
       WHERE tenant_id = ? AND workspace_id = ? AND marketplace = ?`,
      [req.user.tenantId, req.user.workspaceId, req.user.marketplace],
      (err) => {
      if (err) return res.status(500).json({ success: false, error: 'RESET_FAILED' });
      db.run(
        "INSERT INTO audit_events (tenant_id, actor_id, action, resource_type, outcome) VALUES (?, ?, ?, ?, ?)",
        [req.user.tenantId, req.user.userId, 'admin:reset', 'database', 'SUCCESS'],
        auditErr => {
          if (auditErr) return res.status(500).json({ success: false, error: 'AUDIT_WRITE_FAILED' });
          res.json({ success: true, message: 'Đã xóa listing trong workspace hiện tại.' });
        }
      );
      }
    );
    });
  });
});


// Legacy Mock Auth endpoint removed for security (Use POST /api/auth/login)
app.post('/api/login', (req, res) => {
  res.status(410).json({
    success: false,
    error: 'ENDPOINT_DEPRECATED',
    message: 'Legacy /api/login endpoint has been permanently removed for security. Use /api/auth/login.'
  });
});


// Create a new listing (DRAFT/NEEDS_QA or IP_RISK_BLOCKED)
app.post('/api/listings', requireAuth(db), requireRole(['OWNER', 'MANAGER', 'SELLER']), (req, res) => {
  const { amazonTitle, etsyTitle, categoryName, projectId, stage, payload = {} } = req.body || {};
  
  // Stage 1/Stage 2 Invariant: Cannot generate listings during intake, research, DNA, or MKL freezing
  const stageToCheck = stage || payload.stage;
  const blockedStages = ['STAGE_1', 'STAGE_2', 'EVIDENCE_INTAKE', 'RESEARCH_ACCEPTED', 'DNA_ACCEPTED', 'MKL_FROZEN'];
  if (stageToCheck && blockedStages.includes(stageToCheck)) {
    return res.status(409).json({
      success: false,
      error: 'STAGE_INVARIANT_VIOLATION',
      message: `Cannot generate listing drafts in stage ${stageToCheck}. Project must reach PRODUCT_TRUTH_CONFIRMED first.`
    });
  }

  const proceedWithCreation = () => {
    const listingData = { amazonTitle, etsyTitle, categoryName, ...payload };
    const ipResult = ipGuard.screenListing(listingData);
    const oppResult = opportunityScorer.calculateOpportunityScore(listingData);

    const rawKws = `${amazonTitle || ''} ${etsyTitle || ''}`.split(/\s+/);
    const searchTerms = payload.amazonSearchTerms || keywordRanker.buildAmazonSearchTerms(rawKws);
    const etsyTags = (payload.etsyTags && payload.etsyTags.length > 0) ? payload.etsyTags : keywordRanker.buildEtsyTags(rawKws, categoryName);

    const updatedPayload = {
      ...payload,
      amazonTitle,
      etsyTitle,
      categoryName,
      amazonSearchTerms: searchTerms,
      etsyTags: etsyTags,
      // No fallback description text: an empty description must stay empty so
      // the Publish Gate can catch it, rather than silently asserting unverified
      // material/quality claims that a manager could approve without noticing
      // they were never real (GPT/Manus P0.5 audit, listing truth boundary).
      amazonDescription: payload.amazonDescription || '',
      ipVerdict: ipResult.verdict,
      ipHits: ipResult.hits,
      opportunityScore: oppResult.overallScore,
      verdict: oppResult.verdict,
      metrics: oppResult.metrics
    };

    const status = (ipResult.verdict === 'BLOCK') ? 'IP_RISK_BLOCKED' : 'NEEDS_QA';

    db.run(
      `INSERT INTO listings
        (tenant_id, workspace_id, marketplace, project_id, amazonTitle, etsyTitle, categoryName, status, authorId, payload)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.user.tenantId,
        req.user.workspaceId,
        req.user.marketplace,
        projectId ? parseInt(projectId, 10) : null,
        amazonTitle,
        etsyTitle,
        categoryName,
        status,
        req.user.userId,
        JSON.stringify(updatedPayload)
      ],
      function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID, status, listingVersion: 1, payload: updatedPayload });
      }
    );
  };

  if (projectId) {
    db.get(
      `SELECT state FROM research_projects WHERE id = ? AND tenant_id = ? AND workspace_id = ? AND marketplace = ?`,
      [projectId, req.user.tenantId, req.user.workspaceId, req.user.marketplace],
      (pErr, proj) => {
        if (pErr) return res.status(500).json({ success: false, error: 'DATABASE_ERROR' });
        if (!proj) {
          return res.status(404).json({ success: false, error: 'PROJECT_NOT_FOUND' });
        }
        if (blockedStages.includes(proj.state)) {
          return res.status(409).json({
            success: false,
            error: 'STAGE_INVARIANT_VIOLATION',
            message: `Project #${projectId} is in stage ${proj.state}. Must reach PRODUCT_TRUTH_CONFIRMED before draft generation.`
          });
        }
        proceedWithCreation();
      }
    );
  } else {
    proceedWithCreation();
  }
});

// Get all listings
app.get('/api/listings', requireAuth(db), requireRole(['OWNER', 'MANAGER', 'SELLER']), (req, res) => {
  db.all(
    `SELECT listings.*, users.name AS authorName, users.email AS authorEmail
     FROM listings
     LEFT JOIN users ON users.id = listings.authorId
     WHERE listings.tenant_id = ? AND listings.workspace_id = ? AND listings.marketplace = ?
     ORDER BY listings.generatedAt DESC`,
    [req.user.tenantId, req.user.workspaceId, req.user.marketplace],
    (err, rows) => {
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
    }
  );
});

// Content mutation uses optimistic concurrency and invalidates any prior approval.
app.patch('/api/listings/:id', requireAuth(db), requireRole(['OWNER', 'MANAGER', 'SELLER']), (req, res) => {
  const { expectedVersion, amazonTitle, etsyTitle, categoryName, payload } = req.body || {};
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
    return res.status(400).json({ success: false, error: 'EXPECTED_VERSION_REQUIRED' });
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return res.status(400).json({ success: false, error: 'INVALID_LISTING_PAYLOAD' });
  }
  let screened;
  try {
    // Client-provided ipVerdict/ipHits are never authoritative -- re-screen the
    // exact post-edit content before persisting so an edit cannot bypass the
    // IP gate after a previously benign draft was created (F-AL1: this route
    // previously persisted the client's payload as-is with no re-screen at all).
    screened = screenListingIpOrFail({ ...payload, amazonTitle, etsyTitle, categoryName });
  } catch (error) {
    console.error('IP Guard failed while updating listing:', error);
    return res.status(503).json({ success: false, error: 'IP_GUARD_UNAVAILABLE' });
  }
  const newPayload = screened.listing;
  const nextStatus = screened.result.verdict === 'BLOCK' ? 'IP_RISK_BLOCKED' : 'NEEDS_QA';
  db.run(
    `UPDATE listings
     SET amazonTitle = ?, etsyTitle = ?, categoryName = ?, payload = ?, status = ?,
         listing_version = listing_version + 1, approved_version = NULL,
         approved_hash = NULL, approved_by = NULL, approved_at = NULL,
         product_truth_notes = NULL, product_truth_card = NULL
     WHERE id = ? AND tenant_id = ? AND workspace_id = ? AND marketplace = ?
       AND listing_version = ?`,
    [newPayload.amazonTitle, newPayload.etsyTitle, newPayload.categoryName, JSON.stringify(newPayload), nextStatus, req.params.id,
      req.user.tenantId, req.user.workspaceId, req.user.marketplace, expectedVersion],
    function onUpdate(err) {
      if (err) return res.status(500).json({ success: false, error: 'LISTING_UPDATE_FAILED' });
      if (this.changes !== 1) {
        return db.get(
          `SELECT id FROM listings WHERE id = ? AND tenant_id = ? AND workspace_id = ? AND marketplace = ?`,
          [req.params.id, req.user.tenantId, req.user.workspaceId, req.user.marketplace],
          (lookupErr, row) => {
            if (lookupErr || !row) return res.status(404).json({ success: false, error: 'LISTING_NOT_FOUND' });
            res.status(412).json({ success: false, error: 'STALE_LISTING_VERSION' });
          }
        );
      }
      res.json({
        success: true,
        listingVersion: expectedVersion + 1,
        status: nextStatus,
        ipVerdict: newPayload.ipVerdict,
        ipHits: newPayload.ipHits
      });
    }
  );
});

// Approve a listing using Canonical Publish Gate (Fail-Closed Gate Authority - Protected)
app.patch('/api/listings/:id/approve', requireAuth(db), requireRole(['OWNER', 'MANAGER']), (req, res) => {
  const { id } = req.params;

  const { expectedVersion, productTruthCard, productTruthNotes } = req.body || {};
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
    return res.status(400).json({ success: false, error: 'EXPECTED_VERSION_REQUIRED' });
  }
  // Notes are retained for audit context only. They carry no factual
  // authority and cannot satisfy the gate.
  const truthNotes = typeof productTruthNotes === 'string' ? productTruthNotes.trim() : '';

  db.get(
    `SELECT * FROM listings
     WHERE id = ? AND tenant_id = ? AND workspace_id = ? AND marketplace = ?`,
    [id, req.user.tenantId, req.user.workspaceId, req.user.marketplace],
    (err, row) => {
    if (err || !row) return res.status(404).json({ error: 'Listing not found.' });
    if (row.listing_version !== expectedVersion) {
      return res.status(412).json({ success: false, error: 'STALE_LISTING_VERSION' });
    }

    let persistedPayload = {};
    try { persistedPayload = JSON.parse(row.payload); } catch(e) {}
    // The approval hash stays bound to the raw persisted payload -- export
    // re-parses row.payload directly and compares against this same hash, so
    // hashing a re-screened copy instead would make every future export
    // fail with APPROVAL_INVALIDATED even on a legitimate approval.
    const payloadHash = approvalHash(persistedPayload);

    // Defense-in-depth: re-screen before the gate runs, in case row.payload
    // is a legacy/tampered row whose ipVerdict/ipHits do not reflect its
    // actual title/tag text (F-AL1). publishGate only trusts whatever
    // ipVerdict/ipHits are already on the object -- it does not call IP
    // Guard itself.
    let parsedPayload;
    let ipScreening;
    try {
      ipScreening = screenListingIpOrFail(persistedPayload);
      parsedPayload = ipScreening.listing;
    } catch (error) {
      console.error('IP Guard failed while approving listing:', error);
      return res.status(503).json({ success: false, error: 'IP_GUARD_UNAVAILABLE' });
    }

    // IP clearance is server-derived. Client-supplied ipEvidence is replaced,
    // never trusted as authority.
    const canonicalTruthCard = productTruthCard && typeof productTruthCard === 'object'
      ? {
          ...productTruthCard,
          ipEvidence: {
            state: ipScreening.result.verdict === 'BLOCK' ? 'BLOCKED' : 'CLEARED',
            subjectId: String(row.id),
            listingVersion: row.listing_version,
            checkerVersion: 'server-ip-guard-v1',
            checkedAt: new Date().toISOString()
          }
        }
      : productTruthCard;
    const truthContext = { productId: row.id, listingVersion: row.listing_version };
    parsedPayload.status = 'MANAGER_APPROVED';
    parsedPayload.productTruthCard = canonicalTruthCard;
    parsedPayload.productId = row.id;
    parsedPayload.listingVersion = row.listing_version;
    parsedPayload.marketplace = row.marketplace;

    // Preserve the canonical IP denial response even when IP clearance also
    // makes the Product Truth Card invalid. This keeps the strongest blocking
    // reason visible and prevents a structured-card error from masking it.
    if (ipScreening.result.verdict === 'BLOCK') {
      const blockedGate = publishGate.evaluatePublishGate(parsedPayload);
      return res.status(400).json({
        error: `APPROVAL_DENIED: Cannot publish listing with status "${blockedGate.final_status}".`,
        reasons: blockedGate.reasons,
        publishGate: blockedGate
      });
    }

    const truthValidation = validateProductTruthCard(canonicalTruthCard, truthContext);
    if (!truthValidation.valid) {
      return res.status(400).json({ success: false, error: 'PRODUCT_TRUTH_CARD_INVALID', reasons: truthValidation.errors });
    }

    // C5B Fix: Evaluate via Canonical Publish Gate (Fail-Closed)
    parsedPayload.productTruthNotes = truthNotes;
    const gateRes = publishGate.evaluatePublishGate(parsedPayload);

    // Strictly reject any status other than PUBLISH_READY
    if (gateRes.final_status !== 'PUBLISH_READY' || !gateRes.canExport) {
      return res.status(400).json({
        error: `APPROVAL_DENIED: Cannot publish listing with status "${gateRes.final_status}".`,
        reasons: gateRes.reasons,
        publishGate: gateRes
      });
    }

    const approvedHash = payloadHash;
    db.run(
      `UPDATE listings SET status = 'PUBLISH_READY', approved_version = listing_version,
         approved_hash = ?, approved_by = ?, approved_at = CURRENT_TIMESTAMP,
         product_truth_notes = ?, product_truth_card = ?
       WHERE id = ? AND tenant_id = ? AND workspace_id = ? AND marketplace = ?
         AND listing_version = ?`,
      [approvedHash, req.user.userId, truthNotes || null, JSON.stringify(canonicalTruthCard), id, req.user.tenantId, req.user.workspaceId, req.user.marketplace, expectedVersion],
      function(updateErr) {
      if (updateErr) return res.status(500).json({ error: updateErr.message });
      if (this.changes !== 1) return res.status(412).json({ success: false, error: 'STALE_LISTING_VERSION' });
      res.json({ success: true, status: 'PUBLISH_READY', approvedVersion: row.listing_version, approvedHash, publishGate: gateRes });
      }
    );
    }
  );
});


// Export a listing (Gated server-side by Canonical Publish Gate)
app.get('/api/listings/:id/export', requireAuth(db), requireRole(['OWNER', 'MANAGER']), (req, res) => {
  const { id } = req.params;

  db.get(
    `SELECT * FROM listings
     WHERE id = ? AND tenant_id = ? AND workspace_id = ? AND marketplace = ?`,
    [id, req.user.tenantId, req.user.workspaceId, req.user.marketplace],
    (err, row) => {
    if (err || !row) return res.status(404).json({ error: 'Listing not found.' });

    let parsedPayload = {};
    try { parsedPayload = JSON.parse(row.payload); } catch(e) {}
    if (!row.approved_version || row.approved_version !== row.listing_version ||
        !row.approved_hash || row.approved_hash !== approvalHash(parsedPayload)) {
      return res.status(409).json({ success: false, error: 'APPROVAL_INVALIDATED' });
    }

    // Defense-in-depth: re-screen before the gate runs. This protects a
    // legacy row or one mutated outside the normal PATCH path whose stored
    // ipVerdict/ipHits may not reflect its actual content (F-AL1). The hash
    // check above already used the unscreened parsedPayload, so this
    // reassignment cannot affect approval-hash validity.
    try {
      ({ listing: parsedPayload } = screenListingIpOrFail(parsedPayload));
    } catch (error) {
      console.error('IP Guard failed while exporting listing:', error);
      return res.status(503).json({ success: false, error: 'IP_GUARD_UNAVAILABLE' });
    }
    parsedPayload.status = row.status;
    parsedPayload.productTruthNotes = row.product_truth_notes || '';
    try { parsedPayload.productTruthCard = JSON.parse(row.product_truth_card); } catch (_) { parsedPayload.productTruthCard = null; }
    parsedPayload.productId = row.id;
    parsedPayload.listingVersion = row.listing_version;
    parsedPayload.marketplace = row.marketplace;

    const gateRes = publishGate.evaluatePublishGate(parsedPayload);
    if (!gateRes.canExport) {
      return res.status(403).json({
        error: `EXPORT_DENIED: Listing status "${gateRes.final_status}" cannot be exported until PUBLISH_READY`,
        reasons: gateRes.reasons
      });
    }

    res.json({
      success: true,
      status: row.status,
      publishGate: gateRes,
      listing: parsedPayload
    });
    }
  );
});



// Submit Sales Feedback (7-day loop)
app.post('/api/listings/:id/feedback', requireAuth(db), requireRole(['OWNER', 'MANAGER', 'SELLER']), (req, res) => {
  const { id } = req.params;
  const { views, orders, revenue } = req.body;
  
  const viewsNum = Number(views);
  const ordersNum = Number(orders);
  const revenueNum = Number(revenue);

  if (!Number.isFinite(viewsNum) || viewsNum < 0 ||
      !Number.isFinite(ordersNum) || ordersNum < 0 ||
      !Number.isFinite(revenueNum) || revenueNum < 0) {
    return res.status(400).json({ error: 'INVALID_FEEDBACK_NUMBERS', message: 'views, orders, and revenue must be non-negative finite numeric figures.' });
  }

  // Basic logic for KEEP/CHANGE/KILL/SCALE based on Etsy Repo logic
  let action = 'KEEP';
  const conversionRate = (viewsNum > 0) ? (ordersNum / viewsNum) * 100 : 0;
  
  if (ordersNum > 5 && revenueNum > 100) action = 'SCALE';
  else if (viewsNum > 100 && ordersNum === 0) action = 'CHANGE_MAIN_PHOTO_OR_PRICE';
  else if (viewsNum < 10 && ordersNum === 0) action = 'CHANGE_TAGS_OR_TITLE';
  else if (viewsNum === 0) action = 'KILL_LISTING';
  
  db.get(
    `SELECT id FROM listings
     WHERE id = ? AND tenant_id = ? AND workspace_id = ? AND marketplace = ?`,
    [id, req.user.tenantId, req.user.workspaceId, req.user.marketplace],
    (scopeErr, listing) => {
      if (scopeErr || !listing) return res.status(404).json({ error: 'Listing not found.' });
      db.run(
        "INSERT INTO sales_feedback (listingId, views, orders, revenue, action) VALUES (?, ?, ?, ?, ?)",
        [id, viewsNum, ordersNum, revenueNum, action],
        function(err) {
          if (err) return res.status(500).json({ error: err.message });
          res.json({ id: this.lastID, action, conversionRate });
        }
      );
    }
  );
});

// API: Get YTrends MCP Tools List from https://mcp.trends.ytuong.ai/mcp
app.get('/api/mcp/tools', requireAuth(db), requireRole(['OWNER', 'MANAGER', 'SELLER']), async (req, res) => {
  try {
    const tools = await ytrendsMcp.listTools();
    res.json({ success: true, count: tools.length, tools });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Call YTrends MCP Tool (Universal) — restricted beyond SELLER since
// toolName/args pass through to an external tool invocation
app.post('/api/mcp/call', requireAuth(db), requireRole(['OWNER', 'MANAGER']), async (req, res) => {
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
app.get('/api/mcp/niche', requireAuth(db), requireRole(['OWNER', 'MANAGER', 'SELLER']), async (req, res) => {
  const { seed = 'nurse sweatshirt' } = req.query;
  try {
    const data = await ytrendsMcp.exploreNiche(seed);
    res.json({ success: true, seed, data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: One-Click Auto-Pull LIVE Etsy Trends from MCP into Database.
// P0.5-B truth rule: no semantic padding, no plausible overview defaults, and
// no DB write if the live source is unavailable or contains no usable tags.
app.post('/api/mcp/pull-etsy', requireAuth(db), requireRole(['OWNER', 'MANAGER', 'SELLER']), async (req, res) => {
  if (req.user.marketplace !== 'ETSY') {
    return res.status(403).json({ success: false, error: 'MARKETPLACE_MISMATCH', message: 'Tác vụ này yêu cầu Session Workspace Etsy. Vui lòng chuyển Workspace phiên làm việc sang Etsy.' });
  }
  const { projectId, seed = 'custom gift', category = 'Custom Gift' } = req.body || {};
  const cleanSeed = String(seed).trim().toLowerCase();

  let mcpData;
  try {
    mcpData = await ytrendsMcp.exploreNiche(cleanSeed);
  } catch (mcpErr) {
    console.warn('YTrends MCP unavailable for:', cleanSeed, mcpErr.message);
    return res.status(503).json({
      success: false,
      error: 'ETSY_MCP_UNAVAILABLE',
      message: 'Live Etsy MCP data is unavailable. No fallback market data was generated or persisted.'
    });
  }

  let liveData = mcpData?.data || {};
  let topListings = Array.isArray(liveData.top_listings) ? [...liveData.top_listings] : [];

  const overview = liveData.overview && typeof liveData.overview === 'object' ? liveData.overview : null;
  const rawTags = [];
  const rawRelatedKws = [];

  const addObservedTag = value => {
    const text = typeof value === 'string' ? value : (value?.tag || value?.name || value?.keyword);
    const clean = typeof text === 'string' ? text.trim().toLowerCase() : '';
    if (clean && !rawTags.includes(clean)) rawTags.push(clean);
  };

  const addRelatedKw = value => {
    const text = typeof value === 'string' ? value : (value?.keyword || value?.name || value?.tag);
    const clean = typeof text === 'string' ? text.trim().toLowerCase() : '';
    if (clean && !rawRelatedKws.includes(clean)) rawRelatedKws.push(clean);
  };

  (Array.isArray(liveData.adjacent_tags) ? liveData.adjacent_tags : []).forEach(addObservedTag);
  (Array.isArray(liveData.related_keywords) ? liveData.related_keywords : []).forEach(addRelatedKw);

  // Fallback to deep query (search + hot listings) if topListings or tags are empty from exploreNiche
  if (topListings.length === 0 || rawTags.length === 0) {
    try {
      const [searchRes, hotRes] = await Promise.allSettled([
        ytrendsMcp.callTool('ytrends_search', { query: cleanSeed, limit: 30 }),
        ytrendsMcp.callTool('ytrends_find_hot_listings', { search: cleanSeed, limit: 30 })
      ]);

      if (searchRes.status === 'fulfilled' && Array.isArray(searchRes.value?.data?.results)) {
        searchRes.value.data.results.forEach((item, idx) => {
          let price = null;
          let country = null;
          if (item.snippet) {
            const priceMatch = item.snippet.match(/\$([0-9.]+)/);
            if (priceMatch) price = `$${priceMatch[1]}`;
            const countryMatch = item.snippet.match(/([A-Z]{2})\s+shop/i);
            if (countryMatch) country = countryMatch[1].toUpperCase();
          }
          if (!topListings.some(l => l.listing_id === (item.id?.replace(/^lst:/, '') || `${idx + 1}`))) {
            topListings.push({
              listing_id: item.id?.replace(/^lst:/, '') || `${idx + 1}`,
              title: item.title,
              url: item.url,
              price: price,
              shop_country: country,
              evidenceSource: 'ETSY_MCP_LIVE'
            });
          }
        });
      }

      if (hotRes.status === 'fulfilled' && Array.isArray(hotRes.value?.data?.listings)) {
        hotRes.value.data.listings.forEach((lst) => {
          if (!topListings.some(l => l.listing_id === String(lst.listing_id))) {
            topListings.push({
              listing_id: String(lst.listing_id),
              title: lst.title,
              url: `https://www.etsy.com/listing/${lst.listing_id}`,
              price: lst.price_usd ? `$${lst.price_usd}` : (lst.price ? `$${lst.price}` : null),
              shop_country: lst.shop_country,
              views24h: lst.views_24h,
              sold24h: lst.sold_24h,
              conversionRate: lst.conversion_rate ? Number((lst.conversion_rate * 100).toFixed(2)) : null,
              favorites: lst.favorites,
              evidenceSource: 'ETSY_MCP_LIVE'
            });
          }
          // Extract real tags directly from hot listings
          if (Array.isArray(lst.tags)) {
            lst.tags.forEach(addObservedTag);
          }
        });
      }
    } catch (searchErr) {
      console.warn('YTrends deep query fallback error:', searchErr.message);
    }
  }

  // If still no tags, extract clean tags from cleanSeed and live search listing titles
  if (rawTags.length === 0 && rawRelatedKws.length === 0) {
    if (cleanSeed) addObservedTag(cleanSeed);
    topListings.forEach(lst => {
      if (lst.title) {
        const decoded = lst.title.replace(/&#39;/g, "'").replace(/&amp;/g, '&');
        const chunks = decoded.split(/[,|\-–—:]/).map(c => c.trim().toLowerCase());
        chunks.forEach(chunk => {
          if (chunk.length >= 3 && chunk.length <= 20) addObservedTag(chunk);
          else if (chunk.length > 20 && chunk.length <= 128) addRelatedKw(chunk);
        });
      }
    });
  }

  const cleanTags = [];
  const cleanRelatedKws = [];
  const blockedKeywords = [];
  const invalidKeywords = [];

  // IP screen & validate 13 Etsy Tags (length 3-20)
  rawTags.forEach(keyword => {
    if (keyword.length < 3 || keyword.length > 20) {
      invalidKeywords.push({ keyword, reason: 'ETSY_TAG_LENGTH_OUT_OF_RANGE' });
      return;
    }
    const screen = ipGuard.screenText(keyword);
    if (screen.verdict === 'BLOCK') blockedKeywords.push(keyword);
    else cleanTags.push(keyword);
  });

  // IP screen & validate Related Search Keywords (length 3-128)
  rawRelatedKws.forEach(keyword => {
    if (keyword.length < 3 || keyword.length > 128) return;
    const screen = ipGuard.screenText(keyword);
    if (screen.verdict === 'BLOCK') {
      if (!blockedKeywords.includes(keyword)) blockedKeywords.push(keyword);
    } else {
      cleanRelatedKws.push(keyword);
    }
  });

  const observedTags = cleanTags.slice(0, 13);
  if (observedTags.length === 0) {
    return res.status(422).json({
      success: false,
      error: 'INSUFFICIENT_EVIDENCE',
      message: 'Live MCP returned no usable Etsy tags after validation/IP screening.',
      blockedKeywords,
      invalidKeywords
    });
  }

  // Build Master Keywords List Detailed with PER-KEYWORD PROVENANCE (No fake overview duplication)
  const keywordsDetailed = [
    ...observedTags.map(keyword => ({
      keyword,
      opportunityScore: overview?.opportunity_score ?? null,
      competingProducts: null,
      volume: null,
      cpr: null,
      tierBadge: '🎯 Valid Tag (<=20 chars)',
      evidenceSource: 'ETSY_MCP_LIVE'
    })),
    ...cleanRelatedKws.filter(kw => !observedTags.includes(kw)).map(keyword => ({
      keyword,
      opportunityScore: null,
      competingProducts: null,
      volume: null,
      cpr: null,
      tierBadge: '📝 Etsy Related Search Keyword',
      evidenceSource: 'ETSY_MCP_LIVE'
    }))
  ];
  const trendingKeywordsStr = observedTags.join(', ');

  // Parse Top Listings from MCP with STRICT PASS-THROUGH PARSER (Zero Fallbacks / Zero Fabrication)
  const sellers = topListings.map((lst, idx) => {
    const rawTitle = typeof lst.title === 'string' && lst.title.trim() ? lst.title.trim() : null;
    const isDerivedShop = !lst.shop_name && lst.shop_id;
    const rawShop = typeof lst.shop_name === 'string' && lst.shop_name.trim() ? lst.shop_name.trim() : (lst.shop_id ? `Shop #${lst.shop_id}` : null);
    const rawCountry = typeof lst.shop_country === 'string' && lst.shop_country.trim() ? lst.shop_country.trim() : null;
    const isDerivedUrl = !lst.url && lst.listing_id;
    const rawUrl = typeof lst.url === 'string' && lst.url.trim() ? lst.url.trim() : (lst.listing_id ? `https://www.etsy.com/listing/${lst.listing_id}` : null);
    const rawRating = typeof lst.rating === 'number' ? lst.rating : null;
    const listingScore = typeof lst.listing_score === 'number' ? lst.listing_score : null;

    return {
      id: `mcp-lst-${lst.listing_id || idx}-${Date.now()}`,
      title: rawTitle,
      shopName: rawShop,
      country: rawCountry,
      views24h: typeof lst.views_24h === 'number' ? lst.views_24h : (typeof lst.avg_daily_views === 'number' ? lst.avg_daily_views : null),
      sold24h: typeof lst.sold_24h === 'number' ? lst.sold_24h : null,
      totalSold: typeof lst.total_sold === 'number' ? lst.total_sold : null,
      revenueUsd: typeof lst.revenue_usd === 'number' ? lst.revenue_usd : (typeof lst.revenue === 'number' ? lst.revenue : null),
      conversionRate: typeof lst.conversion_rate === 'number' ? Number((lst.conversion_rate * 100).toFixed(2)) : null,
      favorites: typeof lst.favorites === 'number' ? lst.favorites : null,
      price: typeof lst.price_usd === 'number' ? `$${lst.price_usd}` : (typeof lst.price === 'number' ? `$${lst.price}` : null),
      rating: rawRating,
      listingScore,
      url: rawUrl,
      isDerivedReference: Boolean(isDerivedShop || isDerivedUrl),
      evidenceSource: 'ETSY_MCP_LIVE',
      batchName: 'Observed MCP Listings',
      isSynthetic: false,
      selected: true
    };
  });

  resolveActiveProjectId(db, req.user, req.body.projectId, (pErr, targetProjectId) => {
    if (pErr) return res.status(pErr.status || 400).json({ success: false, error: pErr.error, message: pErr.message });
    db.run(
      "INSERT INTO market_trends (category, trending_keywords, keywords_detailed, marketplace, tenant_id, workspace_id, project_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [category, trendingKeywordsStr, JSON.stringify(keywordsDetailed), 'ETSY', req.user.tenantId, req.user.workspaceId, targetProjectId],
      function(dbErr) {
        if (dbErr) return res.status(500).json({ success: false, error: 'DATABASE_ERROR' });
        const trendId = this.lastID;
        const msg = `[ETSY MCP OBSERVED] Imported ${observedTags.length} source tags and ${sellers.length} top sellers for "${seed}" (${category}). No semantic padding applied.`;
        logAgentAction(db, { agentId: 1, tenantId: req.user.tenantId, workspaceId: req.user.workspaceId, message: msg });
        res.json({
          success: true,
          trendId,
          projectId: targetProjectId,
          source: 'ETSY_MCP_LIVE',
          evidenceState: 'OBSERVED',
          category,
          seed,
          overview,
          keywords: observedTags,
          keywordsDetailed,
          sellers,
          observedKeywordCount: observedTags.length,
          blockedKeywords,
          invalidKeywords,
          trendingKeywordsStr
        });
      }
    );
  });
});

// API: Helium 10 MCP Status & OAuth Check (https://mcp.helium10.com/mcp)
app.get('/api/mcp/h10/status', requireAuth(db), requireRole(['OWNER', 'MANAGER', 'SELLER']), async (req, res) => {
  try {
    const statusData = await h10Mcp.checkConnection();
    res.json({ success: true, ...statusData });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Helium 10 MCP Tools List
app.get('/api/mcp/h10/tools', requireAuth(db), requireRole(['OWNER', 'MANAGER', 'SELLER']), async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '') || null;
  try {
    const tools = await h10Mcp.listTools(token);
    res.json({ success: true, count: tools.length, tools });
  } catch (err) {
    res.status(401).json({ success: false, error: err.message });
  }
});


// API: Real-Time Google Trends Cross-Check for Seed Phrase
app.get('/api/google-trends', requireAuth(db), requireRole(['OWNER', 'MANAGER', 'SELLER']), async (req, res) => {
  const { keyword = 'custom gift' } = req.query;
  try {
    const trendData = await fetchGoogleTrends(keyword);
    res.json(trendData);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Unified IP & Trademark Guard Library
app.get('/api/ip-guard/library', requireAuth(db), requireRole(['OWNER', 'MANAGER', 'SELLER']), (req, res) => {
  try {
    const lib = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'ip_library.json'), 'utf8'));
    res.json({ success: true, library: lib });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Add Custom Term to Unified IP Guard Blacklist/Whitelist
app.post('/api/ip-guard/custom-term', requireAuth(db), requireRole(['OWNER']), (req, res) => {
  const { term, category = 'custom_brands', action = 'block' } = req.body;
  if (!term) return res.status(400).json({ error: 'Term is required' });

  try {
    const libPath = path.resolve(__dirname, 'ip_library.json');
    const lib = JSON.parse(fs.readFileSync(libPath, 'utf8'));

    if (action === 'block') {
      if (!lib.block[category]) lib.block[category] = [];
      if (!lib.block[category].includes(term.toLowerCase())) {
        lib.block[category].push(term.toLowerCase());
      }
    } else if (action === 'whitelist') {
      if (!lib.safe_vocab_add) lib.safe_vocab_add = [];
      if (!lib.safe_vocab_add.includes(term.toLowerCase())) {
        lib.safe_vocab_add.push(term.toLowerCase());
      }
    }

    const tempPath = `${libPath}.tmp.${Date.now()}`;
    fs.writeFileSync(tempPath, JSON.stringify(lib, null, 2), 'utf8');
    fs.renameSync(tempPath, libPath);
    ipGuard.reloadLibrary();
    res.json({ success: true, message: `Term "${term}" added to ${action} list (${category})` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Multi-LLM Settings (Gemini, OpenAI GPT, Anthropic Claude)
app.get('/api/settings/llm', requireAuth(db), requireRole(['OWNER']), (req, res) => {
  readWorkspaceLlmSettings(req.user, (err, keys) => {
    if (err) return res.status(503).json({ success: false, error: 'SECRET_DECRYPTION_FAILED' });
    res.json({
      activeProvider: keys.active_llm_provider || 'GEMINI',
      hasGemini: Boolean(keys.gemini_api_key || process.env.GEMINI_API_KEY),
      hasOpenAI: Boolean(keys.openai_api_key || process.env.OPENAI_API_KEY),
      hasClaude: Boolean(keys.claude_api_key || process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY),
      geminiKeyMasked: maskSecret(keys.gemini_api_key),
      openaiKeyMasked: maskSecret(keys.openai_api_key),
      claudeKeyMasked: maskSecret(keys.claude_api_key)
    });
  });
});

app.post('/api/settings/llm', requireAuth(db), requireRole(['OWNER']), (req, res) => {
  const { geminiApiKey, openaiApiKey, claudeApiKey, activeProvider = 'GEMINI' } = req.body;
  if (!['GEMINI', 'OPENAI', 'CLAUDE'].includes(activeProvider)) {
    return res.status(400).json({ success: false, error: 'INVALID_LLM_PROVIDER' });
  }
  const supplied = {
    gemini_api_key: geminiApiKey,
    openai_api_key: openaiApiKey,
    claude_api_key: claudeApiKey
  };
  let encrypted;
  try {
    encrypted = Object.entries(supplied)
      .filter(([, value]) => typeof value === 'string' && value.trim().length > 0)
      .map(([key, value]) => [key, encryptSecret(value.trim(), secretContext(req.user, key))]);
  } catch (error) {
    return res.status(503).json({ success: false, error: 'SECRET_ENCRYPTION_UNAVAILABLE' });
  }
  db.serialize(() => {
    const statement = db.prepare(`
      INSERT INTO llm_settings (tenant_id, workspace_id, key, encrypted_value, updated_by)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(tenant_id, workspace_id, key) DO UPDATE SET
        encrypted_value = excluded.encrypted_value, updated_by = excluded.updated_by,
        updated_at = CURRENT_TIMESTAMP
    `);
    for (const [key, value] of encrypted) {
      statement.run(req.user.tenantId, req.user.workspaceId, key, value, req.user.userId);
    }
    statement.run(req.user.tenantId, req.user.workspaceId, 'active_llm_provider', activeProvider, req.user.userId);
    statement.finalize(err => err
      ? res.status(500).json({ success: false, error: 'LLM_SETTINGS_WRITE_FAILED' })
      : res.json({ success: true, activeProvider }));
  });
});

// API: Learning Box — Analyze Amazon/Etsy URL or Competitor text & Extract Structural DNA
app.post('/api/learning/analyze', requireAuth(db), requireRole(['OWNER', 'MANAGER', 'SELLER']), async (req, res) => {
  const { url = '', rawText = '', category = 'Custom Gift' } = req.body;
  // Marketplace is server-derived from the authenticated session, never
  // trusted from the client body (GPT PR-5 review finding P0-B1).
  const marketplace = req.user.marketplace;

  try {
    const analysis = await learnFromListing({ url, rawText, category, marketplace });
    if (!analysis.success || !analysis.title) {
      return res.status(422).json({
        success: false,
        error: analysis.code || 'INSUFFICIENT_EVIDENCE',
        message: analysis.error || 'Could not extract listing DNA from provided URL or text.'
      });
    }

    // Store in DB, scoped to the caller's workspace (see learned_templates
    // ownership migration — templates are workspace-owned, not global)
    db.run(
      "INSERT INTO learned_templates (url, marketplace, category, title, bullets, tags, description, styleDna, tenant_id, workspace_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [
        analysis.url,
        analysis.marketplace,
        analysis.category,
        analysis.title,
        JSON.stringify(analysis.bullets),
        JSON.stringify(analysis.tags),
        analysis.description,
        JSON.stringify(analysis.styleDna),
        req.user.tenantId,
        req.user.workspaceId
      ],
      function(dbErr) {
        if (dbErr) return res.status(500).json({ success: false, error: 'DATABASE_ERROR' });
        res.json({ success: true, templateId: this.lastID, ...analysis });
      }
    );
  } catch (err) {
    if (err instanceof UrlGuardError) {
      return res.status(400).json({ success: false, error: 'URL_NOT_ALLOWED', message: 'This URL is not an allowed marketplace host, or could not be safely resolved.' });
    }
    console.error('Learning parse error:', err);
    res.status(500).json({ success: false, error: 'LEARNING_PARSE_FAILED' });
  }
});

function safeJsonParse(str, fallback = {}) {
  try {
    return JSON.parse(str);
  } catch (e) {
    return fallback;
  }
}

function resolveServerAiAuthority(req, input = {}) {
  const listingId = input.listingId ?? input.sourceListingId;
  const expectedVersion = Number(input.expectedVersion);
  if (!/^\d+$/.test(String(listingId || '')) || !Number.isInteger(expectedVersion) || expectedVersion < 1) {
    return Promise.reject({ status: 409, error: 'PRODUCT_TRUTH_REQUIRED', message: 'listingId and expectedVersion are required for commerce AI generation.' });
  }
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT id, listing_version, approved_version, status, product_truth_card, payload
       FROM listings WHERE id = ? AND tenant_id = ? AND workspace_id = ? AND marketplace = ?`,
      [Number(listingId), req.user.tenantId, req.user.workspaceId, req.user.marketplace],
      (err, row) => {
        if (err) return reject({ status: 500, error: 'DATABASE_ERROR' });
        if (!row) return reject({ status: 404, error: 'LISTING_NOT_FOUND' });
        if (row.listing_version !== expectedVersion) return reject({ status: 409, error: 'STALE_LISTING_VERSION' });
        if (row.status !== 'PUBLISH_READY' || row.approved_version !== row.listing_version) {
          return reject({ status: 409, error: 'PRODUCT_TRUTH_REQUIRED' });
        }
        const productTruthCard = safeJsonParse(row.product_truth_card, null);
        const projection = projectVerifiedAiInput({
          productTruthCard,
          context: { productId: row.id, listingVersion: row.listing_version }
        });
        if (!projection.eligible) return reject({ status: 409, error: 'PRODUCT_TRUTH_REQUIRED' });
        resolve({ row, projection });
      }
    );
  });
}

function rejectAiAuthority(res, error) {
  return res.status(error?.status || 409).json({ success: false, error: error?.error || 'PRODUCT_TRUTH_REQUIRED', message: error?.message });
}

function validateServerAiOutput(output, projection) {
  const validation = validateModelClaims(output, projection);
  if (!validation.valid) {
    const error = new Error('UNVERIFIED_OUTPUT_CLAIM');
    error.code = 'UNVERIFIED_OUTPUT_CLAIM';
    error.claims = validation.claims;
    throw error;
  }
  return output;
}

// Commerce models are a control-plane selector, not a prose generator. Keep
// the wire contract deliberately narrower than ordinary JSON: one canonical,
// raw JSON object only. This rejects whitespace variations, Markdown fences,
// prose, duplicate keys, arrays, and concatenated JSON objects before the
// renderer can create a listing.
function parseStrictCommercePlan(modelReply) {
  if (typeof modelReply !== 'string') return null;
  try {
    const plan = JSON.parse(modelReply);
    return modelReply === JSON.stringify(plan) ? plan : null;
  } catch (_) {
    return null;
  }
}

// A non-compliant model can return any JSON shape it wants for a field the
// prompt asked to be an array (e.g. a comma-separated string instead of a
// real array). Calling .slice()/.map() directly on that would 500 the whole
// route -- normalize defensively instead of trusting the model's type
// (independent adversarial-test finding: wrong-type model JSON).
function safeStringArray(value) {
  return Array.isArray(value) ? value : [];
}

// Canonical server-side IP view. A client PATCH payload may contain
// ipVerdict/ipHits keys, but they must never be trusted: the guard's derived
// verdict and hits always replace whatever the client sent. Callers must fail
// closed (503) if the guard cannot execute rather than silently persisting an
// unscreened listing (F-AL1: PATCH never re-screened content, so a protected/
// trademarked term could reach approve/export by simply omitting or forging
// ipVerdict in the edit payload).
function screenListingIpOrFail(listing) {
  const candidate = {
    ...(listing && typeof listing === 'object' ? listing : {}),
    amazonTitle: typeof listing?.amazonTitle === 'string' ? listing.amazonTitle : '',
    etsyTitle: typeof listing?.etsyTitle === 'string' ? listing.etsyTitle : '',
    categoryName: typeof listing?.categoryName === 'string' ? listing.categoryName : ''
  };
  const result = ipGuard.screenListing(candidate);
  return {
    listing: {
      ...candidate,
      ipVerdict: result.verdict,
      ipHits: Array.isArray(result.hits) ? result.hits : []
    },
    result
  };
}

// API: Get all learned templates
app.get('/api/learning/templates', requireAuth(db), requireRole(['OWNER', 'MANAGER', 'SELLER']), (req, res) => {
  db.all(
    "SELECT * FROM learned_templates WHERE tenant_id = ? AND workspace_id = ? AND marketplace = ? ORDER BY createdAt DESC LIMIT 20",
    [req.user.tenantId, req.user.workspaceId, req.user.marketplace],
    (err, rows) => {
    if (err) return res.status(500).json({ success: false, error: 'DATABASE_ERROR' });
    const parsed = rows.map(r => ({
      ...r,
      bullets: safeJsonParse(r.bullets, []),
      tags: safeJsonParse(r.tags, []),
      styleDna: safeJsonParse(r.styleDna, {})
    }));
    res.json({ success: true, templates: parsed });
  });
});


// API: Delete learned template (workspace-scoped — IDOR-safe 404 for out-of-scope IDs)
app.delete('/api/learning/templates/:id', requireAuth(db), requireRole(['OWNER', 'MANAGER']), (req, res) => {
  const { id } = req.params;
  db.run(
    "DELETE FROM learned_templates WHERE id = ? AND tenant_id = ? AND workspace_id = ? AND marketplace = ?",
    [id, req.user.tenantId, req.user.workspaceId, req.user.marketplace],
    function(err) {
    if (err) return res.status(500).json({ success: false, error: 'DATABASE_ERROR' });
    if (this.changes === 0) return res.status(404).json({ success: false, error: 'TEMPLATE_NOT_FOUND' });
    res.json({ success: true, deletedId: id });
  });
});

// API: ETSY Seller Evidence Scanner (uploaded HeyEtsy/Etsy HTML or CSV evidence).
// P0.5-B truth rule: never synthesize Top Sellers or performance metrics when
// the caller supplied no evidence.
app.post('/api/etsy/scan-search', requireAuth(db), requireRole(['OWNER', 'MANAGER', 'SELLER']), async (req, res) => {
  if (req.user.marketplace !== 'ETSY') {
    return res.status(403).json({ success: false, error: 'MARKETPLACE_MISMATCH', message: 'This endpoint requires an Etsy workspace session.' });
  }
  const { seedPhrase = 'nurse sweatshirt', htmlContent = '', csvRows = [] } = req.body;

  try {
    const parsed = parseEtsySearchResults({ htmlContent, csvRows });
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return res.status(422).json({
        success: false,
        error: 'INSUFFICIENT_EVIDENCE',
        evidenceState: 'NO_EVIDENCE',
        dataBadge: 'NO_EVIDENCE',
        seedPhrase,
        count: 0,
        batches: [],
        sellers: [],
        message: 'No seller/listing evidence was supplied or parsed. Add source evidence or a Staff manual assertion; synthetic Top Sellers are disabled.'
      });
    }

    const sellers = parsed.map((seller, index) => ({
      ...seller,
      batchNumber: Math.floor(index / 10) + 1,
      batchGroup: `Evidence Batch ${Math.floor(index / 10) + 1}`,
      batchRationale: 'Grouped in source order only; no revenue/sales ranking is inferred.'
    }));
    const batches = [];
    for (let start = 0; start < sellers.length; start += 10) {
      const batchNumber = Math.floor(start / 10) + 1;
      batches.push({
        batchNumber,
        name: `Evidence Batch ${batchNumber}`,
        rationale: 'Source-order grouping; missing facts remain UNKNOWN.',
        sellers: sellers.slice(start, start + 10)
      });
    }

    res.json({
      success: true,
      seedPhrase,
      count: sellers.length,
      isSynthetic: false,
      evidenceState: 'OBSERVED',
      dataBadge: 'SOURCE_EVIDENCE',
      batches,
      sellers
    });
  } catch (err) {
    console.error('Seller evidence scan error:', err);
    res.status(500).json({ success: false, error: 'SELLER_EVIDENCE_PARSE_FAILED' });
  }
});

// API: ETSY Evidence Batch Learn — SEO recommendation only, not Product Truth.
app.post('/api/etsy/batch-learn', requireAuth(db), requireRole(['OWNER', 'MANAGER', 'SELLER']), async (req, res) => {
  if (req.user.marketplace !== 'ETSY') {
    return res.status(403).json({ success: false, error: 'MARKETPLACE_MISMATCH', message: 'This endpoint requires an Etsy workspace session.' });
  }

  const {
    seedPhrase = 'nurse sweatshirt',
    category = 'Apparel: Sweatshirt',
    sellers = [],
    htmlContent = '',
    csvRows = []
  } = req.body || {};

  // Provenance authority lives on the server:
  // 1) Raw HTML/CSV is parsed here, so those rows may retain source-observed labels.
  // 2) Browser-supplied seller objects are always downgraded to attributable
  //    STAFF_MANUAL_ASSERTION rows, regardless of any evidenceSource sent by the client.
  const parsedEvidence = parseEtsySearchResults({ htmlContent, csvRows })
    .map(row => ({ ...row, selected: true }));
  const assertedAt = new Date().toISOString();
  const evidenceRows = parsedEvidence.length > 0
    ? parsedEvidence
    : sanitizeStaffManualAssertions(sellers, req.user.userId, assertedAt);

  if (evidenceRows.length < 3) {
    return res.status(422).json({
      success: false,
      error: 'INSUFFICIENT_EVIDENCE',
      message: 'Provide at least 3 server-parsed source rows or explicit Staff manual assertions.'
    });
  }

  readWorkspaceLlmSettings(req.user, async (settingsErr, keys) => {
    if (settingsErr) return res.status(503).json({ success: false, error: 'SECRET_DECRYPTION_FAILED' });
    try {
      const provider = keys.active_llm_provider || 'GEMINI';
      const result = await synthesizeEtsyBatchLearnings({
        seedPhrase,
        sellers: evidenceRows,
        category,
        llmConfig: {
          provider,
          keys: {
            gemini: keys.gemini_api_key || process.env.GEMINI_API_KEY,
            openai: keys.openai_api_key || process.env.OPENAI_API_KEY,
            claude: keys.claude_api_key || process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY
          }
        }
      });

      const payload = {
        amazonTitle: '',
        amazonBullets: [],
        amazonSearchTerms: '',
        amazonDescription: '',
        amazonAPlusPoints: [],
        etsyTitle: result.synthesizedListing.etsyTitle,
        etsyDescription: '',
        etsyTags: result.synthesizedListing.etsyTags,
        etsyMaterials: [],
        etsyPersonalizationInstructions: '',
        categoryName: category,
        generatedAt: new Date().toISOString(),
        status: 'NEEDS_QA',
        evidenceSummary: result.evidenceSummary,
        truthWarnings: result.synthesizedListing.truthWarnings,
        modelProvenance: 'ETSY_SELLER_EVIDENCE_MODEL'
      };

      db.run(
        `INSERT INTO listings
          (tenant_id, workspace_id, marketplace, amazonTitle, etsyTitle, categoryName, status, authorId, payload)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [req.user.tenantId, req.user.workspaceId, req.user.marketplace, payload.amazonTitle, payload.etsyTitle, payload.categoryName, 'NEEDS_QA', req.user.userId, JSON.stringify(payload)],
        function(insertErr) {
          if (insertErr) return res.status(500).json({ success: false, error: 'DATABASE_ERROR' });
          res.json({
            success: true,
            listingId: this.lastID,
            synthesized: result.synthesizedListing,
            insights: result.synthesizedListing.learnedInsights,
            sellersLearned: result.sellerCount,
            evidenceSummary: result.evidenceSummary,
            truthWarnings: result.synthesizedListing.truthWarnings
          });
        }
      );
    } catch (err) {
      console.error('Etsy evidence learn error:', err);
      const evidenceError = err.code === 'UNVERIFIED_SELLER_EVIDENCE' || err.code === 'INSUFFICIENT_EVIDENCE';
      res.status(evidenceError ? 422 : 500).json({
        success: false,
        error: err.code || 'ETSY_EVIDENCE_LEARN_FAILED',
        message: evidenceError ? err.message : 'Etsy evidence learning failed.'
      });
    }
  });
});

// Two-phase, project-bound parser for staff supplied Etsy search-result
// text/CSV/HTML. It never invokes MCP and never treats a URL as fetched data.
// Preview is DB and filesystem zero-write; confirm reparses the same input and
// stores a hashed staff assertion in the selected project's evidence ledger.
async function handleEtsySearchResultFeed(req, res, supplied = {}) {
  if (req.user.marketplace !== 'ETSY') {
    return res.status(403).json({ success: false, error: 'MARKETPLACE_MISMATCH', message: 'Tác vụ này yêu cầu Session Workspace Etsy.' });
  }
  const { rawText, seed = '', projectId, inputFormat = 'AUTO', sourceFileName = null } = { ...(req.body || {}), ...supplied };
  const confirm = supplied.confirm ?? (req.body?.confirm === true || String(req.body?.confirm || '').toLowerCase() === 'true');
  if (!rawText || typeof rawText !== 'string' || !rawText.trim()) {
    return res.status(400).json({ success: false, error: 'MISSING_SEARCH_INPUT', message: 'Hãy dán text hoặc chọn file CSV/HTML của trang kết quả Etsy.' });
  }
  if (rawText.length > 5 * 1024 * 1024) {
    return res.status(413).json({ success: false, error: 'SEARCH_INPUT_TOO_LARGE', message: 'Search-result input must be 5 MB or smaller.' });
  }
  if (!sourceFileName && /^\s*https?:\/\//i.test(rawText.trim()) && !/\n/.test(rawText.trim())) {
    return res.status(422).json({
      success: false,
      error: 'PASTED_RESULT_TEXT_REQUIRED',
      message: 'Đây là luồng Paste Text. URL không được xem là dữ liệu đã fetch; hãy dùng Project-bound Smart Pull cho URL/seed hoặc copy toàn bộ search result text.'
    });
  }
  let project;
  try {
    project = await requireProjectContext(req, projectId);
  } catch (err) {
    return res.status(err.status || 500).json({ success: false, error: err.error || 'PROJECT_CONTEXT_ERROR', message: err.message });
  }
  let parsed;
  try {
    parsed = parseEtsySearchInput(rawText, inputFormat);
  } catch (error) {
    const firstCollision = error?.canonicalCollisions?.[0];
    return res.status(422).json({
      success: false,
      error: error.message || 'SEARCH_INPUT_PARSE_FAILED',
      canonicalField: firstCollision?.canonicalField,
      sourceColumns: firstCollision?.sourceColumns,
      canonicalCollisions: error?.canonicalCollisions,
      duplicateHeaders: error?.duplicateHeaders === true,
      invalidHeaders: error?.invalidHeaders,
      fieldMismatches: error?.fieldMismatches,
      invalidRows: error?.invalidRows,
      listingIdConflicts: error?.listingIdConflicts,
      message: 'Không thể đọc định dạng file. Hãy dùng CSV, HTML Etsy đã lưu, hoặc toàn bộ text HeyEtsy.'
    });
  }
  if (!parsed.sellers.length) {
    return res.status(422).json({
      success: false,
      error: 'INSUFFICIENT_STRUCTURED_LISTINGS',
      message: 'Không tìm thấy listing hợp lệ. CSV cần cột title; HTML Etsy cần ItemList JSON-LD; text HeyEtsy cần listing block đầy đủ.'
    });
  }

  const keywords = parsed.tagSuggestions
    .map(item => item.tag)
    .filter(tag => tag.length >= 3 && tag.length <= 20 && ipGuard.screenText(tag).verdict !== 'BLOCK')
    .slice(0, 13);
  const importedAt = new Date().toISOString();
  const cleanSeed = String(seed || project.seed_phrase || '').trim();
  const batches = [];
  for (let start = 0; start < parsed.sellers.length; start += 10) {
    batches.push({
      batchNumber: Math.floor(start / 10) + 1,
      rationale: 'Grouped in source order only; no sales/revenue ranking is inferred.',
      sellers: parsed.sellers.slice(start, start + 10)
    });
  }
  const responsePayload = {
    success: true,
    projectId: project.id,
    preview: confirm !== true,
    committed: confirm === true,
    source: 'STAFF_MANUAL_ASSERTION',
    evidenceState: 'UNVERIFIED_INPUT',
    provider: parsed.inputFormat === 'CSV' ? 'ETSY_SEARCH_CSV' : parsed.inputFormat === 'HTML' ? 'ETSY_SEARCH_HTML' : 'HEYETSY_PASTED_TEXT',
    observedAt: null,
    importedAt,
    seed: cleanSeed || null,
    parserVersion: parsed.parserVersion,
    inputFormat: parsed.inputFormat,
    sourceFileName: sourceFileName ? path.basename(String(sourceFileName)) : null,
    contentHash: parsed.contentHash,
    searchContext: parsed.searchContext,
    headerDiagnostics: parsed.headerDiagnostics,
    rowAccounting: parsed.rowAccounting,
    sellers: parsed.sellers,
    batches,
    keywords,
    keywordSource: parsed.inputFormat === 'HEYETSY_TEXT' ? 'HEYETSY_COPY_SUGGESTION' : 'STAFF_FILE_TAG_SUGGESTION',
    count: parsed.sellers.length,
    duplicatesRemoved: parsed.duplicatesRemoved,
    truncated: parsed.truncated,
    ordering: 'SOURCE_ORDER_NOT_PERFORMANCE_RANK'
  };

  if (confirm !== true) return res.json(responsePayload);

  const metadata = {
    kind: ETSY_SEARCH_PASTE_ARTIFACT_KIND,
    parserVersion: parsed.parserVersion,
    contentHash: parsed.contentHash,
    evidenceState: 'UNVERIFIED_INPUT',
    provider: responsePayload.provider,
    inputFormat: parsed.inputFormat,
    sourceFileName: responsePayload.sourceFileName,
    headerDiagnostics: parsed.headerDiagnostics,
    rowAccounting: parsed.rowAccounting,
    observedAt: null,
    importedAt,
    searchContext: parsed.searchContext,
    sellers: parsed.sellers,
    keywordCandidates: keywords,
    keywordSource: responsePayload.keywordSource,
    ordering: 'SOURCE_ORDER_NOT_PERFORMANCE_RANK',
    // Text remains in the audit record. Large file uploads retain their
    // canonical parsed projection and hash instead of duplicating megabytes
    // of HTML inside SQLite metadata.
    ...(sourceFileName ? {} : { rawText: rawText.trim() })
  };

  db.get(
    `SELECT id FROM research_evidence
     WHERE tenant_id = ? AND workspace_id = ? AND marketplace = ? AND project_id = ?
       AND source = 'STAFF_MANUAL_ASSERTION' AND metadata LIKE ?
     ORDER BY id DESC LIMIT 1`,
    [req.user.tenantId, req.user.workspaceId, req.user.marketplace, project.id, `%\"contentHash\":\"${parsed.contentHash}\"%`],
    (lookupErr, existing) => {
      if (lookupErr) return res.status(500).json({ success: false, error: 'EVIDENCE_LOOKUP_FAILED' });
      if (existing) return res.json({ ...responsePayload, evidenceId: existing.id, duplicateSubmission: true });

      db.run(
        `INSERT INTO research_evidence
          (tenant_id, workspace_id, marketplace, project_id, seed_phrase, source, actor_id, evidence_state, metadata)
         VALUES (?, ?, ?, ?, ?, 'STAFF_MANUAL_ASSERTION', ?, 'OBSERVED', ?)`,
        [req.user.tenantId, req.user.workspaceId, req.user.marketplace, project.id, cleanSeed || project.seed_phrase, req.user.userId, JSON.stringify(metadata)],
        function(insertErr) {
          if (insertErr) return res.status(500).json({ success: false, error: 'EVIDENCE_PERSIST_FAILED' });
          res.json({ ...responsePayload, evidenceId: this.lastID, duplicateSubmission: false });
        }
      );
    }
  );
}

app.post('/api/etsy/feed-search-results', requireAuth(db), requireRole(['OWNER', 'MANAGER', 'SELLER']), (req, res) => {
  handleEtsySearchResultFeed(req, res);
});

app.post('/api/etsy/feed-search-results-file', requireAuth(db), requireRole(['OWNER', 'MANAGER', 'SELLER']), etsySearchUpload.single('searchResultsFile'), (req, res) => {
  if (!req.file?.buffer) return res.status(400).json({ success: false, error: 'MISSING_SEARCH_FILE', message: 'Chọn một file CSV, HTML hoặc TXT trước khi xem preview.' });
  const extension = path.extname(req.file.originalname || '').toLowerCase();
  const inputFormat = extension === '.csv' ? 'CSV' : /\.html?$/i.test(extension) ? 'HTML' : 'HEYETSY_TEXT';
  handleEtsySearchResultFeed(req, res, {
    rawText: req.file.buffer.toString('utf8'),
    inputFormat,
    sourceFileName: req.file.originalname,
    confirm: String(req.body?.confirm || '').toLowerCase() === 'true'
  });
});

// POST /api/research/smart-pull - Project-bound market evidence analysis.
app.post('/api/research/smart-pull', requireAuth(db), requireRole(['OWNER', 'MANAGER', 'SELLER']), async (req, res) => {
  const { query, unitCost, projectId } = req.body || {};
  const rawInput = typeof query === 'string' ? query.trim() : '';
  if (!rawInput) {
    return res.status(400).json({ success: false, error: 'MISSING_QUERY' });
  }
  if (rawInput.length > 2000) {
    return res.status(413).json({ success: false, error: 'QUERY_TOO_LARGE' });
  }
  const parsedUnitCost = unitCost === null || unitCost === undefined || unitCost === '' ? null : Number(unitCost);
  if (parsedUnitCost !== null && (!Number.isFinite(parsedUnitCost) || parsedUnitCost < 0 || parsedUnitCost > 100000)) {
    return res.status(400).json({ success: false, error: 'INVALID_UNIT_COST' });
  }

  let project;
  try {
    project = await requireProjectContext(req, projectId);
  } catch (err) {
    return res.status(err.status || 500).json({ success: false, error: err.error || 'PROJECT_CONTEXT_ERROR', message: err.message });
  }

  let searchSeed = rawInput;
  try {
    const etsyMatch = rawInput.match(/https?:\/\/(?:www\.)?etsy\.com\/[^\s]*[?&]q=([^&#\s]+)/i);
    const amazonMatch = rawInput.match(/https?:\/\/(?:www\.)?amazon\.[a-z.]+\/[^\s]*[?&]k=([^&#\s]+)/i);
    const encodedSeed = req.user.marketplace === 'ETSY' ? etsyMatch?.[1] : amazonMatch?.[1];
    if (encodedSeed) searchSeed = decodeURIComponent(encodedSeed.replace(/\+/g, ' ')).trim();
  } catch (_) {
    return res.status(400).json({ success: false, error: 'INVALID_SEARCH_URL' });
  }
  if (!searchSeed || searchSeed.length > 300) {
    return res.status(400).json({ success: false, error: 'INVALID_SEARCH_SEED' });
  }

  const importedAt = new Date().toISOString();

  if (req.user.marketplace === 'AMAZON') {
    const asins = [...new Set(rawInput.match(/\bB[0-9A-Z]{9}\b/g) || [])];
    if (asins.length === 0) {
      return res.status(422).json({ success: false, error: 'AMAZON_INPUT_EVIDENCE_REQUIRED', message: 'Provide at least one valid ASIN. No live Amazon connector was invoked.' });
    }
    const listings = asins.slice(0, 30).map(asin => ({
      asin,
      title: null,
      price: null,
      views24h: null,
      sold24h: null,
      tags: [],
      evidenceSource: 'STAFF_ASIN_INPUT',
      evidenceState: 'INPUT_ONLY_UNVERIFIED'
    }));
    const synthesis = analyticsEngine.synthesizeNicheIntelligence({ seedPhrase: searchSeed, listings, keywords: [], unitCost: parsedUnitCost });
    const responsePayload = {
      ...synthesis,
      projectId: project.id,
      marketplace: 'AMAZON',
      source: 'SMART_PULL_INPUT',
      provider: 'STAFF_INPUT',
      evidenceState: 'INPUT_ONLY_UNVERIFIED',
      observedAt: null,
      importedAt,
      contentHash: crypto.createHash('sha256').update(JSON.stringify({ projectId: project.id, asins })).digest('hex'),
      providerResults: { amazonLiveConnector: 'NOT_INVOKED' },
      listings
    };
    try {
      responsePayload.evidenceId = await persistSmartPullArtifact(req, project, 'STAFF_MANUAL_ASSERTION', searchSeed, {
        contentHash: responsePayload.contentHash, provider: responsePayload.provider, providerResults: responsePayload.providerResults,
        evidenceState: responsePayload.evidenceState, observedAt: null, importedAt, response: responsePayload
      });
    } catch (err) {
      return res.status(500).json({ success: false, error: 'EVIDENCE_PERSIST_FAILED' });
    }
    return res.json(responsePayload);
  }

  const [searchResult, hotResult] = await Promise.allSettled([
    ytrendsMcp.callTool('ytrends_search', { query: searchSeed, limit: 30 }),
    ytrendsMcp.callTool('ytrends_find_hot_listings', { search: searchSeed, limit: 30 })
  ]);
  const searchRows = searchResult.status === 'fulfilled' && Array.isArray(searchResult.value?.data?.results)
    ? searchResult.value.data.results
    : [];
  const hotRows = hotResult.status === 'fulfilled' && Array.isArray(hotResult.value?.data?.listings)
    ? hotResult.value.data.listings
    : [];
  if (searchResult.status === 'rejected' && hotResult.status === 'rejected') {
    return res.status(503).json({ success: false, error: 'ETSY_MCP_UNAVAILABLE', providerResults: { search: 'FAILED', hotListings: 'FAILED' } });
  }
  if (searchRows.length === 0 && hotRows.length === 0) {
    return res.status(422).json({ success: false, error: 'INSUFFICIENT_EVIDENCE', providerResults: { search: searchResult.status, hotListings: hotResult.status } });
  }

  const listings = [];
  for (const [index, item] of searchRows.entries()) {
    const priceMatch = String(item.snippet || '').match(/\$([0-9]+(?:\.[0-9]+)?)/);
    listings.push({
      id: item.id || `search-${index}`,
      title: item.title || null,
      url: item.url || item.link || null,
      price: priceMatch ? Number(priceMatch[1]) : null,
      views24h: null,
      sold24h: null,
      tags: [],
      evidenceSource: 'YTRENDS_MCP_SEARCH',
      evidenceState: 'RETRIEVED_NO_OBSERVED_AT'
    });
  }
  for (const item of hotRows) {
    const numericOrNull = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value))
      ? Number(value)
      : null;
    listings.push({
      id: item.listing_id,
      title: item.title || null,
      url: item.listing_id ? `https://www.etsy.com/listing/${item.listing_id}` : null,
      price: numericOrNull(item.price_usd),
      views24h: numericOrNull(item.views_24h),
      sold24h: numericOrNull(item.sold_24h),
      tags: Array.isArray(item.tags) ? item.tags : [],
      evidenceSource: 'YTRENDS_MCP_HOT',
      evidenceState: 'RETRIEVED_NO_OBSERVED_AT'
    });
  }
  const observedTags = [...new Set(hotRows.flatMap(item => Array.isArray(item.tags) ? item.tags : []))];
  const synthesis = analyticsEngine.synthesizeNicheIntelligence({ seedPhrase: searchSeed, listings: listings.slice(0, 30), keywords: observedTags, unitCost: parsedUnitCost });
  const partial = searchResult.status !== 'fulfilled' || hotResult.status !== 'fulfilled' || searchRows.length === 0 || hotRows.length === 0;
  const providerResults = {
    search: searchResult.status === 'fulfilled' ? (searchRows.length ? 'SUCCESS' : 'EMPTY') : 'FAILED',
    hotListings: hotResult.status === 'fulfilled' ? (hotRows.length ? 'SUCCESS' : 'EMPTY') : 'FAILED'
  };
  const responsePayload = {
    ...synthesis,
    projectId: project.id,
    marketplace: 'ETSY',
    source: 'SMART_PULL_MCP',
    provider: 'YTRENDS_MCP',
    evidenceState: partial ? 'PARTIAL_EVIDENCE' : 'RETRIEVED_NO_OBSERVED_AT',
    observedAt: null,
    importedAt,
    contentHash: crypto.createHash('sha256').update(JSON.stringify({ searchRows, hotRows })).digest('hex'),
    providerResults,
    listings: listings.slice(0, 30)
  };
  try {
    responsePayload.evidenceId = await persistSmartPullArtifact(req, project, 'MCP_RETRIEVAL', searchSeed, {
      contentHash: responsePayload.contentHash, provider: responsePayload.provider, providerResults,
      evidenceState: responsePayload.evidenceState, observedAt: null, importedAt, response: responsePayload
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'EVIDENCE_PERSIST_FAILED' });
  }
  return res.json(responsePayload);
});

// API: Amazon Quick Draft (Works directly from Seed Phrase, 10 ASINs, or Cerebro)
app.post('/api/amazon/quick-draft', requireAuth(db), requireRole(['OWNER', 'MANAGER', 'SELLER']), async (req, res) => {
  if (req.user.marketplace !== 'AMAZON') {
    return res.status(403).json({ success: false, error: 'MARKETPLACE_MISMATCH' });
  }
  const { projectId, seedPhrase, category, asins = [] } = req.body || {};

  if (!seedPhrase || !String(seedPhrase).trim() || !category || !String(category).trim()) {
    return res.status(400).json({ success: false, error: 'INSUFFICIENT_EVIDENCE', message: 'seedPhrase and category are required' });
  }

  let aiAuthority;
  try {
    aiAuthority = await resolveServerAiAuthority(req, req.body);
  } catch (authorityError) {
    return rejectAiAuthority(res, authorityError);
  }

  const seedIp = ipGuard.screenText(String(seedPhrase));
  if (seedIp.verdict !== 'OK') {
    return res.status(409).json({ success: false, error: 'IP_CLEARANCE_REQUIRED', ipVerdict: seedIp.verdict });
  }

  try {
    const cleanSeed = seedPhrase.trim();
    const verifiedCategory = typeof aiAuthority.projection.facts.productType === 'string'
      ? aiAuthority.projection.facts.productType
      : 'Verified Product';
    const asinNote = asins.length > 0 ? `Targeting Top 10 ASINs: ${asins.join(', ')}` : '';
    // Resolve project scope before calling the model. Do not persist either a
    // trend or listing until the complete model-shaped payload passes the
    // canonical output-claim validator.
    resolveActiveProjectId(db, req.user, req.body.projectId, (pErr, targetProjectId) => {
      if (pErr) return res.status(pErr.status || 400).json({ success: false, error: pErr.error, message: pErr.message });
      readWorkspaceLlmSettings(req.user, async (sErr, keys) => {
          if (sErr) return res.status(503).json({ success: false, error: 'SECRET_DECRYPTION_FAILED' });

          const provider = keys.active_llm_provider || 'GEMINI';
          const geminiKey = keys.gemini_api_key || process.env.GEMINI_API_KEY;
          const openaiKey = keys.openai_api_key || process.env.OPENAI_API_KEY;
          const claudeKey = keys.claude_api_key || process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;

          const prompt = `You are a world-class Amazon FBM/FBA Copywriting Specialist with deep mastery of Amazon A10 Algorithm and Data Dive MKL.
Write a policy-compliant Amazon listing for a ${verifiedCategory} product anchored on this SEO Seed Phrase: "${cleanSeed}".
${asinNote}

VERIFIED PRODUCT FACTS (the only factual authority):
${JSON.stringify(aiAuthority.projection.facts)}

Select one creative tone. You are not authorized to write listing prose or factual claims.
Return ONLY one raw JSON object with exactly one field and no markdown:
{"creativeProfile":"WARM"}
Allowed values: WARM, MINIMAL, CELEBRATORY.`;

          try {
            const llmOutput = await callLLM({
              provider,
              keys: { gemini: geminiKey, openai: openaiKey, claude: claudeKey },
              prompt,
              systemInstruction: "Select one allowed creativeProfile enum. Never author commerce prose or factual claims."
            });

            const aiPlan = parseStrictCommercePlan(llmOutput);
            const canonicalListing = renderVerifiedCommerceListing(aiAuthority.projection, aiPlan);
            if (!canonicalListing) {
              const contractError = new Error('INVALID_COMMERCE_OUTPUT_CONTRACT');
              contractError.code = 'UNVERIFIED_OUTPUT_CLAIM';
              throw contractError;
            }

            const payload = {
              ...canonicalListing,
              // No auto-generated SKU: the Staff viewer presents this as
              // paste-ready "Raw Data ... for Seller Central", so a fake
              // seed-derived string here would be an inventory-hygiene risk,
              // not just a display placeholder. Real SKUs must be assigned
              // by a human against real inventory (GPT PR-10 re-audit).
              parentSku: '',
              // No fabricated Gold/Silver/Rose-Gold child variations: nobody
              // has verified this product actually comes in those finishes.
              // Real variations must be entered from real product data, not
              // invented to fill the UI (GPT PR-10 re-audit).
              variations: [],
              categoryName: verifiedCategory,
              evidenceState: 'VERIFIED_PRODUCT_TRUTH_DRAFT',
              provenance: 'AI_VERIFIED_QUICK_DRAFT',
              sourceProductId: aiAuthority.row.id,
              sourceListingVersion: aiAuthority.row.listing_version,
              generatedAt: new Date().toISOString(),
              status: 'NEEDS_QA'
            };

            validateServerAiOutput(payload, aiAuthority.projection);


            db.run(
              "INSERT INTO market_trends (category, trending_keywords, marketplace, tenant_id, workspace_id, project_id) VALUES (?, ?, ?, ?, ?, ?)",
              [verifiedCategory, `${cleanSeed} (Amazon A10 Quick Batch)`, 'AMAZON', req.user.tenantId, req.user.workspaceId, targetProjectId],
              function onTrendInsert(trendErr) {
                if (trendErr) return res.status(500).json({ error: trendErr.message });
                db.run(
                  `INSERT INTO listings
                    (tenant_id, workspace_id, marketplace, project_id, amazonTitle, etsyTitle, categoryName, status, authorId, payload)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                  [req.user.tenantId, req.user.workspaceId, req.user.marketplace, targetProjectId, payload.amazonTitle, payload.etsyTitle, payload.categoryName, 'NEEDS_QA', req.user.userId, JSON.stringify(payload)],
                  function onListingInsert(insertErr) {
                    if (insertErr) return res.status(500).json({ error: insertErr.message });
                    res.json({
                      success: true,
                      listingId: this.lastID,
                      listing: { ...payload, dbId: this.lastID }
                    });
                  }
                );
              }
            );
          } catch (llmErr) {
            console.error('Quick draft LLM error:', llmErr);
            if (llmErr.code === 'UNVERIFIED_OUTPUT_CLAIM') {
              return res.status(422).json({ success: false, error: llmErr.code, claims: llmErr.claims });
            }
            res.status(500).json({ error: `AI Listing Generation Failed: ${llmErr.message}` });
          }
      });
    });
  } catch (err) {
    console.error('Quick draft error:', err);
    res.status(500).json({ error: err.message });
  }
});

// API: Get Master Keyword List Across Processed Files (Marketplace-specific separation)
app.get('/api/master-keywords', requireAuth(db), requireRole(['OWNER', 'MANAGER', 'SELLER']), (req, res) => {
  // Marketplace is server-derived from the authenticated session
  const targetMarket = req.user.marketplace;

  db.all(
    "SELECT * FROM market_trends WHERE tenant_id = ? AND workspace_id = ? AND marketplace = ? ORDER BY discoveredAt DESC",
    [req.user.tenantId, req.user.workspaceId, targetMarket],
    (err, rows) => {
    if (err) return res.status(500).json({ error: 'DATABASE_ERROR' });
    
    const masterKeywords = [];
    const seen = new Set();

    // rows is already marketplace-filtered by the SQL WHERE clause above
    // (legacy NULL-marketplace rows are excluded by that same condition).
    rows.forEach(r => {
      // Only surface keywords with real persisted Volume/CPR/Score data.
      // Rows uploaded before this tracking existed have no way to recover
      // that data, and showing keywords with no evidence behind them is
      // exactly what staff need this list to NOT do.
      if (!r.keywords_detailed) return;
      let detailed = null;
      try { detailed = JSON.parse(r.keywords_detailed); } catch (e) { return; }
      if (!Array.isArray(detailed)) return;

      const kws = detailed;
      kws.forEach((kwItem, idx) => {
        const cleanKw = (kwItem.keyword || '').trim();
        if (cleanKw && cleanKw.length > 2 && !seen.has(cleanKw.toLowerCase())) {
          seen.add(cleanKw.toLowerCase());
          const ipRes = ipGuard.screenText(cleanKw);

          let tierBadge = kwItem.tierBadge;
          if (!tierBadge) {
            tierBadge = targetMarket === 'AMAZON' ? '👑 Tier 1 (Title Hook)' : '🎯 Valid Tag (<=20 chars)';
            if (masterKeywords.length >= 10 && masterKeywords.length < 35) {
              tierBadge = targetMarket === 'AMAZON' ? '💎 Tier 2 (5 Bullets)' : '🎯 Secondary Tag';
            } else if (masterKeywords.length >= 35) {
              tierBadge = targetMarket === 'AMAZON' ? '📦 Tier 3 (Backend Fuel)' : '📝 Title Keyword';
            }
          }

          masterKeywords.push({
            keyword: cleanKw,
            category: r.category || (targetMarket === 'AMAZON' ? 'Amazon FBM' : 'Etsy Handmade'),
            discoveredAt: r.discoveredAt,
            ipVerdict: ipRes.verdict,
            tierBadge,
            ipHits: ipRes.hits.map(h => h.term),
            volume: kwItem.volume ?? kwItem.searchVolume ?? null,
            cpr: kwItem.cpr ?? null,
            competingProducts: kwItem.competingProducts ?? null,
            titleDensity: kwItem.titleDensity ?? kwItem.density ?? null,
            // kwItem.score is rankKeywords' internal sort-only heuristic (it
            // uses hidden 100/10/8 defaults for missing metrics) -- it must
            // never leak into the Staff-facing opportunityScore when the real
            // one is null, or this API route re-fabricates exactly what
            // rankKeywords was fixed to stop doing (P0.5-C truth fix).
            opportunityScore: kwItem.opportunityScore ?? null,
            scoringState: kwItem.scoringState ?? (kwItem.opportunityScore != null ? 'SCORED' : 'INSUFFICIENT_EVIDENCE')
          });
        }
      });
    });

    res.json({ success: true, count: masterKeywords.length, marketplace: targetMarket, keywords: masterKeywords });
  });
});


// API: Multi-Source Market Benchmark & Go/No-Go Decision Engine
app.get('/api/benchmark/validate', requireAuth(db), requireRole(['OWNER', 'MANAGER', 'SELLER']), async (req, res) => {
  const { seed, category } = req.query;
  if (!seed || !String(seed).trim() || !category || !String(category).trim()) {
    return res.status(400).json({ success: false, error: 'INSUFFICIENT_EVIDENCE', message: 'seed and category query parameters are required' });
  }
  try {
    const data = await benchmarkService.getMarketBenchmark({ seed: String(seed).trim(), category: String(category).trim() });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Upload and process Helium 10 / CSV / HTML reports (Universal handler with aliases)
const handleReportUpload = async (req, res) => {
  const uploadedFiles = (Array.isArray(req.files) && req.files.length > 0) 
    ? req.files 
    : (req.file ? [req.file] : []);

  if (uploadedFiles.length === 0) {
    return res.status(400).json({ error: 'No file uploaded. Please select one or more .xlsx, .csv, or .html files.' });
  }

  const targetCategory = req.body.category;
  if (!targetCategory || !String(targetCategory).trim()) {
    return res.status(400).json({ success: false, error: 'INSUFFICIENT_EVIDENCE', message: 'category parameter is required' });
  }

  const fileNames = uploadedFiles.map(f => f.originalname).join(', ');
  const targetMarketplace = req.user.marketplace;

  try {
    let rawRows = [];

    for (const f of uploadedFiles) {
      const filePath = f.path;
      const fileName = f.originalname;

      // 1. Handle HTML/HTM (YTrends / Etsy Spy exports)
      if (/\.html?$/i.test(fileName)) {
        const htmlContent = fs.readFileSync(filePath, 'utf8');
        const parsedKeywords = ytrendsParser.parseYTrendsHtml(htmlContent);
        const rows = (parsedKeywords || []).map(kw => ({
          Keyword: kw.keyword || kw,
          'Search Volume': researchTruth.monthlySearchVolumeFromViews24h(kw.views24h),
          'Competing Products': researchTruth.toObservedNumber(kw.listings),
          'Title Density': null
        }));
        rawRows.push(...rows);
      } else {
        // 2. Handle Excel & CSV through ExcelJS
        const rows = await readFirstWorksheet(filePath);
        if (Array.isArray(rows) && rows.length > 0) {
          rawRows.push(...rows);
        }
      }
    }

    if (!rawRows || rawRows.length === 0) {
      return res.status(400).json({ error: 'Uploaded file(s) contain no data rows.' });
    }

    // Auto-detect if file is an Xray Report vs Cerebro Keyword Report
    const firstRow = rawRows[0];
    const columnNames = Object.keys(firstRow).map(k => k.toLowerCase());
    
    const isXrayReport = columnNames.some(k => 
      /asin|bsr|monthly sales|monthly revenue|product details|brand/i.test(k)
    ) && !columnNames.some(k => /search volume|title density|cpr/i.test(k));

    if (isXrayReport) {
      console.log(`Detected Helium 10 Xray Report from ${uploadedFiles.length} file(s) (${rawRows.length} total rows)! Running ASIN Batcher Engine...`);
      const seedKeyword = req.body.seedPhrase || req.body.seedKeyword || targetCategory || 'Custom Product';
      const batchResult = asinBatcher.filterAndBatchXrayAsins(rawRows, seedKeyword);

      if (!batchResult.success) {
        return res.status(422).json({
          success: false,
          isXray: true,
          error: batchResult.error,
          code: batchResult.code || 'INSUFFICIENT_EVIDENCE'
        });
      }

      const reportProvenance = {
        state: 'SOURCE_REPORTED',
        sourceKind: 'STAFF_UPLOADED_XRAY_REPORT',
        ingestedAt: new Date().toISOString(),
        captureTime: null,
        tenantId: req.user.tenantId,
        workspaceId: req.user.workspaceId,
        // This report is not persisted as a project evidence record by this
        // endpoint, so it must not claim a project binding from client input.
        projectId: null,
        projectBinding: 'NOT_PERSISTED',
        artifacts: uploadedFiles.map(file => ({
          fileName: file.originalname,
          sha256: crypto.createHash('sha256').update(fs.readFileSync(file.path)).digest('hex')
        }))
      };

      // Extract rich sellers list for Learning Box & Staff Review
      const xraySellers = (batchResult.batches || []).flatMap(b => b.items || []).map((item, idx) => ({
        id: `asin_${item.asin}_${idx}`,
        asin: item.asin,
        title: item.title,
        brand: item.brand,
        price: item.price,
        sales: item.sales,
        parentSales: item.parentSales,
        salesScope: item.salesScope,
        parentSalesScope: item.parentSalesScope,
        revenue: item.revenue,
        parentRevenue: item.parentRevenue,
        revenueScope: item.revenueScope,
        parentRevenueScope: item.parentRevenueScope,
        bsr: item.bsr,
        rankSourceHeader: item.rankSourceHeader,
        ratingValue: item.ratingValue,
        ratingCount: item.ratingCount,
        ratings: item.ratings,
        reviewCount: item.reviewCount,
        reviewVelocity: item.reviewVelocity,
        buyBox: item.buyBox,
        fulfillment: item.fulfillment,
        category: item.category,
        seller: item.seller,
        sellerCountry: item.sellerCountry,
        sellerAge: item.sellerAge,
        creationDate: item.creationDate,
        abaMostClicked: item.abaMostClicked,
        isBestSeller: item.isBestSeller,
        isSponsored: item.isSponsored,
        imageUrl: item.imageUrl,
        fees: item.fees,
        titleCharCount: item.titleCharCount,
        activeSellers: item.activeSellers,
        // This is a navigation reference deterministically derived from the
        // observed ASIN, not an observed listing URL or seller identity.
        url: `https://www.amazon.com/dp/${item.asin}`,
        urlProvenance: 'DERIVED_FROM_ASIN',
        evidenceState: item.evidenceState,
        fieldProvenance: item.fieldProvenance,
        shopName: item.seller || null
      }));

      return res.json({
        success: true,
        isXray: true,
        reportType: 'HELIUM10_XRAY',
        fileNames,
        filesUploadedCount: uploadedFiles.length,
        seedKeyword: batchResult.seedKeyword,
        totalInputAsins: batchResult.totalInputAsins,
        totalCleanAsins: batchResult.totalCleanAsins,
        rejectedCount: batchResult.rejectedCount,
        batchCount: batchResult.batchCount,
        batches: batchResult.batches,
        xraySellers,
        reportProvenance
      });
    }

    // Detect all multi-dimensional Helium 10 & Data Dive Cerebro columns
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
    const seenKeywordsMap = new Map();

    for (const r of rawRows) {
      let rawVal = String(r[kwKey] || '').trim();
      
      // Clean competitor title spam (e.g. strip pipe '|' and trailing filler)
      if (rawVal.includes('|')) {
        rawVal = rawVal.split('|')[0].trim();
      }
      rawVal = rawVal.replace(/\s+/g, ' ').replace(/^["']|["']$/g, '').trim();

      const sanitizedKw = keywordRanker.sanitizeKeyword(rawVal);
      if (!sanitizedKw) continue; // Discards ASINs, line numbers, delivery blacklist, and offensive terms

      const lower = sanitizedKw.toLowerCase();

      // IP / Trademark Screening
      const isIpRisk = IP_TRADEMARK_BLACKLIST.some(ip => lower.includes(ip));
      if (isIpRisk) {
        if (!flaggedIpKeywords.includes(sanitizedKw)) {
          flaggedIpKeywords.push(sanitizedKw);
        }
        continue; // Skip trademarked terms
      }

      const readNumericOrNull = (key) => (key ? researchTruth.toObservedNumber(r[key]) : null);
      const searchVolume = readNumericOrNull(volKey);
      const competingProducts = readNumericOrNull(compKey);
      const titleDensity = readNumericOrNull(titleDensityKey);
      const cpr = readNumericOrNull(cprKey);
      const rawIq = readNumericOrNull(iqKey);

      // Fast deduplication & max-metric merge for multi-file Cerebro uploads
      if (seenKeywordsMap.has(lower)) {
        const existing = seenKeywordsMap.get(lower);
        if (searchVolume !== null && (existing.searchVolume === null || searchVolume > existing.searchVolume)) {
          existing.searchVolume = searchVolume;
        }
        if (cpr !== null && (existing.cpr === null || (cpr > 0 && cpr < existing.cpr))) {
          existing.cpr = cpr;
        }
        continue;
      }

      const { opportunityScore, scoringState } = researchTruth.scoreKeywordEvidence({
        searchVolume,
        competingProducts,
        titleDensity,
        rawIq
      });

      const entry = {
        keyword: sanitizedKw,
        searchVolume,
        competingProducts,
        titleDensity,
        cpr,
        opportunityScore,
        scoringState
      };
      seenKeywordsMap.set(lower, entry);
      evaluatedKeywords.push(entry);
    }

    if (evaluatedKeywords.length === 0) {
      return res.status(400).json({ 
        error: 'Không tìm thấy từ khóa hợp lệ. Các từ khóa có thể đã bị chặn do từ rác, ASIN code, từ tốc độ giao hàng hoặc bộ lọc IP.',
        flaggedIpKeywords
      });
    }

    // Rank & Sort using Master Keyword Ranker Engine with Seed Phrase Specific Intent Matcher & Long-tail Priority
    const seedPhrase = req.body.seedPhrase || req.body.seedKeyword || targetCategory;
    const rankedKeywords = keywordRanker.rankKeywords(evaluatedKeywords, targetCategory, seedPhrase);

    // Assign Strategic 5 Tiers (Amazon A10 & Data Dive Methodology)
    const topKeywordsDetailed = rankedKeywords.slice(0, 100).map((item, idx) => {
      let tier = 'Tier 5 (A+ Content & Brand Story)';
      let tierBadge = '✨ Tier 5 (A+ Content)';

      if (idx < 10) {
        tier = 'Tier 1 (Golden Launch - Title Hook <=75 chars)';
        tierBadge = '👑 Tier 1 (Title Hook)';
      } else if (idx < 25) {
        tier = 'Tier 2 (Backend Generic Search Terms <=249 Bytes)';
        tierBadge = '📦 Tier 2 (Backend 249b)';
      } else if (idx < 45) {
        tier = 'Tier 3 (Item Highlights <=125 Chars)';
        tierBadge = '💡 Tier 3 (Item Highlights)';
      } else if (idx < 75) {
        tier = 'Tier 4 (Core Features - 5 Bullets [HOOKS])';
        tierBadge = '💎 Tier 4 (5 Bullets)';
      }

      return {
        ...item,
        rank: idx + 1,
        tier,
        tierBadge
      };
    });

    const keywords = topKeywordsDetailed.map(k => k.keyword);
    const trendingKeywordsStr = keywords.slice(0, 30).join(', ');

    // Insert into market_trends for AI Drafter
    resolveActiveProjectId(db, req.user, req.body.projectId, (pErr, targetProjectId) => {
      if (pErr) return res.status(pErr.status || 400).json({ success: false, error: pErr.error, message: pErr.message });
      db.run(
        "INSERT INTO market_trends (category, trending_keywords, keywords_detailed, marketplace, tenant_id, workspace_id, project_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [targetCategory, trendingKeywordsStr, JSON.stringify(topKeywordsDetailed), targetMarketplace, req.user.tenantId, req.user.workspaceId, targetProjectId],
        function(dbErr) {
          if (dbErr) return res.status(500).json({ error: dbErr.message });
          
          const trendId = this.lastID;
          const msg = `[H10 MKL ENGINE] Scored & imported ${keywords.length} keywords from ${uploadedFiles.length} file(s) ("${fileNames}") for ${targetCategory}. Top Opportunity: "${keywords[0]}" (Score: ${topKeywordsDetailed[0].opportunityScore})`;
          logAgentAction(db, { agentId: 1, tenantId: req.user.tenantId, workspaceId: req.user.workspaceId, message: msg });

          res.json({
            success: true,
            trendId,
            projectId: targetProjectId,
            fileNames,
            filesUploadedCount: uploadedFiles.length,
            fileName: fileNames,
            category: targetCategory,
            totalRows: rawRows.length,
            topKeywords: keywords,
            topKeywordsDetailed,
            flaggedIpKeywords,
            trendingKeywordsStr
          });
        }
      );
    });
  } catch (err) {
    console.error('H10 File Parse Error:', err);
    res.status(500).json({ error: `Failed to parse file(s): ${err.message}` });
  }
};

app.post('/api/upload-h10', requireAuth(db), requireRole(['OWNER', 'MANAGER', 'SELLER']), upload.any(), handleReportUpload);
app.post('/api/upload-trends', requireAuth(db), requireRole(['OWNER', 'MANAGER', 'SELLER']), upload.any(), handleReportUpload);

// API: Batch a pasted ASIN list into Cerebro-ready groups of 10 (AsinBatcherWidget's
// manual-paste flow — separate from /api/upload-h10's file-upload flow)
app.post('/api/asins/batch', requireAuth(db), requireRole(['OWNER', 'MANAGER', 'SELLER']), (req, res) => {
  const { asins, seedKeyword } = req.body || {};
  if (!asins || (typeof asins === 'string' && !asins.trim())) {
    return res.status(400).json({ success: false, error: 'Please paste 10-30 ASINs to batch.' });
  }
  try {
    const batchResult = asinBatcher.filterAndBatchXrayAsins(asins, seedKeyword || 'Custom Product');
    if (!batchResult.success) {
      return res.status(422).json({ success: false, error: batchResult.error, code: batchResult.code || 'INSUFFICIENT_EVIDENCE' });
    }
    res.json({ success: true, ...batchResult });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Real Analytics Summary Endpoint (Driven by real listings & feedback)
app.get('/api/analytics-summary', requireAuth(db), requireRole(['OWNER', 'MANAGER', 'SELLER']), (req, res) => {
  db.get(`
    SELECT 
      COUNT(*) as totalListings,
      SUM(CASE WHEN status IN ('PUBLISH_READY', 'MANAGER_APPROVED') THEN 1 ELSE 0 END) as approvedListings,
      SUM(CASE WHEN status = 'NEEDS_QA' THEN 1 ELSE 0 END) as pendingListings
    FROM listings
    WHERE tenant_id = ? AND workspace_id = ? AND marketplace = ?
  `, [req.user.tenantId, req.user.workspaceId, req.user.marketplace], (err, listingStats) => {
    if (err) return res.status(500).json({ error: err.message });

    db.all(`
      SELECT categoryName, COUNT(*) as count 
      FROM listings 
      WHERE tenant_id = ? AND workspace_id = ? AND marketplace = ?
      GROUP BY categoryName
    `, [req.user.tenantId, req.user.workspaceId, req.user.marketplace], (catErr, catRows) => {
      if (catErr) return res.status(500).json({ error: catErr.message });

      db.get(`
        SELECT COUNT(*) as totalTrends, SUM(CASE WHEN processed = 1 THEN 1 ELSE 0 END) as processedTrends
        FROM market_trends
        WHERE tenant_id = ? AND workspace_id = ? AND marketplace = ?
      `, [req.user.tenantId, req.user.workspaceId, req.user.marketplace], (trendErr, trendStats) => {
        if (trendErr) return res.status(500).json({ error: trendErr.message });

        db.all(`
          SELECT action, COUNT(*) as count, SUM(revenue) as totalRevenue, SUM(orders) as totalOrders, SUM(views) as totalViews
          FROM sales_feedback sf
          JOIN listings l ON l.id = sf.listingId
          WHERE l.tenant_id = ? AND l.workspace_id = ? AND l.marketplace = ?
          GROUP BY action
        `, [req.user.tenantId, req.user.workspaceId, req.user.marketplace], (feedErr, feedRows) => {
          if (feedErr) return res.status(500).json({ error: feedErr.message });
          res.json({
            listingStats: {
              totalListings: listingStats?.totalListings || 0,
              approvedListings: listingStats?.approvedListings || 0,
              pendingListings: listingStats?.pendingListings || 0
            },
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
app.get('/api/trends', requireAuth(db), requireRole(['OWNER', 'MANAGER', 'SELLER']), (req, res) => {
  db.all(
    "SELECT * FROM market_trends WHERE tenant_id = ? AND workspace_id = ? AND marketplace = ? ORDER BY discoveredAt DESC LIMIT 30",
    [req.user.tenantId, req.user.workspaceId, req.user.marketplace],
    (err, rows) => {
    if (err) return res.status(500).json({ error: 'DATABASE_ERROR' });
    res.json(rows);
  });
});

// API: Instantly Draft listing for a specific trend using Multi-LLM Gateway (Gemini / GPT-4o / Claude) + Few-Shot Learning
app.post('/api/trends/:id/draft', requireAuth(db), requireRole(['OWNER', 'MANAGER', 'SELLER']), async (req, res) => {
  const { id } = req.params;
  const { projectId } = req.body || {};
  if (projectId !== undefined && projectId !== null && !/^\d+$/.test(String(projectId))) {
    return res.status(400).json({ success: false, error: 'PROJECT_CONTEXT_REQUIRED' });
  }
  const hasProjectContext = projectId !== undefined && projectId !== null;
  db.get(
    hasProjectContext
      ? "SELECT * FROM market_trends WHERE id = ? AND project_id = ? AND tenant_id = ? AND workspace_id = ? AND marketplace = ?"
      : "SELECT * FROM market_trends WHERE id = ? AND tenant_id = ? AND workspace_id = ? AND marketplace = ?",
    hasProjectContext
      ? [id, Number(projectId), req.user.tenantId, req.user.workspaceId, req.user.marketplace]
      : [id, req.user.tenantId, req.user.workspaceId, req.user.marketplace],
    async (err, trend) => {
    if (err || !trend) return res.status(404).json({ error: 'Trend cluster not found' });
    let aiAuthority;
    try {
      aiAuthority = await resolveServerAiAuthority(req, req.body);
    } catch (authorityError) {
      return rejectAiAuthority(res, authorityError);
    }
    const trendIp = ipGuard.screenText(`${trend.category || ''} ${trend.trending_keywords || ''}`);
    if (trendIp.verdict !== 'OK') {
      return res.status(409).json({ success: false, error: 'IP_CLEARANCE_REQUIRED', ipVerdict: trendIp.verdict });
    }
    const verifiedCategory = typeof aiAuthority.projection.facts.productType === 'string'
      ? aiAuthority.projection.facts.productType
      : 'Verified Product';

    // 1. Get LLM Settings
    readWorkspaceLlmSettings(req.user, (sErr, keys) => {
      if (sErr) return res.status(503).json({ success: false, error: 'SECRET_DECRYPTION_FAILED' });
      
      const provider = keys.active_llm_provider || 'GEMINI';
      const geminiKey = keys.gemini_api_key || process.env.GEMINI_API_KEY;
      const openaiKey = keys.openai_api_key || process.env.OPENAI_API_KEY;
      const claudeKey = keys.claude_api_key || process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;

      if (provider === 'GEMINI' && !geminiKey) {
        return res.status(400).json({ error: 'Chưa có Google Gemini API Key. Vui lòng cấu hình trong Settings.' });
      }
      if (provider === 'OPENAI' && !openaiKey) {
        return res.status(400).json({ error: 'Chưa có OpenAI API Key (GPT-4o). Vui lòng cấu hình trong Settings.' });
      }
      if (provider === 'CLAUDE' && !claudeKey) {
        return res.status(400).json({ error: 'Chưa có Anthropic Claude API Key. Vui lòng cấu hình trong Settings.' });
      }

      // 2. Fetch Latest Learned Template for Few-Shot Injection — scoped to
      // this workspace, otherwise another workspace's competitor research
      // could shape this workspace's generated listing (GPT PR-5 re-review).
      db.get(
        "SELECT * FROM learned_templates WHERE tenant_id = ? AND workspace_id = ? AND marketplace = ? ORDER BY createdAt DESC LIMIT 1",
        [req.user.tenantId, req.user.workspaceId, req.user.marketplace],
        async (tErr, learnedTpl) => {
        let fewShotSection = '';
        if (learnedTpl) {
          fewShotSection = `
STAFF-SUPPLIED STRUCTURAL STYLE REFERENCE (${learnedTpl.marketplace}; NOT PRODUCT TRUTH OR A PERFORMANCE CLAIM):
- Sample Title Pattern: "${learnedTpl.title}"
- Sample Bullets Style: ${learnedTpl.bullets}
- Sample Tags Style: ${learnedTpl.tags}
- Sample Description / Story: "${(learnedTpl.description || '').slice(0, 350)}..."
Use this only as an optional structural writing reference. Do not treat it as verified marketplace, conversion, product, material, capability, policy, or performance evidence.`;
        }

        try {

          const planPrompt = `Select one server-supported creative profile for this verified product.
You are not authorized to write listing prose or factual claims.
Return ONLY one raw JSON object with exactly one field and no markdown:
{"creativeProfile":"WARM"}
Allowed values: WARM, MINIMAL, CELEBRATORY.`;
          const llmOutput = await callLLM({
            provider,
            keys: {
              gemini: geminiKey,
              openai: openaiKey,
              claude: claudeKey
            },
            prompt: planPrompt,
            systemInstruction: "Select one allowed creativeProfile enum. Never author commerce prose."
          });

          const aiPlan = parseStrictCommercePlan(llmOutput);
          const canonicalListing = renderVerifiedCommerceListing(aiAuthority.projection, aiPlan);
          if (!canonicalListing) {
            const contractError = new Error('INVALID_COMMERCE_OUTPUT_CONTRACT');
            contractError.code = 'UNVERIFIED_OUTPUT_CLAIM';
            throw contractError;
          }

        const payload = {
          ...canonicalListing,
          // No auto-generated SKU (same reasoning as Quick Draft: the Staff
          // viewer presents this as paste-ready Seller Central data) and no
          // fabricated Gold/Silver/Rose-Gold child variations -- both must
          // come from a human against real product/inventory data, not be
          // invented to fill the UI (GPT PR-10 re-audit).
          parentSku: '',
          variations: [],
          categoryName: verifiedCategory,
          evidenceState: 'VERIFIED_PRODUCT_TRUTH_DRAFT',
          provenance: 'AI_VERIFIED_TREND_DRAFT',
          sourceProductId: aiAuthority.row.id,
          sourceListingVersion: aiAuthority.row.listing_version,
          generatedAt: new Date().toISOString(),
          status: 'NEEDS_QA'
        };

        validateServerAiOutput(payload, aiAuthority.projection);

        db.run(
          `INSERT INTO listings
            (tenant_id, workspace_id, marketplace, project_id, amazonTitle, etsyTitle, categoryName, status, authorId, payload)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [req.user.tenantId, req.user.workspaceId, req.user.marketplace, trend.project_id || null, payload.amazonTitle, payload.etsyTitle, payload.categoryName, 'NEEDS_QA', req.user.userId, JSON.stringify(payload)],
          function(insertErr) {
            if (insertErr) return res.status(500).json({ error: insertErr.message });
            
            // Mark trend as processed
            db.run("UPDATE market_trends SET processed = 1 WHERE id = ?", [trend.id]);
            logAgentAction(db, { agentId: 2, tenantId: req.user.tenantId, workspaceId: req.user.workspaceId, message: `Manually triggered draft generated for ${trend.category} (Listing ID: ${this.lastID})` });

            res.json({
              success: true,
              listingId: this.lastID,
              listing: { ...payload, dbId: this.lastID }
            });
          }
        );
      } catch (genErr) {
        console.error('Manual draft error:', genErr);
        if (genErr.code === 'UNVERIFIED_OUTPUT_CLAIM') {
          return res.status(422).json({ success: false, error: genErr.code, claims: genErr.claims });
        }
        res.status(500).json({ error: `AI Drafting failed: ${genErr.message}` });
      }
    });
  });
});
});
// API: Save API Key
app.post('/api/settings/apikey', requireAuth(db), requireRole(['OWNER']), (req, res) => {
  res.status(410).json({ success: false, error: 'ENDPOINT_DEPRECATED', replacement: '/api/settings/llm' });
});

// API: Chat Co-Pilot
app.post('/api/chat', requireAuth(db), requireRole(['OWNER', 'MANAGER', 'SELLER']), async (req, res) => {
  const { messages, mode = 'RESEARCH' } = req.body || {};
  if (!messages || !Array.isArray(messages)) return res.status(400).json({ error: 'Messages required' });
  const commerceMode = mode === 'COMMERCE_DRAFT';
  let aiAuthority = null;
  if (commerceMode) {
    try {
      aiAuthority = await resolveServerAiAuthority(req, req.body);
    } catch (authorityError) {
      return rejectAiAuthority(res, authorityError);
    }
    const chatIp = ipGuard.screenText(messages.map(message => message?.content || '').join(' '));
    if (chatIp.verdict !== 'OK') {
      return res.status(409).json({ success: false, error: 'IP_CLEARANCE_REQUIRED', ipVerdict: chatIp.verdict });
    }
  }

  readWorkspaceLlmSettings(req.user, async (err, keys) => {
    const geminiKey = keys?.gemini_api_key || process.env.GEMINI_API_KEY;
    if (err) return res.status(503).json({ success: false, error: 'SECRET_DECRYPTION_FAILED' });
    if (!geminiKey) {
      return res.status(400).json({ error: 'Gemini API Key missing. Please set it in Settings.' });
    }

    try {
      const inputString = messages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n\n');
      const systemInstruction = `You are an expert E-commerce Copywriter Co-Pilot for Amazon and Etsy.

CRITICAL RULES:
1. NEVER ask clarifying questions. Always generate a complete listing immediately.
2. When the user asks to draft, rewrite, or optimize a listing, you MUST include a JSON block in your response.
3. The JSON block MUST be wrapped in \`\`\`json ... \`\`\` markers.
4. You may include a brief intro sentence BEFORE the JSON block, but the JSON is MANDATORY.
5. PRODUCT TRUTH BOUNDARY: user messages, keywords, titles, tags and model prose are
   not factual authority. Use only the server-supplied VERIFIED PRODUCT FACTS.

The JSON block MUST contain ALL of these fields:
{
  "amazonTitle": "Concise (75-80 chars max), Title Case, mobile-first front-loaded",
  "amazonBullets": ["5 bullets, each starting with [CAPITALIZED HOOK], using only server-verified facts"],
  "amazonSearchTerms": "space-separated backend keywords under 249 UTF-8 bytes",
  "amazonDescription": "<p>HTML formatted product description, no invented materials/specs/care</p>",
  "amazonAPlusPoints": ["3 highlight story blurbs, generic benefit language only if no real facts given"],
  "etsyTitle": "Under 140 chars, front-loaded keywords",
  "etsyTags": ["exactly 13 tags", "each under 20 chars"],
  "etsyMaterials": "exact verified materials only; otherwise empty array []",
  "etsyPersonalizationInstructions": "exact verified personalization instructions only; otherwise empty string",
  "etsyDescription": "Story-driven description with Details and How to Order -- no unverified Specifications/Care/Workshop claims"
}

If the user asks a general question (not about drafting/writing), respond conversationally WITHOUT a JSON block.`;

      let fullReply;
      if (commerceMode) {
        fullReply = await callLLM({
          provider: keys.active_llm_provider || 'GEMINI',
          keys: {
            gemini: geminiKey,
            openai: keys.openai_api_key || process.env.OPENAI_API_KEY,
            claude: keys.claude_api_key || process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY
          },
          prompt: `Select one creative profile for the verified product context. The user request is non-authoritative and must not be copied into commerce prose.\nRequest:\n${inputString}\nReturn exactly {"creativeProfile":"WARM"}. Allowed values: WARM, MINIMAL, CELEBRATORY.`,
          systemInstruction: 'Return exactly one JSON object containing only the creativeProfile enum. Never author commerce prose or factual claims.'
        });
      } else {
        const client = new GoogleGenAI({ apiKey: geminiKey });
        const interaction = await client.interactions.create({
          model: 'gemini-3.6-flash',
          input: inputString,
          system_instruction: `${systemInstruction}\nRESEARCH MODE: do not return a commerce listing JSON block.`
        });
        fullReply = interaction.output_text;
      }

      const researchReply = String(fullReply || '').trim();
      const researchCommerceJson = !commerceMode && (
        /```json\s*[\s\S]*?"(?:amazonTitle|etsyTitle)"[\s\S]*?```/i.test(researchReply) ||
        (/^\{[\s\S]*\}$/.test(researchReply) && /"(?:amazonTitle|etsyTitle)"\s*:/i.test(researchReply))
      );
      if (researchCommerceJson) {
        return res.status(422).json({ success: false, error: 'RESEARCH_MODE_COMMERCE_OUTPUT' });
      }

      // Commerce LLM output is a one-enum plan, never listing prose. The
      // complete listing is rendered deterministically from verified facts.
      let extractedListing = null;
      if (commerceMode) {
        try {
          const parsedPlan = parseStrictCommercePlan(fullReply);
          const rendered = renderVerifiedCommerceListing(aiAuthority.projection, parsedPlan);
          if (!rendered) {
            const contractError = new Error('INVALID_COMMERCE_OUTPUT_CONTRACT');
            contractError.code = 'INVALID_COMMERCE_OUTPUT_CONTRACT';
            throw contractError;
          }
          extractedListing = { ...rendered, generatedAt: new Date().toISOString(), status: 'NEEDS_QA' };
          validateServerAiOutput(extractedListing, aiAuthority.projection);
        } catch (parseErr) {
          if (parseErr.code === 'UNVERIFIED_OUTPUT_CLAIM') throw parseErr;
          extractedListing = null;
          console.warn('Rejected non-canonical commerce plan:', parseErr.message);
        }
      }

      if (commerceMode && !extractedListing) {
        return res.status(422).json({ success: false, error: 'INVALID_COMMERCE_OUTPUT_CONTRACT' });
      }

      // Never reflect model-authored text in commerce responses.
      const displayReply = commerceMode
        ? 'Commerce draft generated from verified Product Truth.'
        : fullReply;

      res.json({ reply: displayReply, listing: extractedListing });
    } catch (apiError) {
      console.error('Chat API Error:', apiError);
      if (apiError.code === 'UNVERIFIED_OUTPUT_CLAIM') {
        return res.status(422).json({ success: false, error: apiError.code, claims: apiError.claims });
      }
      res.status(500).json({ error: apiError.message });
    }
  });
});

// API: Analytics Dashboard Data
app.get('/api/analytics', requireAuth(db), requireRole(['OWNER', 'MANAGER', 'SELLER']), (req, res) => {
  // Aggregate feedback actions, scoped to the caller's workspace via the
  // owning listing (sales_feedback itself carries no tenant/workspace
  // column — GPT PR-5 review finding P0-B2).
  db.all(`
    SELECT sf.action, COUNT(*) as count, SUM(sf.revenue) as totalRevenue, SUM(sf.orders) as totalOrders, SUM(sf.views) as totalViews
    FROM sales_feedback sf
    JOIN listings l ON l.id = sf.listingId
    WHERE l.tenant_id = ? AND l.workspace_id = ? AND l.marketplace = ?
    GROUP BY sf.action
  `, [req.user.tenantId, req.user.workspaceId, req.user.marketplace], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// -----------------------------------------------------
// MULTI-AGENT AUTOMATION (BACKGROUND WORKERS)
// -----------------------------------------------------

// API: Get Agents (Workspace-Isolated)
app.get('/api/agents', requireAuth(db), requireRole(['OWNER', 'MANAGER', 'SELLER']), (req, res) => {
  db.all("SELECT * FROM agents WHERE tenant_id = ? AND workspace_id = ?", [req.user.tenantId, req.user.workspaceId], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// API: Get Agent Logs (Workspace-Isolated)
app.get('/api/agents/logs', requireAuth(db), requireRole(['OWNER', 'MANAGER', 'SELLER']), (req, res) => {
  db.all(`
    SELECT l.*, a.name as agentName 
    FROM agent_logs l 
    JOIN agents a ON l.agentId = a.id 
    WHERE l.tenant_id = ? AND l.workspace_id = ?
    ORDER BY l.timestamp DESC LIMIT 50
  `, [req.user.tenantId, req.user.workspaceId], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// API: Toggle Agent Status (Workspace-Isolated)
app.post('/api/agents/:id/toggle', requireAuth(db), requireRole(['OWNER', 'MANAGER']), (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const VALID_AGENT_STATUSES = ['ONLINE', 'OFFLINE'];
  if (!VALID_AGENT_STATUSES.includes(status)) {
    return res.status(400).json({ success: false, error: 'INVALID_STATUS', allowed: VALID_AGENT_STATUSES });
  }
  db.run("UPDATE agents SET status = ?, lastActive = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ? AND workspace_id = ?", [status, id, req.user.tenantId, req.user.workspaceId], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Agent not found or workspace unauthorized' });
    }
    
    // Log the action
    db.run("INSERT INTO agent_logs (agentId, tenant_id, workspace_id, message) VALUES (?, ?, ?, ?)", [id, req.user.tenantId, req.user.workspaceId, `System commanded agent to go ${status}`]);
    res.json({ success: true, status });
  });
});

// Background Interval Engine (Simulates independent agents)
let backgroundAgentTickRunning = false;
const backgroundAgentTimer = setInterval(() => {
  if (backgroundAgentTickRunning) return; // prevent overlapping ticks from piling up (each MCP call can take 10-20s)
  backgroundAgentTickRunning = true;
  // Self-healing release: the per-agent work below uses mixed callback/promise
  // chains that aren't all awaited, so release the lock on a bounded timer
  // rather than trying to track every completion path.
  setTimeout(() => { backgroundAgentTickRunning = false; }, 15000);

  db.all("SELECT * FROM agents WHERE status = 'ONLINE' AND tenant_id IS NOT NULL AND workspace_id IS NOT NULL", [], (err, onlineAgents) => {
    if (err || !onlineAgents) return;

    onlineAgents.forEach(async agent => {
      // Agent 1: Trend Scout (Role: RESEARCHER - Real Data Engine)
      if (agent.role === 'RESEARCHER') {
        const files = fs.readdirSync(importsDir).filter(f => {
          const isSupportedExt = f.endsWith('.csv') || f.endsWith('.xlsx') || f.endsWith('.html') || f.endsWith('.htm');
          const isScopedToWorkspace = f.startsWith(`${agent.workspace_id}__`);
          return isSupportedExt && isScopedToWorkspace;
        });
        
        if (files.length > 0) {
          const fileToProcess = files[0];
          const fullPath = path.join(importsDir, fileToProcess);
          
          try {
            if (fileToProcess.endsWith('.html') || fileToProcess.endsWith('.htm')) {
              // Parse YTrends HTML Export
              const parsedItems = ytrendsParser.parseYTrendsFile(fullPath);
              if (parsedItems.length > 0) {
                const topKw = parsedItems[0];
                const msg = `[YTRENDS HTML IMPORT] Discovered keyword "${topKw.keyword}" (Sold24h: ${topKw.sold24h}, Conv: ${topKw.conversion}) from HTML file: ${fileToProcess}.`;
                logAgentAction(db, { agentId: agent.id, tenantId: agent.tenant_id, workspaceId: agent.workspace_id, message: msg });
                db.run("UPDATE agents SET lastActive = CURRENT_TIMESTAMP WHERE id = ?", [agent.id]);
              }
            } else {
              // Process Helium 10 / Amazon XLSX or CSV with the audited parser.
              const rows = await readFirstWorksheet(fullPath);
              
              if (rows.length > 0) {
                const sampleRow = rows[0];
                const kwKey = Object.keys(sampleRow).find(k => /keyword|query|search/i.test(k)) || Object.keys(sampleRow)[0];
                const realKw = String(sampleRow[kwKey] || 'Custom Gift').trim();

                const h10Msg = `[AMAZON H10 IMPORT] Discovered top keyword "${realKw}" from file: ${fileToProcess}.`;
                logAgentAction(db, { agentId: agent.id, tenantId: agent.tenant_id, workspaceId: agent.workspace_id, message: h10Msg });
                db.run("UPDATE agents SET lastActive = CURRENT_TIMESTAMP WHERE id = ?", [agent.id]);
              }
            }
            // Archive processed file
            const archivedPath = path.join(importsDir, `processed_${Date.now()}_${fileToProcess}`);
            fs.renameSync(fullPath, archivedPath);
          } catch (parseErr) {
            logAgentAction(db, { agentId: agent.id, tenantId: agent.tenant_id, workspaceId: agent.workspace_id, message: `Error parsing data file ${fileToProcess}: ${parseErr.message}` });
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
              const revenueText = Number.isFinite(Number(overview.total_revenue_usd)) ? `${Math.round(Number(overview.total_revenue_usd))}` : 'UNKNOWN';
              const opportunityText = Number.isFinite(Number(overview.opportunity_score)) ? String(Number(overview.opportunity_score)) : 'UNKNOWN';
              const liveMsg = `[YTRENDS MCP LIVE] Discovered niche data for "${targetSeed}" (Rev: ${revenueText}, OppScore: ${opportunityText}). Tags: ${topTags || 'UNKNOWN'}.`;
              logAgentAction(db, { agentId: agent.id, tenantId: agent.tenant_id, workspaceId: agent.workspace_id, message: liveMsg });
              db.run("UPDATE agents SET lastActive = CURRENT_TIMESTAMP WHERE id = ?", [agent.id]);
            })
            .catch(mcpErr => {
              const msg = `[REAL DATA ENGINE] Standing by... Drop .csv/.xlsx report files into data/imports/. YTrends MCP error: ${mcpErr.message}`;
              logAgentAction(db, { agentId: agent.id, tenantId: agent.tenant_id, workspaceId: agent.workspace_id, message: msg });
              db.run("UPDATE agents SET lastActive = CURRENT_TIMESTAMP WHERE id = ?", [agent.id]);
            });
        }
      }

      // Agent 2: AI Drafter (Role: DRAFTER)
      if (agent.role === 'DRAFTER') {
        db.get("SELECT * FROM market_trends WHERE processed = 0 AND tenant_id = ? AND workspace_id = ? ORDER BY discoveredAt ASC LIMIT 1", [agent.tenant_id, agent.workspace_id], (err, trend) => {
          if (!err && trend) {
            logAgentAction(db, {
              agentId: agent.id,
              tenantId: agent.tenant_id,
              workspaceId: agent.workspace_id,
              message: `[SCOPED_DRAFT] Trend ${trend.id} found for category ${trend.category}.`
            });
          }
        });
      }
    });
  });
}, 8000); // Agents evaluate their loops every 8 seconds

// Do not keep test runners or short-lived CLI processes alive solely for this timer.
backgroundAgentTimer.unref();

// Serve the production frontend build (npm run build output) when present.
const distDir = path.resolve(__dirname, '../dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir, {
    index: false,
    setHeaders: (res, filePath) => {
      if (filePath.includes('/assets/') || filePath.includes('\\assets\\')) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      } else {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
      }
    }
  }));
  app.get(/^(?!\/api\/).*/, (req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

// Final safety net: any error passed via next(err), or thrown/rejected inside
// an async route handler (auto-forwarded by Express 5), lands here instead of
// Express's default HTML error page — so the frontend always gets JSON back.
app.use((err, req, res, next) => {
  console.error('Unhandled request error:', err);
  if (res.headersSent) return next(err);
  res.status(500).json({ success: false, error: 'INTERNAL_SERVER_ERROR', message: err.message });
});

const PORT = process.env.PORT || 3001;
let serverInstance = null;

if (require.main === module) {
  serverInstance = app.listen(PORT, () => {
    console.log(`OmniSeller Backend OS running on port ${PORT}`);
  });
}

module.exports = { app, db, databaseReady, serverInstance, backgroundAgentTimer, ytrendsMcp };
