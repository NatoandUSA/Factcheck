const crypto = require('node:crypto');
const { MAX_BYTES, verifySocialHandoffV3 } = require('./integrations/socialHandoffV3Verifier');

const OPERATION = 'PULL_SOCIAL_HANDOFF_V3';
const RESPONSE_LIMIT = MAX_BYTES + (64 * 1024);
const UPSTREAM_TIMEOUT_MS = 20000;

class SocialHandoffStoreError extends Error {
  constructor(code, status = 500, details = {}) {
    super(code);
    this.name = 'SocialHandoffStoreError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function run(db, sql, params = []) {
  return new Promise((resolve, reject) => db.run(sql, params, function complete(error) {
    if (error) reject(error); else resolve({ changes: this.changes, lastID: this.lastID });
  }));
}

function get(db, sql, params = []) {
  return new Promise((resolve, reject) => db.get(sql, params, (error, row) => error ? reject(error) : resolve(row)));
}

function hash(value) {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

function assertConfiguration(env) {
  const endpoint = String(env.SOCIAL_HANDOFF_URL || '').trim();
  const secret = String(env.OMNISELLER_HANDOFF_TOKEN || '');
  const allowedSourceSha = String(env.SOCIAL_HANDOFF_ALLOWED_SOURCE_SHA || '').trim();
  const allowedDeploymentId = String(env.SOCIAL_HANDOFF_ALLOWED_DEPLOYMENT_ID || '').trim();
  let parsed;
  try { parsed = new URL(endpoint); } catch (_) {
    throw new SocialHandoffStoreError('SOCIAL_HANDOFF_CONFIGURATION_INVALID', 503);
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.hash || parsed.search
      || parsed.pathname !== '/api/integrations/omniseller/opportunities'
      || secret.length < 32 || !/^[a-f0-9]{40}$/.test(allowedSourceSha) || !allowedDeploymentId) {
    throw new SocialHandoffStoreError('SOCIAL_HANDOFF_CONFIGURATION_INVALID', 503);
  }
  return { endpoint: parsed.toString(), secret, allowedSourceSha, allowedDeploymentId };
}

function assertScope(scope) {
  if (!scope || !scope.tenantId || !Number.isInteger(Number(scope.actorId)) || scope.role !== 'OWNER') {
    throw new SocialHandoffStoreError('SOCIAL_HANDOFF_OWNER_SCOPE_REQUIRED', 403);
  }
}

function assertIdempotencyKey(value) {
  const key = String(value || '').trim();
  if (!/^[A-Za-z0-9._:-]{16,160}$/.test(key)) {
    throw new SocialHandoffStoreError('SOCIAL_HANDOFF_IDEMPOTENCY_KEY_REQUIRED', 400);
  }
  return key;
}

function abortError() {
  const error = new Error('SOCIAL_HANDOFF_UPSTREAM_TIMEOUT');
  error.name = 'AbortError';
  return error;
}

async function raceWithAbort(promise, signal) {
  if (signal.aborted) throw abortError();
  let onAbort;
  const aborted = new Promise((resolve, reject) => {
    onAbort = () => reject(abortError());
    signal.addEventListener('abort', onAbort, { once: true });
  });
  try {
    return await Promise.race([promise, aborted]);
  } finally {
    signal.removeEventListener('abort', onAbort);
  }
}

async function readBoundedResponse(response, signal) {
  const declared = Number(response.headers?.get?.('content-length'));
  if (Number.isFinite(declared) && declared > RESPONSE_LIMIT) {
    throw new SocialHandoffStoreError('SOCIAL_HANDOFF_RESPONSE_TOO_LARGE', 502);
  }
  if (response.body?.getReader) {
    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await raceWithAbort(reader.read(), signal);
        if (done) break;
        size += value.byteLength;
        if (size > RESPONSE_LIMIT) {
          await reader.cancel();
          throw new SocialHandoffStoreError('SOCIAL_HANDOFF_RESPONSE_TOO_LARGE', 502);
        }
        chunks.push(Buffer.from(value));
      }
    } finally {
      if (signal.aborted) {
        try { await reader.cancel(); } catch (_) {}
      }
      reader.releaseLock();
    }
    return Buffer.concat(chunks).toString('utf8');
  }
  const text = await raceWithAbort(response.text(), signal);
  if (Buffer.byteLength(text, 'utf8') > RESPONSE_LIMIT) {
    throw new SocialHandoffStoreError('SOCIAL_HANDOFF_RESPONSE_TOO_LARGE', 502);
  }
  return text;
}

async function existingReceipt(db, tenantId, idempotencyKey, requestHash) {
  const row = await get(db, `SELECT request_hash,response_json FROM external_research_handoff_receipts
    WHERE tenant_id=? AND operation=? AND idempotency_key=?`, [tenantId, OPERATION, idempotencyKey]);
  if (!row) return null;
  if (row.request_hash !== requestHash) {
    throw new SocialHandoffStoreError('SOCIAL_HANDOFF_IDEMPOTENCY_CONFLICT', 409);
  }
  return { ...JSON.parse(row.response_json), replay: true };
}

async function fetchEnvelope(config, fetchImpl, timeoutMs = UPSTREAM_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(config.endpoint, { method: 'GET', redirect: 'error', signal: controller.signal,
      headers: { Accept: 'application/json', 'x-omniseller-token': config.secret } });
    if (!response || response.status !== 200) {
      throw new SocialHandoffStoreError('SOCIAL_HANDOFF_UPSTREAM_REJECTED', 502,
        { upstreamStatus: response?.status || null });
    }
    const contentType = String(response.headers?.get?.('content-type') || '').toLowerCase();
    if (!contentType.startsWith('application/json')) {
      throw new SocialHandoffStoreError('SOCIAL_HANDOFF_UPSTREAM_CONTENT_TYPE_INVALID', 502);
    }
    return await readBoundedResponse(response, controller.signal);
  } catch (error) {
    if (error instanceof SocialHandoffStoreError) throw error;
    throw new SocialHandoffStoreError(controller.signal.aborted || error?.name === 'AbortError'
      ? 'SOCIAL_HANDOFF_UPSTREAM_TIMEOUT' : 'SOCIAL_HANDOFF_UPSTREAM_UNAVAILABLE', 502);
  } finally {
    clearTimeout(timeout);
  }
}

async function pullAndPersistSocialHandoff({ db, scope, idempotencyKey, env = process.env,
  fetchImpl = global.fetch, now = null, upstreamTimeoutMs = UPSTREAM_TIMEOUT_MS }) {
  assertScope(scope);
  const key = assertIdempotencyKey(idempotencyKey);
  const config = assertConfiguration(env);
  if (typeof fetchImpl !== 'function') throw new SocialHandoffStoreError('SOCIAL_HANDOFF_FETCH_UNAVAILABLE', 503);
  const requestHash = hash(JSON.stringify({ operation: OPERATION, tenantId: scope.tenantId,
    actorId: Number(scope.actorId),
    endpoint: config.endpoint, allowedSourceSha: config.allowedSourceSha,
    allowedDeploymentId: config.allowedDeploymentId }));
  const replay = await existingReceipt(db, scope.tenantId, key, requestHash);
  if (replay) return replay;

  const envelopeText = await fetchEnvelope(config, fetchImpl, upstreamTimeoutMs);
  const verificationNow = now === null || now === undefined ? new Date()
    : now instanceof Date ? now : new Date(now);
  let verified;
  try {
    verified = verifySocialHandoffV3(envelopeText, { secret: config.secret,
      allowedSourceSha: config.allowedSourceSha, allowedDeploymentId: config.allowedDeploymentId,
      now: verificationNow });
  } catch (error) {
    if (error?.code) throw new SocialHandoffStoreError(error.code, error.status || 422, error.details);
    throw error;
  }

  await run(db, 'BEGIN IMMEDIATE');
  try {
    const racedReplay = await existingReceipt(db, scope.tenantId, key, requestHash);
    if (racedReplay) { await run(db, 'COMMIT'); return racedReplay; }
    const nonce = await get(db, 'SELECT id FROM external_research_handoff_nonces WHERE source_system=? AND nonce=?',
      [verified.envelope.sourceSystem, verified.nonce]);
    if (nonce) throw new SocialHandoffStoreError('SOCIAL_HANDOFF_NONCE_REPLAY', 409);
    const receivedAt = verificationNow.toISOString();
    const artifactInsert = await run(db, `INSERT OR IGNORE INTO external_research_handoffs
      (tenant_id,source_system,schema_version,source_git_sha,source_deployment_id,artifact_issued_at,payload_json,
       source_artifact_hash,source_artifact_bytes,authority_classification,market_validation_capability,
       first_received_by,first_received_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`, [scope.tenantId, verified.envelope.sourceSystem,
      verified.envelope.schemaVersion, verified.envelope.sourceRelease.gitSha,
      verified.envelope.sourceRelease.deploymentId, verified.issuedAt, JSON.stringify(verified.payload),
      verified.artifact.sha256, verified.artifact.bytes, verified.envelope.authority.classification,
      verified.envelope.marketValidationCapability, Number(scope.actorId), receivedAt]);
    const artifact = await get(db, `SELECT id FROM external_research_handoffs
      WHERE tenant_id=? AND source_system=? AND source_artifact_hash=?`,
    [scope.tenantId, verified.envelope.sourceSystem, verified.artifact.sha256]);
    if (!artifact) throw new SocialHandoffStoreError('SOCIAL_HANDOFF_ARTIFACT_PERSIST_FAILED', 500);
    const nonceInsert = await run(db, `INSERT INTO external_research_handoff_nonces
      (tenant_id,source_system,handoff_id,nonce,issued_at,expires_at,envelope_json,envelope_hash,
       transport_digest,signature,received_by,received_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`, [scope.tenantId, verified.envelope.sourceSystem, artifact.id,
      verified.nonce, verified.issuedAt, verified.expiresAt, envelopeText, verified.envelopeHash,
      verified.envelope.transportDigest, verified.signature, Number(scope.actorId), receivedAt]);
    const response = { success: true, replay: false, artifactReused: artifactInsert.changes === 0,
      handoff: { id: artifact.id, nonceReceiptId: nonceInsert.lastID,
      schemaVersion: verified.envelope.schemaVersion, sourceSystem: verified.envelope.sourceSystem,
      sourceRelease: verified.envelope.sourceRelease, artifactHash: verified.artifact.sha256,
      envelopeHash: verified.envelopeHash, authority: verified.envelope.authority,
      marketValidationCapability: verified.envelope.marketValidationCapability, receivedAt } };
    await run(db, `INSERT INTO external_research_handoff_receipts
      (tenant_id,operation,idempotency_key,request_hash,response_json,handoff_id,nonce_id,created_by,created_at)
      VALUES (?,?,?,?,?,?,?,?,?)`, [scope.tenantId, OPERATION, key, requestHash, JSON.stringify(response),
      artifact.id, nonceInsert.lastID, Number(scope.actorId), receivedAt]);
    await run(db, `INSERT INTO audit_events
      (tenant_id,actor_id,workspace_id,marketplace,action,resource_type,resource_id,outcome,content_hash,metadata)
      VALUES (?,?,?,?,?,?,?,?,?,?)`, [scope.tenantId, Number(scope.actorId), scope.workspaceId || null,
      scope.marketplace || null, 'social-handoff-v3:pull', 'external_research_handoff', String(artifact.id),
      'SUCCESS', verified.artifact.sha256, JSON.stringify({ classification: 'RESEARCH_ONLY',
        marketValidationCapability: 'NOT_CONNECTED', sourceGitSha: verified.envelope.sourceRelease.gitSha,
        sourceDeploymentId: verified.envelope.sourceRelease.deploymentId, envelopeHash: verified.envelopeHash,
        nonceReceiptId: nonceInsert.lastID, artifactReused: artifactInsert.changes === 0 })]);
    await run(db, 'COMMIT');
    return response;
  } catch (error) {
    try { await run(db, 'ROLLBACK'); } catch (_) {}
    throw error;
  }
}

module.exports = Object.freeze({ OPERATION, UPSTREAM_TIMEOUT_MS, SocialHandoffStoreError,
  pullAndPersistSocialHandoff });
