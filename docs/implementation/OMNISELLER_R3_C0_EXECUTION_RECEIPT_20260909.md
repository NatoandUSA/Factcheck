# OmniSeller R3 — C0 Execution Receipt

Date: 2026-09-09 (Asia/Bangkok)  
Baseline: `8dd56569832164ecd3b0ddd62caea254fdade452`  
Branch: `codex/omniseller-r3-c0`  
Worktree: `D:\Claude\Factcheck\scratch\omniseller-r3-c0`

## Outcome

Status: **C0 CONTRACT PACKAGE CREATED — CONTROLLED RED CONFIRMED — NOT READY FOR WAVE 1 MERGE**.

No production/VPS deployment, publish operation, canonical DB migration or legacy-route behavior change occurred.

## Delivered

- amended R3 with Claude final-review adjudication and independent scope expansion;
- exact donor and real-input preservation manifest;
- machine-readable marketplace policy schema;
- Amazon US and Etsy US baseline policy fixtures;
- stable 14-family claim taxonomy with legacy C1–C8 aliases;
- Track A non-canonical handoff-manifest schema;
- controlled RED-case inventory and executable probe;
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

### C0 contract validation

Command: `node scripts/c0_validate_contracts.cjs`

```text
C0_CONTRACT_OK taxonomy sha256=c6c71f7dbdfdc836abb2eb5d7634c11adee1ec0b737049bd1992ae5c663f2498
C0_CONTRACT_OK redCases sha256=47fecc1e301c5aa5e21e02d8a450d42575f41a589928e1c0a5cf3f2705f1fd62
C0_CONTRACT_OK amazon sha256=f34d30c637fab07b16843b03ad5a30b45d9aa80e08d948b86e40954ef58d3709
C0_CONTRACT_OK etsy sha256=7e5403d4797118c6a2b697e057ae0e933e30bd1ebc7375ef3858e99756989e8e
C0_CONTRACT_VALIDATION PASS
```

### Controlled RED probe

Command: `node scripts/c0_r3_red_probe.cjs`

```text
RED SINGLE_CANONICAL_COMPOSER_WRITE_PATH — baselineLegacyListingInsertCount=4; canonicalRepository=false
RED LEGACY_COMPOSERS_ZERO_WRITE_AFTER_CUTOVER — legacySurfacesStillPresent=5
RED POLICY_CONTRACT_MUTATION_75_TO_200 — runtime resolver/enforcer not implemented
RED PRODUCT_NAME_DOES_NOT_PROVE_MATERIAL — stable-ID registry/guard not implemented
C0_RED_PROBE total=4 red=4 green=0
```

Exit `1` is intentional in C0. This probe is not in the canonical inventory. Each case must enter the canonical inventory in the same commit that makes it green.

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
| Preservation | PASS | exact baseline plus donor/input SHA-256 manifest |
| Contract coherence | PASS for structural C0 lint | policy/taxonomy/Track A schemas and fixtures |
| Controlled RED | PASS | four expected runtime blockers reproduced |
| Baseline suite | DEBT — 60/65 | two provider and three Windows process failures |
| Independent review | PARTIAL | three parallel source audits completed; final exact-commit review still required |
| Production safety | PASS | no deploy, publish or production write |

## Next authorized implementation order

1. Implement policy registry/hash/resolver and parity enforcement; make policy RED cases green.
2. Implement stable claim registry/adapter and donor guard transplant; keep identity separate from attributes.
3. Implement immutable listing root/revision repository and zero-write composer preview.
4. Migrate all UI callers, then atomically retire five legacy composition/create surfaces.
5. Implement Track A handoff bundle, full accounting and isolation; run real Hija fixtures.
6. Obtain independent exact-commit review before Wave 1 merge or any VPS action.

Baseline provider/process debt is tracked separately and must not be hidden inside R3 feature commits.
