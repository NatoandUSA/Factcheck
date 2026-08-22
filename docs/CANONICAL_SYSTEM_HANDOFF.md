# OmniSeller — Canonical System Handoff

> This document is the operational source of truth for the dashboard and its
> research workflow. It records only behaviour supported by source, tests, or
> an explicitly labelled runtime observation. It must not be replaced by a
> walkthrough, a chat summary, or a plausible product-data example.

## 1. Release identity and evidence boundary

| Item | Canonical value | Evidence boundary |
| --- | --- | --- |
| Production release at this handoff | `082d0df3a5d46fc0d1b2c6d98ae9f2e938128655` | Verify through `/api/health.revision`; do not infer from a local branch. |
| Post-merge CI | GitHub Actions run `32562803186` | Exact merge-SHA evidence: native SQLite load, Vite build, and the canonical test suite. |
| Deployment model | Immutable release directory selected through `/home/etsy/omniseller-current` | A release is live only when the symlink, local health, and public health all report the same revision. |
| Database | Persistent SQLite state outside a release directory | A release switch must not modify, restore, or manufacture database evidence. |

`42/42` describes the exact CI suite above. It is not a general claim that
every possible user journey, marketplace policy, or external source is proven.

## 2. System boundary: Dashboard versus 22etsy-agent

| System | Responsibility | Not a substitute for |
| --- | --- | --- |
| OmniSeller Dashboard | Staff-facing Amazon/Etsy research, project state, evidence ledger, MKL, draft, review, and manual export boundary. | A live marketplace feed, supplier truth, or automatic publisher. |
| `22etsy-agent` | Separate Python research/ingestion utility and its own fixtures. | A Dashboard backend dependency until a versioned, authenticated integration contract exists. |
| YTrends MCP | External Etsy research source when available. Responses are observed source data, not Product Truth. | Synthetic fallback market data. |
| Helium 10 exports | Staff-uploaded Xray/Cerebro source artifacts. | Current Amazon live data or an automatic listing approval. |

No Dashboard feature may silently read the local `22etsy-agent` worktree or
claim an agent fixture is production evidence.

## 3. Common workflow contract

Every research action belongs to exactly one tuple:

`tenant_id + workspace_id + marketplace + project_id + seed_phrase`.

The server is authoritative for the first four values. A browser field,
session cache, report filename, URL-derived ASIN, or AI response cannot replace
that authority. With no unambiguous project context, the UI must ask staff to
select/create one or the server must fail closed; it must not attach research to
the newest visible project by guesswork.

Project states are deliberately gates, not an assertion that a marketplace has
accepted a listing:

`EVIDENCE_INTAKE → RESEARCH_ACCEPTED → DNA_ACCEPTED → MKL_FROZEN →
DRAFT_GENERATED → PRODUCT_TRUTH_VERIFIED → MANAGER_APPROVED → PUBLISH_READY`.

Owner/manager approval and the server-side publish gate remain required. There
is no automatic publish path in this contract.

## 4. Amazon workflow — current capability and boundary

### Stage 1 — evidence intake

1. Staff creates/selects an Amazon project and enters a real seed phrase and
   category.
2. Staff obtains independent demand signals (for example Google Trends) and
   records their source/time; unavailable signals stay `UNKNOWN`.
3. Staff uploads one or more H10 Xray reports. The app extracts observed ASIN
   rows, retains parent and child metrics separately, labels metadata as
   source-reported, and creates batches of at most ten ASINs. The first ASIN is
   a staff/source ordering reference, not a claim of marketplace rank.
4. Staff runs the batches in H10 Cerebro and uploads the resulting report. The
   system builds the keyword candidate set and its source timestamps.

Creating a listing directly from Stage 1 is prohibited. Xray fields are not
current product facts, and derived Amazon URLs are navigation references only.

### Stage 2 — research and DNA

1. Staff rechecks trend evidence for the proposed keyword clusters.
2. Staff may learn *style DNA* from a directly supplied, retrievable URL or
   staff-provided source text. DNA is a drafting reference, never Product Truth
   or approval.
3. Xray rows currently remain active-workspace display state. They are **not**
   yet a durable project-scoped selection source for Learning Box after a
   reload/project switch. This is an intentional safety boundary.

### Stage 3 — MKL, draft, and review

1. Staff reconciles Cerebro, trend, and permitted manual evidence into MKL.
   Each keyword needs its source/provenance and intake time; missing metrics are
   `UNKNOWN`, not invented scores.
2. The system can draft a parent plus four child variants, but each output is a
   draft with timestamps and must pass the marketplace/product-type contract.
3. Amazon checks include the server-authoritative marketplace, title field,
   five non-empty bullets where the declared contract requires them, search
   terms present, comma-free and at most 249 UTF-8 bytes, plus available
   economics validation. Missing economics is explicitly `UNKNOWN` under the
   selected policy; it is not a positive margin claim.
4. A+ and product-page content are preview/draft material until Product Truth,
   owner approval, and the final human submission step are complete.

## 5. Etsy workflow — current capability and boundary

### Stage 1 — evidence intake

1. Staff creates/selects an Etsy project and enters a real seed/category.
2. Staff can use a pasted Etsy search result/URL, a manually supplied seller,
   or a successful YTrends MCP retrieval. Sources, timestamps, and unavailable
   fields are kept visible.
3. The scanner may organise up to thirty observed sellers into three batches;
   batch labels are staff workflow groupings, not a fabricated ranking metric.
4. MCP/search data may supply related keywords and listings only when returned
   by the source. A failed retrieval must return unavailable/insufficient
   evidence, not invented tags, sales, prices, or seller facts.

### Stage 2 — research and DNA

1. Recheck trends for proposed keyword groups.
2. Learn listing-style DNA from selected observed seller evidence, a retrievable
   URL, or staff supplied text. It remains a reference only.
3. Keep seller/product truth separate: listing price, origin, delivery, sales,
   conversion, and Star Seller status are `UNKNOWN` unless supplied by the
   recorded evidence.

### Stage 3 — MKL, draft, and review

1. Freeze a dated MKL with sources and staff additions clearly marked.
2. Generate one to three *draft* listings from that MKL; no output is a live
   Etsy claim.
3. The Etsy contract checks its marketplace-specific title, exactly thirteen
   tags of at most twenty characters, description, and applicable evidence.
   Shipping and processing are Product Truth/supplier facts and remain unknown
   without evidence.

## 6. Provenance vocabulary

| State | Meaning | Permitted use |
| --- | --- | --- |
| `SOURCE_REPORTED` / `OBSERVED` | Directly present in a staff artifact or external response, with source/time. | Review and candidate research. |
| `ACCEPTED` | Explicit staff/manager acceptance recorded in the evidence ledger. | Project-state precondition where required. |
| `DERIVED_FROM_ASIN` | Deterministically formed navigation reference. | Link-out only; not seller, price, or listing evidence. |
| `MODELED` | Calculation based on declared assumptions. | Decision support only, never reported as observed commerce fact. |
| `UNKNOWN` / `INSUFFICIENT_EVIDENCE` | Value is absent, ambiguous, stale, or unsupported. | Display and block/require review according to the contract. |

Never render an omitted field as a plausible seller, rating, revenue, Prime,
shipping, personalization, or market metric.

## 7. Removed or deliberately unavailable behaviour

- Browser-wide `sessionStorage` is not evidence storage for Xray.
- URL/ASIN parsing is not permission to invent a title, bullets, price, seller,
  reviews, fulfillment, or product facts.
- Parent sales/revenue are not silently copied to a child ASIN.
- Truthy strings such as `"No"` cannot create a Best Seller badge.
- A local fixture that is not committed is not repeatable CI evidence.

## 8. Outstanding work, owned as separate contracts

1. **Project-scoped Xray Evidence Store.** Persist an immutable artifact record
   and selected observed ASIN rows server-side under the project tuple. Learning
   Box may then read the exact project evidence after reload. Required tests:
   project/workspace isolation, reload, tampered project ID, missing artifact,
   parent-only fields, `false`/`"No"` flags, rating value/count separation, and
   no invented fallback.
2. **Etsy-agent reproducibility repair.** Commit/fixture the data required by
   its documented tests or remove that claim; make the contextual DNA/listing
   factory tests deterministic before representing them as clean.
3. **Operational smoke checklist.** Use the manual, non-publish checklist in
   this document during the observation window and record real results. It must
   never seed fake marketplace performance data.

## 9. Manual smoke checklist during a release observation window

Use a dedicated non-production-like test project, or a clearly labelled draft
project. Do not publish/export.

1. Login and confirm the intended marketplace workspace.
2. Create/select one project; verify its displayed state and seed.
3. Upload or paste a real, non-sensitive evidence artifact; confirm source,
   timestamp, and project attribution.
4. Change to a different project/workspace and confirm the first project's
   evidence is not presented as selectable there.
5. Create a draft only; verify preview/not-live labeling and that no publish or
   export occurs.
6. Confirm health remains `OK`, database `CONNECTED`, and revision unchanged.

Record failures with timestamp, project ID, route/action, and response. Do not
work around a failed gate by changing source data or manually editing the
database.
