import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { normalizeCrmRole } from "@/lib/crm-role";
import { canViewCommercialMetrics, canViewMetrics, type MetricsView } from "@/lib/metrics-access";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import type { CrmUser } from "@/lib/supabase";

export const requireMetricsAccess = cache(async (view: MetricsView = "general") => {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) redirect("/login");

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, auth_id, name, rol, enabled, can_manage_visits")
    .eq("auth_id", user.id)
    .maybeSingle<CrmUser>();

  if (error) throw new Error("No se pudo comprobar el acceso a métricas.", { cause: error });
  if (!profile) redirect("/leads");
  if (normalizeCrmRole(profile.rol) === "comercial" && profile.can_manage_visits) {
    redirect("/visitas");
  }
  if (!canViewMetrics(profile)) redirect("/leads");
  if (view === "commercials" && !canViewCommercialMetrics(profile)) {
    redirect("/ajustes");
  }

  return profile;
});
