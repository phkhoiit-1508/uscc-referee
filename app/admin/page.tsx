
import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";

async function AdminContent() {
  await connection();
  const supabase = await createClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "technical") {
    return (
      <main className="min-h-screen bg-slate-100 p-8">
        <h1 className="text-2xl font-bold text-red-600">
          403 - Không có quyền truy cập
        </h1>

        <p className="mt-3 text-slate-600">
          Chỉ trọng tài kỹ thuật được vào trang này.
        </p>

        <Link
          href="/dashboard"
          className="mt-6 inline-block text-blue-700 underline"
        >
          Quay lại Dashboard
        </Link>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 p-8">
      <div className="mx-auto max-w-4xl rounded-xl bg-white p-8 shadow-sm">
        <h1 className="text-3xl font-bold text-blue-900">
          Quản trị USCC
        </h1>

        <p className="mt-4 text-green-700">
          Bạn đang đăng nhập với quyền
          Trọng tài kỹ thuật.
        </p>

        <p className="mt-4 text-slate-600">
          Tại đây chúng ta sẽ xây dựng
          quản lý giải đấu, nhập Excel,
          duyệt kết quả và xuất dữ liệu.
        </p>

        <Link
          href="/dashboard"
          className="mt-8 inline-block text-blue-700 underline"
        >
          Quay lại Dashboard
        </Link>
      </div>
    </main>
  );
}

export default function AdminPage() {
  return (
    <Suspense fallback={<p className="p-8">Đang kiểm tra quyền...</p>}>
      <AdminContent />
    </Suspense>
  );
}
