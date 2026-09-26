# OmniSeller V4 — Etsy Project #9 Audit Receipt

Date: 2026-09-26
Marketplace: Etsy
Project: `#9 — Pet Memorial Gift — BA-2 Real UAT`
Status: **PERSISTED GOLDEN — `LISTING_READY_FOR_HUMAN_USE`**

## Canonical lineage
- Production runtime: `70c157008fdfd579cadc3044914ae74285f9d0db`
- Research Snapshot: `#19`
- Product Truth revision: `#24`
- Master Keyword artifact: `#27`
- Successor Intelligence: `#18` (parent `#13`)
- Intelligence snapshot hash: `028bbf1e032931fd46a6d232381c78f3e6bc35bb04ee20f4c690816f9ed3d512`
- Intelligence engine binding: `af2e5a68e565fdff6eaa2f2de69960ff82dd42da8948ff2c3a326e8d8b78c75e`
- Golden Listing root: `#19`
- Golden Listing revision: `#24`
- Listing content hash: `cbad22b36a4a96ebd536b1e31da8dbdae35d22fba88c5b00247868327e8bae33`
- Listing dependency hash: `9a7afbbdc1d456a2d2c526fa3b589636112ee6fea34bb90846295e4941cd0e46`

## Product Truth boundary
Verified Product Truth identifies the product as a pet memorial necklace / necklace with:
- Material: Silver
- Personalization: pet name, photo, date, custom message, breed
- Included: 1 necklace, message card, gift box
- Packaging: gift box
- Unknown: necklace size / chain length

Research-only competitor product forms do **not** become product facts.

The final V4 replay explicitly rejects sibling-product terms such as:
`jar`, `urn`, `suncatcher`, `wind chime`, `frame`, `stone`, `pillow`, `ornament`, and `bracelet` when they conflict with verified Product Truth.

## Complete listing package
### Etsy title
**Personalized Pet Memorial Necklace · Pet Sympathy Gift · Dog Memorial Gift**

- Length: **74**
- Words: **12**

### Item highlight
**Pet memorial necklace**

### Description
```
Personalized Pet Memorial Necklace · Pet Sympathy Gift · Dog Memorial Gift

Pet memorial necklace.

Materials: Silver

Personalization: pet name, photo, date, custom message, breed

Included: 1 necklace, message card, gift box

Packaging: gift box
```

Structured packaging is rendered as buyer-readable copy; no `[object Object]` leakage and unverified dimensions `8*8*3` are not surfaced because the unit is unknown.

### Etsy tags
1. pet memorial gift
2. Pet Personalized
3. dog memorial
4. Rainbow bridge pet
5. memorial necklace
6. memorial gift
7. Pet Sympathy Gift
8. pet loss gift
9. dog cat memorial
10. cat memorial
11. custom pet
12. pet photo
13. memorial keepsake

- Tag count: **13**
- Longest tag: **18 characters**
- No conflicting product-form terms are present.

## Keyword Surface Map and omission accounting
Master Keyword corpus: **87**

Accounting:
- allocated corpus: **87**
- corpus accounting gap: **0**
- title/tag candidates: **13**
- tags used: **13**
- claim-blocked: **4**
- irrelevant / Product Truth conflict: **27**
- language-targeting: **1**
- IP-blocked: **0**
- competitor-shop blocked: **0**
- master review: **29**
- unallocated safe phrases: **16**

Unallocated dispositions:
- **12** = `SEMANTIC_ROOTS_ALREADY_COVERED`
- **4** = `ETSY_TAG_CAPACITY_LIMIT`
- **0** missing omission reason
- **0** phrases with missing roots lacking a capacity/redundancy explanation

Capacity-limited residual roots:
- `portrait` — appears in `cat portrait pet`, `custom pet portrait`, `pet portrait`
- `remembrance` — appears in `pet remembrance`

## Image Prompt Pack
- `main_product`: `REFERENCE_REQUIRED`
- `alternate_angle`: `REFERENCE_REQUIRED`
- `material_detail`: `REFERENCE_REQUIRED`
- `personalization_detail`: `REFERENCE_REQUIRED`
- `scale_dimensions`: `OWNER_FACT_REQUIRED` — missing `sizes_or_dimensions`
- `lifestyle`: `REFERENCE_REQUIRED`
- `features_infographic`: `REFERENCE_REQUIRED`
- `packaging_contents`: `REFERENCE_REQUIRED`

The missing size/chain-length fact is explicit human-required input and does not cause the system to invent dimensions.

## Final QA
- Canonical dependencies current: **PASS**
- Canonical revalidation: **PASS**
- IP verdict: **OK**
- Policy quality gaps: **0**
- Approval blockers: **0**
- Product-form contamination: **absent**
- Internal provenance leakage: **absent**
- Structured-object leakage: **absent**
- DB `PRAGMA quick_check`: **ok**
- Production service: **active**
- Local health revision: `70c157008fdfd579cadc3044914ae74285f9d0db`
- Public health revision: `70c157008fdfd579cadc3044914ae74285f9d0db`

## Golden-reference decision
**Decision:** Etsy Project #9 / Listing #19 / revision #24 is the first persisted OmniSeller V4 Etsy golden reference with semantic status **`LISTING_READY_FOR_HUMAN_USE`**.

The canonical DB lifecycle status remains governed by the existing listing lifecycle. No new DB enum or publication shortcut is introduced. Golden designation is anchored by the immutable canonical listing revision plus this Git-tracked audit receipt.

Marketplace publication/submission remains outside the V4 North Star.
