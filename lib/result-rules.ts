export type MatchStatus =
  | "unreported"
  | "pending_white"
  | "pending_black"
  | "disputed"
  | "special_review"
  | "official"
  | "reopened";

export type ResultCode = "1-0" | "0-1" | "1/2-1/2";
export type ResultKind =
  | "normal"
  | "resignation"
  | "bye"
  | "forfeit"
  | "absence"
  | "adjudicated"
  | "other";

export const RESULT_CODES: ResultCode[] = ["1-0", "0-1", "1/2-1/2"];
export const RESULT_KINDS: ResultKind[] = [
  "normal",
  "resignation",
  "bye",
  "forfeit",
  "absence",
  "adjudicated",
  "other",
];
export const SUBMITTABLE_RESULT_KINDS: ResultKind[] = [
  "normal",
  "resignation",
  "forfeit",
  "absence",
  "other",
];
export const RESULT_KIND_LABELS: Record<ResultKind, string> = {
  normal: "Bình thường",
  resignation: "Bỏ cuộc",
  bye: "Bye",
  forfeit: "Xử thua",
  absence: "Vắng mặt",
  adjudicated: "Trọng tài quyết định",
  other: "Khác",
};

export function canSubmit(status: MatchStatus): boolean {
  return status === "unreported" || status === "reopened";
}

export function canConfirmWhite(status: MatchStatus): boolean {
  return status === "pending_white";
}

export function canConfirmBlack(status: MatchStatus): boolean {
  return status === "pending_black";
}

export function canDispute(status: MatchStatus): boolean {
  return status === "pending_white" || status === "pending_black";
}

export function nextStatusAfterSubmit(resultKind: ResultKind): MatchStatus {
  return resultKind === "normal" || resultKind === "resignation"
    ? "pending_white"
    : "special_review";
}

export function requiresTechnicalApproval(resultKind: ResultKind): boolean {
  return nextStatusAfterSubmit(resultKind) === "special_review";
}

export function nextStatusAfterWhiteConfirm(): MatchStatus {
  return "pending_black";
}

export function nextStatusAfterBlackConfirm(): MatchStatus {
  return "official";
}

export function isTerminal(status: MatchStatus): boolean {
  return status === "official";
}

/** Technical referees may cancel any result that has been entered (FR-08). */
export function canCancel(status: MatchStatus): boolean {
  return (
    status === "pending_white" ||
    status === "pending_black" ||
    status === "disputed" ||
    status === "special_review" ||
    status === "official"
  );
}

/** A cancelled result returns to the start of the normal entry flow. */
export function statusAfterCancel(): MatchStatus {
  return "unreported";
}

/**
 * Returns the losing player side that must confirm a non-draw match.
 * - '1-0': Black lost, Black must confirm.
 * - '0-1': White lost, White must confirm.
 * - '1/2-1/2': Draw, both must confirm (returns null).
 */
export function getLosingConfirmationSide(
  resultCode: ResultCode | string | null,
): "white" | "black" | null {
  if (resultCode === "1-0") return "black";
  if (resultCode === "0-1") return "white";
  return null;
}

/**
 * Checks whether both sides must confirm (draw results).
 */
export function requiresBothSidesConfirmation(
  resultCode: ResultCode | string | null,
): boolean {
  return resultCode === "1/2-1/2" || resultCode === "1/2";
}
