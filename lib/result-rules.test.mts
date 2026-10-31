import test from "node:test";
import assert from "node:assert/strict";
import {
  canCancel,
  canSubmit,
  statusAfterCancel,
  canConfirmWhite,
  canConfirmBlack,
  canDispute,
  nextStatusAfterSubmit,
  nextStatusAfterWhiteConfirm,
  nextStatusAfterBlackConfirm,
  isTerminal,
  requiresTechnicalApproval,
  RESULT_CODES,
  RESULT_KINDS,
  SUBMITTABLE_RESULT_KINDS,
  type MatchStatus,
} from "./result-rules.ts";

test("result-rules: RESULT_CODES contains standard chess outcomes", () => {
  assert.deepEqual(RESULT_CODES, ["1-0", "0-1", "1/2-1/2"]);
});

test("result-rules: RESULT_KINDS contains all expected PRD categories", () => {
  assert.deepEqual(RESULT_KINDS, [
    "normal",
    "resignation",
    "bye",
    "forfeit",
    "absence",
    "adjudicated",
    "other",
  ]);
  assert.deepEqual(SUBMITTABLE_RESULT_KINDS, [
    "normal",
    "resignation",
    "forfeit",
    "absence",
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
  assert.equal(nextStatusAfterSubmit("normal"), "pending_white");
  assert.equal(nextStatusAfterSubmit("resignation"), "pending_white");
  assert.equal(nextStatusAfterSubmit("forfeit"), "special_review");
  assert.equal(nextStatusAfterSubmit("absence"), "special_review");
  assert.equal(nextStatusAfterSubmit("other"), "special_review");
  assert.equal(requiresTechnicalApproval("forfeit"), true);
  assert.equal(requiresTechnicalApproval("normal"), false);
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

test("result-rules: cancel rules (FR-08)", () => {
  const cancellable: MatchStatus[] = ["pending_white", "pending_black", "disputed", "special_review", "official"];
  const notCancellable: MatchStatus[] = ["unreported", "reopened"];
  for (const st of cancellable) assert.equal(canCancel(st), true, `canCancel should be true for ${st}`);
  for (const st of notCancellable) assert.equal(canCancel(st), false, `canCancel should be false for ${st}`);
  // A cancelled match can be entered again through the normal flow.
  assert.equal(canSubmit(statusAfterCancel()), true);
  assert.equal(isTerminal(statusAfterCancel()), false);
});
