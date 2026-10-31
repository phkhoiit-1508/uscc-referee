export type ResultEvent = {
  id: number;
  match_id: string;
  event_type: string;
  player_side: string | null;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  reason: string | null;
  created_at: string;
  actor_name: string;
};

const EVENT_LABELS: Record<string, string> = {
  result_submitted: "Nhập kết quả",
  special_marked: "Nhập kết quả đặc biệt",
  player_confirmed: "Kỳ thủ xác nhận",
  player_disagreed: "Kỳ thủ không đồng ý",
  result_approved: "Technical duyệt",
  result_reopened: "Mở lại kết quả",
  result_corrected: "Sửa kết quả",
  result_cancelled: "Hủy kết quả",
};

const STATUS_LABELS: Record<string, string> = {
  unreported: "Chưa nhập",
  pending_white: "Chờ Trắng",
  pending_black: "Chờ Đen",
  disputed: "Tranh chấp",
  special_review: "Chờ duyệt",
  official: "Chính thức",
  reopened: "Mở lại",
};

export function eventLabel(event: Pick<ResultEvent, "event_type" | "player_side">): string {
  const label = EVENT_LABELS[event.event_type] ?? event.event_type;
  if (event.player_side === "white") return `${label} (Trắng)`;
  if (event.player_side === "black") return `${label} (Đen)`;
  return label;
}

/** Summarise a result_events snapshot as "status · result · kind"; null when empty. */
export function describeSnapshot(data: Record<string, unknown> | null): string | null {
  if (!data) return null;
  const parts = [
    typeof data.status === "string" ? (STATUS_LABELS[data.status] ?? data.status) : null,
    typeof data.result_code === "string" ? data.result_code : null,
    typeof data.result_kind === "string" ? data.result_kind : null,
  ].filter((part): part is string => Boolean(part));
  return parts.length ? parts.join(" · ") : null;
}

export function groupEventsByMatch(events: ResultEvent[]): Record<string, ResultEvent[]> {
  const grouped: Record<string, ResultEvent[]> = {};
  for (const event of events) {
    (grouped[event.match_id] ??= []).push(event);
  }
  return grouped;
}

