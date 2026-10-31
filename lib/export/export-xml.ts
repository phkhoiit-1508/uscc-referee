import type { ResultKind } from "@/lib/result-rules";

export type SwissIdType = "swiss_start_rank_no" | "swiss_ident_no" | "swiss_unique_id";

export type ExportableMatch = {
  id: string;
  tournament_id?: string;
  round_number: number;
  board_number: number;
  status: string;
  result_code: string | null;
  result_kind: ResultKind | string | null;
  white_player: {
    id?: string;
    full_name: string;
    external_id?: string | null;
    source_id_type?: string | null;
    is_verified_identity?: boolean | null;
  } | null;
  black_player: {
    id?: string;
    full_name: string;
    external_id?: string | null;
    source_id_type?: string | null;
    is_verified_identity?: boolean | null;
  } | null;
};

export type IneligibleMatchReason = {
  matchId: string;
  board: number;
  round: number;
  reason: string;
};

export type XmlExportResult = {
  xml: string;
  exportedCount: number;
  ineligibleMatches: IneligibleMatchReason[];
  compatibilityLevel: "schema_valid" | "mapping_ready" | "round_trip_verified";
};

/**
 * Escapes special XML characters according to XML 1.0 standard.
 */
export function escapeXml(unsafe: string | number | null | undefined): string {
  if (unsafe === null || unsafe === undefined) return "";
  return String(unsafe)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Maps USCC result code and kind to Swiss-Manager XML Res code.
 * Heinz Herzog Swiss-Manager XML Import Specification:
 * - 1-0: "1-0"
 * - 0-1: "0-1"
 * - 1/2-1/2: "1/2"  (NOTE: 1/2, not 1/2-1/2)
 * - Forfeits: "1-0F", "0-1F", "0-0F"
 */
export function mapToSwissManagerResultCode(
  resultCode: string | null,
  resultKind: string | null,
): string | null {
  if (!resultCode) return null;

  const isForfeit = resultKind === "forfeit" || resultKind === "absence";

  if (resultCode === "1-0") {
    return isForfeit ? "1-0F" : "1-0";
  }
  if (resultCode === "0-1") {
    return isForfeit ? "0-1F" : "0-1";
  }
  if (resultCode === "1/2-1/2" || resultCode === "1/2") {
    return isForfeit ? "0-0F" : "1/2";
  }
  if (resultCode === "0-0" || resultCode === "0-0F") {
    return "0-0F";
  }

  return null;
}

const VALID_SWISS_ID_TYPES: ReadonlySet<string> = new Set([
  "swiss_start_rank_no",
  "swiss_ident_no",
  "swiss_unique_id",
]);

/**
 * Determines which Swiss-Manager ID attribute pair to use.
 * Both players must have an ID of the exact same valid Swiss-Manager system:
 * - SNo: PlayerWhiteSNo / PlayerBlackSNo
 * - Id: PlayerWhiteId / PlayerBlackId
 * - UniqueId: PlayerWhiteUniqueId / PlayerBlackUniqueId
 */
export function resolveSwissIdAttributes(
  white: ExportableMatch["white_player"],
  black: ExportableMatch["black_player"],
): { whiteAttr: string; blackAttr: string; whiteVal: string; blackVal: string } | null {
  const wVal = white?.external_id?.trim();
  const bVal = black?.external_id?.trim();
  if (!wVal || !bVal) return null;

  // Gate 5: Reject unverified identity or self-matching ID
  if (
    white?.is_verified_identity === false ||
    black?.is_verified_identity === false ||
    wVal === bVal
  ) {
    return null;
  }

  const wType = white?.source_id_type ?? "swiss_start_rank_no";
  const bType = black?.source_id_type ?? "swiss_start_rank_no";

  // Gate 3 & 5: Must be a genuine Swiss-Manager ID system (reject 'unknown' or 'fide_id')
  if (!VALID_SWISS_ID_TYPES.has(wType) || !VALID_SWISS_ID_TYPES.has(bType)) {
    return null;
  }

  // Gate 4: Must match the same ID system
  if (wType !== bType) {
    return null;
  }

  if (wType === "swiss_unique_id") {
    return {
      whiteAttr: "PlayerWhiteUniqueId",
      blackAttr: "PlayerBlackUniqueId",
      whiteVal: wVal,
      blackVal: bVal,
    };
  }

  if (wType === "swiss_ident_no") {
    return {
      whiteAttr: "PlayerWhiteId",
      blackAttr: "PlayerBlackId",
      whiteVal: wVal,
      blackVal: bVal,
    };
  }

  return {
    whiteAttr: "PlayerWhiteSNo",
    blackAttr: "PlayerBlackSNo",
    whiteVal: wVal,
    blackVal: bVal,
  };
}

/**
 * Generates Swiss-Manager compliant XML for match results.
 * Strictly checks the 7 eligibility gates.
 */
export function generateSwissManagerXml(
  matches: ExportableMatch[],
  options: { round?: number; tournamentId?: string } = {},
): XmlExportResult {
  const ineligibleMatches: IneligibleMatchReason[] = [];
  const validElements: string[] = [];

  const filteredMatches = options.round
    ? matches.filter((m) => m.round_number === options.round)
    : matches;

  for (const m of filteredMatches) {
    // Gate 6: Round and board must belong to the tournament and be valid positive integers
    if (
      !Number.isInteger(m.round_number) ||
      m.round_number < 1 ||
      !Number.isInteger(m.board_number) ||
      m.board_number < 1 ||
      (options.tournamentId && m.tournament_id && m.tournament_id !== options.tournamentId)
    ) {
      ineligibleMatches.push({
        matchId: m.id,
        board: m.board_number,
        round: m.round_number,
        reason: "Vòng đấu, số bàn hoặc mã giải đấu không hợp lệ.",
      });
      continue;
    }

    // Gate 1: Match must be official
    if (m.status !== "official") {
      ineligibleMatches.push({
        matchId: m.id,
        board: m.board_number,
        round: m.round_number,
        reason: `Trạng thái ván là "${m.status}", chỉ kết quả chính thức (official) mới được xuất XML.`,
      });
      continue;
    }

    // Gate 2: Both players must be present and not a bye
    if (!m.white_player || !m.black_player || m.result_kind === "bye") {
      ineligibleMatches.push({
        matchId: m.id,
        board: m.board_number,
        round: m.round_number,
        reason: "Ván đấu thiếu thông tin kỳ thủ (hoặc ván miễn đấu/bye không có đối thủ).",
      });
      continue;
    }

    // Gate 5: Identity must not rely on unverified name-uniqueness assumption
    if (
      m.white_player.is_verified_identity === false ||
      m.black_player.is_verified_identity === false ||
      m.white_player.source_id_type === "unknown" ||
      m.black_player.source_id_type === "unknown"
    ) {
      ineligibleMatches.push({
        matchId: m.id,
        board: m.board_number,
        round: m.round_number,
        reason: "Danh tính kỳ thủ chưa xác thực hoặc mã không phải hệ mã Swiss-Manager (không suy diễn theo tên).",
      });
      continue;
    }

    // Gate 3 & 4: Both players must have matching Swiss-Manager IDs
    const idAttrs = resolveSwissIdAttributes(m.white_player, m.black_player);
    if (!idAttrs) {
      ineligibleMatches.push({
        matchId: m.id,
        board: m.board_number,
        round: m.round_number,
        reason: "Kỳ thủ chưa có mã Swiss-Manager hợp lệ hoặc hai bên không dùng chung hệ mã định danh.",
      });
      continue;
    }

    // Gate 7: Result code mapping
    const res = mapToSwissManagerResultCode(m.result_code, m.result_kind);
    if (!res) {
      ineligibleMatches.push({
        matchId: m.id,
        board: m.board_number,
        round: m.round_number,
        reason: `Ký hiệu tỷ số "${m.result_code}" không thể ánh xạ sang đặc tả Swiss-Manager.`,
      });
      continue;
    }

    validElements.push(
      `  <Result Round="${escapeXml(m.round_number)}" ${idAttrs.whiteAttr}="${escapeXml(idAttrs.whiteVal)}" ${idAttrs.blackAttr}="${escapeXml(idAttrs.blackVal)}" Res="${escapeXml(res)}" />`,
    );
  }

  const xmlLines = [
    '<?xml version="1.0" encoding="utf-8"?>',
    "<Results>",
    ...validElements,
    "</Results>",
  ];

  const compatibilityLevel =
    validElements.length > 0 && ineligibleMatches.length === 0
      ? "mapping_ready"
      : "schema_valid";

  return {
    xml: xmlLines.join("\n"),
    exportedCount: validElements.length,
    ineligibleMatches,
    compatibilityLevel,
  };
}

