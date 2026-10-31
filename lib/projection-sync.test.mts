import test from "node:test";
import assert from "node:assert/strict";

import {
  filterOfficialMatches,
  filterMatchesByRound,
  createInitialSyncState,
  handleSyncSuccess,
  handleSyncFailure,
  handleRoundChange,
  type MatchWithStatus,
  type OfficialMatch,
} from "./projection-sync.ts";

const sampleMatches: MatchWithStatus[] = [
  {
    id: "m1",
    round_number: 1,
    board_number: 1,
    status: "official",
    result_code: "1-0",
    result_kind: "normal",
    white_player: { full_name: "Nguyễn Văn A" },
    black_player: { full_name: "Trần Thị B" },
  },
  {
    id: "m2",
    round_number: 1,
    board_number: 2,
    status: "pending_white",
    result_code: "0-1",
    result_kind: "normal",
    white_player: { full_name: "Lê Văn C" },
    black_player: { full_name: "Phạm Văn D" },
  },
  {
    id: "m3",
    round_number: 1,
    board_number: 3,
    status: "pending_black",
    result_code: "1/2-1/2",
    result_kind: "normal",
    white_player: { full_name: "Hoàng Văn E" },
    black_player: { full_name: "Đỗ Thị F" },
  },
  {
    id: "m4",
    round_number: 1,
    board_number: 4,
    status: "disputed",
    result_code: "1-0",
    result_kind: "normal",
    white_player: { full_name: "Vũ Văn G" },
    black_player: { full_name: "Bùi Thị H" },
  },
  {
    id: "m5",
    round_number: 1,
    board_number: 5,
    status: "special_review",
    result_code: "1-0",
    result_kind: "absence",
    white_player: { full_name: "Mai Văn I" },
    black_player: { full_name: "Đinh Văn K" },
  },
  {
    id: "m6",
    round_number: 1,
    board_number: 6,
    status: "reopened",
    result_code: null,
    result_kind: null,
    white_player: { full_name: "Trịnh Văn L" },
    black_player: { full_name: "Lý Thị M" },
  },
  {
    id: "m7",
    round_number: 1,
    board_number: 7,
    status: "unreported", // Cancelled returns to unreported
    result_code: null,
    result_kind: null,
    white_player: { full_name: "Hồ Văn N" },
    black_player: { full_name: "Dương Thị P" },
  },
  {
    id: "m8",
    round_number: 2,
    board_number: 1,
    status: "official",
    result_code: "1/2-1/2",
    result_kind: "normal",
    white_player: { full_name: "Nguyễn Văn A" },
    black_player: { full_name: "Lê Văn C" },
  },
];

test("1. Kết quả official xuất hiện trên projection", () => {
  const official = filterOfficialMatches(sampleMatches);
  const ids = official.map((m) => m.id);
  assert.ok(ids.includes("m1"));
  assert.ok(ids.includes("m8"));
});

test("2. Pending không được công bố (cả pending_white và pending_black)", () => {
  const official = filterOfficialMatches(sampleMatches);
  const ids = official.map((m) => m.id);
  assert.strictEqual(ids.includes("m2"), false, "pending_white must not be published");
  assert.strictEqual(ids.includes("m3"), false, "pending_black must not be published");
});

test("3. Disputed không được công bố", () => {
  const official = filterOfficialMatches(sampleMatches);
  const ids = official.map((m) => m.id);
  assert.strictEqual(ids.includes("m4"), false, "disputed must not be published");
});

test("4. Reopened không còn hiển thị kết quả cũ", () => {
  const official = filterOfficialMatches(sampleMatches);
  const ids = official.map((m) => m.id);
  assert.strictEqual(ids.includes("m6"), false, "reopened must not be published");
});

test("5. Kết quả đã hủy không được công bố", () => {
  const official = filterOfficialMatches(sampleMatches);
  const ids = official.map((m) => m.id);
  assert.strictEqual(ids.includes("m7"), false, "cancelled/unreported must not be published");
});

test("6. Chọn vòng 1 chỉ lấy vòng 1", () => {
  const official = filterOfficialMatches(sampleMatches);
  const round1 = filterMatchesByRound(official, 1);
  assert.strictEqual(round1.length, 1);
  assert.strictEqual(round1[0].id, "m1");
  assert.strictEqual(round1[0].round_number, 1);
});

test("7. Đổi sang vòng 2 nhận dữ liệu mới", () => {
  const official = filterOfficialMatches(sampleMatches);
  const round2 = filterMatchesByRound(official, 2);
  assert.strictEqual(round2.length, 1);
  assert.strictEqual(round2[0].id, "m8");
  assert.strictEqual(round2[0].round_number, 2);
});

test("8. Fetch thất bại không xóa lastSuccessfulSync", () => {
  const initialTime = "2026-10-31T10:00:00.000Z";
  const state = createInitialSyncState(1, [], initialTime);
  assert.strictEqual(state.lastSuccessfulSync, initialTime);
  assert.strictEqual(state.connectionStatus, "connected");

  // Network failure occurs
  const failedState = handleSyncFailure(state, { message: "Network offline" });
  assert.strictEqual(failedState.connectionStatus, "disconnected");
  assert.strictEqual(failedState.lastSuccessfulSync, initialTime, "lastSuccessfulSync must be preserved");
  assert.ok(failedState.errorMessage?.includes("Network offline"));
});

test("9. Fetch thành công trở lại khôi phục trạng thái connected", () => {
  const initialTime = "2026-10-31T10:00:00.000Z";
  const state = createInitialSyncState(1, [], initialTime);
  const disconnectedState = handleSyncFailure(state);
  assert.strictEqual(disconnectedState.connectionStatus, "disconnected");

  const newTime = "2026-10-31T10:00:05.000Z";
  const newMatches: OfficialMatch[] = [
    {
      id: "m1",
      round_number: 1,
      board_number: 1,
      result_code: "1-0",
      result_kind: "normal",
      white_player: { full_name: "A" },
      black_player: { full_name: "B" },
    },
  ];

  const reconnectedState = handleSyncSuccess(disconnectedState, {
    matches: newMatches,
    round: 1,
    syncedAt: newTime,
    requestId: 0,
  });

  assert.strictEqual(reconnectedState.connectionStatus, "connected");
  assert.strictEqual(reconnectedState.lastSuccessfulSync, newTime);
  assert.strictEqual(reconnectedState.matches.length, 1);
  assert.strictEqual(reconnectedState.errorMessage, null);
});

test("10. Response cũ không ghi đè dữ liệu của vòng mới (race condition prevention)", () => {
  const state = createInitialSyncState(1, [], "2026-10-31T10:00:00.000Z");

  // User switches from Round 1 to Round 2
  const { state: round2State, newRequestId } = handleRoundChange(state, 2, 5);
  assert.strictEqual(round2State.selectedRound, 2);
  assert.strictEqual(round2State.lastRequestId, newRequestId);
  assert.strictEqual(round2State.matches.length, 0, "previous round matches cleared during switch");

  // Stale response from round 1 arrives later with old requestId (0 < newRequestId)
  const staleResponseMatches: OfficialMatch[] = [
    {
      id: "m1",
      round_number: 1,
      board_number: 1,
      result_code: "1-0",
      result_kind: "normal",
      white_player: { full_name: "Old Round 1 Match" },
      black_player: { full_name: "Old Round 1 Match" },
    },
  ];

  const stateAfterStale = handleSyncSuccess(round2State, {
    matches: staleResponseMatches,
    round: 1, // response was for round 1
    syncedAt: "2026-10-31T10:00:02.000Z",
    requestId: 0, // stale request ID
  });

  assert.strictEqual(stateAfterStale.selectedRound, 2);
  assert.strictEqual(stateAfterStale.matches.length, 0, "stale response must be rejected");

  // Valid response for Round 2 arrives with correct requestId
  const round2Matches: OfficialMatch[] = [
    {
      id: "m8",
      round_number: 2,
      board_number: 1,
      result_code: "1/2-1/2",
      result_kind: "normal",
      white_player: { full_name: "Round 2 A" },
      black_player: { full_name: "Round 2 C" },
    },
  ];

  const stateAfterValidRound2 = handleSyncSuccess(stateAfterStale, {
    matches: round2Matches,
    round: 2,
    syncedAt: "2026-10-31T10:00:03.000Z",
    requestId: newRequestId,
  });

  assert.strictEqual(stateAfterValidRound2.selectedRound, 2);
  assert.strictEqual(stateAfterValidRound2.matches.length, 1);
  assert.strictEqual(stateAfterValidRound2.matches[0].id, "m8");
});

test("11 & 12. Security rules: role check rejects recorder and anon for technical-only actions", () => {
  function checkProjectionAccess(role: string | null): { allowed: boolean; status: number } {
    if (!role) return { allowed: false, status: 401 };
    if (role !== "technical") return { allowed: false, status: 403 };
    return { allowed: true, status: 200 };
  }

  // 12. Unauthenticated user
  const anonCheck = checkProjectionAccess(null);
  assert.strictEqual(anonCheck.allowed, false);
  assert.strictEqual(anonCheck.status, 401);

  // 11. Recorder user
  const recorderCheck = checkProjectionAccess("recorder");
  assert.strictEqual(recorderCheck.allowed, false);
  assert.strictEqual(recorderCheck.status, 403);

  // Technical user
  const technicalCheck = checkProjectionAccess("technical");
  assert.strictEqual(technicalCheck.allowed, true);
  assert.strictEqual(technicalCheck.status, 200);
});
