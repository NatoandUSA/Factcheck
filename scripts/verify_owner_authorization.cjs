'use strict';

const crypto = require('node:crypto');

const REPOSITORY = 'NatoandUSA/Factcheck';
const SHA40 = /^[a-f0-9]{40}$/;
const SHA256 = /^[a-f0-9]{64}$/;

function authorizationDigest(authority) {
  const fields = ['baselineSha', 'targetSha', 'baselineSchemaFingerprint', 'targetSchemaFingerprint', 'evidenceSha256'];
  if (!authority || !fields.slice(0, 2).every(field => SHA40.test(String(authority[field] || '')))
    || !fields.slice(2).every(field => SHA256.test(String(authority[field] || '')))) {
    throw new Error('OWNER_AUTHORIZATION_AUTHORITY_INVALID');
  }
  const payload = { schemaVersion: 1, repository: REPOSITORY };
  for (const field of fields) payload[field] = authority[field];
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function verifyOwnerReviews(reviews, ownerLogin, authority) {
  if (!Array.isArray(reviews) || !String(ownerLogin || '').trim()) throw new Error('OWNER_AUTHORIZATION_INPUT_INVALID');
  const digest = authorizationDigest(authority);
  const marker = `OMNISELLER_OWNER_AUTHORIZATION_V1:${digest}`;
  const accepted = reviews.some(review => {
    const ownerMatches = String(review?.user?.login || '').toLowerCase() === ownerLogin.toLowerCase();
    const bodyMatches = String(review?.body || '').split(/\r?\n/).map(line => line.trim()).includes(marker);
    const approvedReview = review?.kind === 'review' && review?.state === 'APPROVED'
      && review?.commit_id === authority.targetSha;
    const ownerComment = review?.kind === 'issue_comment' && review?.author_association === 'OWNER';
    return ownerMatches && bodyMatches && (approvedReview || ownerComment);
  });
  if (!accepted) throw new Error('OWNER_AUTHORIZATION_NOT_PROVEN');
  return Object.freeze({ digest, marker, ownerLogin });
}

async function fetchGitHubJson(pathname) {
  const response = await fetch(`https://api.github.com/repos/${REPOSITORY}/${pathname}`, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'omniseller-release-verifier' }
  });
  if (!response.ok) throw new Error(`OWNER_AUTHORIZATION_GITHUB_HTTP_${response.status}`);
  return response.json();
}

async function fetchPullRequestReviews(prNumber) {
  if (!/^[1-9]\d*$/.test(String(prNumber || ''))) throw new Error('OWNER_AUTHORIZATION_PR_INVALID');
  const [reviews, comments] = await Promise.all([
    fetchGitHubJson(`pulls/${prNumber}/reviews?per_page=100`),
    fetchGitHubJson(`issues/${prNumber}/comments?per_page=100`)
  ]);
  return [
    ...reviews.map(review => ({ ...review, kind: 'review' })),
    ...comments.map(comment => ({ ...comment, kind: 'issue_comment' }))
  ];
}

if (require.main === module) {
  const [prNumber, ownerLogin, baselineSha, targetSha, baselineSchemaFingerprint,
    targetSchemaFingerprint, evidenceSha256] = process.argv.slice(2);
  fetchPullRequestReviews(prNumber)
    .then(reviews => verifyOwnerReviews(reviews, ownerLogin, {
      baselineSha, targetSha, baselineSchemaFingerprint, targetSchemaFingerprint, evidenceSha256
    }))
    .then(result => process.stdout.write(`OWNER_AUTHORIZATION_VERIFIED:${result.digest}\n`))
    .catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}

module.exports = Object.freeze({ REPOSITORY, authorizationDigest, fetchPullRequestReviews, verifyOwnerReviews });
