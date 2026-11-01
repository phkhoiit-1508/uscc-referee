"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  createInitialSyncState,
  handleRoundChange,
  handleSyncFailure,
  handleSyncSuccess,
  type OfficialMatch,
} from "@/lib/projection-sync";
import { RESULT_KIND_LABELS } from "@/lib/result-rules";
import { Button } from "@/components/ui/button";

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

type LayoutMode = "two-column" | "single-column" | "paginated";
type TextDensity = "compact" | "normal";

const POLL_INTERVAL_MS = 2500;
const BOARDS_PER_PAGE = 20;
const AUTO_ROTATE_INTERVAL_MS = 12000;

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

function MatchSubTable({
  matches,
  density = "compact",
}: {
  matches: OfficialMatch[];
  density?: TextDensity;
}) {
  if (matches.length === 0) return null;

  const isCompact = density === "compact";

  return (
    <div className="overflow-hidden rounded-md border border-slate-800 bg-slate-900/80 shadow-sm">
      <table className="w-full text-left">
        <thead className="border-b border-slate-800 bg-slate-900 text-[10px] font-semibold uppercase tracking-wider text-slate-400 sm:text-[11px]">
          <tr>
            <th scope="col" className="w-10 py-1.5 pl-2 pr-1 text-center sm:w-12">
              Bàn
            </th>
            <th scope="col" className="py-1.5 px-2">
              Trắng
            </th>
            <th scope="col" className="w-20 py-1.5 px-1.5 text-center sm:w-24">
              Kết quả
            </th>
            <th scope="col" className="py-1.5 px-2">
              Đen
            </th>
            <th scope="col" className="w-20 py-1.5 pr-2 pl-1 text-center sm:w-24">
              Trạng thái
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/60">
          {matches.map((match) => {
            const isOfficial = match.status === "official";
            return (
              <tr
                key={match.id}
                className="transition-colors hover:bg-slate-800/50"
              >
                <td
                  className={`pl-2 pr-1 text-center font-bold text-slate-300 ${
                    isCompact
                      ? "py-[2px] text-[11px] sm:py-1 sm:text-xs"
                      : "py-1.5 text-xs sm:py-2 sm:text-sm"
                  }`}
                >
                  {match.board_number}
                </td>
                <td
                  className={`px-2 font-semibold text-slate-100 ${
                    isCompact
                      ? "py-[2px] text-[11px] sm:py-1 sm:text-xs"
                      : "py-1.5 text-xs sm:py-2 sm:text-sm"
                  }`}
                >
                  <span
                    className="line-clamp-1"
                    title={match.white_player?.full_name ?? "—"}
                  >
                    {match.white_player?.full_name ?? "—"}
                  </span>
                </td>
                <td
                  className={`px-1.5 text-center font-bold text-teal-300 whitespace-nowrap ${
                    isCompact
                      ? "py-[2px] text-[11px] sm:py-1 sm:text-xs"
                      : "py-1.5 text-xs sm:py-2 sm:text-sm"
                  }`}
                >
                  {isOfficial && match.result_code ? (
                    <span className="inline-block leading-tight">
                      {match.result_code}
                      {match.result_kind &&
                        match.result_kind !== "normal" &&
                        match.result_kind !== "resignation" && (
                          <span className="block text-[9px] font-normal text-slate-300">
                            {RESULT_KIND_LABELS[match.result_kind] ?? match.result_kind}
                          </span>
                        )}
                    </span>
                  ) : (
                    <span className="font-normal text-slate-500">—</span>
                  )}
                </td>
                <td
                  className={`px-2 font-semibold text-slate-100 ${
                    isCompact
                      ? "py-[2px] text-[11px] sm:py-1 sm:text-xs"
                      : "py-1.5 text-xs sm:py-2 sm:text-sm"
                  }`}
                >
                  <span
                    className="line-clamp-1"
                    title={
                      match.black_player?.full_name ??
                      (match.result_kind === "bye" ? "Miễn đấu (Bye)" : "—")
                    }
                  >
                    {match.black_player?.full_name ??
                      (match.result_kind === "bye" ? "Miễn đấu (Bye)" : "—")}
                  </span>
                </td>
                <td
                  className={`pr-2 pl-1 text-center whitespace-nowrap ${
                    isCompact
                      ? "py-[2px] text-[9px] sm:py-1 sm:text-[10px]"
                      : "py-1.5 text-[10px] sm:py-2 sm:text-[11px]"
                  }`}
                >
                  {isOfficial ? (
                    <span className="inline-flex items-center rounded-full bg-teal-950/90 px-1.5 py-0.5 font-semibold text-teal-300 ring-1 ring-teal-700/60 leading-none">
                      {match.result_kind === "bye" ? "Chính thức · Bye" : "Chính thức"}
                    </span>
                  ) : match.status === "pending_white" || match.status === "pending_black" ? (
                    <span className="inline-flex items-center rounded-full bg-amber-950/90 px-1.5 py-0.5 font-semibold text-amber-300 ring-1 ring-amber-700/60 leading-none">
                      Chờ xác nhận
                    </span>
                  ) : match.status === "disputed" || match.status === "special_review" ? (
                    <span className="inline-flex items-center rounded-full bg-orange-950/90 px-1.5 py-0.5 font-semibold text-orange-300 ring-1 ring-orange-700/60 leading-none">
                      Đang xử lý
                    </span>
                  ) : match.status === "reopened" ? (
                    <span className="inline-flex items-center rounded-full bg-blue-950/90 px-1.5 py-0.5 font-semibold text-blue-300 ring-1 ring-blue-700/60 leading-none">
                      Đấu lại
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full bg-slate-800/90 px-1.5 py-0.5 font-medium text-slate-400 ring-1 ring-slate-700/60 leading-none">
                      Đang đấu
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
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

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("two-column");
  const [density, setDensity] = useState<TextDensity>("compact");
  const [currentPage, setCurrentPage] = useState(1);
  const [autoRotate, setAutoRotate] = useState(false);

  const abortControllerRef = useRef<AbortController | null>(null);
  const inFlightRef = useRef(false);
  const stateRef = useRef(state);
  stateRef.current = state;

  // Listen to browser fullscreen change
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else if (document.exitFullscreen) {
        await document.exitFullscreen();
      }
    } catch {
      // User gesture or permissions prevented fullscreen
    }
  };

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
    setCurrentPage(1);

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
  const officialCount = matches.filter((m) => m.status === "official").length;

  const totalPages = Math.max(1, Math.ceil(matches.length / BOARDS_PER_PAGE));

  // Auto-rotate effect for paginated mode
  useEffect(() => {
    if (!autoRotate || layoutMode !== "paginated" || totalPages <= 1) return;

    const timer = window.setInterval(() => {
      setCurrentPage((prev) => (prev >= totalPages ? 1 : prev + 1));
    }, AUTO_ROTATE_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [autoRotate, layoutMode, totalPages]);

  // Two-column split
  const { leftColumn, rightColumn } = useMemo(() => {
    if (matches.length <= 1) {
      return { leftColumn: matches, rightColumn: [] };
    }
    const mid = Math.ceil(matches.length / 2);
    return {
      leftColumn: matches.slice(0, mid),
      rightColumn: matches.slice(mid),
    };
  }, [matches]);

  // Paginated matches
  const paginatedMatches = useMemo(() => {
    const start = (currentPage - 1) * BOARDS_PER_PAGE;
    return matches.slice(start, start + BOARDS_PER_PAGE);
  }, [matches, currentPage]);

  return (
    <main className="min-h-screen bg-slate-950 px-2 py-2 sm:px-4 sm:py-3 text-white transition-all">
      <div className="mx-auto w-full max-w-[1920px]">
        {/* Streamlined Compact Top Bar */}
        <header
          className="flex flex-wrap items-center justify-between gap-2.5 border-b-2 border-slate-700 pb-2.5"
          style={{ borderBottomColor: primaryColor ?? "#14B8A6" }}
        >
          {/* Left Title & Status Badges */}
          <div className="flex items-center gap-3">
            {!isFullscreen && (
              <Link
                href={`/tournaments/${tournamentId}`}
                className="text-xs text-slate-400 hover:text-white"
                title="Quay lại giải đấu"
              >
                ← Thoát
              </Link>
            )}

            {logoUrl && (
              <div
                role="img"
                aria-label={`Logo ${tournamentName}`}
                className="h-7 w-7 shrink-0 bg-contain bg-center bg-no-repeat sm:h-8 sm:w-8"
                style={{ backgroundImage: `url(${JSON.stringify(logoUrl)})` }}
              />
            )}

            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold tracking-tight text-white sm:text-xl">
                {tournamentName}
              </h1>
              <span className="rounded bg-teal-950/90 px-2 py-0.5 text-xs font-semibold text-teal-300 ring-1 ring-teal-700/60">
                Vòng {selectedRound}
              </span>
              <span className="hidden rounded bg-slate-900 px-2 py-0.5 text-xs font-medium text-slate-300 ring-1 ring-slate-800 sm:inline-block">
                {officialCount}/{matches.length} bàn đã chốt
              </span>
            </div>
          </div>

          {/* Right Controls */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Round Dropdown */}
            <select
              aria-label="Chọn vòng"
              value={selectedRound}
              onChange={(e) => onSelectRound(Number(e.target.value))}
              className="h-7 rounded border border-slate-700 bg-slate-900 px-2 text-xs font-semibold text-white focus:outline-none focus:ring-1 focus:ring-teal-400"
            >
              {Array.from({ length: totalRounds }, (_, i) => i + 1).map((r) => (
                <option key={r} value={r}>
                  Vòng {r}
                </option>
              ))}
            </select>

            {/* Density Toggle (Chữ nhỏ / Vừa) */}
            <div className="flex items-center rounded border border-slate-800 bg-slate-900 p-0.5 text-[11px]">
              <button
                type="button"
                onClick={() => setDensity("compact")}
                className={`rounded px-2 py-0.5 font-medium transition-colors ${
                  density === "compact"
                    ? "bg-teal-600 text-white"
                    : "text-slate-400 hover:text-white"
                }`}
                title="Cỡ chữ nhỏ gọn — vừa trọn vẹn 1 trang không cần cuộn"
              >
                Gọn
              </button>
              <button
                type="button"
                onClick={() => setDensity("normal")}
                className={`rounded px-2 py-0.5 font-medium transition-colors ${
                  density === "normal"
                    ? "bg-teal-600 text-white"
                    : "text-slate-400 hover:text-white"
                }`}
                title="Cỡ chữ vừa"
              >
                Vừa
              </button>
            </div>

            {/* Layout Mode Switcher */}
            <div className="flex items-center rounded border border-slate-800 bg-slate-900 p-0.5 text-[11px]">
              <button
                type="button"
                onClick={() => setLayoutMode("two-column")}
                className={`rounded px-2 py-0.5 font-medium transition-colors ${
                  layoutMode === "two-column"
                    ? "bg-teal-600 text-white"
                    : "text-slate-400 hover:text-white"
                }`}
                title="Chia 2 cột song song (tối ưu máy chiếu 16:9)"
              >
                2 Cột
              </button>
              <button
                type="button"
                onClick={() => setLayoutMode("single-column")}
                className={`rounded px-2 py-0.5 font-medium transition-colors ${
                  layoutMode === "single-column"
                    ? "bg-teal-600 text-white"
                    : "text-slate-400 hover:text-white"
                }`}
                title="1 Cột"
              >
                1 Cột
              </button>
              <button
                type="button"
                onClick={() => setLayoutMode("paginated")}
                className={`rounded px-2 py-0.5 font-medium transition-colors ${
                  layoutMode === "paginated"
                    ? "bg-teal-600 text-white"
                    : "text-slate-400 hover:text-white"
                }`}
                title="Phân trang"
              >
                Trang
              </button>
            </div>

            {/* Fullscreen Button */}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={toggleFullscreen}
              className="h-7 border-slate-700 bg-slate-900 px-2.5 text-xs font-semibold text-slate-200 hover:bg-slate-800 hover:text-white"
              title={isFullscreen ? "Thoát toàn màn hình (Esc)" : "Toàn màn hình"}
            >
              {isFullscreen ? (
                <>
                  <svg className="mr-1 h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  <span>Thoát</span>
                </>
              ) : (
                <>
                  <svg className="mr-1 h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                  </svg>
                  <span>Full Screen</span>
                </>
              )}
            </Button>

            {/* Live Indicator */}
            <div className="flex items-center gap-1.5 text-[11px]" role="status">
              <span
                className={`h-2 w-2 rounded-full ${
                  connectionStatus === "connected"
                    ? "bg-teal-400"
                    : connectionStatus === "disconnected"
                      ? "bg-amber-400 animate-pulse"
                      : "bg-slate-500"
                }`}
              />
              {connectionStatus === "connected" && lastSuccessfulSync && (
                <span className="hidden text-slate-400 xl:inline">
                  {formatSyncTime(lastSuccessfulSync)}
                </span>
              )}
              {connectionStatus === "disconnected" && (
                <span className="font-medium text-amber-300">Mất kết nối</span>
              )}
            </div>
          </div>
        </header>

        {/* Network alert banner */}
        {isDisconnected && (
          <aside
            role="alert"
            className="mt-2 rounded border border-amber-600 bg-amber-950/80 p-2 text-xs text-amber-200"
          >
            ⚠️ Mất kết nối — dữ liệu hiển thị lúc{" "}
            {lastSuccessfulSync ? formatSyncTime(lastSuccessfulSync) : "chưa rõ"}.
          </aside>
        )}

        {/* Paginated mode sub-controls if active */}
        {layoutMode === "paginated" && totalPages > 1 && (
          <div className="mt-2 flex items-center justify-between gap-2 text-xs">
            <span className="text-slate-300">
              Trang {currentPage}/{totalPages} (Bàn {(currentPage - 1) * BOARDS_PER_PAGE + 1}–
              {Math.min(currentPage * BOARDS_PER_PAGE, matches.length)})
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="h-6 rounded border border-slate-700 bg-slate-900 px-2 font-medium disabled:opacity-40"
              >
                ← Trước
              </button>
              <button
                type="button"
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="h-6 rounded border border-slate-700 bg-slate-900 px-2 font-medium disabled:opacity-40"
              >
                Sau →
              </button>
              <label className="ml-2 flex cursor-pointer items-center gap-1 text-slate-400 hover:text-white">
                <input
                  type="checkbox"
                  checked={autoRotate}
                  onChange={(e) => setAutoRotate(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-900 text-teal-600 focus:ring-0"
                />
                <span>Tự lật trang (12s)</span>
              </label>
            </div>
          </div>
        )}

        {/* Main Matches Display */}
        {matches.length === 0 ? (
          <p className="mt-8 text-center text-sm text-slate-400">
            Chưa có cặp đấu nào cho Vòng {selectedRound}.
          </p>
        ) : layoutMode === "two-column" && matches.length > 1 ? (
          <div className="mt-2 grid grid-cols-1 items-start gap-2 lg:grid-cols-2 lg:gap-3">
            <MatchSubTable matches={leftColumn} density={density} />
            <MatchSubTable matches={rightColumn} density={density} />
          </div>
        ) : layoutMode === "paginated" ? (
          <div className="mt-2">
            <MatchSubTable matches={paginatedMatches} density={density} />
          </div>
        ) : (
          <div className="mt-2">
            <MatchSubTable matches={matches} density={density} />
          </div>
        )}
      </div>
    </main>
  );
}
