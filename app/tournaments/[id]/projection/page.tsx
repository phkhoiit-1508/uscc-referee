import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";

import { ProjectionBoard } from "./projection-board";
import { requireReferee } from "@/lib/require-referee";
import type { OfficialMatch } from "@/lib/projection-sync";
import { createClient } from "@/lib/supabase/server";

async function ProjectionContent({ id }: { id: string }) {
  await connection();
  try {
    await requireReferee(["technical"]);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") redirect("/login");
    return <main className="p-8 text-center text-white">Chỉ trọng tài kỹ thuật được xem trang chiếu.</main>;
  }

  const supabase = await createClient();
  const { data: tournament, error: tournamentError } = await supabase
    .from("tournaments")
    .select("id, name, logo_url, primary_color, total_rounds")
    .eq("id", id)
    .maybeSingle();

  if (tournamentError) {
    return <main className="p-8 text-center text-red-300" role="alert">Không tải được giải đấu.</main>;
  }
  if (!tournament) notFound();

  // Load initial pairings for round 1 for fast SSR rendering
  const { data: matches } = await supabase
    .from("matches")
    .select(`
      id, round_number, board_number, status, result_code, result_kind,
      white_player:players!white_same_tournament(full_name),
      black_player:players!black_same_tournament(full_name)
    `)
    .eq("tournament_id", id)
    .eq("round_number", 1)
    .order("board_number");

  const sanitizedInitialMatches = (matches ?? []).map((m) => {
    const isOfficial = m.status === "official";
    return {
      id: m.id,
      round_number: m.round_number,
      board_number: m.board_number,
      status: m.status,
      result_code: isOfficial ? m.result_code : null,
      result_kind: isOfficial ? m.result_kind : null,
      white_player: m.white_player,
      black_player: m.black_player,
    };
  });

  const initialSyncedAt = new Date().toISOString();

  return (
    <ProjectionBoard
      tournamentId={tournament.id}
      tournamentName={tournament.name}
      totalRounds={tournament.total_rounds}
      logoUrl={tournament.logo_url}
      primaryColor={tournament.primary_color}
      initialMatches={(sanitizedInitialMatches as unknown as OfficialMatch[]) ?? []}
      initialSyncedAt={initialSyncedAt}
      initialRound={1}
    />
  );
}

export const instant = false;

export default async function ProjectionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense fallback={<p className="p-8 text-center text-white">Đang tải kết quả...</p>}>
      <ProjectionContent id={id} />
    </Suspense>
  );
}
