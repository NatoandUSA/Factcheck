# PR-2A.3: PRODUCTION CANONICALIZER ENGINE & WORKSPACE AUTHORITY SPECIFICATION

> **Document Version**: 2.3.0 (PR-2A.3 Complete Production Specification)  
> **Repository Tracked File**: `PR2_SECURITY_SPECIFICATION.md`  
> **Production Module**: `server/security/canonicalize.js`  
> **Prepared For**: OmniSeller Studio Security Architecture Gating  
> **Baseline Commit**: `10030bc`  

---

## 1. TECHNICAL SECURITY CONTRACTS (A1 - A10)

### A1. Cookie & Transport Policy
- **Cookie Name**: `omni_session` in development; `__Host-omni_session` in HTTPS production environments.
- **Attributes**: `HttpOnly: true`, `SameSite: Lax`, `Path: /`, `Secure: process.env.NODE_ENV === 'production'`, `Max-Age: 86400` (24h).

### A2. CSRF & Origin Validation
- State-changing HTTP methods (`POST`, `PATCH`, `PUT`, `DELETE`) require `Origin` or `Referer` headers matching the configured host allowlist.
- Requests with missing or mismatching headers fail closed with `403 Forbidden`.

### A3. Server-Side Session Schema & Lifecycle
- Raw session tokens are 32-byte cryptographically secure random buffers (`crypto.randomBytes(32).toString('hex')`).
- Only SHA-256 hashes of session tokens are stored in the database (`token_hash = crypto.createHash('sha256').update(rawToken).digest('hex')`).
- `sessions` Table Schema:
  ```sql
  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token_hash TEXT NOT NULL UNIQUE,
    user_id INTEGER NOT NULL,
    tenant_id INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    revoked_at TIMESTAMP NULL,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );
  ```

### A4. Scrypt Password Hashing & Timing-Safe Verification
- Scrypt Parameters: `N = 16384` (cost), `r = 8` (blockSize), `p = 1` (parallelization), `keyLen = 64`, `saltLen = 16`.
- Storage Format: `scrypt$v1$N=16384,r=8,p=1$<salt_hex>$<hash_hex>`.
- Password verification uses `crypto.timingSafeEqual` to prevent timing attacks.
- Failed logins execute a dummy scrypt computation for unknown emails to eliminate user enumeration.

### A5. Workspace, Membership & Marketplace Authority (`C5`)
- `workspaces` Table Schema:
  ```sql
  CREATE TABLE IF NOT EXISTS workspaces (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
  ```
- `workspace_memberships` Table Schema:
  ```sql
  CREATE TABLE IF NOT EXISTS workspace_memberships (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    workspace_id INTEGER NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('OWNER', 'MANAGER', 'SELLER')),
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, workspace_id)
  );
  ```
- Queries enforce tenant & marketplace boundaries:
  ```sql
  SELECT * FROM listings 
  WHERE id = :id AND tenant_id = :tenant_id AND marketplace = :marketplace;
  ```
- Unauthorized or cross-tenant resource access attempts return `404 Not Found` (fail closed, zero resource enumeration).

### A6. Production Canonical Serializer Engine (`server/security/canonicalize.js`)
- Canonical Serialization Rules:
  1. Omit volatile metadata keys (`id`, `dbId`, `status`, `created_at`, `updated_at`, `approved_by`, `approved_at`, `approved_hash`, `approved_version`, `listing_version`).
  2. Recursively sort all object keys lexicographically.
  3. Normalize all strings using `Unicode NFC` (`String.prototype.normalize('NFC')`).
  4. Serialize using `JSON.stringify()`.
- Verified SHA-256 Hash Test Vector (Executed in `tests/spec_hash_vector.test.cjs`):
  ```javascript
  // Input Object:
  const rawPayload = { etsyTitle: "Custom Necklace", amazonTitle: "Custom Gold Necklace" };
  // Canonical Serialized Output:
  // '{"amazonTitle":"Custom Gold Necklace","etsyTitle":"Custom Necklace"}'
  // Verified SHA-256 Digest:
  // "a23b2bb28abada601767405c429c1a1cd821a407683e3c6f8c26993d9cd71d4c"
  ```

### A7. Optimistic Concurrency & Approval Invariants
- `listings` Table Schema: `listing_version INTEGER DEFAULT 1`, `approved_version INTEGER NULL`, `approved_hash TEXT NULL`.
- Approval Invariant: Approval sets `approved_version = listing_version` and stores `approved_hash`. **Approval DOES NOT increment `listing_version`**.
- Transactional Approval SQL:
  ```sql
  UPDATE listings 
  SET status = 'PUBLISH_READY', 
      approved_by = :userId, 
      approved_at = CURRENT_TIMESTAMP, 
      approved_version = listing_version,
      approved_hash = :payloadHash
  WHERE id = :id AND tenant_id = :tenantId AND marketplace = :marketplace AND listing_version = :expectedVersion;
  ```
- Any content mutation increments `listing_version`, which automatically invalidates approval (`approved_version !== listing_version`).
- HTTP Error Semantics:
  - `412 Precondition Failed` for stale `expectedVersion` concurrency mismatch.
  - `409 Conflict` for export attempt on listing modified post-approval.

### A8. AES-256-GCM API Key Encryption-at-Rest (`C6`)
- Stored keys use **AES-256-GCM**: `encrypted_key`, `iv` (12 random bytes), `auth_tag` (16 bytes).
- Master encryption key passed via 32-byte base64-decoded `OMNI_MASTER_KEY` environment variable (implemented in `server/security/secretBox.js`; throws if unset).
- Additional Authenticated Data (AAD) bound to tenant/workspace/key context.
- `GET /api/settings` returns masked metadata (`sk-***1234`) and provider name only. Plaintext key is write-only (`POST /api/settings`).

### A9. Admin Reset Protection Protocol
- Requires (implemented in `server/server.js`, `DELETE /api/reset-database`):
  1. Authenticated `OWNER` session with recent re-auth via `POST /api/auth/reauth` (5-minute nonce TTL, `REAUTH_TTL_MS`).
  2. Short-lived one-time confirmation nonce, consumed via `x-reset-nonce` header.
  3. Explicit typed payload string `"RESET <workspaceId>"`.
- Scoped to the caller's `tenant_id`/`workspace_id`/`marketplace` — not a full database wipe.

### A10. Append-Only Audit Log Schema (`C7`)
- `audit_events` Table Schema (as implemented in `server/server.js`):
  ```sql
  CREATE TABLE IF NOT EXISTS audit_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id TEXT,
    actor_id INTEGER,
    action TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    resource_id TEXT NULL,
    outcome TEXT NOT NULL,
    ip_address TEXT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    metadata TEXT NULL
  );
  ```
  `tenant_id`/`actor_id` are nullable to allow pre-authentication events (e.g. failed login attempts).
- Application code contains zero `UPDATE` or `DELETE` queries targeting `audit_events`.

---

## 2. ROLE & PERMISSION MATRIX (SEC-05 RESTORED)

| Permission Action | OWNER | MANAGER | SELLER | Public |
| :--- | :---: | :---: | :---: | :---: |
| `auth:login` | ✅ | ✅ | ✅ | ✅ |
| `auth:me` | ✅ | ✅ | ✅ | ❌ |
| `listing:read` | ✅ | ✅ | ✅ (Own Workspace) | ❌ |
| `listing:draft` | ✅ | ✅ | ✅ | ❌ |
| `listing:approve` | ✅ | ✅ | ❌ | ❌ |
| `listing:export` | ✅ | ✅ | ❌ | ❌ |
| `settings:read` | ✅ | ❌ | ❌ | ❌ |
| `settings:write` | ✅ | ❌ | ❌ | ❌ |
| `admin:reset` | ✅ (Re-auth) | ❌ | ❌ | ❌ |

---

## 3. EXECUTABLE SPECIFICATION SUITE

| Test File Path | Tested Security / Functional Invariant | Verification Engine | Expected Result |
| :--- | :--- | :--- | :--- |
| `tests/spec_hash_vector.test.cjs` | Production `canonicalize.js` SHA-256 Vector, Nested Sort, NFC, Volatiles | `assert.strictEqual` | `🟢 4/4 CANONICAL INVARIANTS PASSED` |
| `tests/test_real_child_asin_batcher.cjs` | 3x10 ASIN Invariant | Executable Assertion | `🟢 30 ASINs PASSED` |
| `tests/test_strict_keyword_sanitizer.cjs` | Garbage Keyword Filter | Executable Assertion | `🟢 0 Garbage PASSED` |
| `tests/test_full_cerebro_mkl_flow.cjs` | Tracked Cerebro Upload & DB | In-process Server + Fixture | `🟢 27,018 Rows PASSED` |
| `tests/test_white_screen_failsafe.cjs` | Zero-Crash Render Safeguard | Executable Assertion | `🟢 0 Crashes PASSED` |
