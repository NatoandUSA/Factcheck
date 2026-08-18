const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const serverPath = path.join(root, 'server', 'server.js');
const learnerPath = path.join(root, 'server', 'competitorBatchLearner.js');

function replaceSection(source, startMarker, endMarker, replacement) {
  const start = source.indexOf(startMarker);
  if (start < 0) throw new Error(`PATCH_START_NOT_FOUND:${startMarker}`);
  const end = source.indexOf(endMarker, start);
  if (end < 0) throw new Error(`PATCH_END_NOT_FOUND:${endMarker}`);
  return source.slice(0, start) + replacement.trimEnd() + '\n\n' + source.slice(end);
}

function replaceExact(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`PATCH_EXACT_NOT_FOUND:${label}`);
  return source.replace(before, after);
}

let learner = fs.readFileSync(learnerPath, 'utf8');

learner = replaceExact(
  learner,
`  evidenceSource,
  selected
}) {`,
`  evidenceSource,
  assertedBy = null,
  assertedAt = null,
  selected
}) {`,
  'makeSeller-assertion-args'
);

learner = replaceExact(
  learner,
`    evidenceSource,
    isSynthetic: false,
    selected: Boolean(selected)`,
`    evidenceSource,
    assertedBy: assertedBy ?? null,
    assertedAt: assertedAt ?? null,
    isSynthetic: false,
    selected: Boolean(selected)`,
  'makeSeller-assertion-fields'
);

const manualHelperMarker = `function displayEvidence(value) {
  return value === undefined || value === null || value === '' ? 'UNKNOWN' : String(value);
}
`;
const manualHelperReplacement = `function displayEvidence(value) {
  return value === undefined || value === null || value === '' ? 'UNKNOWN' : String(value);
}

/**
 * Client seller objects are never allowed to self-assert an observed source.
 * The authenticated server converts them into explicit Staff assertions and
 * binds actor + timestamp. Raw HTML/CSV can retain observed provenance only
 * when the server parses that raw source itself.
 */
function sanitizeStaffManualAssertions(sellers, actorId, assertedAt = new Date().toISOString()) {
  return (Array.isArray(sellers) ? sellers : [])
    .filter(s => s && s.selected !== false)
    .slice(0, 30)
    .map((seller, index) => makeSeller({
      id: seller.id || \`staff-assertion-\${index + 1}\`,
      title: seller.title,
      shopName: seller.shopName,
      country: seller.country,
      listingAge: seller.listingAge,
      views24h: seller.views24h,
      favorites: seller.favorites,
      sold24h: seller.sold24h,
      price: seller.price,
      rating: seller.rating,
      url: seller.url,
      evidenceSource: 'STAFF_MANUAL_ASSERTION',
      assertedBy: actorId,
      assertedAt,
      selected: true
    }))
    .filter(s => s.title && s.title.length > 5);
}
`;
learner = replaceExact(learner, manualHelperMarker, manualHelperReplacement, 'manual-assertion-helper');

learner = replaceExact(
  learner,
`    evidenceSource: seller.evidenceSource,
    selected: true`,
`    evidenceSource: seller.evidenceSource,
    assertedBy: seller.assertedBy,
    assertedAt: seller.assertedAt,
    selected: true`,
  'normalize-assertion-fields'
);

learner = replaceExact(
  learner,
`      sources: [...new Set(selectedSellers.map(s => s.evidenceSource))]
    },`,
`      sources: [...new Set(selectedSellers.map(s => s.evidenceSource))],
      manualAssertions: selectedSellers
        .filter(s => s.evidenceSource === 'STAFF_MANUAL_ASSERTION')
        .map(s => ({
          title: s.title,
          url: s.url,
          assertedBy: s.assertedBy,
          assertedAt: s.assertedAt
        }))
    },`,
  'evidence-summary-assertions'
);

learner = replaceExact(
  learner,
`  nullableInteger,
  parseEtsySearchResults,
  synthesizeEtsyBatchLearnings`,
`  nullableInteger,
  parseEtsySearchResults,
  sanitizeStaffManualAssertions,
  synthesizeEtsyBatchLearnings`,
  'export-manual-helper'
);

fs.writeFileSync(learnerPath, learner, 'utf8');

let server = fs.readFileSync(serverPath, 'utf8');
server = replaceExact(
  server,
`const { parseEtsySearchResults, synthesizeEtsyBatchLearnings } = require('./competitorBatchLearner');`,
`const { parseEtsySearchResults, sanitizeStaffManualAssertions, synthesizeEtsyBatchLearnings } = require('./competitorBatchLearner');`,
  'server-import-manual-helper'
);

const batchLearnRoute = `// API: ETSY Evidence Batch Learn — SEO recommendation only, not Product Truth.
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
  '// API: ETSY Evidence Batch Learn — SEO recommendation only, not Product Truth.',
  '// API: Amazon Quick Draft',
  batchLearnRoute
);

fs.writeFileSync(serverPath, server, 'utf8');
console.log('P0.5-B provenance authority patch applied successfully.');
