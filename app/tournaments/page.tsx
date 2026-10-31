import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";

import { TournamentCreateForm } from "@/components/tournament-create-form";
import { Button } from "@/components/ui/button";
import { requireReferee } from "@/lib/require-referee";
import { createClient } from "@/lib/supabase/server";

function formatDate(value: string | null) {
  if (!value) return "Chưa đặt";

  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

async function TournamentsContent() {
  await connection();

  let referee;

  try {
    referee = await requireReferee(["technical", "recorder"]);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      redirect("/login");
    }

    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="max-w-md border border-red-200 bg-white p-6 text-center">
          <h1 className="text-xl font-semibold text-red-700">
            Tài khoản chưa được cấp quyền
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Liên hệ trọng tài kỹ thuật để kiểm tra tài khoản.
          </p>
        </div>
      </main>
    );
  }

  const supabase = await createClient();
  const { data: tournaments, error } = await supabase
    .from("tournaments")
    .select(
      "id, name, organizer, venue, start_date, end_date, total_rounds, logo_url, primary_color",
    )
    .order("created_at", { ascending: false });

  const isTechnical = referee.role === "technical";

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-950 [color-scheme:light] sm:py-10">
      <div className="mx-auto max-w-5xl">
        <header className="flex flex-col gap-6 border-b border-slate-200 pb-8 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-2">
              <Image src="/clubs/logo-title.png" alt="USCC" width={100} height={32} className="h-7 w-auto" />
            </p>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Danh sách giải đấu
            </h1>
            <p className="mt-3 max-w-2xl text-slate-600">
              Tra cứu cặp đấu, ghi nhận kết quả và theo dõi xác nhận tại bàn.
            </p>
          </div>

          <Button asChild variant="outline" className="bg-white text-slate-900 hover:bg-slate-100 hover:text-slate-900">
            <Link href="/dashboard">Quay lại Dashboard</Link>
          </Button>
        </header>

        {isTechnical && (
          <section className="mt-8 border border-slate-200 bg-white p-5 sm:p-7">
            <div className="mb-6">
              <h2 className="text-xl font-semibold">Tạo giải đấu</h2>
              <p className="mt-1 text-sm text-slate-600">
                Múi giờ mặc định: Asia/Ho_Chi_Minh.
              </p>
            </div>
            <TournamentCreateForm />
          </section>
        )}

        {!isTechnical && (
          <p className="mt-8 border-l-4 border-teal-600 bg-white px-4 py-3 text-sm text-slate-700">
            Bạn có quyền xem giải và ghi kết quả. Chỉ trọng tài kỹ thuật được tạo
            hoặc cấu hình giải.
          </p>
        )}

        <section className="mt-10">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold">Các giải hiện có</h2>
              <p className="mt-1 text-sm text-slate-500">
                {tournaments?.length ?? 0} giải đấu
              </p>
            </div>
          </div>

          {error && (
            <div role="alert" className="border border-red-200 bg-red-50 p-4 text-red-800">
              Không tải được danh sách giải. Hãy thử tải lại trang.
            </div>
          )}

          {!error && !tournaments?.length && (
            <div className="border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
              <h3 className="font-semibold">Chưa có giải đấu</h3>
              <p className="mt-2 text-sm text-slate-600">
                {isTechnical
                  ? "Nhập thông tin ở biểu mẫu phía trên để tạo giải đầu tiên."
                  : "Trọng tài kỹ thuật chưa tạo giải đấu nào."}
              </p>
            </div>
          )}

          {!error && tournaments && tournaments.length > 0 && (
            <div className="grid gap-3">
              {tournaments.map((tournament) => (
                <article
                  key={tournament.id}
                  className="border border-slate-200 border-l-4 bg-white p-5"
                  style={{
                    borderLeftColor: tournament.primary_color ?? "#172C4C",
                  }}
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-4">
                      {tournament.logo_url && (
                        <div
                          role="img"
                          aria-label={`Logo ${tournament.name}`}
                          className="h-14 w-14 shrink-0 bg-contain bg-center bg-no-repeat"
                          style={{ backgroundImage: `url(${JSON.stringify(tournament.logo_url)})` }}
                        />
                      )}
                      <div>
                        <h3 className="text-lg font-semibold">{tournament.name}</h3>
                        <p className="mt-1 text-sm text-slate-600">
                          {tournament.organizer || "Chưa có đơn vị tổ chức"}
                          {tournament.venue ? ` · ${tournament.venue}` : ""}
                        </p>
                        <p className="mt-2 text-sm text-slate-500">
                          {formatDate(tournament.start_date)} – {formatDate(tournament.end_date)}
                          {` · ${tournament.total_rounds} vòng`}
                        </p>
                      </div>
                    </div>

                    <Button asChild variant="outline" className="bg-white text-slate-900 hover:bg-slate-100 hover:text-slate-900">
                      <Link href={`/tournaments/${tournament.id}`}>Mở giải</Link>
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

export default function TournamentsPage() {
  return (
    <Suspense fallback={<p className="p-8 text-center">Đang tải giải đấu...</p>}>
      <TournamentsContent />
    </Suspense>
  );
}
