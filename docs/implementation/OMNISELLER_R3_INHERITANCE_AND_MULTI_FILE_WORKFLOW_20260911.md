# OmniSeller R3 — kế thừa Omni cũ và workflow nhiều file

Ngày: 2026-09-11
Phạm vi: PR #37 / `codex/omniseller-r3-marketplace-research-workflows`

## Phán quyết ngắn

Không bỏ Omni cũ và không xây một tool thứ hai. R3 giữ lại các engine/khái niệm có giá trị, nhưng gom mọi quyết định dùng để sinh listing vào một chuỗi artifact canonical có project scope, hash, accounting và dependency.

UI cũ vẫn hiện trong **Omni Research & DNA Lab** trong thời gian chuyển đổi. Nó không được tạo một Product Truth hoặc listing authority song song. Một module chỉ được gọi là “đã nối canonical” khi output của nó được lưu/khóa thành research import, workflow artifact hoặc snapshot canonical.

## Cấu trúc thực tế

```text
OMNI RESEARCH & DNA LAB (kế thừa)
  Smart Pull / Benchmark / Trends / Learning Box / Challenger
            │ seed, candidate, market observations
            ▼
CANONICAL MARKETPLACE WORKFLOW (authority duy nhất để sinh draft)
  raw imports → hash/accounting → workflow decisions → Master KW
            │                                      │
            └──────────── Product Truth ───────────┘
                               ▼
                    Intelligence + claim/IP guard
                               ▼
                 Draft + A+ + image prompts → NEEDS_QA
```

Research chỉ mô tả thị trường. Product Truth chỉ mô tả sản phẩm thật. Draft chỉ được sinh sau khi hai lane gặp nhau ở Intelligence.

## Ma trận kế thừa

| Tinh hoa Omni cũ | Trạng thái trong R3 | Authority |
|---|---|---|
| Seed phrase và project/workspace/account | Giữ nguyên, dùng chung | Project canonical |
| Smart Pull / Benchmark / Google Trends | Giữ để khám phá seed/cơ hội | Observation; không phải Product Truth |
| Xray parser, candidate scoring, brand diversity, batch ≤10 ASIN | Đưa vào Xray import + ASIN Batch Plan | Artifact canonical |
| Cerebro parsing, metric provenance, keyword dedupe/accounting | Đưa vào import + binding theo batch + Master KW | Artifact canonical |
| Etsy Challenger/Search Evidence | Nhận CSV và HTML; gộp nhiều nguồn | Research Snapshot |
| Etsy winner/pattern/tag logic | Winner Set → Pattern Snapshot → Master KW → 13 explained tags | Artifact canonical |
| MKL 5-tier UI cũ | Giữ để đối chiếu trong chuyển đổi; không là nguồn sinh draft R3 | Read-only/legacy |
| Draft/listing generator cũ | Không được ghi song song; phần tốt được port vào composer/adapter có guard | Không còn authority độc lập |
| Product Truth, claim guard, Manager QA | Dùng chung account/workspace/project | Canonical revision/approval |

## Amazon — thao tác staff chuẩn

```text
Seed
  → chọn 1 hoặc nhiều file Xray trong một lần
  → preview từng file (zero-write)
  → import từng file với hash/accounting riêng
  → hợp nhất + khử trùng ASIN
  → staff chọn tối đa 10 ASIN/batch và khóa Batch Plan
  → copy từng batch sang Helium 10
  → chọn 1 hoặc nhiều file Cerebro trong một lần
  → preview/import từng file với hash riêng
  → staff chọn CHÍNH XÁC file Cerebro cho từng batch
  → server kiểm ASIN overlap rồi tạo binding
  → chọn toàn bộ Xray/Cerebro đã dùng và khóa Research Snapshot
  → khóa Master KW → Product Truth → Intelligence → Draft/A+/Prompts
```

Xray và Cerebro không nằm chung một ô upload. Có thể bổ sung file ở lần sau; không bắt buộc chọn hết trong một lần. Master KW chỉ được tạo nếu snapshot chứa mọi Xray của Batch Plan và mọi Cerebro đã binding.

## Etsy — thao tác staff chuẩn

```text
Seed
  → chọn đồng thời nhiều CSV và/or HTML Etsy đã lưu
  → preview từng file (zero-write)
  → import từng file với hash/accounting riêng
  → khóa Search Evidence Snapshot
  → chọn 5–10 Winners
  → Pattern Miner
  → Master KW
  → Product Truth
  → Intelligence
  → Title + Description + 13 tags có giải thích + Prompts
```

HTML dùng cho Search Evidence là HTML trang kết quả có JSON-LD `ItemList`. HTML một listing tương tự dùng ở lane Product Truth là một chức năng khác; hai nguồn không được trộn authority.

## Nguyên tắc tối ưu keyword

“Dùng tối đa room” được hiểu là phủ tối đa keyword **liên quan, an toàn và không trùng**, không chèn filler hoặc lặp token chỉ để đủ số ký tự.

- UI hiển thị ký tự Title, từng Bullet, Description, Highlights, A+ và bytes của Backend Search Terms.
- Backend Search Terms có ngân sách tổng 249 UTF-8 bytes và loại token đã xuất hiện ở visible copy.
- Keyword có claim chưa xác minh không vào visible copy/backend; Amazon vẫn giữ trong PPC kèm cờ.
- Brand/TM/IP bị chặn có ledger.
- Mọi keyword phải nằm trong một bucket accounting hoặc ledger còn lại; `corpusAccountingGap = 0` là invariant. Không ép keyword không phù hợp vào copy chỉ để làm số `unallocated` bằng 0.

## Acceptance gates

1. Multi-Xray tạo một candidate pool khử trùng và lưu đủ dependency của mọi file.
2. Mỗi batch Amazon có đúng một Cerebro binding đã kiểm overlap; không tự lấy “file đầu tiên”.
3. Etsy canonical nhận cả CSV và HTML, và nhận nhiều file trong một thao tác UI.
4. Preview không ghi DB; confirm lưu từng raw file/hash/accounting riêng.
5. Master KW không mất dấu nguồn/dòng (`accounting gap = 0`) và không được tạo nếu dependency thiếu.
6. Draft có counters và keyword accounting; claim/IP guard vẫn chạy trên output cuối.
7. Luồng dừng ở `NEEDS_QA`; không tự submit marketplace.
