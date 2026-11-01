import { Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { LogoutButton } from "@/components/logout-button";

async function DashboardContent() {
  await connection();
  const supabase = await createClient();

  // Xác thực phiên đăng nhập
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect("/login");
  }

  // Đọc vai trò từ database
  const { data: profile, error: profileError } =
    await supabase
      .from("profiles")
      .select("full_name, role")
      .eq("id", user.id)
      .single();

  if (
    profileError ||
    !profile ||
    !["technical", "recorder"].includes(profile.role)
  ) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-5 bg-slate-100 p-6">
        <h1 className="text-2xl font-bold text-red-600">
          Tài khoản chưa được cấp quyền
        </h1>
        <LogoutButton />
      </main>
    );
  }

  const isTechnical = profile.role === "technical";

  return (
    <main className="min-h-screen bg-slate-100">
      <header className="flex items-center justify-between bg-slate-900 px-6 py-5 text-white">
        <h1 className="text-2xl font-bold">
          <Link
            href="/dashboard"
            className="flex items-center gap-3 transition-opacity hover:opacity-90"
          >
            <Image
              src="/clubs/only_white.png"
              alt="USCC Logo"
              height={36}
              width={36}
              className="h-9 w-9 object-contain"
              priority
            />
            <span className="text-2xl font-bold tracking-wider text-white">
              USCC
            </span>
          </Link>
        </h1>

        <LogoutButton />
      </header>

      <div className="mx-auto max-w-5xl p-6">
        <div className="mb-8 rounded-xl bg-white p-6 shadow-sm">
          <h2 className="text-2xl font-bold text-slate-900">
            Xin chào, {profile.full_name}!
          </h2>

          <p className="mt-2 text-slate-600">
            Email: {user.email}
          </p>

          <p className="mt-2 text-slate-600">
            Vai trò:{" "}
            <span className="font-semibold text-blue-700">
              {isTechnical
                ? "Trọng tài kỹ thuật"
                : "Trọng tài ghi kết quả"}
            </span>
          </p>
        </div>

        <h3 className="mb-4 text-xl font-bold text-slate-800">
          Chức năng
        </h3>

        <div className="grid gap-4 sm:grid-cols-2">
          {isTechnical && (
            <Link
              href="/admin"
              className="rounded-xl border border-blue-200 bg-white p-6 shadow-sm hover:border-blue-600"
            >
              <div className="text-2xl">⚙️</div>
              <h4 className="mt-3 font-bold text-blue-800">
                Quản trị giải đấu
              </h4>
              <p className="mt-2 text-sm text-slate-500">
                Chỉ trọng tài kỹ thuật được truy cập
              </p>
            </Link>
          )}

          <Link
            href="/tournaments"
            className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm hover:border-blue-600"
          >
            <div className="text-2xl">♟️</div>
            <h4 className="mt-3 font-bold text-slate-800">
              Danh sách giải đấu
            </h4>
            <p className="mt-2 text-sm text-slate-500">
              Tra cứu cặp đấu và theo dõi kết quả
            </p>
          </Link>
        </div>
      </div>
    </main>
  );
}

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-center">
          Đang tải Dashboard...
        </div>
      }
    >
      <DashboardContent />
    </Suspense>
  );
}
