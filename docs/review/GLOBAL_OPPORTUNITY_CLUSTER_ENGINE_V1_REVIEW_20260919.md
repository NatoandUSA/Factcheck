# Global Opportunity V2 — Isolated Cluster Engine Review Packet

Branch: `review/global-opportunity-v2-isolated-20260919`

## Isolation contract
- Do not merge, rebase, cherry-pick, or modify `main` or PR #59 from this branch.
- Runtime wiring is intentionally absent.
- No route, migration, UI, Project, Product Truth, MKL, or publish authority is changed by this slice.
- Cluster output is `PROPOSAL_ONLY`; it cannot create or mutate a Project.

## Added slice
- `server/globalOpportunityClusterEngine.js`: deterministic proposal-only clustering.
- `review_tests/test_global_opportunity_cluster_engine.cjs`: non-canonical review test.
- Product-family separation prevents necklace/wind-chime style false merges.
- Commercial-intent separation prevents incompatible intent families from merging.
- Human merge/split overrides are explicit and deterministic.
- Input order is normalized so proposals are stable across shuffled input.

## Bug-hunt findings fixed inside this isolated slice
1. Initial clustering depended on input order.
2. A split override could be bypassed when the protected member was no longer the cluster head.
3. Tests were moved outside `tests/` because the canonical harness correctly rejects unregistered tests.

## Verification
- GLOBAL_OPPORTUNITY_CLUSTER_ENGINE_V1 PASS
- GLOBAL_OPPORTUNITY_BULK_V2 PASS
- GLOBAL_OPPORTUNITY_DISCOVERY_V1 PASS
- `git diff --check` PASS
- Full local suite was started under Windows Node 24 using shared dependencies; it progressed through canonical tests but was stopped after a long-running UI test. This local run is not release authority.
- Node 22 canonical CI remains the required integration authority if Codex chooses to wire this slice later.

## Codex review questions
- Is the pure-module boundary acceptable?
- Should product-family taxonomy live here or in a canonical registry?
- Should overrides be persisted as immutable review decisions or remain request-scoped?
- If accepted, wire only after rebasing/reapplying onto the then-current main and rerun the complete Node 22 canonical suite.
