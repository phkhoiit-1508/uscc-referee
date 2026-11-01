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

/**
 * Renders a sub-table in clean black & white / light theme with zebra striping
 * and dynamic row height and font scaling to ALWAYS fill 100% of the screen height.
 */
function MatchSubTableLight({
  matches,
  maxRows = 14,
  fillHeight = true,
}: {
  matches: OfficialMatch[];
  maxRows?: number;
  fillHeight?: boolean;
}) {
  if (matches.length === 0) return null;

  // Dynamic typography: scales up when there are fewer rows so text fills the space generously
  const fontSizeClass =
    maxRows <= 8
      ? "text-base sm:text-lg md:text-xl font-semibold"
      : maxRows <= 15
        ? "text-sm sm:text-base md:text-[17px] font-semibold"
        : maxRows <= 22
          ? "text-xs sm:text-sm md:text-base font-semibold"
          : "text-[11px] sm:text-xs font-semibold";

  const boardSizeClass =
    maxRows <= 8
      ? "text-lg sm:text-xl md:text-2xl font-bold"
      : maxRows <= 15
        ? "text-base sm:text-lg md:text-xl font-bold"
        : maxRows <= 22
          ? "text-xs sm:text-sm md:text-base font-bold"
          : "text-[11px] sm:text-xs font-bold";

  const headerSizeClass =
    maxRows <= 15 ? "text-xs sm:text-sm font-bold" : "text-[11px] sm:text-xs font-bold";

  return (
    <div
      className={`rounded border border-slate-200 bg-white shadow-sm overflow-hidden flex flex-col ${
        fillHeight ? "h-full flex-1 min-h-0" : ""
      }`}
    >
      <table className="w-full h-full table-fixed text-left border-collapse">
        <thead className="shrink-0 border-b border-slate-200 bg-slate-100 text-slate-700">
          <tr className={`h-8 sm:h-9 ${headerSizeClass}`}>
            <th scope="col" className="w-[8%] py-1 px-1 text-center font-bold">
              Bàn
            </th>
            <th scope="col" className="w-[38%] py-1 px-2.5 font-bold">
              Trắng
            </th>
            <th scope="col" className="w-[7%] py-1 px-1 text-center font-semibold text-slate-500">
              Điểm
            </th>
            <th scope="col" className="w-[12%] py-1 px-1 text-center font-bold text-slate-900">
              Kết quả
            </th>
            <th scope="col" className="w-[7%] py-1 px-1 text-center font-semibold text-slate-500">
              Điểm
            </th>
            <th scope="col" className="w-[38%] py-1 px-2.5 font-bold">
              Đen
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {matches.map((match, index) => {
            const isOfficial = match.status === "official";
            const isEven = index % 2 === 1;

            return (
              <tr
                key={match.id}
                style={
                  fillHeight && matches.length > 0
                    ? { height: `${100 / matches.length}%` }
                    : undefined
                }
                className={`transition-colors hover:bg-sky-50/60 ${
                  isEven ? "bg-slate-50/80" : "bg-white"
                }`}
              >
                {/* Bàn */}
                <td className={`px-1 text-center text-slate-800 align-middle ${boardSizeClass}`}>
                  {match.board_number}
                </td>

                {/* Trắng */}
                <td className={`px-2.5 text-slate-950 align-middle ${fontSizeClass}`}>
                  <span className="line-clamp-1" title={match.white_player?.full_name ?? "—"}>
                    {match.white_player?.full_name ?? "—"}
                  </span>
                </td>

                {/* Điểm Trắng */}
                <td
                  className={`px-1 text-center font-medium text-slate-500 align-middle ${fontSizeClass}`}
                >
                  0
                </td>

                {/* Kết quả */}
                <td
                  className={`px-1 text-center font-bold text-slate-950 whitespace-nowrap align-middle ${fontSizeClass}`}
                >
                  {isOfficial && match.result_code ? (
                    <span className="inline-block leading-tight">
                      {match.result_code}
                      {match.result_kind &&
                        match.result_kind !== "normal" &&
                        match.result_kind !== "resignation" && (
                          <span className="block text-[10px] font-normal text-slate-500">
                            {RESULT_KIND_LABELS[match.result_kind] ?? match.result_kind}
                          </span>
                        )}
                    </span>
                  ) : match.status === "pending_white" || match.status === "pending_black" ? (
                    <span className="text-xs font-semibold text-amber-700">Chờ xác nhận</span>
                  ) : match.status === "disputed" || match.status === "special_review" ? (
                    <span className="text-xs font-semibold text-red-600">Xử lý</span>
                  ) : (
                    <span className="font-normal text-slate-300">—</span>
                  )}
                </td>

                {/* Điểm Đen */}
                <td
                  className={`px-1 text-center font-medium text-slate-500 align-middle ${fontSizeClass}`}
                >
                  0
                </td>

                {/* Đen */}
                <td className={`px-2.5 text-slate-950 align-middle ${fontSizeClass}`}>
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
  const [paginationMode, setPaginationMode] = useState<string>("boards_per_page");
  const [boardsPerPage, setBoardsPerPage] = useState<number>(40);
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

  // Pagination calculation
  const effectiveBoardsPerPage = useMemo(() => {
    if (paginationMode === "all") return Math.max(1, matches.length);
    return Math.max(1, boardsPerPage);
  }, [paginationMode, boardsPerPage, matches.length]);

  const totalPages = Math.max(1, Math.ceil(matches.length / effectiveBoardsPerPage));

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
    const start = (effectivePage - 1) * effectiveBoardsPerPage;
    return matches.slice(start, start + effectiveBoardsPerPage);
  }, [matches, currentPage, totalPages, effectiveBoardsPerPage, paginationMode]);

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

  // Calculate the max rows in any column to scale font size accurately
  const maxRowsInColumn = useMemo(() => {
    if (columnSlices.length === 0) return 14;
    return Math.max(...columnSlices.map((s) => s.length));
  }, [columnSlices]);

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

  const isFullscreenView = isFullscreen;
  const shouldFillScreen = !allowVerticalScroll;

  return (
    <div
      className={`bg-white text-slate-900 flex flex-col font-sans select-none ${
        isFullscreenView
          ? "fixed inset-0 h-screen w-screen z-50 overflow-hidden"
          : shouldFillScreen
            ? "h-screen max-h-screen overflow-hidden"
            : "min-h-screen"
      }`}
    >
      {/* Top Controller Bar - ONLY displayed when NOT in full screen */}
      {!isFullscreenView && (
        <div
          className="sticky top-0 z-40 shrink-0 border-t-[3px] border-b border-slate-200 bg-slate-50 px-3 py-1.5 text-slate-800 shadow-sm transition-all sm:px-5"
          style={{ borderTopColor: primaryColor ?? "#0284c7" }}
        >
          {/* Row 1: Back Link & Actions */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <Link
                href={`/tournaments/${tournamentId}`}
                className="flex items-center gap-1 text-xs font-semibold text-slate-700 hover:text-slate-950"
              >
                <span>←</span>
                <span>Điều hành giải đấu</span>
              </Link>
            </div>

            <div className="flex items-center gap-2">
              {/* View Standings Button */}
              <Link
                href={`/tournaments/${tournamentId}`}
                className="flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
              >
                <span>🏆</span>
                <span>Xem bảng xếp hạng</span>
              </Link>

              {/* Toggle Control Bar Button */}
              <button
                type="button"
                onClick={() => setIsControlVisible((prev) => !prev)}
                className="flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
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
            <div className="mt-2 pt-2 border-t border-slate-200 text-xs text-slate-700 space-y-2">
              {/* Control Row 1: Round, Aspect Ratio, Scale, Pagination Type, Boards/Page, Columns */}
              <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2">
                {/* Vòng */}
                <div className="flex items-center gap-1.5">
                  <span className="font-medium text-slate-600">Vòng</span>
                  <select
                    value={selectedRound}
                    onChange={(e) => onSelectRound(Number(e.target.value))}
                    className="rounded border border-slate-300 bg-white px-2 py-1 font-semibold text-slate-900 shadow-sm outline-none focus:border-sky-500 cursor-pointer"
                  >
                    {Array.from({ length: totalRounds }, (_, i) => i + 1).map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>

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
                    <option value="boards_per_page">Số bàn mỗi trang</option>
                    <option value="all">Tất cả trong 1 trang</option>
                  </select>
                </div>

                {/* Bàn/trang */}
                {paginationMode === "boards_per_page" && (
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium text-slate-600">Bàn/trang</span>
                    <select
                      value={boardsPerPage}
                      onChange={(e) => {
                        setBoardsPerPage(Number(e.target.value));
                        setCurrentPage(1);
                      }}
                      className="rounded border border-slate-300 bg-white px-2.5 py-1 font-semibold text-slate-900 shadow-sm outline-none focus:border-sky-500"
                    >
                      <option value={10}>10 bàn/trang</option>
                      <option value={20}>20 bàn/trang</option>
                      <option value={30}>30 bàn/trang</option>
                      <option value={40}>40 bàn/trang</option>
                      <option value={50}>50 bàn/trang</option>
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
              </div>

              {/* Control Row 2: Scroll toggle, Auto flip, Flip interval, Prev, Next, Current Page Badge, Fullscreen Button, Hint */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 pt-1 border-t border-slate-200/70">
                {/* Cho phép cuộn dọc */}
                <label className="flex cursor-pointer items-center gap-1.5 font-medium text-slate-700 hover:text-slate-950">
                  <input
                    type="checkbox"
                    checked={allowVerticalScroll}
                    onChange={(e) => setAllowVerticalScroll(e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-slate-300 text-sky-600 focus:ring-0"
                  />
                  <span>Cho phép cuộn dọc (giữ chữ lớn)</span>
                </label>

                {/* Tự động chuyển trang */}
                <label className="flex cursor-pointer items-center gap-1.5 font-medium text-slate-800">
                  <input
                    type="checkbox"
                    checked={autoPageFlip}
                    onChange={(e) => setAutoPageFlip(e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-slate-300 text-sky-600 focus:ring-0"
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
                    className="rounded border border-slate-300 bg-white px-2 py-0.5 font-semibold text-slate-900 shadow-sm outline-none disabled:opacity-50"
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
                  className="rounded border border-slate-300 bg-white px-2.5 py-0.5 font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-40"
                >
                  Trang trước
                </button>

                {/* Trang sau */}
                <button
                  type="button"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  className="rounded border border-slate-300 bg-white px-2.5 py-0.5 font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-40"
                >
                  Trang sau
                </button>

                {/* Trang hiện tại badge */}
                <span className="rounded bg-slate-950 px-2.5 py-0.5 font-bold text-white shadow-sm text-xs">
                  Trang {currentPage}
                </span>

                {/* Toàn màn hình (F11) */}
                <button
                  type="button"
                  onClick={toggleFullscreen}
                  className="flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-0.5 font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                >
                  <svg
                    className="h-3 w-3 text-slate-700"
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
                  <span>Toàn màn hình (F11)</span>
                </button>

                {/* Helper text hint */}
                <span className="text-[11px] text-slate-500 xl:inline-block hidden">
                  Vừa khít tự thu chữ theo số dòng; bật cuộn để giữ cỡ lớn.
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Floating Exit Button in Fullscreen Mode */}
      {isFullscreenView && (
        <div className="fixed top-2 right-3 z-50 opacity-20 hover:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={toggleFullscreen}
            className="flex items-center gap-1 rounded bg-slate-900/80 backdrop-blur-sm px-2.5 py-1 text-xs font-semibold text-white shadow hover:bg-slate-950"
            title="Thoát toàn màn hình (Esc hoặc F11)"
          >
            <svg
              className="h-3.5 w-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
            <span>Thoát toàn màn hình (Esc)</span>
          </button>
        </div>
      )}

      {/* Main Projector Screen Container: Stretches to fill 100% of height */}
      <main
        className={`flex-1 min-h-0 flex flex-col px-3 py-2 sm:px-6 sm:py-3 mx-auto ${getAspectRatioClasses()} ${
          allowVerticalScroll ? "overflow-y-auto" : "overflow-hidden"
        }`}
      >
        {/* Network disconnect alert banner */}
        {isDisconnected && (
          <aside
            role="alert"
            className="shrink-0 mb-1 rounded border border-amber-500 bg-amber-50 p-1.5 text-xs text-amber-800"
          >
            ⚠️ Mất kết nối — dữ liệu hiển thị lúc{" "}
            {lastSuccessfulSync ? formatSyncTime(lastSuccessfulSync) : "chưa rõ"}.
          </aside>
        )}

        {/* Tournament Title Header - Exact Match to Design */}
        <div className="shrink-0 mb-2 flex items-start justify-between border-b border-slate-200 pb-2">
          <div>
            <div className="flex items-center gap-2">
              {logoUrl && (
                <div
                  role="img"
                  aria-label={`Logo ${tournamentName}`}
                  className="h-7 w-7 shrink-0 bg-contain bg-center bg-no-repeat"
                  style={{ backgroundImage: `url(${JSON.stringify(logoUrl)})` }}
                />
              )}
              <h1 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl md:text-4xl">
                {tournamentName}
              </h1>
            </div>
            <p className="mt-0.5 text-xs font-semibold text-slate-600 sm:text-sm md:text-base">
              Vòng {selectedRound} · Kết quả chính thức
            </p>
          </div>

          <div className="text-right">
            <div className="flex items-center justify-end gap-1.5 text-xs sm:text-sm font-medium text-emerald-700">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              <span>
                Đã đồng bộ {lastSuccessfulSync ? `(Cập nhật cuối: ${formatSyncTime(lastSuccessfulSync)})` : ""}
              </span>
            </div>
            <p className="mt-0.5 text-xs font-medium text-slate-400">
              Trang {currentPage}/{totalPages}
            </p>
          </div>
        </div>

        {/* Content Box with Display Scale applied - ALWAYS FILLS 100% OF REMAINING VERTICAL HEIGHT */}
        <div
          style={{
            zoom: displayScale !== 100 ? `${displayScale}%` : undefined,
          }}
          className="flex-1 min-h-0 flex flex-col transition-transform origin-top my-1"
        >
          {matches.length === 0 ? (
            <p className="mt-12 text-center text-sm text-slate-400">
              Chưa có cặp đấu nào cho Vòng {selectedRound}.
            </p>
          ) : (
            <div
              className={`flex-1 min-h-0 h-full grid gap-2.5 sm:gap-4 ${
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
                <MatchSubTableLight
                  key={idx}
                  matches={slice}
                  maxRows={maxRowsInColumn}
                  fillHeight={shouldFillScreen}
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer info bar - Exactly like Design */}
        <div className="shrink-0 mt-2 flex flex-wrap items-center justify-between border-t border-slate-200 pt-1.5 text-[11px] sm:text-xs text-slate-500">
          <div className="flex items-center gap-1 font-semibold text-slate-700">
            <span>✓</span>
            <span>{officialCount}/{matches.length} bàn chính thức</span>
          </div>

          <div className="text-center italic text-slate-400 hidden md:block">
            Điểm hiển thị từ dữ liệu đầu vòng (Tạm tính) — Hệ thống không tự tính bảng xếp hạng
          </div>

          <div className="font-medium text-slate-600">
            {matches.length} bàn · {columnsCount} cột
          </div>
        </div>
      </main>
    </div>
  );
}
