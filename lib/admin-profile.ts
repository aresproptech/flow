import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { isCrmAdmin } from "@/lib/crm-role";

export async function hasActiveAdminProfile(
  supabase: SupabaseClient,
  authUserId: string
) {
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, rol, enabled")
    .eq("auth_id", authUserId)
    .maybeSingle();

  if (error || !profile || profile.enabled === false) return false;
  return isCrmAdmin(profile.rol);
}