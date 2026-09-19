# Global Review Dashboard Model V1 — Isolated Review Packet

Branch: `review/global-opportunity-v2-isolated-20260919`

## Isolation contract
- Pure proposal/explanation module only.
- No React/UI wiring.
- No route, migration, DB write, Project creation, Product Truth mutation, MKL mutation, scoring authority, candidate status authority, or publish authority.
- No PR is created from this branch.
- Main and PR #59 remain untouched.

## Added slice
- `server/globalOpportunityReviewDashboardModel.js`
- `review_tests/test_global_opportunity_review_dashboard_model.cjs`

The model consumes only a valid `PROPOSAL_ONLY` discovery proposal and returns deterministic review data for a future UI:
- summary counters;
- source-family rollups;
- cluster cards;
- why-grouped explanations;
- evidence observations;
- provenance lineage;
- duplicate-conflict explanations;
- review-attention cues;
- explicit canonical-decision flags, all false.

## Explanation semantics
The model does **not** evaluate the canonical proof gate. It only reports descriptive observations such as:
- `POSITIVE_COMMERCIAL_SIGNAL_PRESENT`
- `COMMERCIAL_SCHEMA_WITHOUT_POSITIVE_PROOF`
- `MULTI_SOURCE_NON_COMMERCIAL_SIGNALS_ONLY`
- `NO_POSITIVE_COMMERCIAL_SIGNAL`

Every observation carries `canonicalGateAuthority: false`.

## Full audit / bug-hunt findings
1. **Tampered proposal risk**: the first implementation only checked that `proposalHash` looked like a SHA-256 string. It now recomputes the proposal hash and rejects mutation with `GLOBAL_REVIEW_MODEL_PROPOSAL_HASH_MISMATCH`.
2. **Malformed conflict lineage**: duplicate-conflict rows are validated fail-closed; a conflict must remain quarantined and carry valid lineage hashes.
3. **Duplicate/missing cluster IDs**: rejected before rendering so one card cannot impersonate another.
4. **Untrusted display strings**: control characters are stripped and display fields are length-bounded. This is presentation hygiene only; it does not turn the module into HTML authority.
5. **Authority confusion**: review observations are intentionally separated from proof-gate/status/Create Project decisions.

## Verification
- `GLOBAL_REVIEW_DASHBOARD_MODEL_V1 PASS`
- `GLOBAL_DISCOVERY_PROPOSAL_PIPELINE_V1 PASS`
- `GLOBAL_OPPORTUNITY_IMPORT_NORMALIZER_V1 PASS`
- `GLOBAL_OPPORTUNITY_CLUSTER_ENGINE_V1 PASS`
- `GLOBAL_OPPORTUNITY_BULK_V2 PASS`
- `GLOBAL_OPPORTUNITY_DISCOVERY_V1 PASS`
- `git diff --check` PASS

## Codex review questions
- Should this explanation model remain server-side pure data, or should a future UI adapter translate these codes separately?
- Should `attentionCount` remain a descriptive count only rather than any priority/ranking mechanism?
- Should proposal-hash validation be shared from a canonical serializer module rather than duplicated?
- If accepted later, integration must be rebased/reapplied onto the then-current main and rerun through the full Node 22 canonical suite.
