import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";

import { ImportPreviewForm } from "@/components/import-preview-form";
import { RecorderMatchLookup } from "@/components/recorder-match-lookup";
import { TournamentEditForm } from "@/components/tournament-create-form";
import { TournamentDeleteButton } from "@/components/tournament-delete-button";
import { TournamentExportPanel } from "@/components/tournament-export-panel";
import { Button } from "@/components/ui/button";
import { requireReferee } from "@/lib/require-referee";
import { groupEventsByMatch, type ResultEvent } from "@/lib/result-history";
import { createAdminClient } from "@/lib/supabase/admin";
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
    .select("id, name, organizer, venue, start_date, end_date, total_rounds, timezone, logo_url, primary_color")
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
      white_player:players!white_same_tournament(full_name, club, external_id),
      black_player:players!black_same_tournament(full_name, club, external_id)
    `)
    .eq("tournament_id", id)
    .order("round_number")
    .order("board_number");

  const isTechnical = referee.role === "technical";
  const tournamentTimezone = tournament.timezone || "Asia/Ho_Chi_Minh";

  // FR-08 & FR-02: change history and import batches are shown to technical referees.
  let historyByMatch: Record<string, ResultEvent[]> = {};
  let historyError = false;
  type ImportBatchDisplay = {
    id: string;
    round_number: number;
    file_name: string;
    imported_rows: number;
    created_at: string;
    actor_name: string;
  };
  let importHistory: ImportBatchDisplay[] = [];

  if (isTechnical) {
    const [{ data: events, error: eventsError }, { data: batches }] = await Promise.all([
      supabase
        .from("result_events")
        .select("id, match_id, actor_user_id, event_type, player_side, old_data, new_data, reason, created_at, matches!inner(tournament_id)")
        .eq("matches.tournament_id", id)
        .order("created_at")
        .order("id"),
      supabase
        .from("import_batches")
        .select("id, round_number, file_name, imported_rows, imported_by, created_at")
        .eq("tournament_id", id)
        .order("created_at", { ascending: false }),
    ]);

    const actorIds = [
      ...new Set(
        [
          ...(events ?? []).map((e) => e.actor_user_id),
          ...(batches ?? []).map((b) => b.imported_by),
        ].filter(Boolean),
      ),
    ] as string[];

    const names = new Map<string, string>();
    if (actorIds.length) {
      const { data: profiles } = await createAdminClient()
        .from("profiles")
        .select("id, full_name")
        .in("id", actorIds);
      for (const profile of profiles ?? []) names.set(profile.id, profile.full_name);
    }

    if (eventsError) {
      historyError = true;
    } else {
      historyByMatch = groupEventsByMatch(
        (events ?? []).map((e) => ({
          id: e.id,
          match_id: e.match_id,
          event_type: e.event_type,
          player_side: e.player_side,
          old_data: e.old_data,
          new_data: e.new_data,
          reason: e.reason,
          created_at: e.created_at,
          actor_name: e.actor_user_id ? (names.get(e.actor_user_id) ?? e.actor_user_id) : "Hệ thống",
        })),
      );
    }

    importHistory = (batches ?? []).map((b) => ({
      id: b.id,
      round_number: b.round_number,
      file_name: b.file_name,
      imported_rows: b.imported_rows,
      created_at: b.created_at,
      actor_name: b.imported_by ? (names.get(b.imported_by) ?? b.imported_by) : "Hệ thống",
    }));
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-950 [color-scheme:light] sm:py-10">
      <div className="mx-auto max-w-5xl">
        <Button asChild variant="ghost" className="mb-6 -ml-3 text-slate-900 hover:bg-slate-100 hover:text-slate-900">
          <Link href="/tournaments">← Danh sách giải</Link>
        </Button>

        <div
          className="flex items-center gap-5 border-b-4 border-slate-200 pb-8"
          style={{ borderBottomColor: tournament.primary_color ?? "#172C4C" }}
        >
          {tournament.logo_url && (
            <div
              role="img"
              aria-label={`Logo ${tournament.name}`}
              className="h-20 w-20 shrink-0 bg-contain bg-center bg-no-repeat"
              style={{ backgroundImage: `url(${JSON.stringify(tournament.logo_url)})` }}
            />
          )}
          <div>
            <p className="mb-1 text-sm text-slate-500">{tournament.organizer || "Chưa có đơn vị tổ chức"}</p>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{tournament.name}</h1>
            {tournament.venue && <p className="mt-2 text-slate-600">{tournament.venue}</p>}
            <p className="mt-2 text-sm text-slate-500">{tournament.total_rounds} vòng đấu</p>
          </div>
        </div>

        {isTechnical && (
          <section className="mt-10 border border-slate-200 bg-white p-5 sm:p-7">
            <div className="mb-5">
              <h2 className="text-xl font-semibold">Chỉnh sửa thông tin giải</h2>
              <p className="mt-1 text-sm text-slate-500">Thay đổi sẽ được ghi vào nhật ký hệ thống.</p>
            </div>
            <TournamentEditForm
              tournamentId={tournament.id}
              values={{
                name: tournament.name,
                organizer: tournament.organizer ?? "",
                venue: tournament.venue ?? "",
                startDate: tournament.start_date ?? "",
                endDate: tournament.end_date ?? "",
                totalRounds: tournament.total_rounds,
                logoUrl: tournament.logo_url ?? "",
                primaryColor: tournament.primary_color ?? "#172C4C",
              }}
            />
          </section>
        )}

        {isTechnical && (
          <section className="mt-10 border border-slate-200 bg-white p-5 sm:p-7">
            <div className="mb-5">
              <h2 className="text-xl font-semibold">Import lịch thi đấu</h2>
              <p className="mt-1 text-sm text-slate-500">
                Chọn file .xlsx xuất từ Chess-Results. Xem trước trước khi lưu — dữ liệu chưa được ghi cho đến bước xác nhận.
              </p>
            </div>
            <ImportPreviewForm tournamentId={tournament.id} totalRounds={tournament.total_rounds} />

            {importHistory.length > 0 && (
              <div className="mt-6 border-t border-slate-200 pt-5">
                <h3 className="text-sm font-semibold text-slate-800">
                  Lịch sử nhập dữ liệu ({importHistory.length} lượt · Múi giờ {tournamentTimezone})
                </h3>
                <div className="mt-2 overflow-x-auto rounded border border-slate-200">
                  <table className="w-full text-xs text-slate-700">
                    <thead className="bg-slate-50 text-left font-semibold uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-3 py-2">Vòng</th>
                        <th className="px-3 py-2">Tên tệp</th>
                        <th className="px-3 py-2">Số bàn</th>
                        <th className="px-3 py-2">Người nhập</th>
                        <th className="px-3 py-2">Thời điểm nhập ({tournamentTimezone})</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {importHistory.map((batch) => (
                        <tr key={batch.id} className="hover:bg-slate-50">
                          <td className="px-3 py-2 font-medium">Vòng {batch.round_number}</td>
                          <td className="px-3 py-2">{batch.file_name}</td>
                          <td className="px-3 py-2">{batch.imported_rows} bàn</td>
                          <td className="px-3 py-2">{batch.actor_name}</td>
                          <td className="px-3 py-2 text-slate-500">
                            {new Intl.DateTimeFormat("vi-VN", {
                              timeZone: tournamentTimezone,
                              dateStyle: "short",
                              timeStyle: "medium",
                            }).format(new Date(batch.created_at))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
        )}

        {isTechnical && (
          <div className="mt-6 flex flex-wrap gap-3">
            <Button asChild variant="outline" className="bg-white text-slate-900 hover:bg-slate-100 hover:text-slate-900">
              <Link href={`/tournaments/${id}/projection`} target="_blank" rel="noopener noreferrer">
                Trang chiếu kết quả (FR-03/07) ↗
              </Link>
            </Button>
          </div>
        )}

        {isTechnical && (
          <section className="mt-10 border border-slate-200 bg-white p-5 sm:p-7">
            <div className="mb-5">
              <h2 className="text-xl font-semibold">Xuất kết quả (FR-09)</h2>
              <p className="mt-1 text-sm text-slate-500">
                Xuất file Excel đối soát nội bộ và file XML theo chuẩn Swiss-Manager để nạp lại kết quả.
              </p>
            </div>
            <TournamentExportPanel
              tournamentId={tournament.id}
              totalRounds={tournament.total_rounds}
            />
          </section>
        )}

        {isTechnical && (
          <section className="mt-6 border border-red-200 bg-red-50/30 p-5 sm:p-7">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-red-900">Xóa giải đấu</h2>
                <p className="mt-1 text-sm text-red-700">
                  Xóa vĩnh viễn giải đấu này cùng toàn bộ danh sách kỳ thủ, cặp đấu và kết quả liên quan. Thao tác này không thể hoàn tác.
                </p>
              </div>
              <TournamentDeleteButton
                tournamentId={tournament.id}
                tournamentName={tournament.name}
                variant="danger-zone"
              />
            </div>
          </section>
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
            <>
              {historyError && (
                <p role="alert" className="mb-3 text-sm text-red-700">Không tải được lịch sử thay đổi. Hãy tải lại trang.</p>
              )}
              <RecorderMatchLookup
                totalRounds={tournament.total_rounds}
                matches={matches as never}
                isTechnical={isTechnical}
                historyByMatch={historyByMatch}
                tournamentId={tournament.id}
              />
            </>
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
