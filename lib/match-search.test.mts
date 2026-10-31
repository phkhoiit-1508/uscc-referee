import assert from "node:assert/strict";
import test from "node:test";

import {
  filterMatches,
  matchMatchesSearch,
  normalizeVietnameseText,
  type SearchableMatch,
} from "./match-search.ts";

const match: SearchableMatch = {
  board_number: 12,
  round_number: 1,
  status: "pending_white",
  result_code: "1-0",
  result_kind: "normal",
  white_player: { full_name: "Nguyễn Hồng Phúc", external_id: "USCC-001", club: "UIT" },
  black_player: { full_name: "Bạch Triều Vĩ", external_id: "USCC-041", club: "IUC" },
};

const match2: SearchableMatch = {
  board_number: 15,
  round_number: 1,
  status: "official",
  result_code: "1/2-1/2",
  result_kind: "normal",
  white_player: { full_name: "Đặng Quốc Bảo", external_id: "USCC-002", club: "HCMUS" },
  black_player: { full_name: "Trần Đặng Gia Phước", external_id: "USCC-042", club: "LHP" },
};

test("match search supports board, accented name, code and club", () => {
  assert.equal(matchMatchesSearch(match, "12"), true);
  assert.equal(matchMatchesSearch(match, "nguyễn hồng"), true);
  assert.equal(matchMatchesSearch(match, "uscc-001"), true);
  assert.equal(matchMatchesSearch(match, "iuc"), true);
  assert.equal(matchMatchesSearch(match, "không tồn tại"), false);
});

test("match search supports Vietnamese unaccented (không dấu) queries including đ/Đ", () => {
  assert.equal(normalizeVietnameseText("Nguyễn Hồng Phúc"), "nguyen hong phuc");
  assert.equal(normalizeVietnameseText("Đặng Quốc Bảo"), "dang quoc bao");

  assert.equal(matchMatchesSearch(match, "nguyen hong phuc"), true);
  assert.equal(matchMatchesSearch(match, "bach trieu vi"), true);
  assert.equal(matchMatchesSearch(match2, "dang quoc bao"), true);
  assert.equal(matchMatchesSearch(match2, "tran dang gia phuoc"), true);
});

test("match search supports color side filter (white / black)", () => {
  // Nguyễn Hồng Phúc is White on board 12
  assert.equal(matchMatchesSearch(match, "nguyen hong phuc", "white"), true);
  assert.equal(matchMatchesSearch(match, "nguyen hong phuc", "black"), false);

  // Bạch Triều Vĩ is Black on board 12
  assert.equal(matchMatchesSearch(match, "bach trieu vi", "black"), true);
  assert.equal(matchMatchesSearch(match, "bach trieu vi", "white"), false);
});

test("filterMatches filters by round, status, result, and color", () => {
  const list = [match, match2];

  const officialOnly = filterMatches(list, { statusFilter: "official" });
  assert.equal(officialOnly.length, 1);
  assert.equal(officialOnly[0].board_number, 15);

  const pendingGroup = filterMatches(list, { statusFilter: "pending" });
  assert.equal(pendingGroup.length, 1);
  assert.equal(pendingGroup[0].board_number, 12);

  const drawOnly = filterMatches(list, { resultFilter: "1/2-1/2" });
  assert.equal(drawOnly.length, 1);
  assert.equal(drawOnly[0].board_number, 15);

  const blackPlayerFilter = filterMatches(list, {
    query: "phuoc",
    colorFilter: "black",
  });
  assert.equal(blackPlayerFilter.length, 1);
  assert.equal(blackPlayerFilter[0].board_number, 15);
});

test("empty match search includes every match", () => {
  assert.equal(matchMatchesSearch(match, "   "), true);
});
