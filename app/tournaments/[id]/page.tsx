import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";

import { ImportPreviewForm } from "@/components/import-preview-form";
import { RecorderMatchLookup } from "@/components/recorder-match-lookup";
import { Button } from "@/components/ui/button";
import { requireReferee } from "@/lib/require-referee";
import { createClient } from "@/lib/supabase/server";

async function TournamentContent({ id }: { id: string }) {
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
          <h1 className="text-xl font-semibold text-red-700">Tài khoản chưa được cấp quyền</h1>
        </div>
      </main>
    );
  }

  const supabase = await createClient();
  const { data: tournament } = await supabase
    .from("tournaments")
    .select("id, name, organizer, venue, start_date, end_date, total_rounds")
    .eq("id", id)
    .single();

  if (!tournament) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="max-w-md border border-slate-200 bg-white p-6 text-center">
          <h1 className="text-xl font-semibold text-slate-700">Không tìm thấy giải đấu</h1>
          <Button asChild variant="outline" className="mt-4 bg-white text-slate-900 hover:bg-slate-100 hover:text-slate-900">
            <Link href="/tournaments">Quay lại danh sách</Link>
          </Button>
        </div>
      </main>
    );
  }

  const { data: matches, error: matchesError } = await supabase
    .from("matches")
    .select(`
      id, board_number, round_number, status, result_code, result_kind,
      white_confirmed_at, black_confirmed_at,
      white_player:players!white_same_tournament(full_name, club),
      black_player:players!black_same_tournament(full_name, club)
    `)
    .eq("tournament_id", id)
    .order("round_number")
    .order("board_number");

  const isTechnical = referee.role === "technical";

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-950 [color-scheme:light] sm:py-10">
      <div className="mx-auto max-w-5xl">
        <Button asChild variant="ghost" className="mb-6 -ml-3 text-slate-900 hover:bg-slate-100 hover:text-slate-900">
          <Link href="/tournaments">← Danh sách giải</Link>
        </Button>

        <div className="border-b border-slate-200 pb-8">
          <p className="mb-1 text-sm text-slate-500">{tournament.organizer || "Chưa có đơn vị tổ chức"}</p>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{tournament.name}</h1>
          {tournament.venue && (
            <p className="mt-2 text-slate-600">{tournament.venue}</p>
          )}
          <p className="mt-2 text-sm text-slate-500">{tournament.total_rounds} vòng đấu</p>
        </div>

        {isTechnical && (
          <section className="mt-10 border border-slate-200 bg-white p-5 sm:p-7">
            <div className="mb-5">
              <h2 className="text-xl font-semibold">Import lịch thi đấu</h2>
              <p className="mt-1 text-sm text-slate-500">
                Chọn file .xlsx xuất từ Chess-Results. Xem trước trước khi lưu — dữ liệu chưa được ghi cho đến bước xác nhận.
              </p>
            </div>
            <ImportPreviewForm tournamentId={tournament.id} totalRounds={tournament.total_rounds} />
          </section>
        )}

        {isTechnical && (
          <Button asChild variant="outline" className="mt-6 bg-white text-slate-900 hover:bg-slate-100 hover:text-slate-900">
            <Link href={`/tournaments/${id}/projection`}>Trang chiếu kết quả</Link>
          </Button>
        )}

        <section className="mt-10 border border-slate-200 bg-white p-5 sm:p-7">
          <div className="mb-5">
            <h2 className="text-xl font-semibold">Ghi kết quả</h2>
            <p className="mt-1 text-sm text-slate-500">
              Tìm bàn đấu, nhập kết quả và thu thập xác nhận tuần tự từ Trắng rồi Đen.
            </p>
          </div>
          {matchesError ? (
            <p role="alert" className="text-sm text-red-700">Không tải được ván đấu. Hãy thử tải lại trang.</p>
          ) : matches && matches.length > 0 ? (
            <RecorderMatchLookup
              totalRounds={tournament.total_rounds}
              matches={matches as never}
              isTechnical={isTechnical}
            />
          ) : (
            <p className="text-sm text-slate-500">Chưa có ván đấu nào. Trọng tài kỹ thuật cần import lịch thi đấu trước.</p>
          )}
        </section>
      </div>
    </main>
  );
}

export const instant = false;

export default async function TournamentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <Suspense fallback={<p className="p-8 text-center">Đang tải giải đấu...</p>}>
      <TournamentContent id={id} />
    </Suspense>
  );
}
