import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";

import { ProjectionRefresh } from "./projection-refresh";
import { requireReferee } from "@/lib/require-referee";
import { createClient } from "@/lib/supabase/server";

type OfficialMatch = {
  id: string;
  round_number: number;
  board_number: number;
  result_code: string;
  white_player: { full_name: string } | null;
  black_player: { full_name: string } | null;
};

async function ProjectionContent({ id }: { id: string }) {
  await connection();
  try {
    await requireReferee(["technical"]);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") redirect("/login");
    return <main className="p-8 text-center">Chỉ trọng tài kỹ thuật được xem trang chiếu.</main>;
  }

  const supabase = await createClient();
  const { data: tournament, error: tournamentError } = await supabase
    .from("tournaments")
    .select("name")
    .eq("id", id)
    .maybeSingle();
  if (tournamentError) return <main className="p-8 text-center" role="alert">Không tải được giải đấu.</main>;
  if (!tournament) notFound();

  const { data, error } = await supabase
    .from("matches")
    .select(`id, round_number, board_number, result_code,
      white_player:players!white_same_tournament(full_name),
      black_player:players!black_same_tournament(full_name)`)
    .eq("tournament_id", id)
    .eq("status", "official")
    .order("round_number")
    .order("board_number");
  const syncedAt = error ? null : new Date().toISOString();
  const matches = data as unknown as OfficialMatch[] | null;

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-white sm:px-10">
      <div className="mx-auto max-w-6xl">
        <Link href={`/tournaments/${id}`} className="text-sm text-slate-300 hover:text-white">
          ← Quay lại giải đấu
        </Link>
        <header className="mt-8 flex flex-wrap items-end justify-between gap-4 border-b border-slate-700 pb-6">
          <div>
            <p className="text-sm uppercase tracking-widest text-teal-300">Kết quả chính thức</p>
            <h1 className="mt-2 text-3xl font-bold sm:text-5xl">{tournament.name}</h1>
          </div>
          <ProjectionRefresh syncedAt={syncedAt} />
        </header>

        {error ? (
          <p role="alert" className="mt-10 text-red-300">Không tải được kết quả. Trang sẽ thử lại sau 15 giây.</p>
        ) : !matches?.length ? (
          <p className="mt-10 text-lg text-slate-300">Chưa có kết quả chính thức.</p>
        ) : (
          <div className="mt-8 overflow-x-auto">
            <table className="w-full min-w-[540px] text-left text-lg">
              <thead className="border-b border-slate-600 text-sm uppercase tracking-wide text-slate-300">
                <tr>
                  <th scope="col" className="py-3 pr-4">Vòng</th>
                  <th scope="col" className="py-3 pr-4">Bàn</th>
                  <th scope="col" className="py-3 pr-4">Trắng</th>
                  <th scope="col" className="py-3 pr-4">Kết quả</th>
                  <th scope="col" className="py-3">Đen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {matches.map((match) => (
                  <tr key={match.id}>
                    <td className="py-4 pr-4">{match.round_number}</td>
                    <td className="py-4 pr-4">{match.board_number}</td>
                    <td className="py-4 pr-4">{match.white_player?.full_name ?? "—"}</td>
                    <td className="py-4 pr-4 font-bold text-teal-300">{match.result_code}</td>
                    <td className="py-4">{match.black_player?.full_name ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}

export const instant = false;

export default async function ProjectionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense fallback={<p className="p-8 text-center">Đang tải kết quả...</p>}>
      <ProjectionContent id={id} />
    </Suspense>
  );
}
