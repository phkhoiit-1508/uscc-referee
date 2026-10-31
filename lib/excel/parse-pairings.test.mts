import assert from "node:assert/strict";
import test from "node:test";

import ExcelJS from "exceljs";

import { parsePairings } from "./parse-pairings.ts";

const HEADER = [
  "Bàn",
  "White",
  "LĐ",
  "Điểm",
  "Kết quả",
  "Điểm",
  "Black",
  "LĐ",
];

const HEADER_WITH_ID = [
  "Bàn",
  "SNo",
  "White",
  "LĐ",
  "Điểm",
  "Kết quả",
  "Điểm",
  "SNo",
  "Black",
  "LĐ",
];

async function createWorkbook(
  rows: Array<Array<string | number>>,
  includeHeader = true,
  customHeader = HEADER,
) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Sheet1");

  for (let index = 0; index < 5; index++) {
    sheet.addRow([`Dòng thông tin ${index + 1}`]);
  }

  if (includeHeader) {
    sheet.addRow(customHeader);
  }

  for (const row of rows) {
    sheet.addRow(row);
  }

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

test("đọc cặp đấu Chess-Results hợp lệ", async () => {
  const buffer = await createWorkbook([
    [1, "Nguyễn An", "USCC", "", "1-0", "", "Trần Bình", "HCMUS"],
  ]);

  const result = await parsePairings(buffer);

  assert.equal(result.headerRow, 6);
  assert.equal(result.count, 1);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.warnings, []);
  assert.equal(result.hasBlockingErrors, false);
  assert.deepEqual(result.pairings[0], {
    board: 1,
    whiteName: "Nguyễn An",
    whiteClub: "USCC",
    whiteExternalId: null,
    whiteIdType: undefined,
    blackName: "Trần Bình",
    blackClub: "HCMUS",
    blackExternalId: null,
    blackIdType: undefined,
    sourceResult: "1-0",
    isBye: false,
  });
});

test("từ chối workbook không có header Chess-Results", async () => {
  const buffer = await createWorkbook(
    [[1, "Nguyễn An", "USCC", "", "", "", "Trần Bình", "HCMUS"]],
    false,
  );

  await assert.rejects(
    parsePairings(buffer),
    /Không tìm thấy cấu trúc cột Chess-Results/,
  );
});

test("báo đúng sheet, dòng và cột khi thiếu tên kỳ thủ", async () => {
  const buffer = await createWorkbook([
    [1, "Nguyễn An", "USCC", "", "", "", "", "HCMUS"],
  ]);

  const result = await parsePairings(buffer);

  assert.equal(result.count, 0);
  assert.equal(result.hasBlockingErrors, true);
  assert.equal(result.errors.length, 1);
  assert.match(
    result.errors[0],
    /Sheet "Sheet1", Dòng 7, Cột G \(Black\): thiếu tên kỳ thủ/,
  );
});

test("giữ bàn đầu tiên và báo đúng sheet, dòng, cột khi trùng bàn", async () => {
  const buffer = await createWorkbook([
    [1, "Nguyễn An", "USCC", "", "", "", "Trần Bình", "HCMUS"],
    [1, "Lê Chi", "USCC", "", "", "", "Phạm Dũng", "HCMUS"],
  ]);

  const result = await parsePairings(buffer);

  assert.equal(result.count, 1);
  assert.equal(result.pairings[0]?.whiteName, "Nguyễn An");
  assert.equal(result.hasBlockingErrors, true);
  assert.equal(result.errors.length, 1);
  assert.match(
    result.errors[0],
    /Sheet "Sheet1", Dòng 8, Cột A \(Bàn\): trùng bàn 1/,
  );
});

test("báo workbook có header nhưng không có bàn hợp lệ", async () => {
  const buffer = await createWorkbook([]);

  const result = await parsePairings(buffer);

  assert.equal(result.count, 0);
  assert.deepEqual(result.pairings, []);
  assert.match(result.errors[0], /Sheet "Sheet1": Không tìm thấy bàn đấu hợp lệ/);
});

test("nhập chính xác 40 bàn thực tế từ file USCC-HCMUS-round-1-Chess-Results", async () => {
  const realRows = [
    [1, "Nguyễn Hồng Phúc (B)", "UIT", 0, "½ - ½", 0, "Bạch Triều Vĩ", "IUC"],
    [2, "Bùi Minh Duy", "TDO", 0, "½ - ½", 0, "Nguyễn Khắc Nhẫn", "TDO"],
    [3, "Nguyễn Lê Minh Hiếu", "TDO", 0, "1 - 0", 0, "Bùi Trần Thành Đạt", "TDO"],
    [4, "Cao Hoàng Huy", "SGU", 0, "0 - 1", 0, "Nguyễn Lê Ngọc Quý", "USC"],
    [5, "Nguyễn Lê Nhật Quang", "TDO", 0, "1 - 0", 0, "Đào Anh Minh", "ICC"],
    [6, "Đoàn Vinh Quang", "FPT", 0, "1 - 0", 0, "Nguyễn Nam Việt", "TDO"],
    [7, "Nguyễn Ngọc Thanh Nguyên", "ICC", 0, "+ - -", 0, "Dương Đăng Toàn", "ICC"],
    [8, "Dương Tấn Tài", "SGU", 0, "½ - ½", 0, "Nguyễn Ngọc Trí", "IUC"],
    [9, "Nguyễn Nhật Khang", "FPT", 0, "1 - 0", 0, "Hà Thúc Nhật Thành", "FPT"],
    [10, "Hoàng Gia Huy", "TDO", 0, "0 - 1", 0, "Nguyễn Nhật Trường", "TDO"],
    [11, "Nguyễn Như Tuấn Long", "VSG", 0, "1 - 0", 0, "Hoàng Việt Anh", "NHH"],
    [12, "Huỳnh Đoàn Quang Mạnh", "TDO", 0, "1 - 0", 0, "Nguyễn Phi Khanh", "TDO"],
    [13, "Nguyễn Phúc An", "TDO", 0, "0 - 1", 0, "Huỳnh Khánh Lâm", "LHP"],
    [14, "Huỳnh Vũ Gia An", "HHT", 0, "0 - 1", 0, "Nguyễn Phương Nam", "USH"],
    [15, "Nguyễn Thanh Hưng", "TDO", 0, "+ - -", 0, "Khổng Tuấn Hòa", "SGU"],
    [16, "Lê Anh Đăng", "HCC", 0, "1 - 0", 0, "Nguyễn Thanh Tình", "TDO"],
    [17, "Nguyễn Thọ Thảo", "USC", 0, "1 - 0", 0, "Lê Anh Khôi", "TDO"],
    [18, "Lê Bá Hào", "SGU", 0, "1 - 0", 0, "Nguyễn Trần Đức Anh", "FPT"],
    [19, "Phạm Đức Khiêm", "TDU", 0, "1 - 0", 0, "Lê Đình Bảo Khang", "NCT"],
    [20, "Lê Gia Bảo", "USC", 0, "1 - 0", 0, "Phạm Dương Hoàng Phúc", "FPT"],
    [21, "Phạm Gia Hân", "TDO", 0, "- - -", 0, "Lê Gia Long", "FPT"],
    [22, "Lê Minh Nhật", "LHP", 0, "1 - 0", 0, "Phạm Ngọc Hoạt", "ICC"],
    [23, "Phạm Nguyễn Duy Anh", "UIT", 0, "0 - 1", 0, "Lê Ngọc Hiếu", "USH"],
    [24, "Lê Nhật Minh", "TDO", 0, "0 - 1", 0, "Phạm Phú Trọng", "VSG"],
    [25, "Thái Ngọc Tường Minh", "CNK", 0, "- - +", 0, "Lê Trần Đình Lai", "USH"],
    [26, "Lương Quốc Triệu", "FPT", 0, "0 - 1", 0, "Thái Quốc Mạnh", "TDO"],
    [27, "Trà Văn Khoa", "HHT", 0, "0 - 1", 0, "Lưu Hương Cường Thịnh", "USH"],
    [28, "Mai Tiến Dũng", "NHH", 0, "1 - 0", 0, "Trần Đặng Gia Phước", "LHP"],
    [29, "Trần Hồng Anh", "ICC", 0, "1 - 0", 0, "Mai Tử Khang", "TDO"],
    [30, "Nguyễn Anh Khoa", "CNK", 0, "1 - 0", 0, "Trần Khôi", "VSG"],
    [31, "Trần Khôi Nguyên", "USC", 0, "0 - 1", 0, "Nguyễn Đăng Khoa", "BKU"],
    [32, "Nguyễn Đăng Nam", "SGU", 0, "0 - 1", 0, "Trần Nguyễn Khánh Nhân", "TDO"],
    [33, "Trần Như Thiện", "ICC", 0, "1 - 0", 0, "Nguyễn Đình Đức Tú", "TDO"],
    [34, "Nguyễn Đình Huy Hoàng", "TDO", 0, "0 - 1", 0, "Trần Quang Đạt", "CNK"],
    [35, "Trần Thiên Bảo", "TDO", 0, "0 - 1", 0, "Nguyễn Đình Ngọc Ân", "FPT"],
    [36, "Nguyễn Đức Anh Tuấn", "BKU", 0, "1 - 0", 0, "Trần Văn Bình", "TDO"],
    [37, "Trần Văn Dũng", "BKU", 0, "1 - 0", 0, "Nguyễn Đức Gia Hưng", "VSG"],
    [38, "Nguyễn Đức Sang", "IUC", 0, "1 - 0", 0, "Từ Huy Bình", "SGU"],
    [39, "Văn Huy Tài", "FPT", 0, "1 - 0", 0, "Nguyễn Hải Tiến Công", "TDU"],
    [40, "Nguyễn Hồng Phúc (A)", "TDU", 0, "0 - 1", 0, "Võ Phạm Thiên Phúc", "IUC"],
  ];

  const buffer = await createWorkbook(realRows);
  const result = await parsePairings(buffer);

  assert.equal(result.count, 40);
  assert.equal(result.pairings.length, 40);
  assert.equal(result.errors.length, 0);
  assert.equal(result.warnings.length, 0);
  assert.equal(result.hasBlockingErrors, false);
  assert.equal(result.pairings[0].whiteName, "Nguyễn Hồng Phúc (B)");
  assert.equal(result.pairings[0].sourceResult, "½ - ½");
  assert.equal(result.pairings[6].sourceResult, "+ - -");
  assert.equal(result.pairings[20].sourceResult, "- - -");
  assert.equal(result.pairings[24].sourceResult, "- - +");
  assert.equal(result.pairings[39].whiteName, "Nguyễn Hồng Phúc (A)");
});

test("báo lỗi khi một kỳ thủ tự đấu với chính mình trên cùng bàn", async () => {
  const buffer = await createWorkbook([
    [1, "Nguyễn An", "USCC", "", "", "", "Nguyễn An", "USCC"],
  ]);

  const result = await parsePairings(buffer);
  assert.equal(result.count, 0);
  assert.equal(result.hasBlockingErrors, true);
  assert.match(
    result.errors[0],
    /kỳ thủ "Nguyễn An" không thể đấu với chính mình trên cùng bàn 1/,
  );
});

test("báo lỗi khi một kỳ thủ xuất hiện nhiều lần trong cùng vòng", async () => {
  const buffer = await createWorkbook([
    [1, "Nguyễn An", "USCC", "", "", "", "Trần Bình", "HCMUS"],
    [2, "Lê Chi", "USCC", "", "", "", "Nguyễn An", "USCC"],
  ]);

  const result = await parsePairings(buffer);
  assert.equal(result.count, 1);
  assert.equal(result.hasBlockingErrors, true);
  assert.match(
    result.errors[0],
    /kỳ thủ "Nguyễn An" xuất hiện nhiều lần trong cùng vòng/,
  );
});

test("cảnh báo danh tính không rõ khi trùng tên nhưng khác CLB (không có mã)", async () => {
  const buffer = await createWorkbook([
    [1, "Nguyễn Văn A", "USCC", "", "", "", "Trần Bình", "HCMUS"],
    [2, "Nguyễn Văn A", "Đồng Tháp", "", "", "", "Phạm Dũng", "HCMUS"],
  ]);

  const result = await parsePairings(buffer);
  assert.equal(result.count, 2);
  assert.equal(result.hasBlockingErrors, false);
  assert.equal(result.warnings.length, 1);
  assert.match(
    result.warnings[0],
    /phát hiện tên trùng "Nguyễn Văn A" ở bàn 1 .* và bàn 2 .* nhưng không có mã định danh để phân biệt \(danh tính không rõ\)/,
  );
});

test("đọc mã kỳ thủ nếu file có cột mã / SNo và phát hiện trùng mã trong vòng", async () => {
  const buffer = await createWorkbook(
    [
      [1, "101", "Nguyễn An", "USCC", "", "", "", "102", "Trần Bình", "HCMUS"],
      [2, "101", "Lê Chi", "USCC", "", "", "", "103", "Phạm Dũng", "HCMUS"],
    ],
    true,
    HEADER_WITH_ID,
  );

  const result = await parsePairings(buffer);
  assert.equal(result.count, 1);
  assert.equal(result.hasBlockingErrors, true);
  assert.match(
    result.errors[0],
    /mã kỳ thủ "101" .* xuất hiện nhiều lần trong vòng/,
  );
});

test("báo lỗi mâu thuẫn mã - tên khi cùng mã gán cho 2 tên khác nhau", async () => {
  const buffer = await createWorkbook(
    [
      [1, "101", "Nguyễn An", "USCC", "", "", "", "102", "Trần Bình", "HCMUS"],
      [2, "101", "Hoàng Khác Tên", "USCC", "", "", "", "103", "Phạm Dũng", "HCMUS"],
    ],
    true,
    HEADER_WITH_ID,
  );

  const result = await parsePairings(buffer);
  assert.equal(result.hasBlockingErrors, true);
  assert.ok(
    result.errors.some((err) =>
      err.includes('mâu thuẫn mã kỳ thủ: mã "101"'),
    ),
  );
});

test("hỗ trợ chọn sheet cụ thể và ghi đè ánh xạ cột (columnOverrides)", async () => {
  const workbook = new ExcelJS.Workbook();
  const coverSheet = workbook.addWorksheet("Trang Bìa");
  coverSheet.addRow(["Thông tin giải đấu USCC"]);

  const round2Sheet = workbook.addWorksheet("Vòng 2");
  round2Sheet.addRow(["Bàn", "White", "LĐ", "Kết quả", "Black", "LĐ", "Ghi chú CLB"]);
  round2Sheet.addRow([1, "Nguyễn An", "USCC", "1-0", "Trần Bình", "HCMUS", "CLB Đặc Biệt"]);

  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

  // Tự động chọn sheet "Vòng 2" vì "Trang Bìa" không có header Chess-Results
  const autoResult = await parsePairings(buffer);
  assert.deepEqual(autoResult.sheets, ["Trang Bìa", "Vòng 2"]);
  assert.equal(autoResult.selectedSheet, "Vòng 2");
  assert.equal(autoResult.count, 1);
  assert.equal(autoResult.pairings[0].blackClub, "HCMUS");

  // Ghi đè cột CLB Đen sang cột 7 ("Ghi chú CLB")
  const overrideResult = await parsePairings(buffer, {
    sheetName: "Vòng 2",
    columnOverrides: { blackClubCol: 7 },
  });
  assert.equal(overrideResult.pairings[0].blackClub, "CLB Đặc Biệt");
});
