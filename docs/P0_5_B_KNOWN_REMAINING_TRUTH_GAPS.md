# Known truth gaps remaining after P0.5-B

P0.5-B is intentionally narrow. It does not certify all OmniSeller business-data truth.

## P0.5-C — keyword ingestion/provenance

Current universal HTML keyword upload still contains modeled fallback values when fields are absent, including historical defaults around Search Volume, Competing Products, Title Density and opportunity scoring. Those values must not be represented as observations.

## Product Truth generation gating

Separate existing generation paths still instruct models or fallback copy to produce facts that require human/Owner authority. Inventory includes:

- generic `/api/trends/:id/draft` prompts for materials, personalization, workshop/shipping claims and marketplace-specific product facts;
- `/api/amazon/quick-draft` product/material/variation assumptions;
- generic `/api/listings` fallback description claims such as premium materials/durability/customization.

These must be handled in a dedicated Product Truth generation-gating pass. AI may draft/recommend, but exact material/spec/SKU/supplier/personalization/shipping/compliance/publish facts cannot satisfy hard gates without persisted Owner evidence.

## Operational track

P0-OPS code boundary is merged, but production VPS runtime cutover remains a separate operational acceptance item until external DB/imports/env paths are configured and verified.
