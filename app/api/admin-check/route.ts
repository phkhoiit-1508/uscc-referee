
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  const headers = {
    "Cache-Control": "private, no-store",
  };

  if (error || !user) {
    return NextResponse.json(
      { error: "Chưa đăng nhập" },
      { status: 401, headers }
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "technical") {
    return NextResponse.json(
      { error: "Không có quyền truy cập" },
      { status: 403, headers }
    );
  }

  return NextResponse.json(
    {
      success: true,
      message: "Bạn có quyền trọng tài kỹ thuật",
    },
    { headers }
  );
}
