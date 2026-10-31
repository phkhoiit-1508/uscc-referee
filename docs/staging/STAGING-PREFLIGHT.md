# BÁO CÁO DATABASE PREFLIGHT — SUPABASE STAGING

- **Thời điểm kiểm tra**: 31/10/2026.
- **Môi trường**: Supabase Staging độc lập.
- **Project Ref**: `pgfwyohmbtcxumtlojby` (uscc-referee-staging).
- **Trạng thái trước kiểm tra**: Đã áp dụng migrations 001–009. Migration 010 chưa áp dụng.

---

## 1. Kết quả kiểm tra chi tiết theo 12 tiêu chí bắt buộc

| STT | Hạng mục kiểm tra | Trạng thái thực tế | Đánh giá |
|:---:|---|---|:---:|
| 1 | Các bảng nghiệp vụ cốt lõi | Tồn tại đủ 7 bảng: `tournaments`, `profiles`, `players`, `matches`, `import_batches`, `audit_log`, `result_events`. | **PASS** |
| 2 | Cột `players.external_id` | Tồn tại (`type: text`, `nullable: YES`). | **PASS** |
| 3 | Trạng thái `players.source_id_type` | Chưa tồn tại (sẽ được thêm bởi migration 010). | **PASS** |
| 4 | Ràng buộc `unique_player_external_id` | `UNIQUE (tournament_id, external_id)` hoạt động chính xác. | **PASS** |
| 5 | Dữ liệu trùng mã kỳ thủ | Không có bản ghi nào bị trùng lặp (database staging sạch). | **PASS** |
| 6 | Foreign keys của `matches` | `white_same_tournament`, `black_same_tournament`, `matches_tournament_id_fkey`, `matches_entered_by_fkey`. | **PASS** |
| 7 | Hỗ trợ ván Bye (`black_player_id IS NULL`) | Ràng buộc `valid_missing_black` cho phép black NULL khi `result_kind = 'bye'`. | **PASS** |
| 8 | RPC `uscc_import_chess_results` | Đã tồn tại với tham số `(p_tournament_id, p_round, p_filename, p_actor, p_rows)`. | **PASS** |
| 9 | Phân quyền RPC Execute | `REVOKE ALL FROM PUBLIC, anon, authenticated; GRANT TO service_role, postgres;`. Client không thể gọi trực tiếp. | **PASS** |
| 10 | Trạng thái Row-Level Security (RLS) | `rls_enabled: true` trên 100% bảng nghiệp vụ và audit log. | **PASS** |
| 11 | Trigger kiểm toán (Audit Triggers) | Đầy đủ `matches_audit`, `players_audit`, `tournaments_audit`, `profiles_audit`, `import_batches_audit`, `result_events_audit`. Bảng `audit_log` có trigger `append_only`. | **PASS** |
| 12 | Đối chiếu Schema Drift | Remote migration history khớp chính xác 9/9 migrations (001–009). Không có sai lệch ngoài dự kiến. | **PASS** |

---

## 2. Kết luận Preflight

Cơ sở dữ liệu Staging (`pgfwyohmbtcxumtlojby`) đạt 100% điều kiện an toàn, toàn vẹn schema để tiến hành bước Backup và áp dụng Migration 010.

