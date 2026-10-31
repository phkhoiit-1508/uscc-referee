import assert from "node:assert/strict";
import test from "node:test";

import {
  computeRoundDiff,
  computeRoundStateSignature,
  isStaleRoundState,
  type ExistingMatchSnapshot,
} from "./pairing-diff.ts";
import type { Pairing } from "./parse-pairings.ts";

test("diff: bàn mới hoàn toàn khi vòng chưa có ván đấu nào", () => {
  const incoming: Pairing[] = [
    {
      board: 1,
      whiteName: "Nguyễn An",
      whiteClub: "USCC",
      blackName: "Trần Bình",
      blackClub: "HCMUS",
      sourceResult: "",
    },
    {
      board: 2,
      whiteName: "Lê Chi",
      whiteClub: "USCC",
      blackName: "Phạm Dũng",
      blackClub: "HCMUS",
      sourceResult: "",
    },
  ];

  const diff = computeRoundDiff(1, [], incoming);
  assert.equal(diff.totalIncoming, 2);
  assert.equal(diff.totalExisting, 0);
  assert.equal(diff.newBoards.length, 2);
  assert.equal(diff.unchangedBoards.length, 0);
  assert.equal(diff.conflictBoards.length, 0);
  assert.equal(diff.hasConflicts, false);
  assert.equal(diff.canSafelyApply, true);
});

test("diff: bàn không thay đổi khi dữ liệu khớp hoàn toàn", () => {
  const existing: ExistingMatchSnapshot[] = [
    {
      id: "m1",
      board_number: 1,
      status: "unreported",
      result_code: null,
      white_player: { full_name: "Nguyễn An" },
      black_player: { full_name: "Trần Bình" },
    },
  ];

  const incoming: Pairing[] = [
    {
      board: 1,
      whiteName: "Nguyễn An",
      whiteClub: "USCC",
      blackName: "Trần Bình",
      blackClub: "HCMUS",
      sourceResult: "",
    },
  ];

  const diff = computeRoundDiff(1, existing, incoming);
  assert.equal(diff.unchangedBoards.length, 1);
  assert.equal(diff.newBoards.length, 0);
  assert.equal(diff.hasConflicts, false);
});

test("diff: phát hiện đổi màu quân Trắng ↔ Đen trên ván chưa nhập kết quả", () => {
  const existing: ExistingMatchSnapshot[] = [
    {
      id: "m1",
      board_number: 1,
      status: "unreported",
      result_code: null,
      white_player: { full_name: "Nguyễn An" },
      black_player: { full_name: "Trần Bình" },
    },
  ];

  const incoming: Pairing[] = [
    {
      board: 1,
      whiteName: "Trần Bình",
      whiteClub: "HCMUS",
      blackName: "Nguyễn An",
      blackClub: "USCC",
      sourceResult: "",
    },
  ];

  const diff = computeRoundDiff(1, existing, incoming);
  assert.equal(diff.swappedColorBoards.length, 1);
  assert.equal(diff.hasConflicts, false);
});

test("diff: phát hiện bàn bị thiếu trong file mới", () => {
  const existing: ExistingMatchSnapshot[] = [
    {
      id: "m1",
      board_number: 1,
      status: "unreported",
      result_code: null,
      white_player: { full_name: "Nguyễn An" },
      black_player: { full_name: "Trần Bình" },
    },
    {
      id: "m2",
      board_number: 2,
      status: "unreported",
      result_code: null,
      white_player: { full_name: "Lê Chi" },
      black_player: { full_name: "Phạm Dũng" },
    },
  ];

  const incoming: Pairing[] = [
    {
      board: 1,
      whiteName: "Nguyễn An",
      whiteClub: "USCC",
      blackName: "Trần Bình",
      blackClub: "HCMUS",
      sourceResult: "",
    },
  ];

  const diff = computeRoundDiff(1, existing, incoming);
  assert.equal(diff.missingBoards.length, 1);
  assert.equal(diff.missingBoards[0].board, 2);
  assert.equal(diff.hasConflicts, false);
});

test("diff: CHẶN xung đột khi file mới thay đổi bàn đã có kết quả official", () => {
  const existing: ExistingMatchSnapshot[] = [
    {
      id: "m1",
      board_number: 1,
      status: "official",
      result_code: "1-0",
      white_player: { full_name: "Nguyễn An" },
      black_player: { full_name: "Trần Bình" },
    },
  ];

  const incoming: Pairing[] = [
    {
      board: 1,
      whiteName: "Kỳ Thủ Khác",
      whiteClub: "USCC",
      blackName: "Trần Bình",
      blackClub: "HCMUS",
      sourceResult: "",
    },
  ];

  const diff = computeRoundDiff(1, existing, incoming);
  assert.equal(diff.conflictBoards.length, 1);
  assert.equal(diff.hasConflicts, true);
  assert.equal(diff.canSafelyApply, false);
  assert.match(diff.conflictBoards[0].message, /Xung đột: Bàn 1 đã có trạng thái "official"/);
});

test("diff: CHẶN xung đột khi file mới thay đổi bàn đang chờ xác nhận (pending_white/pending_black)", () => {
  const existing: ExistingMatchSnapshot[] = [
    {
      id: "m1",
      board_number: 1,
      status: "pending_white",
      result_code: "0-1",
      white_player: { full_name: "Nguyễn An" },
      black_player: { full_name: "Trần Bình" },
    },
  ];

  const incoming: Pairing[] = [
    {
      board: 1,
      whiteName: "Trần Bình",
      whiteClub: "HCMUS",
      blackName: "Nguyễn An",
      blackClub: "USCC",
      sourceResult: "",
    },
  ];

  const diff = computeRoundDiff(1, existing, incoming);
  assert.equal(diff.conflictBoards.length, 1);
  assert.equal(diff.hasConflicts, true);
  assert.equal(diff.canSafelyApply, false);
});

test("diff: CHẶN xung đột khi bàn đang có kết quả bị thiếu trong file mới", () => {
  const existing: ExistingMatchSnapshot[] = [
    {
      id: "m1",
      board_number: 1,
      status: "official",
      result_code: "1/2-1/2",
      white_player: { full_name: "Nguyễn An" },
      black_player: { full_name: "Trần Bình" },
    },
  ];

  const incoming: Pairing[] = []; // File empty or missing board 1

  const diff = computeRoundDiff(1, existing, incoming);
  assert.equal(diff.conflictBoards.length, 1);
  assert.equal(diff.hasConflicts, true);
  assert.equal(diff.canSafelyApply, false);
  assert.match(diff.conflictBoards[0].message, /đang có trạng thái "official" nhưng bị thiếu trong file mới/);
});

test("diff: phát hiện bàn đổi kỳ thủ khi ván chưa nhập kết quả (modifiedBoards)", () => {
  const existing: ExistingMatchSnapshot[] = [
    {
      id: "m1",
      board_number: 1,
      status: "unreported",
      result_code: null,
      white_player: { full_name: "Nguyễn An" },
      black_player: { full_name: "Trần Bình" },
    },
  ];
  const incoming: Pairing[] = [
    {
      board: 1,
      whiteName: "Nguyễn An",
      whiteClub: "USCC",
      blackName: "Lê Văn Mới",
      blackClub: "HCMUS",
      sourceResult: "",
    },
  ];

  const diff = computeRoundDiff(1, existing, incoming);
  assert.equal(diff.modifiedBoards.length, 1);
  assert.equal(diff.hasConflicts, false);
  assert.equal(diff.canSafelyApply, true);
});

test("stale preview: phát hiện dữ liệu vòng đấu thay đổi kể từ lúc xem trước", () => {
  const initialMatches: ExistingMatchSnapshot[] = [
    {
      id: "m1",
      board_number: 1,
      status: "unreported",
      result_code: null,
      white_player: { full_name: "Nguyễn An" },
      black_player: { full_name: "Trần Bình" },
    },
  ];

  const signatureAtPreview = computeRoundStateSignature(initialMatches);
  assert.equal(isStaleRoundState(signatureAtPreview, initialMatches), false);

  // Trọng tài khác vừa nhập kết quả bàn 1 trong lúc đang mở màn hình preview
  const updatedMatches: ExistingMatchSnapshot[] = [
    {
      id: "m1",
      board_number: 1,
      status: "pending_white",
      result_code: "1-0",
      white_player: { full_name: "Nguyễn An" },
      black_player: { full_name: "Trần Bình" },
    },
  ];

  assert.equal(isStaleRoundState(signatureAtPreview, updatedMatches), true);
});

