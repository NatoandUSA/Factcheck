# AI ONBOARDING LAUNCHER — NON-AUTHORITATIVE

> File này chỉ giúp agent bắt đầu phiên làm việc. Nó không phải governance, contract,
> ruling, checklist bắt buộc hay nguồn authority độc lập.
>
> Governance duy nhất của Factcheck/OmniSeller là revision của
> [`GOLDEN_RULES.md`](./GOLDEN_RULES.md) nằm trong exact `origin/main` ancestry đang được
> review. Nếu nội dung file này khác `GOLDEN_RULES.md`, exact document trên `main` thắng.

## Khởi động phiên

```bash
git fetch origin
git rev-parse origin/main
git show origin/main:GOLDEN_RULES.md
```

Nếu không thể chạy các lệnh trên, ghi `NOT VERIFIED` và nêu blocker. Không dùng bản tóm tắt,
chat memory hoặc revision cũ thay cho document vừa đọc.

## Xác nhận ngắn

Sau khi đọc document canonical, ghi:

```text
1. Exact origin/main SHA và thời điểm verify:
2. Vai trò hiện tại và phạm vi được phép sửa:
3. Candidate/parent/base SHA đang xử lý:
4. Runtime có thể thực thi và tests chưa thể chạy:
5. Trạng thái Push/Merge/Migration/Cutover/Publish authorization:
```

Các role, authority classes, evidence requirements, review tiers, stop conditions và handoff
format không được sao chép vào file này. Luôn đọc chúng trực tiếp từ `GOLDEN_RULES.md` hiện
hành để tránh drift.
