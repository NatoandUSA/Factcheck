# CODEX MERGE HANDOFF — OmniSeller Global Opportunity Sidecar

**Date:** 2026-09-20  
**Repository:** `NatoandUSA/Factcheck`  
**Sidecar branch:** `review/global-opportunity-v2-isolated-20260919`  
**Sidecar HEAD:** `2b6e9505acca88633db1ddc3e00c784be7b4c4b3`  
**Observed origin/main:** `2ad46a5e0feb90f1240fbfd082afb18b2c88d445`  
**Active PR #59 HEAD at handoff creation:** `3abf1d9987a1f34e7d3762f76465e093300ff3a0`  
**PR #59 state:** OPEN / MERGEABLE / Node 22 CI was IN_PROGRESS at handoff creation.

## Objective

Review the isolated Global Opportunity sidecar architecture, accept/reject each slice independently, and integrate only approved parts into OmniSeller **after PR #59 is resolved and a fresh main SHA is established**.

This sidecar is a review/reference implementation. **Do not merge the branch wholesale.**

## Mandatory isolation rule

The sidecar branch contains older inherited operational Global Opportunity hardening before the pure sidecar commits. Therefore:

- DO NOT merge `review/global-opportunity-v2-isolated-20260919` directly into `main`.
- DO NOT merge or rebase the sidecar into active PR #59.
- DO NOT cherry-pick inherited commits through `4b043cd91` unless they are separately adjudicated.
- DO create a fresh integration branch/worktree from the then-current `origin/main` after PR #59 is resolved.
- DO integrate only explicitly accepted pure commits or reimplement the contracts on fresh main.

## Authoritative review pack

Read first:

```text
docs/review/SIDECAR_ARCHITECTURE_AUDIT_CODEX_REVIEW_PACK_20260920.md
docs/review/SIDECAR_ARCHITECTURE_MANIFEST_V1_20260920.json
```

Then read the focused packets for each slice:

```text
docs/review/GLOBAL_OPPORTUNITY_CLUSTER_ENGINE_V1_REVIEW_20260919.md
docs/review/GLOBAL_OPPORTUNITY_IMPORT_NORMALIZER_V1_REVIEW_20260920.md
docs/review/GLOBAL_DISCOVERY_PROPOSAL_PIPELINE_V1_REVIEW_20260920.md
docs/review/GLOBAL_REVIEW_DASHBOARD_MODEL_V1_REVIEW_20260920.md
docs/review/GLOBAL_REVIEW_UI_CONTRACT_V1_REVIEW_20260920.md
docs/review/GLOBAL_DECISION_BOUNDARY_V1_REVIEW_20260920.md
docs/review/GLOBAL_REVIEW_ARTIFACT_LEDGER_V1_REVIEW_20260920.md
docs/review/GLOBAL_CANONICAL_HANDOFF_PACKET_V1_REVIEW_20260920.md
```

## Pure sidecar commits eligible for adjudication

These are the eight pure, new-file-only implementation commits:

```text
5a4bf8c62  feat: add isolated proposal-only cluster engine
7955741e0  feat: add isolated import normalization proposal
ed0ca2fe2  feat: add isolated discovery proposal pipeline
b64bd9959  feat: add isolated review dashboard model
e8af60ef3  feat: add isolated review UI contract view model
33b59b9bf  feat: add isolated decision boundary contract
c0d45d0c6  feat: add isolated review artifact ledger contract
27dc5ac13  feat: add isolated canonical handoff packet contract
```

Documentation-only review pack:

```text
2b6e9505a  docs: add sidecar architecture Codex review pack
```

## Inherited operational ancestry — separate review only

The sidecar branch also inherits changes through:

```text
4b043cd917c240946a7444f78e896ce9b1109984
```

That inherited layer modifies:

```text
server/database/globalOpportunityStore.js
server/database/migrations.js
server/server.js
src/components/MarketIntelligenceWorkspace.jsx
tests/test_global_opportunity_bulk_v2.cjs
tests/test_global_opportunity_discovery.cjs
```

Do not treat these inherited changes as accepted merely because the pure sidecar architecture is accepted.

## Sidecar dependency chain

```text
Import Normalizer
      ↓
Cluster Engine
      ↓
Proposal Pipeline
      ↓
Review Dashboard Model
      ↓
Review UI ViewModel
      ↓
Decision Boundary
      ↓
Review Artifact Ledger
      ↓
Canonical Handoff Packet
      ↓
Canonical OmniSeller Authority
      [NOT CONNECTED]
```

## Non-negotiable authority invariants

The sidecar may:

- observe/import descriptive evidence;
- normalize;
- cluster as proposal only;
- explain;
- create review notes/flags;
- propose merge/split;
- record immutable review artifacts;
- request canonical evaluation;
- package a read-only handoff.

The sidecar may **not**:

```text
SET_PROOF_GATE
SET_WATCH
SET_QUALIFIED
SET_REJECTED
SET_STALE
SET_PROMOTE_TO_PROJECT
MUTATE_CANDIDATE_STATUS
CREATE_PROJECT
MUTATE_PROJECT_STATE
WRITE_PRODUCT_TRUTH
ACCEPT_PRODUCT_TRUTH
MUTATE_MKL
FREEZE_MKL
APPROVE_LISTING
PUBLISH
EXPORT_PUBLISH_READY
INVOKE_CANONICAL_WORKFLOW
```

A valid handoff packet is review input only. It never confers approval, proof-gate status, Project creation authority, Product Truth authority, or publish authority.

## Recommended review order

Review authority/evidence semantics before UI:

```text
1. Import Normalizer
2. Cluster Engine
3. Proposal Pipeline
4. Decision Boundary
5. Review Artifact Ledger
6. Canonical Handoff Packet
7. Review Dashboard Model
8. Review UI ViewModel
```

## Integration choice

Preferred path:

```text
PR #59 resolved
      ↓
fetch latest main
      ↓
new clean integration branch/worktree
      ↓
record exact main SHA
      ↓
reimplement accepted contracts using canonical Omni utilities
      ↓
Node 22 review tests
      ↓
full canonical Node 22 suite
      ↓
production build
      ↓
independent audit / bug hunter
      ↓
merge only after all gates pass
```

Alternative: selectively cherry-pick only the accepted pure commits listed above, then refactor shared utilities before runtime wiring.

## Required refactors before runtime integration

Before any accepted sidecar code becomes operational:

- use one canonical stable serializer/hash utility;
- version the hash/serialization contract;
- replace duplicated local `stable()/sha256()/deepFreeze()` helpers where appropriate;
- establish a canonical source-signature registry;
- establish a canonical action/authority registry;
- make conflict targeting independent of ViewModel pagination;
- define review metadata allow-list or namespaced schema;
- use server-owned immutable reviewer identity;
- keep review persistence physically/logically separate from operational Global Opportunity tables.

## Latest targeted regression state

The last sidecar audit run passed:

```text
GLOBAL_OPPORTUNITY_CLUSTER_ENGINE_V1 PASS
GLOBAL_OPPORTUNITY_IMPORT_NORMALIZER_V1 PASS
GLOBAL_DISCOVERY_PROPOSAL_PIPELINE_V1 PASS
GLOBAL_REVIEW_DASHBOARD_MODEL_V1 PASS
GLOBAL_REVIEW_UI_CONTRACT_V1 PASS
GLOBAL_DECISION_BOUNDARY_V1 PASS
GLOBAL_REVIEW_ARTIFACT_LEDGER_V1 PASS
GLOBAL_CANONICAL_HANDOFF_PACKET_V1 PASS
GLOBAL_OPPORTUNITY_BULK_V2 PASS
GLOBAL_OPPORTUNITY_DISCOVERY_V1 PASS
git diff --check PASS
```

Important limitation: the sidecar review tests were run locally on Windows Node 24. They are **not** release authority. Accepted tests must run under supported Node 22 before merge.

## Exact Codex merge checklist

### A. Resolve active Omni development
- [ ] Wait for PR #59 to reach its intended final state.
- [ ] Fetch latest `origin/main`.
- [ ] Record exact post-PR59 main SHA.
- [ ] Confirm Node 22.
- [ ] Create a fresh clean worktree/branch from that main SHA.

### B. Confirm ancestry isolation
- [ ] New branch ancestry starts from post-PR59 main.
- [ ] No inherited sidecar operational commit through `4b043cd91` appears unless separately approved.
- [ ] Review `git diff --name-status <post-pr59-main>...HEAD` manually.
- [ ] No unrelated file is introduced.

### C. Adjudicate each pure slice
For each of the eight commits:
- [ ] ACCEPT / REIMPLEMENT / REJECT explicitly recorded.
- [ ] Confirm authority remains proposal/review/read-only as designed.
- [ ] Confirm no operational side effect was introduced.
- [ ] Confirm hash/version semantics.
- [ ] Confirm adversarial/tamper tests.

### D. Runtime wiring gate
Before wiring any route/UI/storage:
- [ ] Canonical serializer/hash utility adopted.
- [ ] Source-signature registry adopted.
- [ ] Action/authority registry adopted.
- [ ] Conflict stable index adopted.
- [ ] Reviewer actor identity server-owned.
- [ ] Review metadata schema versioned.
- [ ] No review UI callback directly changes canonical state.

### E. Ledger persistence gate
If Ledger persistence is accepted:
- [ ] Dedicated review/audit storage.
- [ ] Append-only at storage level.
- [ ] No UPDATE/DELETE of immutable artifact body.
- [ ] Server receipt timestamp separate from immutable `recordedAt`.
- [ ] No DB trigger may promote candidate/create Project/write Product Truth/publish.
- [ ] Backup/restore preserves exact hash chain.

### F. Canonical handoff gate
If Handoff is accepted:
- [ ] Packet remains read-only.
- [ ] Sidecar cannot call canonical workflow directly.
- [ ] Canonical verifies packet and full ledger chain.
- [ ] Canonical re-fetches/revalidates current evidence.
- [ ] Canonical decision creates a separate canonical audit artifact.
- [ ] Packet validity is never treated as proof sufficiency.

### G. Test/release gate
- [ ] Accepted review tests PASS under Node 22.
- [ ] Full canonical Node 22 suite PASS.
- [ ] Production build PASS.
- [ ] `git diff --check` PASS.
- [ ] Cross-module hash vectors PASS.
- [ ] Independent bug-hunter pass completed.
- [ ] Product Truth/MKL/Project/publish boundaries independently audited.
- [ ] Production remains unchanged until explicit deployment approval.

## Explicit rejection conditions

Reject the integration if it:

1. merges the current isolated branch wholesale;
2. auto-converts global/research evidence into Product Truth;
3. allows sidecar review to set proof gate or canonical candidate status;
4. lets review artifacts directly create/promote a Project;
5. treats handoff packets as executable commands;
6. grants commercial authority only from a client-supplied source label;
7. treats YTrend/social revenue-like metrics as marketplace proof;
8. persists review artifacts into operational tables without strict separation;
9. treats a valid hash as evidence sufficiency;
10. adds an untested canonical mutation path.

## Expected Codex output

Before merging, Codex should produce a review ruling with:

```text
POST_PR59_MAIN_SHA:
INTEGRATION_BRANCH:
ACCEPTED_SLICES:
REIMPLEMENTED_SLICES:
REJECTED_SLICES:
NODE22_REVIEW_TEST_RESULT:
CANONICAL_SUITE_RESULT:
BUILD_RESULT:
DIFF_CHECK_RESULT:
BUG_HUNTER_RESULT:
AUTHORITY_BOUNDARY_RESULT:
FINAL_MERGE_ELIGIBILITY:
FINAL_HEAD_SHA:
```

Only after all required gates are PASS should Codex merge the accepted implementation into OmniSeller.
