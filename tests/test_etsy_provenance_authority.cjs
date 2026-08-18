const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function routeSection(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.ok(start >= 0, `Missing route start: ${startMarker}`);
  assert.ok(end > start, `Missing route end: ${endMarker}`);
  return source.slice(start, end);
}

function run() {
  console.log('================================================================');
  console.log('  TESTING ETSY SERVER-AUTHORITATIVE EVIDENCE PROVENANCE');
  console.log('================================================================\n');

  const learner = require('../server/competitorBatchLearner');
  assert.strictEqual(typeof learner.sanitizeStaffManualAssertions, 'function');

  const assertedAt = '2026-08-18T03:10:00.000Z';
  const spoofed = learner.sanitizeStaffManualAssertions([
    {
      id: 'client-row-1',
      title: 'Custom Embroidered Nurse Sweatshirt',
      shopName: 'Claimed Shop',
      views24h: '0',
      sold24h: '12',
      price: '$31.99',
      evidenceSource: 'HEYETSY_HTML', // untrusted client claim: must be overwritten
      assertedBy: 999999,
      assertedAt: '1999-01-01T00:00:00.000Z',
      selected: true
    },
    {
      title: 'Personalized Floral Sleeve Crewneck',
      evidenceSource: 'CSV_UPLOAD', // also must be overwritten
      selected: true
    }
  ], 42, assertedAt);

  assert.strictEqual(spoofed.length, 2);
  for (const row of spoofed) {
    assert.strictEqual(row.evidenceSource, 'STAFF_MANUAL_ASSERTION', 'client cannot self-promote evidence provenance');
    assert.strictEqual(row.assertedBy, 42, 'actor must come from authenticated server context');
    assert.strictEqual(row.assertedAt, assertedAt, 'assertion time must come from server context');
    assert.strictEqual(row.isSynthetic, false);
  }
  assert.strictEqual(spoofed[0].views24h, 0, 'explicit zero remains zero');
  assert.strictEqual(spoofed[1].shopName, null, 'missing manual facts remain UNKNOWN/null');
  console.log('  🟢 Client evidenceSource/assertion metadata is overwritten by server authority.');

  const serverSrc = fs.readFileSync(path.join(ROOT, 'server', 'server.js'), 'utf8');
  const learnBlock = routeSection(
    serverSrc,
    '// API: ETSY Evidence Batch Learn — SEO recommendation only, not Product Truth.',
    '// API: Amazon Quick Draft'
  );

  assert.ok(learnBlock.includes('parseEtsySearchResults({ htmlContent, csvRows })'), 'raw source must be parsed server-side');
  assert.ok(learnBlock.includes('sanitizeStaffManualAssertions(sellers, req.user.userId, assertedAt)'), 'browser seller rows must be downgraded/attributed server-side');
  assert.ok(learnBlock.includes('sellers: evidenceRows'), 'LLM must receive the server-authoritative evidenceRows, not req.body sellers');
  assert.ok(!/synthesizeEtsyBatchLearnings\([\s\S]*?\bsellers,\s*\n\s*category/.test(learnBlock), 'route must not pass raw client sellers directly into the learner');
  console.log('  🟢 Batch-learn route derives provenance on the server before LLM use.');

  const learnerSrc = fs.readFileSync(path.join(ROOT, 'server', 'competitorBatchLearner.js'), 'utf8');
  assert.ok(learnerSrc.includes("evidenceSource: 'STAFF_MANUAL_ASSERTION'"));
  assert.ok(learnerSrc.includes('assertedBy: actorId'));
  assert.ok(learnerSrc.includes('assertedAt'));
  assert.ok(learnerSrc.includes('manualAssertions:'));
  console.log('  🟢 Manual assertions stay attributable/timestamped in the evidence summary.');

  console.log('\n================================================================');
  console.log('  🟢 ETSY PROVENANCE AUTHORITY CASES PASSED');
  console.log('================================================================');
}

try {
  run();
} catch (err) {
  console.error(err);
  process.exit(1);
}
