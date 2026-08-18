# P0.5-B Etsy Truth Scope

This patch closes the Etsy seller-evidence fabrication class without expanding into a universal marketplace schema.

## Canonical truth rules

- Missing seller facts are `UNKNOWN`/`null`, never plausible defaults or zero unless the source explicitly reports zero.
- Synthetic/demo seller rows are not eligible evidence for learning or listing generation.
- `/api/mcp/pull-etsy` persists only live MCP observations and never semantic-padding fallbacks under a live-source label.
- Seller evidence learning may derive SEO/title/tag patterns, but it cannot satisfy Product Truth hard gates.
- Materials, product specifications, personalization limits, processing/shipping promises, compliance facts and publish approval require Owner/Product Truth evidence.
- Etsy seller evidence must not manufacture Amazon copy.

## Explicitly out of scope

- Full `raw_observations`/revision architecture.
- HTML keyword-ingestion defaults (`Search Volume 1200`, `Competing Products 350`, `Title Density 2`) — tracked for P0.5-C.
- Generic `/api/trends/:id/draft`, `/api/amazon/quick-draft`, and generic listing fallback Product Truth prompts — tracked as a broader Product Truth generation-gating pass.
- Production VPS cutover for P0-OPS — separate operational track.
- Auto-publish remains prohibited.
