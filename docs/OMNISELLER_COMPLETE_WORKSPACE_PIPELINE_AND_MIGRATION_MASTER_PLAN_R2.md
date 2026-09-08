# OmniSeller Complete Workspace, Pipeline & Migration Master Plan — R2

**Ngày khóa kế hoạch:** 2026-09-08

**Owner:** Internal Commerce Team

**Integration baseline:** `NatoandUSA/Factcheck main@8dd56569832164ecd3b0ddd62caea254fdade452`

**Trạng thái:** **FINAL PLAN FOR MULTI-AGENT REVIEW — IMPLEMENTATION NOT YET AUTHORIZED AS COMPLETE**
**Phạm vi:** Amazon US + Etsy US, listing EN/ES theo keyword đầu vào, manual publication, dừng tại `SUBMITTED` trong Phase 1.

---

## 0. Executive ruling

Phương án tối ưu không phải viết lại ba tool, cũng không phải ghép toàn bộ source vào một lần.

Phương án được chọn:

1. **OmniSeller/Factcheck trở thành một front door duy nhất trên VPS** cho Seller, Manager và Owner.
2. **Kế thừa nghiệp vụ tốt nhất từ hai domain authority hiện hữu**:
   - `22etsy-agent`: Etsy research, ranking, Pattern Miner, listing/13 tags, photo brief, team workflow.
   - AMZ-FBM Toolkit: Product Facts, Xray/Cerebro, keyword allocation, evidence-aware copy, A+, creative jobs, manual package.
3. **GPT2/GPT3/Claude prototypes chỉ là donor**, không trở thành persistence hoặc authority song song.
4. **Một canonical Product Truth + Claim Validator dùng chung cho chữ và prompt ảnh**.
5. **Hai đường chạy song song**:
   - Track A tạo draft Amazon an toàn cho staff sớm nhất.
   - Track B xây integration canonical bền vững trên VPS.
6. Phase 1 hoàn tất tại:

```text
APPROVED → EXPORTED → SUBMITTED / NOT_SUBMITTED
```

Không auto-publish, không theo dõi outcome marketplace sâu, không Day-3/Day-7 trong Phase 1.

### Verdict hiện tại

```text
ARCHITECTURE: APPROVED
DONOR EXTRACTION: APPROVED WITH SELECTIVE-PORT RULES
CURRENT GPT2 BRANCH: CHANGES REQUESTED — DO NOT MERGE
CURRENT GPT3 PROTOTYPE: KEEP AS DONOR / LOCAL EVIDENCE
CLAUDE CLAIM GUARD: ACCEPT AS DONOR CANDIDATE, NOT FACTCHECK CERTIFICATION
GRAVITY CAPABILITY SPEC: VISION ONLY; REMOVE “100% / ĐÃ GIẢI QUYẾT” CLAIMS
```

---

## 1. Owner decisions đã khóa

| Decision | Quyết định cuối |
|---|---|
| Front door | OmniSeller là UI duy nhất cho staff khi integration hoàn tất |
| Revenue track | Track A chạy ngay, không chờ Track B |
| Marketplace | Amazon US và Etsy US |
| Listing language | EN hoặc ES, xác định từ keyword/corpus; staff UI bằng tiếng Việt |
| Publication | Manual only; không SP-API/Etsy API/browser auto-publish |
| Hosting | Nhiều staff/remote office truy cập VPS |
| Roles | Seller làm hàng ngày và nhập/kiểm Product Truth; Manager kiểm lại; Owner kiểm cuối |
| Product Truth | Điền tay trước khi xuất draft; thiếu field vẫn sinh safe draft + blocker |
| Pilot thật | `Para mi hija` custom necklace |
| Product families | Custom jewelry, embroidery, acrylic, blanket, hat và custom/digital products |
| Digital example | Printable mystery game “Who killed Arthur Blackwood?” |
| Images | Tool phải xuất full image plan/prompt pack; nhân sự tạo/chọn/triển khai ảnh bên ngoài |
| Primary image AI | GPT/ChatGPT Images |
| Reference asset management | Chưa bắt buộc ở Phase 1; schema vẫn chừa đường nâng cấp |
| Amazon A+ | Owner xác nhận account/Brand Registry có A+ |
| Keyword goal | Dùng tối đa corpus nhưng không mất accounting, không vi phạm policy/claim/IP |
| Submission scope | Phase 1 dừng tại submitted/not submitted |
| Donor preservation | Được chủ động tag/push khi sạch, test pass và binding đầy đủ |

---

## 2. Evidence binding và các đính chính

Mọi finding phải ghi **repo + branch/SHA hoặc artifact hash**. Đường dẫn local một mình không định danh code.

### 2.1 Factcheck baseline

- Baseline: `main@8dd56569832164ecd3b0ddd62caea254fdade452`.
- Có authentication, workspace scope, research projects, evidence, listings, approval và export gate.
- Canonical bootstrap hiện có vòng khóa: project mới ở `EVIDENCE_INTAKE`, listing creation bị chặn trước `PRODUCT_TRUTH_CONFIRMED`, trong khi một số quick-draft path đòi approval binding của listing đã `PUBLISH_READY`.

### 2.2 GPT2 review branch

- `review/omni-commerce-intelligence-r1@459830c6fea5f3e9daf0b495cc056b6edda19acb`.
- Focused evidence đã tái lập: `58/58 + 22/22 + 24/24`; route registry coverage PASS.
- Không merge vì có `staff_research_files`, `staff_editorial_drafts`, export prototype bypass canonical approval, overwrite-version và claim contamination.

### 2.3 GPT3 prototype

- Local isolated source, không phải exact-SHA integration candidate.
- Evidence donor: real-file ingest, preview/confirm, reload, draft edit/download, browser receipt.
- Chỉ port primitives, không port persistence/routes nguyên khối.

### 2.4 Claude claim-guard donor

- Artifact: `Claude outputs/amz-draft-engine`.
- Tái chạy tại máy Owner: `100/100` synthetic và `101/101` với workbook Cerebro thật.
- Giá trị donor: taxonomy C1–C8, pre-composition filtering, post-composition `claimAudit`, keyword disposition, UI blocker report.
- Chưa phải chứng nhận cho Factcheck cho tới khi transplant và canonical regression trên exact integration SHA.

### 2.5 Image generator correction

- File nguy hiểm 203/209 dòng nằm trên dirty branch `codex/smart-pull-truth-hardening@8e6b7b5f3`, không phải baseline.
- `main@8dd5656` có generator nhỏ, fail-closed theo verified subject.
- Hành động đúng: cách ly dirty implementation; dùng 12 fabrication strings làm negative fixtures; nâng cấp generator baseline thành server-side versioned creative artifact.

---

## 3. Bản đồ ba hệ thống và quyết định kế thừa

### 3.1 Vai trò đích

```text
                         ┌───────────────────────────────┐
Remote Staff / Manager ─►│ OmniSeller VPS — ONE FRONT DOOR│
                         └──────────────┬────────────────┘
                                        │ canonical contracts
             ┌──────────────────────────┼──────────────────────────┐
             ▼                          ▼                          ▼
      Shared Safety Core        Amazon Domain Adapter       Etsy Domain Adapter
      scope/truth/version       AMZ-FBM + Claude donor      22etsy-agent donor
      approval/audit            Xray/Cerebro/PDP/A+         rank/pattern/tags/photo
```

### 3.2 KEEP / ADAPT / MOVE / REPLACE / RETIRE

| Source | Capability | Decision | Đích |
|---|---|---|---|
| Factcheck main | Auth/session/RBAC/workspace | **KEEP** | Shared Safety Core |
| Factcheck main | Tenant/workspace/marketplace isolation | **KEEP** | Tất cả API |
| Factcheck main | Product Truth/publish decision/approval hash | **KEEP + REPAIR BOOTSTRAP** | Canonical workflow |
| Factcheck main | Listing persistence | **KEEP + ADD IMMUTABLE REVISIONS** | Editorial Core |
| Factcheck main | Client image prompt generator | **MOVE SERVER-SIDE + VERSION** | Creative Core |
| Factcheck dirty branch | Fabricating 10/12-image templates | **REJECT/CORPUS ONLY** | Negative tests |
| GPT3 | Preview/confirm, hash, accounting, reopen UX | **ADAPT** | Research Source service/UI |
| GPT3 | `staff_*` tables and export | **REJECT** | Không port |
| GPT3 | `draftFromFacts()` | **REJECT AS FINAL GENERATOR** | Test/reference only |
| GPT2/Claude | Xray selection/Cerebro scoring/allocation/PPC | **ADAPT AFTER CLAIM FIX** | Amazon adapter |
| Claude | C1–C8 claim guard + claimAudit | **PORT SELECTIVELY** | Shared Claim Validator |
| AMZ-FBM | Product facts, evidence-aware PDP, field blockers | **INHERIT CONTRACTS/TESTS** | Amazon composer |
| AMZ-FBM | Keyword allocation/accounting | **INHERIT + COMPARE** | Amazon intelligence |
| AMZ-FBM | A+ and ten creative job states | **INHERIT MODEL** | Amazon A+/Creative |
| AMZ-FBM | Seller Central manual package labels | **INHERIT/SIMPLIFY** | Export/Submission |
| 22etsy-agent | 5-stage/12-step business workflow | **INHERIT AS ETSY DOMAIN LOGIC** | Etsy adapter |
| 22etsy-agent | Pattern Miner/winner loop | **ADAPT** | Etsy Research workspace |
| 22etsy-agent | Listing factory/13 tags/photo brief | **ADAPT + CLAIM VALIDATE** | Etsy composer/creative |
| 22etsy-agent | Team ops and Day-3/7 | **DEFER PHASE 2** | Outcomes/Learning |
| Supplier site | Supplier comparison/profit data | **LINK + MANUAL IMPORT FIRST** | Product Truth support |

### 3.3 Kế thừa không đồng nghĩa copy source

Thứ tự kế thừa bắt buộc:

```text
Extract behavior contract
→ extract fixtures and expected outputs
→ build adapter against canonical schema
→ parity test old vs new
→ staff UAT
→ only then retire duplicate surface
```

Không port module chỉ vì tên đúng. Không port UI business rules vào React. Không port database/file layout của donor.

---

## 4. Workspace model cuối

### 4.1 Navigation chính

```text
1. WORK QUEUE / HOME
2. PRODUCT & TRUTH
3. RESEARCH
4. LISTING STUDIO
5. CREATIVE STUDIO
6. REVIEW & APPROVAL
7. EXPORT & SUBMISSION
```

Không đưa hàng chục route cũ lên navigation. Mỗi sản phẩm chỉ có một `Next Action` do server trả về.

### 4.2 Work Queue / Home

Hiển thị một hàng cho mỗi product/project:

- marketplace;
- product family;
- Seller/Manager đang phụ trách;
- bốn readiness axes;
- blockers;
- một next action;
- thời gian cập nhật và provenance.

### 4.3 Product & Truth Workspace

Seller được:

- tạo product/project;
- nhập Product Truth bằng form;
- đính nguồn/note;
- lưu `STAFF_DECLARED` revision;
- xem field nào thiếu;
- sửa trước khi gửi Manager.

Manager được:

- xác nhận/reject từng fact hoặc nhóm fact;
- yêu cầu sửa;
- tạo Product Truth revision `CONFIRMED`;
- không được xác nhận bằng keyword/competitor data.

Product Truth tối thiểu linh hoạt theo product family:

- identity: product type/name;
- what buyer receives;
- material/composition nếu copy sử dụng;
- personalization capability/method/limits nếu sử dụng;
- variants/sizes/colors nếu sử dụng;
- digital/physical type;
- processing/shipping/packaging chỉ khi muốn claim;
- supplier/source note;
- language/marketplace.

### 4.4 Research Workspace

Các lane:

- Amazon Xray;
- Amazon Cerebro;
- Etsy search/HeyEtsy/YTrends;
- competitor/reference;
- supplier/feasibility;
- optional Pinterest.

Mỗi import có preview → confirm, hash, parser version, row accounting và project binding.

### 4.5 Listing Studio

Hai editor riêng:

- Amazon editor: title, highlights khi áp dụng, 5 bullets, description, search terms, A+, variations, PPC.
- Etsy editor: title, 13 tags, description, personalization, materials/attributes, digital fields.

Mỗi save tạo immutable revision mới, chạy lại claim/IP/policy validation và làm approval cũ mất hiệu lực.

### 4.6 Creative Studio

Hiển thị **đầy đủ mọi image job cần thiết**, nhưng mỗi job có trạng thái trung thực:

```text
PROMPT_READY
REAL_PHOTO_REQUIRED
OWNER_FACT_REQUIRED
REFERENCE_REQUIRED
NOT_APPLICABLE
BLOCKED_POLICY
```

Owner yêu cầu full prompt pack. Hệ thống đáp ứng bằng cách luôn xuất full **plan**; prompt chỉ được cụ thể hóa bằng fact đã xác nhận. Slot thiếu dữ liệu xuất prompt dạng acquisition/shot instruction hoặc `BLOCKED_MISSING_INPUT`, không bịa sản phẩm.

### 4.7 Review & Approval

Manager/Owner thấy cạnh nhau:

- Product Truth exact revision/hash;
- listing diff;
- keyword dispositions;
- claim/IP/policy report;
- creative plan/prompt report;
- missing fields;
- exact package hash.

Approval bind exact listing revision + truth revision + creative revision.

### 4.8 Export & Submission

- Chỉ approved exact revision được export.
- Seller chuẩn bị và quyết định `REQUEST_SUBMISSION`.
- Owner kiểm cuối và xác nhận export/submit.
- Phase 1 ghi `NOT_SUBMITTED` hoặc `SUBMITTED`, marketplace ID nếu thực tế có.
- Không tự ghi `LIVE`, `ACCEPTED` hoặc doanh thu.

---

## 5. Bốn readiness axes

Bốn trục là **server-side read projection**, không phải bốn state machines mới trong Phase 1.

| Axis | States | Ý nghĩa |
|---|---|---|
| Research | `EMPTY / IMPORTED / ANALYZED / REVIEWED / DEGRADED` | Dữ liệu thị trường đã có đến đâu |
| Product Truth | `EMPTY / STAFF_DRAFT / MANAGER_CONFIRMED / STALE` | Fact có authority đến đâu |
| Editorial | `NONE / SAFE_DRAFT / NEEDS_QA / APPROVED / STALE` | Listing revision hiện tại |
| Submission | `NOT_EXPORTED / EXPORTED / NOT_SUBMITTED / SUBMITTED` | Handoff thủ công |

Dependency:

```text
Research IMPORTED ─────────────► Intelligence preview
Product Truth STAFF_DRAFT ─────► Safe draft with blockers
Product Truth CONFIRMED ────────► Approval-eligible draft
Listing APPROVED ───────────────► Export
Export + Owner confirmation ────► SUBMITTED
```

Provider failure không khóa Product Truth hoặc safe draft. Nó chỉ chuyển Research thành `DEGRADED` và làm intelligence thiếu nguồn.

---

## 6. Research evidence — giải thích và quyết định

### 6.1 Research evidence là gì?

Đây là dữ liệu quan sát thị trường dùng để trả lời:

- buyer tìm từ gì;
- listing nào đang xuất hiện;
- search volume/rank/sales snapshot là gì;
- competitor dùng cấu trúc nào;
- cơ hội/cluster nào đáng cân nhắc.

Nó **không** chứng minh sản phẩm của ta làm bằng gì, kích thước bao nhiêu hoặc giao trong bao lâu.

### 6.2 Có bị chặn hoàn toàn không?

**Không.** Quy tắc cuối:

| Research source | Được dùng phân tích/SEO? | Được trở thành Product Truth? |
|---|---:|---:|
| Xray/Cerebro file staff tải lên | Có | Không |
| Etsy/HeyEtsy/YTrends snapshot | Có | Không |
| Competitor listing/reference | Có | Không |
| Supplier catalog/quote | Có, cho feasibility | Chỉ sau Seller nhập + Manager xác nhận đúng fact |
| Real product/spec/owner evidence | Không phải market research | Có thể, qua Product Truth review |

YTrends live check ngày 2026-09-08 trả kết quả cho `para mi hija`, nhưng snapshot ghi median age 64 ngày và chỉ khoảng 3.2% dữ liệu trong 14 ngày. Vì vậy nó hữu ích cho discovery, không được gắn nhãn “live Etsy truth”.

### 6.3 Canonical evidence envelope

```json
{
  "projectId": 123,
  "marketplace": "ETSY",
  "sourceKind": "YTRENDS_SNAPSHOT",
  "authority": "MARKET_OBSERVATION",
  "observedAt": null,
  "importedAt": "...",
  "contentHash": "sha256:...",
  "parserVersion": "...",
  "rowAccounting": {},
  "freshness": {},
  "rawArtifactRef": "...",
  "status": "CONFIRMED_IMPORT"
}
```

---

## 7. Canonical data model

### 7.1 Aggregate roots

```text
Workspace
└── Project
    ├── Product
    │   ├── ProductTruthRevision[]
    │   └── ProductVariant[]
    ├── ResearchSourceArtifact[]
    │   └── ResearchObservation[] / normalized projection
    ├── IntelligenceSnapshot[]
    ├── Listing
    │   └── ListingRevision[]
    ├── CreativePackage
    │   └── CreativeRevision[]
    ├── Approval[]
    ├── ExportPackage[]
    └── SubmissionReceipt[]
```

### 7.2 Tables

Giữ/migrate có kiểm soát các root hiện hữu và thêm bảng con canonical:

| Table | Mục đích | Mutation rule |
|---|---|---|
| `research_projects` | project root | scoped update |
| `research_evidence` | evidence ledger/index | append-oriented |
| `research_source_artifacts` | file/hash/parser/raw reference | immutable |
| `product_truth_revisions` | staff + manager truth versions | append-only |
| `listings` | current listing identity/pointer | controlled update |
| `listing_revisions` | full content history | append-only |
| `intelligence_snapshots` | normalized/scored output | immutable by strategy version |
| `creative_revisions` | plan + GPT prompt package | append-only |
| `approvals` | exact context/hash signatures | append-only/invalidate |
| `export_packages` | exact exported manifests | immutable |
| `submission_receipts` | submitted/not submitted | append-only |

Không lưu workbook lớn lặp lại trong SQLite BLOB nếu có thể tránh. Trên VPS:

```text
data/artifacts/<workspace>/<project>/<sha256>/original
```

DB lưu hash, size, MIME, path/reference và accounting. Backup phải bao gồm DB + artifact tree cùng manifest.

---

## 8. Canonical bootstrap — sửa vòng khóa trước khi integration

Đây là Gate bắt buộc đầu tiên của Track B.

### 8.1 Chuỗi hợp lệ mới

```text
POST project
→ POST product truth revision (Seller, STAFF_DRAFT)
→ PATCH/POST manager confirmation (MANAGER_CONFIRMED)
→ POST listing compose-preview (zero-write)
→ POST listing revisions (canonical NEEDS_QA v1)
→ PATCH listing revisions (v2...)
→ POST validate exact revision
→ POST approve exact context (Manager/Owner)
→ GET export exact approved revision
→ POST submission receipt
```

### 8.2 Invariants

- Tạo `NEEDS_QA` không đòi listing đã `PUBLISH_READY`.
- Research provider không phải điều kiện để tạo safe draft.
- Approval/export vẫn fail-closed.
- Product Truth đổi → listing/creative approval cũ `STALE`.
- Listing edit → approval cũ invalidated.
- Preview không ghi DB.
- Commit luôn ghi immutable revision.

---

## 9. Shared Claim Validator

### 9.1 Taxonomy C1–C8

| Class | Nội dung | Ví dụ |
|---|---|---|
| C1 | material/purity | gold, plata, 925, 14k, cotton, acrylic |
| C2 | gemstone/component | diamond, pearl, birthstone |
| C3 | dimension/quantity | 45 cm, oz, set of 3 |
| C4 | capability/process | personalized, engraved, embroidered, waterproof |
| C5 | origin/facility | made in USA, Austin workshop |
| C6 | fulfillment/time | ship in 24h, same-day delivery |
| C7 | social/ranking/certification | 5-star, best seller, Amazon's Choice |
| C8 | packaging/accessory | gift box, velvet insert, message card, USB |

### 9.2 Surface policy

| Surface | Unsupported claim xử lý |
|---|---|
| Title/highlights/bullets/description/A+ | BLOCK from visible copy |
| Image prompt/overlay/alt text | BLOCK slot/detail |
| Backend search terms/tags | Exclude by default |
| PPC | `PPC_REVIEW` with flags; không auto-launch |
| Research report | Giữ nguyên observation + reason |

Owner muốn dùng tối đa keyword. Điều đó được thực hiện bằng **full disposition**, không bằng nhồi mọi keyword vào customer-facing copy:

```text
VISIBLE_COPY
BACKEND_SEARCH
PPC_REVIEW
RESERVE
REJECTED_IP
REJECTED_CLAIM
REJECTED_POLICY
REJECTED_IRRELEVANT
```

Không keyword nào biến mất: mọi input phrase có source row và disposition.

### 9.3 Hai lớp bảo vệ

1. Pre-composition: phrase có claim chưa corroborate không được vào visible-copy pool.
2. Post-composition: quét output cuối để bắt claim do template/LLM/human edit thêm.

Invariant:

> Không output nào được khẳng định một thuộc tính trong khi Product Truth hoặc field khác đánh dấu thuộc tính đó `UNKNOWN/MISSING`.

---

## 10. Amazon pipeline

```text
CREATE PRODUCT
→ SELLER PRODUCT TRUTH DRAFT
→ MANAGER CONFIRM
→ XRAY PREVIEW/CONFIRM
→ ASIN FILTER + DIVERSE BATCHES
→ CEREBRO PREVIEW/CONFIRM
→ SCORE/CLUSTER/ACCOUNT
→ CLAIM-SAFE ALLOCATION
→ AMAZON COMPOSE PREVIEW
→ SAVE LISTING REVISION
→ FULL EDITOR
→ CLAIM/IP/POLICY AUDIT
→ A+ + CREATIVE PACKAGE
→ MANAGER APPROVE EXACT CONTEXT
→ EXPORT MANUAL PACKAGE
→ OWNER SUBMIT
→ RECORD SUBMITTED/NOT_SUBMITTED
```

### 10.1 Amazon outputs

- Product identity and truth manifest.
- Xray ASIN selection/batches with rejection reasons.
- Cerebro normalized metrics and source provenance.
- Keyword disposition/accounting.
- Title under category/policy version.
- Item Highlights when applicable.
- Five bullets with explicit empty/blocker states.
- Description.
- One Generic Keywords field within current byte contract (249-byte compatibility ceiling unless Seller Central category contract overrides it).
- Variations/personalization only from Product Truth.
- PPC Exact/Phrase/Broad recommendations, never auto-launched.
- Basic A+ package because Owner confirms Brand Registry; module content still fact-gated.
- Full Amazon creative plan/prompt package.
- Validation/approval/export/submission receipts.

### 10.2 Pilot order

1. `Para mi hija` necklace — real product, EN/ES, first integration cohort.
2. Existing jewelry/Esposa corpus — adversarial material/purity cohort.
3. Embroidery — listing/creative plan first; physical-proof fields remain blocked until facts/sample evidence exist.
4. Acrylic, blanket, hat.

---

## 11. Etsy pipeline

```text
CREATE PRODUCT
→ SELLER PRODUCT TRUTH DRAFT
→ MANAGER CONFIRM
→ ETSY/YTRENDS/HEyETSY PREVIEW/CONFIRM
→ RANK + PATTERN MINER + WINNER GAP
→ KEYWORD CANDIDATES + RE-RANK
→ CLAIM-SAFE ETSY COMPOSE PREVIEW
→ SAVE LISTING REVISION
→ FULL EDITOR
→ CLAIM/IP/POLICY AUDIT
→ ETSY CREATIVE PACKAGE
→ MANAGER APPROVE
→ EXPORT/COPY PACKAGE
→ OWNER SUBMIT
→ RECORD SUBMITTED/NOT_SUBMITTED
```

### 11.1 Kế thừa từ 22etsy-agent

Giữ logic 5 giai đoạn nhưng gom vào Omni navigation:

| 22etsy stage | Omni destination |
|---|---|
| Find & Filter | Research workspace |
| Rank | Research / Opportunity view |
| Learn from winners | Pattern Miner subview |
| New keywords + Re-rank | Intelligence subview |
| Build & Ship | Listing + Creative + Submission workspaces |

Team Ops/Day-3/Day-7 chuyển Phase 2.

### 11.2 Etsy outputs

- Clear buyer-readable title; không keyword stuffing.
- 13 tags khi có 13 phrase hợp lệ. Etsy hiện khuyến nghị dùng đủ 13 tags và giới hạn 20 ký tự/tag; engine không được padding bằng claim/IP/irrelevant tags.
- Full description.
- Materials/attributes/personalization/processing/shipping chỉ từ Product Truth.
- Digital download fields cho printable products.
- Production-partner/disclosure fields khi áp dụng.
- Etsy image plan + GPT prompt pack.
- Keyword/source/disposition report.
- Approval/export/submission receipts.

Digital products và seller-prompted AI creations phải tuân thủ Etsy Creativity Standards/disclosure hiện hành.

---

## 12. Product-family profiles

Một universal workflow, nhưng không một mega-schema cho mọi loại hàng.

| Profile | Required fact groups | Special outputs |
|---|---|---|
| Jewelry | material/purity/plating, dimensions, chain, personalization, included items | material detail, scale, packaging if verified |
| Embroidery apparel | garment, fabric, decoration method, placement, thread/colors, sizes, care | stitch/detail jobs, size/color plan |
| Acrylic | acrylic type/thickness, base/light/power only if real, dimensions | assembly/lighting only when verified |
| Blanket | material, dimensions, print/embroidery, care, variants | size/use/detail plan |
| Hat | hat type, material, closure, size, embroidery/print placement | fit/closure/detail plan |
| Printable mystery game | files/pages, player count, age, duration, print requirements, language, license | cover, sample pages, evidence-board previews; no physical shipping claims |

Product-family registry xác định form fields, claim corroboration và creative slots. Nó không tự điền facts.

---

## 13. Creative/Image Prompt pipeline

### 13.1 Nguyên tắc Owner và ranh giới an toàn

Owner yêu cầu full prompt bộ ảnh, kể cả main image. Hệ thống sẽ xuất **full job inventory** cho từng product.

Tuy nhiên:

- Prompt AI không phải bằng chứng vật lý.
- Nếu chưa có ảnh/reference asset, prompt phải nói rõ `CONCEPT/MOCKUP`, không được đại diện là ảnh sản phẩm thật.
- Main-image prompt có thể được tạo để đội ảnh làm việc, nhưng package không được gắn `UPLOAD_READY` cho tới khi người thật xác nhận output khớp sản phẩm thật.
- Với Etsy seller-prompted AI creations, disclosure phải được áp dụng khi policy yêu cầu.

### 13.2 Canonical Creative Brief

```json
{
  "projectId": 123,
  "marketplace": "AMAZON",
  "listingRevision": 4,
  "productTruthRevision": 3,
  "productTruthHash": "sha256:...",
  "language": "ES",
  "strategyVersion": "creative-v1",
  "jobs": [{
    "slot": "MAIN_PRODUCT",
    "status": "PROMPT_READY",
    "purpose": "Primary product presentation",
    "verifiedFactsUsed": [],
    "requiredFacts": [],
    "mustPreserve": [],
    "mustNotInvent": [],
    "allowedText": [],
    "negativeConstraints": [],
    "promptNeutral": "...",
    "promptOpenAI": "...",
    "qaChecklist": []
  }]
}
```

Reference assets chưa bắt buộc trong Phase 1, nhưng fields/hash support được giữ nullable để không phải migration phá vỡ sau này.

### 13.3 Amazon full plan

Job inventory kế thừa AMZ-FBM:

1. Main product.
2. Real/product detail or observable detail.
3. Personalization guide.
4. Size/dimensions.
5. Color/variation overview.
6. Lifestyle/recipient.
7. Occasion when supported.
8. Material/care.
9. How to order.
10. Packaging/comparison/variation when supported.
11. Basic A+ hero.
12. A+ feature modules permitted by facts.

Không phải mọi job có prompt thương mại sẵn. Full export luôn chứa job, status, missing inputs và acquisition prompt/shot instruction.

### 13.4 Etsy full plan

1. Hero thumbnail.
2. Alternate angle/full product.
3. Detail/craft.
4. Personalization guide.
5. Scale/dimensions.
6. Color/material/variation.
7. Lifestyle/gift context.
8. How to order.
9. Packaging if verified.
10. Digital delivery/sample-page plan cho digital product.

Không tạo review năm sao giả hoặc social proof giả.

### 13.5 GPT adapter

Primary adapter là OpenAI/ChatGPT Images. Không nhét cú pháp Midjourney như `--ar`/`--v` vào canonical prompt.

Adapter tạo:

- prompt generation/edit;
- aspect-ratio guidance;
- reference-preservation instructions khi có ảnh;
- exact text layer riêng nếu cần;
- negative constraints;
- QA checklist.

Generated images không được tự động lưu làm verified fact hoặc approved asset.

---

## 14. Supplier integration

Website `https://sup.theglobalserviceteam.site/` hiện hoạt động và chứa supplier/profit decision logic, nhưng là standalone HTML và dùng browser-local storage/CSV imports.

Phase 1 không scrape hoặc đồng bộ ngầm. Dùng ba mức:

1. Omni có link mở Supplier Tool.
2. Seller nhập/import selected supplier quote/cost/spec vào Product Truth support record.
3. Manager xác nhận exact fact cần dùng.

Supplier price/spec không tự trở thành truth chỉ vì xuất hiện trên dashboard. Phase sau mới xây deterministic connector/API nếu source ổn định.

---

## 15. Track A — staff có draft sớm

### 15.1 Mục tiêu

Trong khi Track B tích hợp, cung cấp tool Amazon độc lập đã có claim guard để Seller tạo internal working draft từ file thật và Product Truth nhập tay.

### 15.2 Rủi ro Track A và biện pháp

| Rủi ro | Trả lời |
|---|---|
| Dữ liệu ảo | Không gọi provider nếu không có; input file/staff facts có provenance; missing giữ missing |
| Claim sai | C1–C8 pre-filter + output claimAudit; Manager review bắt buộc |
| Trademark/IP | Word-boundary matcher chạy; fuzzy/glue mới phải review; IP screen không phải legal clearance |
| PPC misleading | Keyword có unverified claim chỉ vào `PPC_REVIEW`, không auto-export như launch-ready |
| Persistence | Local tool không phải canonical; output watermark và manifest |
| Production confusion | `INTERNAL WORKING DRAFT — NOT APPROVED / NOT SUBMISSION READY` |

### 15.3 Điều kiện phát hành Track A

- 101/101 donor test tiếp tục PASS.
- Chạy Hija và Esposa real-file scenarios.
- IP false-positive/false-negative fixtures PASS.
- Export có Product Truth snapshot, source hashes và claim report.
- Seller không thể bỏ watermark/đổi status trong UI.
- Owner/Manager đọc và duyệt draft trước khi dùng.

### 15.4 Giới hạn

- Amazon first; không giả vờ Etsy đã hoàn chỉnh.
- Không ghi Factcheck production DB.
- Không có canonical approval.
- Không gọi là production-ready.

---

## 16. Track B — canonical integration

### Wave 0 — Preserve and bind (không quá 0.5 ngày kỹ thuật)

- Ghi exact SHA/tree/diff/status cho donor branches.
- Clean/tag/push GPT2 donor nếu review receipt đạt.
- Bundle/hash GPT3 và Claude artifacts nếu chúng không có Git head độc lập.
- Không xóa branch trước preservation receipt.

**Exit:** donor manifest có thể tái tạo.

### Wave 1 — Bootstrap vertical slice (1–2 ngày kỹ thuật, timebox)

- Viết failing browser/API scenario từ new project → truth → `NEEDS_QA` listing.
- Sửa canonical bootstrap deadlock nhỏ nhất.
- Thêm immutable listing revision tối thiểu.
- Không port intelligence lớn trong wave này.

**Exit:** project mới tạo được canonical draft từ confirmed Product Truth, edit/reopen được.

**Stop condition:** nếu hết 2 ngày vẫn chưa có v1 persisted/reloaded bằng UI, dừng và review architecture; không mở rộng thêm.

### Wave 2 — Research provenance + Amazon vertical slice (2–3 ngày kỹ thuật)

- Port preview/confirm/hash/accounting.
- Port fixed Amazon intelligence + shared claim validator.
- Hija real files → Amazon draft → edit → Manager approval → export.
- Full keyword disposition.

**Exit:** Seller tạo một Amazon package thật trong browser.

### Wave 3 — Creative + A+ vertical slice (1–2 ngày kỹ thuật)

- Server-side Creative Brief.
- Amazon full job plan + GPT prompt adapter.
- A+ fact-gated modules.
- Creative revision bound to listing/truth.

**Exit:** Hija package có listing + A+ + full creative plan/prompts + blockers.

### Wave 4 — Etsy vertical slice (2–4 ngày kỹ thuật)

- Adapter contract từ 22etsy-agent.
- Etsy source import, Pattern Miner essentials, keyword disposition.
- Etsy composer/editor/13 tags/creative prompt pack.
- Real 194-row corpus browser journey.

**Exit:** một Etsy package thật approved/exported.

### Wave 5 — Submission handoff + hardening (1–2 ngày kỹ thuật)

- Export manifest/hash.
- `NOT_SUBMITTED/SUBMITTED` receipt.
- VPS concurrency/restart/backup/restore.
- Cross-workspace negative tests.
- Independent review and exact-SHA ruling.

**Exit:** Phase 1 accepted.

### Timeline interpretation

Đây là **8–13 ngày kỹ thuật tập trung**, không phải lời hứa lịch cứng. Track A phải tạo giá trị trước. Mỗi wave có usable exit và stop condition; không được làm 13 ngày rồi mới cho staff nhìn sản phẩm.

Physical sampling/photo work chạy song song và không được che giấu trong engineering estimate.

---

## 17. Branch, worktree và commit strategy

### 17.1 Integration branch

```text
integration/staff-workflow-v1
base: exact approved main SHA
one integration owner: GPT2
```

### 17.2 Commit DAG

```text
C0 contracts/tests only
 └─ C1 canonical bootstrap + revision schema
     └─ C2 Product Truth + Claim Validator
         ├─ C3 research provenance
         │   ├─ C4 Amazon adapter
         │   └─ C6 Etsy adapter
         └─ C5 Creative Brief core
             ├─ C5A Amazon/A+
             └─ C6A Etsy creative
                 └─ C7 approval/export/submission
                     └─ C8 UAT/docs/receipts
```

Không nói “cherry-pick độc lập” nếu chưa clean-cherry-pick/test.

### 17.3 PR rules

- Mỗi PR có một vertical outcome hoặc một shared invariant.
- Không trộn security cleanup, UI redesign và engine port vào một commit.
- Mọi PR ghi base/head/tree SHA, commands, exit codes, real/synthetic fixtures, NOT_EXECUTED fields.
- Agent viết code không phải agent duy nhất certify.

---

## 18. API contracts dự kiến

Tên có thể điều chỉnh, semantics không được đổi:

```text
POST   /api/projects
POST   /api/projects/:id/research/preview
POST   /api/projects/:id/research/confirm
GET    /api/projects/:id/research

POST   /api/projects/:id/product-truth/revisions
POST   /api/projects/:id/product-truth/:version/confirm

POST   /api/projects/:id/intelligence/preview
POST   /api/projects/:id/listings/compose-preview
POST   /api/projects/:id/listings/revisions
PATCH  /api/listings/:id/revisions
GET    /api/listings/:id/revisions

POST   /api/listings/:id/creative/preview
POST   /api/listings/:id/creative/revisions

POST   /api/listings/:id/validate
POST   /api/listings/:id/approve
GET    /api/listings/:id/export
POST   /api/listings/:id/submissions

GET    /api/projects/:id/readiness
GET    /api/work-queue
```

Preview routes zero-write. Mutation routes require expected version/idempotency key where applicable.

---

## 19. Acceptance gates

### Gate A — Safety

- 0 unsupported C1–C8 claim in customer-facing text or image prompt.
- 0 known competitor/shop mark in listing, tags, backend or auto-PPC output.
- IP blocked phrase never reaches output.
- Missing data never becomes zero or invented value.
- Cross-workspace/tenant/marketplace isolation PASS.

### Gate B — Accounting

- Every input row reconciles.
- Every keyword has source + disposition.
- No silent truncation.
- Duplicates/rejections/filtered/reserve/PPC/copy totals explainable.

### Gate C — Product utility

- Different product truths/corpora produce meaningfully different drafts.
- Hija and Esposa adversarial scenarios pass.
- Seller rates relevance, readability and required edit effort.
- No renderer “fills” five bullets with fabricated filler.
- Missing fields are actionable, not generic.

Không bắt `70% corpus tokens` vào listing. Coverage được đo trên usable/dispositioned phrases để tránh keyword stuffing.

### Gate D — Marketplace

- Amazon title/policy/category validation uses versioned policy contract.
- Generic Keywords stay within compatible byte ceiling.
- Etsy title follows clear-title guidance; 13 tags each ≤20 characters when 13 safe tags exist.
- Etsy custom/digital/AI disclosure and production-partner rules represented.
- A+ only fact-gated despite Brand Registry eligibility.

### Gate E — Version/authority

- Product Truth change invalidates dependent approval.
- Listing/creative edit creates new revision and invalidates approval.
- Export returns exact approved hashes only.
- Seller cannot self-approve.
- Submission cannot imply live/accepted.

### Gate F — Browser/VPS

Amazon and Etsy journeys must run through normal UI:

- multi-user remote sessions;
- refresh/relogin/restart;
- optimistic concurrency conflict;
- file upload/download;
- no DB injection/API shortcut;
- backup/restore retains DB + artifacts;
- process shutdown cleanly.

### Gate G — Real cohorts

Minimum Phase 1 cohort:

1. Hija necklace — Amazon EN/ES.
2. Hija necklace — Etsy EN/ES.
3. Esposa jewelry — incorrect 925/18k contamination.
4. Embroidery — missing physical evidence/creative blockers.
5. One non-apparel custom product.
6. “Who killed Arthur Blackwood?” digital printable profile.

---

## 20. Agent allocation

| Agent | Primary responsibility | Không được làm |
|---|---|---|
| GPT1 | Final invariants, Product Truth, approval/ruling | Main implementation owner |
| GPT2 | Sole Factcheck integration owner | Invent parallel store/authority |
| Claude | Amazon donor, claim validator, equivalence review | Tự certify transplant của mình |
| GPT3 | Provenance/import/editor UX donor, Track A operations | Merge prototype persistence |
| Gravity | Workspace/full editor/creative UX/browser UAT | Tuyên bố fixed từ design spec |
| GPT4 | Independent security/authority/negative review | Sửa finding rồi tự approve |
| Seller | Product Truth draft, daily listing quality, request submit | Approve/export authority |
| Manager | Confirm Product Truth, QA exact revision | Dùng research làm product fact |
| Owner | Final check/export/submit decision | Auto-mark marketplace accepted |

Mỗi agent review file này phải trả:

```text
ACCEPT / MODIFY / REJECT
Finding priority
Exact section
Evidence
Proposed replacement text
Impact on timeline/usable output
```

---

## 21. Stop-doing và anti-waste rules

1. Không thêm dashboard ngoài bảy workspace chính.
2. Không tạo persistence/workflow thứ hai.
3. Không làm Phase 2 learning trước Phase 1 submitted handoff.
4. Không tích hợp marketplace publish API.
5. Không viết generic image templates để lấp slot thiếu facts.
6. Không tự xây lại domain logic khi donor có contract/test tốt.
7. Không port donor nếu chưa có parity fixture.
8. Không dùng focused test để tuyên bố toàn hệ thống green.
9. Không kéo một wave quá timebox mà không có usable artifact.
10. Không tiếp tục nếu staff UAT cho thấy next action không rõ.
11. Không tối ưu architecture trong khi vertical slice cơ bản chưa chạy.
12. Không dùng “100%, fixed, ready” nếu chưa có exact-SHA evidence.

### Escalation rule

Nếu một wave trượt stop condition:

```text
STOP new code
→ record exact blocker
→ preserve current evidence
→ compare simplify/rollback/continue options
→ Owner chooses
```

Không tự mở thêm workstream để che blocker.

---

## 22. Deliverable package cuối Phase 1

```text
/project-output
  00_READ_ME_FIRST.md
  01_PRODUCT_TRUTH.json
  02_SOURCE_MANIFEST.json
  03_INTELLIGENCE_SUMMARY.json
  04_KEYWORD_DISPOSITION.csv
  05_CLAIM_IP_POLICY_REPORT.json

  /amazon
    AMAZON_LISTING.json
    AMAZON_LISTING.txt
    AMAZON_PPC_REVIEW.csv
    AMAZON_APLUS.json
    AMAZON_CREATIVE_PLAN.json
    AMAZON_GPT_IMAGE_PROMPTS.md

  /etsy
    ETSY_LISTING.json
    ETSY_LISTING.txt
    ETSY_TAGS.csv
    ETSY_CREATIVE_PLAN.json
    ETSY_GPT_IMAGE_PROMPTS.md

  /review
    REVISION_DIFF.json
    VALIDATION_REPORT.json
    APPROVAL_RECEIPT.json

  /submission
    EXPORT_MANIFEST.json
    SUBMISSION_RECEIPT.json
```

Mỗi package có SHA-256 manifest. File tên `READY` chỉ được tạo khi canonical decision cho phép.

---

## 23. Phase 2 — explicitly deferred

Không làm trước khi Phase 1 đã có sản phẩm submitted thật:

- marketplace accepted/rejected reconciliation;
- Day-3/Day-7/Day-14 learning;
- sales feedback automation;
- direct supplier connector/API;
- reference asset library/version UI đầy đủ;
- automated image generation inside Omni;
- SP-API/Etsy publication;
- broad analytics/dashboard expansion.

---

## 24. External policy sources used for the plan

Policies are versioned dependencies, not timeless constants:

- Amazon title update: most categories ≤200 characters, restricted special characters and repeated-word rules: <https://sellercentral.amazon.com/seller-forums/discussions/t/533f9cf7-3b5e-4974-b523-02e4a1a42c5f>
- Etsy keyword/tag guidance: use 13 varied phrase tags, each up to 20 characters: <https://www.etsy.com/seller-handbook/article/382774281517>
- Etsy 2026 title guidance favors clear, scannable titles and holistic listing signals: <https://www.etsy.com/seller-handbook/article/1399426136697>
- Etsy permitted items/AI disclosure/production partner guidance: <https://help.etsy.com/hc/en-us/articles/360024112614-What-Can-I-Sell-on-Etsy>
- Etsy listing image requirements: <https://help.etsy.com/hc/en-gb/articles/115015663347-Requirements-and-Best-Practices-for-Images-in-Your-Etsy-Shop>
- OpenAI Images supports generation/editing and reference-image workflows; model-specific adapters must follow current OpenAI documentation: <https://help.openai.com/en/articles/11084440-images-in-chatgpt>

Before implementation approval, agents must re-check current Seller Central/category rules where authenticated documentation is required.

---

## 25. Review request and final acceptance format

This document is the proposed master plan, not evidence that implementation exists.

Reviewers must focus on:

1. Can a new project create the first canonical listing revision without provider deadlock?
2. Does any donor create a second authority?
3. Does C1–C8 protect both text and image prompts without killing useful SEO?
4. Does every keyword retain accounting and a safe disposition?
5. Are Amazon and Etsy genuinely separate domain adapters?
6. Can remote staff complete both browser journeys?
7. Does each wave produce usable business output before the next wave?
8. Is Phase 2 scope kept out?

Final reviewer response:

```text
VERDICT:
BLOCKERS:
REQUIRED CHANGES:
OPTIONAL IMPROVEMENTS:
EVIDENCE VERIFIED:
EVIDENCE NOT VERIFIED:
RECOMMENDED FIRST COMMIT:
```

---

## Final statement

### Binding real-input import contract

Việc triển khai Research workspace và Amazon/Etsy adapters phải tuân thủ tài liệu:

```text
docs/REAL_INPUT_IMPORT_CONTRACT_AND_GAP_AUDIT_HIJA_R1.md
```

Năm file Hija trong `Inputdata08092026/` là certification fixtures bắt buộc. Không được gọi pipeline là usable/lossless nếu chưa đạt các gate: 195 Etsy observations được giữ, Xray 19/19 dòng được normalize, Cerebro 1.099/1.099 keyword và 40/40 cột được accounting, cột dịch không header được giữ, và toàn corpus có thể truy cập downstream thay vì chỉ top 100.

Mục tiêu Phase 1 là một hệ thống dùng được, không phải một architecture demo:

```text
REAL PRODUCT TRUTH
+ REAL MARKET RESEARCH
+ DOMAIN INTELLIGENCE
→ CLAIM-SAFE AMAZON / ETSY LISTING
+ FULL GPT IMAGE PROMPT PLAN
→ STAFF EDIT
→ MANAGER/OWNER APPROVAL
→ EXACT EXPORT
→ MANUAL SUBMISSION RECORDED
```

Track A đưa draft an toàn đến staff sớm. Track B biến tinh hoa của hai tháng xây dựng thành một cấu trúc canonical trên VPS. Không hệ thống cũ nào bị bỏ trước parity; không donor nào được merge nguyên khối; không claim hoặc prompt nào được phép biến research thành sự thật về sản phẩm.

