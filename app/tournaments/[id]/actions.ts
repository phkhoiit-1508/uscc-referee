"use server";

import { parsePairings, type Pairing } from "@/lib/excel/parse-pairings";
import { RESULT_CODES, RESULT_KINDS } from "@/lib/result-rules";
import { requireReferee } from "@/lib/require-referee";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";

export type ImportPreviewState = {
  pairings?: Pairing[];
  errors?: string[];
  parseError?: string;
  fileName?: string;
};

export type ConfirmImportState = {
  success?: boolean;
  importedCount?: number;
  confirmError?: string;
};

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

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

  try {
    const result = await parsePairings(buffer);
    return { pairings: result.pairings, errors: result.errors, fileName: file.name };
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
  let pairings;
  try {
    const result = await parsePairings(buffer);
    if (!result.pairings.length) {
      return { confirmError: "Không tìm thấy bàn đấu hợp lệ trong file." };
    }
    pairings = result.pairings;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Lỗi không xác định";
    return { confirmError: `Parse thất bại: ${msg}` };
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("uscc_import_chess_results", {
    p_tournament_id: tournamentId,
    p_round: round,
    p_filename: typeof fileName === "string" ? fileName : file.name,
    p_actor: referee.userId,
    p_rows: pairings,
  });

  if (error) {
    const msg = error.message ?? "";
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
  if (!RESULT_KINDS.includes(resultKind as never)) return { error: "Loại kết quả không hợp lệ." };

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
  if (typeof resultKind !== "string" || !["normal", "forfeit", "absence", "adjudicated", "other"].includes(resultKind))
    return { error: "Loại kết quả không hợp lệ." };
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
    if (error.message.includes("MATCH_NOT_DISPUTED")) return { error: "Ván đấu không còn ở trạng thái tranh chấp. Hãy tải lại trang." };
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
