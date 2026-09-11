# W0 Receipt 2 — Dependency, Render and Reachability Graph

**Audited baseline:** `a02db42f63ab76a4091863c53d2fa649fbcc2864`  
**Comparison donor:** `5bc0c0f2c165fd7ab1f2b63a30e320cd5e81b56b`

## Active application entry

```text
src/main.jsx
→ src/App.jsx
  ├→ AmazonWorkspace
  └→ EtsyWorkspace
```

Both marketplace workspaces currently render canonical and legacy controls in the same ordinary staff page.

## Amazon co-render graph

```text
AmazonWorkspace
├→ CanonicalCommerceWorkflow          canonical read/write path
├→ SmartPullAnalyticsBar              legacy research write path
├→ ProjectEvidenceGate                legacy accept/transition write path
├→ MarketBenchmarkWidget              legacy/auxiliary research read path
├→ AmazonPipelineWorkflow             legacy upload/draft write path
└→ LearningBoxWidget                  legacy template learn/delete write path
```

Concrete calls:

| Component | Important routes | Mutation risk |
|---|---|---|
| Canonical Commerce | `/commerce-state`, `/research-imports`, `/research-snapshots`, `/intelligence-snapshots`, `/listings`, QA/submission routes | canonical writes |
| Smart Pull | `/api/research/smart-pull`, `/api/evidence` | creates/reads evidence |
| Evidence Gate | `/api/evidence/:id/accept`, `/api/projects/:id/transition` | acceptance and state writes |
| Market Benchmark | `/api/benchmark/validate` | provider/read result |
| Amazon Pipeline | `/api/upload-h10`, `/api/trends/:id/draft` | legacy imports/trends/draft writes |
| Learning Box | `/api/learning/analyze`, `/api/learning/templates/:id` | learned-template write/delete |

## Etsy co-render graph

```text
EtsyWorkspace
├→ CanonicalCommerceWorkflow          canonical read/write path
├→ SmartPullAnalyticsBar              legacy research write path
├→ ProjectEvidenceGate                legacy accept/transition write path
├→ MarketBenchmarkWidget              auxiliary path
├→ EtsyMultiSellerScanner             legacy learn/write path
└→ LearningBoxWidget                  legacy template write/delete path
```

Additional Etsy legacy/server routes remain reachable, including `/api/etsy/scan-search`, `/api/etsy/batch-learn`, `/api/etsy/feed-search-results`, `/api/mcp/pull-etsy`, `/api/upload-trends`, `/api/trends/:id/draft` and `/api/master-keywords`.

## Legacy stage authority still present

The server still owns:

```text
EVIDENCE_INTAKE
→ RESEARCH_ACCEPTED
→ DNA_ACCEPTED
→ MKL_FROZEN
```

The UI still renders transition controls and tests explicitly require the chain. The canonical panel may describe `EVIDENCE_INTAKE` as non-blocking, but `server/server.js` also contains stage-blocked paths and the old transition endpoint remains writable. This proves the problem is orchestration/reachability, not staff error.

## Persistence writers by domain

| Domain | Writer / tables |
|---|---|
| Evidence/legacy research | `server.js` → `research_evidence`, `evidence_acceptance_events`, `project_transition_events`, `market_trends` |
| Legacy learning | `server.js` → `learned_templates`, `market_trends` |
| Canonical import/research | `commerceSnapshotStore.js` → `research_imports`, `research_snapshots`, `commerce_write_receipts`, project head |
| Truth-bound intelligence | `commerceSnapshotStore.js` → `intelligence_snapshots`, project head |
| Listing revisions | `revisionStore.js` → `listings`, `listing_revisions`, `creative_revisions`, receipts |
| QA/submission | `canonicalReviewHandoffStore.js` → reviews, requests, handoffs, listing status |
| Donor MKL/workflow artifacts | `marketplaceResearchWorkflow.js` → `commerce_workflow_artifacts` |

## W1 reachability contract

Ordinary Seller/Manager staff navigation must expose exactly:

```text
AmazonWorkspace → one R4.3 canonical entry
EtsyWorkspace   → one R4.3 canonical entry
```

Legacy panels may initially remain in source, but if diagnostically accessible they must be:

- developer/admin-only;
- absent from normal staff navigation and rendering;
- read-only where possible;
- unable to call legacy write/generator/transition routes;
- covered by role-negative and direct-route tests.

W1 must explicitly deny normal staff calls to retired legacy mutation routes or remove their registry reachability. Merely hiding buttons is insufficient.

## W1 route policy proposal

Keep active for staff:

- auth/workspace/project reads;
- canonical multi-file preview/confirm/import/list/reopen;
- Product Truth reads/writes independently;
- canonical listing reads needed for continuity.

Retire from staff navigation and deny legacy writes during W1:

- legacy evidence acceptance and stage-transition actions used to unlock research;
- Smart Pull write path as a next-action controller;
- legacy H10 upload-to-trend/draft generator;
- legacy learning/template mutation from marketplace workspace;
- duplicate Etsy batch-learn/generator path.

Provider/diagnostic reads may remain only behind an explicit admin/developer policy. Exact route removal is deferred until W6 reachability and historical-read proof.

## Required proof before W1 exit

1. Seller login shows one Amazon and one Etsy writable path.
2. Direct URL/API attempts to retired write routes are denied or unavailable to ordinary staff.
3. Multi-file preview is zero-write.
4. Confirm persists per-file accounting once.
5. Refresh, relogin, server restart and project reopen recover the same artifacts.
6. Project/workspace switching cannot reveal another scope's imports.
7. Product Truth is not required for research import.

## Receipt verdict

`DUPLICATE ACTIVE PATH CONFIRMED — W1 CUTOVER REQUIRED.` No deletion is authorized in W0.

