import assert from "node:assert/strict";
import test from "node:test";

import { describeSnapshot, eventLabel, groupEventsByMatch, type ResultEvent } from "./result-history.ts";

test("result-history: event labels include the confirming side", () => {
  assert.equal(eventLabel({ event_type: "result_cancelled", player_side: null }), "Hủy kết quả");
  assert.equal(eventLabel({ event_type: "player_confirmed", player_side: "white" }), "Kỳ thủ xác nhận (Trắng)");
  assert.equal(eventLabel({ event_type: "unknown_event", player_side: null }), "unknown_event");
});

test("result-history: snapshots show status, result and kind", () => {
  assert.equal(
    describeSnapshot({ status: "official", result_code: "1-0", result_kind: "normal", white_confirmed_at: "x" }),
    "Chính thức · 1-0 · normal",
  );
  assert.equal(describeSnapshot({ status: "unreported" }), "Chưa nhập");
  assert.equal(describeSnapshot({ result_code: null }), null);
  assert.equal(describeSnapshot(null), null);
});

test("result-history: events are grouped per match in input order", () => {
  const base = { event_type: "result_submitted", player_side: null, old_data: null, new_data: null, reason: null, created_at: "", actor_name: "" };
  const events: ResultEvent[] = [
    { ...base, id: 1, match_id: "a" },
    { ...base, id: 2, match_id: "b" },
    { ...base, id: 3, match_id: "a" },
  ];
  const grouped = groupEventsByMatch(events);
  assert.deepEqual(grouped.a.map((e) => e.id), [1, 3]);
  assert.deepEqual(grouped.b.map((e) => e.id), [2]);
});

