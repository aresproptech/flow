import { MetricsDashboard } from "@/components/dashboard/metrics-dashboard";
import { requireMetricsAccess } from "@/lib/require-metrics-access";

export default async function MetricasComercialesPage() {
  await requireMetricsAccess("commercials");
  return <MetricsDashboard view="commercials" />;
}
