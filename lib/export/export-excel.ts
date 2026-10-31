import ExcelJS from "exceljs";
import { RESULT_KIND_LABELS, type ResultKind } from "../result-rules.ts";

export type ExportExcelMatchRow = {
  id: string;
  round_number: number;
  board_number: number;
  status: string;
  result_code: string | null;
  result_kind: string | null;
  white_confirmed_at: string | null;
  black_confirmed_at: string | null;
  white_player: {
    full_name: string;
    club?: string | null;
    external_id?: string | null;
    source_id_type?: string | null;
  } | null;
  black_player: {
    full_name: string;
    club?: string | null;
    external_id?: string | null;
    source_id_type?: string | null;
  } | null;
  updated_at?: string;
};

export type GenerateExcelOptions = {
  tournamentName: string;
  round?: number;
  scope?: "official" | "all" | "audit";
};

const STATUS_LABELS: Record<string, string> = {
  unreported: "Chưa nhập",
  pending_white: "Chờ Trắng xác nhận",
  pending_black: "Chờ Đen xác nhận",
  disputed: "Tranh chấp",
  special_review: "Xét đặc biệt",
  official: "Chính thức",
  reopened: "Mở lại",
};

/**
 * Sanitizes cell text to prevent Excel Formula Injection (CSV/Formula Injection attack).
 * If a cell begins with '=', '+', '-', '@', prepend a single quote to force text interpretation.
 */
export function sanitizeExcelValue(value: string | null | undefined): string {
  if (value === null || value === undefined) return "";
  const str = String(value).trim();
  if (
    str.startsWith("=") ||
    str.startsWith("+") ||
    str.startsWith("-") ||
    str.startsWith("@") ||
    str.startsWith("\t") ||
    str.startsWith("\r")
  ) {
    return `'${str}`;
  }
  return str;
}

export async function generateUsccResultsExcel(
  matches: ExportExcelMatchRow[],
  options: GenerateExcelOptions,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "USCC Referee System";
  workbook.lastModifiedBy = "USCC Technical Referee";
  workbook.created = new Date();
  workbook.modified = new Date();

  const sheetName = options.round ? `Vòng ${options.round}` : "Toàn giải";
  const worksheet = workbook.addWorksheet(sheetName, {
    views: [{ showGridLines: true }],
  });

  // Title header rows
  worksheet.addRow([sanitizeExcelValue(options.tournamentName)]);
  worksheet.addRow([
    `Báo cáo kết quả: ${options.round ? `Vòng ${options.round}` : "Toàn bộ các vòng"} (${
      options.scope === "audit"
        ? "Bao gồm cả ván chờ xác nhận / tranh chấp"
        : "Kết quả chính thức"
    })`,
  ]);
  worksheet.addRow([
    `Thời điểm xuất: ${new Intl.DateTimeFormat("vi-VN", {
      timeZone: "Asia/Ho_Chi_Minh",
      dateStyle: "full",
      timeStyle: "medium",
    }).format(new Date())}`,
  ]);
  worksheet.addRow([]); // Blank row

  // Table Columns Header
  const headers = [
    "Giải đấu",
    "Vòng",
    "Bàn",
    "Kỳ thủ Trắng",
    "Mã Trắng",
    "Loại mã Trắng",
    "CLB Trắng",
    "Tỷ số",
    "Phân loại",
    "Kỳ thủ Đen",
    "Mã Đen",
    "Loại mã Đen",
    "CLB Đen",
    "Trạng thái",
    "Phương thức xác nhận",
    "Thời gian chốt",
  ];

  const headerRow = worksheet.addRow(headers);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF172C4C" },
  };

  // Filter matches based on scope and round
  let targetMatches = matches;
  if (options.round) {
    targetMatches = targetMatches.filter((m) => m.round_number === options.round);
  }
  if (options.scope !== "all" && options.scope !== "audit") {
    targetMatches = targetMatches.filter((m) => m.status === "official");
  }

  // Sort by round and board
  targetMatches = [...targetMatches].sort((a, b) => {
    if (a.round_number !== b.round_number) return a.round_number - b.round_number;
    return a.board_number - b.board_number;
  });

  for (const m of targetMatches) {
    const isDone = m.status === "official";
    const bothConfirmed = !!m.white_confirmed_at && !!m.black_confirmed_at;
    const confirmMethod = isDone
      ? bothConfirmed
        ? "Kỳ thủ Trắng và Đen xác nhận"
        : "Trọng tài kỹ thuật duyệt ngoại lệ"
      : "Chưa hoàn tất";

    const finalizedTime =
      isDone && (m.black_confirmed_at || m.updated_at)
        ? new Intl.DateTimeFormat("vi-VN", {
            timeZone: "Asia/Ho_Chi_Minh",
            dateStyle: "short",
            timeStyle: "medium",
          }).format(new Date(m.black_confirmed_at || m.updated_at!))
        : "—";

    worksheet.addRow([
      sanitizeExcelValue(options.tournamentName),
      m.round_number,
      m.board_number,
      sanitizeExcelValue(m.white_player?.full_name ?? "—"),
      sanitizeExcelValue(m.white_player?.external_id ?? "—"),
      m.white_player?.source_id_type ?? "unknown",
      sanitizeExcelValue(m.white_player?.club ?? "—"),
      sanitizeExcelValue(m.result_code ?? "—"),
      m.result_kind ? RESULT_KIND_LABELS[m.result_kind as ResultKind] ?? m.result_kind : "—",
      sanitizeExcelValue(m.black_player?.full_name ?? "—"),
      sanitizeExcelValue(m.black_player?.external_id ?? "—"),
      m.black_player?.source_id_type ?? "unknown",
      sanitizeExcelValue(m.black_player?.club ?? "—"),
      STATUS_LABELS[m.status] ?? m.status,
      confirmMethod,
      finalizedTime,
    ]);
  }

  // Adjust column widths automatically
  worksheet.columns.forEach((column) => {
    let maxLen = 12;
    column.eachCell?.({ includeEmpty: false }, (cell) => {
      const len = cell.value ? String(cell.value).length : 0;
      if (len > maxLen) maxLen = Math.min(len, 40);
    });
    column.width = maxLen + 3;
  });

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
