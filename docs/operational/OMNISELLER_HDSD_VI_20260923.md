# OMNISELLER — HƯỚNG DẪN SỬ DỤNG & VẬN HÀNH BACKUP — 2026-09-23

## 0. Mục đích

Tài liệu này là bản backup quy trình sử dụng OmniSeller để:

- nhân viên mới hiểu đường đi chính;
- Owner/Manager biết chỗ nào cần quyền người thật;
- developer/reviewer không nhầm legacy UI với canonical workflow;
- có thể phục hồi cách vận hành sau khi UI thay đổi;
- không phải dựa vào lịch sử chat.

Tài liệu ưu tiên **canonical R4.3 workflow**.

### Baseline khi viết HDSD

~~~text
PRODUCTION
b911ffbfa590dfee083c572871c1286642dc4f1c

REPOSITORY MAIN
b44fc198390c849310bd0dab28cfe920afac2d63

PR #71
merged in repository history
NOT deployed to production
~~~

Do đó một số UI one-click trong main chưa phải UI production.

---

# 1. Những nguyên tắc nhân viên phải nhớ

## 1.1 Research không phải Product Truth

~~~text
Cerebro / Xray / Etsy / ytuong / YTrends / Intel
= dữ liệu nghiên cứu

Product Truth
= factual facts được staff xác nhận trong đúng Project
~~~

Không copy một con số/claim từ research rồi mặc định coi đó là Product Truth.

## 1.2 Preview và Save/Confirm khác nhau

~~~text
Preview
→ kiểm file / kiểm kết quả
→ zero-write

Import / Save / Confirm
→ mới persist artifact/evidence
~~~

Nếu Preview sai, dừng ở đó. Không Confirm để “xem thử”.

## 1.3 Missing không phải zero

Nếu file không có sales/revenue/review/metric:

~~~text
UNKNOWN
~~~

không tự hiểu là 0.

## 1.4 Không bypass

Không:
- sửa DB thủ công;
- tạo Project thủ công để vượt gate khi UI đang chặn;
- sửa trạng thái trực tiếp;
- dùng legacy publish/export route để đi vòng;
- đổi evidence authority bằng client metadata.

---

# 2. Role

## SELLER

Được:
- tạo/chọn Project;
- nạp research;
- preview/save canonical research artifacts;
- tạo Product Truth revision;
- tạo intelligence/listing;
- gửi submission request;
- export sau khi Owner authorization;
- report kết quả submit ngoài marketplace.

Không được tự nâng research thành Product Truth authority hoặc tự approve thay Owner/Manager.

## MANAGER

Có SELLER capability cộng:
- canonical review;
- confirm Product Truth theo route cho phép;
- một số candidate/project management action.

## OWNER

Có quyền cao nhất trong ứng dụng:
- quản lý user;
- Owner-only authorization;
- cấu hình;
- destructive reset có recent re-auth;
- pull signed Intel handoff.

Release authorization không thực hiện thay Owner bởi AI/dev; Owner tự xác nhận exact marker trên GitHub PR.

---

# 3. Login và đổi Workspace

1. Đăng nhập.
2. Kiểm tra marketplace hiện tại: AMAZON hoặc ETSY.
3. Nếu làm marketplace khác, dùng Switch Workspace.
4. Sau khi switch, kiểm tra workspace, marketplace và role.

Mọi canonical data đều scope theo:

~~~text
tenant
+ workspace
+ marketplace
+ project
~~~

Không upload file Amazon trong Etsy workspace và ngược lại.

---

# 4. Project — hiểu đúng

Project là **research container** cho một hướng sản phẩm/niche.

Project không đồng nghĩa:
- sản phẩm chắc chắn bán được;
- Commercial Proof đã xác lập;
- listing đã được duyệt;
- được phép publish.

Lineage:

~~~text
research inputs
→ research snapshot
→ marketplace workflow artifacts
→ Product Truth
→ intelligence
→ listing revisions
→ review/export lifecycle
~~~

---

# 5. AMAZON — quy trình canonical

## 5.1 Tạo hoặc chọn Project

Nếu đã có Project, chọn Active Project.

Nếu chưa có:
- tạo Project;
- đặt tên dễ hiểu;
- nhập seed phrase;
- chọn policy classification/context khi UI yêu cầu.

Ví dụ:

~~~text
Project: Pet Memorial Gift
Seed: pet memorial gift
~~~

## 5.2 Xray — tùy chọn

Nếu có Xray:

1. chọn file Xray;
2. Preview;
3. kiểm parser/accounting;
4. Import;
5. xác nhận file xuất hiện trong research imports.

Xray dùng để hỗ trợ competitor/ASIN planning, không phải Product Truth.

## 5.3 Cerebro — nguồn Amazon canonical V1

Nguồn:

~~~text
Helium 10 Cerebro CSV/XLSX
~~~

Không phụ thuộc H10 MCP.

Quy trình:

1. lấy ASIN sản phẩm/competitor phù hợp;
2. chạy Cerebro;
3. export CSV/XLSX;
4. trong Omni chọn lane AMAZON_CEREBRO;
5. Preview;
6. kiểm report signature, keyword count, các metric source thực sự có;
7. Confirm/Import.

Omni lưu raw bytes, raw hash, parser id/hash, header/sheet context và accounting.

## 5.4 Research Snapshot

Sau khi import:

1. chọn import IDs cần dùng;
2. tạo Research Snapshot;
3. snapshot trở thành immutable dependency.

Nếu research đổi, tạo snapshot revision mới; không sửa snapshot cũ.

## 5.5 ASIN Plan — optional

Nếu dùng Xray:
- Preview ASIN Plan;
- kiểm groups/cohorts;
- staff có thể chỉnh ASIN;
- Save.

ASIN Plan là convenience artifact.

## 5.6 Master Keywords

1. Preview Amazon Master Keywords.
2. Kiểm keyword, tier, metric provenance, exclusions/IP và rejected accounting.
3. Chỉnh tier khi cần.
4. Save.

Không padding keyword giả để đủ số.

## 5.7 Product Truth

Có thể tạo Product Truth từ:
- staff form;
- workbook;
- listing capture;
- reusable family facts.

Quy trình:
1. tạo Product Truth revision;
2. kiểm facts;
3. unknown phải giữ unknown;
4. confirm revision bằng human authority đúng vai.

Không lấy modeled competitor metric làm product fact.

## 5.8 Intelligence Snapshot

Khi có Research Snapshot và Product Truth revision hiện hành:

1. Preview Intelligence;
2. kiểm output/accounting;
3. Save Intelligence Snapshot.

Nếu dependency stale: refresh và dùng head mới; không bypass.

## 5.9 Listing

Có truth-only preview và commerce/intelligence preview.

Sau preview:
1. kiểm title/bullets/search terms;
2. kiểm factual claims;
3. lưu Listing Revision;
4. listing canonical vào QA flow.

## 5.10 Review → authorization → export

~~~text
Listing
→ Owner/Manager canonical review
→ SELLER submission request
→ OWNER authorization
→ SELLER exact export
→ SELLER operator submission report
~~~

Export authorization không có nghĩa Commercial Proof.

---

# 6. ETSY — quy trình canonical

## 6.1 Nguồn thực tế V1

Không cần Etsy Plus.

~~~text
Etsy / ytuong.me extension-tool capture
+
optional YTrends MCP
~~~

Evidence tiers đang tồn tại trong workflow:

### E1 — OBSERVED PUBLIC

Ví dụ:
- title;
- shop;
- displayed price;
- review count;
- rating;
- tags/categories nếu source thật sự cung cấp;
- observed rank/badges.

### E2 — MODELED THIRD PARTY

Ví dụ:
- estimated sold;
- sold 24h;
- views;
- estimated revenue;
- conversion;
- favorites/rates;
- modeled age/velocity;
- HeyEtsy/extension-derived metrics.

### E3 — YTRENDS SUPPLEMENTAL INDEX

YTrends dùng cho keyword/niche/trend discovery và corroboration.

### E4 — STAFF ASSERTED / UNVERIFIED

Manual input chưa có verified authority.

## 6.2 Tạo/chọn Etsy Project

- chuyển Etsy workspace;
- tạo hoặc chọn Active Project;
- seed phrase là niche/product concept đang nghiên cứu.

## 6.3 Nạp Etsy / ytuong.me capture

Canonical research route hỗ trợ Etsy Search CSV/HTML.

1. export/capture dữ liệu thật;
2. Preview;
3. kiểm số listing, unmapped columns, header diagnostics, duplicate/rejected accounting;
4. Confirm/Import;
5. tạo Research Snapshot.

Không dùng fixture production.

## 6.4 Winner Set

Từ Research Snapshot:

1. Preview Winners;
2. kiểm relevance với seed;
3. xem các cohort như organic leaders, traction, velocity, engagement, conversion candidate, emerging winner;
4. staff chọn winners nếu cần;
5. Save Winner Set.

Modeled sales/revenue có thể hỗ trợ ranking nhưng không tự nâng authority của public facts.

## 6.5 Pattern Snapshot

Từ Winner Set:

1. Preview Pattern;
2. xem title heads, repeated phrases, observed tags, common words, shop/price context, personalization/gift pattern;
3. Save Pattern Snapshot.

## 6.6 YTrends — optional canonical supplement

Canonical Commerce Workflow đã có:

~~~text
SERVER_DIRECT
→ BROWSER_DIRECT fallback khi cần
~~~

YTrends supplement lưu:
- E3 tier;
- fetchedAt;
- response hash;
- transport;
- provider tools/pull status.

Nếu YTrends unavailable:
- file/capture workflow vẫn dùng được;
- không fabricate fallback;
- không đổi YTrends thành E1.

Lưu ý: legacy Etsy UI có thể hiện connector disabled. Ưu tiên **Canonical Commerce Workflow**.

## 6.7 Etsy Master Keywords

1. Preview Master Keywords.
2. Kiểm source types, listing spread, shop spread, seed overlap, IP hits và tier.
3. Save.

Không pad đủ 13 tag nếu evidence không có.

## 6.8 Product Truth → Intelligence → Listing

Sau MKL:
- tạo/confirm Product Truth;
- tạo Intelligence Snapshot;
- preview/save Listing Revision;
- canonical review;
- request/authorization/export/report giống Amazon.

---

# 7. YTrends — hiểu đúng

Endpoint hiện có:

~~~text
https://mcp.trends.ytuong.ai/mcp
~~~

Research tools đã được Omni biết tới gồm:
- ytrends_explore_niche
- ytrends_research_keyword
- ytrends_find_trending_keywords
- ytrends_search

YTrends là supplemental source.

Không dùng YTrends để:
- xác nhận material/product fact;
- chứng minh marketplace sale;
- vượt Product Truth;
- thay Owner authorization.

Nếu provider trả không có usable keyword/tag, canonical behavior phải fail closed hoặc đánh dấu derived research-only; không được tự biến seed/title thành provider-observed tag.

---

# 8. INTEL — cách dùng

Intel dành cho:
- trend;
- social signal;
- VOC;
- buyer language;
- competitor movement;
- WhyNow;
- product opportunity discovery.

Intel không thay marketplace research evidence.

~~~text
Intel-only
→ Opportunity / Investigation Queue
→ chọn Amazon hoặc Etsy validation path
~~~

Ví dụ:

~~~text
Intel thấy "pet memorial gift"
→ Amazon: Cerebro
hoặc
→ Etsy: ytuong/Etsy capture
~~~

---

# 9. Global Candidate — production và candidate UI

Khi viết tài liệu:

- production = b911ff...
- #71 one-click chưa deploy.

Nếu production còn B2/B3/Preview/Confirm nhiều bước, đó là expected baseline.

Mục tiêu successor:

~~~text
select marketplace file
→ Analyze Opportunity
→ READY / NEED MORE DATA
→ Create Project
~~~

Backend vẫn phải giữ zero-write preview, provenance, Research Readiness/Commercial Proof separation và authority floor.

---

# 10. Product Truth checklist

Trước Confirm:

- product type đúng?
- material có source?
- dimensions có source?
- personalization limits có source?
- color/size variants có source?
- package quantity có source?
- fact chưa biết để UNKNOWN?
- có copy modeled competitor metric vào product fact không?

Product Truth không chứa:
- search volume;
- competitor sales;
- social trend;
- opportunity score;
- YTrends score.

---

# 11. Listing QA

Trước review:

1. factual claim có trong Product Truth?
2. IP Guard có block?
3. marketplace policy context đúng?
4. title/tags/search terms đúng contract hiện hành?
5. không có unsupported material/dimension/feature?
6. dependency revision còn current?
7. listing content hash đúng revision?

Nếu Product Truth đổi sau khi listing được tạo, phải revalidate; approval cũ không tự áp cho content mới.

---

# 12. Export / submission

~~~text
review
→ submission request
→ Owner authorization
→ exact export
→ operator report
~~~

Không dùng retired legacy submission handoff.

Marketplace submission hiện là human/operator controlled, không phải auto-publish authority.

---

# 13. Lỗi thường gặp

## RESEARCH_REPORT_SIGNATURE_MISMATCH

File không giống report parser mong đợi.

Xử lý: lấy đúng source file và Preview lại. Không rename giả để vượt parser.

## PRODUCT_TRUTH_FAMILY_UNRESOLVED

Không resolve được family/identity.

Không sửa DB hoặc ép generic family bằng tay.

## STALE_* / dependency conflict

Head revision/artifact đã đổi.

Refresh → dùng head mới → Preview lại.

## ETSY_YTRENDS_UNAVAILABLE

YTrends unavailable.

Tiếp tục Etsy capture workflow nếu bước đó không phụ thuộc YTrends; không fabricate data.

## OWNER_AUTHORIZATION_NOT_PROVEN

Đây là release gate. Owner tự kiểm PR và tự post exact marker.

---

# 14. Release runbook backup

## Không deploy "latest main"

~~~text
LATEST MAIN != RELEASE AUTHORITY
~~~

Release phải có exact:
- BASELINE_SHA
- TARGET_SHA
- PR_NUMBER

## Canonical VPS

~~~bash
ssh -p 55317 etsy@51.79.200.65
cd /home/etsy/omniseller
git fetch origin main --prune
bash scripts/vps_deploy_and_verify.sh <TARGET_SHA>
~~~

Runbook tự xử lý build, schema gate, Owner authorization, DB snapshot, integrity check, atomic switch, restart, local/public health và receipt.

Không làm thủ công để bypass runbook.

---

# 15. Owner authorization

Nếu runbook dừng:

~~~text
OWNER_AUTHORIZATION_NOT_PROVEN:
OMNISELLER_OWNER_AUTHORIZATION_V3:<digest>
~~~

1. Owner mở exact PR.
2. Owner kiểm diff, CI, target SHA và review.
3. Owner tự post exact marker.
4. rerun canonical deploy.

AI/dev không post marker thay Owner.

---

# 16. Evidence backup cho UAT/release

Lưu:
- Omni SHA;
- Intel SHA nếu dùng;
- input filename;
- input SHA256;
- capture/export date nếu biết;
- operator;
- start time;
- result;
- first error/friction;
- release receipt path.

Nếu input file đổi 1 byte thì coi là artifact mới.

---

# 17. Những thứ KHÔNG phải canonical dependency

## Amazon

Không bắt buộc H10 MCP.

Cerebro CSV/XLSX là canonical V1.

## Etsy

Không bắt buộc:
- Etsy Plus;
- eRank;
- EverBee.

Stack thực tế:

~~~text
ytuong.me / Etsy capture
+ YTrends optional
+ Omni
~~~

---

# 18. Khi UI gây rối — chọn surface nào?

Ưu tiên:

~~~text
CanonicalCommerceWorkflow
~~~

Module legacy/optional có thể còn tồn tại để compatibility/research nhưng không là source of truth thứ hai.

Nếu hai UI nói khác nhau:
- dùng canonical workflow;
- báo issue;
- không đoán.

---

# 19. Quy tắc cho developer/AI agent trước khi sửa Omni

~~~text
1. search capability hiện có
2. đọc canonical workflow
3. đọc tests
4. đọc authority model
5. compare production/main/candidate
6. xác định defect class
7. mới đề xuất code
~~~

Không nói “Omni thiếu X” chỉ vì chưa thấy X trong file đang đọc.

Mọi PASS phải có:
- exact SHA;
- command;
- environment;
- passed/failed/unexecuted;
- artifact/log.

---

# 20. Quick reference

## Amazon

~~~text
Project
→ Xray optional
→ Cerebro
→ Snapshot
→ ASIN Plan optional
→ MKL
→ Product Truth
→ Intelligence
→ Listing
→ Review
→ Request
→ Owner Auth
→ Export
→ Report
~~~

## Etsy

~~~text
Project
→ ytuong/Etsy capture
→ Snapshot
→ Winners
→ Patterns
→ YTrends optional
→ MKL
→ Product Truth
→ Intelligence
→ Listing
→ Review
→ Request
→ Owner Auth
→ Export
→ Report
~~~

## Intel

~~~text
Discover
→ Opportunity Queue
→ marketplace validation
~~~

---

# 21. Current checkpoint

~~~text
PRODUCTION
b911ffbfa590dfee083c572871c1286642dc4f1c

MAIN AT AUDIT
b44fc198390c849310bd0dab28cfe920afac2d63

MAIN CI #426
SUCCESS

PR #71
NOT DEPLOYED

NEXT
verify/fix live Etsy provenance issue
→ harden Research Readiness
→ targeted release
~~~

Tài liệu này là backup vận hành. Khi workflow production thay đổi, HDSD phải được update cùng release receipt, không để hướng dẫn đi trước hoặc tụt sau code.
