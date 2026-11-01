"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireReferee } from "@/lib/require-referee";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSafeHttpUrl, isValidUuid } from "@/lib/tournament-validation";

export type TournamentFormState = {
  success?: boolean;
  error?: string;
  fieldErrors?: Record<string, string[] | undefined>;
};

export type CreateTournamentState = TournamentFormState;
export type UpdateTournamentState = TournamentFormState;

const optionalText = z.string().trim().max(200, "Tối đa 200 ký tự");
const optionalDate = z
  .string()
  .trim()
  .refine(
    (value) => !value || /^\d{4}-\d{2}-\d{2}$/.test(value),
    "Ngày không hợp lệ",
  );

const tournamentSchema = z
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
        return isSafeHttpUrl(value);
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

function parseTournamentForm(formData: FormData) {
  return tournamentSchema.safeParse({
    name: formData.get("name") ?? "",
    organizer: formData.get("organizer") ?? "",
    venue: formData.get("venue") ?? "",
    startDate: formData.get("startDate") ?? "",
    endDate: formData.get("endDate") ?? "",
    totalRounds: formData.get("totalRounds") ?? "",
    logoUrl: formData.get("logoUrl") ?? "",
    primaryColor: formData.get("primaryColor") ?? "#172C4C",
  });
}

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

  const parsed = parseTournamentForm(formData);

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

export async function updateTournament(
  _state: UpdateTournamentState,
  formData: FormData,
): Promise<UpdateTournamentState> {
  let referee;

  try {
    referee = await requireReferee(["technical"]);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      redirect("/login");
    }

    return { error: "Chỉ trọng tài kỹ thuật được sửa giải." };
  }

  const tournamentId = formData.get("tournamentId");
  if (typeof tournamentId !== "string" || !tournamentId) {
    return { error: "Thiếu thông tin giải đấu." };
  }

  const parsed = parseTournamentForm(formData);
  if (!parsed.success) {
    return {
      error: "Kiểm tra lại thông tin giải đấu.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const values = parsed.data;
  const { error } = await createAdminClient().rpc("uscc_update_tournament", {
    p_tournament_id: tournamentId,
    p_actor: referee.userId,
    p_name: values.name,
    p_organizer: values.organizer || null,
    p_venue: values.venue || null,
    p_start_date: values.startDate || null,
    p_end_date: values.endDate || null,
    p_total_rounds: values.totalRounds,
    p_logo_url: values.logoUrl || null,
    p_primary_color: values.primaryColor,
  });

  if (error) {
    if (error.message.includes("TOTAL_ROUNDS_BELOW_EXISTING_ROUND")) {
      return { error: "Số vòng không được nhỏ hơn vòng đã có cặp đấu." };
    }
    if (error.message.includes("TOURNAMENT_NOT_FOUND")) {
      return { error: "Không tìm thấy giải đấu." };
    }
    return { error: "Không thể cập nhật giải. Dữ liệu chưa được thay đổi." };
  }

  revalidatePath("/tournaments");
  revalidatePath(`/tournaments/${tournamentId}`);
  revalidatePath(`/tournaments/${tournamentId}/projection`);
  return { success: true };
}

export type DeleteTournamentState = {
  success?: boolean;
  error?: string;
};

export async function deleteTournament(
  _state: DeleteTournamentState,
  formData: FormData,
): Promise<DeleteTournamentState> {
  let referee;

  try {
    referee = await requireReferee(["technical"]);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      redirect("/login");
    }

    return { error: "Chỉ trọng tài kỹ thuật được xóa giải đấu." };
  }

  const tournamentId = formData.get("tournamentId");
  if (typeof tournamentId !== "string" || !isValidUuid(tournamentId)) {
    return { error: "Mã giải đấu không hợp lệ." };
  }

  const id = tournamentId.trim();
  const admin = createAdminClient();

  // Try calling the uscc_delete_tournament RPC first
  const { error: rpcError } = await admin.rpc("uscc_delete_tournament", {
    p_tournament_id: id,
    p_actor: referee.userId,
  });

  if (rpcError) {
    const isRpcMissing =
      rpcError.message.includes("Could not find the function") ||
      rpcError.message.includes("schema cache") ||
      rpcError.message.includes("does not exist") ||
      (rpcError as { code?: string }).code === "PGRST202";

    if (isRpcMissing) {
      // 0. Verify tournament exists
      const { data: tourney, error: tourneyError } = await admin
        .from("tournaments")
        .select("id")
        .eq("id", id)
        .maybeSingle();

      if (tourneyError) {
        return { error: `Lỗi truy vấn giải: ${tourneyError.message}` };
      }
      if (!tourney) {
        return { error: "Không tìm thấy giải đấu cần xóa." };
      }

      // 1. Delete matches
      const { error: matchesErr } = await admin
        .from("matches")
        .delete()
        .eq("tournament_id", id);

      if (matchesErr) {
        if (
          matchesErr.message.includes("violates foreign key constraint") ||
          matchesErr.message.includes("APPEND_ONLY_TABLE") ||
          matchesErr.message.includes("result_events")
        ) {
          return {
            error:
              "Không thể xóa giải: Giải đấu đã có biên bản ván đấu được bảo vệ bởi nhật ký kiểm toán. Cần áp dụng migration uscc_delete_tournament.",
          };
        }
        return { error: `Không thể xóa ván đấu: ${matchesErr.message}` };
      }

      // 2. Delete players
      const { error: playersErr } = await admin
        .from("players")
        .delete()
        .eq("tournament_id", id);

      if (playersErr) {
        return { error: `Không thể xóa kỳ thủ: ${playersErr.message}` };
      }

      // 3. Delete import_batches
      const { error: batchesErr } = await admin
        .from("import_batches")
        .delete()
        .eq("tournament_id", id);

      if (batchesErr) {
        return { error: `Không thể xóa lịch sử nhập: ${batchesErr.message}` };
      }

      // 4. Delete tournament
      const { error: tournErr } = await admin
        .from("tournaments")
        .delete()
        .eq("id", id);

      if (tournErr) {
        return { error: `Không thể xóa giải: ${tournErr.message}` };
      }
    } else {
      if (rpcError.message.includes("TOURNAMENT_NOT_FOUND")) {
        return { error: "Không tìm thấy giải đấu cần xóa." };
      }
      if (rpcError.message.includes("TECHNICAL_REFEREE_REQUIRED")) {
        return { error: "Chỉ trọng tài kỹ thuật mới có quyền xóa giải đấu." };
      }
      return { error: `Lỗi khi xóa giải đấu: ${rpcError.message}` };
    }
  }

  revalidatePath("/tournaments");
  revalidatePath("/dashboard");
  return { success: true };
}

