"use client";

import { useEffect, useState } from "react";
import { Menu } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { Sidebar } from "@/components/crm/sidebar";
import { canManageVisits, useUser } from "@/lib/hooks/useUser";

export default function CRMLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const { userWithRole, loading } = useUser();
  const visitOnly = Boolean(
    userWithRole?.crmUser && canManageVisits(userWithRole.crmUser)
  );

  useEffect(() => {
    if (!loading && visitOnly && pathname !== "/visitas") {
      router.replace("/visitas");
    }
  }, [loading, pathname, router, visitOnly]);

  if (!loading && visitOnly && pathname !== "/visitas") {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        Abriendo Visitas...
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <button
        type="button"
        onClick={() => setSidebarOpen(true)}
        aria-label="Abrir menú"
        className="fixed left-3 top-3 z-30 flex h-8 w-8 items-center justify-center rounded-md border border-primary bg-primary text-primary-foreground shadow-sm md:hidden"
      >
        <Menu className="h-4 w-4" />
      </button>

      <div className="flex flex-col flex-1 md:ml-48 min-w-0 overflow-hidden">
        {children}
      </div>
    </div>
  );
}
