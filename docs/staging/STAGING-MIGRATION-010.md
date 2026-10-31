# BÁO CÁO ÁP DỤNG MIGRATION 010 — SUPABASE STAGING

- **Thời điểm thực hiện**: 01/11/2026.
- **Project Ref**: `pgfwyohmbtcxumtlojby` (uscc-referee-staging).
- **Migration**: `20261031001000_swiss_manager_integration.sql`.
- **Trạng thái thực thi**: **THÀNH CÔNG (Exit code 0)**.

---

## 1. Chi tiết thay đổi Schema

1. **Cột mới**: `players.source_id_type` (kiểu `text`, mặc định `'unknown'`).
2. **Ràng buộc Check**: `players_source_id_type_check` hợp lệ hóa 5 giá trị:
   - `'swiss_start_rank_no'` (SNo)
   - `'swiss_ident_no'` (Ident No)
   - `'swiss_unique_id'` (Unique ID)
   - `'fide_id'` (Mã FIDE)
   - `'unknown'` (Mặc định / Không xác định)
3. **Cập nhật RPC `uscc_import_chess_results`**:
   - Loại bỏ hoàn toàn hạn chế `ROUND_ALREADY_HAS_MATCHES`.
   - Bổ sung cơ chế bảo vệ giao dịch: `pg_advisory_xact_lock(hashtextextended(p_tournament_id::text || ':' || p_round::text, 0))`.
   - Bổ sung vòng lặp tiền kiểm tra (Pre-validation loop): Chặn đổi kỳ thủ trên ván đã có kết quả (`CANNOT_OVERWRITE_MATCH_WITH_RESULTS`), chặn thiếu bàn đã có kết quả (`CANNOT_OMIT_MATCH_WITH_RESULTS`).
   - Cho phép cập nhật ván đấu chưa có kết quả (`unreported`).
   - Tái sử dụng hồ sơ kỳ thủ qua nhiều vòng dựa trên `external_id`.
   - Phân quyền: Thu hồi từ `PUBLIC`, `anon`, `authenticated`; chỉ cấp quyền cho `service_role`.

---

## 2. Bằng chứng kiểm tra sau Migration

- Tổng số migrations trên remote: **10/10**.
- Cột `source_id_type` hoạt động chính xác.
- Quyền RPC được bảo vệ strictly: chỉ server backend (`service_role`) mới có quyền thực thi.
- RLS trên tất cả 7 bảng được bảo toàn 100%.

