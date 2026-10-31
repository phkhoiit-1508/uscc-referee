import { NextResponse, type NextRequest } from "next/server";
import { groupEventsByMatch, type ResultEvent } from "@/lib/result-history";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const NO_CACHE_HEADERS = {
  "Cache-Control": "private, no-cache, no-store, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

export async function GET(
  _request: NextRequest,
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

  if (!profile || (profile.role !== "technical" && profile.role !== "recorder")) {
    return NextResponse.json(
      { error: "FORBIDDEN" },
      { status: 403, headers: NO_CACHE_HEADERS },
    );
  }

  const isTechnical = profile.role === "technical";

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

  if (matchesError) {
    return NextResponse.json(
      { error: "FETCH_MATCHES_FAILED" },
      { status: 500, headers: NO_CACHE_HEADERS },
    );
  }

  let historyByMatch: Record<string, ResultEvent[]> = {};
  if (isTechnical) {
    const { data: events, error: eventsError } = await supabase
      .from("result_events")
      .select("id, match_id, actor_user_id, event_type, player_side, old_data, new_data, reason, created_at, matches!inner(tournament_id)")
      .eq("matches.tournament_id", id)
      .order("created_at")
      .order("id");

    if (!eventsError && events) {
      const actorIds = [...new Set(events.map((e) => e.actor_user_id).filter(Boolean))] as string[];
      const names = new Map<string, string>();
      if (actorIds.length) {
        const { data: profiles } = await createAdminClient()
          .from("profiles")
          .select("id, full_name")
          .in("id", actorIds);
        for (const p of profiles ?? []) names.set(p.id, p.full_name);
      }
      historyByMatch = groupEventsByMatch(
        events.map((e) => ({
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
  }

  return NextResponse.json(
    {
      matches: matches ?? [],
      historyByMatch,
      isTechnical,
      syncedAt: new Date().toISOString(),
    },
    { headers: NO_CACHE_HEADERS },
  );
}

