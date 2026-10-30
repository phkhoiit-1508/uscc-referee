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

async function createWorkbook(
  rows: Array<Array<string | number>>,
  includeHeader = true,
) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Sheet1");

  for (let index = 0; index < 5; index++) {
    sheet.addRow([`Dòng thông tin ${index + 1}`]);
  }

  if (includeHeader) {
    sheet.addRow(HEADER);
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
  assert.deepEqual(result.pairings[0], {
    board: 1,
    whiteName: "Nguyễn An",
    whiteClub: "USCC",
    blackName: "Trần Bình",
    blackClub: "HCMUS",
    sourceResult: "1-0",
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

test("báo đúng dòng thiếu tên kỳ thủ", async () => {
  const buffer = await createWorkbook([
    [1, "Nguyễn An", "USCC", "", "", "", "", "HCMUS"],
  ]);

  const result = await parsePairings(buffer);

  assert.equal(result.count, 0);
  assert.deepEqual(result.errors, ["Dòng 7: thiếu tên kỳ thủ"]);
});

test("giữ bàn đầu tiên và báo dòng bị trùng bàn", async () => {
  const buffer = await createWorkbook([
    [1, "Nguyễn An", "USCC", "", "", "", "Trần Bình", "HCMUS"],
    [1, "Lê Chi", "USCC", "", "", "", "Phạm Dũng", "HCMUS"],
  ]);

  const result = await parsePairings(buffer);

  assert.equal(result.count, 1);
  assert.equal(result.pairings[0]?.whiteName, "Nguyễn An");
  assert.deepEqual(result.errors, ["Dòng 8: trùng bàn 1"]);
});

test("báo workbook có header nhưng không có bàn hợp lệ", async () => {
  const buffer = await createWorkbook([]);

  const result = await parsePairings(buffer);

  assert.equal(result.count, 0);
  assert.deepEqual(result.pairings, []);
  assert.deepEqual(result.errors, ["Không tìm thấy bàn đấu hợp lệ"]);
});
