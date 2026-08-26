# PROJECT OPERATING GUIDE — REFERENCE ONLY

> ## ⚠️ TRẠNG THÁI VĂN BẢN
>
> **Đây KHÔNG phải golden rule.** Golden rule duy nhất: [`GOLDEN_RULES.md`](./GOLDEN_RULES.md)
>
> Văn bản Project Guide lịch sử được giữ nguyên để tham khảo business / architecture tại:
> [`docs/reference/PROJECT_GUIDE_CLAUDE_GPT_OMNI_AMZ_ETSY_BASE_5c4153b.md`](./docs/reference/PROJECT_GUIDE_CLAUDE_GPT_OMNI_AMZ_ETSY_BASE_5c4153b.md)
>
> Khi nội dung tham khảo mâu thuẫn với `GOLDEN_RULES.md`, **`GOLDEN_RULES.md` thắng**.
>
> Hai mục lịch sử sau đã **BỊ BÃI BỎ và không có authority**:
> - **§13 MULTI-AGENT WORKING MODEL** — vai trò hiện hành nằm tại `GOLDEN_RULES.md` Phần 2 và Phần 7A.
> - **§21 REQUIRED HANDOFF FORMAT** — handoff hiện hành nằm tại `GOLDEN_RULES.md` Phần 14.
>
> Bãi bỏ ngày 2026-08-25 theo quyết định của Owner.

---

## Phạm vi sử dụng

Snapshot lịch sử chỉ được dùng làm **reference ưu tiên** cho business/architecture context. Không dùng snapshot đó để:

- định nghĩa lại vai trò GPT/Claude;
- override authority contract;
- override Product Truth / publish gate;
- override exact-artifact discipline;
- override H0 execution order;
- cấp PASS, release hoặc deploy authorization.

Mọi thay đổi governance mới phải được thực hiện duy nhất trong [`GOLDEN_RULES.md`](./GOLDEN_RULES.md).
