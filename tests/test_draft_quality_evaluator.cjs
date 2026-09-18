const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');

const verifiedCard = (productId, listingVersion) => ({
  productId: String(productId),
  listingVersion,
  facts: {
    productName: {
      value: 'Everyday keepsake',
      evidence: { state: 'VERIFIED', subjectId: String(productId), listingVersion, source: { kind: 'STAFF_ATTESTATION', id: 'truth-1' } }
    }
  },
  ipEvidence: { state: 'CLEARED', subjectId: String(productId), listingVersion, checkerVersion: 'test-v1', checkedAt: '2026-09-17T00:00:00.000Z' }
});

(async () => {
  const moduleUrl = pathToFileURL(path.resolve(__dirname, '../src/utils/draftQualityEvaluator.js')).href;
  const { evaluateDraftQuality, compareDraftEvaluations } = await import(moduleUrl);
  const base = {
    dbId: 42,
    listingVersion: 3,
    productTruthCard: verifiedCard(42, 3),
    status: 'NEEDS_QA',
    amazonTitle: 'Everyday Keepsake Gift with Simple Message for Family Celebration',
    itemHighlights: 'A simple keepsake for everyday gifting and family celebrations.',
    amazonBullets: Array.from({ length: 5 }, (_, index) => `DETAIL ${index + 1} - Clear buyer-focused information grounded in the verified product record.`),
    amazonSearchTerms: 'keepsake family celebration thoughtful present everyday gift simple message meaningful occasion recipient home display memory token',
    amazonDescription: 'A clear, buyer-focused description grounded in verified product information. '.repeat(7),
    etsyTitle: 'Everyday Keepsake Gift for Family Celebration',
    etsyTags: ['family keepsake', 'everyday gift', 'simple message', 'memory token', 'family present', 'celebration gift'],
    etsyDescription: 'A clear, buyer-focused description grounded in verified product information. '.repeat(7)
  };

  const amazon = evaluateDraftQuality(base, 'AMAZON', { ready: 20, expected: 20 });
  assert.equal(amazon.blockers.length, 0, `valid Amazon draft should not be blocked: ${amazon.blockers.join('; ')}`);
  assert.ok(amazon.metrics.length === 5 && amazon.score > 0 && amazon.score <= 100);
  assert.match(amazon.note, /does not predict sales/i);

  const overLimit = evaluateDraftQuality({ ...base, amazonTitle: 'X'.repeat(76) }, 'AMAZON', { ready: 20, expected: 20 });
  assert.equal(overLimit.verdict, 'BLOCKED');
  assert.ok(overLimit.blockers.some(item => item.includes('75-character')));

  const staleTruth = evaluateDraftQuality({ ...base, listingVersion: 4 }, 'ETSY', { ready: 12, expected: 12 });
  assert.equal(staleTruth.verdict, 'BLOCKED');
  assert.ok(staleTruth.blockers.some(item => item.includes('STALE_OR_MISMATCHED_CARD_BINDING')));

  const shortage = evaluateDraftQuality(base, 'ETSY', { ready: 12, expected: 12 });
  assert.equal(shortage.blockers.length, 0);
  assert.ok(shortage.warnings.some(item => item.includes('6/13')));
  assert.ok(compareDraftEvaluations(amazon, overLimit) < 0, 'unblocked draft must rank before a blocked draft');

  const canonical = evaluateDraftQuality({ ...base, productTruthCard: undefined,
    canonicalQualityEvidence: { marketplace: 'AMAZON', productTruthBound: true,
      productTruthRevisionId: 7, productTruthHash: 'a'.repeat(64), verifiedFactCount: 9,
      imagePlan: { ready: 7, expected: 8 } } }, 'AMAZON', { ready: 7, expected: 8 });
  assert.equal(canonical.metrics.find(item => item.key === 'truth').score, 100);
  assert.equal(canonical.metrics.find(item => item.key === 'assets').score, 88);
  assert(!canonical.blockers.some(item => item.includes('PRODUCT_TRUTH_CARD_REQUIRED')));

  console.log('DRAFT_QUALITY_EVALUATOR_TESTS_PASSED');
})().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
