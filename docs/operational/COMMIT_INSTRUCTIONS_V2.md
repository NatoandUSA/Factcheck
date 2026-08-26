# LỆNH ĐỂ v2.0 CÓ HIỆU LỰC

**Claude không có quyền push và không thực hiện các lệnh dưới đây.** Đây là runbook cho GPT2 / Owner.

Theo §0.1, v2.0 chỉ có hiệu lực khi nằm trong ancestry của `origin/main`. Trước khi merge, nó là artifact lớp L2 và **không được dùng để chặn merge hay mở finding**.

## 1. Đưa file vào repo

```bash
git fetch origin
git checkout -b governance/golden-rules-v2 origin/main
# copy GOLDEN_RULES.md (v2.0) vào gốc repo
sha256sum GOLDEN_RULES.md
# phải khớp: e4ff2776071a288a32e7485fd64c010283b4445707243a7e06dd0045cca3ff6c
git add GOLDEN_RULES.md
git commit -m "governance: GOLDEN_RULES v2.0 — supersedes all prior rules"
```

## 2. Bãi bỏ văn bản cũ trong cùng PR

```bash
# stub hoá
printf '# BÃI BỎ\n\nVăn bản này không còn hiệu lực.\nRule duy nhất: [GOLDEN_RULES.md](./GOLDEN_RULES.md) v2.0\n' > PROJECT_RULES.md

# PROJECT_GUIDE_*: xoá §13 và §21, thêm header trỏ về GOLDEN_RULES.md
# GPT1_GPT2_INTEGRATION_CHECKLIST.md → docs/operational/
git mv docs/GPT1_GPT2_INTEGRATION_CHECKLIST.md docs/operational/ 2>/dev/null || true

git add -A && git commit -m "governance: retire superseded rule documents"
git push -u origin governance/golden-rules-v2
```

## 3. CI check bắt buộc (§0.1, §14)

Thêm vào workflow — làm đỏ CI nếu governance rơi khỏi `main`:

```yaml
- name: Governance must be in force
  run: |
    test -f GOLDEN_RULES.md || { echo "GOLDEN_RULES.md missing"; exit 1; }
    grep -q "Version:\*\* 2\." GOLDEN_RULES.md || { echo "wrong version"; exit 1; }
```

## 4. Merge — cần Owner cấp quyền riêng

```
Push:    ⬜ AUTHORIZED / NOT AUTHORIZED
Merge:   ⬜ AUTHORIZED / NOT AUTHORIZED
```

Sau khi merge, xác minh:
```bash
git fetch origin
git cat-file -e origin/main:GOLDEN_RULES.md && echo "IN FORCE" || echo "STILL NOT IN FORCE"
```

## 5. Force mọi AI đọc

Dán `AI_ONBOARDING_PROMPT_V2.md` vào **đầu mỗi phiên** của GPT1, GPT2, GPT3, GPT4, Claude, Antigravity.
Không AI nào được bắt đầu làm việc trước khi trả lời xong 6 câu xác nhận ở cuối prompt đó.

## 6. Việc còn lại — Phụ lục C của v2.0

```
4  GPT2   viết 8 test MACHINE (§14)
6  GPT1   ratify các mục PENDING ở Phụ lục B
7  GPT1   ratify hoặc bỏ literal C-02 (§1, §8.2)
8  GPT1   gán exit criteria đo được cho 4/5 mục staff-facing (§2.2)
9  Owner  môi trường Linux/Node22 cho GPT2 (§3.5)
10 GPT4   giao adversarial artifact hoặc rời critical path (§3.4)
```
