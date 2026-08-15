# PR-2A.1: COMPLETE SECURITY CONTRACT & SCHEMAS SPECIFICATION

> **Document Version**: 2.1.0 (PR-2A.1 Complete Security Contract)  
> **Repository Tracked File**: `PR2_SECURITY_SPECIFICATION.md`  
> **Prepared For**: OmniSeller Studio Security Architecture Gating  
> **Baseline Commit**: `e966ca7`  

---

## 1. TECHNICAL SECURITY CONTRACTS (A1 - A10)

### A1. Cookie & Transport Policy
- **Cookie Name**: `omni_session` (or `__Host-omni_session` in HTTPS environments).
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

### A5. Tenant & Marketplace Isolation (IDOR Protection)
- All SQL queries strictly enforce:
  ```sql
  SELECT * FROM listings 
  WHERE id = :id AND tenant_id = :tenant_id AND marketplace = :marketplace;
  ```
- Unauthorized or cross-tenant resource access attempts return `404 Not Found` (fail closed, zero resource enumeration).

### A6. Canonical Payload Serialization & SHA-256 Test Vector
- Canonical String Rules:
  1. Recursively sort all object keys lexicographically.
  2. Normalize all strings using `Unicode NFC` (`String.prototype.normalize('NFC')`).
  3. Exclude volatile metadata keys (`id`, `created_at`, `updated_at`, `status`).
  4. Serialize using `JSON.stringify()`.
- SHA-256 Hash Vector Example:
  ```javascript
  // Input Object:
  const rawPayload = { etsyTitle: "Custom Necklace", amazonTitle: "Custom Gold Necklace" };
  // Canonical Serialized Output:
  // '{"amazonTitle":"Custom Gold Necklace","etsyTitle":"Custom Necklace"}'
  // Expected SHA-256 Hash:
  // "a64f89d31d99d146200234a66a7b6e92750e32ef7a2249e0b19688d227f4d2f8"
  ```

### A7. Optimistic Concurrency & Immutable Approval Snapshot
- `listings` Table Schema Addition: `listing_version INTEGER DEFAULT 1`.
- Transactional Approval:
  ```sql
  UPDATE listings 
  SET status = 'PUBLISH_READY', 
      approved_by = :userId, 
      approved_at = CURRENT_TIMESTAMP, 
      approved_hash = :payloadHash, 
      listing_version = listing_version + 1 
  WHERE id = :id AND listing_version = :expectedVersion;
  ```
- Stale version or hash mismatch on export returns `412 Precondition Failed` or `409 Conflict`.

### A8. API Key Encryption-at-Rest
- Stored keys use **AES-256-GCM**: `encrypted_key`, `iv` (12 bytes), `auth_tag` (16 bytes).
- Master encryption key passed via `ENCRYPTION_SECRET` environment variable (never stored in SQLite).
- `GET /api/settings` returns masked metadata (`sk-***1234`) and provider name only. Plaintext key is write-only (`POST /api/settings`).

### A9. Admin Reset Protection Protocol
- Disabled by default (`ENABLE_ADMIN_RESET === 'true'`).
- Requires:
  1. Authenticated `OWNER` session with recent re-auth ($\le 15$ mins old).
  2. Short-lived one-time confirmation token (`reset_nonce`).
  3. Explicit typed payload string `"DELETE_DATABASE_PERMANENTLY"`.

### A10. Append-Only Audit Log Schema
- `audit_events` Table Schema:
  ```sql
  CREATE TABLE IF NOT EXISTS audit_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id INTEGER NOT NULL,
    actor_id INTEGER NOT NULL,
    action TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    resource_id TEXT NULL,
    outcome TEXT NOT NULL,
    ip_address TEXT NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    metadata TEXT NULL
  );
  ```
- Application code contains zero `UPDATE` or `DELETE` queries targeting `audit_events`.

---

## 2. EXECUTABLE ACCEPTANCE TEST MATRIX

| Test File Name | Target Security Scenario | Expected Status / Outcome |
| :--- | :--- | :--- |
| `tests/sec_auth_session.test.js` | Missing or revoked session cookie | `401 Unauthorized` |
| `tests/sec_csrf_origin.test.js` | Mutation POST without valid Origin | `403 Forbidden` |
| `tests/sec_rbac_roles.test.js` | SELLER role calling `listing:approve` | `403 Forbidden` |
| `tests/sec_tenant_idor.test.js` | Tenant A requesting Tenant B listing ID | `404 Not Found` |
| `tests/sec_payload_tamper.test.js` | Export listing modified after approval | `412 Precondition Failed` |
| `tests/sec_secret_masking.test.js` | GET `/api/settings` secret key check | Masked key only (`sk-***1234`) |
