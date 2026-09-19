# Global Review Artifact Ledger V1 — Isolated Review Packet

Branch: `review/global-opportunity-v2-isolated-20260919`

## Isolation contract
- Pure immutable ledger contract only.
- No database, route, migration, filesystem persistence, React/UI wiring, Project mutation, Product Truth mutation, MKL mutation, candidate status mutation, proof-gate mutation, approval, export, or publish authority.
- No PR is created from this branch.
- Main and PR #59 remain untouched.

## Added slice
- `server/globalOpportunityReviewArtifactLedger.js`
- `review_tests/test_global_opportunity_review_artifact_ledger.cjs`

## Purpose
Define an append-only, hash-chained format for review artifacts that can later be persisted separately from OmniSeller operational tables.

Supported artifact types:
- `REVIEW_NOTE`
- `REVIEW_FLAG`
- `CLUSTER_MERGE_PROPOSAL`
- `CLUSTER_SPLIT_PROPOSAL`
- `CANONICAL_EVALUATION_REQUEST`

The ledger consumes only integrity-checked `REVIEW_ONLY` Decision Boundary envelopes.

## Immutable ledger contract
Each ledger is bound to:
- a review `scopeId`;
- one `sourceViewHash`;
- an ordered `entries[]` chain;
- `entryCount`;
- `tailHash`;
- `ledgerHash`.

Each entry carries:
- monotonic `sequence`;
- artifact `type`;
- `sourceViewHash`;
- `sourceEnvelopeHash`;
- review intent/target;
- reviewer reference;
- caller-supplied UTC `recordedAt`;
- bounded scalar metadata;
- `previousEntryHash`;
- `canonicalEffects = NONE`;
- deterministic `artifactId`;
- deterministic `entryHash`.

Appending returns a new frozen ledger and never mutates the prior ledger.

## Authority constraints
The ledger does not execute review intents and never converts them into canonical actions.

It requires:
```text
envelope.authority = REVIEW_ONLY
handoff.executableByReviewLayer = false
handoff.recordableAsReviewArtifact = true
all requestedEffects = false
```

For `REQUEST_CANONICAL_EVALUATION`, `requiresCanonicalAuthority` must be true.
For all other review intents it must be false.

## Full audit / bug-hunt findings
1. **Metadata alias bypass**: canonical fields could initially be smuggled as variants such as `Proof_Gate` or `candidate-status`. Metadata keys are now normalized before forbidden-key checks.
2. **Non-finite number ambiguity**: `NaN` / `Infinity` can serialize ambiguously. Non-finite numeric metadata is now rejected.
3. **Normalized key collision**: aliases such as `review-code` and `review_code` now fail closed rather than representing two visually similar keys.
4. **Integrity-only verification was insufficient**: ledger verification now also enforces entry semantics — REVIEW_ONLY authority, artifact type/intent consistency, source-view scope, `canonicalEffects=NONE`, timestamp, reviewer, and metadata rules.
5. **Handoff semantic drift**: Decision envelopes are validated for recordability and exact canonical-handoff semantics before they can enter the ledger.
6. **Hash-chain tampering**: any sequence, previous hash, entry body, tail, artifact ID, or ledger-body mutation is detected.

## Verification
- `GLOBAL_REVIEW_ARTIFACT_LEDGER_V1 PASS`
- `GLOBAL_DECISION_BOUNDARY_V1 PASS`
- `GLOBAL_REVIEW_UI_CONTRACT_V1 PASS`
- `GLOBAL_REVIEW_DASHBOARD_MODEL_V1 PASS`
- `GLOBAL_DISCOVERY_PROPOSAL_PIPELINE_V1 PASS`
- `GLOBAL_OPPORTUNITY_IMPORT_NORMALIZER_V1 PASS`
- `GLOBAL_OPPORTUNITY_CLUSTER_ENGINE_V1 PASS`
- `GLOBAL_OPPORTUNITY_BULK_V2 PASS`
- `GLOBAL_OPPORTUNITY_DISCOVERY_V1 PASS`
- `git diff --check` PASS
- Static runtime reference search returned no runtime references to `globalOpportunityReviewArtifactLedger`.

## Codex review questions
- If persistence is ever accepted, should this ledger use a dedicated immutable table/database namespace rather than operational Global Opportunity tables?
- Should one ledger remain permanently bound to one `sourceViewHash`, with a new ledger created for each review snapshot?
- Should reviewer identity be an opaque immutable actor reference rather than a display name?
- Should the stable serializer/hash utility be replaced with OmniSeller's canonical serializer only at integration time?
- If accepted later, integration must be reapplied onto the then-current main and fully re-audited under Node 22 canonical CI.
