"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Users,
  UserCog,
  Settings,
  FileText,
  ClipboardCheck,
  Handshake,
  Eye,
  CalendarDays,
} from "lucide-react";
import { canManageVisits, useUser } from "@/lib/hooks/useUser";
import type { CrmUser } from "@/lib/supabase";

type NavItem = {
  label: string;
  href: string;
  icon: React.ElementType;
  roles: CrmUser["rol"][];
};

const navItems: NavItem[] = [
  {
    label: "Métricas",
    href: "/dashboard",
    icon: LayoutDashboard,
    roles: ["Admin", "Coordinador", "Comercial"],
  },
  {
    label: "Oportunidades",
    href: "/leads",
    icon: Users,
    roles: ["Admin", "Coordinador", "Comercial"],
  },
  {
    label: "Valoraciones",
    href: "/valoraciones",
    icon: ClipboardCheck,
    roles: ["Admin", "Coordinador", "Comercial"],
  },
  {
    label: "Encargos",
    href: "/encargos",
    icon: FileText,
    roles: ["Admin", "Coordinador", "Comercial"],
  },
  {
    label: "R.G.",
    href: "/rg",
    icon: Handshake,
    roles: ["Admin", "Coordinador", "Comercial"],
  },
  {
    label: "Visitas",
    href: "/visitas",
    icon: Eye,
    roles: ["Admin", "Coordinador", "Comercial"],
  },
  {
    label: "Planning",
    href: "/planning",
    icon: CalendarDays,
    roles: ["Admin", "Coordinador", "Comercial"],
  },
  {
    label: "Usuarios",
    href: "/usuarios",
    icon: UserCog,
    roles: ["Admin"],
  },
  {
    label: "Ajustes",
    href: "/ajustes",
    icon: Settings,
    roles: ["Admin"],
  },
];

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export function Sidebar({ isOpen = false, onClose }: SidebarProps) {
  const pathname = usePathname();
  const { userWithRole } = useUser();

  const rol = userWithRole?.crmUser.rol;
  const nombre = userWithRole?.crmUser.name ?? "Usuario";

  const initials = nombre
    .split(" ")
    .slice(0, 2)
    .map((n: string) => n[0])
    .join("")
    .toUpperCase();

  const visibleItems = userWithRole?.crmUser && canManageVisits(userWithRole.crmUser)
    ? navItems.filter((item) => item.href === "/visitas")
    : rol
      ? navItems.filter((item) => item.roles.includes(rol))
      : [];

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-48 flex-col bg-sidebar border-r border-sidebar-border transition-transform duration-200 ease-in-out md:translate-x-0",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex h-14 shrink-0 items-center bg-primary px-5 border-b border-sidebar-border">
          <Image
            src="/ares-logo.png"
            alt="Ares Proptech"
            width={1376}
            height={534}
            className="h-12 w-auto"
            priority
          />
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
          {visibleItems.map(({ label, href, icon: Icon }) => {
            const isActive =
              pathname === href || pathname.startsWith(href + "/");
            return (
              <Link
                key={href}
                href={href}
                onClick={onClose}
                className={cn(
                  "group flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
                )}
              >
                <Icon
                  className={cn(
                    "h-4 w-4 shrink-0 transition-colors",
                    isActive
                      ? "text-primary"
                      : "text-sidebar-foreground/50 group-hover:text-sidebar-foreground/80"
                  )}
                />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="shrink-0 border-t border-sidebar-border px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="h-7 w-7 rounded-full bg-primary/20 flex items-center justify-center">
              <span className="text-xs font-semibold text-primary">
                {initials}
              </span>
            </div>
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-sidebar-foreground">
                {nombre}
              </p>
              <p className="truncate text-[11px] text-sidebar-foreground/50">
                {rol ?? "—"}
              </p>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
