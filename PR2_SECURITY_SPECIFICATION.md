# PR-2: REAL AUTHENTICATION & SERVER-DERIVED RBAC SPECIFICATION

> **Document Version**: 2.0.0 (PR-2A Versioned Security Specification)  
> **Repository Tracked File**: `PR2_SECURITY_SPECIFICATION.md`  
> **Prepared For**: OmniSeller Studio Production Security Architecture  
> **Baseline Commit**: `ed6620a`  

---

## 1. THREAT MODEL & HARD SECURITY POSTURES

1. **Zero Client-Asserted Privilege**: `req.body.userRole`, `req.body.userId`, or `req.body.tenantId` is **100% IGNORED** by all authorization middleware.
2. **Server-Derived Identity (`SEC-01`)**: Authenticated principal `req.user` is derived exclusively from an opaque server-side session token stored in an `HttpOnly`, `SameSite=Lax`, `Path=/` cookie (`omni_session`).
3. **Cookie Policy & CSRF Protection (`SEC-02`)**:
   - `HttpOnly: true`, `SameSite: Lax`, `Path: /`, `Max-Age: 86400` (24 hours).
   - State-changing endpoints (`POST`, `PATCH`, `PUT`, `DELETE`) perform Origin & Referer header verification.
4. **Password Security (`SEC-03`)**: Passwords hashed using Node.js native `crypto.scrypt` with random 16-byte salt. Generic auth errors to prevent account enumeration.
5. **Tenant & Marketplace Isolation (`SEC-04`)**: All queries strictly enforce `WHERE tenant_id = req.user.tenant_id AND marketplace = :marketplace`.
6. **Action-Based Permission Mapping (`SEC-05`)**: Authorization checks explicit permissions (`listing:approve`, `listing:export`, `settings:write`), mapped from server roles (`OWNER`, `MANAGER`, `SELLER`).
7. **Canonical Payload Serialization & Hashing (`SEC-06`)**:
   - Canonical SHA-256 hash computed using deterministic key sorting, excluding volatile timestamps.
8. **Optimistic Concurrency Control (`SEC-07`)**: Listings track `listing_version`. Approving or mutating increments `listing_version`. Approval hash is bound to exact `listing_version`.
9. **Masked Write-Only Secrets (`SEC-08`)**: API settings endpoints return masked keys (`sk-***1234`). Plaintext secrets are never serialized.
10. **Protected Admin Reset (`SEC-09`)**: Database reset disabled by default; requires recent re-authentication and explicit confirmation token.
11. **Append-Only Audit Logging (`SEC-10`)**: All auth, approval, export, and settings events logged to `audit_events` table.

---

## 2. ROLE & PERMISSION MATRIX (`SEC-05`)

| Permission Action | OWNER | MANAGER | SELLER | Public |
| :--- | :---: | :---: | :---: | :---: |
| `auth:login` | ✅ | ✅ | ✅ | ✅ |
| `auth:me` | ✅ | ✅ | ✅ | ❌ |
| `listing:read` | ✅ | ✅ | ✅ (Own Tenant) | ❌ |
| `listing:draft` | ✅ | ✅ | ✅ | ❌ |
| `listing:approve` | ✅ | ✅ | ❌ | ❌ |
| `listing:export` | ✅ | ✅ | ❌ | ❌ |
| `settings:read` | ✅ | ❌ | ❌ | ❌ |
| `settings:write` | ✅ | ❌ | ❌ | ❌ |
| `admin:reset` | ✅ (Re-auth) | ❌ | ❌ | ❌ |

---

## 3. MANDATORY ACCEPTANCE TEST SUITE MATRIX

```javascript
// Test 1: Unauthenticated request to sensitive route -> 401 Unauthorized
// Test 2: Forged userRole in request body -> Ignored, 403 Forbidden if unprivileged
// Test 3: Expired or revoked session -> 401 Unauthorized
// Test 4: Missing CSRF Origin header on mutation -> 403 Forbidden
// Test 5: Seller role attempting listing:approve -> 403 Forbidden
// Test 6: IDOR cross-tenant access attempt -> 404 / 403 Forbidden
// Test 7: Approval hash mismatch on payload edit -> 400 Approval Invalidated
// Test 8: Settings GET endpoint -> Returns masked key only, no plaintext
```
