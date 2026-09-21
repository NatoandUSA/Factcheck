# Global Candidate Pool — B2 thin slice

## Purpose

B2 creates a project-independent, evidence-first pool for discovery inputs. It does not rank opportunities,
make `WATCH/PROMOTE/KILL` decisions, or create a Project. Those remain B3/B4 work.

## Canonical inputs reused

- Amazon Cerebro files are parsed by `amazonResearchAdapter`; their metrics remain labeled
  `MODELED_THIRD_PARTY` / `E2_MODELED_THIRD_PARTY`.
- Etsy search files are parsed by `etsyResearchAdapter`; observed tags/query contexts retain listing-level provenance.
- Existing Amazon/Etsy master-keyword artifacts contribute only their outlier/review tiers and retain the exact
  project/artifact hash dependency.
- Stored Social Handoff V3 artifacts are projected read-only. They always remain `RESEARCH_ONLY`, carry no
  commercial evidence, and do not invoke the upstream pull protocol.

## Identity and grouping

`EXACT_NORMALIZED_V1` groups only exact Unicode-normalized phrases inside one tenant/workspace/marketplace.
Every observation remains a separate immutable evidence row. B2 intentionally performs no semantic clustering.

## Persistence

Migration `021_global_candidate_pool_mvp` adds:

- `global_candidates`
- `global_candidate_evidence`

Both tables reject updates and deletes. Re-importing the same exact evidence is idempotent through an evidence hash
that binds source family, authority, artifact hash, provenance, commercial/social evidence, and raw projected data.

## API

- `GET /api/global-candidates`
- `POST /api/global-candidates/research-imports/preview`
- `POST /api/global-candidates/research-imports`
- `POST /api/global-candidates/social-handoffs/:handoffId`
- `POST /api/global-candidates/projects/:projectId/outliers`

The read response exposes grouping, source families, completeness/unknowns, evidence authority and original
provenance. `hasCommercialSignals` means only that commercial-looking source fields exist. B2 never promotes those
fields to proof: `commercialProofStatus` is `NOT_EVALUATED` when signals exist and `NOT_PRESENT` otherwise, while
`COMMERCIAL_PROOF_NOT_PRESENT` remains visible until a later proof-evaluation layer establishes it. The response
exposes no score, decision authority, promotion authority, Product Truth authority, or commerce write.

## Explicit non-goals

- No Xray-title-to-opportunity guessing. Xray remains supporting research until an explainable candidate binding exists.
- No semantic cluster engine or manual regroup UI in B2.
- No opportunity score or business disposition.
- No Promote-to-Project action.
- No Product Truth, listing, approval, export, submission or publish mutation.
- No change to Social Handoff protocol, secrets, verifier, persistence or deployment.
