# OmniSeller R3 — G3 Integration Candidate Receipt

Date: 2026-09-09 (Asia/Bangkok)  
Branch: `codex/omniseller-r3-c3-integration`  
Base: `675e8cc324671b669c7bd051c8b52874ba090407`  
Status: **CHECKPOINT ONLY — CHANGES REQUESTED — DO NOT MERGE OR DEPLOY**

## Implemented in this candidate

- Server-owned Product Truth attestation on the existing canonical `listings` row.
- Exact tenant/workspace/marketplace/listing/version binding to a successful audit event and content hash.
- Seller may assert facts or explicitly mark fields UNKNOWN; the server creates evidence identity and authority metadata.
- Product fact authority survives an IP-blocked revision so staff can remove the protected content; approval/export still re-screen IP.
- C2 claim guard runs on visible copy, backend terms, PPC accounting and nested image prompts.
- Canonical C2 IP matcher is the only matcher behind the legacy-compatible `ipGuard` API.
- Client policy/clearance/approval-shaped fields are rejected or ignored as authority.
- Quick Draft and Trend Draft update and rebind the same canonical Product Truth listing instead of creating orphan rows.
- Etsy Batch Learn returns zero-authority research output and no longer inserts a canonical listing.
- Browser batch CSV download obtains every row through the gated server export endpoint.
- Browser modules are genuine ESM and no longer execute CommonJS `require()` in Vite.

## Proved green on the current Windows host

- Production build: PASS, 2,425 modules transformed.
- Route registry: PASS, 60 discovered / 56 authenticated non-public routes.
- C2 claims: 18/18 PASS.
- C2 IP matcher: 12/12 PASS.
- C3 HTTP/SQLite integration: 6/6 PASS.
- C3 Product Truth normalization/hash: 4/4 PASS.
- Security/workspace suite: 18/18 PASS.
- Publish integrity: 46/46 PASS.
- Real Cerebro fixture: 27,018 parsed rows / 25,049 canonical persisted rows; PASS.
- Xray persistence: 47/47 PASS.
- Production build and all separately rerun post-Vite suites: PASS except the Windows process-tree case below.

## Honest aggregate from the 69-file inventory

The canonical runner was interrupted after its Windows Vite child-process cleanup hung. Combining the runner output through file 60 with explicit execution of files 61–69 gives:

```text
total inventory: 69
proved passing: 64
known environment/harness failures: 5
unexecuted after separate rerun: 0
```

Known failures:

1. `test_adversarial_staff_ui_flow.cjs`: live YTrends/Etsy MCP provider unavailable; server correctly returns 503 without fallback fabrication.
2. `test_multi_project_attribution.cjs`: same unavailable provider expectation mismatch.
3. `test_runner_accounting.cjs`: Windows descendant-process isolation limitation.
4. `test_vite_dev_runtime_smoke.test.cjs`: Vite serves/builds, but Windows test cleanup hangs on the process tree.
5. `test_vite_process_shutdown.cjs`: Windows `taskkill` process-tree cleanup returns failure after the leader exits.

These are not counted as product-flow PASS. The staff browser journey is also not certified: the browser-control service rejected local browser startup because the account tool quota was exhausted. No workaround was used.

## Mandatory remaining work before G3 acceptance

- Implement and certify G2 append-only `listing_revisions`, `creative_revisions` and idempotent write receipts before treating version increments as immutable history.
- Install a server-derived C1 runtime policy registry with Owner-confirmed seller-account/category contracts and decision-time lifecycle snapshots. Public/draft fixtures cannot authorize approval/export.
- Remove duplicate numerical authority from the legacy publish gate after the canonical policy cutover.
- Complete Node 22 clean Linux install/build/migration/rollback certification.
- Complete a continuous normal-browser Seller → Product Truth → draft → save/reload/edit → Manager approve → exact export receipt.
- Run Hija and Esposa real cohorts; prove 925/18k contamination is absent from copy and every image prompt.
- Obtain independent exact-SHA review before any merge, push, VPS action or deployment.

## Authority boundary

This checkpoint grants no production readiness, marketplace acceptance, legal clearance, approval authority or deployment authorization. No remote push, merge, VPS mutation or marketplace submission was performed.
