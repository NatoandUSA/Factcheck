# OmniSeller R4.3 Real Hija API UAT Receipt

Date: 2026-09-12  
Branch: `codex/omniseller-r4-3-production-recovery`  
Tested working tree base: `66ab9103e09c6cfb093af4f9d3dd73effc84cc06` (final commit recorded below after freeze)  
Result: `PASS`  
Environment: isolated local test database; no production mutation.

## Exact inputs

| Input | SHA-256 | Bytes | Accepted rows/observations |
|---|---|---:|---:|
| `Cerebro_Hija.xlsx` | `c77428d8e080c70545d14409a9d64d98e076e8df72b45d0f3257877cc75615d6` | 260477 | 1099 |
| `Xray_Hija.xlsx` | `171e8935249ae00e775207efd8c08645321212048ff02abac6fbff4a8d043bfe` | 15279 | 19 |
| `para_mi_hija_search_20260908_222159.csv` | `70a7c212ec94cba7a880d42e71d0f984bd7cabe944b04c3c28d8068878fcd023` | 45775 | 63 |
| `para_mi_hija_search_20260908_222205.csv` | `72c065ff5783a0507e3b0697e2e6abd847df53268e802001fb9e250d4fbde2c5` | 47265 | 66 |
| `para_mi_hija_search_20260908_222208.csv` | `f3ffae62c0fbd10921637ceeb051630dcfc156b25bb1a39519f862edcb66405f` | 46879 | 66 |

## Amazon result

- Canonical path exercised: Xray preview -> editable ASIN plan -> direct Cerebro research -> Master KW -> Product Truth -> intelligence -> draft.
- ASIN run set: 5 selected from the first suggested cohort across 19 accepted Xray candidates; no padding to 10.
- Cerebro: 1099 observations normalized to 1084 unique Master KW rows.
- Allocation: 1084/1084 allocated; `unallocatedCount=0`.
- Draft status: `NEEDS_QA`.
- Draft title length and Generic Keywords byte policy passed.
- Missing facts remained explicit: material, size, color, verified features, packaging and ship-from.

## Etsy result

- Canonical path exercised: three CSV imports -> research snapshot -> Winners -> Pattern Miner -> Master KW -> Product Truth -> intelligence -> draft.
- Source accounting: 195 observations -> 176 normalized listing entities.
- Master KW: 90; `droppedKeywordCount=0`; `corpusAccountingGap=0`.
- Relevance correction: eight listings captured under the seed but semantically unrelated to `para mi hija` were kept in source accounting and excluded from winner/MKL promotion.
- HeyEtsy tag cells without separators were classified as `UNPARSEABLE_CONCATENATED_SUGGESTIONS`; their raw imports remain intact, but concatenated UI/control text is not promoted to observed tags or Master KW.
- The project seed is explicitly `PRIMARY`; related repeated phrases and observed tags may be promoted using seed overlap and cross-listing evidence. Unrelated title heads are sent to `REVIEW`.
- Etsy opportunity fields are labeled proxies derived from winner/listing/shop spread. They are not represented as official Etsy search volume.
- Draft status: `NEEDS_QA`.
- Safe tags: 7/13, each within 20 characters, each with an explanation.
- Tag state: `TAG_SHORTAGE`, missing 6. The engine did not pad or invent tags.

## Six UAT corrections verified

1. Xray, Cerebro and Etsy selectors retain an appendable, de-duplicated multi-file queue across repeated picker actions; each file remains separately previewed, hashed and imported.
2. Etsy observed tags render as individual clean rows with listing/shop spread. Unparseable HeyEtsy concatenations are visibly accounted for and quarantined from MKL input.
3. Etsy Master KW has explicit `PRIMARY` and `REVIEW` accounting; the seed is always primary.
4. Confirmed same-source listing facts now preserve the `gemstones` field in the Product Truth form, so an exact observed fact such as Cubic Zirconia can support copy after staff attestation. Claim Guard remains active for facts not present in the saved revision.
5. Step 3 now reports the exact missing immutable dependency instead of presenting silent disabled buttons. Product Truth is not required to be complete; it only bounds factual claims.
6. Amazon MKL separates demand, competitor coverage/relevance and opportunity. Opportunity combines high search demand with inverse Competing Products and inverse Title Density when those fields exist; missing metrics are reweighted rather than treated as zero. Etsy exposes analogous but clearly labeled market proxies because the supplied CSV does not contain official keyword search volume.

## Image prompt result

- 8 prompt slots generated per marketplace.
- 5 prompts ready.
- 3 prompts blocked because Product Truth lacked material, dimensions and packaging.
- The blocked prompts remained empty instead of inventing facts.

## Remaining gate

This receipt proves API-level processing with the real Hija fixtures. It does not replace normal-browser Owner/staff UAT. PR merge and VPS deployment remain unauthorized until browser UAT and release authority are recorded.
