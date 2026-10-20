import { requireAdmin } from "@/lib/require-admin";

export default async function UsuariosLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await requireAdmin();
  return children;
}