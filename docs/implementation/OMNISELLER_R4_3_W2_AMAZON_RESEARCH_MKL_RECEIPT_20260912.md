# OmniSeller R4.3 W2 — Amazon Research → Master Keyword Receipt

Date: 2026-09-12 (Asia/Bangkok)  
Branch: `codex/omniseller-r4-3-w2`  
Parent W1 SHA: `091d16d99743182a0b1be9385b766c4c6e32f3d7`  
Status: **LOCAL IMPLEMENTATION PASS — NOT PUSHED, NOT MERGED, NOT DEPLOYED**

## 1. Delivered business path

```text
Seed phrase
  → import one or more Xray files
  → eight transparent ASIN cohorts (maximum 10 per cohort)
  → staff freely edits a run set (maximum 30 ASINs)
  → copy the set to Helium 10 Cerebro
  → import one or more Cerebro files
  → immutable Research Snapshot
  → deterministic Master Keyword preview
  → staff tier review/edit
  → immutable Master Keyword revision
  → refresh/reopen the exact revision
```

An already available valid Cerebro file can go directly to Research Snapshot and Master Keyword List. Xray, an ASIN plan, Product Truth, and proof of Cerebro batch ancestry are not prerequisites for this path. The ASIN plan is a convenience artifact only; it does not lock later staff choices.

Product Truth remains a parallel lane. W2 does not generate customer-facing claims, listings, A+ content, image prompts, exports, or marketplace submissions.

## 2. Xray decision support

The Xray preview produces eight named, inspectable cohorts:

1. Composite seed relevance and performance.
2. Highest ASIN sales.
3. Highest ASIN revenue.
4. Best BSR (lower is better).
5. Highest review velocity.
6. Youngest sellers by seller age.
7. Newest listings by creation date.
8. Strong sales relative to review count.

Every cohort is capped at 10 ASINs and applies seller/brand diversity. Overlap is allowed because the cohorts answer different research questions. Staff can replace the generated list before copying or saving it.

## 3. Cerebro and Master Keyword behavior

- Accepts multiple Cerebro imports from the selected Research Snapshot.
- Preserves every observed keyword with source provenance and available metrics.
- Scores deterministically from search volume, keyword sales, Cerebro IQ, ranking-competitor coverage, position rank, and seed overlap.
- Separates roots, outliers, residue, and metric provenance.
- Uses explicit tiers: `PRIMARY`, `SECONDARY`, `LONG_TAIL`, `OUTLIER_REVIEW`, `RESIDUE`, and `EXCLUDED`.
- Allows staff tier overrides before saving a new immutable revision.
- Does not silently drop keywords; the Hija run reported `droppedKeywordCount = 0`.

Research keywords remain research evidence, not Product Truth. Material, purity, personalization, delivery, rating, trademark, and other claims are not authorized for visible copy by W2 classification.

## 4. Physical persistence ruling implemented

W2 uses `commerce_workflow_artifacts` as the generic immutable artifact store; no new `keyword_snapshots` table was introduced.

The v2 schema binds tenant, workspace, marketplace, project, artifact kind, revision parent, actor, idempotency key, request hash, dependency/payload/accounting hashes, separate engine/parser/normalization/scoring/policy hashes, and the final artifact hash. Writes use `BEGIN IMMEDIATE`, compare-and-swap against the exact head, project-scoped idempotency, actor checks, size limits, and immutable update/delete triggers.

Compatibility behavior is fail-closed:

- absent table → create v2;
- exact and complete v2 → accept;
- empty donor v1 → rebuild as v2;
- populated donor v1 → reject without rewriting or inventing provenance;
- v2 columns present but a required index/trigger missing → reject as `V2_INCOMPLETE`.

This is the bounded W2 implementation decision. Production-like migration rehearsal, database/import backup, and rollback proof remain mandatory release work; this receipt does not authorize deployment.

## 5. Exact real fixtures

| Fixture | Bytes | SHA-256 |
|---|---:|---|
| `Xray_Hija.xlsx` | 15,279 | `171e8935249ae00e775207efd8c08645321212048ff02abac6fbff4a8d043bfe` |
| `Cerebro_Hija.xlsx` | 260,477 | `c77428d8e080c70545d14409a9d64d98e076e8df72b45d0f3257877cc75615d6` |

Observed Hija accounting:

- 1,099 Cerebro observations;
- 1,084 unique Master Keywords;
- 15 duplicate observations consolidated with provenance;
- 58 initial outliers;
- 0 residue;
- 0 dropped keywords.

## 6. Normal-browser UAT receipt

Browser: Codex in-app browser, `http://127.0.0.1:4317/`  
API: local backend, `http://127.0.0.1:4318/`  
Account role: `SELLER`  
Project: `#1 W2 Browser Hija 2026-09-12T03:29:31.015Z`

Verified in the rendered staff workspace:

1. After login/reload, the shell selected the current user's W2 project rather than retaining a stale project from an earlier backend session.
2. Both real imports reopened with their exact size/hash prefixes.
3. Xray preview displayed all eight cohorts, five ASINs each for this fixture.
4. Staff changed the selected run set to exactly three ASINs and saved optional plan artifact `#2`; the UI explicitly stated that it does not lock Cerebro.
5. Cerebro preview displayed all 1,084 Master Keywords and zero dropped keywords.
6. Staff changed `cadena de plata 925 para mujer` from `PRIMARY` to `OUTLIER_REVIEW` and saved Master Keyword revision v2.
7. Full page reload reopened v2 with 1,084 keywords, 59 outliers, zero residue, zero dropped keywords, and the edited tier still present.

The shell stale-context defect found during UAT was fixed by binding project refresh/reset to authenticated user and workspace identity, not only marketplace.

The browser controller available in this environment cannot populate a native local-file chooser. The two exact files were therefore seeded into the same local authenticated API/database, after which all workflow UI interactions and reload/reopen checks were performed in the normal rendered browser. This is an environment-control limitation, not claimed as browser file-picker proof.

## 7. Verification matrix

Certified runtime for the focused suites/build: Node `v22.23.2`.

| Verification | Result |
|---|---:|
| W2 artifact migration, including incomplete-v2 fail-closed | 15/15 PASS |
| W2 Amazon Xray/Cerebro/MKL, CAS, idempotency, restart | 32/32 PASS |
| W1 single active path | 18/18 PASS |
| Canonical research HTTP | 76/76 PASS |
| Amazon research adapter | 18/18 PASS |
| Amazon intelligence adapter | 30/30 PASS |
| Commerce intelligence review | 22/22 PASS |
| Canonical commerce UI | 21/21 PASS |
| Auth/workspace isolation scenarios | 18/18 PASS |
| Submission migration upgrade | 4/4 PASS |
| JSX static contract ratchet | 35/35 PASS |
| Route registry | 88 discovered; all 84 non-public routes authenticated |
| P0 route security | PASS |
| Database migration + backup/restore | PASS |
| Vite production build | PASS, 1,826 modules |

The 32 focused W2 tests include two concurrent writers yielding one success and one CAS conflict, same idempotency key safely reused in different projects, immutable-row enforcement, a SQLite `VACUUM INTO` backup, database close, new connection, and exact artifact-hash persistence after restart.

## 8. Boundaries and next gate

W2 proves Amazon research processing and durable Master Keyword revisions. It does not claim W3 safe composition is complete or that the Hija draft is ready for staff use.

The next bounded slice is W3:

```text
exact Master Keyword revision + exact Product Truth revision
  → claim-safe allocation
  → complete editable Amazon listing/A+/image-prompt package
  → save NEEDS_QA revision
  → refresh/reopen exact dependency graph
```

W3 must retain claim guard behavior: research terms can be PPC targets, but a factual claim may enter visible copy only when the bound Product Truth revision supports it. No W3 work may introduce marketplace auto-publishing.

