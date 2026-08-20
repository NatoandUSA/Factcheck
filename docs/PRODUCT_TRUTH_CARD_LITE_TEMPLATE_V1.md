# Product Truth Card Lite — Template v1

> **Mục đích:** Một record cho **một physical sellable product / SKU family**, nhập lần đầu bởi Staff khi muốn bán sản phẩm mới và tái sử dụng cho Etsy, Amazon hoặc channel khác. Không dùng record này để suy đoán fact. Fact chưa có evidence phải là `UNKNOWN`, không dùng default/zero/plausible text.
>
> **Quy tắc version:** Không overwrite silently. Khi supplier/SKU/material/components/personalization/cost/fulfillment thay đổi, copy file thành version mới và ghi change log. Một record là input cho nhiều listing; một listing không tạo fact mới cho record.

---

## 0. Card control — bắt buộc

| Field | Value |
|---|---|
| `product_truth_id` | `PTR-YYYYMMDD-####` |
| `truth_version` | `v1` |
| `record_status` | `DRAFT` / `EVIDENCE_IN_PROGRESS` / `READY_FOR_COPY` / `READY_FOR_MANUAL_PUBLISH` / `SUPERSEDED` / `RETIRED` |
| `category_block` | `EMBROIDERY` / `SHINEON_JEWELRY` / `MUG` / `BLANKET` / `OTHER` |
| `created_at` | ISO 8601 with timezone |
| `created_by` | Staff/Owner name or ID |
| `last_verified_at` | ISO 8601 with timezone; `UNKNOWN` until verified |
| `owner_attestation` | `YES` / `NO` |
| `attestation_note` | Minimum 10 meaningful characters; state what was personally verified, not a generic approval sentence. |
| `supersedes_product_truth_id` | `NONE` or prior ID/version |
| `source_product_key` | Stable internal key for same source product across channel listings; e.g. `KIMHOANG-SKU-1234-BLACK` |

### 0.1 Field-level provenance enum — bắt buộc cho mọi row có buyer-facing impact

| `evidence_state` | Dùng khi | Được phép dùng cho hard publish gate? |
|---|---|---|
| `OBSERVED` | Có direct primary evidence: physical sample, supplier spec/quote, label, invoice, own photo, approved source document. | Có, nếu evidence link/ID còn valid. |
| `OWNER_ATTESTED` | Owner tự xác nhận operational fact mà hệ thống không tự quan sát được. | Có, chỉ khi policy/gate cụ thể cho phép; cần attestation note. |
| `DERIVED_FROM_OBSERVED` | Computation minh bạch từ observed values; ghi formula/input. | Không cho material/capability/approval fact; chỉ dùng operational calculation có label. |
| `MODELED` | Estimate/scenario/benchmark. | **Không.** |
| `UNKNOWN` | Chưa có evidence đủ. | **Không.** |
| `SOURCE_ERROR` | Nguồn lỗi/không truy cập được. | **Không.** |

---

## 1. Shared Core — Product Identity và Included Components

| Field | Value | `evidence_state` | `evidence_id(s)` | Notes / exact wording allowed in listing |
|---|---|---|---|---|
| Internal product name |  |  |  | Internal only; not automatic listing title. |
| Product family |  |  |  | E.g. embroidered sweatshirt / pendant necklace / ceramic mug / fleece blanket. |
| Exact supplier / production partner |  |  |  | Legal/entity name if required for channel disclosure. |
| Supplier SKU / blank SKU / partner product ID |  |  |  | Never infer from a competitor ASIN. |
| Brand / unbranded decision |  |  |  | Brand claim requires authorization evidence. |
| Variant parent key |  |  |  | One parent only when variants are materially the same source product. |
| Variants offered |  |  |  | Color, size, style only if exact variant is confirmed. |
| Included components |  |  |  | List exact items in customer package. |
| Excluded components / limits |  |  |  | Prevent buyer confusion; do not list accessories not included. |
| Country/region of manufacture or fulfillment |  |  |  | Do not claim `Made in …` without sufficient proof. |

---

## 2. Shared Core — Specifications, Personalization, and Buyer Safety

| Field | Value | `evidence_state` | `evidence_id(s)` | Notes / exact wording allowed in listing |
|---|---|---|---|---|
| Primary material / composition |  |  |  | Exact composition only; no “premium/high quality” substitute. |
| Dimensions / capacity / weight |  |  |  | Units and tolerance source required. |
| Color / finish / texture |  |  |  | Use physical or supplier-approved names. |
| Care / use instructions |  |  |  | Only source-backed instructions. |
| Personalization offered? | `YES` / `NO` |  |  | `YES` requires all following rows. |
| Personalization input type |  |  |  | E.g. name, initial, free text, selected design; not keyword-derived. |
| Personalization limits |  |  |  | Character limit, accepted characters, location, preview proof. |
| Personalization production workflow |  |  |  | What Staff/supplier actually does after order. |
| Safety / age / compliance claim |  |  |  | Leave `UNKNOWN` unless document exists; never infer. |
| IP screen result | `OK` / `REVIEW` / `BLOCK` / `NOT_RUN` |  |  | A narrow risk screen, not legal clearance. |

---

## 3. Shared Core — Fulfillment and Economics (internal, not auto-customer-facing)

| Field | Value | `evidence_state` | `evidence_id(s)` | Decision use |
|---|---|---|---|---|
| Fulfillment model | `POD` / `FBM` / `FBA` / `OTHER` |  |  |  |
| Ship-from location |  |  |  | Must support buyer-facing ship-from promise. |
| Target market / route |  |  |  | E.g. US domestic / US cross-border. |
| Supplier production days |  |  |  | Quote/sample-backed; season exceptions listed separately. |
| Transit days |  |  |  | Route-specific, not generic vendor marketing. |
| Staff handling buffer |  | `OWNER_ATTESTED` / `DERIVED_FROM_OBSERVED` |  | Internal buffer; explain formula. |
| Customer-facing processing promise |  |  |  | Cannot be shorter than supported operational evidence. |
| Unit product cost |  |  |  | Currency, size/variant and quote date required. |
| Packaging / insert cost |  |  |  |  |
| Shipping cost |  |  |  | Target route/size required. |
| Marketplace fee assumption |  | `MODELED` / `DERIVED_FROM_OBSERVED` |  | Internal only; never presented as observed product fact. |
| Price floor |  | `DERIVED_FROM_OBSERVED` |  | Show formula / input IDs. |
| Target price |  | `OWNER_ATTESTED` |  | Decision, not a product fact. |

---

## 4. Shared Core — Images and Assets

| Asset role | File/URL/evidence ID | `evidence_state` | Verified against exact SKU/variant? | Notes |
|---|---|---|---|---|
| Physical primary product image |  |  | `YES` / `NO` | Required before Etsy publish; must match exact sellable product. |
| Detail / material image |  |  | `YES` / `NO` |  |
| Scale / size image |  |  | `YES` / `NO` |  |
| Variant image(s) |  |  | `YES` / `NO` |  |
| Design asset / artwork |  |  | `YES` / `NO` | File existence does not prove physical product attributes. |
| Rights / license record |  |  | `YES` / `NO` | Required where image/art is not wholly Owner-created. |

---

## 5. Conditional Block A — `EMBROIDERY`

> Complete this block only when `category_block = EMBROIDERY`.

| Field | Value | `evidence_state` | `evidence_id(s)` | Gate note |
|---|---|---|---|---|
| Blank garment/product model |  |  |  | Exact supplier/blank SKU, not just “hoodie” or “shirt”. |
| Garment composition / GSM / fit |  |  |  | Supplier spec + physical label/sample cross-check when available. |
| Sizes and colorways offered |  |  |  | Must be tied to chosen blank SKU. |
| Front design asset ID / hash |  |  |  |  |
| Sleeve design asset ID / hash |  |  |  |  |
| Actual placement(s) offered |  |  |  | Front / left sleeve / right sleeve; not inferred from file name alone. |
| Max embroidery area per placement |  |  |  | Supplier confirmation required. |
| Stitch count / thread-color constraints |  |  |  | Quote/spec required; no assumptions. |
| Backing/stabilizer / finish |  |  |  | Only state if customer-relevant and source-backed. |
| Personalization mechanism |  |  |  | `NO` unless production path is confirmed. |
| Physical sample stitched | `YES` / `NO` |  |  | `NO` blocks primary image and publish readiness. |
| Sample photo set linked | `YES` / `NO` |  |  | Front + sleeve + close-up + scale recommended. |
| Care instructions |  |  |  | No generic wash language without source. |

---

## 6. Conditional Block B — `SHINEON_JEWELRY`

> Complete this block only when `category_block = SHINEON_JEWELRY`.

| Field | Value | `evidence_state` | `evidence_id(s)` | Gate note |
|---|---|---|---|---|
| ShineOn/partner product ID |  |  |  | Exact partner product/variant, not competitor ASIN. |
| Jewelry type |  |  |  | Pendant / necklace / bracelet / etc. |
| Exact metal / plating / chain material |  |  |  | Must exactly match partner spec; do not write `925`, `gold`, `stainless` without proof. |
| Pendant / chain dimensions |  |  |  | Include unit and variant. |
| Gemstone / crystal / stone description |  |  |  | `UNKNOWN` if supplier only gives marketing term. |
| Finish / color variants |  |  |  |  |
| Gift box / message card included? | `YES` / `NO` |  |  | This is a hard included-component fact. |
| Exact message-card text / artwork ID |  |  |  | Rights/IP screen required for artwork/text. |
| Custom name / engraving offered? | `YES` / `NO` |  |  | Do not infer from keyword. |
| Customization input and limit |  |  |  | Required if `YES`. |
| Partner production / ship-from / processing route |  |  |  | Exact target-market route required. |
| Physical/partner-approved image set |  |  |  | Must match exact SKU/components. |

---

## 7. Conditional Block C — `MUG`

> Complete this block only when `category_block = MUG`.

| Field | Value | `evidence_state` | `evidence_id(s)` | Gate note |
|---|---|---|---|---|
| Mug material |  |  |  | Ceramic / stainless / enamel only if exact supplier spec. |
| Capacity |  |  |  | oz/ml; exact variant. |
| Dimensions / weight |  |  |  |  |
| Print sides / print area |  |  |  | Do not promise wrap/full print without template confirmation. |
| Handle / color / interior variants |  |  |  |  |
| Dishwasher safe? |  |  |  | Must be source-backed. |
| Microwave safe? |  |  |  | Must be source-backed; especially not assumed for metallic/enamel variants. |
| Packaging / breakage handling |  |  |  |  |
| Personalization mechanism |  |  |  | `NO` unless actual workflow confirmed. |
| Physical/approved product image |  |  |  | Required before publish. |

---

## 8. Conditional Block D — `BLANKET`

> Complete this block only when `category_block = BLANKET`.

| Field | Value | `evidence_state` | `evidence_id(s)` | Gate note |
|---|---|---|---|---|
| Blanket material / composition |  |  |  | Exact supplier spec; no generic “soft” claim as a fact. |
| Size variants |  |  |  | Units + tolerance source. |
| Weight / GSM / thickness |  |  |  | `UNKNOWN` if not supplied. |
| Print side(s) / print area |  |  |  |  |
| Edge / backing / finish |  |  |  |  |
| Care instructions |  |  |  |  |
| Personalization mechanism |  |  |  |  |
| Packaging / shipping constraints |  |  |  | Exact route/size. |
| Physical/approved product image |  |  |  | Required before publish. |

---

## 9. Evidence Register — one row per source

| `evidence_id` | Source type | Date captured | Source location / link | What it proves exactly | Reviewer | Valid for version |
|---|---|---|---|---|---|---|
| `EV-001` | Supplier quote / spec / invoice / physical photo / label / owner attestation |  |  |  |  | `v1` |
| `EV-002` |  |  |  |  |  | `v1` |
| `EV-003` |  |  |  |  |  | `v1` |

---

## 10. Listing use policy — guardrails

| Listing field | May source from Product Truth Card? | Rule |
|---|---|---|
| Etsy/Amazon title | Yes | Use only supported material/product/personalization terms; SEO suggestions cannot add facts. |
| Description / bullets | Yes | Every factual feature/what-is-included/processing claim needs `OBSERVED` or permitted `OWNER_ATTESTED` state. |
| Variants | Yes | Must map to confirmed physical SKU/color/size only. |
| Price | Internal economics supports decision | Price floor is internal; final price is Owner decision and must be current. |
| Publish approval | Yes, as input | `MODELED`, `UNKNOWN`, `SOURCE_ERROR` may not pass a hard approval gate. |
| Image upload | Yes | Image must be linked to exact sellable product/variant and rights evidence. |

---

## 11. Gate and approval decision

| Gate | Status | Evidence / blocking reason | Owner decision/date |
|---|---|---|---|
| Gate 0 — release/security control | `PASS` / `HOLD` |  |  |
| Gate 1 — Product Truth core | `PASS` / `HOLD` |  |  |
| Gate 2 — category conditional block | `PASS` / `HOLD` |  |  |
| Gate 3 — images/rights | `PASS` / `HOLD` |  |  |
| Gate 4 — IP/fulfillment/economics | `PASS` / `HOLD` |  |  |
| Copy may be drafted | `YES` / `NO` |  |  |
| Manual publish may be requested | `YES` / `NO` |  |  |

> **Manual publish only.** This card does not authorize automatic marketplace publishing.

---

## 12. Change Log

| Version | Date | Changed field(s) | Why changed | Superseded evidence | Owner |
|---|---|---|---|---|---|
| `v1` |  | Initial record |  | `NONE` |  |

