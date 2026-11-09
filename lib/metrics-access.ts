import { normalizeCrmRole } from "@/lib/crm-role";
import type { CrmUser } from "@/lib/supabase";

export type MetricsView = "general" | "commercials";

export function canViewMetrics(user: CrmUser): boolean {
  const role = normalizeCrmRole(user.rol);
  return (
    ["admin", "coordinador", "comercial"].includes(role) &&
    !(role === "comercial" && user.can_manage_visits === true)
  );
}

export function canViewCommercialMetrics(user: CrmUser): boolean {
  return canViewMetrics(user) && normalizeCrmRole(user.rol) !== "comercial";
}
