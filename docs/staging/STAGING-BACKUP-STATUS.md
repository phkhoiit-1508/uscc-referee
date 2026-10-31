# BÁO CÁO SAO LƯU & KHẢ NĂNG PHỤC HỒI — SUPABASE STAGING

- **Thời điểm thực hiện**: 31/10/2026.
- **Project Ref**: `pgfwyohmbtcxumtlojby` (uscc-referee-staging).
- **Mốc sao lưu**: Trước khi áp dụng Migration 010.

---

## 1. Thông tin bản sao lưu (Backup Artifacts)

- **Vị trí lưu trữ**: `D:\uscc-staging-migrations\backups\staging-schema-snapshot.json` (Nằm ngoài Git repository, không commit vào mã nguồn).
- **Kích thước file**: 37,777 bytes.
- **Phạm vi được sao lưu**:
  - Toàn bộ 7 bảng nghiệp vụ của `public` schema (`tournaments`, `profiles`, `players`, `matches`, `import_batches`, `audit_log`, `result_events`).
  - Định nghĩa chi tiết các cột, kiểu dữ liệu, giá trị mặc định, nullability.
  - Toàn bộ hàm RPC (bao gồm mã nguồn `prosrc` và tham số).
  - Toàn bộ chính sách Row-Level Security (RLS) của schema `public`.
  - Danh sách phiên bản migration đã áp dụng trong `supabase_migrations.schema_migrations`.
  - Row counts hiện tại của tất cả các bảng (tất cả đều bằng 0 do là database staging mới thiết lập).

---

## 2. Giới hạn phạm vi & Báo cáo kỹ thuật

1. **Giới hạn môi trường cục bộ**: Máy chủ hiện tại không cài đặt Docker Desktop / Podman, do đó lệnh `supabase db dump` (vốn phụ thuộc vào việc chạy container chứa pg_dump) không thể khởi chạy. Thay vào đó, hệ thống đã trích xuất trực tiếp DDL snapshot qua Management API SQL Engine.
2. **Phạm vi chưa bao gồm**:
   - Dịch vụ Auth (`auth.users`, `auth.identities`) và Storage (`storage.buckets`, `storage.objects`) do Supabase Cloud quản lý tập trung và không nằm trong schema `public`.
3. **Trạng thái phục hồi (Restore Status)**:
   - **`RESTORE_NOT_VERIFIED`** (Theo đúng quy tắc an toàn: không có database thứ 3 cô lập để kiểm thử restore toàn diện trước khi áp dụng).
4. **Phương án phục hồi đáng tin cậy (Recovery Plan)**:
   - Do Staging hiện chưa có dữ liệu giải đấu thật, nếu migration 010 gặp sự cố:
     1. Khôi phục bằng lệnh DDL đảo ngược (`ALTER TABLE public.players DROP COLUMN IF EXISTS source_id_type;` và hoàn nguyên hàm `uscc_import_chess_results`).
     2. Hoặc tái lập database staging trong vòng 2 phút bằng `supabase db push` từ bộ migration 001–009 đã được kiểm chứng.

---

## 3. Verification Gate 3: PASSED (Có điều kiện và phương án phục hồi xác lập)

