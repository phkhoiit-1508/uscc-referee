# CÁC KHOẢNG TRỐNG CÒN LẠI & HẠNG MỤC CẦN XÁC MINH THỰC ĐỊA (REMAINING GAPS)

- **Dự án**: Hệ thống Web Trọng tài Cập nhật Kết quả USCC (`D:\uscc-referee`)
- **Ngày cập nhật**: 01/11/2026

---

## 1. Phân loại các hạng mục chưa thể xác minh tự động trong môi trường code

Toàn bộ chức năng từ **FR-01 đến FR-09** đã được cài đặt hoàn chỉnh trong mã nguồn (`Implemented = 100%`) và vượt qua **63/63 bài kiểm thử tự động (`Unit-tested = 100%`)**.

Các khoảng trống còn lại không phải là thiếu tính năng trong code, mà là các bước **triển khai hạ tầng và kiểm chứng vật lý ngoài môi trường code**:

| Hạng mục | Yêu cầu liên quan | Trạng thái hiện tại | Lý do chưa thể hoàn tất trong bước này | Công việc cần làm khi triển khai |
|---|---|:---:|---|---|
| **1. Áp dụng Migration 010 lên Database vận hành giải** | FR-02, FR-06, FR-08, FR-09 | **Pending Deployment** | Theo yêu cầu bảo vệ tuyệt đối Production (`idmamlbtrieeidiqgkzt`) và không chạy triển khai cloud trong nhiệm vụ này. | Chạy quy trình 6 bước: `Read-only preflight` $\rightarrow$ `Backup` $\rightarrow$ `Apply 20261031001000_swiss_manager_integration.sql` $\rightarrow$ `Smoke test rollback` $\rightarrow$ `Browser test` $\rightarrow$ `Approval`. |
| **2. Đo SLA đồng bộ ≤ 5 giây trên trình duyệt & mạng thực tế** | FR-07 | **Pending Browser Field Trial** | Cần 2 thiết bị trình duyệt mở song song (điện thoại trọng tài ghi điểm + máy tính nối máy chiếu) trên mạng thực tế để đo thời gian từ lúc bấm nút đến lúc hiển thị. | Mở `/tournaments/[id]` trên điện thoại và `/tournaments/[id]/projection` trên máy tính, bấm giờ khi kỳ thủ Đen xác nhận và xác minh thời gian hiển thị $\le 5.0$ giây. |
| **3. Kiểm thử tương thích Round-trip với phần mềm Swiss-Manager Desktop** | FR-02, FR-09B | **Schema-valid & Mapping-ready** *(Chờ phần mềm Swiss-Manager)* | Phần mềm Swiss-Manager là ứng dụng Windows Desktop chuyên dụng của ban trọng tài; ngoài ra file mẫu hiện có (`USCC-HCMUS-round-1-Chess-Results.xlsx`) là bản xuất rút gọn từ Chess-Results chưa kèm cột mã định danh `SNo`/`Ident No`. | 1. Khi xuất file lịch thi đấu từ Swiss-Manager/Chess-Results, giữ cột `SNo` (Số thứ tự xuất phát) để hệ thống lưu mã định danh.<br>2. Tải file `.xml` từ hệ thống USCC và nạp thử vào menu Import XML của Swiss-Manager Desktop trước giờ khai mạc giải. |
| **4. Kiểm tra hiển thị thực tế trên máy chiếu hội trường & điện thoại di động** | FR-03, FR-04, FR-05 | **Pending Physical Device Check** | Độ tương phản của máy chiếu hội trường và thao tác chạm đưa máy qua lại giữa trọng tài - kỳ thủ cần kiểm tra trực tiếp trên thiết bị vật lý. | Kiểm tra chế độ toàn màn hình (`F11`) trên máy chiếu hội trường và thao tác 1 tay trên điện thoại iOS/Android của trọng tài bàn. |

---

## 2. Danh mục Migration SQL cần áp dụng khi triển khai Database

Trong thư mục [`supabase/migrations/`](file:///d:/uscc-referee/supabase/migrations), dự án có tổng cộng 10 bản migration theo thứ tự thời gian:

1. [`20261029000100_remote_baseline.sql`](file:///d:/uscc-referee/supabase/migrations/20261029000100_remote_baseline.sql) *(Baseline schema: `profiles`, `tournaments`, `players`, `matches`, `import_batches`, `result_events`, RLS)*
2. [`20261029000200_security_audit_foundation.sql`](file:///d:/uscc-referee/supabase/migrations/20261029000200_security_audit_foundation.sql) *(Bảng `audit_log`, triggers append-only, `uscc_import_chess_results` v1)*
3. [`20261029000300_create_tournament_rpc.sql`](file:///d:/uscc-referee/supabase/migrations/20261029000300_create_tournament_rpc.sql) *(RPC `uscc_create_tournament`)*
4. [`20261030000400_result_workflow.sql`](file:///d:/uscc-referee/supabase/migrations/20261030000400_result_workflow.sql) *(RPC `uscc_submit_result`, `uscc_confirm_result`)*
5. [`20261030000500_technical_resolution.sql`](file:///d:/uscc-referee/supabase/migrations/20261030000500_technical_resolution.sql) *(RPC `uscc_resolve_dispute`, `uscc_reopen_result`)*
6. [`20261030000600_preserve_source_result.sql`](file:///d:/uscc-referee/supabase/migrations/20261030000600_preserve_source_result.sql) *(Cột `matches.source_result`)*
7. [`20261030000700_update_tournament_rpc.sql`](file:///d:/uscc-referee/supabase/migrations/20261030000700_update_tournament_rpc.sql) *(RPC `uscc_update_tournament`)*
8. [`20261031000800_special_result_workflow.sql`](file:///d:/uscc-referee/supabase/migrations/20261031000800_special_result_workflow.sql) *(Bổ sung `resignation` và luồng `special_review`)*
9. [`20261031000900_cancel_result.sql`](file:///d:/uscc-referee/supabase/migrations/20261031000900_cancel_result.sql) *(RPC `uscc_cancel_result`)*
10. [`20261031001000_swiss_manager_integration.sql`](file:///d:/uscc-referee/supabase/migrations/20261031001000_swiss_manager_integration.sql) *(Cột `players.source_id_type`, nâng cấp `uscc_import_chess_results` hỗ trợ cập nhật vòng an toàn + bảo vệ kết quả hiện có + hỗ trợ ván Bye, và bảo toàn `result_kind = 'bye'` trong `uscc_resolve_dispute` / `uscc_reopen_result` / `uscc_cancel_result`)*

