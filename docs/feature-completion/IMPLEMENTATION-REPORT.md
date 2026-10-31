# BÁO CÁO HOÀN THIỆN CHỨC NĂNG THEO PRD LITE v0.3 (IMPLEMENTATION REPORT)

- **Dự án**: Hệ thống Web Trọng tài Cập nhật Kết quả USCC (`D:\uscc-referee`)
- **Mục tiêu**: Hoàn thiện 100% tính năng, nghiệp vụ, UX, bảo mật và bộ kiểm thử tự động theo PRD Lite v0.3 trước khi triển khai Cloud / Production.
- **Bảo vệ Production**: Project `idmamlbtrieeidiqgkzt` hoàn toàn không bị chạm tới (0 truy vấn, 0 kết nối, 0 thay đổi).
- **Ngày hoàn thành**: 01/11/2026

---

## 1. Tổng quan các hạng mục đã hoàn thiện và nâng cấp

### 1.1. FR-01 — Tạo, sửa và chọn giải đấu
- **Module kiểm tra hợp lệ độc lập**: Tạo mới [`lib/tournament-validation.ts`](file:///d:/uscc-referee/lib/tournament-validation.ts) với hàm `validateTournamentInput` và `isSafeHttpUrl` để kiểm tra chặt chẽ tên giải (1–200 ký tự), tổng số vòng (1–30, không nhỏ hơn vòng đã có cặp đấu), thứ tự ngày bắt đầu/kết thúc, mã màu `#RRGGBB`, và chặn tuyệt đối các giao thức nguy hiểm (`javascript:`, `data:`) trong đường dẫn Logo.
- **Hiển thị Logo trên danh sách giải**: Cập nhật [`app/tournaments/page.tsx`](file:///d:/uscc-referee/app/tournaments/page.tsx) để truy vấn và hiển thị logo giải đấu cùng màu nhận diện trên từng thẻ giải đấu.
- **Chỉnh sửa thông tin giải đấu**: Tích hợp [`TournamentEditForm`](file:///d:/uscc-referee/components/tournament-create-form.tsx) và Server Action [`updateTournament`](file:///d:/uscc-referee/app/tournaments/actions.ts) gọi RPC `uscc_update_tournament` (Migration 007) dành riêng cho trọng tài kỹ thuật.

### 1.2. FR-02 — Nhập danh sách thi đấu từ Excel & Đối soát cập nhật vòng
- **Chọn trang tính (Sheet) & tùy chỉnh ánh xạ cột**:
  - Nâng cấp [`lib/excel/parse-pairings.ts`](file:///d:/uscc-referee/lib/excel/parse-pairings.ts) hỗ trợ `ParsePairingsOptions` (`sheetName` và `columnOverrides`).
  - Tự động phát hiện trang tính đầu tiên có cấu trúc cột Chess-Results/Swiss-Manager hợp lệ và trả về danh sách `sheets`, `selectedSheet`, `availableColumns`, `columnMapping`.
  - Bổ sung bảng tùy chỉnh **"Tùy chỉnh trang tính & ánh xạ cột"** trên [`components/import-preview-form.tsx`](file:///d:/uscc-referee/components/import-preview-form.tsx) để trọng tài kỹ thuật có thể chọn lại sheet hoặc cột nếu file Excel có cấu trúc tùy biến.
- **Tự động chạy Diff Preview & hiển thị chi tiết từng bàn thay đổi**:
  - Tự động kích hoạt `handleCheckDiff` ngay khi tải xem trước file Excel (không cần phải đổi số vòng thủ công mới thấy Diff).
  - Hiển thị danh sách chi tiết từng bàn bị thay đổi (`modifiedBoards`), đổi màu quân (`swappedColorBoards`), thiếu trong file mới (`missingBoards`) và bàn xung đột (`conflictBoards`).
- **Chống Stale Preview, Double-submit & Concurrent Import**:
  - Bổ sung hàm `computeRoundStateSignature` và `isStaleRoundState` trong [`lib/excel/pairing-diff.ts`](file:///d:/uscc-referee/lib/excel/pairing-diff.ts).
  - Trước khi ghi vào DB trong [`confirmImport`](file:///d:/uscc-referee/app/tournaments/%5Bid%5D/actions.ts), hệ thống đối chiếu chữ ký trạng thái vòng lúc xem trước (`expectedRoundSignature`) với trạng thái hiện tại trong DB. Nếu có trọng tài khác vừa nhập kết quả hoặc cập nhật lịch trong lúc đang mở màn hình preview, hệ thống chặn lưu và yêu cầu xem trước lại.
  - Ở tầng PostgreSQL RPC (`uscc_import_chess_results` trong [`20261031001000_swiss_manager_integration.sql`](file:///d:/uscc-referee/supabase/migrations/20261031001000_swiss_manager_integration.sql)), khóa `pg_advisory_xact_lock` tuần tự hóa mọi yêu cầu import đồng thời và chặn tuyệt đối việc ghi đè hoặc bỏ sót bàn đã có kết quả (`CANNOT_OVERWRITE_MATCH_WITH_RESULTS`, `CANNOT_OMIT_MATCH_WITH_RESULTS`).
- **Hiển thị Lịch sử nhập dữ liệu (`import_batches`)**:
  - Cập nhật [`app/tournaments/[id]/page.tsx`](file:///d:/uscc-referee/app/tournaments/%5Bid%5D/page.tsx) để truy vấn bảng `import_batches` kèm tên trọng tài thực hiện và hiển thị bảng **Lịch sử nhập dữ liệu** theo đúng múi giờ của giải (`Asia/Ho_Chi_Minh`).

### 1.3. FR-03 — Tra cứu cặp đấu (có dấu / không dấu + bộ lọc đầy đủ) & Màn hình trình chiếu
- **Tìm kiếm tiếng Việt có dấu và không dấu**:
  - Nâng cấp [`lib/match-search.ts`](file:///d:/uscc-referee/lib/match-search.ts) với hàm `normalizeVietnameseText` chuẩn hóa Unicode NFD và chuyển đổi `đ/Đ -> d`. Trọng tài có thể gõ `"nguyen hong phuc"` hoặc `"nguyễn hồng phúc"`, `"dang quoc bao"`, mã kỳ thủ, CLB hoặc số bàn đều khớp chính xác.
- **Bộ lọc đa tiêu chí theo PRD**:
  - Bổ sung hàm `filterMatches` và giao diện lọc trong [`components/recorder-match-lookup.tsx`](file:///d:/uscc-referee/components/recorder-match-lookup.tsx) theo: **Vòng**, **Từ khóa**, **Trạng thái** (`Chưa nhập`, `Đang chờ xác nhận`, `Chờ Trắng`, `Chờ Đen`, `Tranh chấp / Xét đặc biệt`, `Chính thức`, `Mở lại`), **Kết quả** (`1-0`, `0-1`, `1/2-1/2`, `Chưa có tỷ số`), và **Màu quân** (`Cả Trắng & Đen`, `Chỉ tìm bên Trắng`, `Chỉ tìm bên Đen`).
- **Hiển thị rõ trạng thái và ván Bye trên màn hình trình chiếu**:
  - Cập nhật [`app/tournaments/[id]/projection/projection-board.tsx`](file:///d:/uscc-referee/app/tournaments/%5Bid%5D/projection/projection-board.tsx) hiển thị đầy đủ các cột `Bàn`, `Trắng`, `Kết quả`, `Đen`, `Trạng thái` và hiển thị rõ `"Miễn đấu (Bye)"` khi ván đấu không có kỳ thủ Đen.

### 1.4. FR-04, FR-05, FR-06, FR-08 — Quy trình kết quả, Xác nhận tuần tự, Phân xử, Mở lại & Hủy kết quả
- **An toàn ràng buộc `valid_missing_black` cho ván Bye**:
  - Cập nhật các hàm RPC `uscc_resolve_dispute`, `uscc_reopen_result`, `uscc_cancel_result` trong [`20261031001000_swiss_manager_integration.sql`](file:///d:/uscc-referee/supabase/migrations/20261031001000_swiss_manager_integration.sql) để giữ `result_kind = 'bye'` khi `black_player_id IS NULL`, đảm bảo không bao giờ vi phạm ràng buộc `valid_missing_black` khi mở lại hoặc hủy kết quả ván miễn đấu.
- **Hiển thị loại kết quả trên màn hình xác nhận của kỳ thủ**:
  - Cập nhật [`components/recorder-match-lookup.tsx`](file:///d:/uscc-referee/components/recorder-match-lookup.tsx) hiển thị rõ cả tỷ số và loại kết quả (`Bình thường`, `Bỏ cuộc`...) trên màn hình xác nhận của kỳ thủ Trắng và Đen.

### 1.5. FR-09 — Xuất kết quả sang Excel và Swiss-Manager XML
- **Thực thi nghiêm ngặt 7 cổng kiểm tra hợp lệ XML**:
  - Cập nhật [`lib/export/export-xml.ts`](file:///d:/uscc-referee/lib/export/export-xml.ts) kiểm tra đủ 7 điều kiện:
    1. `status === "official"`
    2. Có đủ 2 kỳ thủ hợp lệ và không phải ván `bye`
    3. Cả 2 kỳ thủ có `external_id` và `source_id_type` thuộc hệ mã Swiss-Manager hợp lệ (`swiss_start_rank_no`, `swiss_ident_no`, `swiss_unique_id` — từ chối `unknown` và `fide_id`)
    4. Hai kỳ thủ dùng chung hệ mã định danh và không trùng mã của nhau
    5. Danh tính kỳ thủ đã xác thực (`is_verified_identity !== false`), không suy diễn từ tên
    6. Vòng, số bàn và `tournament_id` hợp lệ
    7. Kết quả ánh xạ hợp lệ sang mã `Res` của Swiss-Manager (`1-0`, `0-1`, `1/2`, `1-0F`, `0-1F`, `0-0F`)
- **Truy vấn đầy đủ `source_id_type` kèm cơ chế Fallback an toàn**:
  - Cập nhật [`app/api/tournaments/[id]/export/excel/route.ts`](file:///d:/uscc-referee/app/api/tournaments/%5Bid%5D/export/excel/route.ts) và [`app/api/tournaments/[id]/export/xml/route.ts`](file:///d:/uscc-referee/app/api/tournaments/%5Bid%5D/export/xml/route.ts) để lấy trường `source_id_type` từ bảng `players`, đồng thời tự động fallback nếu chạy trên database chưa áp dụng Migration 010.

---

## 2. Kết quả kiểm thử tự động & Build Verification

Toàn bộ các lệnh kiểm tra chất lượng mã nguồn trên `D:\uscc-referee` đều đạt 100%:

- **`npm test`**: **63/63 tests PASS** (0 fail, thời gian chạy ~717ms):
  - [`lib/tournament-validation.test.mts`](file:///d:/uscc-referee/lib/tournament-validation.test.mts): 6 tests PASS
  - [`lib/excel/parse-pairings.test.mts`](file:///d:/uscc-referee/lib/excel/parse-pairings.test.mts): 12 tests PASS
  - [`lib/excel/pairing-diff.test.mts`](file:///d:/uscc-referee/lib/excel/pairing-diff.test.mts): 9 tests PASS
  - [`lib/match-search.test.mts`](file:///d:/uscc-referee/lib/match-search.test.mts): 5 tests PASS
  - [`lib/result-rules.test.mts`](file:///d:/uscc-referee/lib/result-rules.test.mts): 7 tests PASS
  - [`lib/result-history.test.mts`](file:///d:/uscc-referee/lib/result-history.test.mts): 3 tests PASS
  - [`lib/projection-sync.test.mts`](file:///d:/uscc-referee/lib/projection-sync.test.mts): 11 tests PASS
  - [`lib/export/export-excel.test.mts`](file:///d:/uscc-referee/lib/export/export-excel.test.mts): 3 tests PASS
  - [`lib/export/export-xml.test.mts`](file:///d:/uscc-referee/lib/export/export-xml.test.mts): 7 tests PASS
- **`npm run lint`**: 0 lỗi, 0 cảnh báo.
- **`npx tsc --noEmit`**: 0 lỗi kiểu TypeScript.
- **`npm run build`**: Thành công (21/21 routes biên dịch tối ưu với Next.js 16.4.3 Turbopack).

