# P0.5-B Acceptance

P0.5-B is acceptable only when all of the following are true on one exact SHA:

1. Seller HTML/CSV missing facts remain null/UNKNOWN; explicit zero remains zero.
2. Seller card parsing has no random engagement values or plausible shop/country/age/rating defaults.
3. Empty `/api/etsy/scan-search` fails closed with no synthetic seller rows.
4. `/api/mcp/pull-etsy` returns an error on MCP failure/no usable evidence and does not persist semantic fallback data under `ETSY_MCP_LIVE`.
5. Batch learn requires at least three accepted evidence rows and rejects unproven provenance.
6. Batch learn creates modeled Etsy SEO recommendations only; Product Truth fields remain empty with explicit truth warnings.
7. Etsy evidence learning creates no Amazon listing copy.
8. Staff UI displays evidence source/UNKNOWN states and cannot select hidden `DEMO_SYNTHETIC` rows for learning.
9. Canonical regression suite and frontend build pass.
10. GitHub Actions is GREEN on the exact PR head reviewed for merge.

A GREEN P0.5-B does not certify P0.5-C keyword ingestion defaults or the separate generic Product Truth generation paths recorded in `P0_5_B_KNOWN_REMAINING_TRUTH_GAPS.md`.
