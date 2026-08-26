# OMNISELLER — GOLDEN RULES

**Version:** 1.1 — RATIFIED (H0 execution order added)
**Ratified by:** Owner (Alex), 2026-08-25
**Base SHA đối chiếu:** `5c4153bbb03ccf9e0f02b4b90781f64819b70848`
**Áp dụng cho:** GPT1, GPT2, GPT3, GPT4, Claude và mọi reviewer/implementer sau này.

---

## 0. THẨM QUYỀN — ĐÃ QUYẾT

> **Đây là văn bản golden rule DUY NHẤT của OmniSeller. Mọi golden rule trước đó bị bãi bỏ.**

| Văn bản cũ | Trạng thái |
|---|---|
| `PROJECT_RULES.md` | ❌ **BÃI BỎ** — thay bằng stub trỏ về đây |
| `PROJECT_GUIDE_CLAUDE_GPT_OMNI_AMZ_ETSY.md` §13 (vai trò) và §21 (handoff) | ❌ **BÃI BỎ** — mâu thuẫn trực tiếp với Phần 2 và Phần 14 |
| `PROJECT_GUIDE_*` các mục còn lại | ⚠️ Giữ làm **tài liệu tham khảo business/architecture**, không phải rule. Khi mâu thuẫn → văn bản này thắng |
| Multi-AI Golden Rules (21 mục) | ✅ Đã hợp nhất vào đây |
| `docs/GPT1_GPT2_INTEGRATION_CHECKLIST.md` | ⬇️ Hạ xuống `docs/operational/` — checklist vận hành, không phải governance |

**Quy tắc:** không văn bản nào khác được định nghĩa lại rule. Tài liệu khác chỉ được **trỏ về đây**.

**Cảnh báo thực thi:** văn bản này chỉ có hiệu lực khi các file cũ bị đóng đường thật (stub hoá / di chuyển). Nếu để cạnh nhau, đây là văn bản governance **thứ năm** chứ không phải bản hợp nhất — đúng lỗi mà Phần 6 cấm.

---

## 1. MỤC TIÊU TỐI CAO

```
Nạp dữ liệu thật → bảo toàn → phân tích đúng nguồn → học DNA có kiểm soát
→ controlled draft → xác minh Product Truth/IP/economics
→ listing bán được → publish khi được phê duyệt
```

**Thứ tự ưu tiên khi xung đột:** `Revenue → Safety → Truth → Real Usage → Consolidation`

Không tối ưu cho "test xanh" hoặc "workflow chạy được" nếu dữ liệu bị mất, sai nghĩa, hoặc authority gate yếu đi.

**Kiểm tra cuối mỗi cluster** — không cải thiện khả năng tạo listing bán được thì phải xem lại dù test xanh:

1. Staff làm được việc gì trước đây không làm được?
2. Dữ liệu thật có được bảo toàn và dùng tốt hơn?
3. Workflow có rõ hơn?
4. Phân tích có giúp chọn sản phẩm/keyword tốt hơn?
5. Có đường hợp lệ tới controlled draft?
6. Product Truth và publish authority còn fail-closed?
7. Có đang xây thêm dashboard/state không phục vụ bán hàng?

---

## 2. VAI TRÒ VÀ QUYỀN SỞ HỮU

| AI | Vai trò | Được sửa gì |
|---|---|---|
| **GPT1** | Product Truth, authority, IP, approval, publish gate | Authority contract |
| **GPT2** | Backend, parser, persistence, provenance, DB/runtime | Implementation |
| **GPT3** | UI/integration, exact SHA, certification, release/cutover | Release artifact |
| **GPT4** | Adversarial testing, data fidelity, black-box UAT | Test độc lập |
| **Claude** | Architecture controller, independent audit, challenge assumptions | **Không sửa production source** |

```
Role controls who changes what.
Role never limits who may discover a defect.
```

- Thấy lỗi ngoài phạm vi → **bắt buộc** ghi finding, chuyển đúng owner. Không bỏ qua vì "không thuộc phần của tôi".
- Reviewer không tự đổi authority contract ngoài vai trò.
- **Người viết code không tự cấp final PASS cho code của mình.**
- **Một implementation owner cho mỗi task.** Chuyển owner: dừng người cũ → ghi exact SHA → bàn giao changed files + pending tests + known findings → người mới tiếp từ đúng SHA đó.

---

## 3. EXACT-ARTIFACT DISCIPLINE

Mọi review phải khoá: `Candidate SHA` · `Parent SHA` · `Base/production SHA` · `Branch` · `Bundle SHA-256` · `Changed files` · `Worktree status`

**Không review theo:** tên branch · mô tả trong chat · ancestor SHA · local uncommitted changes · bundle chưa đính kèm.

Verdict chỉ áp dụng cho **exact SHA đã review**. Một byte đổi sau PASS → candidate mới, gate mới.

**Trước khi code**, owner + architecture reviewer xác minh: production SHA · base SHA · git diff tổng · worktree sạch · implementation cũ/competing paths · nguồn dữ liệu thật · API/DB/reload/UI consumers · authority impact · defect register · mục tiêu kinh doanh của cluster.

Không bắt đầu bằng cách sửa ngay dòng xuất hiện trong PoC.

**Branch audit tại 4 thời điểm:** trước implementation · trước commit · trước handoff · trước merge/cutover.

---

## 4. PoC → CLASS-LEVEL REMEDIATION

Một PoC chỉ chứng minh **một biểu hiện**. Sau mỗi PoC bắt buộc hỏi:

```
Class lỗi này còn ở đâu?
Có alias/route/provider/state tương tự?
Downstream consumer nào còn dùng contract cũ?
Test nào đang chứng nhận hành vi sai?
Dữ liệu cũ trong DB chịu ảnh hưởng thế nào?
```

> **Vì sao rule này tồn tại:** cùng một class "fallback bịa dữ liệu" đã tái xuất **4 lần** — `asinBatcher` → `keywordRanker` → `Xray/LearningBox` → `eligibility default-allow`. Mỗi lần đều vá đúng dòng được chỉ. Không lần nào quét class.

Không đóng finding chỉ vì một input mẫu đã PASS.

---

## 5. GOLDEN DATA RULES

> **Không fabricate · không silently discard · không silently coerce · không silently promote.**

Mỗi row/field phải có đúng một trạng thái tường minh:

```
MAPPED · UNKNOWN · IGNORED_WITH_REASON · UNMAPPED · INVALID/REJECTED(+lý do)
```

Bắt buộc phân biệt: `0` ≠ missing · `false` ≠ unknown · external ID ≠ internal DB ID · source order ≠ reported rank · display value ≠ normalized value · raw cell ≠ canonical projection · research hint ≠ observed marketplace field · imported time ≠ observed time.

**Accounting bắt buộc:**
```
input = validUnique + duplicates + rejected(có lý do)
silentLoss = 0
unmappedColumns = [danh sách tường minh]
```

**Projection completeness — tách riêng 8 tầng, không gộp:**
```
row ingestion → field projection → persistence → reload/rehydration
→ UI reconstruction → provenance → authority eligibility → runtime certification
```

*"67 rows parsed" không đồng nghĩa "36 columns được bảo toàn".*

**Lifecycle test phải đi xuyên:**
```
real source → parser → accounting → normalized projection → persisted rows
→ process restart → scoped API → browser hard reload ×2 → reconstructed UI
→ downstream research consumer
```

Preview **zero-write**. Confirm mới persist. Search chạy trên **full corpus trước pagination**.

---

## 6. PROVENANCE VÀ AUTHORITY SEPARATION

```
Xray / Cerebro / Etsy CSV / HTML / paste / staff input
→ research input → UNVERIFIED_INPUT → authority NONE
```

Các trạng thái **không** tương đương:
```
OBSERVED ≠ VERIFIED          PERSISTED ≠ ELIGIBLE
ACCEPTED ≠ PRODUCT TRUTH     HIGH SCORE ≠ IP CLEARED
RESEARCH_ACCEPTED ≠ PUBLISH_READY
```

Client **không được** gửi hoặc forge authority metadata. Authority phải server-derive từ: controlled route · provider identity · validated source · **server-computed hash** · version binding · explicit policy.

**Eligibility là allowlist tường minh.** Unknown kind/provider/state → fail-closed.

**AI/model output không bao giờ thoả mãn hard gate:** exact SKU · supplier confirmation · material · dimensions · personalization limits · IP QA · owner-set price · publish approval.

**Chỉ một source of truth.** Trước khi thêm status/score/mapping/config/readiness flag/schema field/derived state → hỏi *"truth này đã tồn tại ở đâu?"*. Reuse / derive / normalize. Không tạo authority thứ hai.

---

## 7. REVIEW LAYERS VÀ TIERING

**Full layer stack:**
```
Architecture review → implementation self-check → independent data/adversarial review
→ authority review → runtime/integration certification → exact-SHA CI → real UAT → release decision
```

Không reviewer nào được thay PASS của reviewer khác.
`GPT1 PASS authority ≠ GPT2 PASS runtime ≠ GPT4 PASS data fidelity ≠ GPT3 PASS integration`

### Tiering — ÁP DỤNG NGAY (GPT1 có thể tinh chỉnh ranh giới)

| Tier | Phạm vi | Lớp review |
|---|---|---|
| **A** | Authority · Product Truth · publish gate · eligibility · IP · economics · state machine · migration | Đủ 8 lớp |
| **B** | Parser · persistence · provenance · API contract · isolation | Architecture + implementation + adversarial + authority + CI |
| **C** | UI/copy/cosmetic · terminology · docs · non-authority test | Implementation + một independent review + CI |

> Governance này quản trị **công cụ**. Nó không được trở thành lý do không có listing nào được bán.

---

## 7A. H0 EXECUTION ORDER — BẮT BUỘC

> H0 là authority hotfix ưu tiên số 0. R1–R4 functional expansion tạm dừng cho tới khi H0 qua exact-SHA certification và controlled cutover.

**Một implementation owner duy nhất:** GPT2. Các AI còn lại review/test/certify theo role, không cùng sửa production source trong cùng vòng.

Trình tự chuẩn:

```text
1. GPT1 ratify Tier A/B/C + authority hierarchy
2. Claude hợp nhất governance/spec; KHÔNG sửa production source
3. GPT2 viết H0 failing tests chứng minh unsafe contract hiện tại
4. GPT2 implement H0
5. GPT4 adversarial forge/tamper/state-machine review
6. Claude independent exact-diff + test-oracle review
7. GPT1 final authority review
8. GPT3 Node22/runtime/full-suite/exact-SHA CI/backup–restore/audit/cutover
9. Sau H0: machine controls được mở rộng/hoàn thiện trong R1–R4
```

### Quy tắc không chờ vô ích

Mỗi AI **phải tiếp tục mọi phần việc độc lập có thể hoàn thành an toàn** thay vì chờ AI khác, miễn là:

- không cần authority ruling chưa có;
- không làm thay implementation owner;
- không thay đổi production source ngoài quyền sở hữu role;
- base/SHA/branch/worktree đã rõ;
- công việc không phụ thuộc artifact chưa tồn tại.

Ví dụ được phép làm song song:

- Claude: audit competing paths, governance conflicts, test oracle, downstream consumers, historical-risk model.
- GPT4: chuẩn bị adversarial matrix/fixtures/harness không phụ thuộc implementation candidate.
- GPT3: chuẩn bị Node22 certification checklist, backup–restore rehearsal plan, cutover/rollback packet.
- GPT1: hoàn thiện authority matrix/Tier definitions và review contract.

**Không được tự biến việc song song thành PASS.** Verdict chỉ được cấp khi exact candidate artifact tương ứng đã tồn tại và được review theo Phần 3/7.

### H0 test-first requirement

Trước implementation, GPT2 phải tạo/điều chỉnh tests để chứng minh contract cũ sai và contract mới mong đợi. Ít nhất phải bao phủ:

- `MANUAL`, H10/Xray/Cerebro/Etsy import/paste → không qualifying;
- unknown/missing/malformed kind → fail-closed;
- forged authority metadata qua generic `/api/evidence` → reject;
- direct/legacy `ACCEPTED` row không bypass downstream shared guard;
- wrong tenant/workspace/marketplace/project → fail-closed + zero-write;
- rejected acceptance → không tạo acceptance event;
- provider-controlled, server-derived qualifying artifact → positive control PASS.

Test cũ đang chứng nhận unsafe contract phải được sửa **có chủ đích**, ghi rõ trong PR theo Phần 8.

### H0 authority-metadata rule

Generic/manual route không được mint qualifying provider artifact. Nếu client gửi reserved authority keys (`kind`, `evidenceState`, `contentHash`, `authority`, `eligible`, `verified`, `provider`, `acceptanceEligibility` hoặc field authority-equivalent mới), server phải **reject tường minh** hoặc cô lập dưới namespace annotation không có authority; không silently strip và không spread vào top-level authority metadata.

Qualifying authority chỉ có thể đến từ controlled server-owned creation path với provider identity, validated source, server-computed hash, version/scope binding và explicit allowlist policy.

### H0 production-data handling

Sau khi candidate H0 được certified nhưng trước cutover:

1. chạy read-only audit bằng **chính policy evaluator đã certified**;
2. liệt kê invalid `ACCEPTED` evidence và project downstream bị ảnh hưởng;
3. không tự động sửa/rollback DB;
4. remediation state/data cần authority ruling riêng + append-only audit event;
5. backup–restore rehearsal phải là restore thật vào instance sạch rồi smoke test, không chỉ test API copy/VACUUM.

## 8. TEST ORACLE RULE

**Test có thể sai.** Khi implementation đúng contract mới nhưng test đỏ:

1. Xác định canonical contract
2. Chứng minh test oracle cũ sai
3. **Ghi rõ trong PR**
4. Sửa test theo contract
5. **Không nới implementation chỉ để giữ test xanh**

Mọi test change liên quan security/authority phải được **GPT1** review.

> **Đang áp dụng tại H0:** `test_adversarial_staff_ui_flow.cjs:77-82` và `:108-111`, `test_project_scoped_evidence_workflow.test.cjs:104` đang assert `MANUAL` và `H10_XRAY_OBSERVED` được accept và mở `RESEARCH_ACCEPTED`. Hotfix H0 **sẽ làm CI đỏ**. Ba test này phải sửa theo contract fail-closed, không được nới gate.

**Full suite PASS chỉ chứng minh suite hiện tại PASS** — không chứng minh data completeness nếu fixture/oracle thiếu.

### Real-data fixtures — accounting-based, KHÔNG count-based

Mỗi source quan trọng phải có sanitized golden fixture từ **file thật**. Fixture do implementation tự tạo **không đủ**. Expected numbers lấy từ source audit độc lập.

> **Không dùng số đếm làm acceptance criteria.** Bằng chứng: Xray 19 ASIN tại `5c4153b` → **16 clean + 3 rejected có lý do** (dưới sàn $9.99, trên trần $99.99, negative keyword). Đó là hành vi **đúng**. Fixture assert "19 phải sống sót" sẽ ép bỏ filter hợp lệ.

Fixture contract đúng:
```
input=19 → validUnique=16 + rejected=3 (mỗi cái có reason) → silentLoss=0
unmappedColumns=[...]
```

---

## 9. ISOLATION

Mọi API/DB operation phải bind: `tenant + workspace + marketplace + project + artifact/source identity`

Bắt buộc test: wrong tenant · wrong workspace · wrong marketplace · wrong project · stale project sau workspace switch · client-forged project/source · reload sau khi đổi project.

Amazon project không được render Etsy state và ngược lại. Cross-scope trả **404 non-enumerating** (không phải 403) và **zero-write**.

---

## 10. STATE-MACHINE INTEGRITY

Mỗi transition **recompute preconditions server-side**. Không dựa vào: UI state · số lượng row đơn thuần · project đã từng vượt gate · client metadata · legacy accepted state.

Chỉ có **một** authority server-side cho workflow readiness. Output: `PASS` / `WARN` / `BLOCK` + lý do + **một** next action. UI được hiển thị; UI **không** được tự tính lại rule.

**Cấm:** React component quyết định publish readiness · duplicate `if` chain ở nhiều view · UI-only hard gate · hidden fallback ID · default fake data để màn hình có dữ liệu.

> **Ranh giới evidence guard — CHỜ GPT1 RULING (ảnh hưởng H0):** evidence chain là authority tại `RESEARCH_ACCEPTED` và `DNA_ACCEPTED`. Từ `MKL_FROZEN` trở đi precondition thực tế đọc `market_trends` → `listings` → Product Truth Card → publishGate. Gắn thêm evidence guard ở `MANAGER_APPROVED` sẽ tạo authority thứ hai chồng lên publishGate (vi phạm Phần 6). Claude đề xuất giới hạn ở 2 transition; project đã trót vượt gate xử bằng audit + quarantine, không phải guard runtime vĩnh viễn.

---

## 11. MACHINE-ENFORCED vs HUMAN-DISCIPLINE

> Mục quan trọng nhất. Ba văn bản cũ đều thiếu.

`PROJECT_GUIDE §17` đã cấm *"treat missing data as zero"* **từ trước mọi audit**. Rule đó không chặn được lần nào trong 4 lần tái phát. Thứ chặn được, chỉ có một: **route registry test làm đỏ CI** — route tăng 52 → 54 khi thêm tính năng, vẫn phân loại đủ 100%.

**Rule không fail được CI thì dưới áp lực sẽ bị bỏ, và không đoán trước được mục nào bị bỏ.**

| Mục | Nhãn | Cơ chế thực thi |
|---|---|---|
| §5 golden data | `MACHINE` | quét `\|\| '<literal>'` ở field business; assert `input = clean + rejected` |
| §5 projection | `MACHINE` | assert `unmappedColumns` được trả về ở mọi rich-source parser |
| §6 authority | `MACHINE` | assert client metadata không lên top-level; assert default `eligible:false` |
| §9 isolation | `MACHINE` | mở rộng route registry test sang tenant/workspace/marketplace/project |
| §10 state machine | `MACHINE` | assert mọi transition gọi shared guard |
| §3 exact-artifact | `HUMAN` | — |
| §4 class remediation | `HUMAN` | — |
| §7 tiering | `HUMAN` | — |
| §8 test oracle | `HUMAN` (GPT1 review bắt buộc) | — |

**Năm test `MACHINE` bảo vệ nhiều hơn toàn bộ văn bản này.** Phải viết trong H0, trước R1–R4.

**Triển khai theo hai lớp:** H0 phải dựng controls tối thiểu đủ chặn authority regression ngay; sau H0, R1–R4 phải mở rộng controls này thành coverage class-level cho persistence/reload, full-corpus search, provenance registry, route/source registration, shared authority evaluator và lifecycle UAT. Không trì hoãn H0 chỉ để hoàn thiện toàn bộ machine-control framework.

---

## 12. RELEASE SAFETY

**Release-ready ≠ được phép deploy.** Tách riêng 5 quyền:
```
Push · Merge · Migration evidence · Cutover · Marketplace publish
```

Cutover cần: exact source + runbook SHA · fresh migration evidence · **backup–restore rehearsal thật** · pre-stop gates · rollback fail-closed · post-cutover health · revision binding · monitoring warnings/errors.

> ⚠️ **`tests/test_backup_restore_and_migrations.cjs` KHÔNG phải rehearsal.** Nó chỉ test `VACUUM INTO` của SQLite và `fs.copyFileSync`, **không import một dòng backup code nào của ứng dụng**. Rehearsal phải là restore thật vào instance sạch rồi chạy smoke.

Marketplace publish luôn là gate riêng theo từng listing/version.

---

## 13. STOP CONDITIONS

### 13a. Dừng implementation ngay khi
Base/SHA/branch không rõ · worktree có thay đổi lạ · finding authority chưa có GPT1 ruling · parser mất row/field không giải thích được · test oracle mâu thuẫn contract · production state khác assumption · chưa hiểu migration/reload behavior · fix vượt phạm vi cluster · reviewer phát hiện systemic regression.

**Dừng không phải thất bại; đó là fail-closed engineering.**

### 13b. Không bao giờ làm
Xây SaaS platform · universal Amazon/Etsy mega-schema · auto-publish · duplicate H10/YTuong research engine · để UI tự tính readiness · treat missing data as zero · treat modeled price as owner-set price · tin UI freshness không provenance · `npm audit fix --force` · sửa lén frozen scoring/gating logic · nhận "DONE" không bằng chứng · tạo thêm strategy document mà không kết thúc bằng một gate được thực thi hoặc hành động doanh thu.

---

## 14. HANDOFF — MỘT ĐỊNH DẠNG DUY NHẤT

```
Role:
Candidate SHA:
Parent SHA:
Base SHA:
Branch:
Scope reviewed/implemented:
Changed files:
Findings opened:
Findings closed:
Tests actually run:
Tests not run + reason:
Real-data fixture results:
Authority impact:
Production impact:
Worktree status:
Recommended next owner/action:
Push/Merge/Deploy/Publish authorization status:
```

**Nhãn provenance bắt buộc:** `GPT-LIVE-VERIFIED` · `CLAUDE-LIVE-VERIFIED` · `USER-SSH-VERIFIED` · `OWNER-REPORTED` · `REPO-HANDOFF-REPORTED` · `NOT VERIFIED` · `NOT EXECUTED` · `PENDING`

**Không bao giờ chuyển báo cáo của agent khác thành xác minh của mình.** Test không chạy phải ghi lý do — không được trình bày như PASS.

### Defect closure contract
`Finding ID` · `Severity P0-P3` · `Before` · `Root cause (tầng hệ thống)` · `Affected paths` · `Remediation (tổng thể)` · `Regression tests (targeted + adversarial)` · `Real-data result (expected/actual)` · `Residual risk` · `Verdict`

Không gọi cluster PASS nếu còn finding chưa đóng.

---

## 15. KẾ THỪA TỪ TOOLKIT CÓ TRƯỚC

```
D:\Claude\22etsy-agent    — Etsy domain (Python / FastAPI / PostgreSQL)
D:\Claude\Amazon          — AMZ FBM Toolkit
```

**Trạng thái: reference ưu tiên — KHÔNG phải nguồn duy nhất, KHÔNG phải authority.**

- Trước khi xây mới business rule domain Etsy/Amazon → **phải xem** hai repo này trước.
- Lệch thì **phải ghi rõ lý do** trong PR. Không lệch âm thầm.
- **Không** override Golden Rules, Product Truth contract, hay publish gate.
- **Không** là bằng chứng verified cho bất kỳ gate nào.

**Lưu ý kỹ thuật:** `22etsy-agent` là Python/FastAPI/PostgreSQL, Factcheck là Node/Express/SQLite. Kế thừa là **port logic** (thuật toán, ngưỡng, business rule), không phải copy code.

### Parity review — ĐÃ GIAO

| Repo | Owner | Phạm vi giới hạn |
|---|---|---|
| `22etsy-agent` (Etsy) | **GPT1** | publish gate thresholds · 13 tags · Etsy Master Keyword rules · Product Truth facts · Owner Check assertions · owner-set price · Day-3/Day-7 learning |
| `Amazon` (AMZ FBM) | **GPT3** | Xray/Cerebro semantics · keyword allocation · title/bullet rules · 249-byte search terms · IP Guard · compliance · PPC launch logic |

**Không audit toàn bộ hai repo.** Chỉ đối chiếu các business rule đã đóng băng ở trên. Kết quả ghi vào defect register như finding bình thường, theo Defect closure contract Phần 14.

**Trạng thái hiện tại: `NOT VERIFIED`.** Bằng chứng kế thừa duy nhất tìm được tại `5c4153b`:
```
server/publishGate.js:2    "Ported from 22etsy-agent/src/publish_gate.py"
server/publishGate.js:268  "Ported from 22etsy-agent Truth Discipline"
```

---

## PHỤ LỤC A — SỔ XUNG ĐỘT ĐÃ GIẢI

| # | Xung đột | Nguồn | Giải quyết |
|---|---|---|---|
| 1 | Vai trò Claude/GPT đảo ngược | `PROJECT_GUIDE §13` vs Multi-AI §2 | Phần 2 thắng; §13 bãi bỏ |
| 2 | Hai định dạng handoff | `PROJECT_GUIDE §21` vs Multi-AI | Text block (Phần 14); JSON bãi bỏ |
| 3 | Fixture count-based vs accounting | Multi-AI §13 vs §8 | Accounting-based (bằng chứng 19→16+3) |
| 4 | Stop-doing vs stop-condition | `PROJECT_GUIDE §17` vs Multi-AI §21 | Hai thứ khác nhau → tách §13a/§13b |
| 5 | Bốn văn bản governance | toàn bộ | Hợp nhất; ba văn bản kia bãi bỏ/hạ cấp |
| 6 | Phạm vi downstream guard | Multi-AI §11 vs `PROJECT_GUIDE §10` | **Chờ GPT1** — xem Phần 10 |
| 7 | Rule ngôn ngữ | `PROJECT_RULES` GR1 vs preference owner | ✅ **Owner quyết:** bỏ GR1. Hỏi tiếng nào trả lời tiếng đó |
| 8 | Kế thừa 2 toolkit | `PROJECT_RULES` GR4 | ✅ **Owner quyết:** reference ưu tiên, không phải authority → Phần 15 |

---

## PHỤ LỤC B — CÒN CHỜ QUYẾT

| Mục | Người quyết | Nội dung | Trạng thái thực thi |
|---|---|---|---|
| Phần 10 — ranh giới evidence guard | **GPT1** | Giới hạn guard tại `RESEARCH_ACCEPTED` + `DNA_ACCEPTED`, hay yêu cầu shared research-foundation check ở các forward transition phụ thuộc research | **BLOCK H0 final authority PASS**; không block audit/test preparation độc lập |
| Phần 7 — ranh giới Tier A/B/C + authority hierarchy | **GPT1** | Ratify Tier definitions, nguồn nào có qualifying authority, hierarchy giữa research readiness / Product Truth / approval / publish | **BLOCK H0 implementation contract freeze**; không block governance/test-harness preparation |

**Không AI nào được tự điền hai ruling này thay GPT1.** Trong thời gian chờ, mọi AI khác phải tiếp tục các phần việc độc lập theo Phần 7A.

*Tất cả mục khác đã được Owner ratify ngày 2026-08-25; Phần 7A được Owner bổ sung/ratify trong vòng H0 hiện tại.*

---

## PHỤ LỤC C — VIỆC ĐỂ VĂN BẢN NÀY CÓ HIỆU LỰC

| # | Việc | Owner | Trạng thái |
|---|---|---|---|
| 1 | Commit `GOLDEN_RULES.md` ở gốc repo | GPT3 | ⬜ |
| 2 | `PROJECT_RULES.md` → stub trỏ về đây | GPT3 | ⬜ |
| 3 | `PROJECT_GUIDE_*.md` → xoá §13, §21; thêm header trỏ về đây | GPT3 | ⬜ |
| 4 | `GPT1_GPT2_INTEGRATION_CHECKLIST.md` → `docs/operational/` | GPT3 | ⬜ |
| 5 | Viết 5 test `MACHINE` tối thiểu + H0 failing authority matrix | GPT2 | ⬜ |
| 6 | GPT1 ratify Tier A/B/C + authority hierarchy + evidence-guard ruling | GPT1 | ⬜ |
| 7 | Claude hợp nhất governance/spec + independent diff/test-oracle reviews | Claude | ⬜ |
| 8 | GPT4 adversarial forge/tamper/state-machine review | GPT4 | ⬜ |
| 9 | GPT3 Node22/runtime/full-suite/exact-SHA CI/backup–restore/audit/cutover packet | GPT3 | ⬜ |
| 10 | Parity review Etsy (Phần 15) | GPT1 | ⬜ |
| 11 | Parity review Amazon (Phần 15) | GPT3 | ⬜ |

**Chừng nào việc 1–4 chưa xong, bốn văn bản cũ vẫn còn hiệu lực song song — và đây chỉ là văn bản thứ năm.**

---

## CÂU KHOÁ

> Review theo exact artifact, sửa root cause thay vì vá PoC, bảo toàn mọi dữ liệu có ý nghĩa, fail-closed mọi authority, kiểm tra xuyên source→DB→reload→UI, và luôn quay lại mục tiêu tạo listing có khả năng bán hàng.
