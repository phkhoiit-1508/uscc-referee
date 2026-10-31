"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";

import {
  createTournament,
  updateTournament,
  type TournamentFormState,
} from "@/app/tournaments/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type TournamentValues = {
  name: string;
  organizer: string;
  venue: string;
  startDate: string;
  endDate: string;
  totalRounds: number;
  logoUrl: string;
  primaryColor: string;
};

type TournamentAction = (
  state: TournamentFormState,
  formData: FormData,
) => Promise<TournamentFormState>;

const initialState: TournamentFormState = {};
const emptyValues: TournamentValues = {
  name: "",
  organizer: "",
  venue: "",
  startDate: "",
  endDate: "",
  totalRounds: 1,
  logoUrl: "",
  primaryColor: "#172C4C",
};

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-sm text-red-700">{message}</p>;
}

function TournamentForm({
  action,
  values,
  tournamentId,
  submitLabel,
  pendingLabel,
}: {
  action: TournamentAction;
  values: TournamentValues;
  tournamentId?: string;
  submitLabel: string;
  pendingLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const router = useRouter();

  useEffect(() => {
    if (state.success) router.refresh();
  }, [state.success, router]);

  return (
    <form action={formAction} className="grid gap-5 text-slate-900">
      {tournamentId && <input type="hidden" name="tournamentId" value={tournamentId} />}

      <div className="grid gap-2">
        <Label htmlFor="name">Tên giải đấu</Label>
        <Input id="name" name="name" required maxLength={200} defaultValue={values.name} placeholder="Giải cờ vua USCC mở rộng" />
        <FieldError message={state.fieldErrors?.name?.[0]} />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="organizer">Đơn vị tổ chức</Label>
          <Input id="organizer" name="organizer" maxLength={200} defaultValue={values.organizer} />
          <FieldError message={state.fieldErrors?.organizer?.[0]} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="venue">Địa điểm</Label>
          <Input id="venue" name="venue" maxLength={200} defaultValue={values.venue} />
          <FieldError message={state.fieldErrors?.venue?.[0]} />
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-3">
        <div className="grid gap-2">
          <Label htmlFor="startDate">Ngày bắt đầu</Label>
          <Input id="startDate" name="startDate" type="date" defaultValue={values.startDate} />
          <FieldError message={state.fieldErrors?.startDate?.[0]} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="endDate">Ngày kết thúc</Label>
          <Input id="endDate" name="endDate" type="date" defaultValue={values.endDate} />
          <FieldError message={state.fieldErrors?.endDate?.[0]} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="totalRounds">Số vòng</Label>
          <Input id="totalRounds" name="totalRounds" type="number" min={1} max={30} defaultValue={values.totalRounds} required />
          <FieldError message={state.fieldErrors?.totalRounds?.[0]} />
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-[1fr_9rem]">
        <div className="grid gap-2">
          <Label htmlFor="logoUrl">Đường dẫn logo</Label>
          <Input id="logoUrl" name="logoUrl" type="url" maxLength={2048} defaultValue={values.logoUrl} placeholder="https://..." />
          <FieldError message={state.fieldErrors?.logoUrl?.[0]} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="primaryColor">Màu nhận diện</Label>
          <Input id="primaryColor" name="primaryColor" type="color" defaultValue={values.primaryColor} className="h-9 cursor-pointer px-1" />
          <FieldError message={state.fieldErrors?.primaryColor?.[0]} />
        </div>
      </div>

      {state.error && <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">{state.error}</p>}
      {state.success && <p role="status" className="rounded-md bg-teal-50 p-3 text-sm text-teal-800">Đã cập nhật thông tin giải đấu.</p>}

      <div className="flex justify-end">
        <Button type="submit" disabled={pending} className="min-w-36 bg-slate-900 text-white hover:bg-slate-800">
          {pending ? pendingLabel : submitLabel}
        </Button>
      </div>
    </form>
  );
}

export function TournamentCreateForm() {
  return (
    <TournamentForm
      action={createTournament}
      values={emptyValues}
      submitLabel="Tạo giải đấu"
      pendingLabel="Đang tạo..."
    />
  );
}

export function TournamentEditForm({
  tournamentId,
  values,
}: {
  tournamentId: string;
  values: TournamentValues;
}) {
  return (
    <TournamentForm
      action={updateTournament}
      values={values}
      tournamentId={tournamentId}
      submitLabel="Lưu thay đổi"
      pendingLabel="Đang lưu..."
    />
  );
}
