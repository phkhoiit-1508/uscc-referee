"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  createInitialSyncState,
  handleRoundChange,
  handleSyncFailure,
  handleSyncSuccess,
  type OfficialMatch,
} from "@/lib/projection-sync";
import { RESULT_KIND_LABELS } from "@/lib/result-rules";

type ProjectionBoardProps = {
  tournamentId: string;
  tournamentName: string;
  totalRounds: number;
  logoUrl: string | null;
  primaryColor: string | null;
  initialMatches: OfficialMatch[];
  initialSyncedAt: string | null;
  initialRound?: number;
};

const POLL_INTERVAL_MS = 2500;

function formatSyncTime(isoString: string): string {
  try {
    return new Intl.DateTimeFormat("vi-VN", {
      timeZone: "Asia/Ho_Chi_Minh",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(new Date(isoString));
  } catch {
    return isoString;
  }
}

export function ProjectionBoard({
  tournamentId,
  tournamentName,
  totalRounds,
  logoUrl,
  primaryColor,
  initialMatches,
  initialSyncedAt,
  initialRound = 1,
}: ProjectionBoardProps) {
  const [state, setState] = useState(() =>
    createInitialSyncState(initialRound, initialMatches, initialSyncedAt),
  );

  const abortControllerRef = useRef<AbortController | null>(null);
  const inFlightRef = useRef(false);
  const stateRef = useRef(state);
  stateRef.current = state;

  const fetchRoundMatches = useCallback(
    async (round: number, reqId: number) => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;

      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const response = await fetch(
          `/api/tournaments/${tournamentId}/projection?round=${round}`,
          {
            signal: controller.signal,
            cache: "no-store",
            headers: {
              Accept: "application/json",
            },
          },
        );

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        setState((prev) =>
          handleSyncSuccess(prev, {
            matches: data.matches ?? [],
            round,
            syncedAt: data.syncedAt || new Date().toISOString(),
            requestId: reqId,
          }),
        );
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }
        setState((prev) =>
          handleSyncFailure(prev, {
            message: "Mất kết nối — dữ liệu có thể chưa cập nhật",
            requestId: reqId,
          }),
        );
      } finally {
        inFlightRef.current = false;
      }
    },
    [tournamentId],
  );

  // Switch round handler
  const onSelectRound = (newRoundNumber: number) => {
    // Abort ongoing in-flight request if any
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      inFlightRef.current = false;
    }

    const { state: nextState, newRequestId } = handleRoundChange(
      stateRef.current,
      newRoundNumber,
      totalRounds,
    );
    setState(nextState);

    // Immediately fetch for the newly selected round
    void fetchRoundMatches(nextState.selectedRound, newRequestId);
  };

  // Regular polling interval
  useEffect(() => {
    let isMounted = true;

    const timer = window.setInterval(() => {
      if (!isMounted) return;
      const current = stateRef.current;
      void fetchRoundMatches(current.selectedRound, current.lastRequestId);
    }, POLL_INTERVAL_MS);

    return () => {
      isMounted = false;
      window.clearInterval(timer);
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchRoundMatches]);

  const { selectedRound, matches, connectionStatus, lastSuccessfulSync } = state;
  const isDisconnected = connectionStatus === "disconnected";

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-white sm:px-10">
      <div className="mx-auto max-w-6xl">
        <Link
          href={`/tournaments/${tournamentId}`}
          className="text-sm text-slate-300 hover:text-white"
        >
          ← Quay lại giải đấu
        </Link>

        <header
          className="mt-6 flex flex-wrap items-end justify-between gap-6 border-b-4 border-slate-700 pb-6"
          style={{ borderBottomColor: primaryColor ?? "#14B8A6" }}
        >
          <div className="flex items-center gap-5">
            {logoUrl && (
              <div
                role="img"
                aria-label={`Logo ${tournamentName}`}
                className="h-20 w-20 shrink-0 bg-contain bg-center bg-no-repeat sm:h-24 sm:w-24"
                style={{ backgroundImage: `url(${JSON.stringify(logoUrl)})` }}
              />
            )}
            <div>
              <p className="text-sm uppercase tracking-widest text-teal-300">
                Màn hình trình chiếu kết quả chính thức
              </p>
              <h1 className="mt-1 text-2xl font-bold sm:text-4xl">{tournamentName}</h1>
            </div>
          </div>

          <div className="flex flex-col items-start gap-2 sm:items-end">
            <div className="flex items-center gap-2">
              <label htmlFor="round-select" className="text-sm font-medium text-slate-300">
                Chọn vòng:
              </label>
              <select
                id="round-select"
                aria-label="Chọn vòng trình chiếu"
                value={selectedRound}
                onChange={(e) => onSelectRound(Number(e.target.value))}
                className="min-h-10 rounded border border-slate-700 bg-slate-900 px-3 py-1.5 text-base font-semibold text-white focus:outline-none focus:ring-2 focus:ring-teal-400"
              >
                {Array.from({ length: totalRounds }, (_, i) => i + 1).map((r) => (
                  <option key={r} value={r}>
                    Vòng {r}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2 text-xs sm:text-sm" role="status">
              <span
                className={`h-2.5 w-2.5 rounded-full ${
                  connectionStatus === "connected"
                    ? "bg-teal-400"
                    : connectionStatus === "disconnected"
                      ? "bg-amber-400 animate-pulse"
                      : "bg-slate-500"
                }`}
              />
              {connectionStatus === "connected" && lastSuccessfulSync && (
                <span className="text-slate-300">
                  Đã kết nối · Đồng bộ lúc {formatSyncTime(lastSuccessfulSync)}
                </span>
              )}
              {connectionStatus === "disconnected" && (
                <span className="font-medium text-amber-300">
                  Mất kết nối
                  {lastSuccessfulSync &&
                    ` (Đồng bộ lần cuối lúc ${formatSyncTime(lastSuccessfulSync)})`}
                </span>
              )}
              {connectionStatus === "loading" && (
                <span className="text-slate-400">Đang tải dữ liệu...</span>
              )}
            </div>
          </div>
        </header>

        {isDisconnected && (
          <aside
            role="alert"
            className="mt-6 rounded border border-amber-600 bg-amber-950/80 p-4 text-amber-200"
          >
            <p className="font-semibold">⚠️ Mất kết nối — dữ liệu có thể chưa cập nhật.</p>
            <p className="mt-1 text-sm text-amber-300">
              Hệ thống đang tự động thử lại. Dữ liệu trên màn hình hiện là trạng thái lúc{" "}
              {lastSuccessfulSync ? formatSyncTime(lastSuccessfulSync) : "chưa rõ"}.
            </p>
          </aside>
        )}

        <div className="mt-8 flex items-center justify-between">
          <h2 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
            Kết quả Vòng {selectedRound}
          </h2>
          <span className="text-sm text-slate-400">
            {matches.length} bàn đã có kết quả chính thức
          </span>
        </div>

        {matches.length === 0 ? (
          <p className="mt-8 text-lg text-slate-400">
            Chưa có kết quả chính thức cho Vòng {selectedRound}.
          </p>
        ) : (
          <div className="mt-6 overflow-x-auto rounded border border-slate-800 bg-slate-900/60 p-2">
            <table className="w-full min-w-[540px] text-left text-lg">
              <thead className="border-b border-slate-700 text-sm uppercase tracking-wide text-slate-400">
                <tr>
                  <th scope="col" className="py-3.5 pr-4 pl-3">
                    Bàn
                  </th>
                  <th scope="col" className="py-3.5 pr-4">
                    Trắng
                  </th>
                  <th scope="col" className="py-3.5 pr-4">
                    Kết quả
                  </th>
                  <th scope="col" className="py-3.5 pr-4">
                    Đen
                  </th>
                  <th scope="col" className="py-3.5 pr-3">
                    Trạng thái
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {matches.map((match) => (
                  <tr key={match.id} className="hover:bg-slate-800/40">
                    <td className="py-4 pr-4 pl-3 font-medium text-slate-300">
                      {match.board_number}
                    </td>
                    <td className="py-4 pr-4 font-semibold text-slate-100">
                      {match.white_player?.full_name ?? "—"}
                    </td>
                    <td className="py-4 pr-4 font-bold text-teal-300">
                      {match.result_code}
                      {match.result_kind && (
                        <span className="ml-2 text-sm font-normal text-slate-300">
                          · {RESULT_KIND_LABELS[match.result_kind] ?? match.result_kind}
                        </span>
                      )}
                    </td>
                    <td className="py-4 pr-4 font-semibold text-slate-100">
                      {match.black_player?.full_name ??
                        (match.result_kind === "bye" ? "Miễn đấu (Bye)" : "—")}
                    </td>
                    <td className="py-4 pr-3 text-sm font-medium text-teal-300">
                      <span className="inline-flex items-center rounded-full bg-teal-950/80 px-2.5 py-0.5 text-xs font-semibold text-teal-300 ring-1 ring-teal-700/60">
                        {match.result_kind === "bye"
                          ? "Chính thức · Bye"
                          : match.result_kind && match.result_kind !== "normal" && match.result_kind !== "resignation"
                            ? `Chính thức · ${RESULT_KIND_LABELS[match.result_kind] ?? match.result_kind}`
                            : "Chính thức"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
