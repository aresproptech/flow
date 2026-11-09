import { Topbar } from "@/components/crm/topbar";
import { SettingsPanel } from "@/components/crm/settings-panel";
import { isCrmAdmin } from "@/lib/crm-role";
import { canViewCommercialMetrics } from "@/lib/metrics-access";
import { requireMetricsAccess } from "@/lib/require-metrics-access";

export default async function AjustesPage() {
  const user = await requireMetricsAccess();
  return (
    <>
      <Topbar title="Admin" />
      <SettingsPanel
        showAdminTools={isCrmAdmin(user.rol) && user.enabled !== false}
        showCommercialMetrics={canViewCommercialMetrics(user)}
      />
    </>
  );
}