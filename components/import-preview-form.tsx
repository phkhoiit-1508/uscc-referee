"use client";

import { startTransition, useActionState, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  confirmImport,
  checkRoundDiffAction,
  previewImport,
  type ConfirmImportState,
  type ImportPreviewState,
} from "@/app/tournaments/[id]/actions";
import type { RoundDiffSummary } from "@/lib/excel/pairing-diff";
import { Button } from "@/components/ui/button";

const initialPreview: ImportPreviewState = {};
const initialConfirm: ConfirmImportState = {};

export function ImportPreviewForm({
  tournamentId,
  totalRounds,
}: {
  tournamentId: string;
  totalRounds: number;
}) {
  const [preview, previewAction, previewPending] = useActionState(previewImport, initialPreview);
  const [confirm, confirmAction, confirmPending] = useActionState(confirmImport, initialConfirm);
  const [roundNumber, setRoundNumber] = useState<number | "">(1);
  const [diffSummary, setDiffSummary] = useState<RoundDiffSummary | null>(null);
  const [roundStateSignature, setRoundStateSignature] = useState<string>("");
  const [diffChecking, setDiffChecking] = useState(false);

  // Sheet and column mapping overrides
  const [sheetName, setSheetName] = useState<string>("");
  const [boardCol, setBoardCol] = useState<string>("");
  const [whiteNameCol, setWhiteNameCol] = useState<string>("");
  const [whiteClubCol, setWhiteClubCol] = useState<string>("");
  const [whiteIdCol, setWhiteIdCol] = useState<string>("");
  const [resultCol, setResultCol] = useState<string>("");
  const [blackNameCol, setBlackNameCol] = useState<string>("");
  const [blackClubCol, setBlackClubCol] = useState<string>("");
  const [blackIdCol, setBlackIdCol] = useState<string>("");

  const fileRef = useRef<HTMLInputElement>(null);
  const previewedFileRef = useRef<File | null>(null);
  const router = useRouter();

  const handleCheckDiff = useCallback(
    async (r: number, pairingsToCheck = preview.pairings) => {
      if (!pairingsToCheck?.length || !r) return;
      try {
        setDiffChecking(true);
        const res = await checkRoundDiffAction(tournamentId, r, pairingsToCheck);
        if (res.diff) {
          setDiffSummary(res.diff);
        }
        if (res.roundStateSignature) {
          setRoundStateSignature(res.roundStateSignature);
        }
      } catch {
        // Ignore background diff check failure
      } finally {
        setDiffChecking(false);
      }
    },
    [tournamentId, preview.pairings],
  );

  // Automatically compute diff when preview pairings load or update
  useEffect(() => {
    if (preview.pairings?.length && typeof roundNumber === "number" && roundNumber >= 1) {
      void handleCheckDiff(roundNumber, preview.pairings);
    } else {
      setDiffSummary(null);
      setRoundStateSignature("");
    }
  }, [preview.pairings, roundNumber, handleCheckDiff]);

  // Sync detected sheet and column mapping into state when preview updates
  useEffect(() => {
    if (preview.selectedSheet) {
      setSheetName(preview.selectedSheet);
    }
    if (preview.columnMapping) {
      setBoardCol(String(preview.columnMapping.boardCol || ""));
      setWhiteNameCol(String(preview.columnMapping.whiteNameCol || ""));
      setWhiteClubCol(String(preview.columnMapping.whiteClubCol || ""));
      setWhiteIdCol(preview.columnMapping.whiteIdCol ? String(preview.columnMapping.whiteIdCol) : "");
      setResultCol(String(preview.columnMapping.resultCol || ""));
      setBlackNameCol(String(preview.columnMapping.blackNameCol || ""));
      setBlackClubCol(String(preview.columnMapping.blackClubCol || ""));
      setBlackIdCol(preview.columnMapping.blackIdCol ? String(preview.columnMapping.blackIdCol) : "");
    }
  }, [preview.selectedSheet, preview.columnMapping]);

  useEffect(() => {
    if (confirm.success) router.refresh();
  }, [confirm.success, router]);

  const hasPairings = !!preview.pairings?.length;
  const availableColumns = preview.availableColumns ?? [];

  const handleRePreviewWithMapping = () => {
    if (!previewedFileRef.current) return;
    const formData = new FormData();
    formData.set("file", previewedFileRef.current);
    if (sheetName) formData.set("sheetName", sheetName);
    if (boardCol) formData.set("boardCol", boardCol);
    if (whiteNameCol) formData.set("whiteNameCol", whiteNameCol);
    if (whiteClubCol) formData.set("whiteClubCol", whiteClubCol);
    if (whiteIdCol) formData.set("whiteIdCol", whiteIdCol);
    if (resultCol) formData.set("resultCol", resultCol);
    if (blackNameCol) formData.set("blackNameCol", blackNameCol);
    if (blackClubCol) formData.set("blackClubCol", blackClubCol);
    if (blackIdCol) formData.set("blackIdCol", blackIdCol);
    startTransition(() => previewAction(formData));
  };

  return (
    <div className="grid gap-6">
      <form
        action={previewAction}
        onSubmit={() => {
          previewedFileRef.current = fileRef.current?.files?.[0] ?? null;
        }}
        className="flex flex-wrap items-end gap-3"
      >
        <div className="grid gap-1">
          <label htmlFor="import-file" className="text-sm font-medium">
            File lịch thi đấu (.xlsx)
          </label>
          <input
            ref={fileRef}
            id="import-file"
            name="file"
            type="file"
            accept=".xlsx"
            required
            className="text-sm text-slate-700 file:mr-3 file:rounded file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-slate-900 hover:file:bg-slate-200"
          />
        </div>

        <Button type="submit" disabled={previewPending} className="min-w-32 bg-slate-900 text-white hover:bg-slate-800">
          {previewPending ? "Đang đọc..." : "Xem trước"}
        </Button>
      </form>

      {preview.parseError && (
        <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">
          {preview.parseError}
        </p>
      )}

      {(hasPairings || (preview.errors && preview.errors.length > 0) || (preview.warnings && preview.warnings.length > 0)) && (
        <div className="grid gap-4">
          {availableColumns.length > 0 && (
            <details className="rounded border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
              <summary className="cursor-pointer font-semibold text-slate-800">
                Tùy chỉnh trang tính & ánh xạ cột (Đang chọn: Sheet &quot;{preview.selectedSheet ?? "Sheet1"}&quot;)
              </summary>
              <div className="mt-3 grid gap-3 sm:grid-cols-4">
                {preview.sheets && preview.sheets.length > 0 && (
                  <label className="grid gap-1">
                    <span className="font-medium">Trang tính (Sheet)</span>
                    <select
                      value={sheetName}
                      onChange={(e) => setSheetName(e.target.value)}
                      className="rounded border border-slate-300 bg-white px-2 py-1 text-slate-900"
                    >
                      {preview.sheets.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </label>
                )}
                <label className="grid gap-1">
                  <span className="font-medium">Cột Bàn</span>
                  <select
                    value={boardCol}
                    onChange={(e) => setBoardCol(e.target.value)}
                    className="rounded border border-slate-300 bg-white px-2 py-1 text-slate-900"
                  >
                    {availableColumns.map((c) => (
                      <option key={c.col} value={String(c.col)}>
                        Cột {c.letter} ({c.header})
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1">
                  <span className="font-medium">Cột Tên Trắng</span>
                  <select
                    value={whiteNameCol}
                    onChange={(e) => setWhiteNameCol(e.target.value)}
                    className="rounded border border-slate-300 bg-white px-2 py-1 text-slate-900"
                  >
                    {availableColumns.map((c) => (
                      <option key={c.col} value={String(c.col)}>
                        Cột {c.letter} ({c.header})
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1">
                  <span className="font-medium">Cột Mã Trắng (nếu có)</span>
                  <select
                    value={whiteIdCol}
                    onChange={(e) => setWhiteIdCol(e.target.value)}
                    className="rounded border border-slate-300 bg-white px-2 py-1 text-slate-900"
                  >
                    <option value="">-- Không có --</option>
                    {availableColumns.map((c) => (
                      <option key={c.col} value={String(c.col)}>
                        Cột {c.letter} ({c.header})
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1">
                  <span className="font-medium">Cột CLB Trắng</span>
                  <select
                    value={whiteClubCol}
                    onChange={(e) => setWhiteClubCol(e.target.value)}
                    className="rounded border border-slate-300 bg-white px-2 py-1 text-slate-900"
                  >
                    <option value="">-- Không có --</option>
                    {availableColumns.map((c) => (
                      <option key={c.col} value={String(c.col)}>
                        Cột {c.letter} ({c.header})
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1">
                  <span className="font-medium">Cột Kết quả nguồn</span>
                  <select
                    value={resultCol}
                    onChange={(e) => setResultCol(e.target.value)}
                    className="rounded border border-slate-300 bg-white px-2 py-1 text-slate-900"
                  >
                    <option value="">-- Không có --</option>
                    {availableColumns.map((c) => (
                      <option key={c.col} value={String(c.col)}>
                        Cột {c.letter} ({c.header})
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1">
                  <span className="font-medium">Cột Tên Đen</span>
                  <select
                    value={blackNameCol}
                    onChange={(e) => setBlackNameCol(e.target.value)}
                    className="rounded border border-slate-300 bg-white px-2 py-1 text-slate-900"
                  >
                    {availableColumns.map((c) => (
                      <option key={c.col} value={String(c.col)}>
                        Cột {c.letter} ({c.header})
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1">
                  <span className="font-medium">Cột Mã Đen (nếu có)</span>
                  <select
                    value={blackIdCol}
                    onChange={(e) => setBlackIdCol(e.target.value)}
                    className="rounded border border-slate-300 bg-white px-2 py-1 text-slate-900"
                  >
                    <option value="">-- Không có --</option>
                    {availableColumns.map((c) => (
                      <option key={c.col} value={String(c.col)}>
                        Cột {c.letter} ({c.header})
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="mt-3">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={previewPending}
                  onClick={handleRePreviewWithMapping}
                  className="bg-white text-xs text-slate-900 hover:bg-slate-100"
                >
                  Đọc lại với ánh xạ cột đã chọn
                </Button>
              </div>
            </details>
          )}

          {preview.errors && preview.errors.length > 0 && (
            <div className="rounded-md border border-red-300 bg-red-50 p-4">
              <p className="mb-2 text-sm font-semibold text-red-800">
                Phát hiện lỗi cần sửa ({preview.errors.length}) — theo Sheet, Dòng, Cột
              </p>
              <ul className="list-inside list-disc space-y-1">
                {preview.errors.map((e, i) => (
                  <li key={i} className="text-sm text-red-700">{e}</li>
                ))}
              </ul>
            </div>
          )}

          {preview.warnings && preview.warnings.length > 0 && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-4">
              <p className="mb-2 text-sm font-semibold text-amber-800">
                Cảnh báo danh tính ({preview.warnings.length}) — theo Sheet, Dòng, Cột
              </p>
              <ul className="list-inside list-disc space-y-1">
                {preview.warnings.map((w, i) => (
                  <li key={i} className="text-sm text-amber-700">{w}</li>
                ))}
              </ul>
            </div>
          )}

          {hasPairings && (
            <div>
              <p className="mb-3 text-sm text-slate-600">
                Tìm thấy <span className="font-semibold">{preview.pairings!.length} cặp đấu</span> hợp lệ trong {preview.fileName}. File này sẽ được đọc lại khi xác nhận nhập.
              </p>
              <div className="overflow-x-auto rounded border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Bàn</th>
                      <th className="px-3 py-2">Trắng</th>
                      <th className="px-3 py-2">CLB</th>
                      <th className="px-3 py-2">Đen</th>
                      <th className="px-3 py-2">CLB</th>
                      <th className="px-3 py-2">Kết quả nguồn</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {preview.pairings!.map((p) => (
                      <tr key={p.board} className="hover:bg-slate-50">
                        <td className="px-3 py-2 font-medium">{p.board}</td>
                        <td className="px-3 py-2">
                          {p.whiteName}
                          {p.whiteExternalId && (
                            <span className="ml-1 text-xs text-slate-400">({p.whiteExternalId})</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-slate-500">{p.whiteClub || "—"}</td>
                        <td className="px-3 py-2">
                          {p.isBye ? "Miễn đấu (Bye)" : p.blackName}
                          {p.blackExternalId && (
                            <span className="ml-1 text-xs text-slate-400">({p.blackExternalId})</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-slate-500">{p.blackClub || "—"}</td>
                        <td className="px-3 py-2 text-slate-400">{p.sourceResult || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {preview.hasBlockingErrors && (
            <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
              Không thể nhập file khi có dòng bị lỗi. Vui lòng sửa lại file Excel theo chi tiết báo lỗi ở trên rồi tải lên lại.
            </p>
          )}

          {hasPairings && !preview.hasBlockingErrors && !confirm.success && (
            <form
              action={confirmAction}
              onSubmit={(event) => {
                event.preventDefault();
                if (!previewedFileRef.current) return;
                const formData = new FormData(event.currentTarget);
                formData.set("file", previewedFileRef.current);
                startTransition(() => confirmAction(formData));
              }}
              className="mt-2 flex flex-wrap items-end gap-3 border-t border-slate-200 pt-4"
            >
              <input type="hidden" name="tournamentId" value={tournamentId} />
              <input type="hidden" name="fileName" value={preview.fileName ?? ""} />
              <input type="hidden" name="expectedRoundSignature" value={roundStateSignature} />
              {sheetName && <input type="hidden" name="sheetName" value={sheetName} />}
              {boardCol && <input type="hidden" name="boardCol" value={boardCol} />}
              {whiteNameCol && <input type="hidden" name="whiteNameCol" value={whiteNameCol} />}
              {whiteClubCol && <input type="hidden" name="whiteClubCol" value={whiteClubCol} />}
              {whiteIdCol && <input type="hidden" name="whiteIdCol" value={whiteIdCol} />}
              {resultCol && <input type="hidden" name="resultCol" value={resultCol} />}
              {blackNameCol && <input type="hidden" name="blackNameCol" value={blackNameCol} />}
              {blackClubCol && <input type="hidden" name="blackClubCol" value={blackClubCol} />}
              {blackIdCol && <input type="hidden" name="blackIdCol" value={blackIdCol} />}

              <div className="grid gap-1">
                <label htmlFor="round-number" className="text-sm font-medium">
                  Vòng đấu
                </label>
                <input
                  id="round-number"
                  name="round"
                  type="number"
                  min={1}
                  max={totalRounds}
                  value={roundNumber}
                  onChange={(e) => {
                    const val = e.target.value ? Number(e.target.value) : "";
                    setRoundNumber(val);
                  }}
                  required
                  placeholder={`1–${totalRounds}`}
                  className="w-28 rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400"
                />
              </div>

              {diffSummary && (
                <div className="w-full rounded border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                  <p className="font-semibold text-slate-900">
                    Đối soát dữ liệu Vòng {diffSummary.round} (Diff Preview):
                  </p>
                  <div className="mt-1 flex flex-wrap gap-3">
                    <span>Mới: <strong className="text-teal-700">{diffSummary.newBoards.length}</strong></span>
                    <span>Giữ nguyên: <strong>{diffSummary.unchangedBoards.length}</strong></span>
                    {diffSummary.modifiedBoards.length > 0 && (
                      <span>Đổi kỳ thủ: <strong className="text-amber-700">{diffSummary.modifiedBoards.length}</strong></span>
                    )}
                    {diffSummary.swappedColorBoards.length > 0 && (
                      <span>Đổi bên: <strong className="text-amber-700">{diffSummary.swappedColorBoards.length}</strong></span>
                    )}
                    {diffSummary.missingBoards.length > 0 && (
                      <span>Thiếu trong file mới: <strong className="text-amber-700">{diffSummary.missingBoards.length}</strong></span>
                    )}
                    {diffSummary.conflictBoards.length > 0 && (
                      <span className="text-red-700">Xung đột: <strong>{diffSummary.conflictBoards.length}</strong> (ván đã có kết quả/xác nhận)</span>
                    )}
                  </div>

                  {(diffSummary.conflictBoards.length > 0 ||
                    diffSummary.modifiedBoards.length > 0 ||
                    diffSummary.swappedColorBoards.length > 0 ||
                    diffSummary.missingBoards.length > 0) && (
                    <ul className="mt-2 list-inside list-disc space-y-1 border-t border-slate-200 pt-2">
                      {diffSummary.conflictBoards.map((item) => (
                        <li key={`conflict-${item.board}`} className="font-medium text-red-700">
                          {item.message}
                        </li>
                      ))}
                      {diffSummary.modifiedBoards.map((item) => (
                        <li key={`mod-${item.board}`} className="text-amber-800">
                          Bàn {item.board}: {item.message}
                        </li>
                      ))}
                      {diffSummary.swappedColorBoards.map((item) => (
                        <li key={`swap-${item.board}`} className="text-amber-800">
                          Bàn {item.board}: {item.message}
                        </li>
                      ))}
                      {diffSummary.missingBoards.map((item) => (
                        <li key={`miss-${item.board}`} className="text-amber-800">
                          {item.message}
                        </li>
                      ))}
                    </ul>
                  )}

                  {diffSummary.hasConflicts && (
                    <p className="mt-2 font-medium text-red-700">
                      ⚠️ Phát hiện xung đột với ván đấu đã có kết quả trong cơ sở dữ liệu. Không thể nhập để bảo vệ toàn vẹn dữ liệu.
                    </p>
                  )}
                </div>
              )}

              <Button
                type="submit"
                disabled={confirmPending || diffChecking || (diffSummary?.hasConflicts ?? false)}
                className="min-w-36 bg-teal-700 text-white hover:bg-teal-800 disabled:opacity-50"
              >
                {confirmPending ? "Đang lưu..." : diffChecking ? "Đang đối soát..." : "Xác nhận nhập"}
              </Button>
            </form>
          )}

          {confirm.confirmError && (
            <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">
              {confirm.confirmError}
            </p>
          )}

          {confirm.success && (
            <p role="status" className="rounded-md bg-teal-50 p-3 text-sm text-teal-800">
              Đã lưu thành công <span className="font-semibold">{confirm.importedCount} cặp đấu</span> vào cơ sở dữ liệu.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
