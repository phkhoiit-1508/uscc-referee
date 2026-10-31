export type SourceIdType =
  | "swiss_unique_id"
  | "swiss_ident_no"
  | "swiss_start_rank_no"
  | "fide_id"
  | "unknown";

export type NormalizedPlayer = {
  name: string;
  club: string | null;
  sourceId: string | null;
  sourceIdType: SourceIdType;
  points?: number | null;
  rating?: number | null;
  isVerifiedIdentity: boolean;
};

export type NormalizedPairing = {
  board: number;
  white: NormalizedPlayer;
  black: NormalizedPlayer | null;
  sourceResult: string | null;
  resultKind?: string | null;
  sourceRow: number;
  sourceSheet: string;
  isBye: boolean;
};

/**
 * Infer the Swiss-Manager source ID type from column header label or pattern.
 */
export function inferSourceIdType(headerText: string): SourceIdType {
  const normalized = headerText.trim().toLowerCase();
  if (normalized === "sno" || normalized === "start-rank" || normalized === "số thăm" || normalized === "stt xuất phát") {
    return "swiss_start_rank_no";
  }
  if (normalized === "ident" || normalized === "identno" || normalized === "mã định danh" || normalized === "mã kỳ thủ") {
    return "swiss_ident_no";
  }
  if (normalized === "uniqueid" || normalized === "unique-id" || normalized === "mã duy nhất") {
    return "swiss_unique_id";
  }
  if (normalized === "fideid" || normalized === "fide id" || normalized === "mã fide") {
    return "fide_id";
  }
  if (normalized === "id" || normalized === "mã") {
    return "swiss_ident_no";
  }
  return "unknown";
}

/**
 * Checks if a player name or text indicates a Bye (miễn đấu).
 */
export function isByeIndicator(text: string | null | undefined): boolean {
  if (!text) return false;
  const clean = text.trim().toLowerCase();
  return (
    clean === "bye" ||
    clean === "miễn đấu" ||
    clean === "nghỉ đấu" ||
    clean === "half point bye" ||
    clean === "full point bye" ||
    clean === "1/2 bye"
  );
}

