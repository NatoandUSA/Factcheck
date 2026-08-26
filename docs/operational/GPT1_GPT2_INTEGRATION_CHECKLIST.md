# GPT1/GPT2 Integration Checklist

> **Operational checklist only.** This document is not governance. The sole governance authority is [`../../GOLDEN_RULES.md`](../../GOLDEN_RULES.md).

## Before integration

- [ ] GPT2 ancestry includes GPT1 commit `bdd44d27d05bd5611d434b24f8978b6c80844c45`.
- [ ] GPT2 imports the canonical shared module rather than recreating evidence semantics.
- [ ] GPT2 reports every touched file and its final commit SHA.
- [ ] Neither workstream is merged or deployed independently.

## Cross-review

- [ ] GPT1 reviews prompt inputs for raw-title, ProductBrief, tag and fallback leakage.
- [ ] GPT1 reviews model-call paths for zero calls after invalid input.
- [ ] GPT2 reviews publish/export gates for stale-version and subject-mismatch bypasses.
- [ ] Both reviewers test `UNKNOWN`, `UNVERIFIED`, missing source, stale version, wrong subject and IP review states.

## Integration verification

- [ ] Create an integration branch from GPT1, then cherry-pick GPT2.
- [ ] Run `git diff --check` and the production build.
- [ ] Run the complete test suite on the exact integration SHA.
- [ ] Confirm edits clear `product_truth_card`, approval version and approval hash.
- [ ] Confirm free-text notes cannot satisfy approval or export.
- [ ] Confirm no `UNKNOWN -> commerce claim` path remains.
- [ ] Record exact base, GPT1, GPT2 and integration SHAs before requesting merge.
