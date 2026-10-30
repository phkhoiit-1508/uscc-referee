"use client";

import { useActionState } from "react";

import {
  createTournament,
  type CreateTournamentState,
} from "@/app/tournaments/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: CreateTournamentState = {};

function FieldError({ message }: { message?: string }) {
  if (!message) return null;

  return <p className="text-sm text-red-700">{message}</p>;
}

export function TournamentCreateForm() {
  const [state, formAction, pending] = useActionState(
    createTournament,
    initialState,
  );

  return (
    <form action={formAction} className="grid gap-5 text-slate-900">
      <div className="grid gap-2">
        <Label htmlFor="name">Tên giải đấu</Label>
        <Input
          id="name"
          name="name"
          required
          maxLength={200}
          placeholder="Giải cờ vua USCC mở rộng"
        />
        <FieldError message={state.fieldErrors?.name?.[0]} />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="organizer">Đơn vị tổ chức</Label>
          <Input id="organizer" name="organizer" maxLength={200} />
          <FieldError message={state.fieldErrors?.organizer?.[0]} />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="venue">Địa điểm</Label>
          <Input id="venue" name="venue" maxLength={200} />
          <FieldError message={state.fieldErrors?.venue?.[0]} />
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-3">
        <div className="grid gap-2">
          <Label htmlFor="startDate">Ngày bắt đầu</Label>
          <Input id="startDate" name="startDate" type="date" />
          <FieldError message={state.fieldErrors?.startDate?.[0]} />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="endDate">Ngày kết thúc</Label>
          <Input id="endDate" name="endDate" type="date" />
          <FieldError message={state.fieldErrors?.endDate?.[0]} />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="totalRounds">Số vòng</Label>
          <Input
            id="totalRounds"
            name="totalRounds"
            type="number"
            min={1}
            max={30}
            defaultValue={1}
            required
          />
          <FieldError message={state.fieldErrors?.totalRounds?.[0]} />
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-[1fr_9rem]">
        <div className="grid gap-2">
          <Label htmlFor="logoUrl">Đường dẫn logo</Label>
          <Input
            id="logoUrl"
            name="logoUrl"
            type="url"
            maxLength={2048}
            placeholder="https://..."
          />
          <FieldError message={state.fieldErrors?.logoUrl?.[0]} />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="primaryColor">Màu nhận diện</Label>
          <Input
            id="primaryColor"
            name="primaryColor"
            type="color"
            defaultValue="#172C4C"
            className="h-9 cursor-pointer px-1"
          />
          <FieldError message={state.fieldErrors?.primaryColor?.[0]} />
        </div>
      </div>

      {state.error && (
        <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">
          {state.error}
        </p>
      )}

      <div className="flex justify-end">
        <Button type="submit" disabled={pending} className="min-w-36 bg-slate-900 text-white hover:bg-slate-800">
          {pending ? "Đang tạo..." : "Tạo giải đấu"}
        </Button>
      </div>
    </form>
  );
}
