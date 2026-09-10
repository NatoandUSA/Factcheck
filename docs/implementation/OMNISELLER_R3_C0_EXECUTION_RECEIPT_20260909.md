# OmniSeller R3 — C0 Execution Receipt

Date: 2026-09-09 (Asia/Bangkok)

Baseline: `8dd56569832164ecd3b0ddd62caea254fdade452`

Branch: `codex/omniseller-r3-c0`

Worktree: `D:\Claude\Factcheck\scratch\omniseller-r3-c0`

## Outcome

Status: **C0 CONTRACT PACKAGE CREATED — BASELINE INVENTORIED — NOT READY FOR WAVE 1 MERGE**.

No production/VPS deployment, publish operation, canonical DB migration or legacy-route behavior change occurred.

## Delivered

- amended R3 with Claude final-review adjudication and independent scope expansion;
- exact donor and real-input preservation manifest;
- machine-readable marketplace policy schema;
- Amazon US and Etsy US baseline policy fixtures;
- stable 14-family claim taxonomy with legacy C1–C8 aliases;
- Track A non-canonical handoff-manifest schema;
- controlled RED-case specification inventory and baseline inventory probe;
- implementation assignments and atomic-cutover rules.

## Independent source-audit corrections

### Composer/write inventory

Baseline has five legacy surfaces and four direct SQL writers:

| Surface | Composes | Direct listing write |
| --- | ---: | ---: |
| `POST /api/listings` | client payload path | yes |
| `POST /api/etsy/batch-learn` | yes | yes |
| `POST /api/amazon/quick-draft` | yes | yes |
| `POST /api/trends/:id/draft` | yes | yes |
| `POST /api/chat mode=COMMERCE_DRAFT` | yes | no |

Therefore “retire three routes” is insufficient. The five surfaces are frozen for R3 and must cut over atomically with all known UI callers.

### Policy contract drift

Baseline composer and publish gate disagree:

- Amazon title: composer 75 vs publish gate 200;
- Etsy title: composer 140 vs publish gate 200;
- Etsy tags: maximum/target 13 is implemented as exactly 13 at publish gate;
- donor branch accepts client-provided limit scalars.

R3 now requires one server-resolved `policyContractId + policyContractHash` across composition, edits, approval and export. Etsy safe-tag shortage is reported; unsafe padding is forbidden.

### Track A donor boundary

The donor claim guard/composer remains valuable, but current global unauthenticated Product Library is unsafe for multi-office VPS use. It is limited to loopback or isolated instances until server-derived authentication and tenant/workspace partitioning exist. Corrupt `products.json` must fail visibly rather than silently load an empty library.

## Validation receipts

### C0 JSON Schema 2020 and invariant validation

Command: `node scripts/c0_validate_contracts.cjs`

The validator uses AJV 8 in Draft 2020 mode plus the reusable runtime-neutral policy invariant validator. It tests positive Amazon/Etsy/Track-A fixtures and negative empty-rules, evidence, scope, Etsy target-over-maximum, authority-escalation and missing-component cases. Artifact hashes printed by the command are SHA-256 of exact stored UTF-8 bytes, not semantic/canonicalized JSON hashes.

Contract JSON is forced to `eol=lf` by `.gitattributes`, preventing Windows CRLF checkout from changing an approval-critical artifact hash for the same Git content.

```text
C0_CONTRACT_OK taxonomy artifactByteSha256=b0e785623b4dcca781f6d8c51e0f9c17683a889405eb3bbffe87f602c74faafd
C0_CONTRACT_OK redCases artifactByteSha256=499de2526a9247656d5aa5a94ec55fce562268fb9d8a4d223244aacba93a0f42
C0_CONTRACT_OK policySchema artifactByteSha256=cebca4dc12215af9a5cbcc127deab298ce40a2d2b6333983c38dea61c589753c
C0_CONTRACT_OK lifecycleSchema artifactByteSha256=7d749c803afaede705737782d70052436418a37f826b830b414cc9f6bcc4d8fb
C0_CONTRACT_OK trackASchema artifactByteSha256=750e774e7f71ead7f2baf4f26e4366e8c65809fe3dd9c0ced18d14d8974b63ba
C0_CONTRACT_OK amazon artifactByteSha256=e06ce99e02b0e5a6a6f497efdf8e18f2c1ff787030fa526e520365a27de18037
C0_CONTRACT_OK etsy artifactByteSha256=ba9d0d73e418285a3030905378d51e260547ad7ec35505df1e2ee5b013d2df5a
C0_CONTRACT_OK trackA artifactByteSha256=f91ac4563ddf684ce7221e6b8a6a7a6833e0fd652ca80b01f1f239a59688c240
C0_JSON_SCHEMA_2020_POSITIVE_NEGATIVE_VALIDATION PASS
```

### Baseline inventory probe

Command: `node scripts/c0_baseline_inventory_probe.cjs`

```text
C0_BASELINE_INVENTORY legacySurfaces=5 directListingInserts=4 rendererCalls=3
C0_BASELINE_INVENTORY PASS
NOTE This probe records baseline debt only; it never certifies future runtime behavior.
```

Behavioral RED requirements live in `c0-red-cases.json`. They are not claimed as executed until real static/integration tests are added to the canonical inventory.

### Baseline canonical suite — Node 22.23.2

```text
SUITE_RESULT total=65 passed=60 failed=5 unexecuted=0 harness_errors=0
```

Failures are pre-existing baseline debt, not caused by the C0 contract-only files:

1. `test_adversarial_staff_ui_flow.cjs` — Etsy MCP unavailable, expected 200 but received 503.
2. `test_multi_project_attribution.cjs` — YTrends/Etsy provider unavailable, expected 200 but received 503.
3. `test_runner_accounting.cjs` — Windows descendant-process accounting assertion.
4. `test_vite_dev_runtime_smoke.test.cjs` — Vite served correctly, but `TASKKILL_FORCE_TREE_FAILED` caused timeout.
5. `test_vite_process_shutdown.cjs` — same Windows tree-shutdown failure class.

The production build executed successfully inside the suite. This receipt does not claim a green baseline or production readiness.

## C0 exit assessment

| Gate | Status | Evidence |
| --- | --- | --- |
| Preservation | PARTIAL | exact local hashes verified; durable archive/tag/upstream receipt still required |
| Contract coherence | PASS | AJV 2020 positive/negative validation and taxonomy invariants pass |
| Baseline inventory | PASS | five surfaces, four writers, three renderer calls reproduced |
| Baseline suite | DEBT — 60/65 | two provider and three Windows process failures |
| Independent review | PENDING current-head recheck | three lanes accepted `ec5bbae4b`; exact-nine CSV correction was added afterward from Track-A review |
| Production safety | PASS | no deploy, publish or production write |

## Next authorized implementation order

1. Implement policy registry/hash/resolver and parity enforcement; make policy RED cases green.
2. Implement stable claim registry/adapter and donor guard transplant; keep identity separate from attributes.
3. Implement immutable listing root/revision repository and zero-write composer preview.
4. Migrate all UI callers, then atomically retire five legacy composition/create surfaces.
5. Implement Track A handoff bundle, full accounting and isolation; run real Hija fixtures.
6. Obtain independent exact-commit review before Wave 1 merge or any VPS action.

Baseline provider/process debt is tracked separately and must not be hidden inside R3 feature commits.

## Independent exact-content verdict

Commit `ec5bbae4b80a9017567bd7a91fd1d303bbf68472` received three read-only `ACCEPT` verdicts:

- policy contract: AJV 2020, exact-scope evidence, lifecycle and cross-field invariants accepted;
- composer/cutover: five-surface/four-writer inventory and atomic-cutover specifications accepted;
- Track A/taxonomy: exact nine-component bundle (JSON + CSV + TXT draft views), accounting invariant and token-level legacy adapter accepted after resolving the eight-versus-nine inconsistency.

After those verdicts, the Track-A reviewer identified a JSON+CSV+TXT documentation/schema mismatch. The bundle was corrected from eight to nine exact components; current-head acceptance must therefore be rerun. This does not claim that behavioral RED cases, Track A release conditions, baseline provider/process debt, Wave 1, merge or deployment are complete.
