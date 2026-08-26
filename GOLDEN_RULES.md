# OMNISELLER — GOLDEN RULES

**Version:** 2.0
**Thay thế:** v1.4 và **toàn bộ** rule/agreement trước đó, không có ngoại lệ.
**Soạn bởi:** Claude (architecture controller) theo yêu cầu Owner, 2026-08-26
**Base SHA đối chiếu:** `5c4153bbb03ccf9e0f02b4b90781f64819b70848`
**Áp dụng cho:** GPT1, GPT2, GPT3, GPT4, Claude, Antigravity và mọi reviewer/implementer sau này.

---

## 0. THẨM QUYỀN VÀ ĐIỀU KIỆN CÓ HIỆU LỰC

> **Đây là văn bản golden rule DUY NHẤT của OmniSeller. Mọi văn bản, thoả thuận, ruling và checklist governance trước đó bị BÃI BỎ.**

| Văn bản cũ | Trạng thái |
|---|---|
| `GOLDEN_RULES.md` v1.0 – v1.4 | ❌ **BÃI BỎ** — nội dung còn giá trị đã hợp nhất vào đây |
| `PROJECT_RULES.md` | ❌ **BÃI BỎ** — thay bằng stub trỏ về đây |
| `PROJECT_GUIDE_*.md` §13, §21 | ❌ **BÃI BỎ** |
| `PROJECT_GUIDE_*.md` phần còn lại | ⚠️ Tài liệu tham khảo business/architecture. Mâu thuẫn → văn bản này thắng |
| Multi-AI Golden Rules (21 mục) | ✅ Đã hợp nhất |
| `OMNISELLER_GOVERNANCE_V1.md`, các stub, checklist rời | ❌ **BÃI BỎ** hoặc hạ xuống `docs/operational/` |
| Mọi ruling chỉ tồn tại trong chat | ⚠️ Xem §1 — không phải contract cho tới khi vào repo |

### 0.1. RULE CAO NHẤT — GOVERNANCE CHỈ CÓ HIỆU LỰC KHI NẰM TRONG ANCESTRY CỦA `main`

> **Bằng chứng buộc phải có rule này:** tại `2026-08-26`, `GOLDEN_RULES.md` v1.4 tồn tại **duy nhất** ở governance SHA `ca18d20`. Đo bằng lệnh:
> ```
> git cat-file -e origin/main:GOLDEN_RULES.md   → NO (absent)
> git cat-file -e <PR#25-head>:GOLDEN_RULES.md  → NO (absent)
> git merge-base --is-ancestor ca18d20 origin/main → NO
> ```
> Suốt nhiều phiên, cả team review candidate theo một văn bản **không tồn tại trong cây mã của chính candidate đó**.

**Quy tắc:**

```
Văn bản governance KHÔNG nằm trong ancestry của origin/main
= KHÔNG CÓ HIỆU LỰC
= không được dùng để mở finding, chặn merge, hay ép đổi implementation
```

Mỗi phiên, trước khi trích dẫn bất kỳ rule nào, AI phải tự kiểm:
```bash
git merge-base --is-ancestor <governance-sha> origin/main && echo IN-FORCE || echo NOT-IN-FORCE
```

Nếu `NOT-IN-FORCE`: được phép **đề xuất**, không được phép **cưỡng chế**.

### 0.2. Cảnh báo tự áp cho chính văn bản này

Chừng nào v2.0 chưa được commit và merge vào `main`, **nó cũng chỉ là đề xuất**. Xem PHỤ LỤC C.

---

## 1. BA LỚP HIỆU LỰC CỦA CONTRACT — `GPT1-RATIFIED`, 2026-08-26

Trước khi dùng bất kỳ literal, error code, threshold hay contract nào để review, phải xác định nó thuộc lớp nào:

| Lớp | Trạng thái | Được dùng để làm gì |
|---|---|---|
| **L1 — Thảo luận/đồng ý trong chat** | Policy proposal, conversation ruling | Bàn bạc. **Không** mở finding, **không** ép đổi code |
| **L2 — Có trong artifact governance ngoài repo** | Governance artifact chưa repo-bound | Chuẩn bị. **Không** dùng review candidate |
| **L3 — Có trong exact commit ancestry của candidate** | Contract có hiệu lực | ✅ Được dùng review, mở finding, chặn merge |

```
Literal không tồn tại trong exact governance ancestry
→ NOT REPO-RATIFIED
→ không được tuyên bố là canonical contract
→ không được bắt implementer đổi code theo nó
```

**Không được biến code đang chạy thành RED dựa trên contract chưa repo-bound.**

> **Tiền lệ đã đóng — C-02 rename:** `GENERIC_STAFF_EVIDENCE_V1` và `UNQUALIFIED_RESEARCH_ARTIFACT` được nêu như canonical v1.4. Đo tại `ca18d20`: `UNQUALIFIED_RESEARCH_ARTIFACT` có trong `GOLDEN_RULES.md:202`; `GENERIC_STAFF_EVIDENCE_V1` có **0 occurrence**. Trong `server/` cả hai đều **0 occurrence**. GPT1 ruling: **C-02 rename PAUSED** cho tới khi có exact wording repo-ratified. Xác nhận kỹ thuật của Claude: hoãn **an toàn**, vì `server/` phát ra đúng 3 literal mà tests assert — implementation và oracle nhất quán, không có defect sống.

### 1.1. Kỷ luật quy kết — **rule mới, sinh ra từ lỗi của Claude**

> Claude đã viết *"GPT3 dựng lên một contract literal"*. Bằng chứng chỉ chứng minh **NOT REPO-RATIFIED**, không chứng minh bịa đặt. Đây đúng là lỗi mà chính Claude đang chỉ trích: khẳng định vượt bằng chứng.

```
Vắng mặt trong repo  →  chứng minh: NOT RATIFIED
Vắng mặt trong repo  →  KHÔNG chứng minh: người kia bịa
```

Không được nâng một khoảng trống provenance thành cáo buộc về động cơ. Báo cáo trạng thái, không phán xét con người.

---

## 2. MỤC TIÊU TỐI CAO

```
Nạp dữ liệu thật → bảo toàn → phân tích đúng nguồn → học DNA có kiểm soát
→ controlled draft → xác minh Product Truth/IP/economics
→ listing bán được → publish khi được phê duyệt
```

**Thứ tự ưu tiên khi xung đột:** `Revenue → Safety → Truth → Real Usage → Consolidation`

### 2.1. Governance không được trở thành sản phẩm — **RULE BẮT BUỘC**

> **Bằng chứng:** tính tới 2026-08-26, dự án có 5 AI agent, một văn bản governance ~700 dòng, tier review A/B/C, exact-SHA discipline — trong khi tool chưa chạy được cho nhân viên, còn nhân viên đang bán hàng bằng Gemini trên trình duyệt và **đã có 3 sold**.

Mỗi cluster phải kết thúc bằng **một gate được thực thi bằng máy** hoặc **một hành động doanh thu**. Không được kết thúc bằng một tài liệu chiến lược mới.

**Kiểm tra cuối mỗi cluster:**
1. Staff làm được việc gì trước đây không làm được?
2. Dữ liệu thật có được bảo toàn và dùng tốt hơn?
3. Có đường hợp lệ tới controlled draft?
4. Product Truth và publish authority còn fail-closed?
5. Có đang xây thêm dashboard/state/tài liệu không phục vụ bán hàng?

### 2.2. Năm kết quả staff-facing — critical path hiện tại

Mỗi mục phải có **exit criteria nhân viên tự kiểm được**. Mục nào chưa có exit criteria đo được thì **chưa được tính là đang làm**.

| # | Kết quả | Exit criteria mẫu | Trạng thái |
|---|---|---|---|
| 1 | Nhân viên tạo/chọn project | Tạo project mới, chọn lại sau reload, không mất | ⬜ chưa có evidence |
| 2 | Nạp research data thật, reload không mất | Nạp CSV `para mi hija` → F5 hai lần → đủ row + đủ column | ⬜ chưa có evidence |
| 3 | Evidence không thể tự phong authority | 12/12 transition edge reject non-authority, zero-write | ✅ **PASS** — `test_h0_c03_transition_authority.cjs`, exit 0 |
| 4 | Tạo draft từ dữ liệu thật | Draft sinh ra từ evidence đã persist, không fallback | ⬜ chưa có evidence |
| 5 | Không publish claim chưa verified | `publishGate` fail-closed trên listing thiếu Product Truth/IP | ⬜ chưa có evidence |

Việc nào không nằm trong 5 mục này **không được chiếm critical path**, trừ khi nó là điều kiện an toàn bắt buộc.

---

## 3. VAI TRÒ VÀ QUYỀN SỞ HỮU

| AI | Vai trò | Được sửa gì |
|---|---|---|
| **GPT1** | **Authority ratification** — Product Truth, authority contract, IP, approval, publish gate | Authority contract |
| **GPT2** | **Implementation** — backend, parser, persistence, provenance, DB/runtime | Implementation |
| **GPT3** | **Release operations** — runtime/integration certification, Node22, backup/restore, cutover/rollback, release manifest | Release artifact |
| **GPT4** | **Adversarial** — adversarial testing, data fidelity, black-box UAT | Test độc lập |
| **Claude** | **Independent executable audit** — architecture controller, challenge assumptions | **KHÔNG sửa production source** |
| **Antigravity** | **Thử việc — adversarial/test generation** | **Test độc lập. KHÔNG audit, KHÔNG certify** |

### 3.1. Hai chữ "certify" phải tách bạch — `GPT1-RATIFIED`

```
GPT1 certify  =  AUTHORITY  (contract, Product Truth, publish gate)
GPT3 certify  =  RUNTIME/RELEASE  (Node22, migration, cutover, manifest)
```

**GPT3 không được tạo authority contract hay authority finding mới.** GPT3 phát hiện runtime finding vẫn phải báo, nhưng không tự ra authority ruling.

**Vòng cấm tuyệt đối:**
```
tự tạo contract → tự dùng contract đó mở finding → tự chứng nhận remediation
```

### 3.2. Nguyên tắc chung

```
Role controls who changes what.
Role never limits who may discover a defect.
```

- Thấy lỗi ngoài phạm vi → **bắt buộc** ghi finding, chuyển đúng owner.
- **Người viết code không tự cấp final PASS cho code của mình.**
- Một implementation owner cho mỗi task. Chuyển owner phải kèm exact SHA + changed files + pending tests + known findings.
- Không reviewer nào được thay PASS của reviewer khác.

### 3.3. Antigravity — điều kiện tham gia

```
Audit / certification:              NOT ELIGIBLE
Adversarial / test generation:      ALLOWED (thử việc)
Mọi claim:                          exact SHA + command + exit code
Kết quả "10/10" cũ:                 KHÔNG được dùng làm evidence
```

> **Lý do:** bản audit Antigravity tuyên bố 10/10 đã bị Claude chứng minh sai bằng thực thi. Confident-GREEN-không-thực-thi là failure mode nguy hiểm nhất trong dự án này.

### 3.4. Reviewer im lặng không được chặn tiến độ

AI giữ vai trên critical path phải giao artifact trong **một phiên**. Không có artifact → **rời critical path**, không giữ gate.

Artifact adversarial tối thiểu:
```
adversarial matrix · exact candidate SHA · commands · exit codes
DB zero-write evidence · PASS/FAIL từng case · không sửa production source
```

### 3.5. Năng lực thực thi là điều kiện của vai trò — **rule mới**

> **Bằng chứng:** GPT2 bị chặn bởi Windows Node 24 + thiếu VS C++ cho `sqlite3`. GPT1 tự ghi "not independently rerun". Antigravity tuyên bố 10/10 không chạy. **5 agent, 1 môi trường thực thi.** Nút thắt chưa bao giờ là số lượng agent.

- Mọi implementer **phải** có môi trường chạy được `npm ci && npm test` (Linux hoặc WSL2 hoặc Docker, Node 22).
- **Báo bị chặn là hành vi ĐÚNG và được ghi nhận.** Bị chặn mà khai PASS là vi phạm nặng nhất.
- Thêm agent **không** thay thế cho việc sửa môi trường thực thi.

---

## 4. LUẬT BẰNG CHỨNG — `PASS/GREEN/DONE` — `GPT1-RATIFIED`, có hiệu lực ngay

Không AI nào được báo `PASS`, `GREEN`, `DONE`, `CLOSED` nếu thiếu bất kỳ mục nào:

```
Exact SHA
Command tái lập
Exit code
Environment/runtime (OS, Node version)
Executed / failed / unexecuted accounting
Artifact hoặc log
```

**Ngoại lệ duy nhất** — review tĩnh, phải ghi rõ:
```
STATIC REVIEW ONLY
NOT EXECUTED
```

### 4.1. Suite fail-fast phải báo 3 con số, không dùng `x/y`

> **Bằng chứng:** record `34/35 relevant files PASS` khiến người đọc hiểu chỉ còn 1 test chưa đạt. Thực tế runner là mảng hardcoded 52 entry và fail-fast (`process.exit(1)`): **34 passed / 1 failed / 17 NEVER EXECUTED**. Một stale oracle đang che 17 file, gồm `test_cross_tenant_isolation`, `test_zero_fabrication_boundary`, `test_smart_pull_hardening`, `test_evidence_health`.

```
BẮT BUỘC:  passed / failed / unexecuted
CẤM:       x/y passed
```

`unexecuted` **không phải** `passed`. File chưa chạy là **chưa biết**, không phải xanh.

### 4.2. Không mượn bằng chứng

Không dùng làm bằng chứng cho candidate hiện tại: CI xanh ở ancestor · test của agent khác · documentation · tên branch · mô tả trong chat.

**Không bao giờ chuyển báo cáo của agent khác thành xác minh của mình.**

---

## 5. EXACT-ARTIFACT DISCIPLINE

Mọi review phải khoá: `Candidate SHA` · `Parent SHA` · `Base/production SHA` · `Branch` · `Changed files` · `Worktree status`

Verdict chỉ áp dụng cho **exact SHA đã review**. Một byte đổi sau PASS → candidate mới, gate mới.

### 5.1. Head có thể di chuyển giữa lúc soạn và lúc gửi — **rule mới**

> **Bằng chứng:** trong một phiên duy nhất, PR#25 head đi `82d22c9 → 35e1134 → fbf2f65 → 936be83`. Hai ruling được ban hành khi head đã lỗi thời.

Trước khi gửi bất kỳ ruling, checkpoint hay verdict nào, AI **phải** chạy lại:
```bash
git fetch -q origin '+refs/pull/*/head:refs/remotes/pr/*'
git rev-parse origin/main refs/remotes/pr/<N>
```
và ghi `Verified at: <ISO-8601 + timezone>`.

Ruling ban hành trên head lỗi thời **không có hiệu lực** với head mới.

---

## 6. PoC → CLASS-LEVEL REMEDIATION

Một PoC chỉ chứng minh **một biểu hiện**. Sau mỗi PoC bắt buộc hỏi:

```
Class lỗi này còn ở đâu?
Có alias/route/provider/state tương tự?
Downstream consumer nào còn dùng contract cũ?
Test nào đang chứng nhận hành vi sai?
Dữ liệu cũ trong DB chịu ảnh hưởng thế nào?
```

> **Vì sao rule này tồn tại:** cùng một class "fallback bịa dữ liệu" tái xuất **4 lần** — `asinBatcher` → `keywordRanker` → `Xray/LearningBox` → `eligibility default-allow`. Mỗi lần đều vá đúng dòng được chỉ, không lần nào quét class.

### 6.1. Scope theo defect class, KHÔNG theo tên file — **rule mới**

> **Bằng chứng:** C-01 stale oracle được sửa ở `test_workflow_state_machine.test.cjs`. Cùng defect class vẫn nằm nguyên ở `test_project_scoped_evidence_workflow.test.cjs:76-77` và làm suite đỏ. Checkpoint được scope theo tên file, không theo class.

Mỗi defect phải kèm **một lệnh grep làm exit criterion**, không phải danh sách file.

```
Ví dụ C-01:  grep -rn "authority:\s*'SERVER_PROVIDER'" tests/
             → chỉ còn forged-intake case cố ý
```

Không đóng finding chỉ vì một input mẫu đã PASS.

---

## 7. GOLDEN DATA RULES

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

**Projection completeness — 8 tầng, không gộp:**
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

## 8. PROVENANCE VÀ AUTHORITY SEPARATION

> **Provenance — `GPT1-RATIFIED`, 2026-08-26.** Không gán các chi tiết này thành `OWNER-RATIFIED` nếu Owner chưa ratify riêng.

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

**Reserved authority metadata — reject-first.** Generic/client-controlled route phải trả `400 CLIENT_AUTHORITY_METADATA_FORBIDDEN` và **zero business/authority DB writes** nếu client gửi bất kỳ key nào sau đây ở bất kỳ vị trí authority-bearing nào (kể cả nested, UPPERCASE, whitespace, JSON-string):

```
kind · source · evidenceState · contentHash · authority · eligible · verified
provider · acceptanceEligibility · accepted_at · accepted_by · tier
```

Không silently strip, không spread metadata client vào top-level. Metadata non-authoritative chỉ lưu trong `clientAnnotations` sau schema/type/size/depth validation và chặn prototype-pollution keys.

Generic `/api/evidence` không được tạo MCP evidence, kể cả khi client gửi `source=MCP_RETRIEVAL`. `contentHash` phải do server tính trên canonical provider response.

**Eligibility là allowlist tường minh.** Unknown kind/provider/state → fail-closed.

### 8.1. Authority classes — phân lớp DỮ LIỆU, không phải review tier

| Class | Contract | Quyền hạn |
|---|---|---|
| **EA-A — Verified authority** | Server-controlled verification + canonical evidence + exact tenant/workspace/project/product/listingVersion binding + server-computed hash + `VERIFIED` + provenance đầy đủ | Tham gia Product Truth/publish decision; không tự động tạo `PUBLISH_READY` |
| **EA-B — Qualified research** | `SMART_PULL_ARTIFACT_V1` + server-established `MCP_RETRIEVAL` + allowlisted provider/state + server-computed hash + exact scope binding + current/untampered | Thoả qualifying-research precondition; Product Truth authority vẫn `NONE` |
| **EA-C — Unverified research** | Staff/manual, Xray/Cerebro/Etsy CSV/HTML/paste, generic evidence, client annotations, unknown/mismatched artifact | `UNVERIFIED_INPUT`, authority `NONE`, `RESEARCH_ONLY`, non-qualifying |

**Promotion rules:**
```
EA-C --client metadata/staff accept--> EA-B/EA-A      FORBIDDEN
EA-B --workflow transition--> EA-A                    FORBIDDEN
provider-controlled validated ingestion --> EA-B      ALLOWED
specialized verified Product Truth process --> EA-A   ALLOWED
unknown/mismatch/tamper --> non-qualifying            FAIL-CLOSED
```

`ACCEPTED` không tự nâng authority class. Server phải derive class và recompute eligibility theo current policy; không tin `eligible=true` đã persist từ policy cũ.

### 8.2. H0 error/zero-write contract

| Failure class | Required result |
|---|---|
| Forged/reserved authority metadata | `400 CLIENT_AUTHORITY_METADATA_FORBIDDEN` |
| Accept EA-C hoặc artifact không còn qualifying | `409` — literal chính xác **PENDING**, xem §1 |
| Forward transition thiếu current EA-B | `400 MISSING_QUALIFYING_EVIDENCE_PRECONDITION` |
| Hash/provider/scope/tamper mismatch | Fail-closed bằng code cụ thể; không generic success/fallback |

> **Ghi chú §1:** literal cho hàng 409 hiện là `UNQUALIFIED_EVIDENCE_AUTHORITY` trong `server/`, và tests assert đúng literal đó. Rename sang tên khác **PAUSED** cho tới khi GPT1 ratify exact wording vào repo. Không được mở finding trên literal hiện tại.

Mọi rejected request phải zero-write đối với evidence row/status, acceptance fields, project state, listing/version, `market_trends`, Product Truth và workflow/remediation business events. Security audit log nếu bắt buộc phải append-only, nằm ngoài authority transaction.

### 8.3. Authority hierarchy — cao xuống thấp

```
1. Server-enforced Product Truth/publish policy
2. Exact verified Product Truth + evidence/version/hash binding (EA-A)
3. Independent IP, approval, economics và scope gates
4. Provider-controlled qualifying research artifact (EA-B)
5. Persisted unverified research input (EA-C)
6. UI/client state, labels, scores và metadata — zero authority
```

**AI/model output không bao giờ thoả mãn hard gate:** exact SKU · supplier confirmation · material · dimensions · personalization limits · IP QA · owner-set price · publish approval.

---

## 9. MỘT SOURCE OF TRUTH — VÀ CẤM FAIL-OPEN-BY-DRIFT

Trước khi thêm status/score/mapping/config/readiness flag/schema field/derived state → hỏi *"truth này đã tồn tại ở đâu?"*. Reuse / derive / normalize. **Không tạo authority thứ hai.**

### 9.1. Cấm nhân bản classification map — **rule mới, P1**

> **Bằng chứng (`936be83`):** `PROJECT_TRANSITION_EDGES` trong `server/middleware/auth.js:27` là bản sao **byte-identical** của `ALLOWED_PROJECT_TRANSITIONS` trong `server/server.js:1233` — 10 state, trùng khít 100%. Nhưng middleware xử lý edge không nhận ra bằng `return next()` — **đi qua không guard**. Thêm một edge vào map ở `server.js` mà quên bản copy → authority gate im lặng không chạy. Không test nào đỏ.

```
Nhân bản một classification map (DAG, route registry, allowlist, role map)
mà default trên phần tử lạ là PASS-THROUGH
= FAIL-OPEN BY DRIFT
= CẤM trong Tier A
```

Bắt buộc chọn một:
1. **Structural** — export từ một module duy nhất, `require` ở mọi nơi dùng; hoặc
2. **Machine-enforced** — test `assert.deepStrictEqual(<copy>, <canonical>)`.

Đây là cùng bug class với 24 route không phân loại: phân loại chép tay, không có cơ chế phát hiện thành viên chưa phân loại.

### 9.2. Denylist-shaped exception trong allowlist gate

Cho phép, nhưng phải kèm **comment ràng buộc** và **assertion** chứng minh lớp phòng thủ phía sau vẫn deny. Ví dụ: SELLER chạm approval edge phải luôn nhận `403` bất kể evidence state.

---

## 10. TEST ORACLE RULE

**Test có thể sai.** Khi implementation đúng contract mới nhưng test đỏ:

1. Xác định canonical contract — **và xác định nó ở lớp L1/L2/L3 theo §1**
2. Chứng minh test oracle cũ sai
3. **Ghi rõ trong PR**
4. Sửa test theo contract
5. **Không nới implementation chỉ để giữ test xanh**

Mọi test change liên quan security/authority phải được **GPT1** review.

### 10.1. Xác định sai chỗ lỗi là vi phạm — **rule mới**

> **Bằng chứng:** finding "3 stale literals ở test 4b" ngụ ý sửa test. Đo thực tế: 3 literal nằm ở `server/` (`evidenceAuthority.js:130,131,184`, `server.js:1047,1071`), literal thay thế có **0 occurrence** trong `server/`. Tests đang assert **đúng** cái server phát ra. Sửa mỗi test sẽ biến RED thật thành **GREEN giả**.

Trước khi gọi một test là "stale oracle", **bắt buộc** chạy location map:
```bash
for L in <literal...>; do
  printf '%-34s server=%s tests=%s\n' "$L" \
    "$(grep -rn "$L" server/ | wc -l)" "$(grep -rn "$L" tests/ | wc -l)"
done
```
- Literal chỉ ở `tests/` → stale oracle, sửa test.
- Literal ở `server/` và tests khớp → **implementation mismatch**, sửa cả hai trong **một commit**, không tạo alias.

### 10.2. Test hermeticity — **rule mới, P2**

> **Bằng chứng:** `tests/test_adversarial_staff_ui_flow.cjs:107` assert `MCP pull must succeed`, đòi hỏi `https://mcp.trends.ytuong.ai/mcp` sống + `YTRENDS_API_TOKEN`. Server hành xử **đúng** — fail-closed 503, không persist. Nhưng suite mang banner *"100% EXECUTABLE ASSERTIONS"* lại làm con tin cho uptime của bên thứ ba, và test này đang che **12 file** phía sau.

```
Test trong mandatory suite KHÔNG được phụ thuộc endpoint bên thứ ba hoặc secret.
```

Bắt buộc tách:
- **Hermetic case** — assert contract fail-closed + zero-write. Chạy mọi nơi, luôn bắt buộc.
- **Live-integration case** — gate sau sự hiện diện của token; skip có ghi log, không làm đỏ suite.

Đây là **siết contract**, không phải nới: đường fail-closed mới là đường bảo vệ doanh nghiệp.

### 10.3. Runner phải accumulate, không fail-fast

Runner phải chạy hết rồi báo cáo, thay vì `process.exit(1)` ở lỗi đầu tiên. Một test phụ thuộc mạng không được che 12 test khác.

### 10.4. Runner completeness phải machine-enforced

> **Bằng chứng:** runner là mảng hardcoded 52 entry. Có 1 entry trỏ tới file không tồn tại (`test_legacy_migration_integrity.cjs` vs `.test.cjs` — đã sửa tại `fbf2f65`), và 2 file trên đĩa **không bao giờ được enumerate**.

Bắt buộc có test: mọi `tests/*.cjs` (trừ chính runner) phải có mặt trong danh sách, và mọi entry phải tồn tại trên đĩa.

### 10.5. Real-data fixtures — accounting-based, KHÔNG count-based

Mỗi source quan trọng phải có sanitized golden fixture từ **file thật**. Fixture do implementation tự tạo **không đủ**.

> **Không dùng số đếm làm acceptance criteria.** Xray 19 ASIN tại `5c4153b` → **16 clean + 3 rejected có lý do** (dưới sàn $9.99, trên trần $99.99, negative keyword). Đó là hành vi **đúng**. Fixture assert "19 phải sống sót" sẽ ép bỏ filter hợp lệ.

```
input=19 → validUnique=16 + rejected=3 (mỗi cái có reason) → silentLoss=0
unmappedColumns=[...]
```

**Full suite PASS chỉ chứng minh suite hiện tại PASS.**

---

## 11. ISOLATION

Mọi API/DB operation phải bind: `tenant + workspace + marketplace + project + artifact/source identity`

Bắt buộc test: wrong tenant · wrong workspace · wrong marketplace · wrong project · stale project sau workspace switch · client-forged project/source · reload sau khi đổi project.

Amazon project không được render Etsy state và ngược lại. Cross-scope trả **404 non-enumerating** (không phải 403) và **zero-write**.

---

## 12. STATE-MACHINE INTEGRITY

> **Provenance — `GPT1-RATIFIED`.** Shared qualifying-evidence guard áp dụng tại mọi forward transition. Guard chỉ chứng minh research foundation; không thay Product Truth, IP, economics, approval/version/hash, scope hoặc final `publishGate`.

Mỗi transition **recompute preconditions server-side**. Không dựa vào: UI state · số lượng row đơn thuần · project đã từng vượt gate · client metadata · legacy accepted state.

```
EVIDENCE_INTAKE → RESEARCH_ACCEPTED → DNA_ACCEPTED → MKL_FROZEN
→ DRAFT_GENERATED / PRODUCT_TRUTH_VERIFIED / PRODUCT_TRUTH_CONFIRMED
→ VALIDATED → MANAGER_APPROVED → PUBLISH_READY
```

Guard phải query đúng tenant/workspace/marketplace/project, yêu cầu ít nhất một row `ACCEPTED` **hiện vẫn đạt EA-B**, tái xác minh hash/tamper/revocation/supersession và reject **trước mọi mutation**.

> **`COUNT(*) WHERE evidence_state='ACCEPTED'` KHÔNG phải guard.** Row-state không phải authority. Đó là `PERSISTED ≠ ELIGIBLE` viết thành code. Bằng chứng: `DNA_ACCEPTED` tại `server.js:1300` từng trông như được guard nhưng chỉ đếm row — đã đóng tại `936be83`.

Đây là research-foundation precondition, **không phải authority thứ hai thay `publishGate`**. Tại `MANAGER_APPROVED`/`PUBLISH_READY` vẫn phải kiểm riêng EA-A Product Truth, IP `CLEARED`, approval/version/hash, economics và scope.

**Cấm:** React component quyết định publish readiness · duplicate `if` chain ở nhiều view · UI-only hard gate · hidden fallback ID · default fake data để màn hình có dữ liệu.

Project lịch sử đã vượt gate bằng evidence không hợp lệ: audit read-only + quarantine report trước; **không tự sửa DB**.

---

## 13. REVIEW LAYERS VÀ RISK TIERING

**Full layer stack:**
```
Architecture review → implementation self-check → independent data/adversarial review
→ authority review → runtime/integration certification → exact-SHA CI → real UAT → release decision
```

`GPT1 PASS authority ≠ GPT2 PASS runtime ≠ GPT4 PASS data fidelity ≠ GPT3 PASS integration`

| Review tier | Phạm vi | Lớp review |
|---|---|---|
| **A** | Authority · Product Truth · publish gate · eligibility · IP · economics · state machine · migration | Đủ 8 lớp |
| **B** | Parser · persistence · provenance · API contract · isolation | Architecture + implementation + adversarial + authority + CI |
| **C** | UI/copy/cosmetic · terminology · docs · non-authority test | Implementation + một independent review + CI |

**Không nhầm lẫn:** Tier A/B/C phân loại **mức rủi ro của thay đổi**. EA-A/B/C phân loại **authority của dữ liệu**. Hai hệ độc lập.

---

## 14. MACHINE-ENFORCED vs HUMAN-DISCIPLINE

> Mục quan trọng nhất.

`PROJECT_GUIDE §17` đã cấm *"treat missing data as zero"* **từ trước mọi audit**. Rule đó không chặn được lần nào trong 4 lần tái phát. Thứ chặn được, chỉ có một: **route registry test làm đỏ CI**.

**Rule không fail được CI thì dưới áp lực sẽ bị bỏ, và không đoán trước được mục nào bị bỏ.**

| Mục | Nhãn | Cơ chế thực thi |
|---|---|---|
| §7 golden data | `MACHINE` | quét `\|\| '<literal>'` ở field business; assert `input = clean + rejected` |
| §7 projection | `MACHINE` | assert `unmappedColumns` được trả về ở mọi rich-source parser |
| §8 authority | `MACHINE` | assert client metadata không lên top-level; assert default `eligible:false` |
| §9.1 no-drift | `MACHINE` | `assert.deepStrictEqual` mọi classification map nhân bản |
| §10.4 runner completeness | `MACHINE` | assert danh sách runner ≡ `tests/*.cjs` trên đĩa |
| §11 isolation | `MACHINE` | mở rộng route registry test sang tenant/workspace/marketplace/project |
| §12 state machine | `MACHINE` | assert mọi forward transition gọi shared guard; publish transitions vẫn gọi `publishGate` |
| §0.1 governance in-force | `MACHINE` | CI assert `GOLDEN_RULES.md` tồn tại ở `origin/main` |
| §4 evidence rule | `HUMAN` | — |
| §1 ba lớp contract | `HUMAN` (GPT1 ruling bắt buộc) | — |
| §5 exact-artifact | `HUMAN` | — |
| §6 class remediation | `HUMAN` | — |
| §13 tiering | `HUMAN` | — |

**Tám test `MACHINE` bảo vệ nhiều hơn toàn bộ văn bản này.**

---

## 15. RELEASE SAFETY

**Release-ready ≠ được phép deploy.** Tách riêng 5 quyền:
```
Push · Merge · Migration evidence · Cutover · Marketplace publish
```

Không suy ra quyền sau từ quyền trước. `READY`, `PASS`, CI xanh hoặc Owner đồng ý review **không** tự cấp quyền.

Cutover cần: exact source + runbook SHA · fresh migration evidence · **backup–restore rehearsal thật** · pre-stop gates · rollback fail-closed · post-cutover health · revision binding · monitoring.

> ⚠️ **`tests/test_backup_restore_and_migrations.cjs` KHÔNG phải rehearsal.** Nó chỉ test `VACUUM INTO` của SQLite và `fs.copyFileSync`, **không import một dòng backup code nào của ứng dụng**. Rehearsal phải là restore thật vào instance sạch rồi chạy smoke.

Marketplace publish luôn là gate riêng theo từng listing/version.

### 15.1. Ràng buộc vận hành do Owner đặt — bất di bất dịch

```
KHÔNG kết nối automation trực tiếp vào Amazon Seller Central
KHÔNG kết nối automation trực tiếp vào OTA account (Booking/Airbnb/Agoda)
KHÔNG auto-publish lên marketplace
Mọi hành động phải có staff review thủ công trước khi thực hiện
KHÔNG dùng npm audit fix --force
```

---

## 16. STOP CONDITIONS

### 16a. Dừng implementation ngay khi
Base/SHA/branch không rõ · worktree có thay đổi lạ · finding authority chưa có GPT1 ruling · parser mất row/field không giải thích được · test oracle mâu thuẫn contract · production state khác assumption · chưa hiểu migration/reload behavior · fix vượt phạm vi cluster · reviewer phát hiện systemic regression · **contract đang dựa vào chỉ ở lớp L1/L2 (§1)**.

**Dừng không phải thất bại; đó là fail-closed engineering.**

### 16b. Không bao giờ làm
Xây SaaS platform · universal Amazon/Etsy mega-schema · auto-publish · duplicate H10/YTuong research engine · để UI tự tính readiness · treat missing data as zero · treat modeled price as owner-set price · tin UI freshness không provenance · `npm audit fix --force` · sửa lén frozen scoring/gating logic · nhận "DONE" không bằng chứng · **nhân bản classification map fail-open** · **quy kết động cơ từ khoảng trống provenance** · tạo thêm strategy document mà không kết thúc bằng một gate được thực thi hoặc hành động doanh thu.

---

## 17. HANDOFF — MỘT ĐỊNH DẠNG DUY NHẤT

```
Role:
Verified at (ISO-8601 + timezone):
Verification commands:
Candidate SHA:
Parent SHA:
Base SHA:
Branch:
Scope reviewed/implemented:
Changed files:
Findings opened:
Findings closed:
Tests actually run (name + exit code):
Tests not run + reason:
Suite accounting (passed / failed / unexecuted):
Real-data fixture results:
Authority impact:
Production impact:
Worktree status:
Recommended next owner/action:
Push/Merge/Migration/Cutover/Publish authorization status:
```

**Nhãn provenance bắt buộc:**
```
GPT-LIVE-VERIFIED · CLAUDE-LIVE-VERIFIED · USER-SSH-VERIFIED · OWNER-REPORTED
REPO-HANDOFF-REPORTED · NOT VERIFIED · NOT EXECUTED
NOT EXECUTABLE IN THIS ENVIRONMENT · PENDING
```

> `NOT EXECUTABLE IN THIS ENVIRONMENT` là nhãn **mới**, bắt buộc dùng khi test không chạy được vì thiếu secret/network — **không được** ghi thành `FAIL`, cũng không được ghi thành `PASS`.

### 17.1. Defect closure contract
`Finding ID` · `Severity P0-P3` · `Before` · `Root cause (tầng hệ thống)` · `Affected paths` · `Remediation (tổng thể)` · `Grep exit criterion` · `Regression tests (targeted + adversarial)` · `Real-data result (expected/actual)` · `Residual risk` · `Verdict`

Không gọi cluster PASS nếu còn finding chưa đóng.

### 17.2. Nghĩa vụ tự đính chính

AI phát hiện mình báo cáo sai **phải** tự công bố ngay trong phiên, nêu rõ phương pháp sai và kết quả đúng. Tự đính chính được ghi nhận, không bị phạt. Giấu lỗi đo lường là vi phạm nặng.

> Tiền lệ: Claude báo C-03 là 3/7 do `awk` range tràn block; đo lại bằng segment-cut ra 1/8. Claude báo ipGuard regression, retest cô lập chứng minh false positive. Cả hai đã công bố.

---

## 18. KẾ THỪA TỪ TOOLKIT CÓ TRƯỚC

```
D:\Claude\22etsy-agent    — Etsy domain (Python / FastAPI / PostgreSQL)
D:\Claude\Amazon          — AMZ FBM Toolkit
```

**Trạng thái: reference ưu tiên — KHÔNG phải nguồn duy nhất, KHÔNG phải authority.**

- Trước khi xây mới business rule domain Etsy/Amazon → **phải xem** hai repo này trước.
- Lệch thì **phải ghi rõ lý do** trong PR.
- **Không** override Golden Rules, Product Truth contract, hay publish gate.
- Kế thừa là **port logic**, không phải copy code (Python/PostgreSQL → Node/SQLite).

| Repo | Owner | Phạm vi giới hạn |
|---|---|---|
| `22etsy-agent` | **GPT1** | publish gate thresholds · 13 tags · Etsy Master Keyword rules · Product Truth facts · Owner Check · owner-set price · Day-3/Day-7 learning |
| `Amazon` | **GPT3** | Xray/Cerebro semantics · keyword allocation · title/bullet rules · 249-byte search terms · IP Guard · compliance · PPC launch logic |

**Trạng thái: `NOT VERIFIED`.** Bằng chứng kế thừa duy nhất tại `5c4153b`: `server/publishGate.js:2` và `:268`.

---

## 19. END-OF-SESSION CHECKPOINT — BẮT BUỘC

Mọi SHA và trạng thái trình bày như **hiện tại** phải được chính AI viết checkpoint kiểm lại **ngay trước khi gửi** (§5.1). Không copy từ checkpoint trước, chat, memory hay báo cáo của agent khác.

Không verify được → không đưa vào canonical state. Ghi riêng:
```
UNVERIFIED REPORTS
- Reported value / Reporter / Reported at / Verification blocker / Required next check
```

### Mẫu tối thiểu

```text
[END-OF-SESSION CHECKPOINT]
Role:
Verified at:
Verification commands:
Current phase/cluster:
Current objective:
Exit criteria:
Production/main SHA + provenance:
Base/parent/candidate SHA + provenance:
Branch/PR:
Changed files:
Completed:
Verified evidence (command + exit code):
Suite accounting (passed / failed / unexecuted):
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
Antigravity next:
Residual risk:
Worktree status:
Unverified reports + required verifier:
Push/Merge/Migration/Cutover/Publish authorization:
```

---

## PHỤ LỤC A — SỔ XUNG ĐỘT ĐÃ GIẢI

| # | Xung đột | Giải quyết |
|---|---|---|
| 1 | Vai trò Claude/GPT đảo ngược | §3 thắng; `PROJECT_GUIDE §13` bãi bỏ |
| 2 | Hai định dạng handoff | Text block (§17); JSON bãi bỏ |
| 3 | Fixture count-based vs accounting | Accounting-based (19→16+3) |
| 4 | Stop-doing vs stop-condition | Tách §16a/§16b |
| 5 | Nhiều văn bản governance song song | Hợp nhất vào v2.0; tất cả bãi bỏ |
| 6 | Phạm vi downstream guard | ✅ **GPT1:** shared guard mọi forward transition; `publishGate` vẫn là authority cuối |
| 7 | Rule ngôn ngữ | ✅ **Owner:** hỏi tiếng nào trả lời tiếng đó |
| 8 | Kế thừa 2 toolkit | ✅ **Owner:** reference ưu tiên, không phải authority |
| 9 | `GENERIC_STAFF_EVIDENCE_V1` canonical hay không | ✅ **GPT1:** `NOT REPO-RATIFIED`; C-02 rename PAUSED |
| 10 | Có cắt GPT3 không | ✅ **GPT1:** không cắt; tách authority ratification (GPT1) khỏi release certification (GPT3) |
| 11 | Cơ cấu 4 GPT + 1 Claude, có thay bằng 3 không | ✅ **GPT1:** giữ 4 chức năng; Antigravity chỉ thử việc adversarial |
| 12 | "34/35 passed" | ✅ **GPT1:** sai; bắt buộc `passed/failed/unexecuted` (§4.1) |

---

## PHỤ LỤC B — AUTHORITY RULINGS ĐÃ ĐÓNG

| Mục | Người quyết | Ruling |
|---|---|---|
| §12 ranh giới evidence guard | **GPT1** | Mọi forward transition; research guard không thay `publishGate` |
| §13 Review Risk Tier A/B/C | **GPT1** | Ratified |
| §8 Evidence Authority EA-A/B/C | **GPT1** | Ratified; client cannot promote; server recomputes |
| §1 Ba lớp hiệu lực contract | **GPT1** | Ratified 2026-08-26 |
| §4 Luật bằng chứng PASS/GREEN/DONE | **GPT1** | Có hiệu lực ngay |
| §3.1 Tách hai chữ "certify" | **GPT1** | GPT3 không tạo authority contract |
| §3.3 Antigravity | **GPT1** | Không audit/certify |

**Mục sau là ĐỀ XUẤT MỚI của Claude trong v2.0, `PENDING` GPT1/Owner ratify:**
§0.1 governance-in-force · §1.1 kỷ luật quy kết · §2.1 governance ≠ sản phẩm · §2.2 năm kết quả staff-facing · §3.5 năng lực thực thi · §5.1 head di chuyển · §6.1 scope theo class · §9.1 cấm fail-open-by-drift · §10.1 location map · §10.2 hermeticity · §10.3 accumulate · §10.4 runner completeness · §17.2 tự đính chính

---

## PHỤ LỤC C — VIỆC ĐỂ VĂN BẢN NÀY CÓ HIỆU LỰC

> **Chừng nào việc 1–2 chưa xong, v2.0 KHÔNG CÓ HIỆU LỰC (§0.1) — nó chỉ là artifact lớp L2.**

| # | Việc | Owner | Trạng thái |
|---|---|---|---|
| 1 | Commit `GOLDEN_RULES.md` v2.0 ở gốc repo | GPT2 | ⬜ |
| 2 | **Merge vào `origin/main`** — điều kiện tiên quyết | Owner authorize | ⬜ |
| 3 | Xoá/stub toàn bộ governance cũ; `PROJECT_GUIDE_*` xoá §13, §21 | GPT2 | ⬜ |
| 4 | Viết 8 test `MACHINE` (§14) | GPT2 | ⬜ |
| 5 | CI check: `GOLDEN_RULES.md` tồn tại ở `main` (§0.1) | GPT2 | ⬜ |
| 6 | GPT1 ratify các mục `PENDING` ở Phụ lục B | GPT1 | ⬜ |
| 7 | GPT1 ratify hoặc bỏ literal C-02 (§1, §8.2) | GPT1 | ⬜ |
| 8 | Gán exit criteria đo được cho 4/5 mục còn lại (§2.2) | GPT1 | ⬜ |
| 9 | Môi trường Linux/Node22 cho GPT2 (§3.5) | Owner | ⬜ |
| 10 | GPT4 giao adversarial artifact hoặc rời critical path (§3.4) | GPT4 | ⬜ |
| 11 | Parity review Etsy / Amazon (§18) | GPT1 / GPT3 | ⬜ |

---

## PHỤ LỤC D — DEFECT REGISTER ĐANG MỞ

| ID | Sev | Mô tả | Owner | Trạng thái |
|---|---|---|---|---|
| F-02 | P1 | 3 literal authority nằm ở `server/`, không chỉ ở tests | GPT1 ratify trước | **PAUSED** (§1) |
| F-03 | P1 | `GOLDEN_RULES.md` không nằm trong ancestry của `main` | GPT2 + Owner | ⬜ → §0.1 |
| F-04 | P2 | `test_adversarial_staff_ui_flow.cjs` phụ thuộc MCP sống + secret; che 12 file | GPT2 | ⬜ → §10.2 |
| F-05 | P3 | Runner hardcoded; 2 file test không được enumerate | GPT2 | ⬜ → §10.4 |
| F-06 | P1 | `PROJECT_TRANSITION_EDGES` nhân bản `ALLOWED_PROJECT_TRANSITIONS`, fail-open by drift | GPT2 | ⬜ → §9.1 |
| F-07 | P3 | Role `ADMIN` không tồn tại trong schema nhưng có trong 2 role check | GPT2 | ⬜ |
| E-02, E-06, E-07 | P1 | Etsy defect register | GPT1 (Etsy) | ⬜ |
| E-01 | P2 | Etsy defect register | GPT1 (Etsy) | ⬜ |
| E-04, E-05 | P3 | Etsy defect register | GPT1 (Etsy) | ⬜ |

**Đã đóng:** C-01 (stale oracle, 2 file) · C-03 (1/8 → 12/12 transition edges) · H0-AUTH-01 (zero-write) · SSRF · 24 unauthenticated routes · 4 fabrication sites · publishGate financial floors · cross-tenant isolation · project-scoped evidence · eligibility default-allow

---

## CÂU KHOÁ

> Review theo exact artifact và exact contract đã vào repo. Sửa root cause thay vì vá PoC.
> Bảo toàn mọi dữ liệu có ý nghĩa. Fail-closed mọi authority. Không nhân bản source of truth.
> Không báo PASS mà không có exit code. Không quy kết vượt bằng chứng.
> Và luôn quay lại mục tiêu duy nhất: giúp nhân viên tạo ra listing bán được.
