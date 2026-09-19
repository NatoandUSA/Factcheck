# Global Decision Boundary Contract V1 — Isolated Review Packet

Branch: `review/global-opportunity-v2-isolated-20260919`

## Isolation contract
- Pure decision-boundary module only.
- No React/UI wiring.
- No routes, migrations, DB writes, Project creation, Product Truth mutation, MKL mutation, candidate status mutation, proof-gate mutation, approval, export, or publish authority.
- No PR is created from this branch.
- Main and PR #59 remain untouched.

## Added slice
- `server/globalOpportunityDecisionBoundary.js`
- `review_tests/test_global_opportunity_decision_boundary.cjs`

## Purpose
This layer prevents the read-only review stack from drifting into canonical OmniSeller authority.

The boundary classifies intents into:

### REVIEW_ONLY
- `ADD_REVIEW_NOTE`
- `FLAG_FOR_REVIEW`
- `PROPOSE_CLUSTER_MERGE`
- `PROPOSE_CLUSTER_SPLIT`
- `REQUEST_CANONICAL_EVALUATION`

### CANONICAL_ONLY
Examples include:
- candidate status changes: WATCH / QUALIFIED / REJECTED / STALE / PROMOTE_TO_PROJECT;
- candidate delete;
- proof-gate mutation;
- cluster mutation or persisted override;
- Project creation/state mutation;
- Product Truth writes/acceptance;
- MKL mutation/freeze;
- listing approval;
- publish/export authority.

Unknown intents also fail closed.

## Review envelope guarantees
Every valid review envelope carries:

```text
authority = REVIEW_ONLY
writeCanonicalStatus = false
evaluateProofGate = false
createProject = false
mutateProjectState = false
mutateProductTruth = false
mutateMkl = false
approveListing = false
publish = false
executableByReviewLayer = false
recordableAsReviewArtifact = true
```

`REQUEST_CANONICAL_EVALUATION` is only a handoff request. It never performs canonical evaluation itself.

## Full audit / bug-hunt findings
1. **False execution authority**: initial draft marked most review intents `executableByReviewLayer=true`. This could imply review-layer mutation authority. Fixed: all envelopes now set `executableByReviewLayer=false`; they are only recordable review artifacts.
2. **Incomplete canonical status enumeration**: WATCH/REJECTED/STALE and generic candidate-status mutation were added to the canonical-only deny set.
3. **Cluster mutation boundary**: persisted cluster update/override intents were explicitly added as canonical-only.
4. **Merge target poisoning**: initial merge proposal accepted arbitrary related IDs. Related cluster IDs are now validated against the current integrity-checked ViewModel and self-merge is rejected.
5. **Split ambiguity**: split proposals now require a human rationale instead of meaningless related cluster IDs.
6. **Upstream integrity**: the Decision Boundary recomputes `viewHash` before accepting any request, so tampered ViewModel input fails closed.

## Verification
- `GLOBAL_DECISION_BOUNDARY_V1 PASS`
- `GLOBAL_REVIEW_UI_CONTRACT_V1 PASS`
- `GLOBAL_REVIEW_DASHBOARD_MODEL_V1 PASS`
- `GLOBAL_DISCOVERY_PROPOSAL_PIPELINE_V1 PASS`
- `GLOBAL_OPPORTUNITY_IMPORT_NORMALIZER_V1 PASS`
- `GLOBAL_OPPORTUNITY_CLUSTER_ENGINE_V1 PASS`
- `GLOBAL_OPPORTUNITY_BULK_V2 PASS`
- `GLOBAL_OPPORTUNITY_DISCOVERY_V1 PASS`
- `git diff --check` PASS
- Static runtime reference search returned no runtime references to `globalOpportunityDecisionBoundary`.

## Codex review questions
- Should review artifacts be persisted later in a completely separate immutable review ledger rather than existing operational tables?
- Should canonical-only intents be generated from a shared authority registry instead of a local explicit deny set?
- Should `REQUEST_CANONICAL_EVALUATION` become the only bridge from review UI to canonical workflows?
- If accepted later, integration must be reapplied onto the then-current main and fully re-audited under Node 22 canonical CI.
