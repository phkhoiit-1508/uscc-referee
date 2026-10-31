# BÁO CÁO SMOKE TEST 7 KỊCH BẢN — SUPABASE STAGING

- **Thời điểm kiểm tra**: 01/11/2026.
- **Môi trường**: Supabase Staging (`pgfwyohmbtcxumtlojby`).
- **File kịch bản**: [`supabase/diagnostics/swiss-manager-integration-smoke-test.sql`](file:///d:/uscc-referee/supabase/diagnostics/swiss-manager-integration-smoke-test.sql).
- **Trạng thái thực thi**: **THÀNH CÔNG (Exit code 0)**.

---

## 1. Kết quả kiểm thử từng Scenario

| STT | Kịch bản kiểm thử | Mô tả chi tiết & Assertion | Kết quả |
|:---:|---|---|:---:|
| **Scenario 1** | Nhập vòng đấu lần đầu | Nhập 2 bàn với mã SNo (1 và 41), bàn 2 là Bye (`isBye: true`, `result_kind: 'bye'`). Xác nhận lưu đúng `source_id_type = 'swiss_start_rank_no'`, `external_id = '1'`, `black_player_id IS NULL`. | **PASS** |
| **Scenario 2** | Nhập lại cùng dữ liệu | Nhập lại file vòng 1 với dữ liệu tương đồng. Xác nhận hệ thống đồng bộ an toàn, không báo lỗi `ROUND_ALREADY_HAS_MATCHES` và trả về đúng 2 ván. | **PASS** |
| **Scenario 3** | Thêm bàn mới | Nhập vòng 1 với 3 bàn (bổ sung bàn số 3). Xác nhận bàn 3 được chèn mới vào `matches` và tổng số ván là 3. | **PASS** |
| **Scenario 4** | Cập nhật bàn chưa có kết quả | Cập nhật cặp đấu bàn số 1 (`unreported`) sang 2 kỳ thủ mới "Vũ Giang" vs "Đặng Hoa". Xác nhận tên kỳ thủ Trắng bàn 1 được cập nhật chính xác. | **PASS** |
| **Scenario 5** | Chặn thay đổi bàn đã có kết quả | Đặt bàn số 2 sang trạng thái `official`. Thử nhập file thay đổi kỳ thủ bàn 2. Bắt đúng ngoại lệ `CANNOT_OVERWRITE_MATCH_WITH_RESULTS` và hủy bỏ thao tác. | **PASS** |
| **Scenario 6** | Chặn bỏ sót bàn đã chốt kết quả | Thử nhập file vòng 1 chỉ gồm bàn 1 và bàn 3 (bỏ sót bàn 2 đã official). Bắt đúng ngoại lệ `CANNOT_OMIT_MATCH_WITH_RESULTS` và hủy bỏ thao tác. | **PASS** |
| **Scenario 7** | Tái sử dụng kỳ thủ nhiều vòng | Nhập vòng số 2 tái sử dụng lại `external_id` '4' và '44' từ vòng 1. Xác nhận RPC tái sử dụng đúng ID kỳ thủ, không vi phạm ràng buộc `unique_player_external_id`. | **PASS** |

---

## 2. Kiểm tra tính toàn vẹn và Rollback sạch sẽ (Post-test Audit)

Sau khi hoàn tất 7 scenario, lệnh `ROLLBACK;` tổng thể đã được thực thi. Kết quả kiểm tra số lượng bản ghi thực tế trên Staging:

| Tên bảng | Số dòng trước test | Số dòng sau Rollback | Trạng thái rác |
|---|:---:|:---:|:---:|
| `public.tournaments` | 0 | 0 | **Sạch hoàn toàn (Zero residual)** |
| `public.profiles` | 0 | 0 | **Sạch hoàn toàn (Zero residual)** |
| `public.players` | 0 | 0 | **Sạch hoàn toàn (Zero residual)** |
| `public.matches` | 0 | 0 | **Sạch hoàn toàn (Zero residual)** |
| `public.import_batches` | 0 | 0 | **Sạch hoàn toàn (Zero residual)** |
| `public.audit_log` | 0 | 0 | **Sạch hoàn toàn (Zero residual)** |
| `public.result_events` | 0 | 0 | **Sạch hoàn toàn (Zero residual)** |
| `schema_migrations` | 10 | 10 | **Bảo toàn 10 migrations** |

---

## 3. Kết luận

Cơ sở dữ liệu Staging đáp ứng hoàn hảo cả 7 kịch bản nghiệp vụ của PRD Lite v0.3 và Swiss-Manager Integration. Transaction Rollback hoạt động 100% không để lại bất kỳ tác động phụ nào.

