"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { deleteTournament, type DeleteTournamentState } from "@/app/tournaments/actions";
import { Button } from "@/components/ui/button";

type TournamentDeleteButtonProps = {
  tournamentId: string;
  tournamentName: string;
  variant?: "compact" | "danger-zone";
};

const initialState: DeleteTournamentState = {};

export function TournamentDeleteButton({
  tournamentId,
  tournamentName,
  variant = "compact",
}: TournamentDeleteButtonProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [state, formAction, pending] = useActionState(deleteTournament, initialState);

  useEffect(() => {
    if (state.success) {
      setIsOpen(false);
      router.push("/tournaments");
      router.refresh();
    }
  }, [state.success, router]);

  if (variant === "compact") {
    return (
      <div className="relative inline-block">
        {!isOpen ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setIsOpen(true)}
            className="border-red-200 bg-white text-red-600 hover:border-red-300 hover:bg-red-50 hover:text-red-700"
          >
            Xóa
          </Button>
        ) : (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-md rounded-lg border border-red-200 bg-white p-6 shadow-xl">
              <h3 className="text-lg font-semibold text-red-900">Xác nhận xóa giải đấu</h3>
              <p className="mt-2 text-sm text-slate-600">
                Bạn có chắc chắn muốn xóa giải đấu <strong className="text-slate-900">{tournamentName}</strong>?
              </p>
              <p className="mt-1 text-xs text-red-600">
                Toàn bộ kỳ thủ, ván đấu và kết quả liên quan sẽ bị xóa vĩnh viễn. Thao tác này không thể hoàn tác.
              </p>

              {state.error && (
                <div role="alert" className="mt-3 rounded border border-red-200 bg-red-50 p-3 text-xs text-red-800">
                  {state.error}
                </div>
              )}

              <form action={formAction} className="mt-5 flex justify-end gap-3">
                <input type="hidden" name="tournamentId" value={tournamentId} />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  onClick={() => setIsOpen(false)}
                  className="bg-white text-slate-700 hover:bg-slate-100"
                >
                  Hủy
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={pending}
                  className="bg-red-600 text-white hover:bg-red-700"
                >
                  {pending ? "Đang xóa..." : "Xác nhận xóa"}
                </Button>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Variant "danger-zone" for /tournaments/[id]
  return (
    <div>
      {!isOpen ? (
        <Button
          type="button"
          onClick={() => setIsOpen(true)}
          className="border border-red-300 bg-white text-red-700 hover:bg-red-100 hover:text-red-900"
        >
          Xóa giải đấu này
        </Button>
      ) : (
        <div className="rounded-lg border border-red-300 bg-white p-4 shadow-sm">
          <p className="text-sm font-medium text-slate-800">
            Bạn có chắc chắn muốn xóa giải đấu <strong className="text-red-700">{tournamentName}</strong> không?
          </p>
          <p className="mt-1 text-xs text-red-600">
            Dữ liệu bao gồm danh sách kỳ thủ, lịch thi đấu, kết quả ván đấu sẽ bị xóa. Thao tác không thể hoàn tác.
          </p>

          {state.error && (
            <div role="alert" className="mt-3 rounded border border-red-200 bg-red-50 p-3 text-xs text-red-800">
              {state.error}
            </div>
          )}

          <form action={formAction} className="mt-4 flex items-center gap-3">
            <input type="hidden" name="tournamentId" value={tournamentId} />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => setIsOpen(false)}
              className="bg-white text-slate-700 hover:bg-slate-100"
            >
              Hủy bỏ
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={pending}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              {pending ? "Đang xóa..." : "Đồng ý xóa vĩnh viễn"}
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}

