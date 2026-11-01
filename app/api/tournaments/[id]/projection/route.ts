import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

const NO_CACHE_HEADERS = {
  "Cache-Control": "private, no-cache, no-store, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { error: "UNAUTHORIZED" },
      { status: 401, headers: NO_CACHE_HEADERS },
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "technical") {
    return NextResponse.json(
      { error: "FORBIDDEN" },
      { status: 403, headers: NO_CACHE_HEADERS },
    );
  }

  const { data: tournament, error: tournamentError } = await supabase
    .from("tournaments")
    .select("id, name, logo_url, primary_color, total_rounds")
    .eq("id", id)
    .maybeSingle();

  if (tournamentError || !tournament) {
    return NextResponse.json(
      { error: "TOURNAMENT_NOT_FOUND" },
      { status: 404, headers: NO_CACHE_HEADERS },
    );
  }

  const { searchParams } = new URL(request.url);
  const roundParam = searchParams.get("round");
  let roundNumber: number | null = null;
  if (roundParam) {
    const parsed = Number(roundParam);
    if (Number.isInteger(parsed) && parsed >= 1 && parsed <= tournament.total_rounds) {
      roundNumber = parsed;
    }
  }

  let query = supabase
    .from("matches")
    .select(`
      id, round_number, board_number, status, result_code, result_kind,
      white_player:players!white_same_tournament(full_name),
      black_player:players!black_same_tournament(full_name)
    `)
    .eq("tournament_id", id);

  if (roundNumber !== null) {
    query = query.eq("round_number", roundNumber);
  }

  const { data: matches, error: matchesError } = await query
    .order("round_number")
    .order("board_number");

  if (matchesError) {
    return NextResponse.json(
      { error: "FETCH_MATCHES_FAILED" },
      { status: 500, headers: NO_CACHE_HEADERS },
    );
  }

  // Mask unconfirmed result codes in accordance with PRD FR-06
  const sanitizedMatches = (matches ?? []).map((m) => {
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

  return NextResponse.json(
    {
      tournament: {
        id: tournament.id,
        name: tournament.name,
        total_rounds: tournament.total_rounds,
        logo_url: tournament.logo_url,
        primary_color: tournament.primary_color,
      },
      round: roundNumber,
      matches: sanitizedMatches,
      syncedAt: new Date().toISOString(),
    },
    { headers: NO_CACHE_HEADERS },
  );
}

