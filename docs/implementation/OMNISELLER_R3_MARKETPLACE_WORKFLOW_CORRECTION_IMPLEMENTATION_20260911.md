# OmniSeller R3 — Marketplace Research Workflow Correction

**Ngày:** 2026-09-11 (Asia/Bangkok)

**Branch:** `codex/omniseller-r3-marketplace-research-workflows`

**Baseline:** `origin/main` tại `a02db42f6`

**Trạng thái:** implemented + real-input UAT passed; chưa merge/deploy

**Phạm vi:** Amazon US và Etsy US; listing EN/ES theo seed/keyword đầu vào; dừng ở `NEEDS_QA`/submission thủ công.

## 1. Phán quyết cuối

Workflow tổng quát cũ `Product Truth → Generate Listing` là sai với nghiệp vụ thực tế. Product Truth không thay thế market research, Xray, Cerebro, winner selection hoặc keyword allocation. Nó chỉ xác định những claim nào được phép xuất hiện trong copy và prompt ảnh.

Hai workflow canonical được triển khai là:

```text
AMAZON
Seed
  → Xray import
  → staff chọn 1–3 ASIN batches, tối đa 10 ASIN/batch
  → chạy từng batch trên Helium 10
  → Cerebro import + binding chặt với batch
  → Research Snapshot
  → Amazon Master Keyword Snapshot
  → Product Truth revision
  → Intelligence/claim allocation
  → Listing + A+ points + PPC + full image-prompt suite
  → NEEDS_QA

ETSY
Seed
  → một hoặc nhiều Search Evidence CSV
  → hợp nhất listing entity
  → engine đề xuất + staff chọn 5–10 Winners
  → Pattern Snapshot
  → Etsy Master Keyword Snapshot
  → Product Truth revision
  → Intelligence/claim allocation
  → Title + Description + 13 explained tags + image-prompt suite
  → NEEDS_QA
```

Không workflow nào tự publish. Seller lưu draft; Manager/Owner kiểm exact package và thực hiện submission bên ngoài ở phase hiện tại.

## 2. Mô hình authority: ba lane gặp nhau đúng một chỗ

```text
MARKET RESEARCH                      PRODUCT TRUTH
Xray/Cerebro hoặc Etsy evidence      supplier / listing cùng nguồn / staff nhập
        │                                      │
        ▼                                      ▼
immutable Master KW                 immutable Product Truth revision
        │                                      │
        └──────────────┬───────────────────────┘
                       ▼
             COMMERCE INTELLIGENCE
        relevance + semantic + IP + claim guard
                       │
          ┌────────────┼────────────┐
          ▼            ▼            ▼
   visible copy   backend/tags      PPC
   claim = phải   claim = loại      targeting được giữ
   có truth       nếu chưa rõ       kèm cờ review
```

- Research Evidence trả lời: thị trường đang tìm gì, listing nào thắng, chỉ số nào quan sát được.
- Product Truth trả lời: sản phẩm của công ty thực sự là gì và claim nào đã được supplier/staff xác minh.
- Master KW không nâng research thành Product Truth.
- Copy hiển thị không được dùng claim chưa xác minh. PPC có thể nhắm traffic nhưng không biến keyword thành tuyên bố sản phẩm.

## 3. Cấu trúc workspace và dữ liệu

Mỗi request dùng session đăng nhập hiện tại; `tenant_id`, `workspace_id`, `marketplace`, `project_id` và actor đều do server xác định. Amazon và Etsy dùng chung tài khoản nhưng khác workspace; mọi artifact bị scope theo project và marketplace.

### Canonical persistence

Migration `016_marketplace_research_workflow_artifacts` thêm bảng append-only:

```text
commerce_workflow_artifacts
├── scope: tenant/workspace/marketplace/project
├── kind + revision_number + parent_revision_id
├── dependency_manifest_json + SHA-256
├── payload_json + SHA-256
├── accounting_json + SHA-256
├── engine_binding_hash + artifact_hash
├── change_reason + idempotency_key + actor
└── immutable UPDATE/DELETE triggers
```

Artifact kinds:

| Marketplace | Artifact |
|---|---|
| Amazon | `AMAZON_ASIN_BATCH_PLAN` |
| Amazon | `AMAZON_CEREBRO_BINDING` |
| Amazon | `AMAZON_MASTER_KEYWORDS` |
| Etsy | `ETSY_WINNER_SET` |
| Etsy | `ETSY_PATTERN_SNAPSHOT` |
| Etsy | `ETSY_MASTER_KEYWORDS` |

Không tạo bảng listing song song. Draft cuối vẫn đi vào canonical `listings`/`listing_revisions`; research import/snapshot tiếp tục dùng `research_imports`/`research_snapshots`.

## 4. Amazon: hành vi đã triển khai

### Xray và ASIN batches

- Xray bắt buộc trước Cerebro trong UI.
- Toàn bộ candidate pool từ Xray được hiển thị để staff chọn.
- Staff chọn 1–3 batch; mỗi batch tối đa 10 ASIN.
- ASIN chọn tay phải tồn tại trong Xray; ASIN sai/ngoài Xray bị chặn.
- Chọn vượt capacity bị chặn, không cắt ngầm.
- Engine recommendation chỉ là default; staff có quyền sửa lựa chọn trước khi khóa.

### Cerebro binding

- Mỗi batch đã khóa phải có một Cerebro binding.
- Header ASIN trong Cerebro phải giao với đúng batch.
- Nếu Cerebro chứa ASIN ngoài batch, request bị chặn.
- Không thể khóa Amazon Master KW nếu còn batch chưa có Cerebro.
- Xray import và mọi Cerebro import của binding phải thực sự nằm trong Research Snapshot được dùng để tạo Master KW.

### Master KW và output

- Master KW giữ toàn bộ keyword đã parse cùng Search Volume, Keyword Sales, IQ, Trend, CPR, Rank, Bid và provenance có sẵn.
- Intelligence bắt buộc nhận đúng `AMAZON_MASTER_KEYWORDS` artifact và đúng Research Snapshot.
- Output gồm Title, 5 bullets, description, search terms tổng `≤249` UTF-8 bytes, A+ copy points, PPC candidates và image prompts.
- Keyword không biến mất: mỗi item được allocated hoặc giữ disposition/accounting rõ ràng.

## 5. Etsy: hành vi đã triển khai

### Search Evidence và Winners

- Cho phép nhập nhiều CSV cùng seed.
- Mọi observation được giữ; listing trùng được hợp nhất bằng listing ID, không cộng giả thành nhiều seller.
- Engine chấm điểm winner từ metric thực có sẵn; metric thiếu không biến thành `0`.
- Staff xem toàn bộ entity, chọn chính xác 5–10 winners và preview lại trước khi khóa.
- Entity không có trong Search Evidence hoặc selection ngoài 5–10 bị chặn.

### Pattern Miner và Master KW

- Pattern Snapshot chỉ đọc exact Winner Set: title tokens, repeated tags, categories, separator/personalization patterns.
- Etsy Master KW chỉ được tạo khi Research Snapshot, Winner Set và Pattern Snapshot cùng một dependency chain.
- Source-noise bị loại vẫn nằm trong rejected ledger; `droppedKeywordCount = 0`.
- Intelligence bắt buộc dùng exact Etsy Master KW artifact gắn với exact Research Snapshot.

### Output

- Etsy title `≤140` ký tự.
- Chính xác 13 tags, mỗi tag `≤20` ký tự.
- Mỗi tag có `reason` và `sourcePhrase`; tag explanation được giữ đồng bộ nếu guard loại tag.
- Description và full image-prompt suite cùng Product Truth/claim guard.

## 6. Product Truth được đơn giản hóa đúng vai trò

Product Truth không phải bottleneck nghiên cứu. Seller có thể:

1. quét ASIN/Etsy URL khi marketplace cho phép;
2. upload trang HTML đã lưu khi marketplace chặn fetch;
3. tải/nhập Excel;
4. nhập tay các trường chính;
5. lưu revision dù còn trường `UNKNOWN`.

Hai trường tối thiểu cho thao tác thực tế là tên và loại sản phẩm. Các trường còn thiếu làm một số claim/prompt bị chặn hoặc ghi thiếu; chúng không buộc workflow quay lại từ đầu và không cho phép AI bịa.

## 7. API canonical mới

```text
GET  /api/projects/:id/marketplace-workflow

POST /api/projects/:id/amazon/asin-batches/preview
POST /api/projects/:id/amazon/asin-batches
POST /api/projects/:id/amazon/cerebro-bindings
POST /api/projects/:id/amazon/master-keywords

POST /api/projects/:id/etsy/winners/preview
POST /api/projects/:id/etsy/winners
POST /api/projects/:id/etsy/patterns
POST /api/projects/:id/etsy/master-keywords
```

Tất cả route đều có authentication, role gate, project/marketplace scope, exact DTO validation và route-registry coverage.

## 8. Kết quả dữ liệu thật của chủ sở hữu

### Amazon Hija

| Kiểm chứng | Kết quả |
|---|---:|
| Cerebro bytes | 260,477 |
| Cerebro input rows | 1,099 |
| Unique/Master keywords | 1,084 |
| Xray bytes | 15,279 |
| Xray rows | 19 |
| Cerebro ASIN headers được binding | 9 |
| Scored / allocated / unallocated | 1,084 / 1,084 / 0 |
| Draft status | `NEEDS_QA` |

Draft title UAT: `Regalo de Madre para Hija | Collar Personalizado para Mujer`.

### Etsy Hija

| Kiểm chứng | Kết quả |
|---|---:|
| CSV observations | 195 = 63 + 66 + 66 |
| Unique listing entities | 176 |
| Available Master KW | 601 |
| Rejected source-noise ledger | 191 |
| Dropped/unaccounted | 0 |
| Tags | 13/13, đều có explanation |
| Draft status | `NEEDS_QA` |

Draft title UAT: `Collar Personalizado Para Mi Hija`.

## 9. Test gates

| Gate | Kết quả |
|---|---:|
| Marketplace workflow artifact/API | 22/22 PASS |
| Amazon canonical research HTTP | 80/80 PASS |
| Etsy canonical HTTP | 26/26 PASS |
| Canonical commerce UI contract | 20/20 PASS |
| Route registry/security coverage | 92 discovered, 88 protected/classified, PASS |
| Production build | PASS, 2,426 modules |
| Real Amazon + Etsy input UAT | PASS |

Full repository runner trên Windows đạt 85/87. Hai failure còn lại không nằm trong workflow sản phẩm:

1. `test_runner_accounting.cjs`: Windows runner chưa theo dõi/diệt được detached descendant bằng Linux `/proc` token model.
2. `vps_platform_scripts.test.cjs`: drive-letter path truyền vào Git Bash; test đã được sửa dùng stdin và hiện pass độc lập.

CI Linux phải chạy lại để xác nhận canonical total. Không được đổi hai failure hạ tầng thành tuyên bố “workflow fail”.

## 10. Acceptance và giới hạn còn lại

### Đạt

- Không còn cấu trúc “Xray tùy chọn, nhập Cerebro trực tiếp rồi generate”.
- Không còn Etsy “CSV → 13 tags” bỏ qua winner/pattern/master.
- Master KW là dependency bắt buộc và được intelligence tiêu thụ thật.
- Staff có quyền quyết định ASIN batches và Etsy winners trong phạm vi evidence.
- Dữ liệu nguồn, decision, accounting và engine binding đều truy vết được.
- Claim guard áp dụng cả trước và sau composition; prompt ảnh không tự thêm material/process/packaging chưa xác minh.

### Chưa tuyên bố

- Chưa merge hoặc deploy branch này.
- Chưa có marketplace auto-publish; phase hiện tại dừng ở `NEEDS_QA` và submission thủ công.
- Policy contract fixture vẫn `DRAFT_ONLY`, nên Manager approval production còn bị chặn đúng thiết kế. Đây là policy lifecycle riêng, không phải workflow research bị kẹt.
- Etsy MCP live từ `trends.ytuong.ai` chưa nằm trong thay đổi này; CSV import canonical đã dùng được và là fallback bắt buộc.

## 11. Trình tự release không quay lại bước 1

1. Review diff và tài liệu này trên branch hiện tại.
2. Push branch, mở PR; CI Linux phải xanh.
3. UAT trình duyệt trên bản PR bằng project mới cho cả Amazon và Etsy.
4. Merge một lần khi CI + browser UAT + real-input receipt đều pass.
5. Deploy release bất biến lên VPS; chạy migration 016.
6. Smoke test login, workspace switch, project selection và hai full workflows.
7. Giữ rollback release trước; không sửa trực tiếp production database/code.

Mọi thay đổi sau release phải tiếp tục từ artifact head hiện có. Không xóa Research Snapshot, Master KW hoặc Product Truth để “làm lại từ đầu”; chỉ append revision mới với dependency mới.
