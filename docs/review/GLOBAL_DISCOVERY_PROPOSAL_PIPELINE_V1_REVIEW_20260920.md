# Global Discovery Proposal Pipeline V1 — Isolated Review Packet

Branch: `review/global-opportunity-v2-isolated-20260919`

## Isolation contract
- Proposal-only composition of the isolated Import Normalizer and Cluster Engine.
- No runtime wiring.
- No routes, migrations, UI, DB writes, Project creation, Product Truth mutation, MKL mutation, scoring authority, or publish authority.
- No PR is created from this branch.

## Added slice
- `server/globalOpportunityProposalPipeline.js`
- `review_tests/test_global_opportunity_proposal_pipeline.cjs`

The pipeline performs:

```text
parsed bulk file
    ↓
isolated source normalization / provenance
    ↓
conflicting duplicate quarantine
    ↓
accepted proposal candidates only
    ↓
proposal-only clustering
    ↓
cluster + lineage refs + review signals
```

It deliberately does **not** emit `proofGate`, `status`, `Create Project`, Product Truth, or publish decisions.

## Full audit / bug-hunt finding
Initial review signal naming treated "commercially authoritative source schema" as if it were "positive commercial proof". Those are not the same thing.

The pipeline now separates:
- `commercialAuthoritySourceCount`
- `positiveCommercialProofSourceCount`
- `observedSourceFamilyCount`

A valid CEREBRO-shaped row with sales = 0 therefore has commercial schema authority but **zero positive commercial proof**.

## Verification
- `GLOBAL_DISCOVERY_PROPOSAL_PIPELINE_V1 PASS`
- `GLOBAL_OPPORTUNITY_IMPORT_NORMALIZER_V1 PASS`
- `GLOBAL_OPPORTUNITY_CLUSTER_ENGINE_V1 PASS`
- `GLOBAL_OPPORTUNITY_BULK_V2 PASS`
- `GLOBAL_OPPORTUNITY_DISCOVERY_V1 PASS`
- `git diff --check` PASS

## Codex review questions
- Is this composition boundary preferable to wiring normalization directly into the existing import route?
- Should review signals stay descriptive only, with all proof-gate decisions remaining in the canonical store layer?
- Should conflicts become a separate immutable review artifact before any integration?
- If accepted later, integration must be rebased/reapplied onto the then-current main and fully re-audited under Node 22 canonical CI.
