"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export function ProjectionRefresh({ syncedAt }: { syncedAt: string | null }) {
  const router = useRouter();

  useEffect(() => {
    const timer = window.setInterval(() => router.refresh(), 15000);
    return () => window.clearInterval(timer);
  }, [router]);

  return (
    <p className="text-sm text-slate-500" role="status">
      Cập nhật mỗi 15 giây
      {syncedAt && ` · Đồng bộ thành công lúc ${new Intl.DateTimeFormat("vi-VN", {
        timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", second: "2-digit",
      }).format(new Date(syncedAt))}`}
    </p>
  );
}
