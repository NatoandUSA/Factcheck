# OmniSeller R4.3 — Production Recovery Integration Receipt

**Date:** 2026-09-12  
**Status:** `LOCAL INTEGRATION PASS — PUSH/CI PENDING — NOT DEPLOYED`  
**Production observed:** `3139c0e6d751be431facc1bf5270fb5c41161762`  
**Integration branch:** `codex/omniseller-r4-3-production-recovery`  
**Integration code SHA before this receipt:** `d478411a6005e9eb1f0e48f6b8400c2ebda39d1a`

## 1. Controlling documents

This integration is evaluated against:

1. `OMNISELLER_R4_3_AMENDMENT_A_FINAL_REVIEW_INTEGRATION_20260911.md`;
2. `OMNISELLER_R4_3_SINGLE_PATH_WORKFLOW_REPO_CLEANUP_AND_DELIVERY_PLAN_20260911.md`.

Amendment A controls conflicts. This receipt does not authorize merge or deployment.

## 2. Root cause proven

The production health endpoint returned revision `3139c0e6d751be431facc1bf5270fb5c41161762`.
That commit is the merge of donor `5bc0c0f2c165fd7ab1f2b63a30e320cd5e81b56b` into the former
production baseline. The donor was merged with two behaviors that both controlling documents explicitly reject:

- UI DOM order rendered Xray, then Cerebro, then ASIN selection;
- the server exposed mandatory Cerebro-to-batch ancestry and returned
  `CEREBRO_CONTAINS_ASINS_OUTSIDE_BATCH`.

The earlier R4.3 implementation branch was based on `a02db42f...` and had not been pushed or deployed. Therefore
the production browser and local remediation were different histories. Asking staff to test production at that time
was invalid.

## 3. Integrated active workflows

### Amazon

```text
1. Upload 1..N Xray files
→ 2. Build/edit/copy ASIN run sets (decision support only)
→ staff runs Helium 10 externally
→ 3. Upload 1..N valid Cerebro files
→ 4. Create Research Snapshot with selected Cerebro input
→ 5. Cerebro → Master KW
→ Product Truth parallel join
→ safe listing/A+/image prompts
```

Enforced invariants:

- Xray and Cerebro use separate multi-file controls;
- the ASIN plan appears before the Cerebro control in DOM and source order;
- a valid Cerebro import is not blocked by missing/changed/extra batch ancestry;
- no active server route imports the donor writer or exposes `/amazon/cerebro-bindings`;
- Product Truth does not gate research/MKL.

### Etsy

```text
Seed/live Etsy/HeyEtsy
→ upload 1..N CSV/HTML captures
→ lossless Research Snapshot
→ editable relevance-first Winner Set
→ Pattern Miner
→ Etsy Master KW
→ Product Truth parallel join
→ title/description/up-to-13 explained tags/full prompts
```

Enforced invariants:

- YTrends is E3 supplemental and not a provider gate;
- repeated observations remain accounted before entity merge;
- high-metric irrelevant listings cannot become winners;
- fewer than 13 safe tags returns `TAG_SHORTAGE` rather than padding;
- the donor listing guard now retains explanations emitted under the engine's `value` field.

## 4. Production database upgrade

Production may contain populated donor-v1 `commerce_workflow_artifacts`. The original R4.3 v2 migration would
fail closed on such a database, so it was not deployable after PR #37.

The integration adds a uniquely named upgrade receipt:

```text
2026-09-12_commerce_workflow_artifacts_v2_upgrade
```

Upgrade behavior:

- classifies absent, exact donor-v1, exact v2 or unknown schema;
- validates v1 JSON, component hashes, donor artifact hash, project scope, users/workspaces and parent chain before DDL;
- transactionally rebuilds one dual-integrity table;
- preserves v1 ID, parent, payload, accounting, source hashes, artifact hash, actor and timestamp exactly;
- records v1 as historical/read-only and does not fabricate parser/normalizer/scorer/policy provenance;
- rejects v1 artifacts as canonical compose dependencies until staff re-freezes a v2 revision;
- allows a validated v2 revision to descend from a v1 head;
- unknown/tampered/orphaned inputs fail before schema mutation;
- verifies artifact-table foreign keys, SQLite integrity, idempotent rerun and restart persistence.

No production data was accessed or changed by these tests. A synthetic production-like donor database was copied
to a temporary path, upgraded twice, reopened and deleted.

## 5. Verification accounting

Focused acceptance:

| Suite | Result |
|---|---:|
| Canonical commerce UI, including Amazon DOM order and Etsy continuation controls | `31/31 PASS` |
| W1 single path | `18/18 PASS` |
| W2 Amazon MKL | `32/32 PASS` |
| W2 donor-v1/v2 migration | `20/20 PASS` |
| Production-like DB upgrade and restart | `PASS` |
| W3 Amazon safe output | `21/21 PASS` |
| W4 Etsy MKL | `37/37 PASS` |
| W5 submission lifecycle | `26/26 PASS` |
| Canonical research HTTP | `78/78 PASS` |
| Etsy canonical HTTP | `30/30 PASS` |
| Etsy intelligence | `33/33 PASS` |
| Route registry | `98 discovered / 94 protected PASS` |
| Production build | `1826 modules PASS` |

Canonical inventory ran all 94 entries on Windows. Its first run reported `89/94`: two failures were stale donor
contract assertions and were corrected to enforce the accepted no-ancestry workflow; both reruns pass. The remaining
three failures are the known Windows process-tree cleanup behavior. Those exact three tests pass under Ubuntu/WSL:

- `test_runner_accounting.cjs`: PASS;
- `test_vite_dev_runtime_smoke.test.cjs`: PASS;
- `test_vite_process_shutdown.cjs`: `19/19 PASS`.

This is consolidated evidence, not a claim that one uninterrupted Windows invocation returned `94/94`.

## 6. Conformance and remaining gates

| Contract | Status |
|---|---|
| One active staff shell | implemented and unit/API verified |
| Multi-file Amazon/Etsy import | implemented and verified |
| Amazon Xray → ASIN plan → Cerebro → MKL | implemented and order-ratcheted |
| No Cerebro ancestry/batch hard lock | active route/UI removed and ratcheted |
| Etsy Winner → Pattern Miner → MKL | implemented and verified |
| Product Truth parallel, assertion-bound | implemented and verified |
| Exact submission authority chain | implemented and verified |
| Donor-v1 production upgrade | implemented and production-like verified |
| Normal-browser staff UAT on candidate SHA | **PENDING** — user-operated per current coordination rule |
| W6 physical deletion of unreachable legacy module | **PENDING** until browser replacement proof |
| Push/PR/CI | **PENDING** at receipt creation |
| Merge/deploy | **NOT AUTHORIZED by this receipt** |

## 7. Browser handoff after candidate deployment

The user should not test the current production revision for these fixes. After an exact candidate SHA is deployed to
an authorized test/release environment, use OmniSeller's visible execution log and copy JSON after any failure.

Required short path:

```text
login → project
→ Amazon: Xray → editable ASIN plan → Cerebro → Research Snapshot → Master KW
→ Etsy: CSV/HTML → Research Snapshot → Winner → Pattern Miner → Master KW
→ refresh twice → reopen same project
```

The copied log must include project, marketplace, action, status, file name/size/hash/accounting and error code, but no
credentials or raw file contents.

## 8. Current ruling

```text
LOCAL INTEGRATION: PASS
PRODUCTION CURRENTLY FIXED: NO
PUSH/PR/CI: NEXT
BROWSER UAT: PENDING
MERGE: HOLD
DEPLOY: HOLD
```
