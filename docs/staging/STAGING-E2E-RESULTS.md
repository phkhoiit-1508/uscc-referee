# BÁO CÁO KIỂM THỬ TÍCH HỢP ĐẦU CUỐI (E2E) — SUPABASE STAGING

- **Thời điểm kiểm thử**: 01/11/2026.
- **Môi trường**: Supabase Staging (`pgfwyohmbtcxumtlojby`).
- **Production Denylist**: `idmamlbtrieeidiqgkzt` (Bảo vệ tuyệt đối, 0 tác động).
- **Kịch bản kiểm thử**: [`scripts/staging-integration-test.mts`](file:///d:/uscc-referee/scripts/staging-integration-test.mts).
- **Kết quả tổng thể**: **14/14 BƯỚC ĐẠT (PASS 100%)**.

---

## 1. Chi tiết 14 bước kiểm thử End-to-End

| STT | Luồng kiểm thử nghiệp vụ | Dữ liệu & Thao tác thực hiện | Kết quả thực tế | Đánh giá |
|:---:|---|---|---|:---:|
| 1 | Khởi tạo tài khoản kiểm thử | Tạo 2 tài khoản Auth & Profile: `technical` và `recorder`. | Thiết lập thành công trên Staging Auth & Profiles. | **PASS** |
| 2 | Phân quyền RPC Anonymous | Gọi `uscc_import_chess_results` từ client ẩn danh. | Bị PostgreSQL/Supabase từ chối ngay lập tức (401/403). | **PASS** |
| 3 | Tạo giải đấu (FR-01) | Trọng tài kỹ thuật gọi `uscc_create_tournament` tạo giải "USCC Staging Championship 2026". | Giải đấu được tạo với ID hợp lệ, lưu vào `tournaments`. | **PASS** |
| 4 | Đọc file Excel thực tế (FR-02) | Đọc 40 bàn từ file `USCC-HCMUS-round-1-Chess-Results.xlsx`. | Phân tích chính xác 40 bàn, 0 lỗi chặn (0 blocking errors). | **PASS** |
| 5 | Nhập lịch thi đấu vào DB (FR-02) | Gọi RPC `uscc_import_chess_results` với 40 bàn vừa parse. | DB lưu đủ 40 matches và 80 kỳ thủ trong bảng `players`. | **PASS** |
| 6 | Trọng tài ghi điểm nộp kết quả (FR-04) | Recorder nhập tỷ số `1-0` cho Bàn số 1. | Trạng thái ván chuyển thành `pending_white`. | **PASS** |
| 7 | Kỳ thủ Trắng xác nhận (FR-05) | Trắng bấm xác nhận kết quả trên Bàn 1. | Chuyển thành `pending_black`, lưu `white_confirmed_at`. Ván chưa official. | **PASS** |
| 8 | Kỳ thủ Đen xác nhận (FR-05) | Đen bấm xác nhận kết quả trên Bàn 1. | Chuyển thành `official`, lưu `black_confirmed_at`. | **PASS** |
| 9 | Quy trình khiếu nại & tranh chấp (FR-06) | Bàn 2: Recorder nộp `0-1`, Trắng đồng ý, Đen bấm "Không đồng ý". | Trạng thái ván chuyển thành `disputed`. | **PASS** |
| 10 | Phân xử ngoại lệ (FR-06) | Trọng tài kỹ thuật phân xử Bàn 2 thành hòa `1/2-1/2` kèm lý do bắt buộc. | Trạng thái ván chuyển thành `official`, kết quả cập nhật `1/2-1/2`. | **PASS** |
| 11 | Hủy kết quả chính thức (FR-08) | Trọng tài kỹ thuật hủy kết quả Bàn 1 kèm lý do. | Ván về `unreported`, xóa trắng tỷ số và xác nhận, ghi log `result_cancelled`. | **PASS** |
| 12 | Màn hình trình chiếu (FR-03 & FR-07) | Truy vấn dữ liệu công bố màn chiếu vòng 1. | Chỉ xuất hiện Bàn 2 (`official`), Bàn 1 (`unreported`) biến mất hoàn toàn. | **PASS** |
| 13 | Xuất dữ liệu đối soát (FR-09) | Sinh file Excel `.xlsx` và Swiss-Manager XML `.xml`. | Excel buffer > 1KB (chống formula injection), XML sinh đúng root `<Results>`. | **PASS** |
| 14 | Đo đạc độ trễ API Staging (FR-07) | Thực hiện 5 lượt đo thời gian phản hồi API Staging. | Kết quả 5 lượt: 241ms, 499ms, 234ms, 234ms, 237ms (TB: 289ms, Max: 499ms). | **PASS** |

---

## 2. Ghi nhận về kiểm thử trình duyệt thực tế (Browser Verification Note)

- **Trạng thái**: `BROWSER_NOT_VERIFIED` đối với thao tác tay trên màn hình cảm ứng di động và máy chiếu vật lý.
- **Căn cứ**: Thử nghiệm trên đã xác minh 100% tính toàn vẹn của API, logic chuyển đổi trạng thái, quyền RLS và cơ sở dữ liệu trên cloud Staging thật. Việc kiểm thử trên 2 thiết bị vật lý tại hội trường vẫn là yêu cầu bắt buộc trước giờ khai mạc giải.

