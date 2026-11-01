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

function MatchSubTable({
  matches,
  isCompact = true,
}: {
  matches: OfficialMatch[];
  isCompact?: boolean;
}) {
  if (matches.length === 0) return null;

  return (
    <div className="overflow-hidden rounded-md border border-slate-800 bg-slate-900/90 shadow-sm">
      <table className="w-full text-left">
        <thead className="border-b border-slate-800 bg-slate-900 text-[10px] font-semibold uppercase tracking-wider text-slate-400 sm:text-[11px]">
          <tr>
            <th scope="col" className="w-10 py-1 pl-2 pr-1 text-center sm:w-12">
              Bàn
            </th>
            <th scope="col" className="py-1 px-2">
              Trắng
            </th>
            <th scope="col" className="w-20 py-1 px-1.5 text-center sm:w-24">
              Kết quả
            </th>
            <th scope="col" className="py-1 px-2">
              Đen
            </th>
            <th scope="col" className="w-20 py-1 pr-2 pl-1 text-center sm:w-24">
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
                className="transition-colors hover:bg-slate-800/60"
              >
                <td
                  className={`pl-2 pr-1 text-center font-bold text-slate-300 ${
                    isCompact
                      ? "py-[2px] text-[11px] sm:py-[3px] sm:text-xs"
                      : "py-1.5 text-xs sm:py-2 sm:text-sm"
                  }`}
                >
                  {match.board_number}
                </td>
                <td
                  className={`px-2 font-semibold text-slate-100 ${
                    isCompact
                      ? "py-[2px] text-[11px] sm:py-[3px] sm:text-xs"
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
                      ? "py-[2px] text-[11px] sm:py-[3px] sm:text-xs"
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
                      ? "py-[2px] text-[11px] sm:py-[3px] sm:text-xs"
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
                      ? "py-[2px] text-[9px] sm:py-[3px] sm:text-[10px]"
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

  // Control panel configuration states
  const [isControlVisible, setIsControlVisible] = useState(true);
  const [aspectRatio, setAspectRatio] = useState<string>("auto");
  const [displayScale, setDisplayScale] = useState<number>(100);
  const [paginationMode, setPaginationMode] = useState<string>("players_per_page");
  const [playersPerPage, setPlayersPerPage] = useState<number>(80); // 80 players = 40 boards
  const [columnsCount, setColumnsCount] = useState<number>(2);
  const [allowVerticalScroll, setAllowVerticalScroll] = useState<boolean>(false);

  // Pagination & Auto-rotate states
  const [autoPageFlip, setAutoPageFlip] = useState<boolean>(false);
  const [pageFlipSeconds, setPageFlipSeconds] = useState<number>(10);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

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
      // User gesture prevented
    }
  };

  // Keyboard shortcut F11 & arrow keys for page flip
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "F11") {
        e.preventDefault();
        void toggleFullscreen();
      } else if (e.key === "ArrowLeft") {
        setCurrentPage((p) => Math.max(1, p - 1));
      } else if (e.key === "ArrowRight") {
        setCurrentPage((p) => p + 1);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

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

  // Compute pagination
  const boardsPerPage = useMemo(() => {
    if (paginationMode === "all") return Math.max(1, matches.length);
    // 2 players per board
    return Math.max(1, Math.round(playersPerPage / 2));
  }, [paginationMode, playersPerPage, matches.length]);

  const totalPages = Math.max(1, Math.ceil(matches.length / boardsPerPage));

  // Auto-rotate effect
  useEffect(() => {
    if (!autoPageFlip || totalPages <= 1) return;

    const timer = window.setInterval(() => {
      setCurrentPage((prev) => (prev >= totalPages ? 1 : prev + 1));
    }, pageFlipSeconds * 1000);

    return () => window.clearInterval(timer);
  }, [autoPageFlip, totalPages, pageFlipSeconds]);

  // Sliced matches for current page
  const pageMatches = useMemo(() => {
    if (paginationMode === "all") return matches;
    const effectivePage = Math.min(currentPage, totalPages);
    const start = (effectivePage - 1) * boardsPerPage;
    return matches.slice(start, start + boardsPerPage);
  }, [matches, currentPage, totalPages, boardsPerPage, paginationMode]);

  // Divide into N columns based on columnsCount
  const columnSlices = useMemo(() => {
    if (pageMatches.length === 0) return [];
    if (columnsCount <= 1) return [pageMatches];

    const count = Math.min(columnsCount, pageMatches.length);
    const result: OfficialMatch[][] = [];
    const chunkSize = Math.ceil(pageMatches.length / count);

    for (let i = 0; i < count; i++) {
      const slice = pageMatches.slice(i * chunkSize, (i + 1) * chunkSize);
      if (slice.length > 0) result.push(slice);
    }
    return result;
  }, [pageMatches, columnsCount]);

  // Aspect ratio wrapper styles
  const getAspectRatioClasses = () => {
    switch (aspectRatio) {
      case "16:9":
        return "aspect-[16/9] w-full max-w-[1920px]";
      case "4:3":
        return "aspect-[4/3] w-full max-w-[1400px]";
      case "16:10":
        return "aspect-[16/10] w-full max-w-[1920px]";
      default:
        return "w-full max-w-[1920px]";
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Top Controller Bar - Matches Requested UI Mockup */}
      <div
        className="sticky top-0 z-50 border-t-[3px] border-b border-slate-300 bg-slate-100 px-3 py-1.5 text-slate-800 shadow-sm transition-all sm:px-5"
        style={{ borderTopColor: primaryColor ?? "#0284c7" }}
      >
        {/* Row 1: Back Link & Actions */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <Link
              href={`/tournaments/${tournamentId}`}
              className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 hover:text-slate-950"
            >
              <span className="text-sm">←</span>
              <span>Điều hành giải đấu</span>
            </Link>

            <span className="text-slate-300">|</span>

            {/* Tournament title */}
            <span className="hidden text-xs font-bold text-slate-900 md:inline-block">
              {tournamentName}
            </span>

            {/* Live Indicator */}
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                connectionStatus === "connected"
                  ? "bg-teal-100 text-teal-800"
                  : "bg-amber-100 text-amber-800 animate-pulse"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  connectionStatus === "connected" ? "bg-teal-600" : "bg-amber-600"
                }`}
              />
              {connectionStatus === "connected" ? "Realtime" : "Mất kết nối"}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* View Boards Dropdown (Chọn Vòng) */}
            <div className="flex items-center rounded border border-slate-300 bg-white px-2 py-1 text-xs shadow-sm hover:bg-slate-50">
              <svg
                className="mr-1.5 h-3.5 w-3.5 text-slate-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
                />
              </svg>
              <span className="mr-1 font-medium text-slate-700">Xem bàn đấu:</span>
              <select
                value={selectedRound}
                onChange={(e) => onSelectRound(Number(e.target.value))}
                className="bg-transparent font-bold text-slate-900 outline-none cursor-pointer"
              >
                {Array.from({ length: totalRounds }, (_, i) => i + 1).map((r) => (
                  <option key={r} value={r}>
                    Vòng {r}
                  </option>
                ))}
              </select>
            </div>

            {/* Toggle Control Bar Button */}
            <button
              type="button"
              onClick={() => setIsControlVisible((prev) => !prev)}
              className="flex items-center gap-1.5 rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <svg
                className="h-3.5 w-3.5 text-slate-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"
                />
              </svg>
              <span>{isControlVisible ? "Ẩn thanh điều khiển ⌵" : "Hiện thanh điều khiển ⌃"}</span>
            </button>
          </div>
        </div>

        {/* Collapsible Control Panels (Row 2 & Row 3) */}
        {isControlVisible && (
          <div className="mt-2.5 pt-2 border-t border-slate-200 text-xs text-slate-700 space-y-2">
            {/* Control Row 1: Aspect Ratio, Scale, Pagination Type, Items/Page, Columns, Scroll */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              {/* Tỉ lệ khung hình */}
              <div className="flex items-center gap-1.5">
                <span className="font-medium text-slate-600">Tỉ lệ khung hình</span>
                <select
                  value={aspectRatio}
                  onChange={(e) => setAspectRatio(e.target.value)}
                  className="rounded border border-slate-300 bg-white px-2.5 py-1 font-semibold text-slate-900 shadow-sm outline-none focus:border-sky-500"
                >
                  <option value="auto">Vừa khít màn hình (Auto Fullscreen)</option>
                  <option value="16:9">16:9 (Máy chiếu Wide)</option>
                  <option value="4:3">4:3 (Máy chiếu vuông)</option>
                  <option value="16:10">16:10</option>
                  <option value="custom">Tự do</option>
                </select>
              </div>

              {/* Cỡ hiển thị */}
              <div className="flex items-center gap-1.5">
                <span className="font-medium text-slate-600">Cỡ hiển thị</span>
                <select
                  value={displayScale}
                  onChange={(e) => setDisplayScale(Number(e.target.value))}
                  className="rounded border border-slate-300 bg-white px-2.5 py-1 font-semibold text-slate-900 shadow-sm outline-none focus:border-sky-500"
                >
                  <option value={75}>75%</option>
                  <option value={85}>85%</option>
                  <option value={90}>90%</option>
                  <option value={100}>100%</option>
                  <option value={110}>110%</option>
                  <option value={125}>125%</option>
                  <option value={150}>150%</option>
                </select>
              </div>

              {/* Chia trang theo */}
              <div className="flex items-center gap-1.5">
                <span className="font-medium text-slate-600">Chia trang theo</span>
                <select
                  value={paginationMode}
                  onChange={(e) => {
                    setPaginationMode(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="rounded border border-slate-300 bg-white px-2.5 py-1 font-semibold text-slate-900 shadow-sm outline-none focus:border-sky-500"
                >
                  <option value="players_per_page">Số người mỗi trang</option>
                  <option value="all">Tất cả trong 1 trang</option>
                </select>
              </div>

              {/* Người/trang */}
              {paginationMode === "players_per_page" && (
                <div className="flex items-center gap-1.5">
                  <span className="font-medium text-slate-600">Người/trang</span>
                  <select
                    value={playersPerPage}
                    onChange={(e) => {
                      setPlayersPerPage(Number(e.target.value));
                      setCurrentPage(1);
                    }}
                    className="rounded border border-slate-300 bg-white px-2.5 py-1 font-semibold text-slate-900 shadow-sm outline-none focus:border-sky-500"
                  >
                    <option value={20}>20 người/trang (10 bàn)</option>
                    <option value={40}>40 người/trang (20 bàn)</option>
                    <option value={60}>60 người/trang (30 bàn)</option>
                    <option value={80}>80 người/trang (40 bàn)</option>
                    <option value={100}>100 người/trang (50 bàn)</option>
                  </select>
                </div>
              )}

              {/* Số cột */}
              <div className="flex items-center gap-1.5">
                <span className="font-medium text-slate-600">Số cột</span>
                <select
                  value={columnsCount}
                  onChange={(e) => setColumnsCount(Number(e.target.value))}
                  className="rounded border border-slate-300 bg-white px-2.5 py-1 font-semibold text-slate-900 shadow-sm outline-none focus:border-sky-500"
                >
                  <option value={1}>1 cột</option>
                  <option value={2}>2 cột</option>
                  <option value={3}>3 cột</option>
                  <option value={4}>4 cột</option>
                </select>
              </div>

              {/* Cho phép cuộn dọc */}
              <label className="flex cursor-pointer items-center gap-1.5 font-medium text-slate-700 hover:text-slate-950">
                <input
                  type="checkbox"
                  checked={allowVerticalScroll}
                  onChange={(e) => setAllowVerticalScroll(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-0"
                />
                <span>Cho phép cuộn dọc (giữ chữ lớn)</span>
              </label>
            </div>

            {/* Control Row 2: Auto flip, Flip interval, Prev, Next, Current Page Badge, Fullscreen Button, Hint */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 pt-1 border-t border-slate-200/70">
              {/* Tự động chuyển trang */}
              <label className="flex cursor-pointer items-center gap-1.5 font-medium text-slate-800">
                <input
                  type="checkbox"
                  checked={autoPageFlip}
                  onChange={(e) => setAutoPageFlip(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-0"
                />
                <span>Tự động chuyển trang</span>
              </label>

              {/* Chuyển sau */}
              <div className="flex items-center gap-1.5">
                <span className="text-slate-600">Chuyển sau</span>
                <select
                  value={pageFlipSeconds}
                  onChange={(e) => setPageFlipSeconds(Number(e.target.value))}
                  disabled={!autoPageFlip}
                  className="rounded border border-slate-300 bg-white px-2 py-1 font-semibold text-slate-900 shadow-sm outline-none disabled:opacity-50"
                >
                  <option value={5}>5 giây</option>
                  <option value={8}>8 giây</option>
                  <option value={10}>10 giây</option>
                  <option value={12}>12 giây</option>
                  <option value={15}>15 giây</option>
                  <option value={20}>20 giây</option>
                  <option value={30}>30 giây</option>
                </select>
              </div>

              {/* Trang trước */}
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="rounded border border-slate-300 bg-white px-3 py-1 font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-40"
              >
                Trang trước
              </button>

              {/* Trang sau */}
              <button
                type="button"
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="rounded border border-slate-300 bg-white px-3 py-1 font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-40"
              >
                Trang sau
              </button>

              {/* Trang hiện tại badge */}
              <span className="rounded bg-slate-900 px-3 py-1 font-bold text-white shadow-sm">
                Trang {currentPage}/{totalPages}
              </span>

              {/* Toàn màn hình (F11) */}
              <button
                type="button"
                onClick={toggleFullscreen}
                className="flex items-center gap-1 rounded border border-slate-300 bg-white px-3 py-1 font-medium text-slate-700 shadow-sm hover:bg-slate-50"
              >
                <svg
                  className="h-3.5 w-3.5 text-slate-700"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
                  />
                </svg>
                <span>{isFullscreen ? "Thoát toàn màn hình" : "Toàn màn hình (F11)"}</span>
              </button>

              {/* Helper text hint */}
              <span className="text-[11px] text-slate-500 xl:inline-block hidden">
                Vừa khít tự thu chữ theo số dòng; bật cuộn để giữ cỡ lớn.
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Main Projector Screen Container */}
      <main
        className={`flex-1 p-2 sm:p-3 mx-auto ${getAspectRatioClasses()} ${
          allowVerticalScroll ? "overflow-y-auto" : "overflow-hidden"
        }`}
      >
        {/* Network disconnect alert banner */}
        {isDisconnected && (
          <aside
            role="alert"
            className="mb-2 rounded border border-amber-600 bg-amber-950/80 p-2 text-xs text-amber-200"
          >
            ⚠️ Mất kết nối — dữ liệu hiển thị lúc{" "}
            {lastSuccessfulSync ? formatSyncTime(lastSuccessfulSync) : "chưa rõ"}.
          </aside>
        )}

        {/* Tournament Subhead Indicator */}
        <div className="mb-2 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-2">
            {logoUrl && (
              <div
                role="img"
                aria-label={`Logo ${tournamentName}`}
                className="h-5 w-5 shrink-0 bg-contain bg-center bg-no-repeat"
                style={{ backgroundImage: `url(${JSON.stringify(logoUrl)})` }}
              />
            )}
            <span className="font-bold text-slate-200">{tournamentName}</span>
            <span>·</span>
            <span className="text-teal-400 font-semibold">Vòng {selectedRound}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="rounded bg-slate-900 px-2 py-0.5 text-[11px] text-slate-300 ring-1 ring-slate-800">
              {officialCount}/{matches.length} bàn đã chốt kết quả
            </span>
            {lastSuccessfulSync && (
              <span className="text-[11px] text-slate-500">
                Đồng bộ: {formatSyncTime(lastSuccessfulSync)}
              </span>
            )}
          </div>
        </div>

        {/* Content Box with Display Scale applied */}
        <div
          style={{
            zoom: displayScale !== 100 ? `${displayScale}%` : undefined,
          }}
          className="transition-transform origin-top"
        >
          {matches.length === 0 ? (
            <p className="mt-12 text-center text-sm text-slate-400">
              Chưa có cặp đấu nào cho Vòng {selectedRound}.
            </p>
          ) : (
            <div
              className={`grid gap-2 ${
                columnSlices.length === 1
                  ? "grid-cols-1"
                  : columnSlices.length === 2
                    ? "grid-cols-1 lg:grid-cols-2"
                    : columnSlices.length === 3
                      ? "grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
                      : "grid-cols-1 md:grid-cols-2 lg:grid-cols-4"
              }`}
            >
              {columnSlices.map((slice, idx) => (
                <MatchSubTable
                  key={idx}
                  matches={slice}
                  isCompact={!allowVerticalScroll}
                />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
