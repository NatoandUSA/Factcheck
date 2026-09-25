# OmniSeller V4 — Amazon Project #6 Audit Receipt

Date: 2026-09-25
PR: #89
Runtime code head independently audited: `d759a72d6b43c6abbde4d1628904a03ff31bd597`
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
- Etsy intelligence adapter: **49/49 PASS**
- Image prompt generator: **17/17 PASS**
- Canonical commerce UI: **67/67 PASS**
- Canonical GitHub Node 22 CI: **120/120 PASS**, failed=0, unexecuted=0, harness_errors=0
- GitHub exact-head Node 22 CI job: `108010615454` (`d759a72d6b43c6abbde4d1628904a03ff31bd597`)
- Independent Node 22 full suite on the audited runtime head: **120/120 PASS**, failed=0, unexecuted=0, harness_errors=0, exit=0

## Cross-marketplace regression replay
- Etsy Project #7 replay mode: **zero-write**
- Research Snapshot: `#21`; Product Truth revision: `#26`; Master Keyword artifact: `#32`; persisted Intelligence remains `#15`
- Title: **Collar Personalizado · Regalo Para Mi Hija De Papá En Español** (61 chars)
- Spanish visible-copy EN/VI leakage check: **PASS / absent**
- Prompt provenance leakage: **PASS / absent**
- `personalization_detail`: `OWNER_FACT_REQUIRED`; `scale_dimensions`: `OWNER_FACT_REQUIRED`; remaining physical slots: `REFERENCE_REQUIRED`
- Etsy keyword accounting: master=85, allocated=85, corpus gap=0, unallocated=3
- All 3 unallocated safe phrases are `SEMANTIC_ROOTS_ALREADY_COVERED` with `missingTokens=[]`; no worthwhile safe root is silently omitted in this replay

## Independent exact-head review
- Diff against production base `c3d753c60071483d352b8bd7d4748fbdc7887ab3`: 12 files, 283 insertions, 37 deletions before this receipt-only refresh
- No schema/migration change, publication/submission path, or new production DB write path
- Runtime changes are limited to listing composition/localization, image-prompt status/fidelity, guard coverage and staff review UI
- `git diff --check`: PASS
- No P1/P2 runtime blocker remained after the Project #6/#7 exact-head replays
- This receipt refresh is documentation-only and does not change the audited runtime code

## Golden-reference decision
Amazon Project #6 is accepted as a **V4 runtime candidate** at the audited code head above. It becomes a persisted production golden reference only after authorized merge/release, successor Intelligence/Listing generation from canonical dependencies, and post-release re-audit.

No Composition V2, allocator rewrite, or architecture expansion is justified by this audit.
