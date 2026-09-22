"use client";

import { useEffect, useMemo, useState } from "react";
import { Topbar } from "@/components/crm/topbar";
import { supabase } from "@/lib/supabase";
import { Search, Circle } from "lucide-react";
import { cn } from "@/lib/utils";
import { PHASE_LABELS, type Lead } from "@/lib/crm-data";
import { parseOpportunityContactMemo } from "@/lib/opportunity-contact-memo";
import { canViewAllLeads, useUser } from "@/lib/hooks/useUser";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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
  source_id: number | null;
  comercial_name: string | null;
  contact_name: string | null;
  cp: number | null;
  provincia: string | null;
  distrito: string | null;
  dominio_desc: string | null;
  hora: string | null;
  medio: string | null;
  en_venta: string | null;
  fecha_contacto: string | null;
  fecha_valoracion: string | null;
};

type ValoracionLead = Lead & {
  dominio?: string | null;
};

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

type ValoracionEntry = {
  id: string;
  leadId: string;
  fecha: string;
  registeredAt: string;
  hora: string;
  medio: string;
  createdBy: string;
  notes: string;
  ownerName: string;
  address: string;
  district: string;
  province: string;
  postalCode: string;
  valuationValue: string;
  phone: string;
  source: string;
  dominio: string;
  phase: Lead["phase"];
  planner: string;
  owner: string;
};

function parseValuationMemo(row: OpportunityContactRow) {
  const { author, fields, memo: notes } = parseOpportunityContactMemo(
    row.memo,
    "[VALORACION]",
    row.metadata
  );
  const medio = fields.medio && fields.medio !== "—" ? fields.medio : "";

  return { medio, hora: fields.hora || "", createdBy: author, notes };
}

const STATUS_CONFIG: Record<string, { label: string; dot: string }> = {
  activa: { label: "Activa", dot: "bg-emerald-500" },
  caliente: { label: "Caliente", dot: "bg-orange-500" },
  desestimada: { label: "Desestimada", dot: "bg-muted-foreground" },
};

const PHASE_BADGE_STYLES: Record<
  string,
  { backgroundColor: string; color: string; borderColor: string }
> = {
  identificada: {
    backgroundColor: "#D4EDBC",
    color: "#288158",
    borderColor: "#B7D99C",
  },
  cualificada: {
    backgroundColor: "#94EC89",
    color: "#14532D",
    borderColor: "#6FD864",
  },
  valorada: {
    backgroundColor: "#14C02C",
    color: "#FFFFFF",
    borderColor: "#14C02C",
  },
  encargo: {
    backgroundColor: "#109671",
    color: "#FFFFFF",
    borderColor: "#109671",
  },
};

function getPhaseBadgeStyle(phase: string | null | undefined) {
  return (
    PHASE_BADGE_STYLES[phase || "identificada"] ?? {
      backgroundColor: "#F1F5F9",
      color: "#475569",
      borderColor: "#CBD5E1",
    }
  );
}

const PLANNING_CONFIG: Record<
  "previas" | "hoy" | "proximas",
  { label: string; className: string }
> = {
  previas: {
    label: "Previas",
    className: "bg-slate-100 text-slate-700 border-slate-200",
  },
  hoy: {
    label: "Hoy",
    className: "bg-blue-50 text-blue-700 border-blue-200",
  },
  proximas: {
    label: "Próximas",
    className: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
};

const SOURCE_BADGE_STYLES: Record<
  string,
  { backgroundColor: string; color: string; borderColor: string }
> = {
  idealista: {
    backgroundColor: "#E5E7EB",
    color: "#111827",
    borderColor: "#D1D5DB",
  },
  papelito: {
    backgroundColor: "#E5E7EB",
    color: "#111827",
    borderColor: "#D1D5DB",
  },
  referido: {
    backgroundColor: "#E5E7EB",
    color: "#111827",
    borderColor: "#D1D5DB",
  },
  personal: {
    backgroundColor: "#E5E7EB",
    color: "#111827",
    borderColor: "#D1D5DB",
  },
  "tasar-online": {
    backgroundColor: "#E6CFF2",
    color: "#6F3FA0",
    borderColor: "#D7B8EA",
  },
  tasaronline: {
    backgroundColor: "#E6CFF2",
    color: "#6F3FA0",
    borderColor: "#D7B8EA",
  },
  tasatucasa: {
    backgroundColor: "#FECE15",
    color: "#111827",
    borderColor: "#EAB308",
  },
  "tasar-bue": {
    backgroundColor: "#0B5CAB",
    color: "#FFFFFF",
    borderColor: "#0B5CAB",
  },
  "venta-online": {
    backgroundColor: "#C00000",
    color: "#FFFFFF",
    borderColor: "#C00000",
  },
  "venta-alquilada": {
    backgroundColor: "#7030A0",
    color: "#FFFFFF",
    borderColor: "#7030A0",
  },
  visita: {
    backgroundColor: "#E5E7EB",
    color: "#111827",
    borderColor: "#D1D5DB",
  },
  zona: {
    backgroundColor: "#E5E7EB",
    color: "#111827",
    borderColor: "#D1D5DB",
  },
  oficina: {
    backgroundColor: "#E5E7EB",
    color: "#111827",
    borderColor: "#D1D5DB",
  },
  portero: {
    backgroundColor: "#E5E7EB",
    color: "#111827",
    borderColor: "#D1D5DB",
  },
};

const MEDIO_BADGE_STYLES: Record<
  string,
  { backgroundColor: string; color: string; borderColor: string }
> = {
  presencial: {
    backgroundColor: "#0F7A45",
    color: "#FFFFFF",
    borderColor: "#0F7A45",
  },
  videollamada: {
    backgroundColor: "#D4EDBC",
    color: "#118047",
    borderColor: "#B7D99C",
  },
  telefono: {
    backgroundColor: "#E5E7EB",
    color: "#374151",
    borderColor: "#D1D5DB",
  },
};

function normalizeBadgeKey(value: string | null | undefined) {
  return (value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "-");
}

function getSourceBadgeStyle(source: string | null | undefined) {
  const key = normalizeBadgeKey(source);

  return (
    SOURCE_BADGE_STYLES[key] ?? {
      backgroundColor: "#F1F5F9",
      color: "#475569",
      borderColor: "#CBD5E1",
    }
  );
}

function getMedioBadgeStyle(value: string | null | undefined) {
  const key = normalizeBadgeKey(value);

  return (
    MEDIO_BADGE_STYLES[key] ?? {
      backgroundColor: "#F1F5F9",
      color: "#475569",
      borderColor: "#CBD5E1",
    }
  );
}

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

function fullDateForSearch(d: string) {
  const normalized = normalizeDate(d);
  if (!normalized) return "";

  const [year, month, day] = normalized.split("-");
  return `${day}/${month}/${year}`;
}


function normalizeDate(raw: string | null | undefined): string {
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);

  const parsed = new Date(raw);
  if (isNaN(parsed.getTime())) return "";

  return parsed.toISOString().slice(0, 10);
}

function localDateValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function isFromLastThreeDaysOnward(dateValue: string) {
  const normalized = normalizeDate(dateValue);
  if (!normalized) return false;

  const today = new Date();
  const cutoff = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  cutoff.setDate(cutoff.getDate() - 2);

  return normalized >= localDateValue(cutoff);
}

function getPlanningStatus(dateValue: string): "previas" | "hoy" | "proximas" {
  const normalized = normalizeDate(dateValue);
  if (!normalized) return "previas";

  const todayValue = localDateValue(new Date());

  if (normalized < todayValue) return "previas";
  if (normalized > todayValue) return "proximas";

  return "hoy";
}

function normalizePhase(raw: string | null | undefined): Lead["phase"] {
  const value = (raw || "").toLowerCase().trim();

  if (value === "noticia" || value === "identificada") return "identificada";
  if (value === "concertada" || value === "cualificada") return "cualificada";
  if (value === "valorada") return "valorada";
  if (value === "encargo") return "encargo";
  if (value === "vendida" || value === "vender") return "encargo";

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

function normalizeValor(raw: string | null | undefined) {
  if (!raw) return "—";
  return raw;
}

function formatEuroValue(raw: string) {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "—";

  return `${new Intl.NumberFormat("es-ES", {
    maximumFractionDigits: 0,
  }).format(Number(digits))} €`;
}

function DetailField({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0 rounded-lg border border-border bg-muted/20 p-3", className)}>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <div className="mt-1 break-words text-sm font-medium text-foreground">
        {children}
      </div>
    </div>
  );
}

function mapCrmLeadToLead(row: CrmLeadRow): ValoracionLead {
  const ownerLabel = row.comercial_name?.trim() || "Sin comercial";
  const plannerLabel = row.contact_name?.trim() || "—";
  const dominioLabel = row.dominio_desc?.trim() || "—";

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
    valor: normalizeValor(row.tasacion),
    phone: row.telefono?.trim() || "—",
    source: row.source_name?.trim() || "Sin origen",
    phase: normalizePhase(row.fase_name),
    status: normalizeStatus(row.estado),
    fechaNoticia: row.fecha || row.created_at || "",
    fechaContacto: normalizeDate(row.fecha_contacto),
    fechaValoracion: normalizeDate(row.fecha_valoracion),
    hora: row.hora ? row.hora.slice(0, 5) : "",
    medio: row.medio?.trim() || "—",
    planner: plannerLabel,
    dominio: dominioLabel,
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

export default function ValoracionesPage() {
  const { userWithRole, loading: userLoading } = useUser();
  const [items, setItems] = useState<ValoracionEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedItem, setSelectedItem] = useState<ValoracionEntry | null>(null);

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

    async function loadValoraciones() {
      setLoading(true);

      const [contactsResult, leadsResult] = await Promise.all([
        supabase
          .from("opportunity_activities")
          .select(
            "id, opportunity_id, fecha, memo, created_at, event_type, effective_at, metadata"
          )
          .eq("event_type", "valuation")
          .order("fecha", { ascending: false }),
        supabase.from("crm_leads_view").select("*").order("created_at", { ascending: false }),
      ]);

      if (contactsResult.error) {
        console.error("Supabase valoraciones error:", contactsResult.error);
        setLoading(false);
        return;
      }

      if (leadsResult.error) {
        console.error("Supabase leads error:", leadsResult.error);
        setLoading(false);
        return;
      }

      const contactRows = (contactsResult.data ?? []) as OpportunityContactRow[];

      const leadsMap = new Map<number, ValoracionLead>();
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

      const entries: ValoracionEntry[] = contactRows.map((row) => {
        const lead = leadsMap.get(row.opportunity_id);
        const { medio, hora, createdBy, notes } = parseValuationMemo(row);

        return {
          id: String(row.id),
          leadId: String(row.opportunity_id),
          fecha: normalizeDate(row.fecha || row.created_at || ""),
          registeredAt: row.created_at || "",
          hora,
          medio,
          createdBy,
          notes,
          ownerName: lead?.ownerName || "—",
          address: lead?.address || "—",
          district: lead?.distrito || "—",
          province: lead?.provincia || "—",
          postalCode: lead?.cp || "—",
          valuationValue: lead?.valor || "—",
          phone: lead?.phone || "—",
          source: lead?.source || "Sin origen",
          dominio: lead?.dominio || "—",
          phase: lead?.phase || "identificada",
          planner: lead?.planner || "—",
          owner: lead?.owner || "—",
        };
      });

      const leadIdsWithRealEntries = new Set(contactRows.map((row) => row.opportunity_id));

      const legacyEntries: ValoracionEntry[] = [];
      for (const lead of leadsMap.values()) {
        const leadIdNum = Number(lead.id);
        const isCualificadaOValorada =
          lead.phase === "cualificada" || lead.phase === "valorada";

        if (
          !isCualificadaOValorada ||
          leadIdsWithRealEntries.has(leadIdNum) ||
          !lead.fechaValoracion
        ) {
          continue;
        }

        legacyEntries.push({
          id: `legacy-${lead.id}`,
          leadId: lead.id,
          fecha: lead.fechaValoracion,
          registeredAt: lead.createdAt,
          hora: lead.hora || "",
          medio: lead.medio && lead.medio !== "—" ? lead.medio : "",
          createdBy: "",
          notes: "",
          ownerName: lead.ownerName,
          address: lead.address,
          district: lead.distrito,
          province: lead.provincia,
          postalCode: lead.cp,
          valuationValue: lead.valor,
          phone: lead.phone,
          source: lead.source,
          dominio: lead.dominio || "—",
          phase: lead.phase,
          planner: lead.planner || "—",
          owner: lead.owner,
        });
      }

      setItems([...entries, ...legacyEntries]);
      setLoading(false);
    }

    loadValoraciones();
  }, [userLoading, userWithRole]);

  const filteredItems = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) {
      return items.filter((item) => isFromLastThreeDaysOnward(item.fecha));
    }

    return items.filter((item) =>
      [
        item.fecha,
        fmt(item.fecha),
        fullDateForSearch(item.fecha),
        item.ownerName,
        item.address,
        item.phone,
        item.source,
        item.medio,
        item.owner,
        item.planner,
        item.dominio,
        item.createdBy,
        item.notes,
        PHASE_LABELS[item.phase],
      ]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [items, searchTerm]);

  return (
    <>
      <Topbar title="Valoraciones" />

      <main className="mt-14 flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex shrink-0 flex-col gap-2 border-b border-border bg-card px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-6 sm:py-2.5">
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:gap-4">
            <span className="text-xs text-muted-foreground sm:whitespace-nowrap">
              {filteredItems.length} valoraciones en total
            </span>
            <div className="relative w-full sm:w-auto">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar valoraciones..."
                className="h-10 w-full rounded-md border border-border bg-background pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground sm:h-8 sm:w-[260px]"
              />
            </div>
          </div>
        </div>

        {loading && (
          <div className="shrink-0 border-b border-border bg-muted/40 px-6 py-2 text-xs text-muted-foreground">
            Cargando valoraciones desde Supabase...
          </div>
        )}

        <div className="relative flex-1 overflow-auto">
          <table className="w-full border-collapse text-sm" style={{ minWidth: 1560 }}>
            <thead className="sticky top-0 z-20 bg-card">
              <tr className="border-b border-border bg-card/95 text-left backdrop-blur">
                <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Planning
                </th>
                <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  F. Valoración
                </th>
                <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Hora
                </th>
                <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Medio
                </th>
                <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Dominio
                </th>
                <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Origen
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
                  Fase
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
                  role="button"
                  tabIndex={0}
                  aria-label={`Ver detalle de la valoración de ${item.ownerName}`}
                  onClick={() => setSelectedItem(item)}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return;
                    event.preventDefault();
                    setSelectedItem(item);
                  }}
                  className={cn(
                    "cursor-pointer border-b border-border transition-colors hover:bg-accent/60 focus-visible:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                    i % 2 === 0 ? "bg-card" : "bg-background"
                  )}
                >
                  <td className="px-3 py-2.5">
                    {(() => {
                      const planning = getPlanningStatus(item.fecha);
                      const config = PLANNING_CONFIG[planning];

                      return (
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap",
                            config.className
                          )}
                        >
                          {config.label}
                        </span>
                      );
                    })()}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">
                    {fmt(item.fecha)}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">
                    {item.hora || "—"}
                  </td>
                  <td className="px-3 py-2.5">
                    {item.medio ? (
                      <span
                        className="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap"
                        style={getMedioBadgeStyle(item.medio)}
                      >
                        {item.medio}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    {item.dominio && item.dominio !== "—" ? (
                      <span
                        className="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap"
                        style={getDominioBadgeStyle(item.dominio)}
                      >
                        {item.dominio}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap"
                      style={getSourceBadgeStyle(item.source)}
                    >
                      {item.source}
                    </span>
                  </td>
                  <td className="max-w-[260px] truncate px-3 py-2.5 text-xs text-muted-foreground">
                    {item.address}
                  </td>
                  <td className="px-3 py-2.5 font-medium text-foreground">
                    {item.ownerName}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">
                    {item.phone}
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold whitespace-nowrap"
                      style={getPhaseBadgeStyle(item.phase)}
                    >
                      <Circle className="h-1.5 w-1.5 fill-current" />
                      {PHASE_LABELS[item.phase] ?? item.phase}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">
                    {item.planner || "—"}
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

      <Dialog
        open={selectedItem !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedItem(null);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto [&_[data-slot=dialog-close]]:flex [&_[data-slot=dialog-close]]:size-8 [&_[data-slot=dialog-close]]:items-center [&_[data-slot=dialog-close]]:justify-center [&_[data-slot=dialog-close]]:rounded-full [&_[data-slot=dialog-close]]:bg-primary [&_[data-slot=dialog-close]]:text-primary-foreground [&_[data-slot=dialog-close]]:opacity-100 [&_[data-slot=dialog-close]]:shadow-sm [&_[data-slot=dialog-close]]:hover:bg-primary/85 [&_[data-slot=dialog-close]]:hover:text-primary-foreground [&_[data-slot=dialog-close]]:data-[state=open]:bg-primary sm:max-w-2xl">
          {selectedItem && (
            <>
              <DialogHeader className="pr-8">
                <DialogTitle className="text-base font-semibold">
                  Detalle de valoración
                </DialogTitle>
                <DialogDescription className="text-xs">
                  {selectedItem.address} · {selectedItem.ownerName}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-5">
                <section>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Valoración
                  </h3>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    <DetailField label="Fecha">{fmt(selectedItem.fecha)}</DetailField>
                    <DetailField label="Hora">{selectedItem.hora || "—"}</DetailField>
                    <DetailField label="Medio">
                      {selectedItem.medio ? (
                        <span
                          className="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium"
                          style={getMedioBadgeStyle(selectedItem.medio)}
                        >
                          {selectedItem.medio}
                        </span>
                      ) : (
                        "—"
                      )}
                    </DetailField>
                  </div>
                </section>

                <section>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Inmueble
                  </h3>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    <DetailField label="Dirección" className="col-span-2 sm:col-span-3">
                      {selectedItem.address}
                    </DetailField>
                    <DetailField label="Distrito">{selectedItem.district}</DetailField>
                    <DetailField label="Provincia">{selectedItem.province}</DetailField>
                    <DetailField label="Código postal">{selectedItem.postalCode}</DetailField>
                    <DetailField label="Valor de tasación">
                      {formatEuroValue(selectedItem.valuationValue)}
                    </DetailField>
                    <DetailField label="Dominio">{selectedItem.dominio}</DetailField>
                    <DetailField label="Origen">{selectedItem.source}</DetailField>
                    <DetailField label="Fase">
                      <span
                        className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold"
                        style={getPhaseBadgeStyle(selectedItem.phase)}
                      >
                        <Circle className="h-1.5 w-1.5 fill-current" />
                        {PHASE_LABELS[selectedItem.phase] ?? selectedItem.phase}
                      </span>
                    </DetailField>
                  </div>
                </section>

                <section>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Contacto y responsables
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    <DetailField label="Propietario">{selectedItem.ownerName}</DetailField>
                    <DetailField label="Teléfono">{selectedItem.phone}</DetailField>
                    <DetailField label="Planner">{selectedItem.planner || "—"}</DetailField>
                    <DetailField label="Owner">{selectedItem.owner}</DetailField>
                    <DetailField label="Creada por">{selectedItem.createdBy || "—"}</DetailField>
                    <DetailField label="Fecha de registro">
                      {fmt(selectedItem.registeredAt)}
                    </DetailField>
                  </div>
                </section>

                {selectedItem.notes && (
                  <section>
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Observaciones
                    </h3>
                    <div className="whitespace-pre-wrap rounded-lg border border-border bg-muted/20 p-3 text-sm text-foreground">
                      {selectedItem.notes}
                    </div>
                  </section>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
function getDominioBadgeStyle(value: string | null | undefined) {
  const key = normalizeBadgeKey(value);

  const styles: Record<
    string,
    { backgroundColor: string; color: string; borderColor: string }
  > = {
    alcorcon: {
      backgroundColor: "#EDE9FE",
      color: "#6D28D9",
      borderColor: "#DDD6FE",
    },
    chamartin: {
      backgroundColor: "#D1FAE5",
      color: "#047857",
      borderColor: "#A7F3D0",
    },
    investment: {
      backgroundColor: "#FCE7F3",
      color: "#BE185D",
      borderColor: "#FBCFE8",
    },
    mostoles: {
      backgroundColor: "#FEF3C7",
      color: "#92400E",
      borderColor: "#FDE68A",
    },
    proptech: {
      backgroundColor: "#DBEAFE",
      color: "#1D4ED8",
      borderColor: "#BFDBFE",
    },
  };

  return (
    styles[key] ?? {
      backgroundColor: "#F1F5F9",
      color: "#475569",
      borderColor: "#CBD5E1",
    }
  );
}
