# OmniSeller R4.3 W3 — Amazon Safe Output Receipt

Date: 2026-09-12 (Asia/Bangkok)

Status: `W3 LOCAL IMPLEMENTATION COMPLETE — NO PUSH / MERGE / DEPLOY AUTHORITY`

## Exact lineage

- Branch: `codex/omniseller-r4-3-w2`
- W2 parent: `515d4e66b35b6a30863c4ca9ec565905821cbbd6`
- W3 implementation commit: `5ebb08ad6ebfe6e55e4c8540daed65d0f5226552`
- Production mutation: none
- Remote push: none
- Merge: none
- VPS deploy: none

## Implemented vertical slice

```text
exact AMAZON_MASTER_KEYWORDS artifact
                  +
exact Product Truth revision
                  ↓
claim/IP/policy-safe Amazon composition
                  ↓
Title + 5 Bullets + Generic Keywords + Description
+ Item Highlights + A+ factual points + PPC targeting
+ 8 truth-grounded image prompts
                  ↓
editable canonical listing revision at NEEDS_QA
```

W3 did not add a table or a second composer. It reused the W2
`commerce_workflow_artifacts` head and the existing canonical intelligence,
revision, claim guard, IP guard, policy resolver, listing, and image-prompt
engines.

## Exact MKL dependency

Amazon intelligence preview/save now requires the selected current
`AMAZON_MASTER_KEYWORDS` artifact. The immutable intelligence configuration
binds both:

- `masterKeywordArtifactId`
- `masterKeywordArtifactHash`

The resulting listing dependency manifest carries the same pair. If staff
creates a newer Master Keyword revision, an older intelligence snapshot or
draft fails with `STALE_MASTER_KEYWORD_ARTIFACT` instead of silently composing
or saving against obsolete research.

The check is repeated before preview response, inside the intelligence write
transaction, while validating the draft, and while asserting dependencies at
listing write/review boundaries.

## Keyword and claim behavior

- Staff tiers and priority order from the frozen MKL are honored.
- `EXCLUDED` rows are retained in immutable MKL accounting and do not enter
  composition.
- `OUTLIER_REVIEW` and `RESIDUE` remain review queues.
- Unverified research claims are blocked from visible copy and backend terms.
- Allowed unverified targeting remains visible to staff only in flagged PPC.
- All MKL rows are accounted; silent keyword loss is rejected.
- Generic Keywords remain one total UTF-8 budget of at most 249 bytes and do
  not duplicate tokens already indexed in finalized visible copy.

## Product-identity correction found by browser UAT

The first real-file UAT exposed a quality defect: a high-volume recipient
phrase could satisfy the old loose title anchor and produce a title about a
gift for a daughter without naming the product.

W3 added cross-language product-noun families. An English Product Truth type
such as `Necklace` can require the Spanish identity noun `collar`, without
using cross-language equivalence to authorize material, purity, size, or other
attribute claims.

Real-file result after correction:

```text
Amazon Title:
Collar Personalizado para Mujer | Collar para el Dia de las Madres

Backend Search Terms:
madre regalos san valentin

Bytes:
26 / 249
```

The backend field is not padded with repeated, unsafe, irrelevant, or invented
tokens merely to consume bytes. The remaining safe phrases continue through
the allocation/PPC accounting rather than being dropped.

## Real Hija browser UAT

Browser: normal Codex in-app browser against local Vite and local Node 22
backend.

Project: `#1 W3 Hija Product Title UAT`

Exact fixtures:

| Input | Bytes | SHA-256 |
|---|---:|---|
| `Xray_Hija.xlsx` | 15,279 | `171e8935249ae00e775207efd8c08645321212048ff02abac6fbff4a8d043bfe` |
| `Cerebro_Hija.xlsx` | 260,477 | `c77428d8e080c70545d14409a9d64d98e076e8df72b45d0f3257877cc75615d6` |

Observed browser journey:

1. Seller logged in to Amazon Main Store.
2. Project selected after a clean reload.
3. Exact Xray and Cerebro imports reopened in the same project.
4. Research Snapshot, Product Truth revision, and immutable MKL existed as
   distinct parallel dependencies.
5. MKL contained 1,084 keywords with no silent drop.
6. Spanish intelligence preview accounted 1,084/1,084 rows and reported
   `UNALLOCATED = 0`.
7. Draft generated a product-naming title, five bullets, byte-counted backend
   terms, description, highlights, factual A+ points, flagged PPC, and eight
   ready image prompts including the main image.
8. `925` research claims were absent from visible copy and present only in
   flagged PPC targeting.
9. Seller saved listing `#1` at `NEEDS_QA`; no marketplace submit action was
   exposed.
10. A new browser tab showed `Saved Catalog (1)` and the same title at
    `CHỜ QA`, proving reopen persistence.

The browser controller cannot attach a native file-picker path. Exact fixture
bytes were therefore inserted through the same authenticated, project-scoped
HTTP upload routes; every subsequent workflow action and verification above
was performed in the browser.

## Verification

Node runtime: `v22.23.2`.

| Suite | Result |
|---|---:|
| W3 Amazon safe output | 21/21 PASS |
| Amazon composition/intelligence review | 23/23 PASS |
| Amazon intelligence adapter | 30/30 PASS |
| Canonical research/listing HTTP | 78/78 PASS |
| Immutable listing revisions | 45/45 PASS |
| W2 Amazon MKL | 32/32 PASS |
| W2 artifact migration | 15/15 PASS |
| W1 single path | 18/18 PASS |
| Image prompt generator | 11/11 PASS |
| Canonical commerce UI | 21/21 PASS |
| Route registry | 88 discovered / 84 protected / PASS |
| Production Vite build | 1,826 modules / PASS |

The full canonical inventory executed 90 test files: 87 passed and 3 failed.
All W3/security/data-integrity tests passed. The three failures are the known
Windows process-tree management/harness area:

- `test_runner_accounting.cjs` — descendant sentinel timing;
- `test_vite_dev_runtime_smoke.test.cjs` — `TASKKILL_FORCE_TREE_FAILED`;
- `test_vite_process_shutdown.cjs` — `TASKKILL_FORCE_TREE_FAILED`.

This receipt does not relabel the canonical run as 90/90 and does not use the
three process-management failures as evidence of W3 success.

## Boundary and next slice

W3 proves a complete editable Amazon internal-QA package. It does not certify
translation quality for every product family, marketplace publishing, Linux,
GitHub CI, or VPS deployment.

The next bounded slice is W4:

```text
Etsy seed/live HeyEtsy CSV or HTML + YTrends supplement
→ winners
→ pattern miner
→ immutable Etsy Master Keyword artifact
```

W4 must keep Product Truth parallel, preserve evidence tiers, accept multiple
files, and must not pad unsafe tags or introduce a second staff shell.
