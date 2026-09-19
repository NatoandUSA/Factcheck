# Global Opportunity Import Normalizer V1 — Isolated Review Packet

Branch: `review/global-opportunity-v2-isolated-20260919`

## Isolation contract
- Proposal-only module. No runtime wiring.
- No route, migration, UI, Project, Product Truth, MKL, publish, or main-branch mutation.
- No PR is created from this branch.
- Codex must review and explicitly decide whether any part is integrated later.

## Added slice
- `server/globalOpportunityImportNormalizer.js`
- `review_tests/test_global_opportunity_import_normalizer.cjs`

The normalizer consumes parser output and produces a deterministic, source-family-separated proposal with:
- content-addressed `sourceFileId` validation;
- per-source authority classification;
- non-authoritative YTrend/Generic commercial metric stripping;
- proof timestamps forced to null for file ingestion;
- exact duplicate accounting;
- conflicting duplicate quarantine;
- negative metric rejection;
- deterministic normalization hash;
- deep-frozen review output;
- no Project/Product Truth/publish authority.

## Full audit / bug-hunt findings
1. **Source-hint spoof risk**: the existing parser accepts a requested valid source type before semantic detection. A generic sheet could therefore be labeled CEREBRO. The isolated normalizer does not grant commercial authority from the source label alone; it requires a canonical marketplace header fingerprint (e.g. `Keyword Sales` for CEREBRO, `Etsy Competition` for HeyEtsy).
2. **Conflicting duplicate risk**: two rows with the same normalized keyword but different sales values must not silently choose max/last-write-wins. They are quarantined as `REVIEW_DUPLICATE_CONFLICT`.
3. **Negative metric risk**: negative sales/search volume/revenue are normalized to UNKNOWN/null, never commercial proof.
4. **Mutation-after-hash risk**: initial deep-freeze implementation returned early for already-frozen parent objects, leaving child arrays mutable. Regression test caught it; deep freeze now recurses before returning.
5. **Input-order risk**: accepted candidates and source batches are sorted before the normalization hash, making shuffled row order deterministic.

## Verification
- `GLOBAL_OPPORTUNITY_IMPORT_NORMALIZER_V1 PASS`
- `GLOBAL_OPPORTUNITY_CLUSTER_ENGINE_V1 PASS`
- `GLOBAL_OPPORTUNITY_BULK_V2 PASS`
- `GLOBAL_OPPORTUNITY_DISCOVERY_V1 PASS`
- `git diff --check` PASS
- Static search confirms the new normalizer is not referenced by runtime code.

## Codex review questions
- Should source authority be based on a shared canonical source-signature registry instead of module-local fingerprints?
- Should duplicate conflicts become an immutable review artifact before any DB write?
- Is HeyEtsy commercial authority sufficiently strong with current export semantics, or should it remain WATCH-only until an additional sales-specific fingerprint exists?
- If accepted, integration must be performed only after rebasing/reapplying onto the then-current main and rerunning the full Node 22 canonical suite.
