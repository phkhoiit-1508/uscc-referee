"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireReferee } from "@/lib/require-referee";
import { createAdminClient } from "@/lib/supabase/admin";

export type CreateTournamentState = {
  error?: string;
  fieldErrors?: Record<string, string[] | undefined>;
};

const optionalText = z.string().trim().max(200, "Tối đa 200 ký tự");
const optionalDate = z
  .string()
  .trim()
  .refine(
    (value) => !value || /^\d{4}-\d{2}-\d{2}$/.test(value),
    "Ngày không hợp lệ",
  );

const createTournamentSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Nhập tên giải đấu")
      .max(200, "Tối đa 200 ký tự"),
    organizer: optionalText,
    venue: optionalText,
    startDate: optionalDate,
    endDate: optionalDate,
    totalRounds: z.coerce
      .number()
      .int("Số vòng phải là số nguyên")
      .min(1, "Giải phải có ít nhất 1 vòng")
      .max(30, "Giải có tối đa 30 vòng"),
    logoUrl: z
      .string()
      .trim()
      .max(2048, "Đường dẫn logo quá dài")
      .refine((value) => {
        if (!value) return true;

        try {
          const url = new URL(value);
          return url.protocol === "http:" || url.protocol === "https:";
        } catch {
          return false;
        }
      }, "Logo phải là đường dẫn HTTP hoặc HTTPS"),
    primaryColor: z
      .string()
      .regex(/^#[0-9A-Fa-f]{6}$/, "Màu nhận diện không hợp lệ"),
  })
  .refine(
    ({ startDate, endDate }) =>
      !startDate || !endDate || endDate >= startDate,
    {
      message: "Ngày kết thúc phải từ ngày bắt đầu trở đi",
      path: ["endDate"],
    },
  );

export async function createTournament(
  _state: CreateTournamentState,
  formData: FormData,
): Promise<CreateTournamentState> {
  let referee;

  try {
    referee = await requireReferee(["technical"]);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      redirect("/login");
    }

    return { error: "Chỉ trọng tài kỹ thuật được tạo giải." };
  }

  const parsed = createTournamentSchema.safeParse({
    name: formData.get("name") ?? "",
    organizer: formData.get("organizer") ?? "",
    venue: formData.get("venue") ?? "",
    startDate: formData.get("startDate") ?? "",
    endDate: formData.get("endDate") ?? "",
    totalRounds: formData.get("totalRounds") ?? "",
    logoUrl: formData.get("logoUrl") ?? "",
    primaryColor: formData.get("primaryColor") ?? "#172C4C",
  });

  if (!parsed.success) {
    return {
      error: "Kiểm tra lại thông tin giải đấu.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const values = parsed.data;
  const admin = createAdminClient();
  const { error } = await admin.rpc("uscc_create_tournament", {
    p_actor: referee.userId,
    p_name: values.name,
    p_organizer: values.organizer || null,
    p_venue: values.venue || null,
    p_start_date: values.startDate || null,
    p_end_date: values.endDate || null,
    p_total_rounds: values.totalRounds,
    p_timezone: "Asia/Ho_Chi_Minh",
    p_logo_url: values.logoUrl || null,
    p_primary_color: values.primaryColor,
  });

  if (error) {
    return {
      error: "Không thể tạo giải. Dữ liệu chưa được lưu.",
    };
  }

  revalidatePath("/tournaments");
  redirect("/tournaments");
}
