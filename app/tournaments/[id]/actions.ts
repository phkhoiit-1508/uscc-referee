"use server";

import {
  computeRoundDiff,
  computeRoundStateSignature,
  isStaleRoundState,
  type RoundDiffSummary,
} from "@/lib/excel/pairing-diff";
import {
  parsePairings,
  type ColumnMapping,
  type DetectedColumn,
  type Pairing,
  type ParsePairingsOptions,
} from "@/lib/excel/parse-pairings";
import {
  RESULT_CODES,
  RESULT_KINDS,
  SUBMITTABLE_RESULT_KINDS,
  canCancel,
  type MatchStatus,
} from "@/lib/result-rules";
import { requireReferee } from "@/lib/require-referee";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";

export type ImportPreviewState = {
  pairings?: Pairing[];
  errors?: string[];
  warnings?: string[];
  hasBlockingErrors?: boolean;
  parseError?: string;
  fileName?: string;
  sheets?: string[];
  selectedSheet?: string;
  availableColumns?: DetectedColumn[];
  columnMapping?: ColumnMapping;
};

export type ConfirmImportState = {
  success?: boolean;
  importedCount?: number;
  confirmError?: string;
};

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

function extractParseOptions(formData: FormData): ParsePairingsOptions {
  const sheetNameRaw = formData.get("sheetName");
  const sheetName =
    typeof sheetNameRaw === "string" && sheetNameRaw.trim()
      ? sheetNameRaw.trim()
      : undefined;

  const parseCol = (key: string): number | undefined => {
    const val = formData.get(key);
    if (typeof val !== "string" || !val.trim()) return undefined;
    const num = Number(val);
    return Number.isInteger(num) && num > 0 ? num : undefined;
  };

  const columnOverrides: Partial<ColumnMapping> = {};
  const boardCol = parseCol("boardCol");
  const whiteNameCol = parseCol("whiteNameCol");
  const whiteClubCol = parseCol("whiteClubCol");
  const whiteIdCol = parseCol("whiteIdCol");
  const resultCol = parseCol("resultCol");
  const blackNameCol = parseCol("blackNameCol");
  const blackClubCol = parseCol("blackClubCol");
  const blackIdCol = parseCol("blackIdCol");

  if (boardCol !== undefined) columnOverrides.boardCol = boardCol;
  if (whiteNameCol !== undefined) columnOverrides.whiteNameCol = whiteNameCol;
  if (whiteClubCol !== undefined) columnOverrides.whiteClubCol = whiteClubCol;
  if (whiteIdCol !== undefined) columnOverrides.whiteIdCol = whiteIdCol;
  if (resultCol !== undefined) columnOverrides.resultCol = resultCol;
  if (blackNameCol !== undefined) columnOverrides.blackNameCol = blackNameCol;
  if (blackClubCol !== undefined) columnOverrides.blackClubCol = blackClubCol;
  if (blackIdCol !== undefined) columnOverrides.blackIdCol = blackIdCol;

  return {
    sheetName,
    columnOverrides:
      Object.keys(columnOverrides).length > 0 ? columnOverrides : undefined,
  };
}

export async function previewImport(
  _state: ImportPreviewState,
  formData: FormData,
): Promise<ImportPreviewState> {
  try {
    await requireReferee(["technical"]);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      redirect("/login");
    }
    return { parseError: "Chỉ trọng tài kỹ thuật được import lịch thi đấu." };
  }

  const file = formData.get("file");

  if (!(file instanceof File) || !file.name) {
    return { parseError: "Chưa chọn file." };
  }

  if (!file.name.endsWith(".xlsx")) {
    return { parseError: "Chỉ hỗ trợ file .xlsx." };
  }

  if (file.size > MAX_BYTES) {
    return { parseError: "File quá lớn (tối đa 5 MB)." };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const parseOptions = extractParseOptions(formData);

  try {
    const result = await parsePairings(buffer, parseOptions);
    return {
      pairings: result.pairings,
      errors: result.errors,
      warnings: result.warnings,
      hasBlockingErrors: result.hasBlockingErrors,
      fileName: file.name,
      sheets: result.sheets,
      selectedSheet: result.selectedSheet,
      availableColumns: result.availableColumns,
      columnMapping: result.columnMapping,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Lỗi không xác định";
    return { parseError: msg };
  }
}

export async function confirmImport(
  _state: ConfirmImportState,
  formData: FormData,
): Promise<ConfirmImportState> {
  let referee;
  try {
    referee = await requireReferee(["technical"]);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      redirect("/login");
    }
    return { confirmError: "Chỉ trọng tài kỹ thuật được import lịch thi đấu." };
  }

  const tournamentId = formData.get("tournamentId");
  const roundStr = formData.get("round");
  const fileName = formData.get("fileName");
  const file = formData.get("file");

  if (typeof tournamentId !== "string" || !tournamentId) {
    return { confirmError: "Thiếu thông tin giải đấu." };
  }

  const round = Number(roundStr);
  if (!Number.isInteger(round) || round < 1) {
    return { confirmError: "Số vòng không hợp lệ." };
  }

  if (!(file instanceof File) || !file.name.endsWith(".xlsx") || file.size > 5 * 1024 * 1024) {
    return { confirmError: "File không hợp lệ. Vui lòng xem trước lại." };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const parseOptions = extractParseOptions(formData);
  const expectedRoundSignature = formData.get("expectedRoundSignature");
  let pairings;
  try {
    const result = await parsePairings(buffer, parseOptions);
    if (!result.pairings.length) {
      return { confirmError: "Không tìm thấy bàn đấu hợp lệ trong file." };
    }
    if (result.hasBlockingErrors) {
      return {
        confirmError: `File có ${result.errors.length} lỗi cần sửa trước khi nhập. Vui lòng kiểm tra lại file.`,
      };
    }
    pairings = result.pairings;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Lỗi không xác định";
    return { confirmError: `Parse thất bại: ${msg}` };
  }

  const admin = createAdminClient();

  // Stage 8: Check existing matches in DB using computeRoundDiff to protect active results and detect stale preview
  const { data: existingMatches } = await admin
    .from("matches")
    .select(`
      id, board_number, status, result_code,
      white_player:players!white_same_tournament(full_name, club, external_id),
      black_player:players!black_same_tournament(full_name, club, external_id)
    `)
    .eq("tournament_id", tournamentId)
    .eq("round_number", round);

  if (
    typeof expectedRoundSignature === "string" &&
    expectedRoundSignature.length > 0 &&
    isStaleRoundState(expectedRoundSignature, (existingMatches as never) ?? [])
  ) {
    return {
      confirmError:
        "Dữ liệu vòng đấu đã thay đổi kể từ lúc xem trước (stale preview). Vui lòng xem trước lại trước khi xác nhận nhập.",
    };
  }

  if (existingMatches && existingMatches.length > 0) {
    const diff = computeRoundDiff(round, (existingMatches as never) ?? [], pairings);
    if (diff.hasConflicts) {
      const conflictMsg = diff.conflictBoards.map((c) => c.message).join(" | ");
      return {
        confirmError: `Không thể cập nhật vòng ${round}: Xung đột dữ liệu đã có kết quả. ${conflictMsg}`,
      };
    }
  }

  const { data, error } = await admin.rpc("uscc_import_chess_results", {
    p_tournament_id: tournamentId,
    p_round: round,
    p_filename: typeof fileName === "string" ? fileName : file.name,
    p_actor: referee.userId,
    p_rows: pairings,
  });

  if (error) {
    const msg = error.message ?? "";
    if (msg.includes("CANNOT_OVERWRITE_MATCH_WITH_RESULTS")) {
      return { confirmError: "Không thể cập nhật vòng: Bàn đấu đã có kết quả và không thể thay đổi kỳ thủ." };
    }
    if (msg.includes("CANNOT_OMIT_MATCH_WITH_RESULTS")) {
      return { confirmError: "Không thể cập nhật vòng: File mới thiếu các bàn đấu đã có kết quả." };
    }
    if (msg.includes("ROUND_ALREADY_HAS_MATCHES")) {
      return { confirmError: "Vòng này đã có cặp đấu. Không thể nhập lại." };
    }
    if (msg.includes("ROUND_OUT_OF_RANGE")) {
      return { confirmError: "Số vòng vượt quá tổng số vòng của giải." };
    }
    if (msg.includes("TOURNAMENT_NOT_FOUND")) {
      return { confirmError: "Không tìm thấy giải đấu." };
    }
    return { confirmError: `Lưu thất bại: ${msg}` };
  }

  return { success: true, importedCount: data as number };
}

export type CheckDiffResult = {
  diff?: RoundDiffSummary;
  roundStateSignature?: string;
  error?: string;
};

export async function checkRoundDiffAction(
  tournamentId: string,
  round: number,
  pairings: Pairing[],
): Promise<CheckDiffResult> {
  try {
    await requireReferee(["technical"]);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") redirect("/login");
    return { error: "Chỉ trọng tài kỹ thuật được kiểm tra diff vòng." };
  }

  if (!Number.isInteger(round) || round < 1) {
    return { error: "Số vòng không hợp lệ." };
  }

  const admin = createAdminClient();
  const { data: existingMatches, error } = await admin
    .from("matches")
    .select(`
      id, board_number, status, result_code,
      white_player:players!white_same_tournament(full_name, club, external_id),
      black_player:players!black_same_tournament(full_name, club, external_id)
    `)
    .eq("tournament_id", tournamentId)
    .eq("round_number", round);

  if (error) {
    return { error: "Không tải được danh sách ván đấu hiện có." };
  }

  const snapshots = (existingMatches as never) ?? [];
  const diff = computeRoundDiff(round, snapshots, pairings);
  const roundStateSignature = computeRoundStateSignature(snapshots);
  return { diff, roundStateSignature };
}

export type SubmitResultState = {
  success?: boolean;
  error?: string;
};

export async function submitResult(
  _state: SubmitResultState,
  formData: FormData,
): Promise<SubmitResultState> {
  let referee;
  try {
    referee = await requireReferee(["technical", "recorder"]);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") redirect("/login");
    return { error: "Bạn không có quyền nhập kết quả." };
  }

  const matchId = formData.get("matchId");
  const resultCode = formData.get("resultCode");
  const resultKind = formData.get("resultKind") ?? "normal";

  if (typeof matchId !== "string" || !matchId) return { error: "Thiếu ID ván đấu." };
  if (!RESULT_CODES.includes(resultCode as never)) return { error: "Kết quả không hợp lệ." };
  if (!SUBMITTABLE_RESULT_KINDS.includes(resultKind as never)) {
    return { error: "Loại kết quả không hỗ trợ nhập trực tiếp." };
  }

  const admin = createAdminClient();
  const { error } = await admin.rpc("uscc_submit_result", {
    p_match_id: matchId,
    p_actor: referee.userId,
    p_result_code: resultCode,
    p_result_kind: resultKind,
  });

  if (error) {
    const msg = error.message ?? "";
    if (msg.includes("MATCH_NOT_SUBMITTABLE")) return { error: "Ván đấu không thể nhập kết quả ở trạng thái hiện tại." };
    if (msg.includes("MATCH_NOT_FOUND")) return { error: "Không tìm thấy ván đấu." };
    return { error: `Lỗi: ${msg}` };
  }

  return { success: true };
}

export type ConfirmSideState = {
  success?: boolean;
  disputed?: boolean;
  error?: string;
};

export async function confirmSide(
  _state: ConfirmSideState,
  formData: FormData,
): Promise<ConfirmSideState> {
  let referee;
  try {
    referee = await requireReferee(["technical", "recorder"]);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") redirect("/login");
    return { error: "Bạn không có quyền xác nhận kết quả." };
  }

  const matchId = formData.get("matchId");
  const side = formData.get("side");
  const agreed = formData.get("agreed") === "true";

  if (typeof matchId !== "string" || !matchId) return { error: "Thiếu ID ván đấu." };
  if (side !== "white" && side !== "black") return { error: "Bên xác nhận không hợp lệ." };

  const admin = createAdminClient();
  const { error } = await admin.rpc("uscc_confirm_result", {
    p_match_id: matchId,
    p_actor: referee.userId,
    p_player_side: side,
    p_agreed: agreed,
  });

  if (error) {
    const msg = error.message ?? "";
    if (msg.includes("CONFIRMATION_OUT_OF_ORDER")) return { error: "Chưa đến lượt xác nhận của bên này." };
    if (msg.includes("MATCH_NOT_FOUND")) return { error: "Không tìm thấy ván đấu." };
    return { error: `Lỗi: ${msg}` };
  }

  return agreed ? { success: true } : { disputed: true };
}

export type TechnicalResultState = { success?: boolean; error?: string };

export async function resolveDispute(
  _state: TechnicalResultState,
  formData: FormData,
): Promise<TechnicalResultState> {
  let referee;
  try {
    referee = await requireReferee(["technical"]);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") redirect("/login");
    return { error: "Chỉ trọng tài kỹ thuật được phân xử tranh chấp." };
  }

  const matchId = formData.get("matchId");
  const resultCode = formData.get("resultCode");
  const resultKind = formData.get("resultKind");
  const reason = formData.get("reason");
  if (typeof matchId !== "string" || !matchId) return { error: "Thiếu ID ván đấu." };
  if (typeof resultCode !== "string" || !RESULT_CODES.includes(resultCode as (typeof RESULT_CODES)[number]))
    return { error: "Kết quả không hợp lệ." };
  if (
    typeof resultKind !== "string" ||
    !RESULT_KINDS.includes(resultKind as (typeof RESULT_KINDS)[number])
  ) {
    return { error: "Loại kết quả không hợp lệ." };
  }
  if (typeof reason !== "string" || !reason.trim() || reason.trim().length > 1000)
    return { error: "Lý do phải có từ 1 đến 1000 ký tự." };

  const { error } = await createAdminClient().rpc("uscc_resolve_dispute", {
    p_match_id: matchId,
    p_actor: referee.userId,
    p_result_code: resultCode,
    p_result_kind: resultKind,
    p_reason: reason.trim(),
  });
  if (error) {
    if (error.message.includes("MATCH_NOT_REVIEWABLE")) {
      return { error: "Ván đấu không còn chờ technical xử lý. Hãy tải lại trang." };
    }
    if (error.message.includes("MATCH_NOT_FOUND")) return { error: "Không tìm thấy ván đấu." };
    return { error: "Không thể phân xử. Hãy thử lại hoặc liên hệ quản trị viên." };
  }
  return { success: true };
}

export async function reopenResult(
  _state: TechnicalResultState,
  formData: FormData,
): Promise<TechnicalResultState> {
  let referee;
  try {
    referee = await requireReferee(["technical"]);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") redirect("/login");
    return { error: "Chỉ trọng tài kỹ thuật được mở lại kết quả." };
  }

  const matchId = formData.get("matchId");
  const reason = formData.get("reason");
  if (typeof matchId !== "string" || !matchId) return { error: "Thiếu ID ván đấu." };
  if (typeof reason !== "string" || !reason.trim() || reason.trim().length > 1000)
    return { error: "Lý do phải có từ 1 đến 1000 ký tự." };

  const { error } = await createAdminClient().rpc("uscc_reopen_result", {
    p_match_id: matchId,
    p_actor: referee.userId,
    p_reason: reason.trim(),
  });
  if (error) {
    if (error.message.includes("MATCH_NOT_OFFICIAL")) return { error: "Ván đấu không còn chính thức. Hãy tải lại trang." };
    if (error.message.includes("MATCH_NOT_FOUND")) return { error: "Không tìm thấy ván đấu." };
    return { error: "Không thể mở lại kết quả. Hãy thử lại hoặc liên hệ quản trị viên." };
  }
  return { success: true };
}

export async function cancelResult(
  _state: TechnicalResultState,
  formData: FormData,
): Promise<TechnicalResultState> {
  let referee;
  try {
    referee = await requireReferee(["technical"]);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") redirect("/login");
    return { error: "Chỉ trọng tài kỹ thuật được hủy kết quả." };
  }

  const matchId = formData.get("matchId");
  const expectedStatus = formData.get("expectedStatus");
  const reason = formData.get("reason");
  if (typeof matchId !== "string" || !matchId) return { error: "Thiếu ID ván đấu." };
  if (typeof expectedStatus !== "string" || !canCancel(expectedStatus as MatchStatus))
    return { error: "Ván đấu không ở trạng thái có thể hủy." };
  if (typeof reason !== "string" || !reason.trim() || reason.trim().length > 1000)
    return { error: "Lý do phải có từ 1 đến 1000 ký tự." };

  // The actor comes from the session, never from the form.
  const { error } = await createAdminClient().rpc("uscc_cancel_result", {
    p_match_id: matchId,
    p_actor: referee.userId,
    p_expected_status: expectedStatus,
    p_reason: reason.trim(),
  });
  if (error) {
    if (error.message.includes("MATCH_STATE_CHANGED"))
      return { error: "Trạng thái ván đấu vừa thay đổi. Hãy tải lại trang trước khi hủy." };
    if (error.message.includes("MATCH_NOT_CANCELLABLE")) return { error: "Ván đấu không có kết quả để hủy." };
    if (error.message.includes("MATCH_NOT_FOUND")) return { error: "Không tìm thấy ván đấu." };
    if (error.message.includes("TECHNICAL_REFEREE_REQUIRED")) return { error: "Chỉ trọng tài kỹ thuật được hủy kết quả." };
    return { error: "Không thể hủy kết quả. Dữ liệu chưa thay đổi." };
  }
  return { success: true };
}
