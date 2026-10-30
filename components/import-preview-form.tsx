"use client";

import { startTransition, useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import {
  confirmImport,
  previewImport,
  type ConfirmImportState,
  type ImportPreviewState,
} from "@/app/tournaments/[id]/actions";
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
  const fileRef = useRef<HTMLInputElement>(null);
  const previewedFileRef = useRef<File | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (confirm.success) router.refresh();
  }, [confirm.success, router]);

  const hasPairings = !!preview.pairings?.length;

  return (
    <div className="grid gap-6">
      <form
        action={previewAction}
        onSubmit={() => { previewedFileRef.current = fileRef.current?.files?.[0] ?? null; }}
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

      {(hasPairings || preview.errors) && (
        <div className="grid gap-4">
          {preview.errors && preview.errors.length > 0 && (
            <div className="rounded-md border border-orange-200 bg-orange-50 p-4">
              <p className="mb-2 text-sm font-semibold text-orange-800">
                Cảnh báo ({preview.errors.length})
              </p>
              <ul className="list-inside list-disc space-y-1">
                {preview.errors.map((e, i) => (
                  <li key={i} className="text-sm text-orange-700">{e}</li>
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
                        <td className="px-3 py-2">{p.whiteName}</td>
                        <td className="px-3 py-2 text-slate-500">{p.whiteClub}</td>
                        <td className="px-3 py-2">{p.blackName}</td>
                        <td className="px-3 py-2 text-slate-500">{p.blackClub}</td>
                        <td className="px-3 py-2 text-slate-400">{p.sourceResult || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {hasPairings && !confirm.success && (
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
                  required
                  placeholder={`1–${totalRounds}`}
                  className="w-28 rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400"
                />
              </div>


              <Button
                type="submit"
                disabled={confirmPending}
                className="min-w-36 bg-teal-700 text-white hover:bg-teal-800"
              >
                {confirmPending ? "Đang lưu..." : "Xác nhận nhập"}
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
