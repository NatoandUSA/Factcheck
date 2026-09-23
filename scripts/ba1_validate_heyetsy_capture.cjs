'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { projectResearchFile } = require('../server/globalCandidateProjection');
const { evaluateCandidate } = require('../server/globalCandidateEvaluation');

function argValue(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const capturedAt = argValue('--captured-at');
const now = argValue('--now', new Date().toISOString());
const timezoneOffset = Number(argValue('--timezone-offset', '-420'));
const files = process.argv.filter((value, index) => index >= 2
  && !['--captured-at', '--now', '--timezone-offset'].includes(process.argv[index - 1])
  && !value.startsWith('--'));

if (!capturedAt || !/^\d{4}-\d{2}-\d{2}$/.test(capturedAt)) {
  console.error('Usage: node scripts/ba1_validate_heyetsy_capture.cjs --captured-at YYYY-MM-DD [--now ISO] [--timezone-offset -420] <csv>...');
  process.exit(2);
}
if (!files.length) {
  console.error('At least one CSV file path is required.');
  process.exit(2);
}
if (!Number.isInteger(timezoneOffset) || timezoneOffset < -840 || timezoneOffset > 720) {
  console.error('Invalid timezone offset.');
  process.exit(2);
}

const evidenceHash = projection => crypto.createHash('sha256')
  .update(JSON.stringify({
    sourceArtifactHash: projection.sourceArtifactHash,
    phrase: projection.phrase,
    captureId: projection.provenance?.queryBinding?.captureId || null
  }))
  .digest('hex');

(async () => {
  const results = [];
  for (const filePath of files) {
    const rawBytes = fs.readFileSync(filePath);
    const projected = await projectResearchFile({
      kind: 'ETSY_SEARCH',
      fileName: path.basename(filePath),
      mediaType: 'text/csv',
      sourceCapturedAt: capturedAt,
      sourceCaptureTimezoneOffsetMinutes: timezoneOffset,
      rawBytes
    }, 'ETSY');
    const queryProjection = projected.projections.find(item =>
      item.rawEvidence?.supportScope === 'QUERY_RESULT_SET'
      && item.provenance?.queryBinding?.state === 'CAPTURE_ARTIFACT_VERIFIED');

    if (!queryProjection) {
      results.push({
        file: path.basename(filePath),
        rawHash: projected.rawHash,
        artifactVerified: false,
        accounting: projected.accounting,
        sourceCoverage: projected.sourceCoverage
      });
      continue;
    }

    const evaluated = evaluateCandidate({
      id: 1,
      candidateKey: 'a'.repeat(64),
      normalizedPhrase: queryProjection.phrase,
      displayPhrase: queryProjection.phrase,
      evidence: [{ ...queryProjection, evidenceHash: evidenceHash(queryProjection) }]
    }, { marketplace: 'ETSY', now });

    results.push({
      file: path.basename(filePath),
      rawHash: projected.rawHash,
      artifactVerified: true,
      query: queryProjection.phrase,
      captureId: queryProjection.provenance.queryBinding.captureId,
      provider: queryProjection.provenance.provider,
      authorityClassification: queryProjection.authorityClassification,
      evidenceTier: queryProjection.evidenceTier,
      listingCount: queryProjection.commercialEvidence.listingCount,
      rowAccounting: projected.sourceCoverage?.[0]?.rowAccounting || null,
      recognizedColumnCount: projected.sourceCoverage?.[0]?.headerDiagnostics?.recognizedColumnCount ?? null,
      unmappedColumns: projected.sourceCoverage?.[0]?.headerDiagnostics?.unmappedColumns || [],
      capturedAt,
      now,
      researchReadiness: evaluated.researchReadiness,
      commercialProof: {
        status: evaluated.commercialProof.status,
        blockerCodes: evaluated.commercialProof.blockerCodes
      }
    });
  }

  console.log(JSON.stringify({
    authorityBaseline: 'bafb6b6acec6b6b5d60f47c06573b7f1a9225841',
    productionMutation: false,
    capturedAt,
    now,
    timezoneOffset,
    results
  }, null, 2));
})().catch(error => {
  console.error(error);
  process.exit(1);
});
