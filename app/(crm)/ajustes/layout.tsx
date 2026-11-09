import { requireMetricsAccess } from "@/lib/require-metrics-access";

export default async function AjustesLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await requireMetricsAccess();
  return children;
}