# OMNISELLER / FACTCHECK — P0 RE-AUDIT AT EXACT SHA

**Auditor:** Claude (implementation/audit agent)
**Date:** 2026-08-17
**Repository:** `NatoandUSA/Factcheck`
**Branch:** `main`
**Exact SHA audited:** `0433323d05382328e08f11fcd9794f0d071c6fa4`
**Scope:** Track S (Safety/Trust) P0 + P0.5 verification per PROJECT_GUIDE §7 and §8. No code was modified.

---

## 0. BASELINE VERIFICATION

| Claim | Evidence | Label |
|---|---|---|
| `main` = `0433323d0538…` | `git log -1` on fresh clone | `CLAUDE-LIVE-VERIFIED` |
| CI run `31992003648` = SUCCESS for that exact SHA | GitHub Actions API, `head_sha` matched | `CLAUDE-LIVE-VERIFIED` |
| `npm test` passes on clean checkout | Ran locally, Node v22.22.2 → **8/8 test files passed** | `CLAUDE-LIVE-VERIFIED` |
| Local `D:\Claude\Factcheck` == repo `main` | Byte-compared `server.js`, `learningService.js`, `migrations.js`, `package.json` after CRLF normalization → identical | `CLAUDE-LIVE-VERIFIED` |
| Security Issue #3 status | GitHub issues API call did not return a parseable list in this session | `NOT VERIFIED` |

> **CI GREEN is real, and it certifies nothing about the findings below.** Section 3 shows one test that actively certifies fabricated data as a passing feature.

---

## 1. P0-A — ROUTE CLASSIFICATION IS NOT CLOSED

`server/server.js` declares **43** `app.*` route handlers. **24 of them have no `requireAuth`.** There is no route registry, no decorator, no CI check for unclassified operational routes. PROJECT_GUIDE §7 is therefore **NOT SATISFIED**.

The only global control is `app.use(requireCsrfOrigin)` at `server.js:47`. That is an *Origin/Referer header check*. It stops a browser on evil.com. It does **not** stop `curl -H "Origin: http://localhost:5173"`. It is not an authentication control and must not be counted as one.

### Unauthenticated operational routes (severity-ordered)

| Route | Line | Why it matters |
|---|---|---|
| `POST /api/learning/analyze` | 1236 | **SSRF + unauth write.** See §2. |
| `DELETE /api/learning/templates/:id` | 1290 | **Destructive, unauth, no workspace scope.** `DELETE FROM learned_templates WHERE id = ?` — any ID, any workspace. |
| `POST /api/agents/:id/toggle` | 2372 | **Unauth agent control.** Flips agents ONLINE → background timer starts making outbound MCP/network calls on your behalf. |
| `POST /api/upload-h10` | 1987 | **Unauth file upload** → `upload.any()`, parses spreadsheet, `INSERT INTO market_trends`. Poisons the keyword source of truth. |
| `POST /api/upload-trends` | 1988 | Same handler, same exposure. |
| `POST /api/mcp/call` | 850 | **Unauth arbitrary MCP tool invocation** with attacker-controlled `toolName` + `args`. |
| `POST /api/mcp/pull-etsy` | 874 | Unauth external call + DB write + fabricated fallback (§3). |
| `POST /api/etsy/scan-search` | 1299 | Unauth external call. |
| `GET /api/master-keywords` | 1698 | Unauth read of your keyword research. |
| `GET /api/trends`, `/api/analytics`, `/api/agents`, `/api/agents/logs`, `/api/benchmark/validate`, `/api/google-trends`, `/api/ip-guard/library`, `/api/mcp/tools`, `/api/mcp/niche`, `/api/mcp/h10/*`, `/api/learning/templates` | various | Unauth read surfaces; no workspace scoping. |

**What IS correctly protected** (credit where due): all `/api/listings*` routes, `/api/asins/batch`, `/api/analytics-summary`, `/api/trends/:id/draft`, `/api/chat`, `/api/settings/*`, `/api/ip-guard/custom-term`, `/api/etsy/batch-learn`, `/api/amazon/quick-draft` — all carry `requireAuth` + `requireRole`. `DELETE /api/reset-database` is properly gated (OWNER + re-auth nonce + typed confirmation + workspace-scoped delete, not a full wipe). `POST /api/login` correctly returns 410.

The pattern is clear: **listing/approval surfaces were hardened in PR-2B/2C; the research, ingestion, learning and agent surfaces were never brought into that pass.** That is the same bug class, unfinished.

---

## 2. P0-B — SSRF IS OPEN AND EXPLOITABLE (LIVE PoC EXECUTED)

**File:** `server/learningService.js:21`
**Route:** `POST /api/learning/analyze` (unauthenticated)

```js
if (extractedUrl.startsWith('http')) {
  const response = await fetch(extractedUrl, { headers: { 'User-Agent': '…' } });
  const html = await response.text();
  const $ = cheerio.load(html);
  title = $('#productTitle').text().trim() || $('h1').first().text().trim();
  description = $('#productDescription').text().trim() || …
```

Against PROJECT_GUIDE §7 SSRF policy — **every single control is missing:**

| Required control | Present? |
|---|---|
| HTTPS-only / scheme allowlist | ❌ (`http://` accepted) |
| Host/destination allowlist | ❌ |
| Reject loopback | ❌ |
| Reject RFC1918 private IPs | ❌ |
| Reject link-local (169.254.x) / cloud metadata | ❌ |
| Reject reserved/multicast | ❌ |
| IPv6 validation | ❌ |
| Redirect validation | ❌ (fetch follows redirects by default) |
| Timeout | ❌ (no `AbortSignal`) |
| Response size cap | ❌ (unbounded `.text()`) |
| Safe error messages | ❌ (`err.message` returned to caller at `server.js:1261`) |

### Executed proof — `CLAUDE-LIVE-VERIFIED`

Local victim service on `127.0.0.1:9911` returning `<h1>INTERNAL-SECRET-TOKEN-abc123</h1>`, then:

```
learnFromListing({ url: 'http://127.0.0.1:9911/latest/meta-data/', marketplace: 'AMAZON' })
→ title       = "INTERNAL-SECRET-TOKEN-abc123"
→ description = "private metadata body"
```

This is **not blind SSRF**. Response content is reflected to the caller *and* persisted into `learned_templates`. On any deployed host this reads loopback services, private-network hosts, and (on a cloud VM) the instance metadata endpoint — including credentials. It is reachable without a session.

**`server/benchmarkService.js:34` is NOT SSRF** — hardcoded `completion.amazon.com` host, seed is URL-encoded into the query only. No action needed there.

---

## 3. P0.5 — DATA-TRUTH VIOLATIONS: THE SYSTEM FABRICATES BUSINESS SIGNAL

This is the finding I'd rank most damaging to *your actual business decisions*, because unlike the security issues it is silently wrong every day you use the tool.

PROJECT_GUIDE §17 forbids: *"treat missing data as zero"*, *"default fake data to keep screens populated"*. Four live violations:

### 3.1 Invented Etsy search volume — `server.js:884`
```js
const overview = mcpData?.data?.overview || { search_volume: 12500, competition: 'Medium' };
```
MCP unreachable → invents `search_volume: 12500`, `competition: 'Medium'`, writes it to `market_trends`, shows it to staff as research. **Must be `UNKNOWN`.**

### 3.2 Fabricated competitor catalog — `server/asinBatcher.js:13-58`
A hardcoded array labelled *"Real Active Amazon US Child ASIN Catalog (Extracted from real Amazon search results)"* with per-ASIN `price` and `sales` figures. It contains obviously synthetic entries: **`B0D9999AAA`** and **`B0D8888BBB`**. It is injected whenever `rawRows.length < 10`. Also line 66: pasted ASIN strings are assigned `Price: 29.99, Sales: 350` out of thin air.

Consequence: you can look at an ASIN batch screen showing competitor sales of 830/mo that were never observed anywhere.

### 3.3 Simulated Google Trends — `server/googleTrendsService.js:83-112`
On API failure, generates a sine-wave timeline from `seed.length`, returns `momentumPercent: 28` and invented related queries (`+120%`, `+85%`). Only tell is a `(REF)` suffix in a badge string — no provenance field, no `MODELED` flag.

### 3.4 Missing → zero, and a magic 50 — `server.js:1892-1907`
```js
const searchVolume = volKey && Number(r[volKey]) ? Number(r[volKey]) : 0;
…
} else { opportunityScore = 50; }   // no volume data → score 50 anyway
```

### The test suite certifies the fabrication
`tests/test_white_screen_failsafe.cjs` output, verbatim from my run:
```
🟢 Case 2: Empty Batches Array: PASSED (0 Crashes, Batches Output: 1)
🟢 Case 4: Malformed Data (null/undefined): PASSED (0 Crashes, Batches Output: 1)
```
Given **null input**, the system emits **one batch of data** — and that is asserted as the desired outcome. This is the mechanism by which "CI GREEN" is currently laundering fabricated data into staff-facing screens. Any fix to §3.2 will require rewriting this test's expectation to `UNKNOWN / 0 batches + explicit reason`.

---

## 4. VERDICT

**PARTIALLY_RESOLVED.**

- Identity/session/approval/workspace-isolation core (PR-2B/2C): **strong, well-built, keep it.** Scrypt params, token hashing, canonical hash + optimistic concurrency, 404-on-cross-tenant, append-only audit, AES-256-GCM secrets, re-auth-gated scoped reset — all present and correct as specified.
- PROJECT_GUIDE §7 route classification: **NOT SATISFIED** (24/43 unauthenticated, no registry, no CI gate).
- PROJECT_GUIDE §7 SSRF policy: **NOT SATISFIED** (0/11 controls, exploit executed).
- PROJECT_GUIDE §8 ingestion truth: **NOT SATISFIED** (no raw observation table, no `observed_at`/`imported_at` split, no `content_hash`; and active fabrication).

Per §19, the **NO-GO / DELAY** condition on Omni consolidation holds. Correctly so.

---

## 5. BEST NEXT MOVE — EXACTLY ONE

### 🔴 P0 — One PR: `fix/p0-ssrf-and-route-classification`

Single purpose, per §14. Two tightly-coupled halves:

**(a) `server/security/urlGuard.js` (new, ~80 lines)**
`assertSafeUrl(url)` → HTTPS-only; hostname allowlist (`amazon.com`, `www.amazon.com`, `etsy.com`, `www.etsy.com` + subdomains); DNS-resolve and reject loopback / RFC1918 / link-local / metadata / reserved / multicast, IPv4 **and** IPv6; `redirect: 'manual'` with re-validation on each hop; `AbortSignal.timeout(8000)`; 2 MB streamed response cap; generic `URL_NOT_ALLOWED` error to the caller. Call it in `learningService.js` before `fetch`. Negative tests for every rejected class.

**(b) Route registry**
One exported table mapping every route → `{ requires_auth, allowed_roles, requires_workspace, marketplace_scope, action_type, public }`. Apply `requireAuth`/`requireRole` to the 24 unprotected routes (uploads, agent toggle, template delete, MCP call, learning analyze first). Add a test that walks Express's router stack and **fails if any route is absent from the registry** — that's what stops this bug class recurring, and it belongs in `npm test` so CI enforces it.

### 🟠 P1 — `fix/p0.5-unknown-not-fabricated`
Delete `REAL_CHILD_ASIN_CATALOG` injection, delete the `12500` fallback, mark the Google Trends simulation `provenance: 'MODELED'` or remove it, replace `: 0` with `null`, and rewrite `test_white_screen_failsafe.cjs` to assert *"renders UNKNOWN state without crashing"* instead of *"outputs 1 batch"*. **This one directly protects your Amazon embroidery launch decisions** — it is arguably worth more to you than P0, but P0 first because the SSRF is a live remote hole.

### 🟡 P2 — raw observation table (§8)
`raw_observations` with `source, provider, workspace_id, marketplace, observed_at, imported_at, content_hash, http_status, elapsed_ms, response_size, raw_ref, parse_status`. Only after P0/P1.

### ⛔ Not now
Anything in Track C. And per §12: **none of this should stall the Etsy first-sale path or the Amazon embroidery launch** — those run in parallel on Track R.

---

## 6. WHAT I DID NOT VERIFY

- GitHub Issue #3 current state (API listing unparsed this session).
- Frontend (`src/**`) — not audited; §10 "UI must not recompute readiness" is **NOT VERIFIED**.
- Whether the app is exposed beyond localhost in your actual deployment. If it is only ever bound to `127.0.0.1` on your PC, the route-auth findings drop in urgency — **the SSRF does not**, because it is triggered by anything that can reach the local port, including a browser page you have open.
- `.env` contents / whether `OMNI_MASTER_KEY` is set in production.
- Parity of Factcheck logic against `D:\Claude\22etsy-agent` and `D:\Claude\Amazon` (PROJECT_RULES Golden Rule 4).
