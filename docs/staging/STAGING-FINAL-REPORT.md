# BÁO CÁO NGHIỆM THU TỔNG KẾT TRIỂN KHAI SUPABASE STAGING

- **Thời điểm hoàn thành**: 01/11/2026.
- **Vai trò thực hiện**: DevOps Engineer, PostgreSQL DBA & Full-stack QA Engineer.
- **Repository**: `D:\uscc-referee`.

---

## A. BẢO VỆ TUYỆT ĐỐI PRODUCTION (PRODUCTION PROTECTION)

1. **Production Project Reference**: `idmamlbtrieeidiqgkzt`
   - URL: `https://idmamlbtrieeidiqgkzt.supabase.co`
   - Dashboard: `https://supabase.com/dashboard/project/idmamlbtrieeidiqgkzt`
2. **Xác nhận Denylist**:
   - Project `idmamlbtrieeidiqgkzt` đã được đưa vào danh sách cấm (Denylist) trong toàn bộ script kiểm thử và cấu hình.
   - 100% các lệnh DDL, DML, migration, snapshot, smoke test và E2E test chỉ nhắm vào Staging `pgfwyohmbtcxumtlojby`.
3. **Các biện pháp ngăn chặn nhầm lẫn**:
   - Tạo workspace riêng tại `D:\uscc-staging-migrations` để chạy lệnh Supabase CLI liên kết với Staging.
   - Script kiểm tra đầu cuối [`scripts/staging-integration-test.mts`](file:///d:/uscc-referee/scripts/staging-integration-test.mts) có cơ chế assert chặn đứng nếu URL chứa chuỗi `idmamlbtrieeidiqgkzt`.
   - File `.env.local` của repository gốc được giữ nguyên vẹn.
4. **Bằng chứng**:
   - Zero write operations on Production. Production hoàn toàn không bị ảnh hưởng.

---

## B. THÔNG TIN MÔI TRƯỜNG STAGING (STAGING ENVIRONMENT)

- **Staging Project Reference**: `pgfwyohmbtcxumtlojby`
- **Staging Project Name**: `uscc-referee-staging`
- **API URL**: `https://pgfwyohmbtcxumtlojby.supabase.co`
- **Organization**: `foqgdsmbptjmhfudchgn` (phkhoiit-1508's Org)
- **Region**: `ap-southeast-2` (Sydney)
- **Database Engine**: PostgreSQL 17.11 (ga release)
- **Supabase CLI Version**: 2.122.0
- **Node.js**: v24.14.0 | **npm**: 11.21.1
- **Trạng thái**: ACTIVE_HEALTHY, liên kết CLI thành công.

---

## C. KẾT QUẢ MIGRATION DATABASE (MIGRATIONS 001–010)

| Migration | Tên File | Trạng thái Remote |
|:---:|---|:---:|
| `20261029000100` | `20261029000100_remote_baseline.sql` | **APPLIED** |
| `20261029000200` | `20261029000200_security_audit_foundation.sql` | **APPLIED** |
| `20261029000300` | `20261029000300_create_tournament_rpc.sql` | **APPLIED** |
| `20261030000400` | `20261030000400_result_workflow.sql` | **APPLIED** |
| `20261030000500` | `20261030000500_technical_resolution.sql` | **APPLIED** |
| `20261030000600` | `20261030000600_preserve_source_result.sql` | **APPLIED** |
| `20261030000700` | `20261030000700_update_tournament_rpc.sql` | **APPLIED** |
| `20261031000800` | `20261031000800_special_result_workflow.sql` | **APPLIED** |
| `20261031000900` | `20261031000900_cancel_result.sql` | **APPLIED** |
| `20261031001000` | `20261031001000_swiss_manager_integration.sql` | **APPLIED** |

Đủ 10/10 migrations đã được ghi nhận trong bảng `supabase_migrations.schema_migrations`.

---

## D. XÁC MINH CƠ SỞ DỮ LIỆU (DATABASE VERIFICATION)

1. **Schema & Tables**: Đầy đủ 7 bảng cốt lõi (`tournaments`, `profiles`, `players`, `matches`, `import_batches`, `audit_log`, `result_events`).
2. **Cột mới**: `players.source_id_type` tồn tại với ràng buộc check hợp lệ hóa 5 loại mã.
3. **Constraints**: `unique_player_external_id`, `unique_match_board`, `valid_missing_black` (`black_player_id IS NOT NULL OR result_kind = 'bye'`).
4. **RPC & Security**: Quyền thực thi toàn bộ RPC chỉ cấp cho `service_role`. Client ẩn danh bị từ chối 100%.
5. **RLS**: Kích hoạt trên 100% bảng.
6. **Audit**: 7 triggers kiểm toán hoạt động đầy đủ.

---

## E. SAO LƯU & KHẢ NĂNG PHỤC HỒI (BACKUP READINESS)

- **Vị trí**: `D:\uscc-staging-migrations\backups\staging-schema-snapshot.json` (37,777 bytes).
- **Phạm vi**: 100% bảng, cột, hàm RPC, RLS policies, trigger schema `public`.
- **Giới hạn**: Không bao gồm Auth/Storage nội bộ. Do môi trường không có Docker, pg_dump container không khả dụng.
- **Trạng thái phục hồi**: `RESTORE_NOT_VERIFIED` (đã lập phương án phục hồi bằng DDL đảo ngược hoặc tái lập nhanh qua bộ migration 001–009).

---

## F. KẾT QUẢ SMOKE TEST 7 KỊCH BẢN (SMOKE TEST 7 SCENARIOS)

Script: [`supabase/diagnostics/swiss-manager-integration-smoke-test.sql`](file:///d:/uscc-referee/supabase/diagnostics/swiss-manager-integration-smoke-test.sql)
- **Scenario 1 (Nhập lần đầu)**: **PASS**
- **Scenario 2 (Nhập lại cùng dữ liệu)**: **PASS** (Không báo `ROUND_ALREADY_HAS_MATCHES`)
- **Scenario 3 (Thêm bàn mới)**: **PASS**
- **Scenario 4 (Cập nhật bàn chưa có kết quả)**: **PASS**
- **Scenario 5 (Chặn đổi kỳ thủ bàn đã chốt kết quả)**: **PASS** (Bắt đúng `CANNOT_OVERWRITE_MATCH_WITH_RESULTS`)
- **Scenario 6 (Chặn bỏ sót bàn đã có kết quả)**: **PASS** (Bắt đúng `CANNOT_OMIT_MATCH_WITH_RESULTS`)
- **Scenario 7 (Tái sử dụng kỳ thủ nhiều vòng)**: **PASS** (Không vi phạm ràng buộc unique)
- **Hậu kiểm Rollback**: 100% bảng giữ nguyên 0 dòng dữ liệu rác sau test.

---

## G. KẾT QUẢ KIỂM THỬ ĐẦU CUỐI (E2E WEB INTEGRATION)

Script: [`scripts/staging-integration-test.mts`](file:///d:/uscc-referee/scripts/staging-integration-test.mts)
- **14/14 Bước thành công 100%**:
  - Tạo giải đấu thành công trên Staging.
  - Phân tích và nạp đủ 40 bàn từ file thực tế `USCC-HCMUS-round-1-Chess-Results.xlsx`.
  - Luồng Recorder nộp $\rightarrow$ Trắng xác nhận $\rightarrow$ Đen xác nhận $\rightarrow$ Chốt `official`.
  - Luồng Khiếu nại $\rightarrow$ Trọng tài kỹ thuật phân xử hòa $1/2 - 1/2$.
  - Luồng Hủy kết quả chính thức $\rightarrow$ Về unreported, xóa xác nhận, lưu `result_cancelled`.
  - Màn chiếu chỉ công bố ván official, tự động loại trừ ván đã hủy.
  - Xuất file Excel (.xlsx) và Swiss-Manager XML (.xml) hợp lệ.
  - Độ trễ REST API Staging đo 5 lượt: 241ms, 499ms, 234ms, 234ms, 237ms (Trung bình: 289ms, Tối đa: 499ms).
- **Ghi nhận**: Đánh dấu `BROWSER_NOT_VERIFIED` đối với thiết bị di động thật và máy chiếu vật lý.

---

## H. CHẤT LƯỢNG MÃ NGUỒN (AUTOMATED QUALITY GATES)

- **`npm test`**: **PASS 50/50 tests** (0 fail, 0 skipped) trong 714ms.
- **`npm run lint`**: **PASS (0 errors, 0 warnings)**.
- **`npx tsc --noEmit`**: **PASS (0 errors)**.
- **`npm run build`**: **PASS (Biên dịch thành công 21/21 routes production Next.js Turbopack)**.

---

## I. MA TRẬN NGHIỆM THU PRD (FR-01 → FR-09)

| Mã YC | Chức năng nghiệp vụ | Implemented | Unit-tested | Integration-tested | Manually verified | Trạng thái nghiệm thu |
|:---:|---|:---:|:---:|:---:|:---:|---|
| **FR-01** | Tạo & sửa giải đấu | **ĐẠT** | **ĐẠT** | **ĐẠT** | **Chờ Staging** | Đạt kỹ thuật, đã verify trên Staging DB. |
| **FR-02** | Nhập Excel & Cập nhật vòng | **ĐẠT** | **ĐẠT** | **ĐẠT** | **ĐẠT (40 bàn)** | Đạt kỹ thuật, nạp thành công 40 bàn thực tế. |
| **FR-03** | Tra cứu ván & Màn chiếu | **ĐẠT** | **ĐẠT** | **ĐẠT** | **Chờ máy chiếu** | Đạt kỹ thuật, đã verify lọc ván official. |
| **FR-04** | Ghi nhận kết quả | **ĐẠT** | **ĐẠT** | **ĐẠT** | **Chờ thiết bị** | Đạt kỹ thuật, đã verify workflow nộp kết quả. |
| **FR-05** | Hai kỳ thủ lần lượt xác nhận | **ĐẠT** | **ĐẠT** | **ĐẠT** | **Chờ 2 máy** | Đạt kỹ thuật: Trắng xác nhận trước $\rightarrow$ Đen xác nhận sau. |
| **FR-06** | Phân xử bất đồng (Technical) | **ĐẠT** | **ĐẠT** | **ĐẠT** | **Chờ Staging** | Đạt kỹ thuật, đã verify phân xử hòa 1/2-1/2 kèm lý do. |
| **FR-07** | Đồng bộ tự động thời gian thực | **ĐẠT** | **ĐẠT** | **ĐẠT (289ms)** | **CHƯA ĐO TRÊN MÁY CHIẾU THẬT** | **Chưa thể kết luận SLA thiết bị thật** trước khi đo trên Wi-Fi hội trường. |
| **FR-08** | Sửa, hủy kết quả & Xem lịch sử | **ĐẠT** | **ĐẠT** | **ĐẠT** | **Chờ Staging** | Đạt kỹ thuật, đã verify hủy ván official và ghi log. |
| **FR-09A** | Xuất kết quả Excel đối soát | **ĐẠT** | **ĐẠT** | **ĐẠT** | **ĐẠT** | **Nghiệm thu đầy đủ**. |
| **FR-09B** | Xuất Swiss-Manager XML | **ĐẠT** | **ĐẠT** | **ĐẠT** | **CHƯA NẠP THỰC TẾ VÀO SWISS-MANAGER** | **Chưa thể kết luận nghiệm thu Swiss-Manager** trước khi nạp thử vào phần mềm desktop thật. |

---

## J. CÁC HẠNG MỤC CÒN THIẾU TRƯỚC GIỜ KHAI MẠC (REMAINING BLOCKERS)

1. **FR-07 (Đo đạc SLA thực địa)**: Cần dùng đồng hồ bấm giờ đo độ trễ từ lúc Đen bấm "Xác nhận" trên điện thoại đến khi tỷ số hiện trên máy chiếu hội trường.
2. **FR-09B (Nạp thử Swiss-Manager Desktop)**: Cần copy file `.xml` xuất ra và nạp thử vào phần mềm Swiss-Manager Desktop trên máy tính Windows thật của trọng tài chính để đạt cấp độ `Round-trip verified`.
3. **Phê duyệt Production**: Khi ban tổ chức hoàn tất 2 bước kiểm chứng thực địa trên Staging, mới tiến hành áp dụng migration 010 lên Production `idmamlbtrieeidiqgkzt`.

