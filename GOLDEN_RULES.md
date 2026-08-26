# OMNISELLER — GOLDEN RULES

**Version:** 1.4 — RATIFIED
**Ratified by:** Owner (Alex), 2026-08-25; GPT1 authority contract ratified 2026-08-26
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

> **Provenance — `GPT1-RATIFIED`, 2026-08-26:** reserved authority metadata, EA-A/EA-B/EA-C boundaries, explicit eligibility allowlist, server-derived hash/provider/scope, H0 error/zero-write contract và promotion rules trong Phần 6 là authority ruling của GPT1. Không gán các chi tiết này thành `OWNER-RATIFIED` nếu Owner chưa ratify riêng từng nội dung.

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

**Reserved authority metadata — reject-first.** Generic/client-controlled routes phải trả `400 CLIENT_AUTHORITY_METADATA_FORBIDDEN` và zero business/authority DB writes nếu client gửi tối thiểu các key sau ở bất kỳ authority-bearing vị trí nào:

```
kind · source · evidenceState · contentHash · authority · eligible · verified
provider · acceptanceEligibility · accepted_at · accepted_by · tier
```

Không silently strip, không spread metadata client vào top-level. Metadata non-authoritative chỉ được lưu trong `clientAnnotations` sau schema/type/size/depth validation và chặn prototype-pollution keys.

Generic `/api/evidence` không được tạo MCP evidence, kể cả khi client gửi `source=MCP_RETRIEVAL`. Chỉ provider-controlled ingestion path mới được tạo qualifying retrieval artifact. `contentHash` phải do server tính trên canonical provider response; không nhận hash hoặc canonical representation từ client.

**Eligibility là allowlist tường minh.** Unknown kind/provider/state → fail-closed.

### Authority classes — phân lớp dữ liệu, KHÔNG phải review tier

| Class | Contract | Quyền hạn |
|---|---|---|
| **EA-A — Verified authority** | Server-controlled verification + canonical evidence + exact tenant/workspace/project/product/listingVersion binding + server-computed hash + `VERIFIED` + provenance đầy đủ | Có thể tham gia Product Truth/publish decision; không tự động tạo `PUBLISH_READY` |
| **EA-B — Qualified research** | `SMART_PULL_ARTIFACT_V1` + server-established `MCP_RETRIEVAL` + allowlisted provider/state + server-computed hash + exact scope binding + current/untampered | Có thể thỏa qualifying-research precondition; Product Truth authority vẫn `NONE` |
| **EA-C — Unverified research** | Staff/manual, Xray/Cerebro/Etsy CSV/HTML/paste, generic evidence, client annotations, unknown/mismatched artifact | `UNVERIFIED_INPUT`, authority `NONE`, `RESEARCH_ONLY`, non-qualifying |

**Promotion rules:**

```
EA-C --client metadata/staff accept--> EA-B/EA-A      FORBIDDEN
EA-B --workflow transition--> EA-A                   FORBIDDEN
provider-controlled validated ingestion --> EA-B    ALLOWED
specialized verified Product Truth process --> EA-A ALLOWED
unknown/mismatch/tamper --> non-qualifying           FAIL-CLOSED
```

`ACCEPTED` không tự nâng authority class. Server phải derive class và recompute eligibility theo current policy; không tin `eligible=true` hoặc classification đã persist từ policy cũ.

**H0 error/zero-write contract:**

| Failure class | Required result |
|---|---|
| Forged/reserved authority metadata | `400 CLIENT_AUTHORITY_METADATA_FORBIDDEN` |
| Accept EA-C hoặc artifact không còn qualifying | `409 UNQUALIFIED_RESEARCH_ARTIFACT` |
| Forward transition thiếu current EA-B | `400 MISSING_QUALIFYING_EVIDENCE_PRECONDITION` |
| Hash/provider/scope/tamper mismatch | Fail-closed bằng code cụ thể của lớp lỗi; không generic success/fallback |

Mọi rejected request phải zero-write đối với evidence row/status, acceptance fields, project state, listing/version, `market_trends`, Product Truth và workflow/remediation business events. Nếu security audit log là bắt buộc, nó phải append-only và nằm ngoài authority transaction; không được biến rejection thành business-state mutation.

### Authority hierarchy — cao xuống thấp

```
1. Server-enforced Product Truth/publish policy
2. Exact verified Product Truth + evidence/version/hash binding (EA-A)
3. Independent IP, approval, economics và scope gates
4. Provider-controlled qualifying research artifact (EA-B)
5. Persisted unverified research input (EA-C)
6. UI/client state, labels, scores và metadata — zero authority
```

**AI/model output không bao giờ thoả mãn hard gate:** exact SKU · supplier confirmation · material · dimensions · personalization limits · IP QA · owner-set price · publish approval.

**Chỉ một source of truth.** Trước khi thêm status/score/mapping/config/readiness flag/schema field/derived state → hỏi *"truth này đã tồn tại ở đâu?"*. Reuse / derive / normalize. Không tạo authority thứ hai.

---

## 7. REVIEW LAYERS VÀ RISK TIERING

**Full layer stack:**
```
Architecture review → implementation self-check → independent data/adversarial review
→ authority review → runtime/integration certification → exact-SHA CI → real UAT → release decision
```

Không reviewer nào được thay PASS của reviewer khác.
`GPT1 PASS authority ≠ GPT2 PASS runtime ≠ GPT4 PASS data fidelity ≠ GPT3 PASS integration`

### Review Risk Tiering — ĐÃ ĐƯỢC GPT1 RATIFY

| Review tier | Phạm vi | Lớp review |
|---|---|---|
| **A** | Authority · Product Truth · publish gate · eligibility · IP · economics · state machine · migration | Đủ 8 lớp |
| **B** | Parser · persistence · provenance · API contract · isolation | Architecture + implementation + adversarial + authority + CI |
| **C** | UI/copy/cosmetic · terminology · docs · non-authority test | Implementation + một independent review + CI |

> Governance này quản trị **công cụ**. Nó không được trở thành lý do không có listing nào được bán.

**Không nhầm lẫn:** Review Tier A/B/C trong Phần 7 phân loại mức rủi ro của thay đổi. EA-A/EA-B/EA-C trong Phần 6 phân loại authority của dữ liệu. Hai hệ độc lập và không được dùng thay nhau.

---

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

> **Provenance — `GPT1-RATIFIED`, 2026-08-26:** shared qualifying-evidence guard áp dụng tại cả 7 forward transition. Guard chỉ chứng minh research foundation; không thay Product Truth, IP, economics, approval/version/hash, scope hoặc final `publishGate`.

Mỗi transition **recompute preconditions server-side**. Không dựa vào: UI state · số lượng row đơn thuần · project đã từng vượt gate · client metadata · legacy accepted state.

Chỉ có **một** authority server-side cho workflow readiness. Output: `PASS` / `WARN` / `BLOCK` + lý do + **một** next action. UI được hiển thị; UI **không** được tự tính lại rule.

**Cấm:** React component quyết định publish readiness · duplicate `if` chain ở nhiều view · UI-only hard gate · hidden fallback ID · default fake data để màn hình có dữ liệu.

**Ranh giới evidence guard — GPT1 ĐÃ QUYẾT:** mọi forward transition phụ thuộc research foundation phải gọi cùng shared qualifying-evidence guard và recompute từ DB theo current policy:

```
RESEARCH_ACCEPTED → DNA_ACCEPTED → MKL_FROZEN → DRAFT_GENERATED
→ VALIDATED → MANAGER_APPROVED → PUBLISH_READY
```

Guard phải query đúng tenant/workspace/marketplace/project, yêu cầu ít nhất một row `ACCEPTED` hiện vẫn đạt EA-B, tái xác minh hash/tamper/revocation/supersession và reject **trước mọi mutation** nếu không đạt.

Đây là research-foundation precondition, **không phải authority thứ hai thay publishGate**. Tại `MANAGER_APPROVED`/`PUBLISH_READY`, hệ thống vẫn phải kiểm riêng EA-A Product Truth, IP `CLEARED`, approval/version/hash, economics và scope. `publishGate` tiếp tục là authority tổng hợp cuối cùng.

Project lịch sử đã vượt gate bằng evidence không hợp lệ: audit read-only + quarantine report trước; không tự sửa DB. Mọi remediation production cần quyền riêng, append-only event và authority ruling của GPT1.

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
| §10 state machine | `MACHINE` | assert cả 7 forward transition gọi shared qualifying-evidence guard; publish transitions vẫn gọi `publishGate` |
| §3 exact-artifact | `HUMAN` | — |
| §4 class remediation | `HUMAN` | — |
| §7 tiering | `HUMAN` | — |
| §8 test oracle | `HUMAN` (GPT1 review bắt buộc) | — |

**Năm test `MACHINE` bảo vệ nhiều hơn toàn bộ văn bản này.** Phải viết trong H0, trước R1–R4.

---

## 12. RELEASE SAFETY

**Release-ready ≠ được phép deploy.** Tách riêng 5 quyền:
```
Push · Merge · Migration evidence · Cutover · Marketplace publish
```

Cutover cần: exact source + runbook SHA · fresh migration evidence · **backup–restore rehearsal thật** · pre-stop gates · rollback fail-closed · post-cutover health · revision binding · monitoring warnings/errors.

> ⚠️ **`tests/test_backup_restore_and_migrations.cjs` KHÔNG phải rehearsal.** Nó chỉ test `VACUUM INTO` của SQLite và `fs.copyFileSync`, **không import một dòng backup code nào của ứng dụng**. Rehearsal phải là restore thật vào instance sạch rồi chạy smoke.

Marketplace publish luôn là gate riêng theo từng listing/version.

### H0 production audit và remediation boundary

Trước cutover H0:

```
canonical backup–restore rehearsal
→ read-only audit toàn bộ ACCEPTED evidence
→ recompute từng row theo current EA-B policy
→ liệt kê project đã đi tới state cao hơn dựa trên row không hợp lệ
→ zero production DB remediation trong audit
```

Sau H0, hạ evidence state, xoá acceptance attribution, đổi project state hoặc ghi remediation event đều cần authorization riêng. Audit PASS không tự cấp quyền sửa DB/cutover/publish.

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

## 16. END-OF-SESSION CHECKPOINT — BẮT BUỘC

Sau **mỗi phiên làm việc**, AI đang giữ phiên phải kết thúc bằng một checkpoint đủ để Owner và phiên kế tiếp trả lời ngay được:

```text
Đang ở đâu?
Đang làm trên exact artifact/SHA nào?
Đã làm và đã thực sự verify được gì?
Còn blocker/finding nào?
Mục tiêu hiện tại là gì?
AI nào phải làm việc gì tiếp theo?
Việc nào có thể chạy song song mà không cần chờ?
Quyền push/merge/deploy/publish hiện tại là gì?
```

Checkpoint không được chỉ ghi “DONE”, “PASS” hoặc kể lại kế hoạch. Nó phải phân biệt rõ **thực tế đã tự xác minh**, **báo cáo nhận từ agent khác**, **việc chưa chạy** và **suy luận**.

### 16.1. Exact identity bắt buộc

> **Fresh-verification rule:** mọi SHA và trạng thái được trình bày trong checkpoint như **trạng thái hiện tại** phải được chính AI viết checkpoint kiểm tra lại tại thời điểm viết checkpoint. Không được copy từ checkpoint trước, chat, memory hoặc báo cáo của agent khác rồi gắn nhãn current.

Áp dụng tối thiểu cho:

```text
main/production revision
base/parent/candidate HEAD
branch/PR state và base branch
ahead/behind và ancestry
changed-files scope
CI/check status trên exact SHA
worktree clean/dirty
bundle/patch hash và verify status
deployment/service/health/runtime state
authorization state nếu có thể đã thay đổi
```

Verification phải diễn ra ngay trước khi gửi checkpoint và ghi:

```text
Verified at: ISO-8601 timestamp + timezone
Verification source: local Git / GitHub exact-head API or UI / VPS command / artifact checksum
```

Nếu checkpoint được soạn đủ lâu để state có thể thay đổi, AI phải recheck các state mutable ngay trước khi gửi. CI của ancestor, branch name, checkpoint cũ hoặc status được kể trong chat không chứng minh trạng thái hiện tại.

Nếu không có quyền/công cụ để verify, không được đưa giá trị đó vào phần canonical current state. Chỉ được ghi riêng:

```text
UNVERIFIED REPORTS
- Reported value:
- Reporter/source:
- Reported at:
- Verification blocker:
- Required next check/owner:
```

Trong trường hợp không verify được state trọng yếu, checkpoint phải ghi `CURRENT STATE NOT VERIFIED`; không được dùng reported value để mở gate, chuyển owner, tuyên bố PASS hoặc cấp quyền.

Ghi đầy đủ khi có liên quan:

```text
Current phase/cluster
Production/main SHA
Working base SHA
Candidate HEAD SHA
Parent SHA
Branch/PR
Bundle/patch SHA-256
Changed files
Worktree status
```

Mỗi giá trị canonical phải có provenance label theo Phần 14 và fresh verification như trên. Các nhãn `OWNER-REPORTED`, `REPO-HANDOFF-REPORTED`, `NOT VERIFIED` hoặc `UNKNOWN` chỉ được đặt trong `UNVERIFIED REPORTS`, không được trộn vào canonical current state; **không được biến SHA được kể trong chat thành SHA đã verify**.

Nếu artifact hiện có trong Library/chat nhưng chưa commit vào repo, phải ghi riêng:

```text
POLICY/CONTENT RULING: trạng thái nội dung
LOCAL/LIBRARY ARTIFACT: filename + SHA-256 + provenance
REPOSITORY ARTIFACT: exact commit hoặc NOT YET CREATED
PRODUCTION ARTIFACT: exact active SHA hoặc NOT VERIFIED
```

### 16.2. Thành quả và evidence

Checkpoint phải tách:

```text
Completed: thay đổi hoặc review đã hoàn tất
Verified evidence: command/test/artifact mà chính AI đã kiểm
Not verified: báo cáo hoặc artifact chưa thể kiểm
Tests actually run: tên test/command + kết quả
Tests not run: tên + lý do
Findings opened/closed: ID + severity + trạng thái
Residual risk: điều chưa được chứng minh
```

Không được dùng CI xanh ở ancestor, test của agent khác hoặc documentation làm bằng chứng cho exact candidate/runtime hiện tại.

### 16.3. Mục tiêu và critical path

Luôn ghi một mục tiêu ngắn gọn, đo được cho cluster hiện tại và điều kiện hoàn thành:

```text
Current objective:
Exit criteria:
Current blocker:
Critical-path owner:
```

Nếu không có blocker, ghi `NONE` và giao ngay hành động tiếp theo. Nếu có blocker, vẫn phải xác định các việc an toàn có thể chạy song song để AI khác không chờ vô ích.

### 16.4. Phân công GPT1/GPT2/GPT3/GPT4/Claude

Checkpoint bắt buộc có bảng:

| AI | Trạng thái | Việc đã hoàn thành | Việc tiếp theo | Có bị chặn không? | Cần artifact/quyền gì? |
|---|---|---|---|---|---|
| GPT1 |  |  |  |  |  |
| GPT2 |  |  |  |  |  |
| GPT3 |  |  |  |  |  |
| GPT4 |  |  |  |  |  |
| Claude |  |  |  |  |  |

Không giao cùng một implementation task cho nhiều AI. Review, adversarial preparation, fixture audit và release preparation có thể chạy song song khi không sửa cùng source/contract.

### 16.5. Authorization boundary

Kết thúc checkpoint bằng trạng thái riêng của từng quyền:

```text
Push: AUTHORIZED / NOT AUTHORIZED
Merge: AUTHORIZED / NOT AUTHORIZED
Migration evidence: AUTHORIZED / NOT AUTHORIZED
Cutover/deploy: AUTHORIZED / NOT AUTHORIZED
Marketplace publish: AUTHORIZED / NOT AUTHORIZED
```

Không suy ra quyền sau từ quyền trước. `READY`, `PASS`, CI xanh hoặc Owner đồng ý review không tự cấp quyền push/merge/deploy/publish.

### 16.6. Mẫu checkpoint tối thiểu

```text
[END-OF-SESSION CHECKPOINT]
Role:
Verified at:
Verification sources/commands:
Current phase/cluster:
Current objective:
Exit criteria:
Production/main SHA + provenance:
Base/parent/candidate SHA + provenance:
Branch/PR/bundle/patch:
Changed files:
Completed:
Verified evidence:
Tests actually run:
Tests not run + reason:
Findings opened/closed:
Current blocker:
Critical-path owner:
Parallel work available:
GPT1 next:
GPT2 next:
GPT3 next:
GPT4 next:
Claude next:
Residual risk:
Worktree status:
Unverified reports + required verifier:
Push/Merge/Migration/Cutover/Publish authorization:
```

Checkpoint là trạng thái bàn giao của **phiên**, không thay thế exact-SHA handoff, defect register, test evidence hoặc release approval.

---

## PHỤ LỤC A — SỔ XUNG ĐỘT ĐÃ GIẢI

| # | Xung đột | Nguồn | Giải quyết |
|---|---|---|---|
| 1 | Vai trò Claude/GPT đảo ngược | `PROJECT_GUIDE §13` vs Multi-AI §2 | Phần 2 thắng; §13 bãi bỏ |
| 2 | Hai định dạng handoff | `PROJECT_GUIDE §21` vs Multi-AI | Text block (Phần 14); JSON bãi bỏ |
| 3 | Fixture count-based vs accounting | Multi-AI §13 vs §8 | Accounting-based (bằng chứng 19→16+3) |
| 4 | Stop-doing vs stop-condition | `PROJECT_GUIDE §17` vs Multi-AI §21 | Hai thứ khác nhau → tách §13a/§13b |
| 5 | Bốn văn bản governance | toàn bộ | Hợp nhất; ba văn bản kia bãi bỏ/hạ cấp |
| 6 | Phạm vi downstream guard | Multi-AI §11 vs `PROJECT_GUIDE §10` | ✅ **GPT1 quyết:** shared qualifying-evidence guard tại cả 7 forward transition; `publishGate` vẫn là authority tổng hợp cuối |
| 7 | Rule ngôn ngữ | `PROJECT_RULES` GR1 vs preference owner | ✅ **Owner quyết:** bỏ GR1. Hỏi tiếng nào trả lời tiếng đó |
| 8 | Kế thừa 2 toolkit | `PROJECT_RULES` GR4 | ✅ **Owner quyết:** reference ưu tiên, không phải authority → Phần 15 |

---

## PHỤ LỤC B — AUTHORITY RULINGS ĐÃ ĐÓNG

| Mục | Người quyết | Ruling |
|---|---|---|
| Phần 10 — ranh giới evidence guard | **GPT1** | Cả 7 forward transition; research guard không thay `publishGate` |
| Phần 7 — Review Risk Tier A/B/C | **GPT1** | Ratified theo bảng hiện tại |
| Phần 6 — Evidence Authority EA-A/B/C | **GPT1** | Ratified; client cannot promote; server recomputes current eligibility |

*Tất cả mục khác đã được Owner ratify ngày 2026-08-25.*

---

## PHỤ LỤC C — VIỆC ĐỂ VĂN BẢN NÀY CÓ HIỆU LỰC

| # | Việc | Owner | Trạng thái |
|---|---|---|---|
| 1 | Commit `GOLDEN_RULES.md` ở gốc repo | GPT3 | ⬜ |
| 2 | `PROJECT_RULES.md` → stub trỏ về đây | GPT3 | ⬜ |
| 3 | `PROJECT_GUIDE_*.md` → xoá §13, §21; thêm header trỏ về đây | GPT3 | ⬜ |
| 4 | `GPT1_GPT2_INTEGRATION_CHECKLIST.md` → `docs/operational/` | GPT3 | ⬜ |
| 5 | Viết 5 test `MACHINE` (Phần 11) trong H0 | GPT2 | ⬜ |
| 6 | GPT1 ruling ranh giới evidence guard (Phần 10) | GPT1 | ✅ |
| 7 | Parity review Etsy (Phần 15) | GPT1 | ⬜ |
| 8 | Parity review Amazon (Phần 15) | GPT3 | ⬜ |

**Chừng nào việc 1–4 chưa xong, bốn văn bản cũ vẫn còn hiệu lực song song — và đây chỉ là văn bản thứ năm.**

---

## CÂU KHOÁ

> Review theo exact artifact, sửa root cause thay vì vá PoC, bảo toàn mọi dữ liệu có ý nghĩa, fail-closed mọi authority, kiểm tra xuyên source→DB→reload→UI, và luôn quay lại mục tiêu tạo listing có khả năng bán hàng.

---

## PHỤ LỤC D — THỨ TỰ H0 ĐÃ RATIFY

**Provenance split:** trình tự 9 bước bên dưới là `OWNER-RATIFIED`. Các authority rules được trình tự này tham chiếu là `GPT1-RATIFIED` theo Phần 6 và Phần 10; Owner ratify trình tự không tự động đồng nghĩa Owner ratify từng authority detail.

```text
1. GPT1 ratify Review Tier + Evidence Authority hierarchy        DONE
2. Claude hợp nhất governance; không sửa production source
3. GPT2 viết H0 tests chứng minh failure
4. GPT2 implement H0 — implementation owner duy nhất
5. GPT4 adversarial review; không code vòng đầu
6. Claude independent exact-diff/test-oracle review
7. GPT1 final authority review trên exact artifact
8. GPT3 Node22/native SQLite/runtime/backup–restore/cutover gates
9. Sau H0: bổ sung machine controls trong R1–R4
```

Không bước review nào thay PASS của bước khác. Không push/merge/deploy/publish nếu chưa có quyền tương ứng.
