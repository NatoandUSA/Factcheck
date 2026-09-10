# OmniSeller R3 G4 — Staff and Manager UAT runbook

## 1. Authorized boundary

Run Amazon US and Etsy US through saved draft status `NEEDS_QA`. Do not merge, deploy, publish, submit to a marketplace, or mark a policy contract approved during this UAT.

## 2. Roles

| Role | Required action | Prohibited action in this UAT |
|---|---|---|
| Seller | Select workspace, create project, import, enter Product Truth, analyze, edit, save `NEEDS_QA` | Manager approval, policy attestation, marketplace submission |
| Manager | Open exact review package, compare facts/claims/accounting, request changes | Invent facts, approve while policy gate is blocked |
| Owner | Observe evidence and decide later whether release gates may proceed | Treat a test result as policy evidence |

## 3. Product Truth — quét trước, sửa sau

Nhân viên sử dụng form `/product-truth-staff.html`. Luồng mặc định: quét một ASIN/Etsy listing hoặc upload trang HTML đã lưu, để tool điền các trường chính, rồi staff sửa khác biệt. Workbook `OMNISELLER_PRODUCT_TRUTH_STAFF_TEMPLATE_VI.xlsx` là lựa chọn nhập hàng loạt. Mọi import đều preview zero-write trước khi tạo revision.

Listing đối thủ/bestseller được dùng làm nguồn fact khi staff xác nhận đó là sản phẩm cùng supplier/cùng nguồn hàng. Listing khác sản phẩm chỉ dùng để học DNA. Trường tùy chọn có thể bỏ qua và bổ sung ở revision sau.

| Thông tin chính | Giá trị quét/nhân viên sửa | Nguồn | Manager đã kiểm |
|---|---|---|---|
| Product name/type/category |  |  |  |
| Materials/colors/sizes |  |  |  |
| Personalization/process |  |  |  |
| Included items/packaging |  |  |  |
| Recipient/occasion/audience |  |  |  |
| Digital file/license/usage (nếu áp dụng) |  |  |  |

Staff phải sửa các thuộc tính khác variation. Rating, bestseller và tốc độ giao hàng của listing tham chiếu không trở thành fact của sản phẩm mới.

## 4. Amazon US scenario

Use the supplied `Cerebro_Hija.xlsx` and `Xray_Hija.xlsx`.

1. Sign in as Seller and select the Amazon workspace.
2. Create a Jewelry project with seed `para mi hija`, locale `es-US`, and the canonical custom-necklace classification.
3. Preview Cerebro; record file name, SHA-256, rows, unmapped/unconsumed counts. Confirm only if the preview is complete.
4. Repeat for Xray.
5. Select both immutable imports and lock the Research Snapshot. Record its ID/hash.
6. Enter Product Truth using the worksheet and save a revision. Record revision ID/hash.
7. Leave listing language at AUTO. Preview intelligence, then lock it. Expected language: `ES`.
8. Verify the accounting equation has zero unallocated keywords.
9. Inspect at least one entry in every non-zero route: copy-safe, claim/PPC, other-language/PPC, competitor-brand blocked, lexical review, and IP blocked.
10. Generate the draft and inspect title, five bullets, Generic Keywords, description, Item Highlights, A+ points, PPC list, and all eight image slots.
11. Edit a harmless text field, save `NEEDS_QA`, reload the browser, and prove the edit persists.

Amazon pass criteria:

- Title <=75 characters.
- Every Item Highlight <=125 characters.
- Generic Keywords <=249 UTF-8 bytes and do not duplicate finalized visible-copy tokens.
- Five bullets are present or explicitly marked incomplete without invented facts.
- No competitor/IP/unverified attribute claim appears in visible copy.
- All source keywords are accounted for exactly once at the terminal routing layer.
- Eight image slots exist; blocked slots name the missing Product Truth.
- Saved status is exactly `NEEDS_QA` after reload.

## 5. Etsy US scenario

Use all three supplied `para_mi_hija_search_*.csv` files.

1. Sign in as Seller and switch to the Etsy workspace. Confirm the role remains Seller.
2. Create the equivalent Jewelry project with seed `para mi hija`, locale `es-US`, and canonical classification.
3. Preview and confirm each CSV separately. Record all three hashes and row counts.
4. Lock one Research Snapshot containing all three imports.
5. Enter the same verified Product Truth and save a revision.
6. Leave language at AUTO. Preview and lock intelligence. Expected language: `ES`.
7. Verify zero corpus accounting gap; inspect claim, IP, irrelevant, other-language, competitor-shop, and safe-but-unused queues.
8. Inspect title, 13 tags, description, Item Highlights, category, and all eight image slots.
9. Edit a harmless field, save `NEEDS_QA`, reload, and prove persistence.

Etsy pass criteria:

- Title <=140 characters and is clear rather than keyword-stuffed.
- Exactly 13 distinct tags when the safe corpus permits; every tag <=20 characters.
- No competitor shop, IP term, wrong product noun, wrong recipient, or unverified attribute enters visible copy.
- Every normalized candidate has one terminal disposition and the accounting gap is zero.
- Etsy labels do not claim that blocked phrases route to PPC.
- Eight image slots exist and missing visual facts remain visibly blocked.
- Saved status is exactly `NEEDS_QA` after reload.

## 6. Manager review

Manager must open the exact package rather than review a copied excerpt. Record:

- listing revision ID and content hash;
- dependency-manifest hash;
- Product Truth revision/hash;
- Research and Intelligence snapshot IDs/hashes;
- every requested correction and its reason.

Expected policy behavior for this phase: approval remains blocked by `POLICY_CONTRACT_DRAFT_ONLY`. Manager may issue `CHANGES_REQUESTED`; a successful approval while that blocker exists is a test failure.

## 7. Evidence package and verdict

For each marketplace, attach:

- screenshots of workspace/project identity, import previews, accounting, draft, prompt readiness, saved `NEEDS_QA`, and reloaded persistence;
- raw hashes and immutable snapshot/revision IDs;
- exported internal TXT/JSON if the UI offers it, but never treat that export as marketplace submission;
- a defect table with severity, reproduction, expected/actual behavior, owner, and retest status.

Final UAT verdict must be exactly one of:

- `PASS FOR NEXT RELEASE GATE` — no open P1/P2 and all criteria satisfied;
- `CHANGES REQUIRED` — defects are reproducible and assigned;
- `BLOCKED` — required system/input evidence is unavailable.

No partial result may be reported as production-ready.
