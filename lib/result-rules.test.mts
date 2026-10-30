import test from "node:test";
import assert from "node:assert/strict";
import {
  canSubmit,
  canConfirmWhite,
  canConfirmBlack,
  canDispute,
  nextStatusAfterSubmit,
  nextStatusAfterWhiteConfirm,
  nextStatusAfterBlackConfirm,
  isTerminal,
  RESULT_CODES,
  RESULT_KINDS,
  type MatchStatus,
} from "./result-rules.ts";

test("result-rules: RESULT_CODES contains standard chess outcomes", () => {
  assert.deepEqual(RESULT_CODES, ["1-0", "0-1", "1/2-1/2"]);
});

test("result-rules: RESULT_KINDS contains all expected PRD categories", () => {
  assert.deepEqual(RESULT_KINDS, [
    "normal",
    "bye",
    "forfeit",
    "absence",
    "adjudicated",
    "other",
  ]);
});

test("result-rules: submission rules", () => {
  const allowed: MatchStatus[] = ["unreported", "reopened"];
  const disallowed: MatchStatus[] = [
    "pending_white",
    "pending_black",
    "disputed",
    "special_review",
    "official",
  ];

  for (const st of allowed) {
    assert.equal(canSubmit(st), true, `canSubmit should be true for ${st}`);
  }
  for (const st of disallowed) {
    assert.equal(canSubmit(st), false, `canSubmit should be false for ${st}`);
  }
  assert.equal(nextStatusAfterSubmit(), "pending_white");
});

test("result-rules: confirmation order White -> Black", () => {
  assert.equal(canConfirmWhite("pending_white"), true);
  assert.equal(canConfirmWhite("pending_black"), false);
  assert.equal(canConfirmWhite("unreported"), false);

  assert.equal(nextStatusAfterWhiteConfirm(), "pending_black");

  assert.equal(canConfirmBlack("pending_black"), true);
  assert.equal(canConfirmBlack("pending_white"), false);
  assert.equal(canConfirmBlack("unreported"), false);

  assert.equal(nextStatusAfterBlackConfirm(), "official");
});

test("result-rules: dispute rules", () => {
  assert.equal(canDispute("pending_white"), true);
  assert.equal(canDispute("pending_black"), true);
  assert.equal(canDispute("unreported"), false);
  assert.equal(canDispute("official"), false);
  assert.equal(canDispute("disputed"), false);
});

test("result-rules: terminal status", () => {
  assert.equal(isTerminal("official"), true);
  assert.equal(isTerminal("unreported"), false);
  assert.equal(isTerminal("pending_white"), false);
  assert.equal(isTerminal("pending_black"), false);
  assert.equal(isTerminal("disputed"), false);
  assert.equal(isTerminal("reopened"), false);
});
