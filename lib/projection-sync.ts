import type { ResultKind } from "@/lib/result-rules";

export type OfficialMatch = {
  id: string;
  round_number: number;
  board_number: number;
  status?: string;
  result_code: string | null;
  result_kind: ResultKind | null;
  white_player: { full_name: string } | null;
  black_player: { full_name: string } | null;
};

export type ConnectionStatus = "loading" | "connected" | "disconnected";

export type ProjectionSyncState = {
  selectedRound: number;
  matches: OfficialMatch[];
  connectionStatus: ConnectionStatus;
  lastSuccessfulSync: string | null;
  lastRequestId: number;
  errorMessage: string | null;
};

export type MatchWithStatus = {
  id: string;
  round_number: number;
  board_number: number;
  status: string;
  result_code: string | null;
  result_kind: string | null;
  white_player?: { full_name: string } | null;
  black_player?: { full_name: string } | null;
};

/**
 * Filter only official matches.
 */
export function filterOfficialMatches<T extends MatchWithStatus>(matches: T[]): T[] {
  return matches.filter(
    (m) =>
      m.status === "official" &&
      typeof m.result_code === "string" &&
      m.result_code.length > 0,
  );
}

/**
 * Sanitizes matches for projection display according to PRD FR-03 & FR-06:
 * - All round pairings are displayed so spectators & arbiters see every board.
 * - Non-official matches (unreported, pending, disputed, reopened) have their result_code & result_kind masked to null
 *   so unconfirmed scores are never published as official results.
 */
export function sanitizeMatchesForProjection<T extends MatchWithStatus>(
  matches: T[],
): (Omit<T, "result_code" | "result_kind"> & {
  result_code: string | null;
  result_kind: ResultKind | null;
})[] {
  return matches.map((m) => {
    const isOfficial =
      m.status === "official" &&
      typeof m.result_code === "string" &&
      m.result_code.length > 0;

    return {
      ...m,
      result_code: isOfficial ? m.result_code : null,
      result_kind: isOfficial ? (m.result_kind as ResultKind) : null,
    };
  });
}

/**
 * Filter matches by specific round.
 */
export function filterMatchesByRound<T extends { round_number: number }>(
  matches: T[],
  round: number,
): T[] {
  return matches.filter((m) => m.round_number === round);
}

export function createInitialSyncState(
  initialRound: number,
  initialMatches: OfficialMatch[] = [],
  initialSyncedAt: string | null = null,
): ProjectionSyncState {
  return {
    selectedRound: initialRound,
    matches: initialMatches,
    connectionStatus: initialSyncedAt ? "connected" : "loading",
    lastSuccessfulSync: initialSyncedAt,
    lastRequestId: 0,
    errorMessage: null,
  };
}

/**
 * Handles incoming sync success response.
 * Discards responses from stale requests (e.g. from an earlier round or older poll tick).
 */
export function handleSyncSuccess(
  prevState: ProjectionSyncState,
  payload: {
    matches: OfficialMatch[];
    round: number;
    syncedAt: string;
    requestId: number;
  },
): ProjectionSyncState {
  // If this response belongs to an outdated request or a different round, ignore it to prevent race conditions.
  if (payload.requestId < prevState.lastRequestId || payload.round !== prevState.selectedRound) {
    return prevState;
  }

  return {
    ...prevState,
    matches: payload.matches,
    connectionStatus: "connected",
    lastSuccessfulSync: payload.syncedAt,
    errorMessage: null,
  };
}

/**
 * Handles sync failure (network drop, timeout, server error).
 * CRITICAL RULE: NEVER reset lastSuccessfulSync to null on failure. Keep the previous timestamp.
 */
export function handleSyncFailure(
  prevState: ProjectionSyncState,
  error: { message?: string; requestId?: number } = {},
): ProjectionSyncState {
  if (error.requestId !== undefined && error.requestId < prevState.lastRequestId) {
    return prevState;
  }

  return {
    ...prevState,
    connectionStatus: "disconnected",
    // Keep lastSuccessfulSync intact!
    errorMessage: error.message || "Mất kết nối — dữ liệu có thể chưa cập nhật",
  };
}

/**
 * Handles round change initiated by the user.
 * Increments lastRequestId to invalidate any pending in-flight requests from the previous round.
 */
export function handleRoundChange(
  prevState: ProjectionSyncState,
  newRound: number,
  totalRounds: number,
): { state: ProjectionSyncState; newRequestId: number } {
  const targetRound = Math.max(1, Math.min(newRound, totalRounds));
  const newRequestId = prevState.lastRequestId + 1;

  return {
    state: {
      ...prevState,
      selectedRound: targetRound,
      // Clear previous round matches so stale round data is never shown as current round data.
      matches: [],
      lastRequestId: newRequestId,
      connectionStatus: "loading",
      errorMessage: null,
    },
    newRequestId,
  };
}

