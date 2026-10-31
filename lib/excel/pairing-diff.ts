import type { MatchStatus } from "@/lib/result-rules";
import type { Pairing } from "./parse-pairings";

export type ExistingMatchSnapshot = {
  id: string;
  board_number: number;
  status: MatchStatus | string;
  result_code: string | null;
  white_player: { full_name: string; club?: string | null; external_id?: string | null } | null;
  black_player: { full_name: string; club?: string | null; external_id?: string | null } | null;
};

export type BoardDiffCategory =
  | "new"
  | "unchanged"
  | "swapped_colors"
  | "modified_players"
  | "missing_from_file"
  | "conflict_with_results";

export type BoardDiffItem = {
  board: number;
  category: BoardDiffCategory;
  existing?: ExistingMatchSnapshot;
  incoming?: Pairing;
  message: string;
  isConflict: boolean;
};

export type RoundDiffSummary = {
  round: number;
  totalIncoming: number;
  totalExisting: number;
  newBoards: BoardDiffItem[];
  unchangedBoards: BoardDiffItem[];
  swappedColorBoards: BoardDiffItem[];
  modifiedBoards: BoardDiffItem[];
  missingBoards: BoardDiffItem[];
  conflictBoards: BoardDiffItem[];
  hasConflicts: boolean;
  canSafelyApply: boolean;
};

function normalizeName(name: string | null | undefined): string {
  return (name ?? "").trim().toLowerCase();
}

/**
 * Computes a deterministic signature of a round's existing matches in the database.
 * Used to detect "stale preview" if another referee imports or enters results
 * between previewing a file and clicking Confirm Import.
 */
export function computeRoundStateSignature(
  existingMatches: ExistingMatchSnapshot[],
): string {
  if (!existingMatches.length) return "empty";
  return [...existingMatches]
    .sort((a, b) => a.board_number - b.board_number)
    .map(
      (m) =>
        `${m.board_number}:${m.status}:${m.result_code ?? ""}:${normalizeName(m.white_player?.full_name)}:${normalizeName(m.black_player?.full_name)}`,
    )
    .join("|");
}

export function isStaleRoundState(
  expectedSignature: string | null | undefined,
  currentMatches: ExistingMatchSnapshot[],
): boolean {
  if (!expectedSignature) return false;
  return computeRoundStateSignature(currentMatches) !== expectedSignature;
}

function playersMatch(
  existingName: string | null | undefined,
  incomingName: string | null | undefined,
): boolean {
  return normalizeName(existingName) === normalizeName(incomingName);
}

export function computeRoundDiff(
  round: number,
  existingMatches: ExistingMatchSnapshot[],
  incomingPairings: Pairing[],
): RoundDiffSummary {
  const existingMap = new Map<number, ExistingMatchSnapshot>();
  for (const match of existingMatches) {
    existingMap.set(match.board_number, match);
  }

  const incomingMap = new Map<number, Pairing>();
  for (const pairing of incomingPairings) {
    incomingMap.set(pairing.board, pairing);
  }

  const newBoards: BoardDiffItem[] = [];
  const unchangedBoards: BoardDiffItem[] = [];
  const swappedColorBoards: BoardDiffItem[] = [];
  const modifiedBoards: BoardDiffItem[] = [];
  const missingBoards: BoardDiffItem[] = [];
  const conflictBoards: BoardDiffItem[] = [];

  // Check all incoming pairings
  for (const incoming of incomingPairings) {
    const existing = existingMap.get(incoming.board);

    if (!existing) {
      newBoards.push({
        board: incoming.board,
        category: "new",
        incoming,
        message: `Bàn mới: ${incoming.whiteName} vs ${incoming.blackName}`,
        isConflict: false,
      });
      continue;
    }

    const whiteMatches = playersMatch(existing.white_player?.full_name, incoming.whiteName);
    const blackMatches = playersMatch(existing.black_player?.full_name, incoming.blackName);
    const isSwapped =
      playersMatch(existing.white_player?.full_name, incoming.blackName) &&
      playersMatch(existing.black_player?.full_name, incoming.whiteName);

    const hasActiveResults = existing.status !== "unreported";

    if (whiteMatches && blackMatches) {
      unchangedBoards.push({
        board: incoming.board,
        category: "unchanged",
        existing,
        incoming,
        message: `Bàn ${incoming.board} giữ nguyên: ${incoming.whiteName} vs ${incoming.blackName}`,
        isConflict: false,
      });
    } else if (hasActiveResults) {
      // Board already has official/pending/disputed result, but file changes the players!
      conflictBoards.push({
        board: incoming.board,
        category: "conflict_with_results",
        existing,
        incoming,
        message: `Xung đột: Bàn ${incoming.board} đã có trạng thái "${existing.status}" (tỷ số: ${existing.result_code || "đang chờ"}). Không thể thay đổi kỳ thủ từ file mới.`,
        isConflict: true,
      });
    } else if (isSwapped) {
      swappedColorBoards.push({
        board: incoming.board,
        category: "swapped_colors",
        existing,
        incoming,
        message: `Đổi bên: Trắng ↔ Đen trên bàn ${incoming.board}`,
        isConflict: false,
      });
    } else {
      modifiedBoards.push({
        board: incoming.board,
        category: "modified_players",
        existing,
        incoming,
        message: `Đổi kỳ thủ: Trước [${existing.white_player?.full_name} vs ${existing.black_player?.full_name}] → Mới [${incoming.whiteName} vs ${incoming.blackName}]`,
        isConflict: false,
      });
    }
  }

  // Check boards in existing DB that are missing from incoming file
  for (const existing of existingMatches) {
    if (!incomingMap.has(existing.board_number)) {
      const hasActiveResults = existing.status !== "unreported";
      if (hasActiveResults) {
        conflictBoards.push({
          board: existing.board_number,
          category: "conflict_with_results",
          existing,
          message: `Xung đột: Bàn ${existing.board_number} đang có trạng thái "${existing.status}" nhưng bị thiếu trong file mới. Không thể tự xóa ván đã có kết quả.`,
          isConflict: true,
        });
      } else {
        missingBoards.push({
          board: existing.board_number,
          category: "missing_from_file",
          existing,
          message: `Bàn ${existing.board_number} có trong cơ sở dữ liệu nhưng không xuất hiện trong file mới (ván chưa nhập kết quả).`,
          isConflict: false,
        });
      }
    }
  }

  const hasConflicts = conflictBoards.length > 0;
  const canSafelyApply = !hasConflicts && (newBoards.length > 0 || modifiedBoards.length > 0 || swappedColorBoards.length > 0 || unchangedBoards.length > 0);

  return {
    round,
    totalIncoming: incomingPairings.length,
    totalExisting: existingMatches.length,
    newBoards,
    unchangedBoards,
    swappedColorBoards,
    modifiedBoards,
    missingBoards,
    conflictBoards,
    hasConflicts,
    canSafelyApply,
  };
}

