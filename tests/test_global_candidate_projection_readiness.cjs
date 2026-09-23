'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { projectResearchFile } = require('../server/globalCandidateProjection');
const { buildCsv } = require('./fixtures/etsy_search_rich_67_sanitized.cjs');

(async () => {
  const result = await projectResearchFile({
    kind: 'ETSY_SEARCH',
    fileName: 'para-mi-hija.csv',
    mediaType: 'text/csv',
    rawBytes: Buffer.from(buildCsv([1, 2, 3]), 'utf8')
  }, 'ETSY');

  const query = result.projections.find(item => item.phrase === 'para mi hija');
  const tag = result.projections.find(item => item.phrase === 'daughter gift');

  assert.ok(query, 'query-context candidate must be projected');
  assert.equal(query.provenance.integrityOutcome, 'VALID');
  assert.equal(query.rawEvidence.supportScope, 'QUERY_RESULT_SET');
  assert.equal(query.commercialEvidence.listingCount, 3,
    'query candidate must retain the full captured result set');

  assert.ok(tag, 'tag candidate must be projected');
  assert.equal(tag.provenance.integrityOutcome, 'VALID');
  assert.equal(tag.rawEvidence.supportScope, 'TAG_SUPPORT');
  assert.equal(tag.commercialEvidence.listingCount, 3,
    'tag candidate may only retain listings that actually support that tag');

  const serverSource = fs.readFileSync(path.join(__dirname, '..', 'server', 'server.js'), 'utf8');
  assert.doesNotMatch(serverSource, /addObservedTag\(cleanSeed\)/,
    'seed phrase must never be relabeled as an observed provider tag');
  assert.doesNotMatch(serverSource, /extract clean tags from cleanSeed and live search listing titles/,
    'listing-title derivation fallback must remain removed from observed provider evidence');

  console.log('GLOBAL_CANDIDATE_PROJECTION_READINESS_PASSED');
})().catch(error => { console.error(error); process.exitCode = 1; });
