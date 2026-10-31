import assert from "node:assert/strict";
import test from "node:test";

import { matchMatchesSearch, type SearchableMatch } from "./match-search.ts";

const match: SearchableMatch = {
  board_number: 12,
  white_player: { full_name: "Nguyễn Hồng Phúc", external_id: "USCC-001", club: "UIT" },
  black_player: { full_name: "Bạch Triều Vĩ", external_id: null, club: "IUC" },
};

test("match search supports board, name, code and club", () => {
  assert.equal(matchMatchesSearch(match, "12"), true);
  assert.equal(matchMatchesSearch(match, "nguyễn hồng"), true);
  assert.equal(matchMatchesSearch(match, "uscc-001"), true);
  assert.equal(matchMatchesSearch(match, "iuc"), true);
  assert.equal(matchMatchesSearch(match, "không tồn tại"), false);
});

test("empty match search includes every match", () => {
  assert.equal(matchMatchesSearch(match, "   "), true);
});
