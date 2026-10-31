import assert from "node:assert/strict";
import test from "node:test";

import ExcelJS from "exceljs";

import {
  generateUsccResultsExcel,
  sanitizeExcelValue,
  type ExportExcelMatchRow,
} from "./export-excel.ts";

test("sanitizeExcelValue: ngăn chặn Excel Formula Injection", () => {
  assert.equal(sanitizeExcelValue("=CMD|' /C calc'!A0"), "'=CMD|' /C calc'!A0");
  assert.equal(sanitizeExcelValue("+12345"), "'+12345");
  assert.equal(sanitizeExcelValue("-SUM(A1:A10)"), "'-SUM(A1:A10)");
  assert.equal(sanitizeExcelValue("@import"), "'@import");
  assert.equal(sanitizeExcelValue("Nguyễn Văn A"), "Nguyễn Văn A");
  assert.equal(sanitizeExcelValue(null), "");
});

test("generateUsccResultsExcel: tạo file Excel hợp lệ với đầy đủ cột và bảo toàn tiếng Việt", async () => {
  const matches: ExportExcelMatchRow[] = [
    {
      id: "m1",
      round_number: 1,
      board_number: 1,
      status: "official",
      result_code: "1-0",
      result_kind: "normal",
      white_confirmed_at: "2026-10-31T10:00:00.000Z",
      black_confirmed_at: "2026-10-31T10:05:00.000Z",
      white_player: { full_name: "Nguyễn Hồng Phúc", club: "UIT", external_id: "1", source_id_type: "swiss_start_rank_no" },
      black_player: { full_name: "Bạch Triều Vĩ", club: "IUC", external_id: "41", source_id_type: "swiss_start_rank_no" },
    },
    {
      id: "m2",
      round_number: 1,
      board_number: 2,
      status: "pending_white",
      result_code: "0-1",
      result_kind: "normal",
      white_confirmed_at: null,
      black_confirmed_at: null,
      white_player: { full_name: "Bùi Minh Duy", club: "TDO", external_id: "2" },
      black_player: { full_name: "Nguyễn Khắc Nhẫn", club: "TDO", external_id: "42" },
    },
  ];

  const buffer = await generateUsccResultsExcel(matches, {
    tournamentName: "Giải TĐNxKHTN 2025",
    round: 1,
    scope: "official",
  });

  assert.ok(buffer.length > 0);

  // Read back generated Excel with ExcelJS to verify structure
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Uint8Array.from(buffer).buffer);

  const worksheet = workbook.worksheets[0];
  assert.ok(worksheet);
  assert.equal(worksheet.name, "Vòng 1");

  // In official-only mode, only m1 should be in data rows (m2 is pending)
  const rows: Array<string | number> = [];
  worksheet.eachRow((row) => {
    rows.push(String(row.getCell(4).value)); // Column 4 is White Player
  });

  assert.ok(rows.includes("Nguyễn Hồng Phúc"));
  assert.ok(!rows.includes("Bùi Minh Duy"), "Pending match should be excluded from official export");
});

test("generateUsccResultsExcel: scope audit bao gồm cả ván chờ và tranh chấp", async () => {
  const matches: ExportExcelMatchRow[] = [
    {
      id: "m1",
      round_number: 1,
      board_number: 1,
      status: "official",
      result_code: "1-0",
      result_kind: "normal",
      white_confirmed_at: "2026-10-31T10:00:00.000Z",
      black_confirmed_at: "2026-10-31T10:05:00.000Z",
      white_player: { full_name: "Nguyễn Hồng Phúc", club: "UIT" },
      black_player: { full_name: "Bạch Triều Vĩ", club: "IUC" },
    },
    {
      id: "m2",
      round_number: 1,
      board_number: 2,
      status: "disputed",
      result_code: "1/2-1/2",
      result_kind: "normal",
      white_confirmed_at: null,
      black_confirmed_at: null,
      white_player: { full_name: "Bùi Minh Duy", club: "TDO" },
      black_player: { full_name: "Nguyễn Khắc Nhẫn", club: "TDO" },
    },
  ];

  const buffer = await generateUsccResultsExcel(matches, {
    tournamentName: "Giải TĐNxKHTN 2025",
    round: 1,
    scope: "audit",
  });

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Uint8Array.from(buffer).buffer);
  const worksheet = workbook.worksheets[0];

  const whitePlayers: string[] = [];
  worksheet.eachRow((row) => {
    whitePlayers.push(String(row.getCell(4).value));
  });

  assert.ok(whitePlayers.includes("Nguyễn Hồng Phúc"));
  assert.ok(whitePlayers.includes("Bùi Minh Duy"));
});

