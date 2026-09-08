# Section 01 — Baseline and Extraction Matrix

Date: 2026-09-08
Branch: `review/omni-commerce-intelligence-r1`
Base: `8dd56569832164ecd3b0ddd62caea254fdade452` (`origin/main`)
Worktree: `D:\Claude\Factcheck\scratch\omni-commerce-intelligence-review-r1`

## Goal

Build a reviewable integration branch for Omni without modifying the dirty primary working tree and without activating a new production workflow.

This branch combines proven ideas from two independent prototypes:

- GPT3 candidate: staff ingest, provenance, project scope, persistence, versioned editorial drafts.
- Claude `amz-draft-engine`: X-Ray selection, Cerebro intelligence, semantic clustering, IP matching, keyword placement/PPC overflow.

## Non-goals

- No production deployment.
- No authority-state transition changes.
- No direct Seller Central / Etsy publish path.
- No reuse of GPT3 `draftFromFacts()` as the final generator.
- No reuse of Claude in-memory session Map or JSON product store as Omni persistence.
## Extraction decisions

| Capability | Preferred source | Decision |
|---|---|---|
| Raw research persistence + hash | GPT3 | KEEP |
| Preview/confirm + row accounting | GPT3 | KEEP |
| Tenant/workspace/marketplace scope | GPT3 | KEEP |
| Optimistic editorial versioning | GPT3 | KEEP |
| `authority: NONE` editorial boundary | GPT3 | KEEP |
| Advanced token-boundary IP matcher | Claude | KEEP, adapt to Omni library |
| X-Ray competitor selector | Claude | KEEP, fix per-batch diversity |
| Own-ASIN exclusion | Claude | KEEP |
| Multi-label semantic clustering | Claude | KEEP |
| Audience conflict detection | Claude | KEEP |
| Cerebro weighted score | Claude/Omni | MODIFY; preserve raw metrics and provenance |
| Visible-copy allocation + PPC overflow | Claude | KEEP, fix backend keyword total budget |
| GPT3 `draftFromFacts()` | GPT3 | REJECT as final generator |
| Claude `sessions = new Map()` | Claude | REJECT |
| Claude `data/products.json` | Claude | REJECT for Omni |
| Legacy fixed commerce renderer | current main | REJECT for research-driven drafts |

## Review principles

1. Research is market observation, never Product Truth.
2. Product facts constrain claims; research may influence wording and placement only.
3. No silent row loss: every input row is retained or explicitly accounted for.
4. Missing source metrics stay `null`; parent metrics never impersonate ASIN metrics.
5. Editorial draft remains non-authority until a separate controlled acceptance layer acts.
6. Every new module must be additive and callable independently for review.
