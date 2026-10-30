"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import {
  confirmSide,
  reopenResult,
  resolveDispute,
  submitResult,
  type ConfirmSideState,
  type SubmitResultState,
  type TechnicalResultState,
} from "@/app/tournaments/[id]/actions";
import { Button } from "@/components/ui/button";
import { RESULT_CODES } from "@/lib/result-rules";

type MatchRow = {
  id: string;
  board_number: number;
  round_number: number;
  status: string;
  result_code: string | null;
  result_kind: string | null;
  white_confirmed_at: string | null;
  black_confirmed_at: string | null;
  white_player: { full_name: string; club: string | null } | null;
  black_player: { full_name: string; club: string | null } | null;
};

const STATUS_LABELS: Record<string, string> = {
  unreported: "Chưa nhập",
  pending_white: "Chờ Trắng xác nhận",
  pending_black: "Chờ Đen xác nhận",
  disputed: "Tranh chấp",
  special_review: "Xét đặc biệt",
  official: "Chính thức",
  reopened: "Mở lại",
};

const RESULT_LABELS: Record<string, string> = {
  "1-0": "Trắng thắng (1-0)",
  "0-1": "Đen thắng (0-1)",
  "1/2-1/2": "Hòa (½-½)",
};

const initialSubmit: SubmitResultState = {};
const initialConfirm: ConfirmSideState = {};
const initialTechnical: TechnicalResultState = {};

function MatchCard({ match, isTechnical }: { match: MatchRow; isTechnical: boolean }) {
  const router = useRouter();
  const [submitState, submitAction, submitPending] = useActionState(submitResult, initialSubmit);
  const [confirmState, confirmAction, confirmPending] = useActionState(confirmSide, initialConfirm);
  const [resolveState, resolveAction, resolvePending] = useActionState(resolveDispute, initialTechnical);
  const [reopenState, reopenAction, reopenPending] = useActionState(reopenResult, initialTechnical);
  const [resultKind, setResultKind] = useState("normal");

  useEffect(() => {
    if (submitState.success || confirmState.success || confirmState.disputed || resolveState.success || reopenState.success) {
      router.refresh();
    }
  }, [submitState, confirmState, resolveState, reopenState, router]);

  const status = match.status;
  const isDone = status === "official";
  const isDisputed = status === "disputed" || status === "special_review";

  return (
    <div className="rounded border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Bàn {match.board_number} · Vòng {match.round_number}
          </span>
          <div className="mt-1 grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-sm">
            <span className="font-medium">{match.white_player?.full_name ?? "—"}</span>
            <span className="text-slate-400">vs</span>
            <span className="font-medium text-right">{match.black_player?.full_name ?? "—"}</span>
          </div>
          {match.result_code && (
            <p className="mt-1 text-sm font-semibold text-teal-700">{RESULT_LABELS[match.result_code]}</p>
          )}
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
            isDone
              ? "bg-teal-100 text-teal-800"
              : isDisputed
                ? "bg-red-100 text-red-800"
                : "bg-amber-100 text-amber-800"
          }`}
        >
          {STATUS_LABELS[status] ?? status}
        </span>
      </div>

      {/* Submit form */}
      {(status === "unreported" || status === "reopened") && !submitState.success && (
        <form action={submitAction} className="mt-3 grid gap-2 border-t border-slate-100 pt-3">
          <input type="hidden" name="matchId" value={match.id} />
          <div className="flex flex-wrap gap-2">
            {RESULT_CODES.map((code) => (
              <label key={code} className="flex cursor-pointer items-center gap-1 rounded border border-slate-200 px-2 py-1 text-sm hover:bg-slate-50 has-[:checked]:border-teal-600 has-[:checked]:bg-teal-50">
                <input type="radio" name="resultCode" value={code} required className="accent-teal-600" />
                {RESULT_LABELS[code]}
              </label>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-500">Loại:</label>
            <select
              name="resultKind"
              value={resultKind}
              onChange={(e) => setResultKind(e.target.value)}
              className="rounded border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900"
            >
              <option value="normal">Bình thường</option>
              <option value="forfeit">Xử thua</option>
              <option value="absence">Vắng mặt</option>
              <option value="bye">Bye</option>
              <option value="adjudicated">Trọng tài quyết định</option>
              <option value="other">Khác</option>
            </select>
          </div>
          {submitState.error && (
            <p role="alert" className="text-sm text-red-700">{submitState.error}</p>
          )}
          <Button type="submit" disabled={submitPending} size="sm" className="w-fit bg-slate-900 text-white hover:bg-slate-800">
            {submitPending ? "Đang lưu..." : "Nhập kết quả"}
          </Button>
        </form>
      )}

      {submitState.success && (
        <p className="mt-2 text-sm text-teal-700">Đã nhập — chờ Trắng xác nhận.</p>
      )}

      {/* Confirm form — white */}
      {status === "pending_white" && !confirmState.success && !confirmState.disputed && (
        <form action={confirmAction} className="mt-3 grid gap-2 border-t border-slate-100 pt-3">
          <input type="hidden" name="matchId" value={match.id} />
          <input type="hidden" name="side" value="white" />
          <p className="text-sm text-slate-600">
            Trắng (<span className="font-medium">{match.white_player?.full_name}</span>) xác nhận kết quả?
          </p>
          <div className="flex gap-2">
            <button
              type="submit"
              name="agreed"
              value="true"
              disabled={confirmPending}
              className="rounded bg-teal-700 px-3 py-1.5 text-sm text-white hover:bg-teal-800 disabled:opacity-50"
            >
              Đồng ý
            </button>
            <button
              type="submit"
              name="agreed"
              value="false"
              disabled={confirmPending}
              className="rounded border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              Tranh chấp
            </button>
          </div>
          {confirmState.error && (
            <p role="alert" className="text-sm text-red-700">{confirmState.error}</p>
          )}
        </form>
      )}

      {/* Confirm form — black */}
      {status === "pending_black" && !confirmState.success && !confirmState.disputed && (
        <form action={confirmAction} className="mt-3 grid gap-2 border-t border-slate-100 pt-3">
          <input type="hidden" name="matchId" value={match.id} />
          <input type="hidden" name="side" value="black" />
          <p className="text-sm text-slate-600">
            Đen (<span className="font-medium">{match.black_player?.full_name}</span>) xác nhận kết quả?
          </p>
          <div className="flex gap-2">
            <button
              type="submit"
              name="agreed"
              value="true"
              disabled={confirmPending}
              className="rounded bg-teal-700 px-3 py-1.5 text-sm text-white hover:bg-teal-800 disabled:opacity-50"
            >
              Đồng ý
            </button>
            <button
              type="submit"
              name="agreed"
              value="false"
              disabled={confirmPending}
              className="rounded border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              Tranh chấp
            </button>
          </div>
          {confirmState.error && (
            <p role="alert" className="text-sm text-red-700">{confirmState.error}</p>
          )}
        </form>
      )}

      {confirmState.success && (
        <p className="mt-2 text-sm text-teal-700">
          {status === "pending_black" ? "Kết quả chính thức." : "Đã xác nhận — chờ bên còn lại."}
        </p>
      )}
      {confirmState.disputed && (
        <p className="mt-2 text-sm text-red-700">Tranh chấp đã ghi nhận — chờ trọng tài kỹ thuật xử lý.</p>
      )}

      {isTechnical && status === "disputed" && !resolveState.success && (
        <form action={resolveAction} className="mt-3 grid gap-3 border-t border-slate-100 pt-3">
          <input type="hidden" name="matchId" value={match.id} />
          <p className="text-sm font-medium">Phân xử tranh chấp (không cần xác nhận lại)</p>
          <div className="flex flex-wrap gap-2">
            {RESULT_CODES.map((code) => (
              <label key={code} className="flex items-center gap-1 text-sm">
                <input type="radio" name="resultCode" value={code} required defaultChecked={match.result_code === code} />
                {RESULT_LABELS[code]}
              </label>
            ))}
          </div>
          <label className="grid gap-1 text-sm">
            Loại kết quả
            <select name="resultKind" defaultValue={match.result_kind ?? "adjudicated"} className="rounded border border-slate-300 bg-white p-2 text-slate-900">
              <option value="normal">Bình thường</option>
              <option value="adjudicated">Trọng tài quyết định</option>
              <option value="forfeit">Xử thua</option>
              <option value="absence">Vắng mặt</option>
              <option value="other">Khác</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            Lý do phân xử
            <textarea name="reason" required maxLength={1000} rows={2} className="rounded border border-slate-300 bg-white p-2 text-slate-900" />
          </label>
          {resolveState.error && <p role="alert" className="text-sm text-red-700">{resolveState.error}</p>}
          <Button type="submit" disabled={resolvePending} size="sm" className="w-fit bg-slate-900 text-white hover:bg-slate-800">
            {resolvePending ? "Đang lưu..." : "Phân xử và công bố"}
          </Button>
        </form>
      )}
      {isTechnical && isDone && !reopenState.success && (
        <form action={reopenAction} className="mt-3 grid gap-2 border-t border-slate-100 pt-3">
          <input type="hidden" name="matchId" value={match.id} />
          <label className="grid gap-1 text-sm">
            Lý do mở lại (kết quả sẽ tạm ẩn khỏi trang chiếu)
            <textarea name="reason" required maxLength={1000} rows={2} className="rounded border border-slate-300 bg-white p-2 text-slate-900" />
          </label>
          {reopenState.error && <p role="alert" className="text-sm text-red-700">{reopenState.error}</p>}
          <Button type="submit" disabled={reopenPending} size="sm" variant="outline" className="w-fit bg-white text-slate-900 hover:bg-slate-100 hover:text-slate-900">
            {reopenPending ? "Đang mở lại..." : "Mở lại để sửa kết quả"}
          </Button>
        </form>
      )}
      {(resolveState.success || reopenState.success) && (
        <p role="status" className="mt-2 text-sm text-teal-700">Đã cập nhật. Đang tải dữ liệu mới...</p>
      )}
      {isDone && !reopenState.success && (
        <p className="mt-2 text-sm text-teal-700 font-medium">Kết quả chính thức.</p>
      )}
      {isDisputed && (
        <p className="mt-2 text-sm text-red-700">Tranh chấp — trọng tài kỹ thuật cần xử lý.</p>
      )}
    </div>
  );
}

export function RecorderMatchLookup({
  totalRounds,
  matches,
  isTechnical,
}: {
  totalRounds: number;
  matches: MatchRow[];
  isTechnical: boolean;
}) {
  const [round, setRound] = useState(1);
  const [search, setSearch] = useState("");

  const filtered = matches.filter(
    (m) =>
      m.round_number === round &&
      (search === "" ||
        String(m.board_number).includes(search) ||
        m.white_player?.full_name.toLowerCase().includes(search.toLowerCase()) ||
        m.black_player?.full_name.toLowerCase().includes(search.toLowerCase())),
  );

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1">
          <label className="text-sm font-medium">Vòng</label>
          <select
            value={round}
            onChange={(e) => setRound(Number(e.target.value))}
            className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900"
          >
            {Array.from({ length: totalRounds }, (_, i) => i + 1).map((r) => (
              <option key={r} value={r}>Vòng {r}</option>
            ))}
          </select>
        </div>
        <div className="grid gap-1">
          <label className="text-sm font-medium">Tìm bàn / tên</label>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Số bàn hoặc tên kỳ thủ"
            className="w-56 rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-slate-500">Không tìm thấy ván đấu.</p>
      ) : (
        <div className="grid gap-3">
          {filtered.map((m) => (
            <MatchCard key={`${m.id}-${m.status}`} match={m} isTechnical={isTechnical} />
          ))}
        </div>
      )}
    </div>
  );
}
