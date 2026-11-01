export type TournamentInput = {
  name: string;
  organizer?: string | null;
  venue?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  totalRounds: number;
  logoUrl?: string | null;
  primaryColor?: string | null;
  highestExistingRound?: number | null;
};

export type TournamentValidationResult =
  | {
      valid: true;
      data: {
        name: string;
        organizer: string | null;
        venue: string | null;
        startDate: string | null;
        endDate: string | null;
        totalRounds: number;
        logoUrl: string | null;
        primaryColor: string;
      };
    }
  | {
      valid: false;
      errorCode:
        | "TOURNAMENT_NAME_REQUIRED"
        | "TOURNAMENT_NAME_TOO_LONG"
        | "TOTAL_ROUNDS_OUT_OF_RANGE"
        | "TOTAL_ROUNDS_BELOW_EXISTING_ROUND"
        | "INVALID_TOURNAMENT_DATES"
        | "INVALID_LOGO_URL"
        | "INVALID_PRIMARY_COLOR";
      errorMessage: string;
    };

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const HEX_COLOR_REGEX = /^#[0-9A-Fa-f]{6}$/;

export function isSafeHttpUrl(rawUrl: string): boolean {
  const trimmed = rawUrl.trim();
  if (!trimmed || trimmed.length > 2048) return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function validateTournamentInput(
  input: TournamentInput,
): TournamentValidationResult {
  const name = (input.name ?? "").trim();
  if (!name) {
    return {
      valid: false,
      errorCode: "TOURNAMENT_NAME_REQUIRED",
      errorMessage: "Tên giải là bắt buộc.",
    };
  }
  if (name.length > 200) {
    return {
      valid: false,
      errorCode: "TOURNAMENT_NAME_TOO_LONG",
      errorMessage: "Tên giải không được vượt quá 200 ký tự.",
    };
  }

  const totalRounds = Number(input.totalRounds);
  if (!Number.isInteger(totalRounds) || totalRounds < 1 || totalRounds > 30) {
    return {
      valid: false,
      errorCode: "TOTAL_ROUNDS_OUT_OF_RANGE",
      errorMessage: "Tổng số vòng phải là số nguyên từ 1 đến 30.",
    };
  }

  if (
    typeof input.highestExistingRound === "number" &&
    totalRounds < input.highestExistingRound
  ) {
    return {
      valid: false,
      errorCode: "TOTAL_ROUNDS_BELOW_EXISTING_ROUND",
      errorMessage: `Tổng số vòng không được nhỏ hơn vòng đã có dữ liệu (Vòng ${input.highestExistingRound}).`,
    };
  }

  const startDate = (input.startDate ?? "").trim() || null;
  const endDate = (input.endDate ?? "").trim() || null;

  if (startDate && !ISO_DATE_REGEX.test(startDate)) {
    return {
      valid: false,
      errorCode: "INVALID_TOURNAMENT_DATES",
      errorMessage: "Ngày bắt đầu không hợp lệ.",
    };
  }
  if (endDate && !ISO_DATE_REGEX.test(endDate)) {
    return {
      valid: false,
      errorCode: "INVALID_TOURNAMENT_DATES",
      errorMessage: "Ngày kết thúc không hợp lệ.",
    };
  }
  if (startDate && endDate && endDate < startDate) {
    return {
      valid: false,
      errorCode: "INVALID_TOURNAMENT_DATES",
      errorMessage: "Ngày kết thúc không được trước ngày bắt đầu.",
    };
  }

  const logoUrl = (input.logoUrl ?? "").trim() || null;
  if (logoUrl && !isSafeHttpUrl(logoUrl)) {
    return {
      valid: false,
      errorCode: "INVALID_LOGO_URL",
      errorMessage: "Logo URL phải bắt đầu bằng http:// hoặc https://.",
    };
  }

  const primaryColor = (input.primaryColor ?? "").trim() || "#172C4C";
  if (!HEX_COLOR_REGEX.test(primaryColor)) {
    return {
      valid: false,
      errorCode: "INVALID_PRIMARY_COLOR",
      errorMessage: "Màu chủ đạo phải có dạng #RRGGBB.",
    };
  }

  const organizer = (input.organizer ?? "").trim() || null;
  const venue = (input.venue ?? "").trim() || null;

  return {
    valid: true,
    data: {
      name,
      organizer,
      venue,
      startDate,
      endDate,
      totalRounds,
      logoUrl,
      primaryColor,
    },
  };
}

export const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidUuid(id: string): boolean {
  if (typeof id !== "string") return false;
  return UUID_REGEX.test(id.trim());
}


