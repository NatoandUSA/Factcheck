# Hướng dẫn Product Truth đơn giản cho nhân viên

## Mục tiêu

Không nhập một hồ sơ dài từ đầu. Cách làm mặc định là:

```text
Listing tương tự / supplier / listing cũ
        ↓ quét
Tool điền các trường chính
        ↓ staff kiểm và sửa khác biệt
Lưu STAFF_DRAFT
        ↓ manager kiểm lại
MANAGER_CONFIRMED
```

Product Truth chỉ cần đủ để viết đúng sản phẩm đang bán. Thiếu trường nào thì bổ sung ở revision sau; không chặn staff tạo draft nội bộ.

## Cách nhanh nhất: quét một listing

1. Mở `/product-truth-staff.html` và chọn đúng dự án Amazon hoặc Etsy.
2. Nhập SKU nội bộ và tên nhân viên.
3. Dán ASIN Amazon, Etsy listing ID hoặc URL đầy đủ.
4. Xác nhận listing là sản phẩm cùng supplier/cùng nguồn hàng.
5. Bấm `Quét ASIN / Etsy listing`.
6. Tool điền các thông tin đọc được như tên, category, material, color, size, weight, included items, care và personalization.
7. Staff đọc lại, sửa điểm khác với sản phẩm thật, rồi bấm `Gửi vào OmniSeller`.

Nếu Amazon/Etsy chặn việc đọc URL: mở listing trong trình duyệt, chọn **Save Page as / Lưu trang thành HTML**, rồi bấm `Upload trang HTML đã lưu`. Đây là đường dự phòng chính thức, không chặn workflow.

Quét listing chỉ tạo preview zero-write. Chỉ khi staff bấm gửi thì Product Truth revision mới được lưu.

## Listing nào được dùng?

- Listing đã đăng của công ty.
- Listing của supplier.
- Listing đối thủ hoặc bestseller khi staff biết đó là cùng supplier/cùng nguồn hàng.
- Listing cùng mẫu hàng nhưng staff phải sửa mọi variation khác: material, size, color, packaging, personalization, phụ kiện hoặc digital license.

Keyword và listing không cùng sản phẩm vẫn được dùng để học cách viết/DNA, nhưng không dùng làm fact sản phẩm.

## Các trường chính

Phiếu vật lý/custom mặc định chỉ hiện 13 trường: tên, loại, category, material, color, size, personalization, process, included items, packaging, recipient, occasion và audience.

Phiếu digital/printable hiện các trường cần cho sản phẩm số: digital details, file format, license, usage rights, player count, age, duration và language.

Chỉ `Tên sản phẩm` và `Loại sản phẩm` là tối thiểu để sinh một draft hữu ích. Có thể chọn `Hiện tất cả trường bổ sung` khi thật sự cần.

## Excel

Workbook gồm:

- `Sản phẩm`: danh sách SKU/dự án.
- `Sự thật`: 21 trường chính.
- `Bổ sung`: 35 trường chi tiết, có thể để `BỎ QUA`.
- `Hướng dẫn`: quy tắc ngắn và nguồn dữ liệu.

Sau khi điền Excel, chọn `Đọc Excel và preview`. Tool điền lại HTML để staff kiểm trước khi lưu; Excel không tự duyệt Manager và không tự đăng sàn.

## Nguồn dữ liệu

| Mã nguồn | Khi sử dụng |
|---|---|
| `SUPPLIER_SPEC` | Trang/file/thông số từ supplier |
| `OWN_LISTING_RECORD` | Listing đã đăng của công ty |
| `REFERENCE_LISTING_SAME_SOURCE` | Listing đối thủ/bestseller cùng supplier hoặc nguồn hàng, do staff xác nhận |
| `PHYSICAL_INSPECTION` | Staff kiểm tra mẫu hàng thực tế |
| `PRODUCTION_WORKFLOW` | Quy trình sản xuất đã biết |
| `RIGHTS_RECORD` | License/quyền sử dụng/IP |
| `OTHER` | Nguồn khác, ghi chú ngắn |

## Phân biệt fact và DNA

- **Fact:** sản phẩm này làm bằng gì, kích thước nào, custom ra sao, gồm những gì. Fact có thể lấy từ listing cùng nguồn hàng và được staff xác nhận.
- **DNA:** cách sắp xếp title, bullet, description, tone và cách trình bày của listing tốt. DNA có thể học từ đối thủ/bestseller rộng hơn.

Tool phải dùng cả hai nhưng không trộn chúng: DNA giúp viết hay; Product Truth giữ nội dung đúng.

## Bàn giao Manager

Staff lưu `STAFF_DRAFT`. Manager xem revision chính xác, kiểm các trường quan trọng và yêu cầu sửa hoặc xác nhận. Listing vẫn dừng ở `NEEDS_QA`; OmniSeller chưa tự submit hoặc publish lên marketplace trong phase này.
