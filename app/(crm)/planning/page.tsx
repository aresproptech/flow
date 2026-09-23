"use client";

import { useEffect, useMemo, useState } from "react";
import { Topbar } from "@/components/crm/topbar";
import { supabase } from "@/lib/supabase";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Lead } from "@/lib/crm-data";
import { parseOpportunityContactMemo } from "@/lib/opportunity-contact-memo";
import { canViewAllLeads, useUser } from "@/lib/hooks/useUser";
import { LeadDetailPanel } from "@/components/crm/lead-detail-panel";

type CrmLeadRow = {
  id: number;
  created_at: string | null;
  fecha: string | null;
  propietario: string | null;
  telefono: string | null;
  domicilio: string | null;
  tasacion: string | null;
  estado: string | null;
  memo: string | null;
  fase_name: string | null;
  source_name: string | null;
  comercial_name: string | null;
  contact_name: string | null;
  cp: number | null;
  provincia: string | null;
  distrito: string | null;
  dominio_desc: string | null;
};

type PlanningItem = {
  id: string;
  planning: string;
  fecha: string;
  hora: string;
  tipo: "Valoración" | "R.G." | "Visita";
  inmueble: string;
  propietario: string;
  telefono: string;
  equipo: string;
  planner: string;
  owner: string;
  lead?: PlanningLead;
};

type PlanningLead = Lead & {
  dominio: string;
};

type ContactPlanningRow = {
  id: number;
  opportunity_id: number;
  fecha: string | null;
  memo: string | null;
  created_at: string | null;
  event_type: string | null;
  effective_at: string | null;
  metadata: unknown;
};

type VisitPlanningRow = {
  id: number;
  opportunity_id: number | null;
  fecha_visita: string | null;
  hora: string | null;
  created_at: string | null;
};

function fmt(d: string) {
  if (!d) return "—";
  const parsed = new Date(d);
  if (isNaN(parsed.getTime())) return d;
  return parsed.toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}

function normalizePhase(raw: string | null | undefined): Lead["phase"] {
  const value = (raw || "").toLowerCase().trim();

  if (value.includes("noticia") || value.includes("identificada")) return "identificada";
  if (value.includes("concertada") || value.includes("cualificada")) return "cualificada";
  if (value.includes("valorada")) return "valorada";
  if (value.includes("encargo")) return "encargo";
  if (value.includes("vendida") || value.includes("vender")) return "encargo";

  return "identificada";
}

function mapCrmLeadToLead(row: CrmLeadRow): PlanningLead {
  const ownerLabel = row.comercial_name?.trim() || "Sin asignar";

  const domicilio = row.domicilio?.trim() || "—";
  const distrito = row.distrito?.trim() || "—";
  const provincia = row.provincia?.trim() || "—";
  const cp = row.cp ? String(row.cp) : "—";

  return {
    id: String(row.id),
    ownerName: row.propietario?.trim() || "—",
    address: domicilio,
    distrito,
    municipio: distrito,
    provincia,
    cp,
    valor: row.tasacion?.trim() || "—",
    phone: row.telefono?.trim() || "—",
    source: row.source_name?.trim() || "Sin origen",
    phase: normalizePhase(row.fase_name),
    status: "activa",
    fechaNoticia: row.fecha || row.created_at || "",
    fechaContacto: "",
    fechaValoracion: row.fecha || row.created_at || "",
    hora: "",
    planner: row.contact_name?.trim() || "—",
    owner: ownerLabel,
    createdAt: row.created_at || "",
    assignedUser: ownerLabel,
    propertyAddress:
      domicilio !== "—"
        ? `${domicilio}, ${distrito !== "—" ? distrito : provincia}`
        : "—",
    notes: row.memo?.trim() || "",
    observaciones: [],
    dominio: row.dominio_desc?.trim() || "—",
  };
}

function startOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getPlanningLabel(dateStr: string, tipo: PlanningItem["tipo"]) {
  if (!dateStr) return `${tipo}s Próximas`;

  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return `${tipo}s Próximas`;

  const today = startOfDay(new Date());
  const target = startOfDay(date);

  if (target < today) return `${tipo}s Anteriores`;
  if (target.getTime() === today.getTime()) return `${tipo}s de Hoy`;

  const weekday = target.toLocaleDateString("es-ES", { weekday: "long" });
  return `${tipo}s del ${weekday}`;
}

export default function PlanningPage() {
  const { userWithRole, loading: userLoading } = useUser();
  const [items, setItems] = useState<PlanningItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedLead, setSelectedLead] = useState<PlanningLead | null>(null);

  useEffect(() => {
    if (userLoading) return;
    const crmUser = userWithRole?.crmUser;
    if (!crmUser) {
      setItems([]);
      setLoading(false);
      return;
    }
    const canSeeAllLeads = canViewAllLeads(crmUser);
    const currentUserName = crmUser.name;

    async function loadPlanning() {
      setLoading(true);

      const [leadsResult, valuationsResult, rgResult, visitsResult] = await Promise.all([
        supabase.from("crm_leads_view").select("*").order("created_at", { ascending: false }),
        supabase
          .from("opportunity_activities")
          .select(
            "id, opportunity_id, fecha, memo, created_at, event_type, effective_at, metadata"
          )
          .eq("event_type", "valuation"),
        supabase
          .from("opportunity_activities")
          .select(
            "id, opportunity_id, fecha, memo, created_at, event_type, effective_at, metadata"
          )
          .eq("event_type", "rg"),
        supabase
          .from("opportunity_buyers")
          .select("id, opportunity_id, fecha_visita, hora, created_at"),
      ]);

      if (leadsResult.error) {
        console.error("Supabase planning leads error:", leadsResult.error);
        setLoading(false);
        return;
      }

      if (valuationsResult.error || rgResult.error || visitsResult.error) {
        console.error("Supabase planning activity error:", {
          valuations: valuationsResult.error,
          rg: rgResult.error,
          visits: visitsResult.error,
        });
        setLoading(false);
        return;
      }

      const leadsMap = new Map<number, PlanningLead>();
      for (const row of leadsResult.data ?? []) {
        if (
          !canSeeAllLeads &&
          row.comercial_name !== currentUserName
        ) {
          continue;
        }
        const lead = mapCrmLeadToLead(row as CrmLeadRow);
        leadsMap.set(Number(lead.id), lead);
      }

      const planningItems: PlanningItem[] = [];

      function addPlanningItem(
        id: string,
        opportunityId: number,
        tipo: PlanningItem["tipo"],
        fecha: string,
        hora: string
      ) {
        const lead = leadsMap.get(opportunityId);
        if (!lead) return;

        planningItems.push({
          id,
          planning: getPlanningLabel(fecha, tipo),
          fecha,
          hora,
          tipo,
          inmueble: lead.address,
          propietario: lead.ownerName,
          telefono: lead.phone,
          equipo: lead.dominio,
          planner: lead.planner || "—",
          owner: lead.owner,
          lead,
        });
      }

      for (const row of (valuationsResult.data ?? []) as ContactPlanningRow[]) {
        const { fields } = parseOpportunityContactMemo(
          row.memo,
          "[VALORACION]",
          row.metadata
        );
        addPlanningItem(
          `valoracion-${row.id}`,
          row.opportunity_id,
          "Valoración",
          row.fecha || row.created_at || "",
          fields.hora || ""
        );
      }

      for (const row of (rgResult.data ?? []) as ContactPlanningRow[]) {
        const { fields } = parseOpportunityContactMemo(
          row.memo,
          "[R.G.]",
          row.metadata
        );
        addPlanningItem(
          `rg-${row.id}`,
          row.opportunity_id,
          "R.G.",
          row.fecha || row.created_at || "",
          fields.hora || ""
        );
      }

      for (const row of (visitsResult.data ?? []) as VisitPlanningRow[]) {
        if (row.opportunity_id === null) continue;
        addPlanningItem(
          `visita-${row.id}`,
          row.opportunity_id,
          "Visita",
          row.fecha_visita || row.created_at || "",
          row.hora || ""
        );
      }

      planningItems.sort((a, b) => {
        const aTime = new Date(a.fecha || 0).getTime();
        const bTime = new Date(b.fecha || 0).getTime();
        return aTime - bTime;
      });

      setItems(planningItems);
      setLoading(false);
    }

    loadPlanning();
  }, [userLoading, userWithRole]);

  const filteredItems = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return items;

    return items.filter((item) =>
      [
        item.planning,
        item.tipo,
        item.inmueble,
        item.propietario,
        item.telefono,
        item.equipo,
        item.planner,
        item.owner,
      ]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [items, searchTerm]);

  return (
    <>
      <Topbar title="Planning" />

      <main className="mt-14 flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-border bg-card px-6 py-2.5">
          <div className="flex items-center gap-4">
            <span className="text-xs text-muted-foreground">
              {filteredItems.length} items en planning
            </span>

            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar en planning..."
                className="h-8 w-[260px] rounded-md border border-border bg-background pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
          </div>
        </div>

        {loading && (
          <div className="shrink-0 border-b border-border bg-muted/40 px-6 py-2 text-xs text-muted-foreground">
            Cargando planning desde Supabase...
          </div>
        )}

        <div className="relative flex-1 overflow-auto">
          <table
            className="w-full border-collapse text-sm"
            style={{ minWidth: 1400 }}
          >
            <thead className="sticky top-0 z-20 bg-card">
              <tr className="border-b border-border bg-card/95 text-left backdrop-blur">
                <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Planning
                </th>
                <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Fecha
                </th>
                <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Hora
                </th>
                <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Tipo
                </th>
                <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Inmueble
                </th>
                <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Propietario
                </th>
                <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Teléfono
                </th>
                <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Equipo
                </th>
                <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Planner
                </th>
                <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Owner
                </th>
              </tr>
            </thead>

            <tbody className="bg-background">
              {filteredItems.map((item, i) => (
                <tr
                  key={item.id}
                  onClick={() => setSelectedLead(item.lead ?? null)}
                  className={cn(
                    "cursor-pointer border-b border-border transition-colors hover:bg-accent/40",
                    i % 2 === 0 ? "bg-card" : "bg-background"
                  )}
                >
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">
                    {item.planning}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">
                    {fmt(item.fecha)}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">
                    {item.hora || "—"}
                  </td>
                  <td className="px-3 py-2.5 text-xs font-medium text-foreground">
                    {item.tipo}
                  </td>
                  <td className="max-w-[260px] truncate px-3 py-2.5 text-xs text-muted-foreground">
                    {item.inmueble}
                  </td>
                  <td className="px-3 py-2.5 font-medium text-foreground">
                    {item.propietario}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">
                    {item.telefono}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">
                    {item.equipo}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">
                    {item.planner}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">
                    {item.owner}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>

      <LeadDetailPanel
        lead={selectedLead}
        onClose={() => setSelectedLead(null)}
        onSaveLead={async () => undefined}
        readOnly
      />
    </>
  );
}
