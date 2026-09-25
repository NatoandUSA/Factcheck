# OmniSeller V4 — Amazon Project #6 Audit Receipt

Date: 2026-09-25
PR: #89
Candidate head audited: `f9e167c43124b49e15c553f1911dc3dbb468dd16`
Status: **V4 CANDIDATE PASS — NOT YET PERSISTED GOLDEN**

## Authority boundary
- Replay mode: **zero-write**
- Project: `#6`
- Research Snapshot: `#20`
- Product Truth revision: `#25`
- Master Keyword artifact: `#28`
- Persisted Intelligence remains `#14`
- No production DB mutation, listing overwrite, marketplace submission, merge, or deployment

## Candidate listing
- Title: **Regalo de Cumpleaños en Español | Regalo de Madre para Hija**
- Amazon A+ modules: structured Product Truth-derived modules generated
- Targeted ES leakage check: PASS for `Sterling Silver`, `inches`, `Box`, `Yellow`
- Internal provenance leakage in packaging prompt: PASS / absent

## Keyword accounting
- Input: **1084**
- Allocated: **1084**
- Unallocated: **0**
- Copy-safe: **203**
- Claim-targeting/PPC-review: **135**
- Other-language targeting: **612**
- V4 interpretation: safe-intent accounting and omission disposition matter; byte-cap filling is not the objective

## Image Prompt Pack
- main_product: `REFERENCE_REQUIRED`
- alternate_angle: `REFERENCE_REQUIRED`
- material_detail: `REFERENCE_REQUIRED`
- personalization_detail: `OWNER_FACT_REQUIRED` — missing `personalization_method_and_area`
- scale_dimensions: `REFERENCE_REQUIRED`
- lifestyle: `REFERENCE_REQUIRED`
- features_infographic: `REFERENCE_REQUIRED`
- packaging_contents: `REFERENCE_REQUIRED`

## Verification
- Amazon intelligence adapter: **46/46 PASS**
- Etsy intelligence adapter: **47/47 PASS**
- Image prompt generator: **17/17 PASS**
- Canonical commerce UI: **67/67 PASS**
- Canonical GitHub Node 22 CI: **120/120 PASS**, failed=0, unexecuted=0, harness_errors=0
- GitHub CI job: `108006408211`

## Golden-reference decision
This is the first V4 **candidate receipt** for Amazon Project #6. It becomes a persisted production golden reference only after independent exact-head review, authorized merge/release, successor Intelligence/Listing generation from canonical dependencies, and post-release re-audit.

No Composition V2, allocator rewrite, or architecture expansion is justified by this audit.
