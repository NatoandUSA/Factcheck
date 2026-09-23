'use strict';

const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const {
  captureOfficialEtsySearch,
  normalizeQuery
} = require('../server/etsyOfficialSearchClient');
const { evaluateCandidate } = require('../server/globalCandidateEvaluation');

function fakeRequestFactory(payload, record) {
  return (options, callback) => {
    record.options = options;
    const req = new EventEmitter();
    req.setTimeout = () => {};
    req.destroy = error => req.emit('error', error);
    req.end = () => {
      const response = new EventEmitter();
      response.statusCode = 200;
      response.headers = { 'content-type': 'application/json' };
      callback(response);
      process.nextTick(() => {
        response.emit('data', Buffer.from(JSON.stringify(payload), 'utf8'));
        response.emit('end');
      });
    };
    return req;
  };
}

(async () => {
  assert.equal(normalizeQuery('  quinceañera   gift  '), 'quinceañera gift',
    'provider query normalization must preserve Unicode semantics');

  await assert.rejects(
    () => captureOfficialEtsySearch('adhd college student planner', { env: {} }),
    error => error?.code === 'ETSY_OFFICIAL_API_NOT_CONFIGURED'
  );

  const record = {};
  const captured = await captureOfficialEtsySearch('  adhd college student planner  ', {
    env: {
      ETSY_OPEN_API_KEYSTRING: 'test-key',
      ETSY_OPEN_API_SHARED_SECRET: 'test-secret'
    },
    now: new Date('2026-09-24T01:30:00.000Z'),
    requestImpl: fakeRequestFactory({
      count: 321,
      results: [
        {
          listing_id: 1086570451,
          title: 'ADHD College Student Planner',
          url: 'https://www.etsy.com/listing/1086570451/example',
          price: { amount: 1299, divisor: 100, currency_code: 'USD' }
        }
      ]
    }, record)
  });

  assert.equal(record.options.hostname, 'api.etsy.com');
  assert.match(record.options.path, /^\/v3\/application\/listings\/active\?/);
  assert.match(record.options.path, /keywords=adhd\+college\+student\+planner/);
  assert.match(record.options.path, /sort_on=score/);
  assert.equal(record.options.headers['x-api-key'], 'test-key:test-secret');

  const projection = captured.projection;
  assert.equal(projection.phrase, 'adhd college student planner');
  assert.equal(projection.sourceFamily, 'ETSY_PUBLIC_SEARCH');
  assert.equal(projection.authorityClassification, 'OBSERVED_PUBLIC');
  assert.equal(projection.evidenceTier, 'E1_OBSERVED_PUBLIC');
  assert.equal(projection.rawEvidence.supportScope, 'QUERY_RESULT_SET');
  assert.equal(projection.provenance.integrityOutcome, 'VALID');
  assert.equal(projection.provenance.queryBinding.authority, 'SERVER_PROVIDER');
  assert.equal(projection.provenance.queryBinding.state, 'OBSERVED');
  assert.match(projection.provenance.queryBinding.captureId, /^etsy-open-api-[a-f0-9]{64}$/);
  assert.equal(projection.provenance.sourceCapturedAtAuthority, 'SERVER_PROVIDER');
  assert.equal(projection.provenance.sourceCapturedAtBasis, 'SERVER_RESPONSE_CAPTURE');
  assert.equal(projection.provenance.sourceCapturedAt, '2026-09-24');
  assert.match(projection.sourceArtifactHash, /^[a-f0-9]{64}$/);
  assert.equal(projection.commercialEvidence.listingCount, 321);
  assert.equal(projection.commercialEvidence.listings[0].priceAmount, 12.99);

  const evaluated = evaluateCandidate({
    id: 12,
    candidateKey: 'a'.repeat(64),
    normalizedPhrase: projection.phrase,
    displayPhrase: projection.phrase,
    evidence: [{ ...projection, evidenceHash: 'b'.repeat(64) }]
  }, { marketplace: 'ETSY', now: '2026-09-24T02:00:00.000Z' });

  assert.equal(evaluated.researchReadiness.value, 'READY');
  assert.deepEqual(evaluated.researchReadiness.reasonCodes, ['ETSY_PUBLIC_SEARCH_RESEARCH_READY']);
  assert.notEqual(evaluated.commercialProof.status, 'ESTABLISHED',
    'official query capture must not manufacture Commercial Proof');

  const tampered = evaluateCandidate({
    id: 13, candidateKey: 'c'.repeat(64), normalizedPhrase: projection.phrase,
    displayPhrase: projection.phrase, evidence: [{
      ...projection,
      evidenceHash: 'd'.repeat(64),
      provenance: { ...projection.provenance, provider: 'CLIENT_ECHO' }
    }]
  }, { marketplace: 'ETSY', now: '2026-09-24T02:00:00.000Z' });
  assert.equal(tampered.researchReadiness.value, 'NOT_READY',
    'non-official provider metadata must not inherit trusted server freshness');

  const serverSource = fs.readFileSync(path.join(__dirname, '..', 'server', 'server.js'), 'utf8');
  assert.match(serverSource, /\/api\/global-candidates\/etsy-provider-captures/);
  assert.match(serverSource, /captureOfficialEtsySearch\(body\.queryPhrase\)/);

  const panelSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'components', 'GlobalCandidatePanel.jsx'), 'utf8');
  assert.match(panelSource, /data-testid="global-candidate-etsy-provider-query"/);
  assert.match(panelSource, /data-testid="capture-etsy-official-query"/);
  assert.match(panelSource, /\/api\/global-candidates\/etsy-provider-captures/);

  console.log('BA1_ETSY_OFFICIAL_CAPTURE_PASSED');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
