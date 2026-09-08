# Real Input Import Contract & Gap Audit — Hija R1

**Ngày audit:** 2026-09-08

**Phạm vi:** 3 Etsy CSV + Amazon Xray + Amazon Cerebro

**Mục đích:** khóa contract để OmniSeller nhập, lưu, phân tích và giải trình toàn bộ dữ liệu nguồn mà không âm thầm làm mất cột, dòng, trạng thái thiếu dữ liệu hoặc provenance.
**Trạng thái:** **CHANGES REQUIRED — CURRENT IMPORT IS NOT LOSSLESS**

---

## 0. Kết luận điều hành

Năm file đều đọc được và đủ ổn định để trở thành bộ fixture thật cho integration. Tuy nhiên importer hiện tại chưa đáp ứng yêu cầu “process toàn bộ dữ liệu”.

Các blocker đã tái hiện:

1. **Xray:** đọc đủ 19 dòng nguồn nhưng chỉ đưa 16 dòng vào analysis projection. Ba ASIN hợp lệ bị loại do matcher tìm chuỗi `cat` bên trong `Dedication`/`Dedicatoria`.
2. **Xray:** cột `Ratings` chứa điểm đánh giá nhưng mapper gán nhầm sang `ratingCount`; `ratingValue` trở thành `null` cho cả 19 dòng.
3. **Xray:** `Sponsored` chứa `Sponsored` hoặc `Sponsored Brand Video`, nhưng boolean parser chỉ hiểu yes/no nên 5 tín hiệu quảng cáo không được biểu diễn đúng.
4. **Xray:** các trường nguồn như original URL, Recent Purchases, Images, Size Tier, Dimensions và Weight không có trong normalized projection.
5. **Cerebro:** sheet có 40 cột, nhưng cột B chứa bản dịch tiếng Việt không có header. Reader hiện bỏ toàn bộ 1.099 giá trị này.
6. **Cerebro:** pipeline hiện chỉ chuẩn hóa 6 metric chính và bỏ khỏi projection phần lớn metric còn lại, gồm Keyword Sales, Search Volume Trend, bid range, sponsored/recommended signals, rank diagnostics và 9 cột ASIN động.
7. **Cerebro:** 1.099 keyword nguồn bị cắt thành 100 keyword trong `topKeywordsDetailed`. Raw JSON còn tồn tại nhưng downstream analysis/UI không được dùng toàn corpus.
8. **Etsy:** parser chuyên dụng nhận 66/66 dòng nhưng chỉ giữ title, price, country và URL. Lowercase `shop`, `views_24h`, `sold_24h`, `he_favorites`, `age_days` và các metric còn lại không khớp alias nên bị mất khỏi normalized result.
9. **Etsy:** nếu ba CSV đi qua universal research upload, detector chọn `keyword_context` làm keyword. Vì cả file chỉ có `para mi hija`, 66 dòng có thể co thành một keyword thay vì được nhận dạng là listing observations.
10. **Etsy multi-file:** ba snapshot có 195 observations nhưng chỉ 176 listing ID duy nhất. Nếu dedupe sớm theo `listing_id`, hệ thống làm mất 19 observation và mất biến động rank giữa các snapshot.

Do đó, các file này được chấp nhận làm **canonical real-input certification fixtures**, nhưng current importer chưa được chứng nhận.

---

## 1. Evidence inventory

Các file được audit từ bản nằm trong `Inputdata08092026/`. Hash phải được kiểm lại tại thời điểm test để phát hiện file bị thay thế.

| Artifact | Kích thước | SHA-256 | Cấu trúc |
| --- | ---: | --- | --- |
| `para_mi_hija_search_20260908_222208.csv` | 46,879 bytes | `f3ffae62c0fbd10921637ceeb051630dcfc156b25bb1a39519f862edcb66405f` | UTF-8 BOM, comma CSV, 36 cột, 66 dòng |
| `para_mi_hija_search_20260908_222205.csv` | 47,265 bytes | `72c065ff5783a0507e3b0697e2e6abd847df53268e802001fb9e250d4fbde2c5` | UTF-8 BOM, comma CSV, 36 cột, 66 dòng |
| `para_mi_hija_search_20260908_222159.csv` | 45,775 bytes | `70a7c212ec94cba7a880d42e71d0f984bd7cabe944b04c3c28d8068878fcd023` | UTF-8 BOM, comma CSV, 36 cột, 63 dòng |
| `Xray_Hija.xlsx` | 15,279 bytes | `171e8935249ae00e775207efd8c08645321212048ff02abac6fbff4a8d043bfe` | 1 sheet, 32 cột, 19 dòng, không formula |
| `Cerebro_Hija.xlsx` | 260,477 bytes | `c77428d8e080c70545d14409a9d64d98e076e8df72b45d0f3257877cc75615d6` | 1 sheet, 40 cột, 1.099 dòng, không formula |

### Quy tắc evidence

- SHA-256 của **bytes gốc** là identity của artifact.
- Không dùng hash của manifest thay cho hash file.
- Mỗi file là một immutable artifact riêng, kể cả khi staff upload nhiều file cùng lúc.
- Một analysis bundle có thể tham chiếu nhiều artifact ID; không nối các dòng trước khi gắn `artifact_id`, `source_file_hash`, `sheet_name` và `source_row_number`.
- Research artifacts không tự trở thành Product Truth.

---

## 2. Định nghĩa “process toàn bộ dữ liệu”

`Processed` không có nghĩa là mọi cột đều phải tác động vào score. Nó có nghĩa là mỗi cell nguồn phải rơi vào đúng một trạng thái giải trình được:

```text
SOURCE CELL
  ├─ NORMALIZED_AND_USED
  ├─ NORMALIZED_DIAGNOSTIC_ONLY
  ├─ PRESERVED_RAW_NOT_USED
  ├─ NULL_SOURCE
  ├─ SOURCE_SENTINEL
  ├─ INVALID_WITH_REASON
  └─ UNSUPPORTED_COLUMN_WITH_REASON
```

Không được có trạng thái ngầm `DROPPED`.

Mỗi lần import phải trả về:

```json
{
  "artifactId": 123,
  "sourceHash": "sha256...",
  "reportType": "ETSY_SEARCH_RESULTS | AMAZON_XRAY | AMAZON_CEREBRO",
  "schemaVersion": "...",
  "sourceRows": 1099,
  "storedRows": 1099,
  "normalizedRows": 1099,
  "analysisEligibleRows": 1000,
  "sourceColumns": 40,
  "mappedColumns": 40,
  "preservedOnlyColumns": 0,
  "unsupportedColumns": [],
  "warnings": [],
  "errors": []
}
```

`analysisEligibleRows` có thể nhỏ hơn `storedRows`, nhưng từng dòng không đủ điều kiện phải có reason code. UI pagination không được cắt corpus của engine.

---

## 3. Canonical ingestion envelope

### 3.1 Artifact envelope

```json
{
  "artifactId": 123,
  "projectId": 45,
  "marketplace": "ETSY",
  "reportType": "ETSY_SEARCH_RESULTS",
  "provider": "SOURCE_REPORTED_OR_STAFF_SELECTED",
  "originalFileName": "para_mi_hija_search_20260908_222208.csv",
  "sourceSha256": "...",
  "fileSizeBytes": 46879,
  "importedAt": "ISO-8601",
  "importedBy": 7,
  "capturedAt": null,
  "capturedAtCandidate": "2026-09-08T22:22:08",
  "captureTimeState": "FILENAME_DERIVED_UNCONFIRMED",
  "locale": null,
  "currency": null,
  "schemaFingerprint": "sha256(normalized header registry)",
  "parserVersion": "..."
}
```

Thời gian trong filename chỉ là candidate. Staff hoặc metadata nguồn phải xác nhận trước khi dùng để chuyển `3 hours ago` thành timestamp tuyệt đối.

### 3.2 Row envelope

```json
{
  "rowUid": "sha256(fileHash|sheet|rowNumber)",
  "artifactId": 123,
  "sheetName": "Cerebro 21.8.26",
  "sourceRowNumber": 2,
  "rawCells": [],
  "normalized": {},
  "fieldStates": {},
  "diagnostics": []
}
```

### 3.3 Header registry

Reader phải giữ cả ordinal và raw header:

```json
{
  "ordinal": 2,
  "rawHeader": null,
  "stableKey": "__unnamed_column_2",
  "inferredRole": "keyword_translation_vi",
  "inferenceState": "SCHEMA_PROFILE_MATCH",
  "usedByAnalysis": false
}
```

Không được dùng `headers.filter(Boolean)` hoặc bỏ cell vì header trống. Header trùng cũng phải được suffix theo ordinal, không overwrite object key.

---

## 4. Etsy search CSV profile

### 4.1 Dạng vật lý

- Encoding: UTF-8 with BOM.
- Delimiter: comma.
- Quote character: double quote.
- Mỗi dòng đều có đúng 36 field; không có row-width corruption.
- Số observations: `66 + 66 + 63 = 195`.
- Listing IDs duy nhất khi gộp: `176`.
- Duplicate observations giữa snapshot: `19`.
- Có `6` listing xuất hiện trong cả ba file.
- Có ít nhất `13` listing trùng có khác biệt tại title/price/24h metrics/update text/rank.

### 4.2 Không được dedupe mất snapshot

`listing_id` là entity key, không phải observation key.

```text
ETSY LISTING ENTITY (listing_id)
  ├─ observation from 22:21:59, rank 1
  ├─ observation from 22:22:05, rank 61
  └─ observation from 22:22:08, rank 61
```

Rank chỉ có nghĩa trong snapshot/result surface của chính nó. Không lấy `MIN(rank)` giữa nhiều file rồi gọi đó là rank thật.

### 4.3 Ba nhóm cột

#### Identity và display

| Source header | Canonical field | Type | Policy |
| --- | --- | --- | --- |
| `listing_id` | `listingId` | string | Bắt buộc; không parse thành number |
| `title` | `title` | string | Market observation; claim scan trước khi dùng làm pattern |
| `shop` | `shopName` | string/null | Alias lowercase bắt buộc |
| `url` | `listingUrl` | URL/string | Preserve exact + normalized URL riêng |
| `country` | `shopCountryRaw` | string/null | Không suy ra nơi sản xuất |
| `rank_position` | `rankPosition` | integer | Scope theo artifact/result surface |

#### Giá và performance

| Source header | Canonical field | Parsing rule |
| --- | --- | --- |
| `price` | `displayPriceRaw` | Giữ nguyên text |
| `price_num` | `priceMinorOrLocaleNumberRaw` | Giữ raw numeric; không gọi USD |
| `price_was` | `displayPriceWasRaw` | Blank là missing, không phải zero |
| `he_discount_pct` | `discountPct` | 0–100 hoặc null |
| `sold_24h` | `sold24h` | Integer/null; alias snake_case |
| `views_24h` | `views24h` | Integer/null; alias snake_case |
| `he_sold` | `lifetimeSoldObserved` | Integer/null |
| `he_views_avg` | `viewsAverageObserved` | Number/null; grain phải ghi trong metadata |
| `he_views` | `viewsObserved` | Integer/null |
| `he_fav_pct` | `favoriteRatePct` | Number/null |
| `he_favorites` | `favorites` | Integer/null |
| `shop_daily_sold` | `shopDailySoldObserved` | Number/null; không gán cho listing sales |
| `he_revenue_usd` | `revenueUsdObserved` | Unit-aware: `29.9K → 29900`; giữ raw và parsed |
| `conversion_pct` | `conversionPctObserved` | Number/null; không đổi 6 thành 0.06 trong raw |

`price_num` nằm trong khoảng 18,038–3,690,083 nhưng file không có currency code. Vì vậy:

- không được mặc định USD;
- không được so sánh price hoặc tính margin cho đến khi currency được xác nhận;
- import vẫn thành công với warning `PRICE_CURRENCY_REQUIRED_FOR_ANALYSIS`;
- staff có thể chọn currency một lần cho artifact; lựa chọn được audit.

#### Listing metadata và source-derived hints

| Source header | Canonical field | Policy |
| --- | --- | --- |
| `star_seller` | `starSellerObserved` | Strict `0/1`; market observation only |
| `ad` | `isAdObserved` | Strict `0/1` |
| `bestseller` | `bestSellerBadgeObserved` | Strict `0/1` |
| `free_shipping` | `freeShippingObserved` | Strict `0/1`; không dùng làm promise cho sản phẩm của mình |
| `he_created` | `createdDateObserved` | Parse strict `dd/MM/yyyy`, giữ raw |
| `age_days` | `ageDaysObserved` | Integer/null |
| `he_updated` | `updatedRelativeRaw` | Không chuyển absolute time nếu capture time chưa xác nhận |
| `he_tags` | `tagsBlobRaw` | Không giả vờ đã tách được 13 tags |
| `he_categories` | `categoriesRaw` | Cả 195 observations đang blank |
| `keyword_context` | `queryContext` | `para mi hija` cho toàn bộ file |
| `keyword_match_type` | `sourceMatchTypeHint` | Hint của producer; engine phải recompute |
| `keyword_match_confidence` | `sourceMatchConfidenceHint` | Preserve + recompute |
| `proof_scope_hint` | `sourceProofScopeHint` | Không phải authority quyết định |
| `evidence_route_hint` | `sourceRouteHint` | Validate allowlist |
| `data_use_hint` | `sourceUseHint` | Preserve; không tự thực thi |

### 4.4 Các anomaly phải hiển thị

1. `he_categories` trống ở 195/195 observations.
2. Mỗi file có 6 dòng thiếu nhóm HeyEtsy metrics. Missing phải là `null`, không zero.
3. `he_tags` phần lớn là chuỗi UI kiểu `?13 Check Sugg (13) Copy Suggestions...` với các tag nối liền, không có delimiter đáng tin cậy.
4. `reviews` có giá trị `13` ở 148 observations và một vài giá trị 3–12. Phân phối này giống số lượng tag hơn review count; cột phải mang state `SEMANTIC_SUSPECT` cho đến khi source exporter được xác minh.
5. `he_revenue_usd` có blank, plain number và hậu tố `K`; parser số thông thường sẽ cho kết quả sai.
6. Ba file cách nhau vài giây nhưng rank và `he_updated` có thể khác. Đây là observations riêng, không phải duplicate rác.

### 4.5 Match distribution

| File | Exact | High | Medium | Low | Rows có HeyEtsy metrics | Ads |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `222208` | 4 | 5 | 1 | 56 | 60 | 12 |
| `222205` | 4 | 5 | 1 | 56 | 60 | 12 |
| `222159` | 4 | 3 | 2 | 54 | 57 | 2 |

Low-overlap rows không được dùng làm exact-query proof. Chúng vẫn có thể dùng cho category discovery, product-family discovery hoặc negative relevance review nếu engine ghi đúng scope.

### 4.6 Tag policy

- Luôn giữ `tagsBlobRaw`.
- `No tags found` trở thành sentinel `NO_TAGS_FOUND`, không phải một tag.
- Chỉ tạo `parsedTags[]` nếu có delimiter hoặc structured payload chứng minh được boundary.
- Parser heuristic phải trả `parseConfidence` và `unconsumedText`.
- Nếu không tái tạo được ranh giới, dùng title-derived phrase mining; không đưa blob nối liền vào listing.

---

## 5. Amazon Xray profile

### 5.1 Dạng vật lý

- Sheet: `X-Ray 21.8.26`.
- Header tại row 1, freeze `A2`, autofilter `A1:AF1000`.
- 32 cột, 19 data rows, 19 ASIN duy nhất.
- Không formula, không merged cells.

### 5.2 Full column mapping

| Source | Canonical role |
| --- | --- |
| Product Details | competitor title |
| ASIN | entity identifier |
| URL | exact source URL |
| Image URL | exact image reference URL |
| Brand | observed competitor brand; IP input |
| Price $ | observed USD price |
| Parent Level Sales | parent-scope sales |
| ASIN Sales | ASIN-scope sales |
| Recent Purchases | observed recent-purchase value/sentinel |
| Parent Level Revenue | parent-scope revenue |
| ASIN Revenue | ASIN-scope revenue |
| Title Char. Count | source-reported title length |
| BSR | source-reported rank |
| Seller Country/Region | seller region, not manufacture origin |
| Fees $ | observed fee or `N/A` |
| Active Sellers | count |
| Ratings | rating value in this file; semantic profile must verify |
| Review Count | rating/review count |
| Images | image count |
| Review velocity | numeric or `N/A` |
| Buy Box | observed buy-box seller |
| Category | observed category |
| Size Tier | logistics tier |
| Fulfillment | FBA/MFN |
| Dimensions | raw dimensions + optional parsed values/unit |
| Weight | raw value + unit from report profile |
| ABA Most Clicked | source sentinel/value |
| Creation Date | typed workbook date |
| Sponsored | enum: NONE / SPONSORED / SPONSORED_BRAND_VIDEO / UNKNOWN |
| Best Seller | strict observed boolean |
| Seller Age (mo) | integer months |
| Seller | seller identity |

### 5.3 Current-parser defects reproduced

Current call on the real file returned:

```text
source rows       19
normalized rows   16
rejected rows      3
ratingValue        0/16 populated
isSponsored        0/16 populated
```

Ba ASIN bị loại sai:

| ASIN | Title fragment | Wrong reason |
| --- | --- | --- |
| `B0D2T5T9CN` | `Dedicatoria...` | substring `cat` matched inside word |
| `B0CTKMT7M5` | `...Meaningful Message...` | substring `cat` appears across ordinary text tokenization path |
| `B0D5XFLKDT` | `'Dedication' in Spanish...` | substring `cat` matched inside word |

Importer phải lưu 19/19 trước. Relevance filter dùng token/word boundary và chỉ tạo decision view; không xóa normalized observation.

### 5.4 Xray decision model

```text
19 SOURCE OBSERVATIONS
       ↓ lossless normalization
19 CANONICAL OBSERVATIONS
       ↓ validation/relevance/IP/price analysis
ANALYSIS VIEW WITH INCLUDED + EXCLUDED + REASONS
       ↓ staff review
ASIN BATCHES OF ≤10
```

Hardcoded price floor `$9.99–$99.99` không được nằm trong parser. Đây là project/category decision rule, có version, staff nhìn thấy và có thể thay đổi. Parser chỉ xác nhận type/unit/state.

---

## 6. Amazon Cerebro profile

### 6.1 Dạng vật lý

- Sheet: `Cerebro 21.8.26`.
- 1.099 unique keyword rows.
- 40 source columns.
- Column B header trống nhưng 1.099/1.099 cell có bản dịch tiếng Việt.
- Columns 32–40 là 9 ASIN động; không được hardcode theo tên ASIN hiện tại.

### 6.2 Column groups

| Group | Columns | Use |
| --- | --- | --- |
| Keyword identity | Keyword Phrase, unnamed translation column | corpus + staff comprehension |
| Demand | Keyword Sales, Search Volume, Search Volume Trend | scoring/diagnostics with missing-state semantics |
| Opportunity | Cerebro IQ Score, Competing Products, CPR, Title Density | scoring + launch difficulty |
| PPC | suggested/min/max bid, Sponsored ASINs | PPC planning |
| SERP features | Organic, Sponsored Product, Amazon Recommended, Amazon Choice, Highly Rated, Sponsored Brand Header/Video, Top Rated From Our Brand, Trending Now | diagnostic signals |
| Rank summary | sponsored/recommended/position/relative/competitor rank and counts | ranking diagnostics |
| Competitor performance | Competitor Performance Score | source-reported diagnostic |
| Dynamic competitor matrix | one column per ASIN | normalized child table/list `{asin, rankRaw, rankState}` |

### 6.3 Sentinel semantics observed

| Field | Observed missing/sentinel behavior |
| --- | --- |
| Keyword Sales | `-` in 1.010/1.099 rows |
| Cerebro IQ Score | `-` in 99 rows |
| Search Volume | numeric `0` in 99 rows |
| Search Volume Trend | `-` in 123 rows |
| PPC suggested/min/max bid | actual blank in 617 rows |
| Position Rank | `0` in 672 rows |
| Dynamic ASIN rank | `-` means not observed/not ranking |

Engine phải giữ ba khái niệm riêng:

```text
BLANK_CELL ≠ DASH_SENTINEL ≠ OBSERVED_ZERO
```

Với rank, source `0` cần semantic state `NOT_RANKED_OR_SOURCE_ZERO` theo schema profile; không được xếp position zero là tốt hơn rank 1.

### 6.4 Dynamic ASIN matrix

Chín ASIN columns trong fixture:

```text
B09RDC53Q9 B08PQ14WC8 B0F2788CZN
B0DJLXWN42 B0GHMX7S7T B0G5YQ9WRC
B0D5W7RXC2 B0G5PP3BFG B0D6K8NXC7
```

Canonical shape:

```json
{
  "keyword": "cadena de plata 925 para mujer",
  "competitorRanks": [
    {"asin": "B09RDC53Q9", "raw": "-", "value": null, "state": "NOT_OBSERVED"},
    {"asin": "B0F2788CZN", "raw": 295, "value": 295, "state": "SOURCE_REPORTED"}
  ]
}
```

Nếu một export khác có 3, 10 hoặc 20 ASIN columns, parser vẫn phải hoạt động.

### 6.5 Corpus policy

- Lưu và normalize 1.099/1.099 keyword.
- Scoring chạy trên toàn bộ eligible corpus.
- UI có thể hiển thị page 1 gồm 100 dòng, nhưng API phải trả `totalNormalizedRows=1099` và cho paginate/query toàn corpus.
- Listing allocation nhận toàn corpus cùng eligibility/reason, không chỉ top 100.
- Không loại IP/claim keyword khỏi ledger. Chuyển sang `BLOCKED_VISIBLE_COPY`, `PPC_REVIEW`, `IRRELEVANT`, hoặc reason phù hợp.
- Bản dịch tiếng Việt là helper text, không dùng thay keyword gốc và không được đưa vào listing EN/ES.

---

## 7. Report detection contract

Detection phải dùng signature có điểm và reject ambiguity:

### Etsy search results

Required signature:

```text
listing_id + title + url + rank_position + keyword_context
```

### Amazon Xray

Required signature:

```text
ASIN + Product Details + (BSR OR ASIN Sales OR Parent Level Sales)
```

### Amazon Cerebro

Required signature:

```text
Keyword Phrase + Search Volume + (Cerebro IQ Score OR CPR OR Title Density)
```

Không dùng regex “header đầu tiên có chữ keyword” để route Etsy CSV sang keyword report. Report type được xác định trước khi tìm canonical keyword field.

Nếu nhiều sheet cùng match, API trả `AMBIGUOUS_SHEET` với preview và yêu cầu staff chọn sheet; không chọn sheet đầu tiên.

---

## 8. Normalization architecture

```text
UPLOAD
  ↓ extension/MIME/size/malware checks
RAW ARTIFACT BYTES + SHA-256
  ↓ workbook/CSV structural scan
SCHEMA PROFILE + HEADER REGISTRY
  ↓ report-specific adapter
LOSSLESS ROW ENVELOPES
  ↓ type/sentinel/locale normalization
CANONICAL PROJECTION
  ↓ quality + relevance + IP + claim analysis
DECISION VIEWS
  ↓ allocation/composition
LISTING AND CREATIVE WORKSPACE
```

### Adapter boundary

```text
etsySearchCsvAdapterV1
amazonXrayAdapterV1
amazonCerebroAdapterV1
```

Mỗi adapter trả cùng interface:

```text
detect(headers, sampleRows)
normalize(rawMatrix, artifactEnvelope)
validate(normalizedRows)
account(rawMatrix, normalizedRows, diagnostics)
```

Scoring, IP guard, Claim Validator, keyword allocation và listing composer không nằm trong adapter.

---

## 9. Merge and dedup rules

### 9.1 Raw level

Không dedupe. Mọi artifact và observation được giữ.

### 9.2 Entity level

- Etsy entity key: marketplace + listing ID.
- Xray entity key: marketplace + ASIN.
- Cerebro keyword key: locale-aware normalized phrase, nhưng giữ raw phrase.
- Cerebro rank key: artifact + keyword + competitor ASIN.

### 9.3 Analysis level

- Không merge rank giữa hai snapshot bằng max/min.
- Không merge relative-time field nếu capture time chưa verified.
- Không lấy max của mọi metric rồi tạo một “siêu dòng” chưa từng tồn tại.
- Khi nhiều Cerebro batch có cùng keyword, giữ observations; aggregate view phải ghi policy theo từng metric.
- Conflicting non-null values tạo `CONFLICT_REVIEW`, không silent overwrite.

---

## 10. Data-quality gates

Import thành công không đồng nghĩa evidence tốt. UI phải tách:

| Gate | Ví dụ |
| --- | --- |
| Structural | đủ row width, sheet/header nhận dạng được |
| Type | số/date/boolean/sentinel parse được |
| Semantic | currency, unit, metric grain có rõ không |
| Relevance | row có liên quan seed/product family không |
| IP/claim | phrase có TM hoặc claim chưa xác nhận không |
| Freshness | capture timestamp và age có đủ không |
| Decision eligibility | metric có được dùng cho score/copy/PPC không |

Một row fail relevance vẫn là imported observation. Một keyword bị chặn visible copy vẫn nằm trong accounting và có thể vào PPC review nếu policy cho phép.

---

## 11. Required API behavior

### Preview

```text
POST /api/projects/:projectId/research-imports/preview
```

Trả:

- detected report type và confidence;
- sheet/header registry;
- sample typed rows;
- currency/locale/capture-time questions;
- complete column accounting;
- warnings và blockers;
- không DB mutation ngoài temporary upload.

### Confirm

```text
POST /api/projects/:projectId/research-imports/confirm
```

Yêu cầu preview token/hash match. Tạo immutable `research_artifacts` row và projection version.

### Read corpus

```text
GET /api/projects/:projectId/research-artifacts/:artifactId/rows
```

Hỗ trợ pagination/filter/sort nhưng `totalRows` luôn phản ánh toàn corpus.

### Build analysis bundle

```text
POST /api/projects/:projectId/research-bundles
```

Input là artifact IDs; output không rewrite raw artifacts.

---

## 12. Certification tests using these files

### E1 — Etsy structural fidelity

```text
PASS only if:
3 artifacts created
195 source observations stored
176 unique listing entities derived
19 repeated observations retained
36/36 source columns accounted per file
0 row silently discarded
```

### E2 — Etsy alias coverage

Trên file `222208`:

```text
shopName populated:       66/66
views24h populated:       60/66
sold24h populated:        60/66
favorites populated:     60/66
country populated:       60/66
rankPosition populated:  66/66
```

Blank phải giữ null. Test current parser đang cho `shopName=0/66`, `views24h=0/66`, `sold24h=0/66`, `favorites=0/66` và phải fail.

### E3 — Etsy routing

CSV phải được detect là `ETSY_SEARCH_RESULTS`, không phải generic keyword report. `keyword_context=para mi hija` không được làm 66 listing rows co thành một keyword.

### E4 — Snapshot fidelity

Listing `4522488949` phải giữ ít nhất hai observations với rank 1 và 13. Listing `4533292901` phải giữ observations có rank 61, 61 và 1.

### A1 — Xray row fidelity

```text
source rows stored:      19
canonical rows:          19
valid ASIN identifiers:  19
wrong substring reject:   0
```

### A2 — Xray field fidelity

- `Ratings` map đúng rating value.
- `Review Count` map đúng review count.
- Sponsored enum giữ `Sponsored` và `Sponsored Brand Video`.
- Original URL, Recent Purchases, Images, Size Tier, Dimensions và Weight tồn tại trong projection.
- `N/A`, blank và observed zero không bị trộn.

### A3 — Xray analysis separation

Thay price rule không thay raw/canonical row count. Excluded analysis rows vẫn query được với reason.

### A4 — Cerebro structural fidelity

```text
source rows:                  1,099
canonical keyword rows:      1,099
source data columns:             40
translation values retained: 1,099
dynamic competitor ASINs:         9
```

### A5 — Cerebro sentinel fidelity

- 1.010 `Keyword Sales` dash sentinels không thành zero.
- 99 IQ dash sentinels không thành zero.
- 617 blank bid values không thành zero.
- Dynamic ASIN `-` không thành rank 0.
- Position rank source 0 không được sort trước rank 1.

### A6 — Full-corpus availability

- API/UI pagination có thể lấy row 1, 100, 101 và 1.099.
- Composer/allocation accounting bao phủ 1.099 rows hoặc có disposition reason cho từng row.
- `top 100` là view, không phải stored/analysis corpus.

### C1 — Round-trip/reopen

Sau restart:

- artifact hashes không đổi;
- row/header accounting không đổi;
- normalized rows và source states không đổi;
- không cần browser localStorage;
- project/tenant/workspace scope đúng.

### C2 — Adversarial schema

Test thêm:

- reordered columns;
- unknown added column;
- duplicate header;
- blank header có data;
- multi-sheet ambiguous workbook;
- CSV with quoted comma/newline;
- formula cell and cached value;
- very large workbook/pagination;
- invalid MIME/extension mismatch;
- multi-file upload có duplicate entities và conflicts.

---

## 13. Required implementation sequence

### Commit I1 — Lossless reader

- raw matrix representation;
- stable fallback keys cho blank/duplicate headers;
- source row/cell provenance;
- byte hash và structural diagnostics.

**Exit:** Cerebro translation column retained 1.099/1.099.

### Commit I2 — Report detector and adapters

- Etsy/Xray/Cerebro signatures;
- typed aliases;
- sentinel registry;
- dynamic ASIN detection.

**Exit:** 36/36, 32/32 và 40/40 column accounting.

### Commit I3 — Preserve-first persistence

- mỗi file thành immutable `research_artifacts` row;
- preview → confirm;
- complete row accounting;
- project/workspace/tenant binding.

**Exit:** reopen/restart parity.

### Commit I4 — Analysis views

- entity/snapshot model;
- relevance and filter reasons;
- full corpus pagination;
- scoring metrics provenance.

**Exit:** 195 Etsy observations, 19 Xray rows và 1.099 Cerebro keywords available downstream.

### Commit I5 — UI staff review

- source vs normalized preview;
- missing/sentinel/conflict badges;
- currency/capture-time prompts;
- excluded rows and reasons;
- full keyword disposition accounting.

**Exit:** Seller có thể giải thích vì sao mỗi row/keyword được dùng hoặc không dùng.

---

## 14. Stop conditions

Không nối importer vào listing composer nếu bất kỳ điều nào sau đây còn đúng:

- Xray normalized count vẫn là 16 thay vì 19.
- Etsy CSV vẫn route theo `keyword_context` như generic keyword report.
- Etsy shop/24h metrics vẫn bị mất vì alias.
- Cerebro cột B vẫn bị bỏ.
- Cerebro engine chỉ nhìn top 100.
- Multi-file import không có per-file/per-row provenance.
- Currency không rõ nhưng UI vẫn trình bày price recommendation như USD.
- Tag blob nối liền được coi là 13 tags hợp lệ.

---

## 15. Source-code evidence for reproduced gaps

| Finding | Current source evidence |
| --- | --- |
| Blank-header column dropped | `server/services/spreadsheetReader.js:84,93–105` creates an empty header, skips its cells, then filters the header list |
| Etsy aliases missing | `server/competitorBatchLearner.js:146–148` recognizes title-case aliases but not `shop`, `views_24h` or `sold_24h` |
| Etsy routed by generic keyword matcher | `server/server.js:3307` selects the first header containing keyword/query; in this fixture that is `keyword_context` |
| Multi-file keyword observations collapsed | `server/server.js:3325,3358–3385` dedupes by normalized keyword and only merges selected metrics |
| Cerebro downstream corpus cut | `server/server.js:3401` uses `rankedKeywords.slice(0, 100)` |
| Xray substring false rejection | `server/asinBatcher.js:201` uses `titleLower.includes(bad)` without word boundaries |
| Xray rating semantic mismatch | `server/asinBatcher.js:164–165` expects `Rating` as value and treats `Ratings` as count, opposite to this fixture’s layout |
| Xray sponsored enum lost | `server/asinBatcher.js:179` sends the field through a boolean parser that does not represent sponsored placement types |

Các dòng source trên là bằng chứng tại working tree được audit ngày 2026-09-08. Reviewer phải kiểm lại line/hash nếu code thay đổi.

---

## 16. Final import ruling

```text
APPROVE THESE FIVE FILES AS REAL CERTIFICATION FIXTURES
DO NOT CERTIFY THE CURRENT IMPORTER
IMPLEMENT I1 → I5 BEFORE CALLING THE WORKFLOW LOSSLESS
```

Thiết kế đúng không ép mọi metric vào một score. Thiết kế đúng giữ toàn bộ evidence, chuẩn hóa đúng ý nghĩa, tách parser khỏi business filters, và cho mọi quyết định downstream một đường truy ngược đến file, sheet, row và cell nguồn.
