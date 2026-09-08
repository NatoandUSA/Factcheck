# OmniSeller R3 — C0 Execution Assignments and Acceptance

Date: 2026-09-08 (Asia/Bangkok)

Baseline: `8dd56569832164ecd3b0ddd62caea254fdade452`

Branch: `codex/omniseller-r3-c0`

Worktree: `D:\Claude\Factcheck\scratch\omniseller-r3-c0`
Release posture: implementation only; no merge, VPS deploy or production write is authorized.

## 1. Final review decision

Claude's `ACCEPT — PROCEED TO C0` is accepted with two scope expansions found by independent source inspection:

1. Baseline has five legacy composition/create surfaces and four direct `INSERT INTO listings` paths, not merely three routes.
2. Policy drift exists in both directions: composer rules and publish-gate rules disagree for Amazon and Etsy. Etsy `targetCount=13` must not be confused with the marketplace maximum of 13.

The Final Master Plan remains authoritative after the Claude-review adjudication embedded in §28.

## 2. Work packages

### C0-A — integration owner and preservation

Owner: primary integration agent.

Deliverables:

- exact-baseline worktree and branch;
- preserved R2, real-input audit and amended R3;
- machine-readable C0 contracts and RED-case manifest;
- clean diff, evidence receipts and final C0 review package.

No donor branch is merged wholesale.

### C0-B — policy contract

Source-audit owner: policy-contract reviewer.

Implementation owner: integration owner after review.

Deliverables:

- immutable/hashable policy schema;
- server-derived resolver dimensions: tenant, workspace, seller account, marketplace, site, product type, category and effective time;
- one contract binding shared by compose, post-compose, post-edit, approval and export;
- prohibition on client scalar limit overrides;
- mutation, parity, ambiguity/fail-closed and Etsy policy-vs-quality tests.

### C0-C — claim taxonomy and Track A compatibility

Source-audit owner: donor/Track-A reviewer.

Implementation owner: integration owner; donor author may supply a bounded patch only.

Deliverables:

- stable string-ID registry and token-level C1–C8 adapter;
- explicit identity-is-not-attribute fixture;
- `TRACK_A_HANDOFF_BUNDLE` schema, hashing, watermark and full keyword accounting;
- corrupt convenience-store fail-visible behavior;
- loopback/isolation rule until server-derived auth and tenant/workspace partitioning exist;
- Track B revalidation receipt with `authority=NONE` and no approval elevation.

### C0-D — single composer and writer inventory

Source-audit owner: composer-route reviewer.

Implementation owner: integration owner in Wave 1–2 cutover.

Frozen legacy surfaces:

```text
POST /api/listings
POST /api/etsy/batch-learn
POST /api/amazon/quick-draft
POST /api/trends/:id/draft
POST /api/chat mode=COMMERCE_DRAFT
```

Deliverables:

- static writer allowlist;
- canonical compose-preview is zero-write;
- one transactional root+v1 writer and one append-only revision repository;
- authenticated legacy surfaces return `410 LEGACY_COMPOSER_RETIRED` only at atomic UI cutover;
- unauthenticated calls still return `401` before deprecation disclosure;
- `/api/chat` research mode remains zero-write.

## 3. Track A handoff bundle

Track A is not a canonical export package. Its minimum bundle is:

```text
00_MANIFEST.json
01_PRODUCT_TRUTH.json
02_RESEARCH_SOURCE_MANIFEST.json
03_AMAZON_DRAFT.json + watermarked CSV/TXT
04_KEYWORD_DISPOSITION.csv
05_CLAIM_IP_POLICY_REPORT.json
06_PPC_REVIEW.csv
07_TRACK_B_IMPORT_RECEIPT_TEMPLATE.json
```

Every component has SHA-256 and byte count. Product Truth state is `STAFF_INPUT_UNVERIFIED`; the package contains no approval, user-role or submission authority. Accounting is complete beyond 200 rows.

## 4. C0 gates

### Gate C0.1 — preservation

- branch starts exactly at approved baseline;
- donor commits/files/hashes and real Hija fixtures are named;
- source documents have no silent divergence.

### Gate C0.2 — contract coherence

- AJV 2020 validates positive and negative policy/Track A fixtures; taxonomy invariants are checked executablely;
- every approval-critical output binds version and hash;
- unknown taxonomy/policy inputs fail closed for approval/export.

### Gate C0.3 — baseline inventory and RED specifications

Run `node scripts/c0_baseline_inventory_probe.cjs`. It must reproduce exactly five legacy surfaces and four direct baseline listing inserts. This is an inventory receipt only; it cannot certify future runtime behavior.

The RED-case manifest is a specification inventory, not a behavioral test. Before any Wave 1 merge, each applicable RED case becomes an executable canonical test and enters `tests/canonical_test_inventory.json` in the same commit as its implementation.

### Gate C0.4 — independent review

- source-audit findings resolved or explicitly rejected with evidence;
- `git diff --check` clean;
- baseline canonical suite receipt captured under supported Node 22;
- no production deployment or publish path changed.

## 5. Atomic cutover rule

Do not retire legacy endpoints before their dependent UI callers move in the same gated cutover. Known callers include `App.jsx`, `AmazonPipelineWorkflow.jsx`, `AmazonWorkspace.jsx`, `Dashboard.jsx`, `EtsyWorkspace.jsx`, `EtsyMultiSellerScanner.jsx` and `AgentChat.jsx`.

No redirect, compatibility proxy or fallback may silently route a legacy composer into canonical persistence. Historical records remain readable; new R3 revisions use only the canonical service/repository.

## 6. Immediate stop conditions

Stop the affected lane if any of these occurs:

- scope requires writing to production/VPS;
- a donor requires wholesale merge or parallel canonical persistence;
- an approval or policy hash cannot be reproduced;
- real-input accounting loses an observation or silently truncates a rejection list;
- Product Identity is used to prove material, dimension, included item or other attribute;
- tests require unsupported Node runtime or mutate the user's dirty primary worktree.
