'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { authorizationDigest, verifyOwnerReviews } = require('../scripts/verify_owner_authorization.cjs');

const authority = {
  baselineSha: 'a'.repeat(40), targetSha: 'b'.repeat(40),
  baselineSchemaFingerprint: 'c'.repeat(64), targetSchemaFingerprint: 'd'.repeat(64),
  evidenceSha256: 'e'.repeat(64)
};
const digest = authorizationDigest(authority);
const valid = [{
  kind: 'review', state: 'APPROVED', commit_id: authority.targetSha, user: { login: 'NatoandUSA' },
  body: `Reviewed exact evidence.\nOMNISELLER_OWNER_AUTHORIZATION_V1:${digest}`
}];
assert.equal(verifyOwnerReviews(valid, 'NatoandUSA', authority).digest, digest);
assert.throws(() => verifyOwnerReviews([{ ...valid[0], state: 'COMMENTED' }], 'NatoandUSA', authority),
  /OWNER_AUTHORIZATION_NOT_PROVEN/);
assert.throws(() => verifyOwnerReviews([{ ...valid[0], commit_id: 'f'.repeat(40) }], 'NatoandUSA', authority),
  /OWNER_AUTHORIZATION_NOT_PROVEN/);
assert.throws(() => verifyOwnerReviews([{ ...valid[0], user: { login: 'deploy-bot' } }], 'NatoandUSA', authority),
  /OWNER_AUTHORIZATION_NOT_PROVEN/);
assert.throws(() => verifyOwnerReviews([{ ...valid[0], body: 'approved without exact digest' }], 'NatoandUSA', authority),
  /OWNER_AUTHORIZATION_NOT_PROVEN/);
assert.equal(verifyOwnerReviews([{
  kind: 'issue_comment', author_association: 'OWNER', user: { login: 'NatoandUSA' },
  body: `OMNISELLER_OWNER_AUTHORIZATION_V1:${digest}`
}], 'NatoandUSA', authority).digest, digest, 'GitHub Owner comment must support self-authored PRs');
assert.throws(() => verifyOwnerReviews([{
  kind: 'issue_comment', author_association: 'CONTRIBUTOR', user: { login: 'NatoandUSA' },
  body: `OMNISELLER_OWNER_AUTHORIZATION_V1:${digest}`
}], 'NatoandUSA', authority), /OWNER_AUTHORIZATION_NOT_PROVEN/);
const verifierSource = fs.readFileSync(path.resolve(__dirname, '../scripts/verify_owner_authorization.cjs'), 'utf8');
assert.equal(verifierSource.includes('GITHUB_TOKEN'), false,
  'deploy-host write credentials must not participate in Owner authorization verification');
assert.equal(verifierSource.includes("const REPOSITORY = 'NatoandUSA/Factcheck'"), true,
  'authorization repository authority must be pinned in reviewed source');

console.log('OWNER_AUTHORIZATION_TESTS_PASSED');
