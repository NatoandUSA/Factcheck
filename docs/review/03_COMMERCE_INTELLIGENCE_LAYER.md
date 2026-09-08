# Section 03 — Commerce Intelligence Layer

Date: 2026-09-08
Source prototype: Claude `Claude outputs/amz-draft-engine`
Target: additive pure modules under `server/commerceIntelligence/`

## Modules

- `text.js` — shared token/byte primitives
- `ipScreen.js` — advanced token-boundary + evasion screen using Omni's existing IP library
- `semantic.js` — multi-label EN/ES clusters and audience conflict logic
- `asinSelector.js` — X-Ray competitor selection and Cerebro batching
- `keywordEngine.js` — Cerebro extraction, scoring, metric provenance
- `allocation.js` — rejection accounting, copy/PPC allocation, coverage
- `amazonComposer.js` — Product Truth constrained Amazon draft composition
- `index.js` — review facade

These modules are pure/review-oriented and do not write project state, listings, evidence acceptance, or commerce authority.

## Deliberate fixes vs Claude prototype

1. Generic Keywords use one TOTAL budget capped at 249 bytes.
2. Title, Item Highlights, bullets and description are finalized before backend terms are packed.
3. Backend terms exclude tokens already present anywhere in finalized visible copy.
4. `minSearchVolume` filtering emits `BELOW_MIN_SEARCH_VOLUME`; it no longer silently drops phrases.
5. Full rejection details are retained; preview truncation is separated from accounting.
6. ASIN brand diversity is enforced per batch, not globally.
7. The first ASIN in every batch is explicitly marked as seed.
8. Cerebro `Position (Rank)` is preserved instead of declared-and-dropped.
9. Metric availability reports whether IQ, Trend, CPR, Rank, Bid and scored metrics are present and how they are used.
10. Missing optional metrics are omitted from the weighted denominator instead of being silently treated as zero/neutral.
11. Rare frequency alone is REVIEW metadata; only higher-confidence rival-brand signals are auto-excluded.

## Scoring policy in this review branch

Core components always available: demand, anchor relevance, phrase quality.
Optional components participate only when their source metric exists: Keyword Sales, Title Density gap, Competing Products.
The score is renormalized across active weights so missing optional data does not become an invented zero.

IQ, Trend, CPR and Position Rank are preserved as diagnostic research signals but are not yet forced into the weighted score.
Suggested Bid is preserved for PPC export.

## Verification

```text
node tests/test_commerce_intelligence_review.cjs
SUITE_RESULT total=22 passed=22 failed=0
```

The suite covers IP evasion/false positives, multi-cluster semantics, audience conflict, Position Rank preservation, zero-silent-loss SV filtering, missing-metric discipline, per-batch brand diversity, explicit seed ASIN, full rejection accounting, 249-byte total backend budget, no visible/backend duplication, blocked-IP containment, PPC overflow and coverage bounds.

## Review questions for GPT/Claude

- Should rank/trend/CPR stay diagnostic, or enter marketplace/category-specific scoring models?
- Is short-batch behavior preferable to controlled diversity relaxation when fewer than 10 distinct brands qualify?
- Should the high-confidence rival-brand heuristic be replaced by explicit competitor-brand observations extracted from X-Ray before main integration?
- Should Item Highlights remain an Amazon-specific output module while the common intelligence layer ends before composition?
