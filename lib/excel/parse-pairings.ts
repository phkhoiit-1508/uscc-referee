import ExcelJS from "exceljs";
import {
  inferSourceIdType,
  isByeIndicator,
  type SourceIdType,
} from "./normalized-pairing.ts";

export type Pairing = {
  board: number;
  whiteName: string;
  whiteClub: string;
  whiteExternalId?: string | null;
  whiteIdType?: SourceIdType;
  blackName: string;
  blackClub: string;
  blackExternalId?: string | null;
  blackIdType?: SourceIdType;
  sourceResult: string;
  isBye?: boolean;
};

export type ParseIssueType = "error" | "warning";

export type ParseIssue = {
  sheet: string;
  row: number;
  column: string;
  message: string;
  type: ParseIssueType;
  formatted: string;
};

export type ColumnMapping = {
  boardCol: number;
  whiteNameCol: number;
  whiteClubCol: number;
  whiteIdCol: number | null;
  whiteIdType: SourceIdType;
  resultCol: number;
  blackNameCol: number;
  blackClubCol: number;
  blackIdCol: number | null;
  blackIdType: SourceIdType;
};

export type DetectedColumn = {
  col: number;
  letter: string;
  header: string;
};

export type ParsePairingsOptions = {
  sheetName?: string;
  columnOverrides?: Partial<ColumnMapping>;
};

export type ParseResult = {
  headerRow: number;
  count: number;
  pairings: Pairing[];
  errors: string[];
  warnings: string[];
  issues: ParseIssue[];
  hasBlockingErrors: boolean;
  sheets?: string[];
  selectedSheet?: string;
  availableColumns?: DetectedColumn[];
  columnMapping?: ColumnMapping;
};

export function getExcelColumnLetter(colIndex: number): string {
  let letter = "";
  let temp = colIndex;
  while (temp > 0) {
    const remainder = (temp - 1) % 26;
    letter = String.fromCharCode(65 + remainder) + letter;
    temp = Math.floor((temp - 1) / 26);
  }
  return letter || "A";
}

function detectHeaderColumns(
  sheet: ExcelJS.Worksheet,
): { headerRow: number; mapping: ColumnMapping } | null {
  let headerRow = 0;
  let mapping: ColumnMapping | null = null;

  sheet.eachRow((row, rowNumber) => {
    if (headerRow) return;

    let bCol = 0;
    let wNameCol = 0;
    let blNameCol = 0;
    let resCol = 0;
    let wClubCol = 0;
    let blClubCol = 0;
    let wIdCol: number | null = null;
    let blIdCol: number | null = null;

    const rowValues: { col: number; text: string }[] = [];
    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      rowValues.push({ col: colNumber, text: cell.text.trim() });
    });

    let wIdType: SourceIdType = "unknown";
    let blIdType: SourceIdType = "unknown";

    for (const { col, text } of rowValues) {
      const lower = text.toLowerCase();
      if (lower === "bàn" || lower === "bo." || lower === "board") {
        if (!bCol) bCol = col;
      } else if (
        lower === "white" ||
        lower === "trắng" ||
        lower === "tên trắng"
      ) {
        if (!wNameCol) wNameCol = col;
      } else if (
        lower === "black" ||
        lower === "đen" ||
        lower === "tên đen"
      ) {
        if (!blNameCol) blNameCol = col;
      } else if (
        lower === "kết quả" ||
        lower === "kq" ||
        lower === "res." ||
        lower === "result"
      ) {
        if (!resCol) resCol = col;
      }
    }

    // Check if essential headers are present
    if (bCol > 0 && wNameCol > 0 && blNameCol > 0) {
      headerRow = rowNumber;

      // Detect auxiliary columns (Club, ID/SNo) relative to white and black names
      for (const { col, text } of rowValues) {
        const lower = text.toLowerCase();

        // White club: after white name, before black name
        if (
          col > wNameCol &&
          col < blNameCol &&
          (lower === "lđ" || lower === "clb" || lower === "fed" || lower === "club")
        ) {
          if (!wClubCol) wClubCol = col;
        }

        // Black club: after black name
        if (
          col > blNameCol &&
          (lower === "lđ" || lower === "clb" || lower === "fed" || lower === "club")
        ) {
          if (!blClubCol) blClubCol = col;
        }

        // White ID: column near white name
        if (
          col < wNameCol &&
          col > bCol &&
          (lower === "sno" || lower === "mã" || lower === "id" || lower === "số thẻ" || lower === "fideid")
        ) {
          wIdCol = col;
          wIdType = inferSourceIdType(text);
        }

        // Black ID: column before black name but after result
        if (
          col < blNameCol &&
          resCol > 0 &&
          col > resCol &&
          (lower === "sno" || lower === "mã" || lower === "id" || lower === "số thẻ" || lower === "fideid")
        ) {
          blIdCol = col;
          blIdType = inferSourceIdType(text);
        }
      }

      // Default standard positions if not explicitly found by label
      mapping = {
        boardCol: bCol,
        whiteNameCol: wNameCol,
        whiteClubCol: wClubCol || (wNameCol + 1 < (resCol || blNameCol) ? wNameCol + 1 : 0),
        whiteIdCol: wIdCol,
        whiteIdType: wIdType,
        resultCol: resCol || (wNameCol + 3 <= blNameCol ? wNameCol + 3 : 5),
        blackNameCol: blNameCol,
        blackClubCol: blClubCol || (blNameCol + 1 <= sheet.columnCount ? blNameCol + 1 : 0),
        blackIdCol: blIdCol,
        blackIdType: blIdType,
      };
    }
  });

  if (!headerRow || !mapping) return null;
  return { headerRow, mapping };
}

export async function parsePairings(
  buffer: Buffer,
  options: ParsePairingsOptions = {},
): Promise<ParseResult> {
  const workbook = new ExcelJS.Workbook();
  const data = Uint8Array.from(buffer).buffer;
  await workbook.xlsx.load(data);

  if (!workbook.worksheets.length) {
    throw new Error("Không tìm thấy worksheet");
  }

  const sheets = workbook.worksheets.map((ws) => ws.name || "Sheet1");

  let sheet: ExcelJS.Worksheet | undefined;
  if (options.sheetName) {
    sheet = workbook.worksheets.find((ws) => ws.name === options.sheetName);
    if (!sheet) {
      throw new Error(`Không tìm thấy trang tính "${options.sheetName}"`);
    }
  } else {
    // Prefer the first worksheet that has a detectable Chess-Results/Swiss-Manager header
    sheet =
      workbook.worksheets.find((ws) => detectHeaderColumns(ws) !== null) ??
      workbook.worksheets[0];
  }

  if (!sheet) {
    throw new Error("Không tìm thấy worksheet");
  }

  const sheetName = sheet.name || "Sheet1";
  const headerInfo = detectHeaderColumns(sheet);

  if (!headerInfo) {
    throw new Error("Không tìm thấy cấu trúc cột Chess-Results");
  }

  const { headerRow, mapping: detectedMapping } = headerInfo;
  const mapping: ColumnMapping = {
    ...detectedMapping,
    ...(options.columnOverrides
      ? Object.fromEntries(
          Object.entries(options.columnOverrides).filter(
            ([, v]) => v !== undefined,
          ),
        )
      : {}),
  };

  const availableColumns: DetectedColumn[] = [];
  const headerRowObj = sheet.getRow(headerRow);
  headerRowObj.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const text = cell.text.trim();
    if (text) {
      availableColumns.push({
        col: colNumber,
        letter: getExcelColumnLetter(colNumber),
        header: text,
      });
    }
  });

  const pairings: Pairing[] = [];
  const issues: ParseIssue[] = [];

  const usedBoards = new Map<number, number>(); // board -> first seen row
  const playersByCode = new Map<string, { board: number; row: number; side: "White" | "Black"; name: string }>();
  const playersByName = new Map<string, { board: number; row: number; side: "White" | "Black"; club: string; code?: string }>();
  const codeToName = new Map<string, { name: string; row: number }>();

  function addIssue(
    row: number,
    colNumber: number,
    colRole: string,
    message: string,
    type: ParseIssueType,
  ) {
    const colLetter = getExcelColumnLetter(colNumber);
    const colLabel = `${colLetter} (${colRole})`;
    const formatted = `Sheet "${sheetName}", Dòng ${row}, Cột ${colLabel}: ${message}`;
    issues.push({
      sheet: sheetName,
      row,
      column: colLabel,
      message,
      type,
      formatted,
    });
  }

  for (let i = headerRow + 1; i <= sheet.rowCount; i++) {
    const row = sheet.getRow(i);

    const rawBoardText = row.getCell(mapping.boardCol).text.trim();
    const rawWhiteName = row.getCell(mapping.whiteNameCol).text.trim();
    const rawBlackName = row.getCell(mapping.blackNameCol).text.trim();

    // Skip entirely empty row
    if (!rawBoardText && !rawWhiteName && !rawBlackName) {
      continue;
    }

    const board = Number(rawBoardText);

    // If row has some content but board number is invalid
    if (!Number.isInteger(board) || board <= 0) {
      // Check if it's just a footer line (e.g. metadata or page note)
      if (!rawWhiteName && !rawBlackName) {
        continue;
      }
      addIssue(
        i,
        mapping.boardCol,
        "Bàn",
        `Số bàn không hợp lệ: "${rawBoardText}"`,
        "error",
      );
      continue;
    }

    // Check duplicate board
    if (usedBoards.has(board)) {
      const firstRow = usedBoards.get(board)!;
      addIssue(
        i,
        mapping.boardCol,
        "Bàn",
        `trùng bàn ${board} (đã xuất hiện ở dòng ${firstRow})`,
        "error",
      );
      continue;
    }

    const whiteClub = mapping.whiteClubCol ? row.getCell(mapping.whiteClubCol).text.trim() : "";
    const blackClub = mapping.blackClubCol ? row.getCell(mapping.blackClubCol).text.trim() : "";

    const whiteExternalId = mapping.whiteIdCol ? row.getCell(mapping.whiteIdCol).text.trim() || null : null;
    const blackExternalId = mapping.blackIdCol ? row.getCell(mapping.blackIdCol).text.trim() || null : null;

    const sourceResult = mapping.resultCol ? row.getCell(mapping.resultCol).text.trim() : "";

    // Check missing player names
    let rowHasNameError = false;
    if (!rawWhiteName && !rawBlackName) {
      addIssue(i, mapping.whiteNameCol, "White", "thiếu tên cả hai kỳ thủ", "error");
      rowHasNameError = true;
    } else if (!rawWhiteName) {
      addIssue(i, mapping.whiteNameCol, "White", "thiếu tên kỳ thủ", "error");
      rowHasNameError = true;
    } else if (!rawBlackName) {
      addIssue(i, mapping.blackNameCol, "Black", "thiếu tên kỳ thủ", "error");
      rowHasNameError = true;
    }

    if (rowHasNameError) {
      continue;
    }

    // Check self-play on same board
    if (rawWhiteName.toLowerCase() === rawBlackName.toLowerCase()) {
      addIssue(
        i,
        mapping.blackNameCol,
        "Black",
        `kỳ thủ "${rawWhiteName}" không thể đấu với chính mình trên cùng bàn ${board}`,
        "error",
      );
      continue;
    }

    // Check White Player
    let whitePlayerInvalid = false;
    const whiteNorm = rawWhiteName.toLowerCase();

    if (whiteExternalId) {
      const prevCode = playersByCode.get(whiteExternalId);
      if (prevCode) {
        addIssue(
          i,
          mapping.whiteIdCol!,
          "Mã Trắng",
          `mã kỳ thủ "${whiteExternalId}" (${rawWhiteName}) xuất hiện nhiều lần trong vòng (đã có ở bàn ${prevCode.board}, dòng ${prevCode.row})`,
          "error",
        );
        whitePlayerInvalid = true;
      }

      const existingMapping = codeToName.get(whiteExternalId);
      if (existingMapping && existingMapping.name.toLowerCase() !== whiteNorm) {
        addIssue(
          i,
          mapping.whiteIdCol!,
          "Mã Trắng",
          `mâu thuẫn mã kỳ thủ: mã "${whiteExternalId}" được gán cho "${rawWhiteName}" nhưng ở dòng ${existingMapping.row} được gán cho "${existingMapping.name}"`,
          "error",
        );
        whitePlayerInvalid = true;
      } else if (!existingMapping) {
        codeToName.set(whiteExternalId, { name: rawWhiteName, row: i });
      }
    }

    const prevWhiteName = playersByName.get(whiteNorm);
    if (prevWhiteName) {
      // If different clubs or different external IDs, warn about ambiguous identity
      const isDifferentIdentity =
        (whiteClub && prevWhiteName.club && whiteClub.toLowerCase() !== prevWhiteName.club.toLowerCase()) ||
        (whiteExternalId && prevWhiteName.code && whiteExternalId !== prevWhiteName.code);

      if (isDifferentIdentity) {
        addIssue(
          i,
          mapping.whiteNameCol,
          "White",
          `phát hiện tên trùng "${rawWhiteName}" ở bàn ${prevWhiteName.board} (dòng ${prevWhiteName.row}, CLB: ${prevWhiteName.club || "—"}) và bàn ${board} (CLB: ${whiteClub || "—"}) nhưng không có mã định danh để phân biệt (danh tính không rõ)`,
          "warning",
        );
      } else {
        addIssue(
          i,
          mapping.whiteNameCol,
          "White",
          `kỳ thủ "${rawWhiteName}" xuất hiện nhiều lần trong cùng vòng (đã có ở bàn ${prevWhiteName.board}, dòng ${prevWhiteName.row})`,
          "error",
        );
        whitePlayerInvalid = true;
      }
    }

    // Check Black Player
    let blackPlayerInvalid = false;
    const blackNorm = rawBlackName.toLowerCase();

    if (blackExternalId) {
      const prevCode = playersByCode.get(blackExternalId);
      if (prevCode) {
        addIssue(
          i,
          mapping.blackIdCol!,
          "Mã Đen",
          `mã kỳ thủ "${blackExternalId}" (${rawBlackName}) xuất hiện nhiều lần trong vòng (đã có ở bàn ${prevCode.board}, dòng ${prevCode.row})`,
          "error",
        );
        blackPlayerInvalid = true;
      }

      const existingMapping = codeToName.get(blackExternalId);
      if (existingMapping && existingMapping.name.toLowerCase() !== blackNorm) {
        addIssue(
          i,
          mapping.blackIdCol!,
          "Mã Đen",
          `mâu thuẫn mã kỳ thủ: mã "${blackExternalId}" được gán cho "${rawBlackName}" nhưng ở dòng ${existingMapping.row} được gán cho "${existingMapping.name}"`,
          "error",
        );
        blackPlayerInvalid = true;
      } else if (!existingMapping) {
        codeToName.set(blackExternalId, { name: rawBlackName, row: i });
      }
    }

    const prevBlackName = playersByName.get(blackNorm);
    if (prevBlackName) {
      const isDifferentIdentity =
        (blackClub && prevBlackName.club && blackClub.toLowerCase() !== prevBlackName.club.toLowerCase()) ||
        (blackExternalId && prevBlackName.code && blackExternalId !== prevBlackName.code);

      if (isDifferentIdentity) {
        addIssue(
          i,
          mapping.blackNameCol,
          "Black",
          `phát hiện tên trùng "${rawBlackName}" ở bàn ${prevBlackName.board} (dòng ${prevBlackName.row}, CLB: ${prevBlackName.club || "—"}) và bàn ${board} (CLB: ${blackClub || "—"}) nhưng không có mã định danh để phân biệt (danh tính không rõ)`,
          "warning",
        );
      } else {
        addIssue(
          i,
          mapping.blackNameCol,
          "Black",
          `kỳ thủ "${rawBlackName}" xuất hiện nhiều lần trong cùng vòng (đã có ở bàn ${prevBlackName.board}, dòng ${prevBlackName.row})`,
          "error",
        );
        blackPlayerInvalid = true;
      }
    }

    if (whitePlayerInvalid || blackPlayerInvalid) {
      continue;
    }

    // Register board and players for tracking
    usedBoards.set(board, i);

    if (whiteExternalId) {
      playersByCode.set(whiteExternalId, { board, row: i, side: "White", name: rawWhiteName });
    }
    playersByName.set(whiteNorm, { board, row: i, side: "White", club: whiteClub, code: whiteExternalId ?? undefined });

    if (blackExternalId) {
      playersByCode.set(blackExternalId, { board, row: i, side: "Black", name: rawBlackName });
    }
    playersByName.set(blackNorm, { board, row: i, side: "Black", club: blackClub, code: blackExternalId ?? undefined });

    const isBye = isByeIndicator(rawBlackName) || isByeIndicator(sourceResult);

    pairings.push({
      board,
      whiteName: rawWhiteName,
      whiteClub,
      whiteExternalId,
      whiteIdType: whiteExternalId ? mapping.whiteIdType : undefined,
      blackName: rawBlackName,
      blackClub,
      blackExternalId,
      blackIdType: blackExternalId ? mapping.blackIdType : undefined,
      sourceResult,
      isBye,
    });
  }

  const errors = issues.filter((iss) => iss.type === "error").map((iss) => iss.formatted);
  const warnings = issues.filter((iss) => iss.type === "warning").map((iss) => iss.formatted);

  if (!pairings.length && !errors.length) {
    errors.push(`Sheet "${sheetName}": Không tìm thấy bàn đấu hợp lệ`);
  }

  return {
    headerRow,
    count: pairings.length,
    pairings,
    errors,
    warnings,
    issues,
    hasBlockingErrors: errors.length > 0,
    sheets,
    selectedSheet: sheetName,
    availableColumns,
    columnMapping: mapping,
  };
}
