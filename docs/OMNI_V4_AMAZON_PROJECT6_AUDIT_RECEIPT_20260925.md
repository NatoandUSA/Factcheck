# OmniSeller V4 — Amazon Project #6 Audit Receipt

Date: 2026-09-25
PR: #89
Runtime code head independently audited: `d759a72d6b43c6abbde4d1628904a03ff31bd597`
Status: **PERSISTED GOLDEN — `LISTING_READY_FOR_HUMAN_USE`**

## Authority boundary
- Finalization mode: **production persisted successor + exact post-release re-audit**
- Project: `#6`
- Research Snapshot: `#20`
- Product Truth revision: `#25`
- Master Keyword artifact: `#28`
- Successor Intelligence: `#16` (parent `#14`)
- Golden Listing root: `#18`
- Golden Listing revision: `#23`
- Listing content hash: `50ea2f3f94a2cad62335eab0116d870b3b75961cb1c02a495d1581ddb9aeeee7`
- Listing dependency hash: `b3cb3e0e43faa5006f788c039964e547da77d0aa03a926141c34b914ad49d237`
- Final production runtime: `decbdfc16f7a0266a0b8129ae3e4940e5250c7d3`
- Marketplace submission/publication remains out of scope

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
- Etsy Project #7 successor was persisted after the final IP-guard release
- Research Snapshot: `#21`; Product Truth revision: `#26`; Master Keyword artifact: `#32`; successor Intelligence `#17` (parent `#15`)
- Successor Listing root `#17`, revision `#22`
- Content hash `be717d494b1f974e1791a829d50c7c87ade0ff47e39463f355e39c9e69538f8b`
- Dependency hash `b92f3309c205f9dc2dbe1e9f63961ddfcf7f6298458adbd5fd88695b9ebedb2a`
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

## Final release and golden-reference decision
- PR #89 was merged and deployed first, establishing the V4 runtime changes.
- During successor finalization, Etsy Project #7 exposed a false-positive IP block on Spanish generic field `Modelo: 2026`.
- PR #91 fixed only that contextual IP-matcher case; exact-head local Node 22 suite passed **120/120**, GitHub Node 22 CI succeeded, and real Project #7 compose-preview passed while `Cerveza Modelo Especial` remained blocked.
- PR #91 merged as `decbdfc16f7a0266a0b8129ae3e4940e5250c7d3` and was deployed through the immutable release workflow.
- Release backup integrity/checksums passed, service health was green, and production revision matched the target.
- Amazon Listing #18 / revision #23 was then persisted under the final validator binding and revalidated against current dependencies.
- Exact final QA: dependencies current; canonical validation PASS; IP verdict `OK`; policy quality gaps none; mixed-language leakage absent; internal provenance leakage absent; **1084/1084 keywords accounted, 0 unallocated**.
- Image Prompt Pack remains truth-safe: seven physical slots are `REFERENCE_REQUIRED`; personalization is `OWNER_FACT_REQUIRED` for `personalization_method_and_area`. These are explicit human-required inputs, not hidden defects.
- `POLICY_CONTRACT_DRAFT_ONLY` remains a marketplace approval/publication lifecycle blocker only. V4 stops before publication and therefore this does not block human-use readiness.
- Production DB `PRAGMA quick_check`: **ok**.

**Decision:** Amazon Project #6 / Listing #18 / revision #23 is the first persisted OmniSeller V4 golden reference with semantic status **`LISTING_READY_FOR_HUMAN_USE`**.

The canonical DB row remains `NEEDS_QA` because the existing schema has no V4 golden-reference enum. The golden designation is therefore anchored by the immutable canonical listing revision plus this Git-tracked receipt, rather than by inventing a new DB status or bypassing lifecycle controls.

No Composition V2, allocator rewrite, or architecture expansion is justified by this audit.
