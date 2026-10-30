import "server-only";
import { createClient } from "@/lib/supabase/server";

type Role = "technical" | "recorder";

export async function requireReferee(
  allowedRoles: Role[]
) {
  const supabase = await createClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new Error("UNAUTHORIZED");
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (
    profileError ||
    !profile ||
    !allowedRoles.includes(profile.role as Role)
  ) {
    throw new Error("FORBIDDEN");
  }

  return {
    userId: user.id,
    role: profile.role as Role,
  };
}