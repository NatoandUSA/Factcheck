# OMNISELLER FULL SYSTEM AUDIT & BUG HUNTER — 2026-09-23

## 0. Audit identity

**Audit mode:** repository-wide static audit + GitHub CI/release evidence review.  
**Runtime limitation:** Alex Windows device was offline during this audit. Any finding requiring local/VPS reproduction is marked `RUNTIME_VERIFY_PENDING`.

Exact states:

- **Production / frozen release baseline:** `b911ffbfa590dfee083c572871c1286642dc4f1c`
- **PR #71 release candidate:** `5c99898a2dc3dd0cfc256d5b3b12b707c8d3f5b2`
- **Repository main at audit start:** `b44fc198390c849310bd0dab28cfe920afac2d63`
- **Main CI:** run #426 / `35776249296` / Node 22 / SUCCESS
- **Canonical test inventory:** 116 entrypoints
  - ACTIVE_R43: 76
  - MIGRATION_LINEAGE: 10
  - SECURITY_CONTROL: 11
  - HISTORICAL_COMPATIBILITY: 4
  - HARNESS_RELEASE_OPS: 15
- **Open PRs at audit time:** 0

Critical governance:

```text
LATEST MAIN != RELEASE AUTHORITY DURING GATE C
RELEASE AUTHORITY = b911ffbfa590dfee083c572871c1286642dc4f1c
```

PR #71 is merged in repository history but is intentionally **not production-authorized**.

---

## 1. Methodology and lesson learned

This audit corrects an earlier process failure: architecture recommendations were made before a complete capability inventory had been established. The rule from this audit forward is:

```text
inventory existing capability
→ identify canonical path
→ identify production path
→ identify authority boundary
→ identify actual gap
→ only then propose code
```

A missing capability may not be claimed until code, tests, docs, release lineage, and existing legacy/canonical paths have been searched.

Because production `b911ff...` to PR #71 target `5c99898...` changes only the Global Candidate implementation/UI/test surface, **non-Global-Candidate findings observed on current main are also present in the production code lineage unless explicitly noted otherwise**.

---

## 2. System capability map

### 2.1 Release / runtime

Current implementation includes:

- immutable SHA release directories;
- external production state paths;
- atomic `omniseller-current` symlink switch;
- service stop before DB snapshot;
- WAL-aware DB backup;
- SQLite integrity verification;
- SHA-256 backup manifest;
- local and public exact-revision health checks;
- rollback path;
- machine-readable release receipt;
- mandatory Owner authorization for every release;
- schema fingerprint / migration compatibility gate;
- production startup fail-closed on `OMNI_R43_SINGLE_PATH=1`;
- production prohibition on legacy write override.

**Assessment:** strong release control. No static P0 release bypass found.

### 2.2 Authentication / authorization / isolation

Observed controls:

- server-side session cookies;
- role derived from session/workspace membership, not client role fields;
- OWNER / MANAGER / SELLER route gates;
- tenant + workspace + marketplace scoping on canonical stores;
- CSRF Origin/Referer allowlist;
- CORS exact-origin configuration;
- workspace switching verifies active membership;
- owner re-auth nonce for destructive reset;
- route registry + executable coverage test.

Route inventory: **112 API routes**. Registry test introspects the real Express router and checks every non-public route carries `requireAuth`.

**Assessment:** strong baseline. No static cross-tenant/P0 auth bypass found.

### 2.3 Project / evidence / Product Truth

Existing capabilities:

- canonical research project creation;
- project policy binding;
- project-scoped research imports;
- raw bytes + hash + parser id/hash;
- immutable research snapshots;
- Product Truth revisions and confirmation;
- reusable Product Truth families;
- immutable intelligence snapshots;
- Product Truth / research dependency checks;
- server-derived authority controls;
- evidence health;
- client policy override rejection;
- listing claim guard / Product Truth boundary.

### 2.4 Amazon canonical flow

Existing canonical path:

```text
Project
→ Xray import (optional / ASIN planning)
→ Cerebro import
→ Research Snapshot
→ ASIN Plan (optional convenience artifact)
→ Amazon Master Keywords
→ Product Truth
→ Intelligence Snapshot
→ Listing composition
→ Canonical Review
→ Submission Request
→ Owner Authorization
→ Exact Export
→ Operator Submission Report
```

Cerebro source remains manual CSV/XLSX by design. Helium 10 MCP is **not** a production dependency.

### 2.5 Etsy canonical flow

Existing canonical path is materially richer than a simple CSV parser:

```text
Project
→ Etsy / ytuong.me public capture CSV/HTML
→ Research Snapshot
→ Winner Set
→ Pattern Snapshot
→ optional YTrends supplement
→ Etsy Master Keywords
→ Product Truth
→ Intelligence Snapshot
→ Listing composition
→ Review / authorization / export
```

Existing Etsy field-tier model in `etsyResearchWorkflow.js`:

- **E1_OBSERVED_PUBLIC:** title, shop, price, review count, rating, tags, categories, country, URL, observed rank, badges
- **E2_MODELED_THIRD_PARTY:** sales/views/revenue/conversion/favorites/age-style modeled fields and HeyEtsy-like provider metrics
- **E3_SUPPLEMENTAL_INDEX:** YTrends
- **E4_STAFF_ASSERTED_UNVERIFIED:** unverified staff/manual assertion

YTrends canonical supplement records provider, transport, fetch time, response hash, tools/pulls, and stays supplemental.

### 2.6 Intel / Social Handoff V3

Existing controls include:

- exact source SHA + deployment allowlist;
- canonical JSON;
- HMAC;
- strict short-lived receipt;
- nonce replay defense;
- immutable artifact identity;
- bounded response;
- idempotent receipt;
- `RESEARCH_ONLY`;
- `marketValidationCapability=NOT_CONNECTED`.

Intel production provenance was previously verified:
- Notion is on the actual handoff read path;
- required sources healthy;
- collector connected;
- live sync true.

### 2.7 Global Candidate

Existing layers:

- B2 immutable-ish candidate/evidence pool;
- B3 evaluation / ranking;
- B4 candidate-to-project promotion;
- social handoff projection;
- marketplace research projection;
- project outlier projection;
- evidence snapshots / promotion receipts / idempotency.

PR #71 adds a separate `researchReadiness` axis and makes Project creation depend on readiness instead of legacy disposition.

---

## 3. What is strong and should not be redesigned

The following are existing strengths and should be reused rather than replaced:

1. canonical research import + snapshot store;
2. existing Etsy E1/E2/E3/E4 field authority model;
3. Product Truth revision/confirmation model;
4. immutable listing revisions;
5. dependency revalidation before review/export;
6. Social Handoff V3 cryptographic/provenance boundary;
7. release runbook / exact-SHA Owner authorization;
8. route inventory/security coverage;
9. canonical test inventory with failed/unexecuted accounting;
10. preview-before-write pattern throughout canonical workflows.

No new “replacement architecture” should be introduced for these capabilities.

---

# 4. Findings

Severity meanings:

- **P0:** immediate safety/security/data-integrity stop
- **P1:** blocks the next release or can materially misclassify evidence/authority
- **P2:** important hardening/UX/debt, but not allowed to crowd the release critical path

## P0

### P0 count: 0 from static review

No P0 was established by repository static review. This is not a production runtime certification.

---

## P1-01 — LIVE_PRODUCTION — Etsy MCP route can relabel derived terms as provider-observed

**Surface:** `POST /api/mcp/pull-etsy`  
**Code lineage:** outside #71 diff, therefore present in frozen production lineage.  
**Runtime status:** `RUNTIME_VERIFY_PENDING`.

When provider response has no usable tags/related keywords, the route currently does:

```text
seed phrase
+ chunks derived from listing titles
→ addObservedTag / addRelatedKw
→ observedTags
→ evidenceSource = ETSY_MCP_LIVE
→ evidenceState = OBSERVED
→ persisted market_trends
```

This crosses a provenance boundary: a locally derived phrase is not the same thing as a tag/keyword observed from the provider.

It conflicts with the project rule:

```text
no fabricate
no silently promote
derived != observed
```

### Required remediation

Choose one narrow behavior:

**Preferred:** fail closed when provider returns no usable provider keyword/tag evidence.

or, if business wants derived terms:

```text
source = DERIVED_FROM_PROVIDER_LISTING_TITLE
authority = RESEARCH_ONLY
evidenceState != OBSERVED_PROVIDER_FIELD
```

and never mix those rows into the provider-observed set.

### Required regression

```text
provider listings exist
provider tags = []
provider related keywords = []
→ no locally-derived phrase may be labeled ETSY_MCP_LIVE observed tag
```

If fail-closed is selected, verify zero business write.

**Priority:** fix before using this legacy route as authoritative evidence. If canonical Etsy YTrends supplement fully supersedes the route, retiring/hiding it may be safer than maintaining two semantics.

---

## P1-02 — UNDEPLOYED_#71 — Amazon Research Readiness can be satisfied by the wrong evidence family

PR #71 computes:

- existence of `AMAZON_CEREBRO`;
- `positiveMarket` over **all candidate evidence**;
- `competitionPresent` over **all candidate evidence**.

Therefore a weak Cerebro row can potentially become READY because a same-phrase Project Research projection supplies positive demand/competition.

This violates the intended authority-scoped rule:

```text
Amazon readiness demand/competition
must come from qualifying Amazon readiness evidence
not from an unrelated authority/source family
```

### Required remediation

Closed tuple, deny by default:

```text
AMAZON_CEREBRO
+ MODELED_THIRD_PARTY
+ E2_MODELED_THIRD_PARTY
```

Readiness metrics must be calculated on the qualifying subset only.

Regression:

```text
weak Cerebro + positive PROJECT_RESEARCH
→ NOT_READY
```

---

## P1-03 — UNDEPLOYED_#71 — Etsy query-context candidate loses its result-set support

Current Global Candidate projection:

- tag candidate receives listings containing that tag;
- query-context phrase may be created with `observations=[]`.

Result: the operator's actual search seed may have `listingCount=0`, while a secondary tag receives supporting observations and may become READY.

### Required model

```text
SEARCH QUERY CANDIDATE
→ attach full captured result set for that query

TAG CANDIDATE
→ attach only listings supporting that tag
```

This should reuse the existing Etsy research snapshot and field provenance, not invent a parallel Etsy evidence model.

---

## P1-04 — UNDEPLOYED_#71 / SPEC GAP — Research Readiness is not yet Authority × Integrity × Sufficiency

The repo-bound Gate C V1 spec defines readiness as:

```text
AUTHORITY × INTEGRITY × SUFFICIENCY
```

PR #71 implements an initial authority/source test and simple signal sufficiency, but does not yet enforce:

- explicit parser integrity outcome;
- degraded/invalid/unknown parser fail-closed semantics;
- source freshness policy.

### Important implementation constraint

Existing canonical import model stores:

- raw bytes/hash;
- parser id/hash;
- header signature;
- `imported_at`.

It does **not** currently preserve a trusted source capture/export timestamp as a first-class import fact.

Therefore:

- do not infer source freshness from filename;
- do not pretend `imported_at` is source capture time;
- decide the smallest provenance extension before code;
- if the business decides freshness should be advisory instead of readiness-blocking, update the repo-bound spec first.

### Integrity reuse

Do not invent a second parser subsystem. Existing adapters already expose accounting/header/sheet diagnostics. Derive an explicit integrity outcome from those canonical diagnostics.

---

## P1-05 — UNDEPLOYED_#71 — Etsy readiness threshold is semantically too weak

Current #71 condition is effectively:

```text
ETSY_PUBLIC_SEARCH exists
+ listingCount > 0
+ competition signal exists
→ READY
```

Because listing count itself is treated as a competition signal, a minimally populated capture can become READY.

Correct principle:

```text
zero/missing alone must not cause KILL
but "not KILL" does not imply READY
```

### Required remediation

Sufficiency should be based on the existing parser/capture contract:

- exact query/candidate relevance;
- usable result-set coverage;
- candidate support breadth;
- explicit parser integrity;
- no known truncation/drift.

Do not invent arbitrary listing-count thresholds in code without a known-good capture baseline.

---

## P2-01 — LIVE_PRODUCTION — generic YTrends MCP call surface is broader than required

`POST /api/mcp/call` accepts OWNER/MANAGER `toolName + args` and passes them to `ytrendsMcp.callTool`.

The MCP client validates that required research tools are present, but `callTool` itself is generic.

Current YTrends appears research-oriented, so this is not classified P1. However, if provider tool inventory later adds a mutating tool, this route could invoke it.

### Hardening

Prefer:
- explicit read-only allowlist, or
- remove generic route from staff product UI and keep typed research routes only.

---

## P2-02 — LIVE_PRODUCTION — canonical and legacy Etsy UI disagree about YTrends availability

Legacy `EtsyWorkspace.jsx` hardcodes:

```js
const YTRENDS_CONNECTOR_READY = false;
```

and shows a disabled connector message.

Meanwhile canonical `CanonicalCommerceWorkflow.jsx` already performs:

```text
/api/projects/:id/etsy/patterns/ytrends
→ SERVER_DIRECT
→ BROWSER_DIRECT fallback
```

This is a dual-surface truth/UX drift.

### Action

Do not “fix” canonical YTrends. Consolidate/hide the obsolete legacy status surface after the release blocker is closed.

---

## P2-03 — LIVE_PRODUCTION — H10 MCP routes are misleading capability surface

Repo contains:

- `/api/mcp/h10/status`
- `/api/mcp/h10/tools`
- H10 MCP client code

but owner operational reality is manual Cerebro CSV/XLSX; H10 MCP is unavailable and explicitly not a canonical dependency.

### Action

Do not integrate H10 MCP. Mark the surface legacy/unsupported or remove/hide it in a later cleanup PR.

---

## P2-04 — DOC_DRIFT — Global Candidate B4 documentation is stale

An older B4 doc still states that only `advisoryDisposition=PROMOTE` can create a Project, while #71 changes promotion authority to `researchReadiness=READY`.

Update the document only when the successor behavior is finalized, so documentation does not outrun code again.

---

## P2-05 — LIVE_PRODUCTION / UX — "Reset Database" wording overstates actual behavior

The route and UI describe a broad database reset, but the protected route currently deletes scoped `listings` only, then appends an audit event.

This is safer than deleting more data, but operator wording can create the wrong expectation that trends/templates/research were also erased.

### Action

Rename UI/action to "Reset/Delete listings in current workspace" unless broader reset is intentionally designed and separately authorized.

---

## P2-06 — LEGACY_DEBT — duplicate product surfaces remain visible

Production still carries canonical and legacy/optional paths:

- legacy stage controls;
- Smart Pull / learning / quick-draft-era surfaces;
- generic MCP routes;
- old listing edit/approve/export routes, many fail-closed under R4.3.

This is not automatically a bug: much of it is intentionally preserved during migration. The problem is operator comprehension when both canonical and legacy UI remain visible.

### Action

After the next release is stable, perform a **surface consolidation audit**, not an architecture rewrite:
- canonical;
- optional research;
- historical/hidden;
- retired.

---

# 5. PR #71 five-point review

## 5.1 One-click Preview → Confirm provenance

**Static verdict: PASS with wording note.**

- preview route remains zero-write;
- confirm reparses the file;
- original source classification is preserved;
- no staff attestation upgrade;
- no commercial-proof upgrade;
- API still reports no decision/promotion authority at research import.

UX should accurately say that "Phân tích cơ hội" also persists canonical research evidence after successful zero-write validation.

## 5.2 Research Readiness authority

**Static verdict: BLOCKED by P1-02 / P1-03 / P1-05.**

## 5.3 Intel influence

**Static verdict: acceptable.**

`SOCIAL_LISTENING` is RESEARCH_ONLY and carries no marketplace commercial metrics. Intel can affect WhyNow/context/legacy ranking, but it does not directly satisfy #71 marketplace readiness.

Target policy remains:

```text
Intel-only
→ Opportunity / Investigation Queue
→ NOT a marketplace-ready Project
```

## 5.4 Commercial Proof separation

**Static verdict: PASS.**

Cerebro modeled evidence does not establish commercial proof. Project research readiness may exist while commercial proof remains `NOT_ESTABLISHED`.

## 5.5 Legacy disposition side effects

**Static verdict: non-blocking compatibility surface.**

Disposition remains:
- ranking tie-break/context;
- promotion snapshot metadata;
- technical UI detail.

It no longer has to decide Project creation once readiness semantics are corrected.

---

# 6. Bug-hunter checks that were explicitly performed

Repository-wide checks included:

- route enumeration;
- auth/role registry;
- legacy-write gates;
- direct DB write surfaces;
- random/non-deterministic code search;
- stale/deprecated routes;
- Product Truth authority controls;
- Social Handoff V3 verification;
- immutable snapshot/revision stores;
- release authorization path;
- schema/migration controls;
- canonical test inventory;
- Amazon/Etsy research workflows;
- YTrends server/browser transport;
- Intel bridge;
- Global Candidate B2/B3/B4;
- listing review/submission lifecycle;
- current main vs production vs #71 diff.

Current main CI proves the current repository builds and passes its canonical suite; it does **not** prove the newly identified semantic gaps are covered.

---

# 7. Runtime verification still required when Alex is online

The following are intentionally not claimed as executed:

1. reproduce P1-01 against a controlled fake/no-tag YTrends response;
2. inspect current production DB/schema exact state;
3. verify YTrends production environment/token/transport behavior;
4. run targeted successor tests on Node 22 local/clean worktree;
5. run full 116-entry suite on successor exact head;
6. VPS deploy/rollback smoke for any new release.

---

# 8. Current release ruling

```text
PRODUCTION
b911ffbfa590dfee083c572871c1286642dc4f1c

CURRENT MAIN
b44fc198390c849310bd0dab28cfe920afac2d63

PR #71
MERGED IN HISTORY
NOT DEPLOYED
NOT RELEASE-AUTHORIZED

DEPLOY #71 AS-IS
HOLD
```

Reason: #71 direction is useful, but authority-scoped sufficiency and Etsy candidate semantics need correction before production. Parser integrity/freshness needs an explicit repo-bound implementation decision, not an improvised patch.

