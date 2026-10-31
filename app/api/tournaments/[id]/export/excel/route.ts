import { NextResponse, type NextRequest } from "next/server";
import { generateUsccResultsExcel, type ExportExcelMatchRow } from "@/lib/export/export-excel";
import { createClient } from "@/lib/supabase/server";

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
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "technical") {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const { data: tournament } = await supabase
    .from("tournaments")
    .select("id, name")
    .eq("id", id)
    .maybeSingle();

  if (!tournament) {
    return NextResponse.json({ error: "TOURNAMENT_NOT_FOUND" }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const roundParam = searchParams.get("round");
  const round = roundParam ? Number(roundParam) : undefined;
  const scope = (searchParams.get("scope") as "official" | "all" | "audit") || "official";

  let query = supabase
    .from("matches")
    .select(`
      id, round_number, board_number, status, result_code, result_kind,
      white_confirmed_at, black_confirmed_at, updated_at,
      white_player:players!white_same_tournament(full_name, club, external_id, source_id_type),
      black_player:players!black_same_tournament(full_name, club, external_id, source_id_type)
    `)
    .eq("tournament_id", id)
    .order("round_number")
    .order("board_number");

  if (round) {
    query = query.eq("round_number", round);
  }

  let { data: matches, error: matchesError } = await query;

  if (matchesError) {
    // Fallback if migration 010 (source_id_type) has not been applied yet
    let fallbackQuery = supabase
      .from("matches")
      .select(`
        id, round_number, board_number, status, result_code, result_kind,
        white_confirmed_at, black_confirmed_at, updated_at,
        white_player:players!white_same_tournament(full_name, club, external_id),
        black_player:players!black_same_tournament(full_name, club, external_id)
      `)
      .eq("tournament_id", id)
      .order("round_number")
      .order("board_number");
    if (round) {
      fallbackQuery = fallbackQuery.eq("round_number", round);
    }
    const fallbackRes = await fallbackQuery;
    matches = fallbackRes.data as never;
    matchesError = fallbackRes.error;
  }

  if (matchesError) {
    return NextResponse.json({ error: "FETCH_MATCHES_FAILED" }, { status: 500 });
  }

  const buffer = await generateUsccResultsExcel(
    (matches as unknown as ExportExcelMatchRow[]) ?? [],
    {
      tournamentName: tournament.name,
      round,
      scope,
    },
  );

  const safeFileName = tournament.name.replace(/[^a-zA-Z0-9_\u00C0-\u024F\u1E00-\u1EFF-]/g, "_");
  const fileName = `USCC_${safeFileName}_${round ? `Round${round}` : "All"}.xlsx`;

  return new NextResponse(buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(fileName)}"`,
      "Cache-Control": "private, no-cache, no-store, must-revalidate",
    },
  });
}

