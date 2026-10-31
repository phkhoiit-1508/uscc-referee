type SearchPlayer = {
  full_name: string;
  external_id: string | null;
  club: string | null;
} | null;

export type SearchableMatch = {
  board_number: number;
  round_number?: number;
  status?: string;
  result_code?: string | null;
  result_kind?: string | null;
  white_player: SearchPlayer;
  black_player: SearchPlayer;
};

export type MatchColorFilter = "all" | "white" | "black";

export type MatchFilterOptions = {
  round?: number;
  query?: string;
  statusFilter?: string;
  resultFilter?: string;
  colorFilter?: MatchColorFilter;
};

/**
 * Strips Vietnamese diacritics (dấu) and normalizes case so referees can search
 * player names and clubs either with diacritics ("Nguyễn") or without ("nguyen").
 */
export function normalizeVietnameseText(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .trim()
    .toLocaleLowerCase("vi")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d");
}

function fieldMatchesQuery(
  fieldValue: string | null | undefined,
  rawQueryLower: string,
  foldedQuery: string,
): boolean {
  if (!fieldValue) return false;
  const lowerField = fieldValue.toLocaleLowerCase("vi");
  if (lowerField.includes(rawQueryLower)) {
    return true;
  }
  const foldedField = normalizeVietnameseText(fieldValue);
  return foldedField.includes(foldedQuery);
}

export function matchMatchesSearch(
  match: SearchableMatch,
  query: string,
  colorFilter: MatchColorFilter = "all",
): boolean {
  const rawQueryLower = query.trim().toLocaleLowerCase("vi");
  if (!rawQueryLower) return true;

  const foldedQuery = normalizeVietnameseText(query);

  const whiteFields = [
    match.white_player?.full_name,
    match.white_player?.external_id,
    match.white_player?.club,
  ];

  const blackFields = [
    match.black_player?.full_name,
    match.black_player?.external_id,
    match.black_player?.club,
  ];

  const candidateFields =
    colorFilter === "white"
      ? [String(match.board_number), ...whiteFields]
      : colorFilter === "black"
        ? [String(match.board_number), ...blackFields]
        : [String(match.board_number), ...whiteFields, ...blackFields];

  return candidateFields.some((value) =>
    fieldMatchesQuery(value, rawQueryLower, foldedQuery),
  );
}

export function filterMatches<T extends SearchableMatch>(
  matches: T[],
  options: MatchFilterOptions,
): T[] {
  const {
    round,
    query = "",
    statusFilter = "all",
    resultFilter = "all",
    colorFilter = "all",
  } = options;

  return matches.filter((match) => {
    if (typeof round === "number" && typeof match.round_number === "number") {
      if (match.round_number !== round) return false;
    }

    if (statusFilter && statusFilter !== "all") {
      if (statusFilter === "pending") {
        if (match.status !== "pending_white" && match.status !== "pending_black") {
          return false;
        }
      } else if (statusFilter === "exception") {
        if (match.status !== "disputed" && match.status !== "special_review") {
          return false;
        }
      } else if (match.status !== statusFilter) {
        return false;
      }
    }

    if (resultFilter && resultFilter !== "all") {
      if (resultFilter === "unscored") {
        if (match.result_code) return false;
      } else if (match.result_code !== resultFilter) {
        return false;
      }
    }

    return matchMatchesSearch(match, query, colorFilter);
  });
}
