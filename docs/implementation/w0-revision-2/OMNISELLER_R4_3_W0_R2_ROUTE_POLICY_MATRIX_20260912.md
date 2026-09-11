# W0 Revision 2 — Route-by-Route W1 Policy Matrix

**States:** `KEEP`, `STAFF_DENY`, `ADMIN_READ_ONLY`, `DEFER_REMOVE`  
**Scope:** W1 single-shell and multi-file persistence only. A `DEFER_REMOVE` route remains in source for compatibility but is absent from staff navigation and cannot control W1.

## Canonical routes retained for W1

| ID | Route | Current roles | W1 policy | Expected behavior/test |
|---|---|---|---|---|
| W1-R01 | `POST /api/auth/login` | public with limiter | KEEP | browser login succeeds; rate-limit negative case |
| W1-R02 | `GET /api/auth/me` | authenticated | KEEP | returns exact current membership/scope |
| W1-R03 | `POST /api/auth/switch-workspace` | authenticated membership | KEEP | switch changes all subsequent scope; no leakage |
| W1-R04 | `GET /api/projects` | Owner/Manager/Seller | KEEP | only current tenant/workspace/marketplace projects |
| W1-R05 | `POST /api/projects` | Owner/Manager/Seller | KEEP | project is scoped; legacy state does not gate R4.3 import |
| W1-R06 | `GET /api/projects/:id/commerce-state` | Owner/Manager/Seller | KEEP | scoped reopen returns confirmed imports/artifacts |
| W1-R07 | `POST /api/projects/:id/research-imports/preview` | Owner/Manager/Seller | KEEP | 1..N files, per-file accounting, zero-write |
| W1-R08 | `POST /api/projects/:id/research-imports` | Owner/Manager/Seller | KEEP | explicit confirm, idempotent persistence, per-file receipts |
| W1-R09 | `GET /api/projects/:projectId/research-imports/:kind` | Owner/Manager/Seller | KEEP | scoped recovery after refresh/relogin/restart |
| W1-R10 | `GET /api/projects/:id/product-truth/revisions` | Owner/Manager/Seller | KEEP | independent parallel lane; not required for import |
| W1-R11 | Product Truth preview/revision routes | Owner/Manager/Seller; confirm Manager/Owner | KEEP | existing truth functionality remains, independent of research |
| W1-R12 | `GET /api/projects/:id/listings` | Owner/Manager/Seller | KEEP | saved catalog continuity; no generator invocation |

## Legacy write/control routes denied to ordinary W1 staff path

| ID | Route | Current roles | W1 policy | Expected behavior/test |
|---|---|---|---|---|
| W1-R20 | `POST /api/research/smart-pull` | Owner/Manager/Seller | STAFF_DENY + DEFER_REMOVE | absent from staff UI; Seller direct call denied |
| W1-R21 | `POST /api/evidence/:id/accept` | Owner/Manager | STAFF_DENY + DEFER_REMOVE | cannot unlock/control R4.3 import |
| W1-R22 | `PATCH /api/projects/:id/transition` | Owner/Manager/Seller | STAFF_DENY + DEFER_REMOVE | legacy stage mutation not available from ordinary staff path |
| W1-R23 | `POST /api/upload-h10` | Owner/Manager/Seller | STAFF_DENY + DEFER_REMOVE | legacy importer not used; canonical multi-file route is replacement |
| W1-R24 | `POST /api/upload-trends` | Owner/Manager/Seller | STAFF_DENY + DEFER_REMOVE | legacy importer not used |
| W1-R25 | `POST /api/trends/:id/draft` | Owner/Manager/Seller | STAFF_DENY + DEFER_REMOVE | cannot create competing draft |
| W1-R26 | `POST /api/amazon/quick-draft` | Owner/Manager/Seller | STAFF_DENY + DEFER_REMOVE | no competing generator |
| W1-R27 | `POST /api/etsy/batch-learn` | Owner/Manager/Seller | STAFF_DENY + DEFER_REMOVE | no competing Etsy writer/generator |
| W1-R28 | `POST /api/learning/analyze` | Owner/Manager/Seller | STAFF_DENY + DEFER_REMOVE | no learned-template mutation from staff workspace |
| W1-R29 | `DELETE /api/learning/templates/:id` | Owner/Manager | STAFF_DENY + DEFER_REMOVE | unavailable from staff workspace |
| W1-R30 | legacy `POST /api/listings` | Owner/Manager/Seller | STAFF_DENY + DEFER_REMOVE | only canonical project-bound revision writer may create W1+ drafts |
| W1-R31 | legacy `PATCH /api/listings/:id/approve` | Owner/Manager | STAFF_DENY + DEFER_REMOVE | cannot bypass canonical exact-revision QA |
| W1-R32 | `POST /api/listings/:id/submission-handoffs` | Owner | STAFF_DENY + DEFER_REMOVE | old bare-SUBMITTED writer disabled pending W5 replacement |

`STAFF_DENY` means enforcement at server authorization/feature policy, not merely a hidden button. Where an endpoint must remain for old projects during W1, only an explicit developer/admin compatibility policy may reach it; existing marketplace roles alone are insufficient.

## Diagnostic/read routes

| ID | Route | W1 policy | Boundary/test |
|---|---|---|---|
| W1-R40 | `GET /api/evidence` | ADMIN_READ_ONLY + DEFER_REMOVE | no ordinary staff navigation; cannot accept/transition |
| W1-R41 | `GET /api/projects/:id/evidence-health` | ADMIN_READ_ONLY + DEFER_REMOVE | diagnostic only |
| W1-R42 | `GET /api/benchmark/validate` | ADMIN_READ_ONLY + DEFER_REMOVE | provider diagnostic; no workflow authority |
| W1-R43 | `GET /api/learning/templates` | ADMIN_READ_ONLY + DEFER_REMOVE | no mutation controls |
| W1-R44 | `GET /api/master-keywords` | ADMIN_READ_ONLY + DEFER_REMOVE | legacy read only; never canonical MKL writer |
| W1-R45 | analytics/trends reads | ADMIN_READ_ONLY + DEFER_REMOVE | historical diagnostic, no next-action control |
| W1-R46 | `GET /api/mcp/*` capability/status reads | ADMIN_READ_ONLY where retained | provider availability cannot block file workflow |

`ADMIN_READ_ONLY` requires a distinct developer/admin authority or server-side feature flag. `OWNER` business role alone is not automatically developer authority.

## Deferred routes outside W1

| ID | Route family | W1 policy | Reason |
|---|---|---|---|
| W1-R50 | research snapshot/MKL/intelligence creation | KEEP server compatibility; UI not expanded in W1 | activated in W2/W4 after schema repair acceptance |
| W1-R51 | compose/listing revision/Manager QA | KEEP existing reads; no new workflow expansion | W3/W5 scope |
| W1-R52 | submission request/authorization/operator report | old write STAFF_DENY; replacement deferred | W5 authority-chain implementation |
| W1-R53 | YTrends/HeyEtsy live connector writes | DEFER_REMOVE/disabled unless independently certified | W4; provider failure cannot block uploads |

## Required W1 policy tests

```text
W1-T01  Seller sees exactly one writable Amazon path.
W1-T02  Seller sees exactly one writable Etsy path.
W1-T03  retired components are absent from ordinary staff render tree.
W1-T04  Seller direct-call Smart Pull/transition/legacy upload/generator is denied.
W1-T05  Manager cannot use legacy acceptance/approval to bypass canonical flow.
W1-T06  Owner business role alone does not gain developer diagnostic writes.
W1-T07  canonical preview writes zero rows.
W1-T08  canonical confirm persists all valid selected files exactly once.
W1-T09  malformed file is isolated; valid files remain previewable/confirmable.
W1-T10  refresh, relogin, reopen and restart return identical scoped artifacts.
W1-T11  cross-project/workspace/tenant IDs return non-disclosing denial/not-found.
W1-T12  research import succeeds without Product Truth.
W1-T13  old bare-SUBMITTED handoff cannot be called from the new staff path.
```

## Removal boundary

No route is physically deleted in W1. W6 may remove code only after replacement browser proof, historical-read tests, a call/reachability graph showing no active consumer, local/remote recovery authority and explicit cleanup approval.

