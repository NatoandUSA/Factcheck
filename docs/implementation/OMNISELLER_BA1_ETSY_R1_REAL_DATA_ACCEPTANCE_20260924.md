# BA1-ETSY-R1 — Real HeyEtsy Data Acceptance

**Status:** implementation candidate  
**Baseline:** `9517c7c96ec6672e681bebc49f8c9e67866b0939`  
**Production mutation:** NONE  
**Scope:** Align Etsy Research Readiness with verified HeyEtsy Chrome Extension search captures. YTrends remains supplementary `RESEARCH_ONLY`.

## Product contract

Primary Etsy marketplace research source:
- HeyEtsy Chrome Extension CSV export from an exact Etsy search query.

Secondary research source:
- YTrends / ytuong.me MCP for keyword, trend, discovery and corroboration.

Not required:
- Etsy official API access.

HeyEtsy sold/views/revenue/conversion data remains research evidence only. This change does not establish Commercial Proof and does not alter Product Truth.

## Real source corpus

Three existing operator exports were used as acceptance evidence without committing their contents:

| File | Rows | Columns | SHA-256 |
| --- | ---: | ---: | --- |
| `para_mi_hija_search_20260908_222159.csv` | 63 | 36 | `70a7c212ec94cba7a880d42e71d0f984bd7cabe944b04c3c28d8068878fcd023` |
| `para_mi_hija_search_20260908_222205.csv` | 66 | 36 | `72c065ff5783a0507e3b0697e2e6abd847df53268e802001fb9e250d4fbde2c5` |
| `para_mi_hija_search_20260908_222208.csv` | 66 | 36 | `f3ffae62c0fbd10921637ceeb051630dcfc156b25bb1a39519f862edcb66405f` |

For all three exports:
- all 36 source columns are recognized;
- unmapped columns = 0;
- `keyword_context` is present and uniform across every row;
- listing IDs are present and unique;
- Etsy listing URLs bind to the same listing IDs;
- rank positions are unique and contiguous `1..N`;
- `evidence_route_hint=etsy_search_results`;
- `data_use_hint=rank_pattern_batch_candidates`;
- keyword match type/confidence metadata is present;
- raw artifact SHA-256 is retained.

## Verified capture contract

Only a full artifact satisfying the HeyEtsy export fingerprint is upgraded from a client source hint to an artifact-verified research capture.

Qualifying query projection:
```text
sourceFamily:             ETSY_PUBLIC_SEARCH
authorityClassification: RESEARCH_ONLY
evidenceTier:             E2_THIRD_PARTY_RESEARCH
provider:                 HEYETSY_EXTENSION_EXPORT
supportScope:             QUERY_RESULT_SET
queryBinding.state:       CAPTURE_ARTIFACT_VERIFIED
queryBinding.authority:   THIRD_PARTY_RESEARCH_CAPTURE
captureId:                deterministic from raw hash/query/listing IDs/ranks
```

Generic Etsy CSV/HTML, mixed query contexts, invalid listing URL/ID binding, incomplete HeyEtsy schema, or invalid rank sequences remain fail-closed and do not receive this binding.

## Freshness acceptance

The operator-provided source capture date remains authoritative for freshness. Etsy's existing 14-day maximum age is unchanged.

Using the real capture date `2026-09-08`:

### Historical in-window replay

Evaluation time: `2026-09-10`.

All 3 artifacts:
```text
artifactVerified:     true
Research Readiness:   READY
reason:               ETSY_HEYETSY_RESEARCH_READY
Commercial Proof:     NOT_ESTABLISHED
proof blocker:        RESEARCH_ONLY_NOT_COMMERCIAL_PROOF
```

### Current replay

Evaluation time: `2026-09-24`.

All 3 artifacts:
```text
artifactVerified:     true
Research Readiness:   NOT_READY
reason:               ETSY_SOURCE_STALE_OVER_14_DAYS
Commercial Proof:     NOT_ESTABLISHED
proof blocker:        RESEARCH_ONLY_NOT_COMMERCIAL_PROOF
```

This is the intended fail-closed behavior. Existing September 8 files validate the verifier but cannot be relabeled fresh on September 24.

## YTrends boundary

Production YTrends transport was checked independently with `para mi hija`; all six allowlisted MCP tools returned transport SUCCESS. Current returned marketplace-detail fields for that query are sparse, so YTrends remains a supplement, not the primary listing corpus.

No changes are made to:
- `server/ytuongMcpClient.js`;
- YTrends allowlist;
- YTrends authority classification;
- Product Truth;
- schema/migrations;
- Amazon workflow;
- PR #80.

## Verification

Targeted regressions:
- Global Candidate projection/readiness PASS
- B3 evaluation PASS
- B4 promotion PASS
- Global Candidate pool persistence PASS
- Etsy CSV richness PASS
- canonical Etsy HTTP PASS
- Etsy intelligence adapter PASS
- Etsy truth/provenance contracts PASS
- YTrends stateless transport PASS
- YTrends UNKNOWN-default semantics PASS
- canonical commerce UI 62/62 PASS
- Vite production build PASS
- route registry coverage PASS

Local full suite on Windows / Node 24:
```text
total=117
passed=115
failed=2
unexecuted=0
```

Both failures are pre-existing platform/harness failures and reproduce unchanged on exact baseline `9517c7c...`:
- `test_deploy_rollback_faults.cjs` — Unix `ln` rollback harness on Windows;
- `test_runner_accounting.cjs` — Windows process-tree timing/shutdown behavior.

The failing test files, runner and deploy script have zero diff from baseline. Canonical Node 22 CI on Linux remains the merge authority.

## Release gate

```text
IMPLEMENTATION:          READY FOR INDEPENDENT REVIEW
PRODUCTION:              UNCHANGED
MERGE:                   HOLD
DEPLOY:                  HOLD
NODE22 CI:               REQUIRED
REAL FRESH ETSY UAT:     REQUIRED AFTER RELEASE CANDIDATE
```
