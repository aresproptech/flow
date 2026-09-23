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

function normalizeStatus(raw: string | null | undefined): Lead["status"] {
  const value = (raw || "").toLowerCase().trim();

  if (
    !value ||
    value === "activa" ||
    value === "activo" ||
    value === "identificar" ||
    value === "identificada" ||
    value === "cualificada" ||
    value === "seguimiento"
  ) return "activa";
  if (value === "caliente") return "caliente";
  if (value === "desestimada") return "desestimada";

  return "activa";
}

function mapCrmLeadToLead(row: CrmLeadRow): Lead {
  const ownerLabel =
    row.comercial_name?.trim() ||
    row.contact_name?.trim() ||
    "Sin asignar";

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
    status: normalizeStatus(row.estado),
    fechaNoticia: row.fecha || row.created_at || "",
    fechaContacto: "",
    fechaValoracion: "",
    hora: "",
    planner: row.dominio_desc?.trim() || "—",
    owner: ownerLabel,
    createdAt: row.created_at || "",
    assignedUser: ownerLabel,
    propertyAddress:
      domicilio !== "—"
        ? `${domicilio}, ${distrito !== "—" ? distrito : provincia}`
        : "—",
    notes: row.memo?.trim() || "",
    observaciones: [],
  };
}

type OpportunityContactRow = {
  id: number;
  opportunity_id: number;
  fecha: string | null;
  memo: string | null;
  created_at: string | null;
  event_type: string | null;
  effective_at: string | null;
  metadata: unknown;
};

type RgEntry = {
  id: string;
  leadId: string;
  fecha: string;
  hora: string;
  medio: string;
  resultado: string;
  ownerName: string;
  address: string;
  phone: string;
  planner: string;
  owner: string;
  lead?: Lead;
};

function parseRgMemo(row: OpportunityContactRow) {
  const { fields } = parseOpportunityContactMemo(
    row.memo,
    "[R.G.]",
    row.metadata
  );

  return {
    medio: fields.medio && fields.medio !== "—" ? fields.medio : "",
    resultado: fields.resultado && fields.resultado !== "—" ? fields.resultado : "",
    hora: fields.hora || "",
  };
}

function startOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getPlanningLabel(dateStr: string) {
  if (!dateStr) return "R.G. Próximas";

  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return "R.G. Próximas";

  const today = startOfDay(new Date());
  const target = startOfDay(date);

  if (target < today) return "R.G. Anteriores";
  if (target.getTime() === today.getTime()) return "R.G. de Hoy";

  const weekday = target.toLocaleDateString("es-ES", { weekday: "long" });
  return `R.G. del ${weekday}`;
}

export default function RGPage() {
  const { userWithRole, loading: userLoading } = useUser();
  const [items, setItems] = useState<RgEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);

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

    async function loadRG() {
      setLoading(true);

      const [contactsResult, leadsResult] = await Promise.all([
        supabase
          .from("opportunity_activities")
          .select(
            "id, opportunity_id, fecha, memo, created_at, event_type, effective_at, metadata"
          )
          .eq("event_type", "rg")
          .order("fecha", { ascending: false }),
        supabase.from("crm_leads_view").select("*").order("created_at", { ascending: false }),
      ]);

      if (contactsResult.error) {
        console.error("Supabase RG error:", contactsResult.error);
        setLoading(false);
        return;
      }

      if (leadsResult.error) {
        console.error("Supabase leads error:", leadsResult.error);
        setLoading(false);
        return;
      }

      const contactRows = (contactsResult.data ?? []) as OpportunityContactRow[];

      const leadsMap = new Map<number, Lead>();
      for (const row of leadsResult.data ?? []) {
        if (
          !canSeeAllLeads &&
          row.comercial_name !== currentUserName
        ) {
          continue;
        }
        const mapped = mapCrmLeadToLead(row as CrmLeadRow);
        leadsMap.set(Number(mapped.id), mapped);
      }

      const entries: RgEntry[] = contactRows.map((row) => {
        const lead = leadsMap.get(row.opportunity_id);
        const { medio, hora, resultado } = parseRgMemo(row);

        return {
          id: String(row.id),
          leadId: String(row.opportunity_id),
          fecha: row.fecha || row.created_at || "",
          hora,
          medio,
          resultado,
          ownerName: lead?.ownerName || "—",
          address: lead?.address || "—",
          phone: lead?.phone || "—",
          planner: lead?.planner || "—",
          owner: lead?.owner || "—",
          lead,
        };
      });

      const leadIdsWithRealEntries = new Set(contactRows.map((row) => row.opportunity_id));

      const legacyEntries: RgEntry[] = [];
      for (const lead of leadsMap.values()) {
        const leadIdNum = Number(lead.id);
        const isPendingGestion = lead.phase === "cualificada" || lead.phase === "encargo";

        if (
          !isPendingGestion ||
          leadIdsWithRealEntries.has(leadIdNum) ||
          !lead.fechaNoticia
        ) {
          continue;
        }

        legacyEntries.push({
          id: `legacy-${lead.id}`,
          leadId: lead.id,
          fecha: lead.fechaNoticia,
          hora: "",
          medio: "Teléfono",
          resultado:
            lead.status === "caliente"
              ? "Positiva"
              : lead.status === "desestimada"
              ? "Cancelada"
              : "Seguimiento",
          ownerName: lead.ownerName,
          address: lead.address,
          phone: lead.phone,
          planner: lead.planner || "—",
          owner: lead.owner,
          lead,
        });
      }

      setItems([...entries, ...legacyEntries]);
      setLoading(false);
    }

    loadRG();
  }, [userLoading, userWithRole]);

  const filteredItems = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return items;

    return items.filter((item) =>
      [
        item.ownerName,
        item.address,
        item.phone,
        item.owner,
        item.planner,
        item.medio,
        item.resultado,
        getPlanningLabel(item.fecha),
      ]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [items, searchTerm]);

  return (
    <>
      <Topbar title="R.G." />

      <main className="mt-14 flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex shrink-0 flex-col gap-2 border-b border-border bg-card px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-6 sm:py-2.5">
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:gap-4">
            <span className="text-xs text-muted-foreground sm:whitespace-nowrap">
              {filteredItems.length} reuniones de gestión en total
            </span>

            <div className="relative w-full sm:w-auto">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar R.G...."
                className="h-10 w-full rounded-md border border-border bg-background pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground sm:h-8 sm:w-[260px]"
              />
            </div>
          </div>
        </div>

        {loading && (
          <div className="shrink-0 border-b border-border bg-muted/40 px-6 py-2 text-xs text-muted-foreground">
            Cargando R.G. desde Supabase...
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
                  F.R.G.
                </th>
                <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Hora
                </th>
                <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Equipo
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
                  Medio
                </th>
                <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Resultado
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
                    "cursor-pointer border-b border-border transition-colors hover:bg-accent/60",
                    i % 2 === 0 ? "bg-card" : "bg-background"
                  )}
                >
                  <td className="px-3 py-2.5 text-sm text-muted-foreground">
                    {getPlanningLabel(item.fecha)}
                  </td>
                  <td className="px-3 py-2.5 text-sm text-muted-foreground">
                    {fmt(item.fecha)}
                  </td>
                  <td className="px-3 py-2.5 text-sm text-muted-foreground">
                    {item.hora || "—"}
                  </td>
                  <td className="px-3 py-2.5 text-sm text-muted-foreground">
                    {item.planner || "—"}
                  </td>
                  <td className="max-w-[260px] truncate px-3 py-2.5 text-sm text-muted-foreground">
                    {item.address}
                  </td>
                  <td className="px-3 py-2.5 font-bold text-foreground">
                    {item.ownerName}
                  </td>
                  <td className="px-3 py-2.5 text-sm text-muted-foreground">
                    {item.phone}
                  </td>
                  <td className="px-3 py-2.5 text-sm text-muted-foreground">
                    {item.medio || "—"}
                  </td>
                  <td className="px-3 py-2.5 text-sm text-muted-foreground">
                    {item.resultado || "—"}
                  </td>
                  <td className="px-3 py-2.5 text-sm text-muted-foreground">
                    {item.planner || "—"}
                  </td>
                  <td className="px-3 py-2.5 text-sm text-muted-foreground">
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
