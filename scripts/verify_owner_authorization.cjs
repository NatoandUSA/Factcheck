'use strict';

const crypto = require('node:crypto');

const REPOSITORY = 'NatoandUSA/Factcheck';
const SHA40 = /^[a-f0-9]{40}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const MAX_PAGES = 10;
const REQUEST_TIMEOUT_MS = 10_000;
const AUTHORITY_FIELDS = [
  'baselineSha', 'targetSha',
  'baselineSchemaFingerprint', 'targetSchemaFingerprint',
  'baselineComparatorFingerprint', 'targetComparatorFingerprint',
  'releaseControlFingerprint', 'evidenceSha256'
];

function authorizationDigest(authority) {
  if (!authority || !AUTHORITY_FIELDS.slice(0, 2).every(field => SHA40.test(String(authority[field] || '')))
    || !AUTHORITY_FIELDS.slice(2).every(field => SHA256.test(String(authority[field] || '')))) {
    throw new Error('OWNER_AUTHORIZATION_AUTHORITY_INVALID');
  }
  const payload = { schemaVersion: 2, repository: REPOSITORY };
  for (const field of AUTHORITY_FIELDS) payload[field] = authority[field];
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function bodyLines(event) {
  return String(event?.body || '').split(/\r?\n/).map(line => line.trim());
}

function verifyOwnerReviews(events, ownerLogin, authority, pullRequest) {
  if (!Array.isArray(events) || !String(ownerLogin || '').trim()) throw new Error('OWNER_AUTHORIZATION_INPUT_INVALID');
  if (pullRequest?.head?.sha !== authority.targetSha || pullRequest?.base?.ref !== 'main') {
    throw new Error('OWNER_AUTHORIZATION_PR_LINEAGE_INVALID');
  }
  const digest = authorizationDigest(authority);
  const marker = `OMNISELLER_OWNER_AUTHORIZATION_V2:${digest}`;
  const revokedMarker = `OMNISELLER_OWNER_AUTHORIZATION_REVOKED_V1:${digest}`;
  const ownerEvents = events.filter(event => String(event?.user?.login || '').toLowerCase() === ownerLogin.toLowerCase());
  if (ownerEvents.some(event => bodyLines(event).includes(revokedMarker))) {
    throw new Error('OWNER_AUTHORIZATION_REVOKED');
  }

  const reviews = ownerEvents.filter(event => event?.kind === 'review' && Number.isFinite(Date.parse(event?.submitted_at)))
    .sort((left, right) => Date.parse(right.submitted_at) - Date.parse(left.submitted_at));
  const latestReview = reviews[0];
  const approvedReview = latestReview?.state === 'APPROVED'
    && latestReview?.commit_id === authority.targetSha
    && bodyLines(latestReview).includes(marker);
  const ownerComment = ownerEvents.some(event => event?.kind === 'issue_comment'
    && event?.author_association === 'OWNER' && bodyLines(event).includes(marker));
  if (!approvedReview && !ownerComment) throw new Error(`OWNER_AUTHORIZATION_NOT_PROVEN:${marker}`);
  return Object.freeze({ digest, marker, revokedMarker, ownerLogin });
}

function nextLink(value) {
  const match = String(value || '').split(',').map(item => item.trim())
    .map(item => item.match(/^<([^>]+)>;\s*rel="([^"]+)"$/)).find(item => item?.[2] === 'next');
  return match?.[1] || null;
}

async function fetchGitHubJson(url) {
  const response = await fetch(url, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'omniseller-release-verifier' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });
  if (!response.ok) throw new Error(`OWNER_AUTHORIZATION_GITHUB_HTTP_${response.status}`);
  return { body: await response.json(), next: nextLink(response.headers.get('link')) };
}

async function fetchAll(pathname) {
  const values = [];
  let url = `https://api.github.com/repos/${REPOSITORY}/${pathname}${pathname.includes('?') ? '&' : '?'}per_page=100`;
  for (let page = 0; url && page < MAX_PAGES; page++) {
    const result = await fetchGitHubJson(url);
    if (!Array.isArray(result.body)) throw new Error('OWNER_AUTHORIZATION_GITHUB_PAYLOAD_INVALID');
    values.push(...result.body);
    url = result.next;
  }
  if (url) throw new Error('OWNER_AUTHORIZATION_GITHUB_PAGINATION_LIMIT');
  return values;
}

async function fetchPullRequestAuthorization(prNumber) {
  if (!/^[1-9]\d*$/.test(String(prNumber || ''))) throw new Error('OWNER_AUTHORIZATION_PR_INVALID');
  const base = `https://api.github.com/repos/${REPOSITORY}`;
  const [pullRequestResult, reviews, comments] = await Promise.all([
    fetchGitHubJson(`${base}/pulls/${prNumber}`),
    fetchAll(`pulls/${prNumber}/reviews`),
    fetchAll(`issues/${prNumber}/comments`)
  ]);
  return {
    pullRequest: pullRequestResult.body,
    events: [
      ...reviews.map(review => ({ ...review, kind: 'review' })),
      ...comments.map(comment => ({ ...comment, kind: 'issue_comment' }))
    ]
  };
}

if (require.main === module) {
  const [prNumber, ownerLogin, ...values] = process.argv.slice(2);
  const authority = Object.fromEntries(AUTHORITY_FIELDS.map((field, index) => [field, values[index]]));
  fetchPullRequestAuthorization(prNumber)
    .then(({ events, pullRequest }) => verifyOwnerReviews(events, ownerLogin, authority, pullRequest))
    .then(result => process.stdout.write(`OWNER_AUTHORIZATION_VERIFIED:${result.digest}\n`))
    .catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}

module.exports = Object.freeze({
  AUTHORITY_FIELDS, MAX_PAGES, REPOSITORY, REQUEST_TIMEOUT_MS,
  authorizationDigest, fetchPullRequestAuthorization, nextLink, verifyOwnerReviews
});
