# CẤU HÌNH MÔI TRƯỜNG SUPABASE STAGING & BẢO VỆ PRODUCTION

- **Thời điểm khởi tạo**: 31/10/2026 – 01/11/2026.
- **Tình trạng triển khai**: Độc lập hoàn toàn, kết nối an toàn.

---

## 1. Cơ chế bảo vệ Production (Production Denylist)

- **Production Project Ref (VÙNG CẤM)**: `idmamlbtrieeidiqgkzt`
- **Production URL**: `https://idmamlbtrieeidiqgkzt.supabase.co`
- **Cam kết kỹ thuật**:
  - `idmamlbtrieeidiqgkzt` được đưa vào danh sách đen (Denylist) trong toàn bộ script và CLI flags.
  - Không chạy bất kỳ DDL, DML, seed, auth mutation, reset hoặc smoke test nào lên Production.
  - File cấu hình gốc `.env.local` của repository được giữ nguyên vẹn.

---

## 2. Thông tin môi trường Staging độc lập

- **Project Name**: `uscc-referee-staging`
- **Staging Project Ref**: `pgfwyohmbtcxumtlojby`
- **Organization ID**: `foqgdsmbptjmhfudchgn` (phkhoiit-1508's Org)
- **Region**: `ap-southeast-2` (Sydney)
- **Database Engine**: PostgreSQL 17.11
- **API URL**: `https://pgfwyohmbtcxumtlojby.supabase.co`
- **CLI Workspace riêng biệt**: `D:\uscc-staging-migrations` (Tách biệt hoàn toàn với repo gốc).
- **Trạng thái liên kết CLI**: Linked thành công tới `pgfwyohmbtcxumtlojby`.
- **Tệp biến môi trường Staging**: `D:\uscc-staging-migrations\.env.staging` (Chứa URL Staging, Anon Key và Secret Key Staging; nằm ngoài Git repo).

