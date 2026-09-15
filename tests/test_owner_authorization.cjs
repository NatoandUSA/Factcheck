'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { authorizationDigest, nextLink, verifyOwnerReviews } = require('../scripts/verify_owner_authorization.cjs');

const authority = {
  baselineSha: 'a'.repeat(40), targetSha: 'b'.repeat(40),
  baselineSchemaFingerprint: 'c'.repeat(64), targetSchemaFingerprint: 'd'.repeat(64),
  baselineComparatorFingerprint: 'e'.repeat(64), targetComparatorFingerprint: 'f'.repeat(64),
  releaseControlFingerprint: '1'.repeat(64), evidenceSha256: '2'.repeat(64)
};
const pullRequest = { head: { sha: authority.targetSha }, base: { ref: 'main' } };
const digest = authorizationDigest(authority);
const marker = `OMNISELLER_OWNER_AUTHORIZATION_V2:${digest}`;
const valid = [{
  kind: 'review', state: 'APPROVED', commit_id: authority.targetSha, user: { login: 'NatoandUSA' },
  submitted_at: '2026-09-15T12:00:00Z', body: `Reviewed exact evidence.\n${marker}`
}];
assert.equal(verifyOwnerReviews(valid, 'NatoandUSA', authority, pullRequest).digest, digest);
assert.throws(() => verifyOwnerReviews(valid, 'NatoandUSA', authority,
  { head: { sha: '9'.repeat(40) }, base: { ref: 'main' } }), /PR_LINEAGE_INVALID/);
assert.throws(() => verifyOwnerReviews(valid, 'NatoandUSA', authority,
  { head: { sha: authority.targetSha }, base: { ref: 'develop' } }), /PR_LINEAGE_INVALID/);
assert.throws(() => verifyOwnerReviews([{ ...valid[0], state: 'COMMENTED' }], 'NatoandUSA', authority, pullRequest),
  /OWNER_AUTHORIZATION_NOT_PROVEN/);
assert.throws(() => verifyOwnerReviews([{ ...valid[0], commit_id: '9'.repeat(40) }], 'NatoandUSA', authority, pullRequest),
  /OWNER_AUTHORIZATION_NOT_PROVEN/);
assert.throws(() => verifyOwnerReviews([{ ...valid[0], user: { login: 'deploy-bot' } }], 'NatoandUSA', authority, pullRequest),
  /OWNER_AUTHORIZATION_NOT_PROVEN/);
assert.throws(() => verifyOwnerReviews([{ ...valid[0], body: 'approved without exact digest' }], 'NatoandUSA', authority, pullRequest),
  /OWNER_AUTHORIZATION_NOT_PROVEN/);
assert.throws(() => verifyOwnerReviews([valid[0], {
  ...valid[0], state: 'CHANGES_REQUESTED', submitted_at: '2026-09-15T13:00:00Z'
}], 'NatoandUSA', authority, pullRequest), /OWNER_AUTHORIZATION_NOT_PROVEN/,
'latest Owner review must control the effective authorization state');
assert.throws(() => verifyOwnerReviews([valid[0], {
  kind: 'issue_comment', author_association: 'OWNER', user: { login: 'NatoandUSA' },
  body: `OMNISELLER_OWNER_AUTHORIZATION_REVOKED_V1:${digest}`
}], 'NatoandUSA', authority, pullRequest), /OWNER_AUTHORIZATION_REVOKED/);
assert.equal(verifyOwnerReviews([{
  kind: 'issue_comment', author_association: 'OWNER', user: { login: 'NatoandUSA' },
  created_at: '2026-09-15T12:00:00Z', body: marker
}], 'NatoandUSA', authority, pullRequest).digest, digest, 'GitHub Owner comment supports self-authored PRs');
assert.throws(() => verifyOwnerReviews([{
  kind: 'issue_comment', author_association: 'CONTRIBUTOR', user: { login: 'NatoandUSA' },
  created_at: '2026-09-15T12:00:00Z', body: marker
}], 'NatoandUSA', authority, pullRequest), /OWNER_AUTHORIZATION_NOT_PROVEN/);
assert.throws(() => verifyOwnerReviews([{
  kind: 'issue_comment', author_association: 'OWNER', user: { login: 'NatoandUSA' },
  created_at: '2026-09-15T12:00:00Z', body: marker
}, {
  ...valid[0], state: 'CHANGES_REQUESTED', submitted_at: '2026-09-15T13:00:00Z'
}], 'NatoandUSA', authority, pullRequest), /OWNER_AUTHORIZATION_NOT_PROVEN/,
'a later Owner change request must revoke an older comment authorization');
assert.equal(verifyOwnerReviews([{
  ...valid[0], state: 'CHANGES_REQUESTED', submitted_at: '2026-09-15T12:00:00Z'
}, {
  kind: 'issue_comment', author_association: 'OWNER', user: { login: 'NatoandUSA' },
  created_at: '2026-09-15T13:00:00Z', body: marker
}], 'NatoandUSA', authority, pullRequest).digest, digest,
'a newer exact Owner comment may re-authorize a self-authored PR');

assert.equal(nextLink('<https://api.github.com/example?page=2>; rel="next", <x>; rel="last"'),
  'https://api.github.com/example?page=2');
assert.equal(nextLink('<x>; rel="last"'), null);
assert.throws(() => nextLink('<https://evil.example/page=2>; rel="next"'), /PAGINATION_ORIGIN_INVALID/);

const verifierSource = fs.readFileSync(path.resolve(__dirname, '../scripts/verify_owner_authorization.cjs'), 'utf8');
assert.equal(verifierSource.includes('GITHUB_TOKEN'), false,
  'deploy-host write credentials must not participate in Owner authorization verification');
assert.equal(verifierSource.includes("const REPOSITORY = 'NatoandUSA/Factcheck'"), true);
assert.equal(verifierSource.includes('AbortSignal.timeout(REQUEST_TIMEOUT_MS)'), true,
  'GitHub authorization fetch must be time-bounded');

console.log('OWNER_AUTHORIZATION_TESTS_PASSED');
