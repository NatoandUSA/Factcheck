# Đề xuất nâng cấp Amazon Staff Workflow v1

**Tác giả:** Manus AI  
**Ngày:** 2026-08-20  
**Phạm vi:** Đề xuất workflow và acceptance criteria; **không** thay đổi code, listing, Seller Central, quote hoặc marketplace data.

## 1. Verdict ngắn

Các annotation đi đúng hướng ở ba điểm: **đưa nút tạo listing ra sau research**, **tạo Master Keyword List có thứ tự rõ ràng**, và **có nơi nhập terms không được dùng trong buyer-facing copy**. Tuy nhiên, không nên triển khai chúng như các rule tĩnh hoặc thêm một workflow lớn hơn. Hiện luồng Amazon có ba bypass quan trọng: Quick Launch từ seed phrase ở đầu Workspace; B4 fallback tạo draft nếu không có Cerebro trend; và simulator trình bày nhiều customer-facing claims hardcoded. Các bypass này tạo Staff friction giả tạo và rủi ro truth boundary lớn hơn cả vấn đề layout.

> **North star:** Một Staff tạo được Amazon draft từ Product Truth + research có nguồn, hiểu rõ dữ liệu nào là `OBSERVED`/`MANUAL`/`UNKNOWN`, và không nhìn thấy simulator như một Amazon detail page thật hay listing ready-to-publish.

| Quyết định | Kết quả |
|---|---|
| Đặt Create Listing sau research | **ACCEPT, nhưng là Gate không phải chỉ đổi vị trí UI** |
| Bỏ Google Trends khỏi Stage 2 | **ACCEPT về UI, không xóa provider/truth semantics** |
| Nhập competitor từ X-Ray/manual vào Learning Box | **ACCEPT, với provenance từng input và “học cấu trúc, không copy claim”** |
| Comparator `< 1,000` là điều kiện bắt buộc | **REJECT as hard rule; dùng filter Staff-configurable khi value là OBSERVED** |
| Trend trước rồi Volume | **ACCEPT as sort view có provenance; không tạo GO score nếu source thiếu** |
| Cố định `1 Parent + 4 Child ASIN` | **REJECT** |
| Hard-ban `mother day`, `gift for`, `christmas gift` | **REJECT** |
| Box Staff exclusion terms | **ACCEPT, nhưng là per-product suppression policy, không phải danh sách “Amazon banned terms”** |

## 2. Điều code hiện tại chứng minh

| Current evidence | Risk / implication |
|---|---|
| `src/components/AmazonWorkspace.jsx:20–48` có top-level Quick Launch gọi `/api/amazon/quick-draft` chỉ từ `seedPhrase` và `category`. | Nút tạo draft đang bypass Stage 1–3; chỉ di chuyển button sẽ không đóng bypass nếu handler còn tồn tại. |
| `src/components/AmazonPipelineWorkflow.jsx:112–140` tạo listing từ `trendId`, nhưng fallback sang Quick Draft nếu không có Cerebro result. | “Research complete” không phải gate server/UI thật. |
| `src/components/MasterKeywordTable.jsx:122–131` gán Tier 1 khi `idx < 10` và Tier 2 khi `idx < 35`. | Tier đang phụ thuộc rank position, không phải decision có evidence hoặc fit Product Truth. |
| `server/keywordRanker.js:189–208` append fallback terms như `gift`, `mom`, `personalized`, `custom`, `handmade` khi byte budget còn. | Backend có thể thêm capability/intent chưa được Product Truth hay source keyword hỗ trợ. |
| `src/components/AmazonRealProductPage.jsx:52, 173–229, 249–278` dùng label “100% Real”, ratings, price, Prime, stock, ship-from, seller và A+ claims hardcoded. | Staff có thể nhầm placeholder với buyer-facing fact thật; final preview phải fail closed. |

## 3. Policy boundary cần giữ

Amazon yêu cầu product detail page mô tả chính xác một unique product, không tạo duplicate page, chỉ tạo variation hợp lệ, không dùng HTML/JavaScript trên detail page (trừ line break hạn chế), và áp dụng giới hạn 75 ký tự title/125 ký tự item highlight theo trang policy hiện hành.[1]

Parent là container không buyable. Mỗi child cần unique seller SKU và thường cần product identifier riêng nếu không thuộc trường hợp exemption; variation chỉ hợp lệ khi cùng brand/product type và khác nhau ở variation attribute được chấp thuận như size hoặc color. Vì vậy “tạo sẵn 1 parent + 4 child ASIN” trước khi có Product Truth/variant set là sai model: nội bộ chỉ được lập **Variation Plan**, không tự tạo/khẳng định ASIN.[2]

Generic keywords có guideline về relevant synonyms, lower-case, space separation, tránh duplicate; các ví dụ prohibited gồm brand names, ASINs và offensive language. Guidance không tạo blanket ban với ordinary seasonal/gift phrases. Backend byte limit phải hiển thị là limit của field/account/product type; `240` chỉ có thể là internal safety target, không được ghi nhầm là Amazon policy nếu source không xác nhận.[3]

## 4. Workflow target: sáu gates nhẹ, không thêm architecture lớn

```text
G0 Product Truth Reference
  → G1 X-Ray / Manual competitor evidence
  → G2 Cerebro / keyword evidence (or explicit INSUFFICIENT_EVIDENCE)
  → G3 MKL decision + Draft eligibility
  → G4 Staff Preview + truth/IP/format QA
  → G5 Manual Seller Central submission
```

| Gate | Staff cần làm | Allowed output | Blocker |
|---|---|---|---|
| **G0 — Product Truth Reference** | Chọn `product_truth_id` + version hoặc link card; xác nhận category/SKU family. | Research có context product. | Không có exact product/supplier or required facts bị `UNKNOWN`. |
| **G1 — Competitor evidence** | Upload X-Ray hoặc manual ASIN/text list có source URL/file/date. | ASIN candidate list + provenance. | Không có source thì `NO_COMPETITOR_EVIDENCE`, không sinh competitor metric. |
| **G2 — Keyword evidence** | Upload Cerebro; trend chỉ là one evidence source nếu provider trả observed. | Keyword rows với field-level states. | Missing metrics giữ `NULL`/`INSUFFICIENT_EVIDENCE`, không zero/default. |
| **G3 — Draft eligibility** | Staff chọn MKL rows, keyword intent và exclusion list; verify Product Truth support. | `DRAFT_ALLOWED` hoặc `DRAFT_WITH_LIMITED_EVIDENCE`. | No title/bullet/backend injection từ unknown capability/material. |
| **G4 — Preview QA** | Xem Staff Preview; check content, image readiness, IP, variation plan, price/fulfillment. | `READY_FOR_MANUAL_ENTRY` only. | Placeholder/synthetic seller/price/stock/shipping/ratings/A+ claim. |
| **G5 — Manual submission** | Owner nhập Seller Central, review product-type template và submits deliberately. | Submission record / outcome. | Không auto-publish, không assume ASIN created. |

## 5. P0 — Bốn thay đổi nhỏ nhưng phải làm trước Amazon pilot

### P0-A. Thay Quick Launch bằng Draft Gate

Ẩn/remove top-level `Tạo Nhanh Listing A10` và không cho B4 fallback tạo listing chỉ từ seed phrase. Một nút duy nhất gọi là **“Tạo Draft từ MKL đã duyệt”** chỉ enabled khi có:

1. `product_truth_id`/version reference và category match;
2. ít nhất một research path có provenance (`Cerebro`, manual keyword source) hoặc Staff explicitly acknowledges `DRAFT_WITH_LIMITED_EVIDENCE`;
3. keyword selected list; và
4. IP screen + Staff exclusion policy đã chạy.

**Không block research/drafting chỉ vì trend provider lỗi.** Trend failure là `SOURCE_ERROR`; nó chỉ không được giả thành score hoặc rising signal.

### P0-B. MKL trở thành evidence table, không phải score table

Thêm các field hiển thị: `source_type`, `source_file_or_url`, `observed_at`, `volume_state`, `competitor_state`, `trend_state`, `product_truth_fit`, `keyword_decision`, `exclusion_reason`. Nếu nguồn thiếu, render `—` + state; không render 0 hay score có vẻ quyết định.

Sửa tiering: Staff chọn một keyword/phrase đã evidence cho **Title Candidate**, các keyword support cho **Bullet Candidate**, và de-duplicated residual terms cho **Backend Candidate**. Không gán Tier 1 chỉ vì row nằm trong top 10.

`Competitor < 1,000` nên là filter slider/check, không hard gate. Chỉ filter khi `competingProducts` observed. `Search VL` trong annotation chưa rõ nghĩa; nếu là **search volume**, đặt nhãn đầy đủ `Search Volume`, source + observed time.

### P0-C. Không có fallback generic keyword/capability injection

Loại bỏ/disable fallback auto-append `gift`, `mom`, `personalized`, `custom`, `handmade`… trừ khi mỗi term đồng thời:

* có keyword source observed/manual provenance; và
* không mâu thuẫn Product Truth (ví dụ `personalized` chỉ khi production path xác nhận `YES`).

Giữ byte counter làm hai số khác nhau: **internal target** (ví dụ 240 bytes) và **enforced field cap** (valid cho marketplace/product type/account tại submission). Không dùng chung caption `249`/`240` theo cách Staff hiểu là policy tuyệt đối.

### P0-D. Simulator thành “Staff Preview — Not a Live Amazon Page”

Đổi label `Amazon 100% Real Product Page Simulator` thành **Amazon Staff Preview — Not Live / Not Submission Ready**. Xóa hoặc render `UNKNOWN` cho hardcoded ratings, Amazon’s Choice, list price, Prime, delivery tomorrow, stock, ships-from/sold-by và A+ fallback claims. A+ only hiển thị draft module nếu account/brand eligibility và Product Truth support đã được Staff xác nhận; không hứa “10 modules ready”.

## 6. P1 — Refine research hub và listing controls sau P0

### Một canonical Trends card, không hai Google Trends workflows

Giữ Google Trends provider/truth states nhưng chỉ render **một** card canonical tại G2/MKL context. Stage 2 có thể giữ link **“View research evidence”**, không cần duplicate panel. Khi related queries không có evidence, hiển thị `NOT_AVAILABLE`, không được biến thành 0 breakout keywords.

### Learning Box: structure extraction, not content cloning

Thêm input mode cho `X-Ray selected ASIN`, `Manual ASIN/URL`, `Manual text`. Mỗi item cần `source_url_or_file`, `captured_at`, `source_type`, `copied_content_scope`, `IP status`. Output phải có bảng:

| Học được | Không được reuse |
|---|---|
| Length/section structure, neutral tone pattern, attribute placement pattern | Brand language, product claims, materials, warranty, reviews, ratings, price, shipping, images, title text copy |

Không ghi “tự động áp dụng vào AI” nếu template chưa qua Product Truth/claim sanitizer. Dùng wording **“structure reference, subject to Product Truth”**.

### Staff exclusion terms: cần ba class thay vì “Amazon banned list”

| Class | Ví dụ | Hành vi |
|---|---|---|
| `POLICY_OR_IP_BLOCK` | brand, ASIN, offensive term, protected term | Block tất cả relevant fields. |
| `PRODUCT_TRUTH_BLOCK` | `personalized` khi capability unknown, `handmade` khi production path unknown | Block title/bullets/A+; show missing fact. |
| `STAFF_CAMPAIGN_SUPPRESS` | seasonal term không phù hợp campaign/market | Warn/omit theo product/card; không gọi là Amazon prohibited. |

`mother day`, `gift for`, `christmas gift` chỉ vào class 3 nếu Staff muốn suppress theo campaign. Chúng không nên bị hardcoded as prohibited terms.

## 7. Variations: Variation Plan, không fixed ASIN generator

Một variation chỉ được tạo khi Product Truth chứng minh **real child products** khác nhau ở approved variation theme, cùng brand/type và có exact SKUs/identifiers/offer facts. [2]

| Field trong Variation Plan | State trước submission |
|---|---|
| Parent SKU (internal) | Proposed, not parent ASIN |
| Child SKU(s) | Proposed, each backed by Product Truth variant data |
| Theme | Exact allowed category theme required |
| Size/color/material values | Observed/Owner-attested against supplier SKU, not generated |
| Child count | Derived from actual variants; may be 0, 1, 2, 4… never fixed to 4 |
| Parent/child ASIN | `UNKNOWN` until Amazon creates/accepts relationship |

## 8. Acceptance criteria for one pilot

| Test | Pass condition |
|---|---|
| Seed-only bypass | No draft generation from seed/category alone; UI reports missing G0–G3 evidence. |
| Trend failure | Provider error remains `SOURCE_ERROR`; no default trend score/query/GO. |
| Missing research metric | `NULL`/`INSUFFICIENT_EVIDENCE`; no 0/default score. |
| Keyword fallback | No `personalized`, `custom`, `handmade`, gift/seasonal term appears unless selected/supported. |
| Policy suppression | Brand/ASIN/IP terms block; seasonal suppression warns but does not mislabel as Amazon prohibited. |
| Variation | No parent/child ASIN plan appears until actual valid variants are attached. |
| Preview | No ratings, Prime, stock, price, ship-from/sold-by, A+ materials/packaging claim without supported listing/Product Truth fields. |
| Manual endpoint | Final output is a Staff draft/CSV or field checklist, never a marketplace submission. |

## 9. Explicitly defer

Do **not** build: a broad Product Truth Registry, auto-publish, fixed four-child architecture, a universal A10 scoring engine, LLM-coded competitor cloning, or a new multi-table research platform. Run one Amazon pilot after P0, log which gate actually creates friction, then take only the next measured change.

## References

[1]: [Amazon Seller Central — Product detail page rules](https://sellercentral.amazon.com/help/hub/reference/external/G200390640?locale=en-US)

[2]: [Amazon Seller Central — Create and manage product variations](https://sellercentral.amazon.com/help/hub/reference/external/GEKYC26YEZX2VSHM?locale=en-US)

[3]: [Amazon Seller Central — Use search terms effectively](https://sellercentral.amazon.com/help/hub/reference/external/G23501?locale=en-US)
