# Global Review UI Contract / ViewModel V1 — Isolated Review Packet

Branch: `review/global-opportunity-v2-isolated-20260919`

## Isolation contract
- Pure ViewModel adapter only.
- No React/UI wiring.
- No routes, migrations, DB writes, Project creation, Product Truth mutation, MKL mutation, scoring authority, candidate status authority, or publish authority.
- No PR is created from this branch.
- Main and PR #59 remain untouched.

## Added slice
- `server/globalOpportunityReviewViewModel.js`
- `review_tests/test_global_opportunity_review_view_model.cjs`

The adapter consumes the pure Review Dashboard Model and produces a UI-oriented contract with:
- read-only toolbar options;
- deterministic filters and sorts;
- bounded search;
- cluster table rows;
- conflict-only table rows;
- pagination;
- source summary cards;
- details-by-id lookup;
- read-only explanation and provenance detail;
- explicit disabled canonical actions.

## UI contract guarantees
```text
readOnly = true
mutationsExposed = []
canonicalGateAuthority = false
createProjectEnabled = false
productTruthEnabled = false
publishEnabled = false
```

The adapter contains no handler, command, endpoint, mutation callback, or state transition authority.

## Supported review query
- Sort: `HEAD_KEYWORD`, `SOURCE_COUNT`, `MEMBER_COUNT`, `EVIDENCE_STATE`
- Direction: `ASC`, `DESC`
- Filter: `ALL`, `POSITIVE_COMMERCIAL_SIGNAL`, `NO_POSITIVE_COMMERCIAL_SIGNAL`, `CONFLICTS_ONLY`
- Search: bounded to 120 characters
- Page size: clamped to 1–100
- Invalid query values fail safe to deterministic defaults

## Full audit / bug-hunt findings
1. **Dashboard tampering risk**: initial adapter trusted any proposal-only dashboard-shaped object. It now recomputes and verifies `modelHash`; post-hash mutation fails closed with `GLOBAL_REVIEW_UI_MODEL_HASH_MISMATCH`.
2. **Conflict search semantics**: initial `CONFLICTS_ONLY` filter ignored the search term. Conflict rows now apply keyword/source/disposition search before pagination.
3. **Canonical authority leak**: any upstream canonical decision flag evaluating true is rejected.
4. **Unsafe pagination/query drift**: invalid sort/filter/direction/page/pageSize inputs normalize to bounded deterministic values.
5. **View determinism**: default view is stable across shuffled source candidate ordering.

## Verification
- `GLOBAL_REVIEW_UI_CONTRACT_V1 PASS`
- `GLOBAL_REVIEW_DASHBOARD_MODEL_V1 PASS`
- `GLOBAL_DISCOVERY_PROPOSAL_PIPELINE_V1 PASS`
- `GLOBAL_OPPORTUNITY_IMPORT_NORMALIZER_V1 PASS`
- `GLOBAL_OPPORTUNITY_CLUSTER_ENGINE_V1 PASS`
- `GLOBAL_OPPORTUNITY_BULK_V2 PASS`
- `GLOBAL_OPPORTUNITY_DISCOVERY_V1 PASS`
- `git diff --check` PASS
- Static runtime reference search returned no references to `globalOpportunityReviewViewModel`.

## Codex review questions
- Should the ViewModel contract remain framework-neutral and server-side pure, with React consuming only serialized data?
- Should conflict rows live in a dedicated tab rather than a special filter?
- Should sort/filter enums live in a shared UI contract registry?
- Should model-hash verification use the canonical serializer instead of a local stable serializer?
- If accepted later, integration must be reapplied onto the then-current main and re-audited under the full Node 22 canonical suite.
