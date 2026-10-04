"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Topbar } from "@/components/crm/topbar";
import { ArrowDown, ArrowDownUp, ArrowUp, Loader2, Search, UserCog, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Empty,
  EmptyContent,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import {
  InviteUserModal,
  type UserRole,
  type UserStatus,
} from "@/components/crm/invite-user-modal";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

type ProfileRow = {
  id: number;
  name: string | null;
  rol: string | null;
  enabled: boolean | null;
  auth_id: string | null;
  created_at: string;
  can_manage_visits: boolean;
};

type DisplayStatus = UserStatus | "Pendiente";
type ProfileSortColumn = "name" | "role" | "status" | "auth";

const PROFILE_COLUMNS =
  "id, name, rol, enabled, auth_id, created_at, can_manage_visits";

function initials(name: string | null) {
  const value = name?.trim() || "Usuario";
  return value
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function profileStatus(profile: ProfileRow): DisplayStatus {
  if (profile.enabled === false) return "Inactivo";
  return profile.auth_id ? "Activo" : "Pendiente";
}

const STATUS_BADGE: Record<DisplayStatus, { className: string }> = {
  Pendiente: { className: "bg-amber-50 text-amber-700 border-amber-200" },
  Activo: { className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  Inactivo: { className: "bg-muted text-muted-foreground border-border" },
};

const ROLE_BADGE: Record<UserRole, { className: string }> = {
  Admin: { className: "bg-primary/10 text-primary border-primary/20" },
  Coordinador: { className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  Comercial: { className: "bg-blue-50 text-blue-700 border-blue-200" },
  Partner: { className: "bg-violet-50 text-violet-700 border-violet-200" },
};

const ROLE_FILTERS = ["Admin", "Coordinador", "Comercial", "Partner", "Sin rol"];
const STATUS_FILTERS: DisplayStatus[] = ["Activo", "Pendiente", "Inactivo"];

function roleBadgeClass(role: string | null) {
  if (role && role in ROLE_BADGE) {
    return ROLE_BADGE[role as UserRole].className;
  }
  return "bg-muted text-muted-foreground border-border";
}

export default function UsuariosPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [nameFilter, setNameFilter] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [authFilter, setAuthFilter] = useState("all");
  const [sortColumn, setSortColumn] = useState<ProfileSortColumn>("name");
  const [sortAscending, setSortAscending] = useState(true);

  const loadProfiles = useCallback(async () => {
    setLoading(true);
    setLoadError(null);

    const { data, error } = await supabase
      .from("profiles")
      .select(PROFILE_COLUMNS)
      .order("name", { ascending: true });

    if (error) {
      setLoadError("No se pudieron cargar los perfiles de Supabase.");
      setProfiles([]);
    } else {
      setProfiles((data ?? []) as ProfileRow[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadProfiles();
  }, [loadProfiles]);

  const existingNames = useMemo(
    () => profiles.flatMap((profile) => (profile.name ? [profile.name] : [])),
    [profiles]
  );

  const visibleProfiles = useMemo(() => {
    const normalizedName = nameFilter.trim().toLocaleLowerCase("es");
    return profiles
      .filter((profile) => {
        if (normalizedName && !(profile.name || "").toLocaleLowerCase("es").includes(normalizedName)) {
          return false;
        }
        if (roleFilter !== "all" && (profile.rol || "Sin rol") !== roleFilter) return false;
        if (statusFilter !== "all" && profileStatus(profile) !== statusFilter) return false;
        if (authFilter !== "all" && (profile.auth_id ? "linked" : "unlinked") !== authFilter) return false;
        return true;
      })
      .sort((left, right) => {
        const sortValue = (profile: ProfileRow) => {
          switch (sortColumn) {
            case "role": return profile.rol || "Sin rol";
            case "status": return profileStatus(profile);
            case "auth": return profile.auth_id ? "Vinculado" : "Sin vincular";
            default: return profile.name || "Sin nombre";
          }
        };
        const comparison = sortValue(left).localeCompare(sortValue(right), "es", {
          sensitivity: "base",
          numeric: true,
        });
        return sortAscending ? comparison : -comparison;
      });
  }, [profiles, nameFilter, roleFilter, statusFilter, authFilter, sortColumn, sortAscending]);

  function toggleSort(column: ProfileSortColumn) {
    if (sortColumn === column) {
      setSortAscending((ascending) => !ascending);
    } else {
      setSortColumn(column);
      setSortAscending(true);
    }
  }

  return (
    <>
      <Topbar title="Usuarios" />
      <main className="mt-14 flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-border bg-card px-6 py-2.5">
          <span className="text-xs text-muted-foreground">
            Perfiles, roles y vinculación con Supabase Auth
          </span>
          <Button
            size="sm"
            className="h-7 gap-1.5 text-xs font-semibold"
            onClick={() => setModalOpen(true)}
          >
            <UserPlus className="h-3.5 w-3.5" />
            Crear perfil
          </Button>
        </div>

        {loadError && (
          <div className="flex items-center justify-between gap-4 border-b border-destructive/20 bg-destructive/5 px-6 py-2 text-xs text-destructive">
            <span>{loadError}</span>
            <Button variant="outline" size="sm" onClick={() => void loadProfiles()}>
              Reintentar
            </Button>
          </div>
        )}

        <div className="flex shrink-0 flex-col gap-2 border-b border-border bg-card px-4 py-3 sm:flex-row sm:items-center sm:gap-3 sm:px-6 sm:py-2.5">
          <div className="relative w-full sm:w-[260px] sm:shrink-0">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label="Filtrar por usuario"
              value={nameFilter}
              onChange={(event) => setNameFilter(event.target.value)}
              placeholder="Buscar usuario"
              className="h-10 pl-9 text-sm sm:h-8"
            />
          </div>
          <select
            aria-label="Filtrar por rol"
            value={roleFilter}
            onChange={(event) => setRoleFilter(event.target.value)}
            className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm font-medium text-foreground outline-none sm:h-8 sm:w-[190px]"
          >
            <option value="all">Rol (Todos)</option>
            {ROLE_FILTERS.map((role) => <option key={role} value={role}>{role}</option>)}
          </select>
          <select
            aria-label="Filtrar por estado"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm font-medium text-foreground outline-none sm:h-8 sm:w-[180px]"
          >
            <option value="all">Estado (Todos)</option>
            {STATUS_FILTERS.map((status) => <option key={status} value={status}>{status}</option>)}
          </select>
          <select
            aria-label="Filtrar por acceso Auth"
            value={authFilter}
            onChange={(event) => setAuthFilter(event.target.value)}
            className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm font-medium text-foreground outline-none sm:h-8 sm:w-[200px]"
          >
            <option value="all">Acceso Auth (Todos)</option>
            <option value="linked">Vinculado</option>
            <option value="unlinked">Sin vincular</option>
          </select>
        </div>

        {loading ? (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Cargando perfiles…
          </div>
        ) : profiles.length === 0 ? (
          <div className="flex flex-1 items-center justify-center">
            <Empty>
              <EmptyContent>
                <EmptyHeader>
                  <EmptyMedia>
                    <UserCog className="h-8 w-8 text-muted-foreground/40" />
                  </EmptyMedia>
                  <EmptyTitle>Sin perfiles</EmptyTitle>
                  <EmptyDescription>
                    Crea el primer perfil CRM para empezar a gestionar el equipo.
                  </EmptyDescription>
                </EmptyHeader>
              </EmptyContent>
            </Empty>
          </div>
        ) : (
          <div className="flex-1 overflow-auto">
            <table className="w-full min-w-[760px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left">
                  {([
                    ["name", "Usuario"],
                    ["role", "Rol"],
                    ["status", "Estado"],
                    ["auth", "Acceso Auth"],
                  ] as const).map(([column, label]) => (
                    <th
                      key={column}
                      aria-sort={sortColumn === column ? (sortAscending ? "ascending" : "descending") : "none"}
                      className="px-4 py-2.5 text-xs font-semibold text-muted-foreground"
                    >
                      <button
                        type="button"
                        onClick={() => toggleSort(column)}
                        className="inline-flex items-center gap-1.5 rounded-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {label}
                        {sortColumn !== column ? (
                          <ArrowDownUp className="h-3.5 w-3.5 opacity-50" />
                        ) : sortAscending ? (
                          <ArrowUp className="h-3.5 w-3.5" />
                        ) : (
                          <ArrowDown className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleProfiles.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-sm text-muted-foreground">
                      <span>No hay perfiles que coincidan con esos filtros.</span>
                      <button
                        type="button"
                        onClick={() => {
                          setNameFilter("");
                          setRoleFilter("all");
                          setStatusFilter("all");
                          setAuthFilter("all");
                        }}
                        className="ml-2 font-medium text-primary hover:underline"
                      >
                        Limpiar filtros
                      </button>
                    </td>
                  </tr>
                ) : visibleProfiles.map((profile, index) => {
                  const status = profileStatus(profile);
                  return (
                    <tr
                      key={profile.id}
                      className={cn(
                        "border-b border-border transition-colors hover:bg-accent/60",
                        index % 2 === 0 ? "bg-card" : "bg-background"
                      )}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold uppercase text-primary">
                            {initials(profile.name)}
                          </span>
                          <span className="text-sm font-medium leading-tight text-foreground">
                            {profile.name || "Sin nombre"}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
                            roleBadgeClass(profile.rol)
                          )}
                        >
                          {profile.rol || "Sin rol"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
                            STATUS_BADGE[status].className
                          )}
                        >
                          {status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {profile.auth_id ? "Vinculado" : "Sin vincular"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>

      <InviteUserModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        existingNames={existingNames}
        onSubmit={async (data) => {
          const name = `${data.nombre} ${data.apellido}`.replace(/\s+/g, " ").trim();
          const { data: created, error } = await supabase
            .from("profiles")
            .insert({
              name,
              rol: data.rol,
              enabled: data.estado === "Activo",
              auth_id: null,
              can_manage_visits: false,
            })
            .select(PROFILE_COLUMNS)
            .single();

          if (error) {
            if (error.code === "23505") {
              return "Ya existe un perfil con ese nombre.";
            }
            return "No se pudo guardar el perfil en Supabase.";
          }

          setProfiles((previous) =>
            [...previous, created as ProfileRow].sort((left, right) =>
              (left.name ?? "").localeCompare(right.name ?? "", "es")
            )
          );
          return null;
        }}
      />
    </>
  );
}
