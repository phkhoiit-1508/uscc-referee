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
import { matchMatchesSearch } from "@/lib/match-search";
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
  white_player: { full_name: string; club: string | null; external_id: string | null } | null;
  black_player: { full_name: string; club: string | null; external_id: string | null } | null;
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

const RESULT_KIND_LABELS: Record<string, string> = {
  normal: "Bình thường",
  forfeit: "Xử thua",
  absence: "Vắng mặt",
  bye: "Bye",
  adjudicated: "Trọng tài quyết định",
  other: "Khác",
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
  const [resultCode, setResultCode] = useState("");
  const [resultKind, setResultKind] = useState("normal");
  const [reviewing, setReviewing] = useState(false);

  useEffect(() => {
    if (submitState.success || confirmState.success || confirmState.disputed || resolveState.success || reopenState.success) {
      router.refresh();
    }
  }, [submitState, confirmState, resolveState, reopenState, router]);

  const status = match.status;
  const isDone = status === "official";
  const isDisputed = status === "disputed" || status === "special_review";
  const confirmationSide = status === "pending_white" ? "white" : status === "pending_black" ? "black" : null;
  const confirmationPlayer = confirmationSide === "white" ? match.white_player : confirmationSide === "black" ? match.black_player : null;
  const confirmationSideLabel = confirmationSide === "white" ? "Trắng" : "Đen";

  return (
    <div className="rounded border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Bàn {match.board_number} · Vòng {match.round_number}
          </span>
          {!confirmationSide && (
            <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-start gap-3 text-sm">
              <div>
                <p className="text-xs font-semibold uppercase text-slate-500">Trắng</p>
                <p className="font-medium">{match.white_player?.full_name ?? "—"}</p>
                <p className="text-xs text-slate-500">
                  {[match.white_player?.external_id, match.white_player?.club].filter(Boolean).join(" · ") || "Chưa có mã/đơn vị"}
                </p>
              </div>
              <span className="pt-5 text-slate-400">vs</span>
              <div className="text-right">
                <p className="text-xs font-semibold uppercase text-slate-500">Đen</p>
                <p className="font-medium">{match.black_player?.full_name ?? "—"}</p>
                <p className="text-xs text-slate-500">
                  {[match.black_player?.external_id, match.black_player?.club].filter(Boolean).join(" · ") || "Chưa có mã/đơn vị"}
                </p>
              </div>
            </div>
          )}
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

      {(status === "unreported" || status === "reopened") && !submitState.success && !reviewing && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setReviewing(true);
          }}
          className="mt-3 grid gap-3 border-t border-slate-100 pt-3"
        >
          <fieldset className="grid gap-2">
            <legend className="text-sm font-medium">Chọn kết quả</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {RESULT_CODES.map((code) => (
                <label key={code} className="flex min-h-12 cursor-pointer items-center gap-2 rounded border border-slate-200 px-3 text-sm hover:bg-slate-50 has-[:checked]:border-teal-600 has-[:checked]:bg-teal-50">
                  <input
                    type="radio"
                    name="resultCode"
                    value={code}
                    checked={resultCode === code}
                    onChange={() => setResultCode(code)}
                    required
                    className="accent-teal-600"
                  />
                  {RESULT_LABELS[code]}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="grid gap-1 text-sm font-medium">
            Loại kết quả
            <select
              value={resultKind}
              onChange={(event) => setResultKind(event.target.value)}
              className="min-h-12 rounded border border-slate-300 bg-white px-3 text-base text-slate-900"
            >
              {Object.entries(RESULT_KIND_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <Button type="submit" disabled={!resultCode} className="min-h-12 w-full bg-slate-900 text-base text-white hover:bg-slate-800 sm:w-fit">
            Kiểm tra kết quả
          </Button>
        </form>
      )}

      {(status === "unreported" || status === "reopened") && !submitState.success && reviewing && (
        <form action={submitAction} className="mt-3 grid gap-4 border-t border-slate-100 pt-3">
          <input type="hidden" name="matchId" value={match.id} />
          <input type="hidden" name="resultCode" value={resultCode} />
          <input type="hidden" name="resultKind" value={resultKind} />
          <div className="rounded border-2 border-teal-600 bg-teal-50 p-4 text-center">
            <p className="text-sm font-semibold uppercase text-teal-800">Kiểm tra trước khi đưa điện thoại</p>
            <p className="mt-3 text-lg font-semibold">{match.white_player?.full_name} — {match.black_player?.full_name}</p>
            <p className="mt-2 text-2xl font-bold text-teal-900">{RESULT_LABELS[resultCode]}</p>
            <p className="mt-1 text-sm text-teal-800">{RESULT_KIND_LABELS[resultKind]}</p>
          </div>
          {submitState.error && <p role="alert" className="text-sm text-red-700">{submitState.error}</p>}
          <div className="grid gap-2 sm:grid-cols-2">
            <Button type="button" variant="outline" disabled={submitPending} onClick={() => setReviewing(false)} className="min-h-12 bg-white text-base text-slate-900 hover:bg-slate-100">
              Quay lại sửa
            </Button>
            <Button type="submit" disabled={submitPending} className="min-h-12 bg-teal-700 text-base text-white hover:bg-teal-800">
              {submitPending ? "Đang lưu..." : "Đúng, gửi Trắng xác nhận"}
            </Button>
          </div>
        </form>
      )}

      {submitState.success && (
        <p className="mt-2 text-sm text-teal-700">Đã nhập — chờ Trắng xác nhận.</p>
      )}

      {confirmationSide && !confirmState.success && !confirmState.disputed && (
        <form action={confirmAction} className="mt-3 grid gap-4 rounded border-2 border-slate-900 bg-slate-50 p-4 text-center">
          <input type="hidden" name="matchId" value={match.id} />
          <input type="hidden" name="side" value={confirmationSide} />
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-slate-600">Lượt xác nhận của bên {confirmationSideLabel}</p>
            <p className="mt-2 text-2xl font-bold text-slate-950">{confirmationPlayer?.full_name ?? "—"}</p>
            <p className="mt-1 text-sm text-slate-600">
              {[confirmationPlayer?.external_id, confirmationPlayer?.club].filter(Boolean).join(" · ") || "Chưa có mã/đơn vị"}
            </p>
            <p className="mt-4 text-3xl font-bold text-teal-800">{match.result_code ? RESULT_LABELS[match.result_code] : "—"}</p>
          </div>
          <p className="text-sm text-slate-600">Trọng tài kiểm tra đúng kỳ thủ trước khi đưa điện thoại.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="submit"
              name="agreed"
              value="true"
              disabled={confirmPending}
              className="min-h-14 rounded bg-teal-700 px-5 text-base font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
            >
              {confirmPending ? "Đang lưu..." : "Xác nhận"}
            </button>
            <button
              type="submit"
              name="agreed"
              value="false"
              disabled={confirmPending}
              className="min-h-14 rounded border-2 border-red-600 bg-white px-5 text-base font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              Không đồng ý
            </button>
          </div>
          {confirmState.error && <p role="alert" className="text-sm text-red-700">{confirmState.error}</p>}
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
    (match) => match.round_number === round && matchMatchesSearch(match, search),
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
          <label className="text-sm font-medium">Tìm bàn / tên / mã / đơn vị</label>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Bàn, tên, mã hoặc đơn vị"
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
