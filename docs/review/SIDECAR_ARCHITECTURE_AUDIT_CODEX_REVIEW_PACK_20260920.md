# OmniSeller Global Opportunity Sidecar — Architecture Audit / Codex Review Pack

**Audit date:** 2026-09-20  
**Review branch:** `review/global-opportunity-v2-isolated-20260919`  
**Sidecar HEAD:** `27dc5ac132b9ab5e891f104908b1c709e696a251`  
**Observed origin/main:** `2ad46a5e0feb90f1240fbfd082afb18b2c88d445`  
**Observed active PR #59 HEAD:** `5d8be86527487faf8d27b6cd1deb96c7052ce38f`  
**PR #59:** OPEN / MERGEABLE / Node 22 canonical CI SUCCESS, run `35459370251`  
**Review branch PR:** NONE

## 0. Executive ruling

This branch is useful as a **review/reference implementation**, but it **must not be merged wholesale**.

There are two materially different layers in its ancestry:

1. **Inherited operational Global Opportunity V2 hardening** from the older PR #58 line, through commit `4b043cd91`. This modifies operational store/migrations/server/UI/canonical tests.
2. **Eight isolated pure sidecar slices**, commits `5a4bf8c62..27dc5ac13`, adding only new modules, review-only tests, and review docs. These slices have no runtime wiring.

The correct Codex review unit is therefore the **eight pure commits**, not the whole branch ancestry.

### Recommended integration posture

**Preferred:** after PR #59 is integrated and a new clean main SHA is established, create a fresh branch from that main and either:
- reimplement the accepted contracts against current canonical utilities; or
- selectively cherry-pick only the eight pure commits, then immediately refactor shared hashing/authority registries before runtime wiring.

Do **not** merge `review/global-opportunity-v2-isolated-20260919` directly into main.

---

## 1. Measured branch composition

### 1.1 Pure sidecar slice

Diff `4b043cd91..27dc5ac13`:

- **24 new files**
- **3,119 insertions**
- 8 pure modules
- 8 review-only tests
- 8 focused review packets
- no route/migration/React/runtime wiring

Pure commit chain:

| Commit | Slice |
|---|---|
| `5a4bf8c62` | Cluster Engine V1 |
| `7955741e0` | Import Normalizer V1 |
| `ed0ca2fe2` | Discovery Proposal Pipeline V1 |
| `b64bd9959` | Review Dashboard Model V1 |
| `e8af60ef3` | Review UI Contract / ViewModel V1 |
| `33b59b9bf` | Decision Boundary Contract V1 |
| `c0d45d0c6` | Review Artifact Ledger V1 |
| `27dc5ac13` | Canonical Handoff Packet V1 |

### 1.2 Inherited operational layer — not part of the pure sidecar acceptance unit

Diff `origin/main..4b043cd91`:

- **6 modified files**
- **497 insertions / 100 deletions**
- operational DB/store/server/UI/test changes

Files:

```text
server/database/globalOpportunityStore.js
server/database/migrations.js
server/server.js
src/components/MarketIntelligenceWorkspace.jsx
tests/test_global_opportunity_bulk_v2.cjs
tests/test_global_opportunity_discovery.cjs
```

This inherited layer requires a separate adjudication against the then-current main. It must not gain acceptance merely because the pure sidecar contracts are accepted.

---

## 2. Module inventory

| Module | Input | Output authority | Writes state? | Runtime wired? |
|---|---|---|---:|---:|
| `globalOpportunityClusterEngine.js` | keyword list + optional review overrides | `PROPOSAL_ONLY` clusters | No | No |
| `globalOpportunityImportNormalizer.js` | parsed bulk-import output | normalized proposal batches | No | No |
| `globalOpportunityProposalPipeline.js` | normalized import candidates | discovery proposal | No | No |
| `globalOpportunityReviewDashboardModel.js` | discovery proposal | explanation/dashboard model | No | No |
| `globalOpportunityReviewViewModel.js` | dashboard model + query | read-only UI ViewModel | No | No |
| `globalOpportunityDecisionBoundary.js` | ViewModel + review intent | `REVIEW_ONLY` envelope | No | No |
| `globalOpportunityReviewArtifactLedger.js` | review envelope + prior in-memory ledger | immutable review ledger snapshot | No persistence | No |
| `globalOpportunityCanonicalHandoffPacket.js` | ViewModel + ledger + request artifact | `READ_ONLY_HANDOFF` packet | No | No |

Review tests live in `review_tests/`, intentionally outside the canonical test inventory.

---

## 3. Dependency graph

```text
globalOpportunityImportNormalizer
             │
             ├───────────────┐
             │               │
             ▼               ▼
globalOpportunityProposalPipeline ◄──── globalOpportunityClusterEngine
             │
             ▼
   Review Dashboard Model
             │
             ▼
    Review UI ViewModel
             │
             ▼
     Decision Boundary
             │
             ▼
   Review Artifact Ledger
             │
             ▼
 Canonical Handoff Packet
             │
             ▼
 Canonical OmniSeller authority
       [NOT CONNECTED]
```

Code-level dependency is intentionally looser than the conceptual graph:

- Proposal Pipeline directly requires Import Normalizer + Cluster Engine.
- Canonical Handoff Packet directly requires the Ledger verifier.
- Dashboard, ViewModel, Decision Boundary and Ledger otherwise consume plain data contracts rather than importing the upstream module.
- This lowers coupling, but increases the importance of schema/hash version discipline.

---

## 4. Authority matrix

| Capability | Parser/Normalizer/Cluster | Dashboard/ViewModel | Decision Boundary | Ledger | Handoff Packet | Canonical Omni |
|---|---:|---:|---:|---:|---:|---:|
| Observe/import descriptive evidence | Proposal | Display | Reference | Record ref | Carry ref | Revalidate |
| Group keywords | Propose | Explain | Propose merge/split | Record proposal | Carry context | Decide if adopted |
| Review note / flag | No | Display | Propose | Record | Carry | Optional consume |
| Proof gate | **No** | **No** | **No** | **No** | **No** | Yes |
| Candidate status | **No** | **No** | **No** | **No** | **No** | Yes |
| QUALIFIED / PROMOTE_TO_PROJECT | **No** | **No** | **No** | **No** | **No** | Yes |
| Create/mutate Project | **No** | **No** | **No** | **No** | **No** | Yes |
| Product Truth | **No** | **No** | **No** | **No** | **No** | Yes |
| MKL mutation/freeze | **No** | **No** | **No** | **No** | **No** | Yes |
| Listing approval | **No** | **No** | **No** | **No** | **No** | Yes |
| Publish/export authority | **No** | **No** | **No** | **No** | **No** | Yes |
| Invoke canonical workflow | **No** | **No** | **No** | **No** | **No** | Canonical-owned |

The intended invariant is simple: **sidecar outputs may inform canonical review, but never become canonical truth or operational authority by themselves.**
---

## 5. Contract invariants

### I-01 — No existing Project mutation
Bulk/global discovery remains outside project-bound operational state until canonical Omni explicitly creates a new Project.

### I-02 — Research evidence is not Product Truth
Keywords, trends, inferred clusters and commercial signals never become Product Truth merely by passing through the sidecar.

### I-03 — Descriptive commercial signal is not proof-gate authority
The sidecar distinguishes:
- commercial-source schema authority;
- positive commercial metric observation;
- canonical proof-gate decision.

Only the first two are descriptive sidecar concepts. The third remains canonical-only.

### I-04 — Unknown / missing remains unknown
No missing commercial metric is coerced into a positive proof value. Negative metrics are rejected to null/UNKNOWN in the isolated normalizer.

### I-05 — Trend/social metrics cannot become marketplace sales proof
YTrend/generic revenue-like fields remain non-commercial WATCH-style signals in the proposal layer.

### I-06 — Duplicate conflicts fail closed
Same normalized keyword + same source family + materially different metrics is quarantined as `REVIEW_DUPLICATE_CONFLICT`; no convenient value wins.

### I-07 — Review UI is read-only
```text
readOnly = true
mutationsExposed = []
canonicalGateAuthority = false
createProjectEnabled = false
productTruthEnabled = false
publishEnabled = false
```

### I-08 — Review intents never execute
Decision envelopes are:
```text
authority = REVIEW_ONLY
recordableAsReviewArtifact = true
executableByReviewLayer = false
```

### I-09 — Review ledger is append-only and separate
The current module creates immutable in-memory snapshots only. Any future persistence must remain in a dedicated review/audit namespace, not operational Global Opportunity tables.

### I-10 — Handoff is not a command
```text
authority = READ_ONLY_HANDOFF
sidecarMayInvokeCanonicalWorkflow = false
sidecarMayMutateCanonicalState = false
canonicalSystemMustReevaluateIndependently = true
```

### I-11 — Hash binding is integrity, not authority
Hashes detect contract mutation. They do not certify that evidence is true or sufficient for a canonical decision.

### I-12 — Canonical Omni must independently re-evaluate
Even a valid packet can only be used as review input.

---

## 6. Integrity chain

```text
Normalized import
    │ normalizationHash
    ▼
Discovery proposal
    │ proposalHash
    ▼
Dashboard model
    │ modelHash
    ▼
Review ViewModel
    │ viewHash
    ▼
Decision envelope
    │ envelopeHash
    ▼
Review ledger entry chain
    │ entryHash / tailHash / ledgerHash
    ▼
Canonical handoff packet
    │ packetHash
    ▼
Independent canonical re-evaluation
```

The chain protects snapshot integrity and lineage. It intentionally does **not** convert review evidence into canonical truth.

---

## 7. Full audit findings / known risks

### P1 — Whole-branch merge is unsafe
The isolated branch inherits operational PR #58 changes before the pure sidecar commits.

**Impact:** merging the branch wholesale would also merge DB/server/UI behavior that Codex has not adjudicated against current main.

**Required treatment:** cherry-pick/reimplement only accepted pure commits on a fresh post-PR59 branch. Review inherited operational changes separately.

### P1 — Shared serializer/hash logic is duplicated
Several pure modules implement local variants of `stable()`, `sha256()`, `deepFreeze()`.

**Impact:** future serializer drift could make otherwise compatible contracts produce different hashes.

**Required treatment before runtime integration:** replace local serializers with one canonical Omni serializer/versioned hash utility and add cross-module hash vectors.

### P1 — Review tests are not Node 22 canonical CI authority
The review tests intentionally live outside `tests/`, because the canonical harness rejects unregistered tests.

Current local environment is Windows Node 24. The eight review tests pass locally, but that is **not equivalent to Node 22 canonical CI**.

**Required treatment:** when Codex accepts any slice, run those tests under Node 22 in a dedicated CI job or explicitly register the accepted tests in the canonical inventory.

### P1 — Source authority fingerprint is deliberately narrow/local
Import Normalizer currently uses source-specific header fingerprints such as CEREBRO `Keyword Sales`.

**Impact:** real export schema evolution could false-negative; a weak future heuristic could false-positive.

**Required treatment:** canonical source-signature registry, versioned per provider/export schema, before runtime authority is granted.

### P1 — Metadata safety is currently a deny-list contract
Review Artifact Ledger blocks known canonical metadata aliases, but arbitrary neutral scalar metadata remains allowed.

**Impact:** a future consumer could mistakenly assign authority to an unforeseen metadata name.

**Required treatment:** canonical consumer must ignore metadata for decisions. Prefer a versioned allow-list or namespaced `review.*` metadata schema before persistence.

### P2 — Cluster taxonomy is heuristic
Product-family hints and intent taxonomy are module-local, deterministic heuristics.

**Impact:** semantic false merge/split remains possible.

**Mitigation:** `PROPOSAL_ONLY`; human merge/split proposals; canonical adoption remains separate.

### P2 — Greedy clustering is not a semantic ontology
Stable input ordering makes output deterministic, but transitive semantic grouping can still differ from a more sophisticated clustering method.

**Treatment:** keep explanation lineage; compare against canonical/ML clustering only as a proposal.

### P2 — Local intent deny-list can lag canonical vocabulary
Decision Boundary explicitly lists canonical-only actions and rejects unknown actions.

**Safety posture:** drift fails closed, so this is primarily maintenance risk rather than fail-open risk.

**Treatment:** derive from one shared canonical authority registry if integrated.

### P2 — Conflict targeting is coupled to current ViewModel pagination/filter
Decision Boundary validates `CONFLICT` targets against currently exposed `conflictTable.rows`.

**Impact:** a conflict that exists in the model but is not on the current ViewModel page/filter cannot receive a review artifact through this contract.

**Treatment:** before UI integration, expose a stable `conflictsById` review index independent of pagination, or formally restrict conflict artifact creation to visible rows.

### P2 — Ledger timestamps are caller supplied
This is intentional for deterministic/replayable contracts, but caller time is not independently trusted.

**Treatment:** if persisted, canonical storage should add server receipt time separately without changing the immutable artifact payload.

### P2 — Reviewer identity is currently an opaque string by convention only
`reviewerRef` is required but not bound to canonical identity.

**Treatment:** persistence layer should supply immutable actor ID/session audit identity; never trust a display name from client input.

### P2 — Handoff evidence is descriptive, not refreshed
The packet carries lineage refs from the reviewed snapshot.

**Treatment:** canonical consumer should refetch/revalidate current evidence before any operational decision.

---

## 8. PR #59 overlap analysis

Current PR #59 touches:

```text
server/server.js
src/App.jsx
src/components/CanonicalCommerceWorkflow.jsx
src/components/ProductListingPageSimulator.jsx
src/utils/canonicalReviewPackage.js
src/utils/draftQualityEvaluator.js
tests/canonical_test_inventory.json
tests/test_draft_quality_evaluator.cjs
tests/test_exact_preview_resolution.cjs
tests/test_g4_canonical_commerce_ui.cjs
tests/test_g4_etsy_canonical_http.cjs
```

The **pure eight-commit sidecar slice adds new files only** and does not modify those PR #59 files.

However, the **full branch ancestry** contains inherited changes to `server/server.js`. This is another reason a whole-branch merge is prohibited.

PR #59 should remain the current Omni development authority until its own integration path is complete.
---

## 9. Test matrix

Latest targeted audit run:

| Test | Result |
|---|---|
| `GLOBAL_OPPORTUNITY_CLUSTER_ENGINE_V1` | PASS |
| `GLOBAL_OPPORTUNITY_IMPORT_NORMALIZER_V1` | PASS |
| `GLOBAL_DISCOVERY_PROPOSAL_PIPELINE_V1` | PASS |
| `GLOBAL_REVIEW_DASHBOARD_MODEL_V1` | PASS |
| `GLOBAL_REVIEW_UI_CONTRACT_V1` | PASS |
| `GLOBAL_DECISION_BOUNDARY_V1` | PASS |
| `GLOBAL_REVIEW_ARTIFACT_LEDGER_V1` | PASS |
| `GLOBAL_CANONICAL_HANDOFF_PACKET_V1` | PASS |
| Existing `GLOBAL_OPPORTUNITY_BULK_V2` | PASS |
| Existing `GLOBAL_OPPORTUNITY_DISCOVERY_V1` | PASS |
| `git diff --check` | PASS |

### What these tests prove

They cover, among other cases:

- product-family boundary separation;
- deterministic clustering and shuffled-input stability;
- human merge/split override semantics;
- source authority fail-closed behavior;
- YTrend commercial-metric stripping;
- negative metric rejection;
- exact duplicate accounting;
- conflicting duplicate quarantine;
- deep immutability;
- proposal/model/ViewModel hash integrity;
- read-only UI contract;
- canonical-intent blocking;
- merge related-target validation;
- immutable ledger hash chain;
- metadata alias/collision checks;
- handoff request type enforcement;
- full ledger verification inside handoff;
- self-consistent authority escalation rejection;
- evidence lineage hash validation.

### What they do not prove

- Node 22 compatibility of the new review-only test suite;
- production load/performance at very large global-pool scale;
- semantic quality of clusters across real multi-million-keyword datasets;
- compatibility with a future canonical serializer;
- correctness of any future DB persistence schema;
- correctness of any future endpoint/UI wiring;
- successful integration onto main after PR #59.

---

## 10. Integration options

### Option A — Reimplement accepted contracts on fresh post-PR59 main — **preferred**

Use this pack as the specification, then implement only Codex-approved contracts against current canonical utilities.

**Advantages**
- zero inherited PR #58 ancestry;
- easiest opportunity to use canonical serializer/authority registry from day one;
- minimal accidental coupling.

**Cost**
- more engineering effort;
- requires comparing the reference implementation carefully.

### Option B — Selectively cherry-pick the eight pure commits

Candidate range:

```text
5a4bf8c62  Cluster Engine
7955741e0  Import Normalizer
ed0ca2fe2  Proposal Pipeline
b64bd9959  Dashboard Model
e8af60ef3  Review ViewModel
33b59b9bf  Decision Boundary
c0d45d0c6  Review Artifact Ledger
27dc5ac13  Canonical Handoff Packet
```

Then refactor shared serializer/hash/authority definitions before runtime use.

**Advantages**
- preserves tested reference code;
- commits are new-file-only within the pure slice.

**Risk**
- local contract utilities and assumptions may not match the post-PR59 canonical architecture.

### Option C — Accept only selected lower layers

Examples:
- adopt only Cluster + Normalizer + Proposal Pipeline;
- adopt only Review Model/ViewModel;
- adopt only Decision/Ledger/Handoff contracts.

This is valid because most layers communicate through plain immutable data structures.

### Option D — Merge entire isolated branch — **NOT ACCEPTABLE**

This would include inherited operational PR #58 changes. Do not use this integration path.

---

## 11. Recommended Codex adjudication by slice

| Slice | Suggested review question | Gate before adoption |
|---|---|---|
| Cluster Engine | Is deterministic heuristic clustering useful as proposal-only assistance? | taxonomy review + real-data evaluation |
| Import Normalizer | Is source authority/fail-closed duplicate handling aligned with canonical evidence rules? | canonical source signature registry |
| Proposal Pipeline | Is composition boundary clean enough to remain non-operational? | shared serializer |
| Dashboard Model | Are explanation codes descriptive and non-authoritative? | schema/version review |
| UI ViewModel | Should UI receive a framework-neutral read-only contract? | conflict index decision |
| Decision Boundary | Is this the correct hard boundary around review intent? | canonical authority registry |
| Artifact Ledger | Should review artifacts be persisted separately? | dedicated immutable storage design + actor identity |
| Handoff Packet | Is a read-only request packet the only bridge to canonical review? | canonical revalidation protocol |

---

## 12. Exact pre-integration checklist

Codex should not integrate any slice until all checked items for that slice are satisfied.

### Repository/base
- [ ] PR #59 integration state is resolved.
- [ ] Fetch latest `origin/main`.
- [ ] Record exact new main SHA.
- [ ] New integration worktree is clean.
- [ ] Node runtime is exactly supported Node 22.
- [ ] No work is performed in the dirty historical primary worktree.

### Ancestry isolation
- [ ] Confirm integration branch starts from new main, not this isolated branch.
- [ ] Confirm inherited commits through `4b043cd91` are absent unless separately adjudicated.
- [ ] Confirm only explicitly accepted pure commits/files are introduced.
- [ ] Run `git diff --name-status <new-main>...HEAD` and manually review every file.

### Contract foundations
- [ ] Choose one canonical stable serializer/hash implementation.
- [ ] Add hash-version identifier or canonical serializer version.
- [ ] Replace duplicated local `stable/sha256/deepFreeze` where appropriate.
- [ ] Define canonical source-signature registry.
- [ ] Define canonical authority/action registry.
- [ ] Decide conflict stable-index semantics independent of pagination.
- [ ] Decide review metadata allow-list / namespace.
- [ ] Decide immutable reviewer actor identity format.

### Test authority
- [ ] Run all accepted review tests under Node 22.
- [ ] Decide whether accepted tests enter canonical inventory or a dedicated review-sidecar CI job.
- [ ] Run complete canonical suite under Node 22.
- [ ] Run production build.
- [ ] Run `git diff --check`.
- [ ] Add cross-version hash vectors.
- [ ] Add tamper/adversarial tests for every boundary crossing.

### Persistence — only if Ledger is accepted
- [ ] Dedicated review ledger storage, separate from operational Global Opportunity tables.
- [ ] Append-only semantics enforced at storage layer.
- [ ] No UPDATE/DELETE path for immutable artifact body.
- [ ] Server receipt timestamp stored separately from immutable caller `recordedAt`.
- [ ] Reviewer identity server-owned.
- [ ] Backup/restore preserves entry chain exactly.
- [ ] No operational trigger derives candidate/Project/Product Truth state from ledger metadata.

### Canonical handoff — only if Handoff is accepted
- [ ] No sidecar endpoint can directly call project creation/promotion/publish.
- [ ] Canonical consumer re-verifies packet hash and ledger chain.
- [ ] Canonical consumer independently refetches/revalidates evidence.
- [ ] Handoff request remains a request, not approval.
- [ ] Canonical decision produces a separate canonical artifact/audit record.
- [ ] Packet/ledger hashes are retained only for lineage, never as proof sufficiency.

### UI — only if ViewModel is accepted
- [ ] UI renders only contract fields.
- [ ] No hidden mutation handler exists behind review buttons.
- [ ] Merge/split controls create review proposals only.
- [ ] Canonical evaluation button creates request artifact only.
- [ ] No button sets QUALIFIED/PROMOTE_TO_PROJECT/Product Truth/publish.
- [ ] Conflict selection works independently of table pagination if artifact creation is supported.

### Release
- [ ] Exact integration SHA recorded.
- [ ] Exact Node 22 CI run recorded.
- [ ] Independent audit performed after integration.
- [ ] Full bug-hunter pass against adjacent project/Product Truth/MKL/publish boundaries.
- [ ] Production remains unchanged until explicit release authority approves deployment.

---

## 13. Explicit rejection criteria

Codex should reject or request redesign if any proposed integration:

1. directly merges the current isolated branch into main;
2. permits research/global evidence to become Product Truth automatically;
3. permits sidecar review to set proof gate/candidate canonical status;
4. lets a review artifact trigger Project creation directly;
5. lets a handoff packet function as an executable command;
6. trusts client-provided source labels as sufficient commercial authority;
7. treats YTrend/social revenue-like data as marketplace proof;
8. persists review artifacts in operational tables without strict separation;
9. accepts packet/hash validity as evidence sufficiency;
10. introduces a canonical mutation path that is not covered by Node 22 adversarial regression tests.

---

## 14. Suggested Codex review order

Review in dependency order, but adjudicate authority boundaries before UI polish:

```text
1. Import Normalizer
2. Cluster Engine
3. Proposal Pipeline
4. Decision Boundary
5. Review Artifact Ledger
6. Canonical Handoff Packet
7. Review Dashboard Model
8. Review ViewModel
```

Rationale: first settle evidence semantics and authority; only then settle how those facts are explained/rendered.

---

## 15. Final measured state

At pack generation:

```text
ISOLATED HEAD: 27dc5ac132b9ab5e891f104908b1c709e696a251
ORIGIN/MAIN:   2ad46a5e0feb90f1240fbfd082afb18b2c88d445

PR #59 HEAD:  5d8be86527487faf8d27b6cd1deb96c7052ce38f
PR #59:       OPEN / MERGEABLE
NODE 22 CI:   SUCCESS
CI RUN:       35459370251

REVIEW BRANCH PR: NONE
WORKTREE: CLEAN before this pack
```

### Audit conclusion

The sidecar demonstrates a coherent **non-authoritative discovery → review → immutable audit → read-only handoff architecture**.

The architecture's strongest property is that every later layer explicitly loses, rather than gains, operational authority.

Its biggest integration risk is **not** the pure modules themselves; it is accidental ancestry/runtime coupling if the current branch is merged as a unit, plus duplicated local serializer/registry concepts that should be replaced by canonical Omni utilities before production wiring.

Treat this repository branch as a **reference specification and tested prototype**, not a merge-ready release branch.
