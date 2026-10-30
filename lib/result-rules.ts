export type MatchStatus =
  | "unreported"
  | "pending_white"
  | "pending_black"
  | "disputed"
  | "special_review"
  | "official"
  | "reopened";

export type ResultCode = "1-0" | "0-1" | "1/2-1/2";
export type ResultKind = "normal" | "bye" | "forfeit" | "absence" | "adjudicated" | "other";

export const RESULT_CODES: ResultCode[] = ["1-0", "0-1", "1/2-1/2"];
export const RESULT_KINDS: ResultKind[] = ["normal", "bye", "forfeit", "absence", "adjudicated", "other"];

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

export function nextStatusAfterSubmit(): MatchStatus {
  return "pending_white";
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
