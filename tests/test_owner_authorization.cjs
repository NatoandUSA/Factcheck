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
const pullRequest = {
  merged: true,
  merged_at: '2026-09-15T12:00:00Z',
  merge_commit_sha: authority.targetSha,
  head: { sha: '9'.repeat(40) },
  base: { ref: 'main' }
};
const digest = authorizationDigest(authority);
const marker = `OMNISELLER_OWNER_AUTHORIZATION_V3:${digest}`;
const ownerComment = {
  kind: 'issue_comment', author_association: 'OWNER', user: { login: 'NatoandUSA' },
  created_at: '2026-09-15T13:00:00Z', body: `Authorize exact merged release.\n${marker}`
};

assert.equal(verifyOwnerReviews([ownerComment], 'NatoandUSA', authority, pullRequest).digest, digest);
for (const invalidPullRequest of [
  { ...pullRequest, merged: false },
  { ...pullRequest, merged_at: null },
  { ...pullRequest, merge_commit_sha: '8'.repeat(40) },
  { ...pullRequest, base: { ref: 'develop' } }
]) {
  assert.throws(() => verifyOwnerReviews([ownerComment], 'NatoandUSA', authority, invalidPullRequest),
    /PR_LINEAGE_INVALID/, 'authorization must bind the exact commit created on main by the merged PR');
}
assert.throws(() => verifyOwnerReviews([{ ...ownerComment, created_at: '2026-09-15T11:59:59Z' }],
  'NatoandUSA', authority, pullRequest), /OWNER_AUTHORIZATION_NOT_PROVEN/,
'a pre-merge marker cannot authorize a merge commit that did not yet exist');
assert.throws(() => verifyOwnerReviews([{ ...ownerComment, author_association: 'CONTRIBUTOR' }],
  'NatoandUSA', authority, pullRequest), /OWNER_AUTHORIZATION_NOT_PROVEN/);
assert.throws(() => verifyOwnerReviews([{ ...ownerComment, user: { login: 'deploy-bot' } }],
  'NatoandUSA', authority, pullRequest), /OWNER_AUTHORIZATION_NOT_PROVEN/);
assert.throws(() => verifyOwnerReviews([{ ...ownerComment, body: 'approved without exact digest' }],
  'NatoandUSA', authority, pullRequest), /OWNER_AUTHORIZATION_NOT_PROVEN/);
assert.throws(() => verifyOwnerReviews([ownerComment, {
  kind: 'review', state: 'CHANGES_REQUESTED', user: { login: 'NatoandUSA' },
  submitted_at: '2026-09-15T14:00:00Z', body: 'stop'
}], 'NatoandUSA', authority, pullRequest), /OWNER_AUTHORIZATION_NOT_PROVEN/,
'a later Owner change request must invalidate an older deployment marker');
assert.equal(verifyOwnerReviews([{
  kind: 'review', state: 'CHANGES_REQUESTED', user: { login: 'NatoandUSA' },
  submitted_at: '2026-09-15T13:00:00Z', body: 'stop'
}, { ...ownerComment, created_at: '2026-09-15T14:00:00Z' }],
'NatoandUSA', authority, pullRequest).digest, digest,
'a newer exact post-merge Owner comment may re-authorize deployment');
assert.throws(() => verifyOwnerReviews([ownerComment, {
  ...ownerComment, body: `OMNISELLER_OWNER_AUTHORIZATION_REVOKED_V1:${digest}`
}], 'NatoandUSA', authority, pullRequest), /OWNER_AUTHORIZATION_REVOKED/);

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
