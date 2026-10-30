import ExcelJS from "exceljs";

export type Pairing = {
  board: number;
  whiteName: string;
  whiteClub: string;
  blackName: string;
  blackClub: string;
  sourceResult: string;
};

export async function parsePairings(buffer: Buffer) {
  const workbook = new ExcelJS.Workbook();
  const data = Uint8Array.from(buffer).buffer;
  await workbook.xlsx.load(data);

  const sheet = workbook.worksheets[0];

  if (!sheet) {
    throw new Error("Không tìm thấy worksheet");
  }

  // Tìm dòng tiêu đề.
  let headerRow = 0;

  sheet.eachRow((row, rowNumber) => {
    const colA = row.getCell(1).text.trim();
    const colB = row.getCell(2).text.trim();
    const colG = row.getCell(7).text.trim();

    if (
      colA === "Bàn" &&
      colB === "White" &&
      colG === "Black"
    ) {
      headerRow = rowNumber;
    }
  });

  if (!headerRow) {
    throw new Error(
      "Không tìm thấy cấu trúc cột Chess-Results"
    );
  }

  const pairings: Pairing[] = [];
  const errors: string[] = [];
  const usedBoards = new Set<number>();

  for (
    let i = headerRow + 1;
    i <= sheet.rowCount;
    i++
  ) {
    const row = sheet.getRow(i);
    const board = Number(row.getCell(1).text.trim());

    // Bỏ qua các dòng không phải bàn đấu.
    if (!Number.isInteger(board) || board <= 0) {
      continue;
    }

    const whiteName = row.getCell(2).text.trim();
    const whiteClub = row.getCell(3).text.trim();
    const blackName = row.getCell(7).text.trim();
    const blackClub = row.getCell(8).text.trim();

    if (!whiteName || !blackName) {
      errors.push(`Dòng ${i}: thiếu tên kỳ thủ`);
      continue;
    }

    if (usedBoards.has(board)) {
      errors.push(`Dòng ${i}: trùng bàn ${board}`);
      continue;
    }

    usedBoards.add(board);

    pairings.push({
      board,
      whiteName,
      whiteClub,
      blackName,
      blackClub,
      sourceResult: row.getCell(5).text.trim(),
    });
  }

  if (!pairings.length && !errors.length) {
    errors.push("Không tìm thấy bàn đấu hợp lệ");
  }

  return {
    headerRow,
    count: pairings.length,
    pairings,
    errors,
  };
}