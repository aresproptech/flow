import "server-only";

import { redirect } from "next/navigation";
import { hasActiveAdminProfile } from "@/lib/admin-profile";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export async function requireAdmin() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) redirect("/login");

  if (!(await hasActiveAdminProfile(supabase, user.id))) {
    redirect("/dashboard");
  }
}