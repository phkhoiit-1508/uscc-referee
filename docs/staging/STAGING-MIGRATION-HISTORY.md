# LỊCH SỬ MIGRATION DATABASE — SUPABASE STAGING (`pgfwyohmbtcxumtlojby`)

| Phiên bản | Tên file migration | Trạng thái Staging | Tác động schema & logic |
|:---:|---|:---:|---|
| `20261029000100` | `20261029000100_remote_baseline.sql` | **APPLIED** | Tạo các bảng `tournaments`, `profiles`, `players`, `matches`, `import_batches`, ràng buộc và RLS nền tảng. |
| `20261029000200` | `20261029000200_security_audit_foundation.sql` | **APPLIED** | Tạo bảng `audit_log`, `result_events`, trigger ghi log `matches_audit`, `players_audit`, v.v. |
| `20261029000300` | `20261029000300_create_tournament_rpc.sql` | **APPLIED** | Tạo RPC `uscc_create_tournament` có xác thực quyền `technical` và bọc transaction. |
| `20261030000400` | `20261030000400_result_workflow.sql` | **APPLIED** | Tạo RPC nộp kết quả `uscc_submit_result` và xác nhận 2 bên `uscc_confirm_result`. |
| `20261030000500` | `20261030000500_technical_resolution.sql` | **APPLIED** | Tạo RPC phân xử `uscc_resolve_dispute` và mở lại `uscc_reopen_result`. |
| `20261030000600` | `20261030000600_preserve_source_result.sql` | **APPLIED** | Cột `source_result` trên `matches` và lưu batch import lịch thi đấu. |
| `20261030000700` | `20261030000700_update_tournament_rpc.sql` | **APPLIED** | Tạo RPC cập nhật giải đấu `uscc_update_tournament`. |
| `20261031000800` | `20261031000800_special_result_workflow.sql` | **APPLIED** | Hỗ trợ kết quả đặc biệt (bỏ cuộc, xử thua, vắng mặt). |
| `20261031000900` | `20261031000900_cancel_result.sql` | **APPLIED** | Tạo RPC hủy kết quả `uscc_cancel_result`, xóa xác nhận cũ, lưu `result_cancelled`. |
| `20261031001000` | `20261031001000_swiss_manager_integration.sql` | **APPLIED** | Thêm cột `source_id_type`, hỗ trợ Swiss-Manager IDs, xử lý bye sạch, RPC cập nhật vòng an toàn. |

**Tổng kết**: Đủ 10/10 migrations đã được áp dụng và đồng bộ hóa thành công trên Staging Remote Database.

