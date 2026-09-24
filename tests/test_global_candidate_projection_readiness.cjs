'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { projectResearchFile } = require('../server/globalCandidateProjection');
const { evaluateCandidate } = require('../server/globalCandidateEvaluation');
const { headers, buildCsv, sourceRow } = require('./fixtures/etsy_search_rich_67_sanitized.cjs');

(async () => {
  const result = await projectResearchFile({
    kind: 'ETSY_SEARCH',
    fileName: 'para-mi-hija.csv',
    mediaType: 'text/csv',
    sourceCapturedAt: '2026-09-22', sourceCaptureTimezoneOffsetMinutes: 0,
    rawBytes: Buffer.from(buildCsv([1, 2, 3]), 'utf8')
  }, 'ETSY');

  const query = result.projections.find(item => item.phrase === 'para mi hija');
  const tag = result.projections.find(item => item.phrase === 'daughter gift');

  assert.ok(query, 'query-context candidate must be projected');
  assert.equal(query.provenance.integrityOutcome, 'VALID');
  assert.equal(query.provenance.sourceCapturedAt, '2026-09-22');
  assert.equal(query.provenance.sourceCaptureTimezoneOffsetMinutes, 0);
  assert.equal(query.provenance.sourceCapturedAtAuthority, 'STAFF_ASSERTED');
  assert.equal(query.rawEvidence.supportScope, 'QUERY_RESULT_SET');
  assert.equal(query.provenance.queryBinding.authority, 'THIRD_PARTY_RESEARCH_CAPTURE');
  assert.equal(query.provenance.queryBinding.state, 'CAPTURE_ARTIFACT_VERIFIED');
  assert.equal(query.provenance.queryBinding.source, 'HEYETSY_EXTENSION_EXPORT');
  assert.match(query.provenance.queryBinding.captureId, /^heyetsy-capture-[a-f0-9]{64}$/);
  assert.equal(query.provenance.queryBinding.artifactHash, result.rawHash);
  assert.equal(query.authorityClassification, 'RESEARCH_ONLY');
  assert.equal(query.evidenceTier, 'E2_THIRD_PARTY_RESEARCH');
  assert.equal(query.provenance.provider, 'HEYETSY_EXTENSION_EXPORT');
  assert.equal(query.commercialEvidence.listingCount, 3,
    'verified HeyEtsy query capture retains its complete query result set');
  const queryEval = evaluateCandidate({
    id: 1, candidateKey: 'a'.repeat(64), normalizedPhrase: query.phrase,
    displayPhrase: query.phrase, evidence: [{ ...query, evidenceHash: 'b'.repeat(64) }]
  }, { marketplace: 'ETSY', now: '2026-09-24T00:00:00.000Z' });
  assert.equal(queryEval.researchReadiness.value, 'READY',
    'artifact-verified fresh HeyEtsy capture must qualify for Etsy research readiness');
  assert.deepEqual(queryEval.researchReadiness.reasonCodes, ['ETSY_HEYETSY_RESEARCH_READY']);
  assert.notEqual(queryEval.commercialProof.status, 'ESTABLISHED',
    'HeyEtsy research metrics must never establish Commercial Proof');
  assert.ok(queryEval.commercialProof.blockerCodes.includes('RESEARCH_ONLY_NOT_COMMERCIAL_PROOF'));

  const genericCsv = [
    'listing_id,title,shop,url,keyword_context,rank_position',
    '1234567890,Generic Etsy result,GenericShop,https://www.etsy.com/listing/1234567890/generic,para mi hija,1'
  ].join('\n');
  const generic = await projectResearchFile({
    kind: 'ETSY_SEARCH', fileName: 'generic-etsy.csv', mediaType: 'text/csv',
    sourceCapturedAt: '2026-09-22', sourceCaptureTimezoneOffsetMinutes: 0,
    rawBytes: Buffer.from(genericCsv, 'utf8')
  }, 'ETSY');
  const genericQuery = generic.projections.find(item => item.phrase === 'para mi hija');
  assert.equal(genericQuery.rawEvidence.supportScope, 'QUERY_CONTEXT_HINT');
  assert.equal(genericQuery.provenance.queryBinding.authority, 'NONE',
    'generic Etsy CSV must not be relabeled as a verified HeyEtsy capture');

  assert.ok(tag, 'tag candidate must be projected');
  assert.equal(tag.provenance.integrityOutcome, 'VALID');
  assert.equal(tag.rawEvidence.supportScope, 'TAG_SUPPORT');
  assert.equal(tag.commercialEvidence.listingCount, 3,
    'tag candidate may only retain listings that actually support that tag');

  const escape = value => {
    const text = String(value ?? '');
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const rowA = sourceRow(11);
  const rowB = { ...sourceRow(12), keyword_context: 'other niche' };
  const mixedCsv = [headers.join(','), rowA, rowB]
    .map((row, index) => index === 0 ? row : headers.map(header => escape(row[header])).join(','))
    .join('\n');
  const mixed = await projectResearchFile({
    kind: 'ETSY_SEARCH', fileName: 'mixed-query.csv', mediaType: 'text/csv',
    sourceCapturedAt: '2026-09-22', sourceCaptureTimezoneOffsetMinutes: 0,
    rawBytes: Buffer.from(mixedCsv, 'utf8')
  }, 'ETSY');
  const firstQuery = mixed.projections.find(item => item.phrase === 'para mi hija');
  const secondQuery = mixed.projections.find(item => item.phrase === 'other niche');
  assert.equal(firstQuery.commercialEvidence.listingCount, 1,
    'query hint must not absorb listings captured for another query');
  assert.equal(secondQuery.commercialEvidence.listingCount, 1,
    'each query hint must receive only its own captured result set');
  assert.equal(firstQuery.provenance.queryBinding.authority, 'NONE');
  assert.equal(secondQuery.provenance.queryBinding.authority, 'NONE');

  const badUrlRow = { ...sourceRow(21), url: 'https://www.etsy.com/listing/999999999/not-the-same-id' };
  const badUrlCsv = [headers.join(','), headers.map(header => escape(badUrlRow[header])).join(',')].join('\n');
  const badUrl = await projectResearchFile({
    kind: 'ETSY_SEARCH', fileName: 'bad-url.csv', mediaType: 'text/csv',
    sourceCapturedAt: '2026-09-22', sourceCaptureTimezoneOffsetMinutes: 0,
    rawBytes: Buffer.from(badUrlCsv, 'utf8')
  }, 'ETSY');
  const badUrlQuery = badUrl.projections.find(item => item.phrase === 'para mi hija');
  assert.equal(badUrlQuery.rawEvidence.supportScope, 'QUERY_CONTEXT_HINT');
  assert.equal(badUrlQuery.provenance.queryBinding.authority, 'NONE',
    'listing URL / listing ID mismatch must prevent artifact-level query binding');

  const rankRowA = sourceRow(31);
  const rankRowB = { ...sourceRow(32), rank_position: 31 };
  const badRankCsv = [headers.join(','), rankRowA, rankRowB]
    .map((row, index) => index === 0 ? row : headers.map(header => escape(row[header])).join(','))
    .join('\n');
  const badRank = await projectResearchFile({
    kind: 'ETSY_SEARCH', fileName: 'bad-rank.csv', mediaType: 'text/csv',
    sourceCapturedAt: '2026-09-22', sourceCaptureTimezoneOffsetMinutes: 0,
    rawBytes: Buffer.from(badRankCsv, 'utf8')
  }, 'ETSY');
  const badRankQuery = badRank.projections.find(item => item.phrase === 'para mi hija');
  assert.equal(badRankQuery.rawEvidence.supportScope, 'QUERY_CONTEXT_HINT');
  assert.equal(badRankQuery.provenance.queryBinding.authority, 'NONE',
    'duplicate/non-contiguous rank sequence must prevent artifact-level query binding');

  const amazonFixture = {
    kind: 'AMAZON_CEREBRO', fileName: 'freshness.csv', mediaType: 'text/csv',
    sourceCapturedAt: '2026-09-22', sourceCaptureTimezoneOffsetMinutes: 0,
    rawBytes: Buffer.from('Keyword Phrase,Search Volume,Keyword Sales,Competing Products\nmemorial gift,1000,12,300\n', 'utf8')
  };
  const amazonProjected = await projectResearchFile(amazonFixture, 'AMAZON');
  assert.equal(amazonProjected.projections[0].provenance.sourceCapturedAt, '2026-09-22');
  assert.equal(amazonProjected.projections[0].provenance.sourceCaptureTimezoneOffsetMinutes, 0);
  assert.equal(amazonProjected.projections[0].provenance.sourceCapturedAtBasis, 'OPERATOR_EXPLICIT_INPUT');

  const serverSource = fs.readFileSync(path.join(__dirname, '..', 'server', 'server.js'), 'utf8');
  assert.doesNotMatch(serverSource, /addObservedTag\(cleanSeed\)/,
    'seed phrase must never be relabeled as an observed provider tag');
  assert.doesNotMatch(serverSource, /extract clean tags from cleanSeed and live search listing titles/,
    'listing-title derivation fallback must remain removed from observed provider evidence');
  assert.match(serverSource, /new Set\(\['kind', 'capturedAt', 'captureTimezoneOffsetMinutes'\]\)/,
    'global opportunity intake must explicitly accept capturedAt and operator timezone');
  assert.match(serverSource, /SOURCE_CAPTURE_DATE_REQUIRED/,
    'global opportunity intake must fail closed when capturedAt is missing');
  assert.match(serverSource, /SOURCE_CAPTURE_TIMEZONE_REQUIRED/,
    'global opportunity intake must fail closed when operator timezone is missing');

  console.log('GLOBAL_CANDIDATE_PROJECTION_READINESS_PASSED');
})().catch(error => { console.error(error); process.exitCode = 1; });
