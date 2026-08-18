const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const serverPath = path.join(root, 'server', 'server.js');
const learnerPath = path.join(root, 'server', 'competitorBatchLearner.js');
const workspacePath = path.join(root, 'src', 'components', 'EtsyWorkspace.jsx');

function replaceSection(source, startMarker, endMarker, replacement) {
  const start = source.indexOf(startMarker);
  if (start < 0) throw new Error(`PATCH_START_NOT_FOUND:${startMarker}`);
  const end = source.indexOf(endMarker, start);
  if (end < 0) throw new Error(`PATCH_END_NOT_FOUND:${endMarker}`);
  return source.slice(0, start) + replacement.trimEnd() + '\n\n' + source.slice(end);
}

function replaceExact(source, before, after, label) {
  if (!source.includes(before)) {
    if (source.includes(after)) return source; // idempotent on the patched branch
    throw new Error(`PATCH_EXACT_NOT_FOUND:${label}`);
  }
  return source.replace(before, after);
}

let server = fs.readFileSync(serverPath, 'utf8');

const mcpRoute = `// API: One-Click Auto-Pull LIVE Etsy Trends from MCP into Database.
// P0.5-B truth rule: no semantic padding, no plausible overview defaults, and
// no DB write if the live source is unavailable or contains no usable tags.
app.post('/api/mcp/pull-etsy', requireAuth(db), requireRole(['OWNER', 'MANAGER', 'SELLER']), async (req, res) => {
  if (req.user.marketplace !== 'ETSY') {
    return res.status(403).json({ success: false, error: 'MARKETPLACE_MISMATCH', message: 'This endpoint requires an Etsy workspace session.' });
  }
  const { seed = 'custom gift', category = 'Custom Gift' } = req.body;

  let mcpData;
  try {
    mcpData = await ytrendsMcp.exploreNiche(seed);
  } catch (mcpErr) {
    console.warn('YTrends MCP unavailable for:', seed, mcpErr.message);
    return res.status(503).json({
      success: false,
      error: 'ETSY_MCP_UNAVAILABLE',
      message: 'Live Etsy MCP data is unavailable. No fallback market data was generated or persisted.'
    });
  }

  const liveData = mcpData?.data;
  if (!liveData || typeof liveData !== 'object') {
    return res.status(422).json({
      success: false,
      error: 'INSUFFICIENT_EVIDENCE',
      message: 'The live MCP response did not contain usable Etsy evidence.'
    });
  }

  const overview = liveData.overview && typeof liveData.overview === 'object' ? liveData.overview : null;
  const extracted = [];
  const addObservedKeyword = value => {
    const text = typeof value === 'string' ? value : (value?.tag || value?.name || value?.keyword);
    const clean = typeof text === 'string' ? text.trim().toLowerCase() : '';
    if (clean && !extracted.includes(clean)) extracted.push(clean);
  };
  (Array.isArray(liveData.adjacent_tags) ? liveData.adjacent_tags : []).forEach(addObservedKeyword);
  (Array.isArray(liveData.related_keywords) ? liveData.related_keywords : []).forEach(addObservedKeyword);

  const cleanKws = [];
  const blockedKeywords = [];
  const invalidKeywords = [];
  extracted.forEach(keyword => {
    if (keyword.length < 3 || keyword.length > 20) {
      invalidKeywords.push({ keyword, reason: 'ETSY_TAG_LENGTH_OUT_OF_RANGE' });
      return;
    }
    const screen = ipGuard.screenText(keyword);
    if (screen.verdict === 'BLOCK') blockedKeywords.push(keyword);
    else cleanKws.push(keyword);
  });

  const observedTags = cleanKws.slice(0, 13);
  if (observedTags.length === 0) {
    return res.status(422).json({
      success: false,
      error: 'INSUFFICIENT_EVIDENCE',
      message: 'Live MCP returned no usable Etsy tags after validation/IP screening.',
      blockedKeywords,
      invalidKeywords
    });
  }

  const keywordsDetailed = observedTags.map(keyword => ({
    keyword,
    opportunityScore: overview?.opportunity_score ?? null,
    competingProducts: overview?.sellers ?? null,
    volume: overview?.listings ?? null,
    cpr: null,
    tierBadge: '🎯 Observed MCP Tag',
    evidenceSource: 'ETSY_MCP_LIVE'
  }));
  const trendingKeywordsStr = observedTags.join(', ');

  db.run(
    "INSERT INTO market_trends (category, trending_keywords, keywords_detailed, marketplace, tenant_id, workspace_id) VALUES (?, ?, ?, ?, ?, ?)",
    [category, trendingKeywordsStr, JSON.stringify(keywordsDetailed), req.user.marketplace, req.user.tenantId, req.user.workspaceId],
    function(dbErr) {
      if (dbErr) return res.status(500).json({ success: false, error: 'DATABASE_ERROR' });
      const trendId = this.lastID;
      const msg = \`[ETSY MCP OBSERVED] Imported \${observedTags.length} source tags for "\${seed}" (\${category}). No semantic padding applied.\`;
      db.run("INSERT INTO agent_logs (agentId, message) VALUES (1, ?)", [msg]);
      res.json({
        success: true,
        trendId,
        source: 'ETSY_MCP_LIVE',
        evidenceState: 'OBSERVED',
        category,
        seed,
        overview,
        keywords: observedTags,
        observedKeywordCount: observedTags.length,
        blockedKeywords,
        invalidKeywords,
        trendingKeywordsStr
      });
    }
  );
});`;

server = replaceSection(
  server,
  '// API: One-Click Auto-Pull Live Etsy Trends from MCP into Database',
  '// API: Helium 10 MCP Status & OAuth Check',
  mcpRoute
);

const scanRoute = `// API: ETSY Seller Evidence Scanner (uploaded HeyEtsy/Etsy HTML or CSV evidence).
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
      batchGroup: \`Evidence Batch \${Math.floor(index / 10) + 1}\`,
      batchRationale: 'Grouped in source order only; no revenue/sales ranking is inferred.'
    }));
    const batches = [];
    for (let start = 0; start < sellers.length; start += 10) {
      const batchNumber = Math.floor(start / 10) + 1;
      batches.push({
        batchNumber,
        name: \`Evidence Batch \${batchNumber}\`,
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
});`;

server = replaceSection(
  server,
  '// API: ETSY Search & Top Sellers Scanner',
  '// API: ETSY Deep Batch Learn 5-10 Selected Sellers',
  scanRoute
);

const batchLearnRoute = `// API: ETSY Evidence Batch Learn — SEO recommendation only, not Product Truth.
app.post('/api/etsy/batch-learn', requireAuth(db), requireRole(['OWNER', 'MANAGER', 'SELLER']), async (req, res) => {
  if (req.user.marketplace !== 'ETSY') {
    return res.status(403).json({ success: false, error: 'MARKETPLACE_MISMATCH', message: 'This endpoint requires an Etsy workspace session.' });
  }
  const { seedPhrase = 'nurse sweatshirt', category = 'Apparel: Sweatshirt', sellers = [] } = req.body;
  if (!Array.isArray(sellers) || sellers.filter(s => s && s.selected !== false).length < 3) {
    return res.status(422).json({ success: false, error: 'INSUFFICIENT_EVIDENCE', message: 'Select at least 3 seller/listing evidence rows.' });
  }

  readWorkspaceLlmSettings(req.user, async (settingsErr, keys) => {
    if (settingsErr) return res.status(503).json({ success: false, error: 'SECRET_DECRYPTION_FAILED' });
    try {
      const provider = keys.active_llm_provider || 'GEMINI';
      const result = await synthesizeEtsyBatchLearnings({
        seedPhrase,
        sellers,
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
        // Etsy evidence learning must not manufacture cross-market Amazon copy.
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
        \`INSERT INTO listings
          (tenant_id, workspace_id, marketplace, amazonTitle, etsyTitle, categoryName, status, authorId, payload)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)\`,
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
});`;

server = replaceSection(
  server,
  '// API: ETSY Deep Batch Learn 5-10 Selected Sellers',
  '// API: Amazon Quick Draft',
  batchLearnRoute
);

const oldLog = `              const liveMsg = \`[YTRENDS MCP LIVE] Discovered niche data for "\${targetSeed}" (Rev: $\${Math.round(overview.total_revenue_usd || 0)}, OppScore: \${overview.opportunity_score || 50}). Tags: \${topTags || targetSeed} -- not persisted, no workspace binding for background agents yet.\`;`;
const newLog = `              const revenueText = Number.isFinite(Number(overview.total_revenue_usd)) ? \`$\${Math.round(Number(overview.total_revenue_usd))}\` : 'UNKNOWN';\n              const opportunityText = Number.isFinite(Number(overview.opportunity_score)) ? String(Number(overview.opportunity_score)) : 'UNKNOWN';\n              const liveMsg = \`[YTRENDS MCP LIVE] Discovered niche data for "\${targetSeed}" (Rev: \${revenueText}, OppScore: \${opportunityText}). Tags: \${topTags || 'UNKNOWN'} -- not persisted, no workspace binding for background agents yet.\`;`;
server = replaceExact(server, oldLog, newLog, 'background-mcp-log-unknown-not-zero');

fs.writeFileSync(serverPath, server, 'utf8');

let learner = fs.readFileSync(learnerPath, 'utf8');
learner = replaceExact(
  learner,
  "function normalizeSelectedSeller(seller) {\n  return makeSeller({\n    id: seller.id || `seller-${Math.random().toString(36).slice(2)}` ,",
  "function normalizeSelectedSeller(seller, index) {\n  return makeSeller({\n    id: seller.id || `seller-evidence-${index + 1}` ,",
  'learner-random-id'
);
learner = replaceExact(
  learner,
  '.map(normalizeSelectedSeller)',
  '.map((seller, index) => normalizeSelectedSeller(seller, index))',
  'learner-map-index'
);
fs.writeFileSync(learnerPath, learner, 'utf8');

let workspace = fs.readFileSync(workspacePath, 'utf8');
workspace = replaceExact(
  workspace,
  "const etsyTrends = (trendsData || []).filter(t => t.marketplace === 'ETSY');",
  "const etsyTrends = (trendsData || []).filter(t => t.marketplace === 'ETSY' && t.keywords_detailed);",
  'workspace-filter-evidence-trends'
);
workspace = replaceExact(
  workspace,
  "      setMcpResult(data);\n      if (onShowToast) onShowToast(`✓ Đã bóc tách ${data.keywords.length} Etsy Tags cho \"${data.seed}\"!`);",
  "      if (data.source !== 'ETSY_MCP_LIVE' || data.evidenceState !== 'OBSERVED' || !Array.isArray(data.keywords) || data.keywords.length === 0) {\n        throw new Error('INSUFFICIENT_EVIDENCE: MCP response is not verified live evidence.');\n      }\n      setMcpResult(data);\n      if (onShowToast) onShowToast(`✓ Đã nạp ${data.keywords.length} observed Etsy tags cho \"${data.seed}\" (không padding).`);",
  'workspace-mcp-evidence-gate'
);
workspace = workspace.replaceAll('⚡ Auto-Pull 13 Tags', '⚡ Auto-Pull Live Tags');
workspace = workspace.replaceAll('Bộ 13 Tags Độc Lập Cho', 'Observed Etsy MCP Tags Cho');
workspace = workspace.replaceAll('bộ 13 tags chuẩn ngách', 'tag evidence trực tiếp từ MCP');
fs.writeFileSync(workspacePath, workspace, 'utf8');

console.log('P0.5-B exact-marker patch applied successfully.');
