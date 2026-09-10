# Hướng dẫn nhập Product Truth cho nhân viên

## 1. Product Truth là gì?

Product Truth là tập hợp những thông tin đúng về sản phẩm mà nhân viên đã kiểm tra từ nguồn cụ thể. Keyword, listing đối thủ, nội dung AI và hình ảnh do AI tạo không phải là nguồn xác minh Product Truth.

Mỗi thông tin phải ở một trong ba trạng thái:

- `KHẲNG ĐỊNH`: đã kiểm tra được giá trị và có nguồn xác minh.
- `CHƯA RÕ`: chưa xác định được; phải ghi lý do.
- `BỎ QUA`: trường không áp dụng hoặc chưa cần nhập vào phiếu này.

Phiếu do nhân viên gửi vào OmniSeller luôn có trạng thái `STAFF_DRAFT`. Manager phải kiểm tra lại; nhân viên không thể tự xác nhận thay Manager.

## 2. Nhập trực tiếp bằng HTML

Sau khi ứng dụng được build/chạy, mở:

```text
/product-truth-staff.html
```

Quy trình:

1. Đăng nhập OmniSeller bằng tài khoản nhân viên.
2. Chọn đúng workspace Amazon hoặc Etsy trước khi mở biểu mẫu.
3. Chọn đúng dự án trong danh sách.
4. Nhập mã sản phẩm/SKU và họ tên người nhập.
5. Với từng trường, chọn `KHẲNG ĐỊNH`, `CHƯA RÕ` hoặc `BỎ QUA`.
6. Nếu khẳng định, nhập giá trị, nguồn xác minh và ghi chú nguồn.
7. Nếu chưa rõ, ghi lý do cụ thể.
8. Tải JSON/CSV để lưu hồ sơ hoặc bấm `Gửi vào OmniSeller`.
9. Kiểm tra thông báo có Product Truth revision mới và trạng thái `STAFF_DRAFT`.

Biểu mẫu hỗ trợ lưu tạm trong trình duyệt, mở lại bản lưu, nhập JSON, xuất JSON canonical và CSV chuẩn hóa. Dữ liệu lưu tạm chỉ nằm trên trình duyệt đang sử dụng.

## 3. Nhập hàng loạt bằng Excel

Workbook có ba sheet:

- `Sản phẩm`: một dòng cho mỗi SKU/dự án.
- `Sự thật`: một dòng cho mỗi trường Product Truth; liên kết bằng `Mã sản phẩm`.
- `Hướng dẫn`: quy tắc nhập và danh sách nguồn xác minh.

Trong sheet `Sự thật`:

- Chọn `KHẲNG ĐỊNH` thì cột `Giá trị` và `Nguồn xác minh` bắt buộc phải có.
- Chọn `CHƯA RÕ` thì cột `Lý do chưa rõ` bắt buộc phải có.
- Chọn `BỎ QUA` thì không tạo fact khi import.
- Không thay đổi `Mã trường canonical`.

Để đưa Excel vào OmniSeller:

1. Mở form HTML và chọn đúng dự án.
2. Nếu workbook có nhiều mã sản phẩm, nhập chính xác `Mã sản phẩm/SKU nội bộ` cần xử lý. Nếu workbook chỉ có một mã, có thể để trống.
3. Bấm `Đọc Excel và preview`, rồi chọn file `.xlsx`.
4. Kiểm tra số dòng khẳng định, chưa rõ và bỏ qua. Dữ liệu mới chỉ được điền lên form; chưa ghi database.
5. Đọc lại từng fact trên form. Sau khi đúng mới bấm `Gửi vào OmniSeller`.

Excel import không tự duyệt Manager, không tạo listing và không đăng lên sàn. Công thức trong vùng dữ liệu Product Truth bị từ chối để tránh giá trị tính toán hoặc nội dung nguy hiểm đi vào fact.

## 4. Nguồn xác minh hợp lệ

| Mã nguồn | Khi sử dụng |
|---|---|
| `SUPPLIER_SPEC` | Thông số chính thức từ nhà cung cấp |
| `PHYSICAL_INSPECTION` | Nhân viên kiểm tra sản phẩm/mẫu thực tế |
| `PRODUCTION_WORKFLOW` | Quy trình sản xuất đã xác nhận |
| `RIGHTS_RECORD` | Hồ sơ quyền sử dụng, license hoặc IP |
| `OTHER` | Nguồn khác; phải giải thích rõ trong ghi chú |

## 5. Những thông tin tuyệt đối không được đoán

- Vật liệu, độ tinh khiết, lớp mạ, đá và thành phần.
- Kích thước, khối lượng, số lượng và vật phẩm đi kèm.
- Phương pháp cá nhân hóa như khắc laser, thêu hoặc dập nổi.
- Đóng gói, hộp quà, phụ kiện và nơi sản xuất/gửi hàng.
- Thời gian xử lý, giao hàng, rating, bestseller và chứng nhận.
- File, license, số người chơi, độ tuổi và thời lượng của sản phẩm số.

Nếu thiếu, chọn `CHƯA RÕ`. Tool vẫn giữ được draft nội bộ nhưng sẽ chặn claim hoặc prompt ảnh cần thông tin đó.

## 6. Kiểm tra trước khi bàn giao Manager

- Đúng workspace, marketplace, dự án và SKU.
- Có `Tên sản phẩm` và `Loại sản phẩm` đã xác minh.
- Mọi trường `KHẲNG ĐỊNH` đều có giá trị và nguồn.
- Mọi trường `CHƯA RÕ` đều có lý do.
- Không lấy keyword hoặc nội dung đối thủ làm nguồn xác minh.
- Không dùng AI để tự điền fact còn thiếu.
- JSON/CSV đã được lưu cùng mã sản phẩm và ngày nhập.

Manager phải kiểm tra revision và hash chính xác trong OmniSeller. Không xác nhận dựa trên ảnh chụp hoặc nội dung copy riêng lẻ.
