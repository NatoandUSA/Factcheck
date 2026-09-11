# W0 Receipt 1 — Baseline, DAG, Dirty State and Local Recovery

**Repository:** `https://github.com/NatoandUSA/Factcheck.git`  
**Dedicated worktree:** `D:\Claude\Factcheck\scratch\omniseller-r4-3-w0`  
**W0 branch:** `codex/omniseller-r4-3-w0`  
**Remote mutation performed:** no

## Exact identities

| Role | Ref | Full SHA |
|---|---|---|
| Production baseline | `origin/main` | `a02db42f63ab76a4091863c53d2fa649fbcc2864` |
| Baseline parent | `origin/main^` | `63f9fa746da08e2eee34c4582787c30d60cdd233` |
| Donor candidate | `origin/codex/omniseller-r3-marketplace-research-workflows` | `5bc0c0f2c165fd7ab1f2b63a30e320cd5e81b56b` |
| Merge base | baseline/donor | `a02db42f63ab76a4091863c53d2fa649fbcc2864` |
| W0 HEAD at creation | `codex/omniseller-r4-3-w0` | `a02db42f63ab76a4091863c53d2fa649fbcc2864` |

Ahead/behind from baseline to donor: `0 / 3`. Donor commits:

```text
354a6b73784487bcf9912046ab872d67553d0509
  parent a02db42f63ab76a4091863c53d2fa649fbcc2864
  feat: implement canonical Amazon and Etsy research workflows

d8fbc5f048eaa17c4abdcbf9e4c800de358f6f80
  parent 354a6b73784487bcf9912046ab872d67553d0509
  docs: correct final Windows test accounting

5bc0c0f2c165fd7ab1f2b63a30e320cd5e81b56b
  parent d8fbc5f048eaa17c4abdcbf9e4c800de358f6f80
  fix: align marketplace research workflow with staff operations
```

## Dirty-state receipt

The dedicated worktree was clean at creation. After W0 assembly, only the W0 evidence documents are expected to be untracked/modified. No product source file is authorized to change in W0.

The root worktree `D:\Claude\Factcheck` was already dirty with user-owned source edits and many untracked artifacts. W0 did not reset, checkout, delete, move or overwrite them. Root HEAD was on `codex/smart-pull-truth-hardening`; it is not the W0 baseline.

## Local recovery refs

```text
recovery/omniseller-r4-3-production-a02db42f
  a02db42f63ab76a4091863c53d2fa649fbcc2864

recovery/omniseller-r4-3-donor-5bc0c0f2
  5bc0c0f2c165fd7ab1f2b63a30e320cd5e81b56b
```

These refs are local only. They have not been pushed. Remote archival push requires separate Human Owner authorization.

## Donor changed-file inventory

Donor versus production changes 24 files, approximately `+1510/-109`:

```text
A docs/implementation/OMNISELLER_R3_INHERITANCE_AND_MULTI_FILE_WORKFLOW_20260911.md
A docs/implementation/OMNISELLER_R3_MARKETPLACE_WORKFLOW_CORRECTION_IMPLEMENTATION_20260911.md
M scripts/uat/realCommerceInputs.cjs
M server/canonicalDraftService.js
M server/commerceIntelligence/amazonIntelligenceAdapter.js
M server/commerceIntelligence/etsyIntelligenceAdapter.js
M server/commerceIntelligence/etsyResearchAdapter.js
M server/database/migrations.js
M server/listingGuard.js
A server/marketplaceResearchWorkflow.js
M server/security/routeRegistry.js
M server/server.js
M shared/aiTruthBoundary.cjs
M src/components/AmazonWorkspace.jsx
M src/components/CanonicalCommerceWorkflow.jsx
M src/components/EtsyWorkspace.jsx
M tests/canonical_test_inventory.json
M tests/test_g4_canonical_commerce_ui.cjs
M tests/test_g4_canonical_research_http.cjs
M tests/test_g4_etsy_canonical_http.cjs
A tests/test_marketplace_research_workflows.cjs
M tests/test_research_consumer_runtime_wiring.cjs
M tests/test_workflow_truth_ui_contract.cjs
M tests/vps_platform_scripts.test.cjs
```

## Transplant boundary

Create later implementation work from production baseline, not by merging the donor branch wholesale. Transplant behavior/tests only after reviewer acceptance. Known donor behaviors that must not transfer unchanged:

- required Xray batch artifact before Cerebro;
- `SELECTED_ASIN_NOT_IN_XRAY` as a hard business lock;
- `CEREBRO_CONTAINS_ASINS_OUTSIDE_BATCH` rejection;
- requirement to bind every saved batch before MKL;
- co-rendering legacy and canonical workflows;
- current project-unbound idempotency replay in workflow artifacts.

## External authority state

```text
LOCAL RECOVERY REFS: CREATED
REMOTE ARCHIVE PUSH: NOT AUTHORIZED
SOURCE COMMIT:       NOT AUTHORIZED IN CONTROL TASK
MERGE:               NOT AUTHORIZED
DEPLOY:              NOT AUTHORIZED
PRODUCTION DB:       NOT MUTATED
```

