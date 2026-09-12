# OmniSeller R4.3 W4/W5 — Etsy, Execution Log, and Submission Lifecycle Receipt

Date: 2026-09-12 (Asia/Bangkok)

Status: `LOCAL IMPLEMENTATION COMPLETE — OWNER-RUN BROWSER UAT PENDING — NO PUSH / MERGE / DEPLOY`

## Exact lineage

- Branch: `codex/omniseller-r4-3-w2`
- Parent: `b483dec29641a334f58c0d4e58c1d9f97a9fdbcc`
- Implementation commit: `a1d8743c62977ec8a16be06bcb96eeb1e37aa7dc`
- Remote push: none
- Merge: none
- VPS/production mutation: none
- Marketplace publishing: none

## W4 active Etsy path

```text
seed phrase
  → multiple live HeyEtsy/Etsy CSV or saved HTML imports
  → 195 source observations retained
  → 176 listing entities + 19 repeated observations (not silently deleted)
  → relevance filter before winner scoring
  → editable Winner Set
  → Pattern Miner
  → immutable ETSY_PATTERN_SNAPSHOT
  → optional YTrends E3 supplement
  → immutable ETSY_MASTER_KEYWORDS
  → exact MKL-bound intelligence
  → safe Etsy title + description + up to 13 explained tags
  → full truth-grounded external image-prompt suite
```

Product Truth remains a parallel lane. Research may produce the Master Keyword
artifact without Product Truth, but no customer-facing factual assertion may be
composed or approved without exact Product Truth support.

Evidence tiers remain distinct:

- E1: public marketplace observation;
- E2: HeyEtsy modeled/estimated metric;
- E3: YTrends supplemental phrase/pattern;
- E4: staff-unverified assertion.

YTrends failure returns `ETSY_YTRENDS_UNAVAILABLE` and does not block the
live CSV/HTML path.

## Exact real inputs used

| File | Rows | Bytes | SHA-256 |
|---|---:|---:|---|
| `para_mi_hija_search_20260908_222159.csv` | 63 | 45,775 | `70a7c212ec94cba7a880d42e71d0f984bd7cabe944b04c3c28d8068878fcd023` |
| `para_mi_hija_search_20260908_222205.csv` | 66 | 47,265 | `72c065ff5783a0507e3b0697e2e6abd847df53268e802001fb9e250d4fbde2c5` |
| `para_mi_hija_search_20260908_222208.csv` | 66 | 46,879 | `f3ffae62c0fbd10921637ceeb051630dcfc156b25bb1a39519f862edcb66405f` |

All 36 source columns are recognized. The W4 test processes all 195/195 rows.

## Etsy output correction

- Title is at most 140 characters, retains the Product Truth product identity,
  and uses a bounded number of readable safe Master Keyword clauses.
- Tags are at most 13 and at most 20 characters each.
- The engine does not invent/pad unsafe tags to reach 13.
- A short set is reported as `TAG_SHORTAGE` with the exact missing count.
- Every generated tag keeps intent, semantic cluster, reason, Master Keyword
  reference, and source provenance.
- A staff-edited tag becomes `STAFF_MANUAL_EDIT_REQUIRES_MANAGER_QA`.
- Unverified claims, protected IP, competitor shop names, wrong product nouns,
  source UI boilerplate, currency/metric fragments, and language-mismatched
  phrases remain outside visible copy with explicit accounting.

## Staff execution log

The canonical workspace now contains a collapsible **Nhật ký thực thi để gửi
Codex** panel. It keeps at most 250 events per marketplace/project in the
current browser session and records:

- timestamp, action, status, project/workspace and current artifact heads;
- selected file name, MIME type and byte size;
- preview/import hash and accounting summary;
- stable error code, message, blockers and server-provided details.

It deliberately excludes cookies, passwords and file contents. **Copy log
JSON** produces schema version 1, parseable diagnostic JSON. **Xóa log tab này**
clears the project/marketplace session log.

## Correct W5 authority chain

```text
Manager approves exact revision/dependency package
  → Seller requests submission authorization
  → Owner authorizes the same exact package hash
  → Seller downloads the exact hashed JSON bytes
  → Seller/operator submits manually outside OmniSeller
  → Seller/operator records OPERATOR_REPORTED_SUBMITTED
```

`OPERATOR_REPORTED_SUBMITTED` is explicitly not marketplace acceptance, live
status, or proof that OmniSeller published anything. Marketplace live tracking
is deferred to phase 2.

The old Owner-to-bare-`SUBMITTED` route always returns HTTP 410. Historical
`canonical_submission_handoffs` and bare `SUBMITTED` rows remain readable and
are not rewritten.

## W5 persistence and rollback safety

Migration 017 adds immutable, fully scoped event tables for authorization,
exact export, and operator report. It also:

- rebuilds handoff receipts with tenant/workspace/marketplace/project/listing/
  operation/idempotency-key identity;
- binds request hashes to exact revision, content, dependency, review and
  package hashes;
- validates required schema objects and fails closed on partial tables;
- stores export bytes once and keeps only compact export metadata in the
  idempotency receipt;
- rehydrates replayed export bytes only after hash verification;
- installs a database trigger that prevents older rolled-back code from
  reopening an `OPERATOR_REPORTED_SUBMITTED` listing.

## Exact targeted certification

| Suite | Result |
|---|---:|
| Canonical commerce UI + execution log | 25/25 PASS |
| W5 submission lifecycle | 26/26 PASS |
| Canonical research/listing HTTP | 78/78 PASS |
| Etsy canonical HTTP | 30/30 PASS |
| Etsy intelligence/output | 33/33 PASS |
| W4 real-file Etsy MKL | 37/37 PASS |
| W3 Amazon safe output regression | 21/21 PASS |
| Migration backup/restore | PASS |
| Route registry | 98 discovered / 94 protected / PASS |
| Production Vite build | 1,826 modules / PASS |
| `git diff --check` | PASS |

The full canonical inventory was also run before the final W5 schema hardening:
89/92 passed, 3 failed, 0 unexecuted. The only failures were the already-known
Windows process-tree harness cases:

- `test_runner_accounting.cjs` descendant-sentinel timing;
- `test_vite_dev_runtime_smoke.test.cjs` completed Vite HTTP/module checks but
  failed `TASKKILL_FORCE_TREE_FAILED` during cleanup;
- `test_vite_process_shutdown.cjs` failed the same cleanup path.

This receipt does not call the full inventory 92/92 and does not use those
harness failures as product evidence.

## Owner-run browser UAT (no Codex browser controller)

Use a normal browser and the real staff accounts. For either marketplace:

1. Login, select the intended workspace and project.
2. Open **Nhật ký thực thi**, click **Xóa log tab này**.
3. Run the workflow from multi-file import through saved Master KW.
4. Enter/load Product Truth, generate intelligence and draft, edit, then save
   `NEEDS_QA`.
5. Refresh/reopen and verify the same project, artifacts and draft remain.
6. Manager opens exact review package and approves it.
7. Seller requests authorization; Owner authorizes; Seller downloads exact
   JSON. Do not submit a live marketplace item merely for this UAT.
8. If any step fails, immediately click **Copy log JSON** and paste the whole
   JSON back to Codex with the visible screen/step. Do not send passwords.

The manual external-submission report should be tested only with a real manual
submission the business actually intends to make.

## Remaining gates

- Owner-run normal-browser UAT is pending.
- Linux/exact-SHA CI certification is pending.
- Remote push, PR, merge and VPS deployment require separate explicit owner
  authorization after UAT evidence.
