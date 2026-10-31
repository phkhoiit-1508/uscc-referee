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
