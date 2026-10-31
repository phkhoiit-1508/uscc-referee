"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

type TournamentExportPanelProps = {
  tournamentId: string;
  totalRounds: number;
};

export function TournamentExportPanel({
  tournamentId,
  totalRounds,
}: TournamentExportPanelProps) {
  const [selectedRound, setSelectedRound] = useState<string>("all");
  const [excelScope, setExcelScope] = useState<"official" | "audit">("official");
  const [downloadingExcel, setDownloadingExcel] = useState(false);
  const [downloadingXml, setDownloadingXml] = useState(false);
  const [xmlReport, setXmlReport] = useState<{
    exported: number;
    ineligible: number;
    level: string;
  } | null>(null);

  const handleDownloadExcel = async () => {
    try {
      setDownloadingExcel(true);
      const url = new URL(`/api/tournaments/${tournamentId}/export/excel`, window.location.origin);
      if (selectedRound !== "all") {
        url.searchParams.set("round", selectedRound);
      }
      url.searchParams.set("scope", excelScope);

      const res = await fetch(url.toString());
      if (!res.ok) throw new Error("Xuất Excel thất bại");

      const blob = await res.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      const contentDisposition = res.headers.get("content-disposition");
      let filename = `USCC_Results_${selectedRound === "all" ? "All" : `Round${selectedRound}`}.xlsx`;
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="?([^"]+)"?/);
        if (match?.[1]) filename = decodeURIComponent(match[1]);
      }
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(downloadUrl);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Lỗi khi tải file Excel");
    } finally {
      setDownloadingExcel(false);
    }
  };

  const handleDownloadXml = async () => {
    try {
      setDownloadingXml(true);
      setXmlReport(null);
      const url = new URL(`/api/tournaments/${tournamentId}/export/xml`, window.location.origin);
      if (selectedRound !== "all") {
        url.searchParams.set("round", selectedRound);
      }

      const res = await fetch(url.toString());
      if (!res.ok) throw new Error("Xuất XML thất bại");

      const exportedCount = Number(res.headers.get("X-Exported-Count") || "0");
      const ineligibleCount = Number(res.headers.get("X-Ineligible-Count") || "0");
      const level = res.headers.get("X-Compatibility-Level") || "schema_valid";

      setXmlReport({ exported: exportedCount, ineligible: ineligibleCount, level });

      const blob = await res.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      const contentDisposition = res.headers.get("content-disposition");
      let filename = `SwissManager_${selectedRound === "all" ? "All" : `Round${selectedRound}`}.xml`;
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="?([^"]+)"?/);
        if (match?.[1]) filename = decodeURIComponent(match[1]);
      }
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(downloadUrl);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Lỗi khi tải file XML");
    } finally {
      setDownloadingXml(false);
    }
  };

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center gap-4">
        <label className="grid gap-1 text-sm font-medium">
          Phạm vi vòng đấu
          <select
            value={selectedRound}
            onChange={(e) => setSelectedRound(e.target.value)}
            className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900"
          >
            <option value="all">Toàn bộ giải (tất cả các vòng)</option>
            {Array.from({ length: totalRounds }, (_, i) => i + 1).map((r) => (
              <option key={r} value={String(r)}>
                Vòng {r}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-1 text-sm font-medium">
          Chế độ xuất Excel
          <select
            value={excelScope}
            onChange={(e) => setExcelScope(e.target.value as "official" | "audit")}
            className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900"
          >
            <option value="official">Chỉ kết quả chính thức (mặc định)</option>
            <option value="audit">Bao gồm cả ván chờ / tranh chấp (đối soát)</option>
          </select>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3 pt-2">
        <Button
          type="button"
          onClick={handleDownloadExcel}
          disabled={downloadingExcel}
          className="min-h-10 bg-slate-900 text-white hover:bg-slate-800"
        >
          {downloadingExcel ? "Đang tạo Excel..." : "Tải file Excel đối soát (.xlsx)"}
        </Button>

        <Button
          type="button"
          onClick={handleDownloadXml}
          disabled={downloadingXml}
          variant="outline"
          className="min-h-10 border-slate-400 bg-white text-slate-900 hover:bg-slate-100"
        >
          {downloadingXml ? "Đang tạo XML..." : "Tải file Swiss-Manager XML (.xml)"}
        </Button>
      </div>

      {xmlReport && (
        <div className="rounded border border-teal-200 bg-teal-50 p-3 text-xs text-teal-900">
          <p className="font-semibold">
            Báo cáo XML Swiss-Manager (Mức tương thích:{" "}
            {xmlReport.level === "mapping_ready" ? "Mapping-ready" : "Schema-valid"}):
          </p>
          <ul className="mt-1 list-inside list-disc">
            <li>
              Đã xuất: <span className="font-bold">{xmlReport.exported}</span> ván chính thức có đủ
              mã Swiss-Manager.
            </li>
            {xmlReport.ineligible > 0 && (
              <li className="text-amber-800">
                Bỏ qua: <span className="font-bold">{xmlReport.ineligible}</span> ván chưa đủ điều
                kiện (chưa official hoặc thiếu mã Swiss-Manager đối soát).
              </li>
            )}
            <li className="text-slate-600">
              Lưu ý: Mức kiểm thử hiện tại là Schema-valid theo đặc tả công khai Heinz Herzog
              (18/09/2024); cần kiểm thử thao tác nạp thực tế vào Swiss-Manager trước khi bắt đầu giải
              chính thức.
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}

