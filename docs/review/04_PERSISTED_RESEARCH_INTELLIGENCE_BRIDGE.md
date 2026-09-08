# Section 04 — Persisted Research → Commerce Intelligence Bridge

Date: 2026-09-08
Branch: `review/omni-commerce-intelligence-r1`

## Goal

Connect the GPT3 provenance/persistence shell to the Section 03 commerce-intelligence layer without granting any commerce authority.

The bridge reads research already committed to `staff_research_files`, verifies the current `sourceHash`, applies staff-declared facts as the claim boundary, and returns a review preview.

## New review endpoint

`POST /api/staff-workflow/:projectId/intelligence/preview`

Properties:

- authenticated and tenant/workspace/marketplace scoped
- requires `factsConfirmed: true`
- rejects stale research hashes
- reads persisted X-Ray/Cerebro/Reference rows from SQLite
- produces keyword intelligence, Amazon draft and ASIN batches
- returns `zeroWrite: true`
- does not save an editorial draft
- does not write `listings`
- does not transition project authority/state

For non-Amazon projects the bridge reports `MARKETPLACE_INTELLIGENCE_ADAPTER_NOT_IMPLEMENTED` rather than applying Amazon logic to Etsy.
## Stored-row adapters

`storedResearch.js` maps persisted object rows into explicit intelligence inputs while preserving source provenance:

- Cerebro: Search Volume, Keyword Sales, IQ, Trend, Competing Products, CPR, Title Density, Suggested Bid, Position Rank.
- X-Ray: ASIN-level and parent-level metrics remain separate; absent fields stay `null`.
- Reference rows can bind owned ASINs for exclusion from competitor batches.
- Staff facts are mapped separately into Amazon Product Truth input; research rows are never promoted into product facts.

## Bridge verification

A dedicated HTTP/SQLite test uploads synthetic files through the real staff workflow, then calls the preview endpoint.

```text
STAFF_INTELLIGENCE_BRIDGE measured=24 passed=24 failed=0
```

Verified in that test:

- 72 persisted Cerebro rows reach intelligence accounting.
- low-SV filtering is explicitly accounted (`BELOW_MIN_SEARCH_VOLUME`).
- Position Rank survives storage → adapter → intelligence.
- research-driven title is produced within the title budget.
- Generic Keywords remain <=249 bytes TOTAL even when caller asks for 999.
- IP-blocked `nike` cannot reach visible copy, backend keywords or PPC.
- full rejection accounting is exposed.
- persisted X-Ray reaches ASIN selection.
- every generated batch retains per-batch brand cap and explicit seed ASIN.
- intelligence preview leaves `staff_editorial_drafts` unchanged.
- intelligence preview leaves commerce `listings` unchanged.
- intelligence preview leaves `research_projects.state` unchanged.
- missing staff fact confirmation is rejected.
- stale research hash is rejected with 409.

Regression checks after bridge wiring:

```text
STAFF_API measured=58 passed=58 failed=0
SUITE_RESULT commerce-intelligence total=22 passed=22 failed=0
STAFF_INTELLIGENCE_BRIDGE measured=24 passed=24 failed=0
```

## Known limits

1. This section has no browser UI for the intelligence preview yet; API behavior only is verified.
2. The new branch has not rerun the historical Hija real-file corpus because those source workbooks are not currently available at the expected local test path. GPT3's previous 80/80 receipt remains source-prototype evidence only.
3. Etsy deliberately has no intelligence adapter in this section.
4. Reference-row owned-ASIN detection is simpler than Claude's workbook-sheet heuristic because GPT3 persistence currently discards original worksheet context.
5. The bridge returns a preview; saving/accepting it remains a separate editorial action by design.

## Review question

Should Omni persist a normalized research-observation table in addition to raw files/rows, so worksheet provenance and repeated Cerebro observations can survive without reparsing JSON on each preview?
