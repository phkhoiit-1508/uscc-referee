# BÁO CÁO KIỂM TOÁN BẢO MẬT & PHÂN QUYỀN — SUPABASE STAGING

- **Thời điểm kiểm toán**: 01/11/2026.
- **Môi trường**: Supabase Staging (`pgfwyohmbtcxumtlojby`).

---

## 1. Phân quyền RPC và Bảo vệ Client Boundary

Toàn bộ các hàm RPC xử lý dữ liệu trọng yếu đều được thu hồi quyền từ `PUBLIC`, `anon` và `authenticated`, chỉ cấp quyền thực thi cho `service_role`:
- `uscc_create_tournament`: `REVOKE ALL FROM PUBLIC, anon, authenticated; GRANT TO service_role`
- `uscc_update_tournament`: `REVOKE ALL FROM PUBLIC, anon, authenticated; GRANT TO service_role`
- `uscc_import_chess_results`: `REVOKE ALL FROM PUBLIC, anon, authenticated; GRANT TO service_role`
- `uscc_submit_result`: `REVOKE ALL FROM PUBLIC, anon, authenticated; GRANT TO service_role`
- `uscc_confirm_result`: `REVOKE ALL FROM PUBLIC, anon, authenticated; GRANT TO service_role`
- `uscc_resolve_dispute`: `REVOKE ALL FROM PUBLIC, anon, authenticated; GRANT TO service_role`
- `uscc_cancel_result`: `REVOKE ALL FROM PUBLIC, anon, authenticated; GRANT TO service_role`
- `uscc_reopen_result`: `REVOKE ALL FROM PUBLIC, anon, authenticated; GRANT TO service_role`

**Kết quả kiểm tra thực tế (Step 2 E2E)**:
Client ẩn danh (`anon key`) gọi trực tiếp tới RPC `uscc_import_chess_results` bị Supabase REST API từ chối ngay lập tức với lỗi `401/403 Permission Denied`.

---

## 2. Kiểm soát vai trò (Role-based Access Control: Technical vs Recorder)

- **Vai trò `recorder`**: Chỉ được ghi tỷ số (`uscc_submit_result`) và hỗ trợ kỳ thủ bấm xác nhận (`uscc_confirm_result`). Bị chặn hoàn toàn nếu cố ý gọi các hàm kỹ thuật (`TECHNICAL_REFEREE_REQUIRED`).
- **Vai trò `technical`**: Có toàn quyền tạo giải, import Excel, duyệt ngoại lệ, giải quyết tranh chấp, hủy và mở lại ván đấu. Mọi thao tác đều bắt buộc nhập lý do (1–1000 ký tự) và được ghi vết vào `audit_log` kèm `actor_user_id`.

---

## 3. Trạng thái Row-Level Security (RLS)

100% các bảng thuộc schema `public` đã được kích hoạt RLS (`rls_enabled: true`):
- `public.tournaments`
- `public.profiles`
- `public.players`
- `public.matches`
- `public.import_batches`
- `public.audit_log` (có trigger append-only ngăn sửa/xóa)
- `public.result_events` (có trigger append-only ngăn sửa/xóa)

---

## 4. Quản lý Secret & Bảo vệ Production

- Không có bất kỳ API key, password hoặc token nào bị ghi vào git hoặc xuất ra console log.
- Cấu hình Staging được lưu tại `D:\uscc-staging-migrations\.env.staging` (nằm ngoài git).
- Project Production `idmamlbtrieeidiqgkzt` được bảo vệ tuyệt đối và không có bất kỳ lệnh ghi nào tác động tới.

