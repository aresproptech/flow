"use client";

import { useEffect, useMemo, useState } from "react";
import { Topbar } from "@/components/crm/topbar";
import {
  NewLeadModal,
  type NewLeadFormData,
} from "@/components/crm/new-lead-modal";
import { LeadDetailPanel } from "@/components/crm/lead-detail-panel";
import { ImportLeadsCsvModal } from "@/components/crm/import-leads-csv-modal";
import { KanbanBoard } from "@/components/crm/kanban-board";
import { MaskedPhone } from "@/components/crm/masked-phone";
import {
  Plus,
  Circle,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Search,
  LayoutGrid,
  Table2,
  RefreshCw,
  Star,
  Eraser,
  FileUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { type Lead, PHASE_LABELS } from "@/lib/crm-data";
import { canEditLeads, canViewAllLeads, useUser } from "@/lib/hooks/useUser";

type LeadTableRow = Lead & {
  medio: string;
  month: string;
  dominio: string;
  enVenta: string;
};

type SortKey = keyof LeadTableRow;
type SortDir = "asc" | "desc";
type LeadsViewMode = "table" | "kanban";

type PhaseFilterValue = "all" | Lead["phase"];
type StatusFilterValue = "all" | Lead["status"];
type DomainFilterValue = "all" | string;
type DateFilterField = "fechaNoticia";
type DateQuickFilterValue = "all" | "last7" | "last30" | "custom";

const LEADS_PAGE_SIZE = 100;
const LEADS_SEARCH_PAGE_SIZE = 1000;

function getPaginationPages(totalPages: number, currentPage: number) {
  if (totalPages <= 10) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages = new Set<number>([1, 2, 3, 4, 5, totalPages]);

  for (let page = 10; page < totalPages; page += 10) {
    pages.add(page);
  }

  for (const page of [currentPage - 1, currentPage, currentPage + 1]) {
    if (page > 0 && page <= totalPages) pages.add(page);
  }

  return Array.from(pages).sort((a, b) => a - b);
}

const LEAD_SEARCH_COLUMNS = [
  "propietario",
  "telefono",
  "domicilio",
  "tasacion",
  "estado",
  "en_venta",
  "medio",
  "fase_name",
  "source_name",
  "comercial_name",
  "contact_name",
  "provincia",
  "distrito",
  "dominio_desc",
] as const;

function buildLeadSearchFilter(rawSearch: string) {
  const safeSearch = rawSearch
    .replace(/[,%().*]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!safeSearch) return null;

  const clauses = LEAD_SEARCH_COLUMNS.map(
    (column) => `${column}.ilike.%${safeSearch}%`
  );

  if (/^\d+$/.test(safeSearch)) {
    clauses.push(`cp.eq.${Number(safeSearch)}`);
  }

  return clauses.join(",");
}

type CrmLeadRow = {
  id: number;
  created_at: string | null;
  fecha: string | null;
  fecha_contacto: string | null;
  fecha_valoracion: string | null;
  hora: string | null;
  is_favorite?: boolean | null;
  propietario: string | null;
  telefono: string | null;
  domicilio: string | null;
  tasacion: string | null;
  estado: string | null;
  memo: string | null;
  en_venta: string | null;
  medio: string | null;
  fase_id: number | null;
  fase_name: string | null;
  source_id: number | null;
  source_name: string | null;
  comercial_user_id: number | null;
  comercial_name: string | null;
  contact_user_id: number | null;
  contact_name: string | null;
  buyer_user_id: number | null;
  buyer_name: string | null;
  postal_id: number | null;
  cp: number | null;
  provincia: string | null;
  distrito: string | null;
  team_id: number | null;
  dominio_desc: string | null;
};

type PhaseRow = {
  id: number;
  name: string | null;
};

type ProfileLookupRow = {
  id: number;
  name: string | null;
};

type SourceLookupRow = {
  id: number;
  code: string | null;
};

type DomainLookupRow = {
  id: number;
  code: string | null;
  description: string | null;
};

const VALID_PHASES: Lead["phase"][] = [
  "identificada",
  "cualificada",
  "valorada",
  "encargo",
];

const PHASE_ID_MAP: Partial<Record<Lead["phase"], number>> = {
  identificada: 1,
  cualificada: 2,
  valorada: 3,
  encargo: 4,
};

const PHASE_FILTER_OPTIONS: Array<{ value: PhaseFilterValue; label: string }> = [
  { value: "all", label: "Fases (Todas)" },
  { value: "identificada", label: "Identificada" },
  { value: "cualificada", label: "Cualificada" },
  { value: "valorada", label: "Valorada" },
  { value: "encargo", label: "Encargo" },
];

const DATE_FILTER_OPTIONS: Array<{ value: DateFilterField; label: string }> = [
  { value: "fechaNoticia", label: "F. Noticia" },
];

const DATE_QUICK_FILTER_OPTIONS: Array<{
  value: DateQuickFilterValue;
  label: string;
}> = [
  { value: "all", label: "Período (Todos)" },
  { value: "last7", label: "Últimos 7 días" },
  { value: "last30", label: "Últimos 30 días" },
  { value: "custom", label: "Personalizado" },
];

function SortIcon({
  col,
  sortKey,
  sortDir,
}: {
  col: SortKey;
  sortKey: SortKey | null;
  sortDir: SortDir;
}) {
  if (sortKey !== col) {
    return (
      <ChevronsUpDown className="h-3 w-3 shrink-0 text-muted-foreground/40" />
    );
  }

  return sortDir === "asc" ? (
    <ChevronUp className="h-3 w-3 shrink-0 text-primary" />
  ) : (
    <ChevronDown className="h-3 w-3 shrink-0 text-primary" />
  );
}

function getValue(lead: LeadTableRow, key: SortKey): string | number {
  const v = lead[key];
  if (v === undefined || v === null || v === "") return "";

  if (
    ["fechaNoticia", "fechaContacto", "fechaValoracion"].includes(
      key as string
    )
  ) {
    return v as string;
  }

  if (key === "valor") {
    const n = parseFloat(String(v).replace(/[^0-9.]/g, ""));
    return isNaN(n) ? 0 : n;
  }

  return String(v).toLowerCase();
}

const STATUS_CONFIG: Record<
  string,
  {
    label: string;
    dot: string;
    backgroundColor: string;
    color: string;
    borderColor: string;
  }
> = {
  activa: {
    label: "Activa",
    dot: "bg-emerald-500",
    backgroundColor: "#D4EDBC",
    color: "#288158",
    borderColor: "#B7D99C",
  },
  caliente: {
    label: "Caliente",
    dot: "bg-orange-500",
    backgroundColor: "#B32400",
    color: "#FFFFFF",
    borderColor: "#B32400",
  },
  desestimada: {
    label: "Desestimada",
    dot: "bg-muted-foreground",
    backgroundColor: "#4B3820",
    color: "#FDE68A",
    borderColor: "#4B3820",
  },
};

const STATUS_FILTER_OPTIONS: Array<{ value: StatusFilterValue; label: string }> = [
  { value: "all", label: "Todos los estados" },
  { value: "activa", label: STATUS_CONFIG.activa.label },
  { value: "caliente", label: STATUS_CONFIG.caliente.label },
  { value: "desestimada", label: STATUS_CONFIG.desestimada.label },
];

function getStatusConfig(status: string | null | undefined) {
  const key = normalizeStatus(status);
  return STATUS_CONFIG[key] ?? STATUS_CONFIG.activa;
}

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

function normalizeSourceKey(source: string | null | undefined) {
  return (source || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "-");
}

function getSourceBadgeStyle(source: string | null | undefined) {
  const key = normalizeSourceKey(source);

  return (
    SOURCE_BADGE_STYLES[key] ?? {
      backgroundColor: "#F1F5F9",
      color: "#475569",
      borderColor: "#CBD5E1",
    }
  );
}

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

const DOMINIO_BADGE_STYLES: Record<
  string,
  { backgroundColor: string; color: string; borderColor: string }
> = {
  proptech: {
    backgroundColor: "#DBEAFE",
    color: "#1D4ED8",
    borderColor: "#BFDBFE",
  },
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
  mostoles: {
    backgroundColor: "#FEF3C7",
    color: "#92400E",
    borderColor: "#FDE68A",
  },
  investment: {
    backgroundColor: "#FCE7F3",
    color: "#BE185D",
    borderColor: "#FBCFE8",
  },
};

function getDominioBadgeStyle(value: string | null | undefined) {
  const key = normalizeBadgeKey(value);

  return (
    DOMINIO_BADGE_STYLES[key] ?? {
      backgroundColor: "#F1F5F9",
      color: "#475569",
      borderColor: "#CBD5E1",
    }
  );
}

const EN_VENTA_BADGE_STYLES: Record<
  string,
  { backgroundColor: string; color: string; borderColor: string }
> = {
  si: {
    backgroundColor: "#F3B6B6",
    color: "#FFFFFF",
    borderColor: "#F3B6B6",
  },
  no: {
    backgroundColor: "#D4EDBC",
    color: "#288158",
    borderColor: "#B7D99C",
  },
  "no-sabe": {
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

function getEnVentaBadgeStyle(value: string | null | undefined) {
  const key = normalizeBadgeKey(value);

  return (
    EN_VENTA_BADGE_STYLES[key] ?? {
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

function fmtMonth(d: string) {
  if (!d) return "—";
  const parsed = new Date(d);
  if (isNaN(parsed.getTime())) return "—";

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");

  return `${year}-${month}`;
}

function normalizeLookupText(raw: string | null | undefined): string {
  return (raw || "")
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function phaseNameToKey(name: string | null | undefined): Lead["phase"] | null {
  const value = normalizeLookupText(name);

  if (value.includes("noticia") || value.includes("identificada")) return "identificada";
  if (value.includes("concertada") || value.includes("cualificada")) return "cualificada";
  if (value.includes("valorada")) return "valorada";
  if (value.includes("encargo")) return "encargo";

  return null;
}

function phaseIdToKey(id: number | null | undefined): Lead["phase"] | null {
  if (id === null || id === undefined) return null;

  for (const [key, value] of Object.entries(PHASE_ID_MAP) as Array<
    [Lead["phase"], number]
  >) {
    if (value === id) return key;
  }

  return null;
}

function normalizePhase(
  raw: string | null | undefined,
  phaseId?: number | null
): Lead["phase"] {
  const value = normalizeLookupText(raw);

  if (value.includes("noticia") || value.includes("identificada")) return "identificada";
  if (value.includes("concertada") || value.includes("cualificada")) return "cualificada";
  if (value.includes("valorada")) return "valorada";
  if (value.includes("encargo")) return "encargo";

  if (value.includes("vendida") || value.includes("vender")) return "encargo";

  const byId = phaseIdToKey(phaseId);
  if (byId) return byId;

  return "identificada";
}

function normalizeStatus(raw: string | null | undefined): Lead["status"] {
  const value = normalizeLookupText(raw);

  if (
    !value ||
    value === "activa" ||
    value === "activo" ||
    value === "identificar" ||
    value === "identificada" ||
    value === "identificado" ||
    value === "cualificada" ||
    value === "seguimiento"
  ) {
    return "activa";
  }

  if (value === "caliente") {
    return "caliente";
  }

  if (value === "desestimada") {
    return "desestimada";
  }

  return "activa";
}

function normalizeValor(raw: string | null | undefined) {
  if (!raw) return "—";
  return raw;
}

function normalizeDate(raw: string | null | undefined): string {
  if (!raw) return "";

  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);

  const parsed = new Date(raw);
  if (isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
}

function toLocalDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function addDaysToDateInputValue(value: string, days: number) {
  const parsed = new Date(`${value}T00:00:00`);
  if (isNaN(parsed.getTime())) return "";
  parsed.setDate(parsed.getDate() + days);
  return toLocalDateInputValue(parsed);
}

function formatDateInputLabel(value: string) {
  if (!value) return "—";
  const parsed = new Date(`${value}T00:00:00`);
  if (isNaN(parsed.getTime())) return value;

  return parsed.toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function normalizePostalId(cp: string | null | undefined): number | null {
  const value = cp?.trim();
  if (!value || !/^\d{5}$/.test(value)) return null;
  return Number(value);
}

function cleanNullable(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  const placeholders = new Set(["—", "-", "N/A", "Sin origen", "Sin asignar"]);
  if (placeholders.has(trimmed)) return null;

  return trimmed;
}

function mapCrmLeadToLead(row: CrmLeadRow): LeadTableRow {
  const ownerLabel = row.comercial_name?.trim() || "Sin comercial";
  const plannerLabel = row.contact_name?.trim() || "—";
  const buyerLabel = row.buyer_name?.trim() || "—";
  const dominioLabel = row.dominio_desc?.trim() || "—";

  const domicilio = row.domicilio?.trim() || "—";
  const distrito = row.distrito?.trim() || "—";
  const provincia = row.provincia?.trim() || "—";
  const cp = row.cp ? String(row.cp) : "—";

  const fechaNoticia = normalizeDate(row.fecha || row.created_at || "");

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
    sourceId: row.source_id,
    phase: normalizePhase(row.fase_name, row.fase_id),
    status: normalizeStatus(row.estado),
    fechaNoticia,
    fechaContacto: normalizeDate(row.fecha_contacto),
    fechaValoracion: normalizeDate(row.fecha_valoracion),
    hora: row.hora ? row.hora.slice(0, 5) : "",
    planner: plannerLabel,
    plannerId: row.contact_user_id,
    owner: ownerLabel,
    ownerId: row.comercial_user_id,
    buyer: buyerLabel,
    buyerId: row.buyer_user_id,
    createdAt: row.created_at || "",
    assignedUser: ownerLabel,
    propertyAddress:
      domicilio !== "—"
        ? `${domicilio}, ${distrito !== "—" ? distrito : provincia}`
        : "—",
    notes: row.memo?.trim() || "",
    observaciones: [],
    medio: row.medio?.trim() || "—",
    month: fmtMonth(fechaNoticia),
    dominio: dominioLabel,
    enVenta: row.en_venta?.trim() || "No Sabe",
  };
}

export default function LeadsPage() {
  const { userWithRole, loading: userLoading } = useUser();
  const canEdit = Boolean(userWithRole?.crmUser && canEditLeads(userWithRole.crmUser));
  const currentRole = String(userWithRole?.crmUser.rol || "").trim().toLowerCase();
  const [phaseIdMap, setPhaseIdMap] =
    useState<Partial<Record<Lead["phase"], number>>>({});
  const [profileIdByName, setProfileIdByName] = useState<Map<string, number>>(
    new Map()
  );
  const [sourceIdByCode, setSourceIdByCode] = useState<Map<string, number>>(
    new Map()
  );
  const [profileOptions, setProfileOptions] = useState<string[]>([]);
  const [sourceOptions, setSourceOptions] = useState<string[]>([]);
  const [domainOptions, setDomainOptions] = useState<string[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [leads, setLeads] = useState<LeadTableRow[]>([]);
  const [loadingLeads, setLoadingLeads] = useState(true);
  const [totalLeadsCount, setTotalLeadsCount] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageError, setPageError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<LeadTableRow[] | null>(null);
  const [loadingSearchResults, setLoadingSearchResults] = useState(false);
  const [searchRefreshKey, setSearchRefreshKey] = useState(0);
  const [domainFilter, setDomainFilter] = useState<DomainFilterValue>("all");
  const [phaseFilter, setPhaseFilter] = useState<PhaseFilterValue>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilterValue>("all");
  const [dateFilterField, setDateFilterField] =
    useState<DateFilterField>("fechaNoticia");
  const [dateQuickFilter, setDateQuickFilter] =
    useState<DateQuickFilterValue>("all");
  const [dateFromFilter, setDateFromFilter] = useState("");
  const [dateToFilter, setDateToFilter] = useState("");
  const [datePopoverOpen, setDatePopoverOpen] = useState(false);
  const [viewMode, setViewMode] = useState<LeadsViewMode>("table");
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());

  async function loadPhaseIdMap() {
    const { data, error } = await supabase.from("phases").select("id, name");

    if (error) {
      console.error("Error cargando fases:", error);
      return;
    }

    const nextMap: Partial<Record<Lead["phase"], number>> = {};

    for (const row of (data ?? []) as PhaseRow[]) {
      const key = phaseNameToKey(row.name);
      if (!key) continue;
      nextMap[key] = row.id;
    }

    setPhaseIdMap(nextMap);
  }

  async function loadRelationIdMaps() {
    const [profilesResponse, sourcesResponse, domainsResponse] = await Promise.all([
      supabase.rpc("crm_profile_assignment_options"),
      supabase.from("sources").select("id, code").eq("enabled", true),
      supabase
        .from("domain")
        .select("id, code, description")
        .eq("enabled", true),
    ]);

    if (profilesResponse.error || sourcesResponse.error) {
      console.error("Error cargando catálogos relacionales:", {
        profilesError: profilesResponse.error,
        sourcesError: sourcesResponse.error,
      });
      return;
    }

    if (domainsResponse.error) {
      console.error("Error cargando dominios:", domainsResponse.error);
    }

    const profiles = ((profilesResponse.data ?? []) as ProfileLookupRow[]).filter(
      (row): row is ProfileLookupRow & { name: string } => Boolean(row.name?.trim())
    );
    const sources = ((sourcesResponse.data ?? []) as SourceLookupRow[]).filter(
      (row): row is SourceLookupRow & { code: string } => Boolean(row.code?.trim())
    );
    const domains = (
      domainsResponse.error
        ? []
        : ((domainsResponse.data ?? []) as DomainLookupRow[])
    )
      .map((row) => row.description?.trim() || row.code?.trim() || "")
      .filter((label): label is string => Boolean(label));

    setProfileIdByName(
      new Map(
        profiles.map((row) => [normalizeLookupText(row.name), row.id])
      )
    );
    setSourceIdByCode(
      new Map(
        sources.map((row) => [normalizeLookupText(row.code), row.id])
      )
    );
    setProfileOptions(
      profiles.map((row) => row.name).sort((a, b) => a.localeCompare(b, "es"))
    );
    setSourceOptions(
      sources.map((row) => row.code).sort((a, b) => a.localeCompare(b, "es"))
    );
    setDomainOptions(
      Array.from(new Set(domains)).sort((a, b) => a.localeCompare(b, "es"))
    );
  }

  function profileIdFor(name: string | null | undefined) {
    return profileIdByName.get(normalizeLookupText(name)) ?? null;
  }

  function sourceIdFor(code: string | null | undefined) {
    return sourceIdByCode.get(normalizeLookupText(code)) ?? null;
  }

  async function resolvePhaseId(phase: Lead["phase"]) {
    const cached = phaseIdMap[phase];
    if (cached) return cached;

    const label = PHASE_LABELS[phase];
    const { data, error } = await supabase.from("phases").select("id, name");

    if (error) {
      console.error("Error resolviendo fase:", error);
      return PHASE_ID_MAP[phase] ?? 1;
    }

    const nextMap: Partial<Record<Lead["phase"], number>> = {};

    for (const row of (data ?? []) as PhaseRow[]) {
      const key = phaseNameToKey(row.name);
      if (!key) continue;
      nextMap[key] = row.id;
    }

    setPhaseIdMap((prev) => ({ ...prev, ...nextMap }));

    const resolved =
      nextMap[phase] ??
      ((data ?? []) as PhaseRow[]).find(
        (row) =>
          phaseNameToKey(row.name) === phase ||
          normalizeLookupText(row.name) === normalizeLookupText(label)
      )?.id;

    return resolved ?? PHASE_ID_MAP[phase] ?? 1;
  }

  async function loadLeadsFromSupabase(options?: { page?: number }) {
    const page = options?.page ?? 1;
    const from = (page - 1) * LEADS_PAGE_SIZE;
    const to = from + LEADS_PAGE_SIZE - 1;

    setPageError(null);
    setLoadingLeads(true);

    let query = supabase
      .from("crm_leads_view")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false });

    if (userWithRole?.crmUser && !canViewAllLeads(userWithRole.crmUser)) {
      query = query.eq("comercial_name", userWithRole.crmUser.name);
    }

    if (showFavoritesOnly) query = query.eq("is_favorite", true);
    if (domainFilter !== "all") query = query.eq("dominio_desc", domainFilter);
    if (phaseFilter !== "all") {
      query = query.ilike("fase_name", PHASE_LABELS[phaseFilter]);
    }
    if (statusFilter !== "all") {
      const statusValues: Record<Exclude<StatusFilterValue, "all">, string[]> = {
        activa: ["Activa", "Activo", "Identificada", "Identificado", "Cualificada", "Seguimiento"],
        caliente: ["Caliente"],
        desestimada: ["Desestimada"],
      };
      query = query.in("estado", statusValues[statusFilter]);
    }
    if (dateQuickFilter !== "all") {
      let fromDate = dateFromFilter;
      let toDate = dateToFilter;

      if (dateQuickFilter === "last7" || dateQuickFilter === "last30") {
        const todayValue = toLocalDateInputValue(new Date());
        const daysBack = dateQuickFilter === "last7" ? 6 : 29;
        fromDate = addDaysToDateInputValue(todayValue, -daysBack);
        toDate = todayValue;
      }

      if (fromDate) query = query.gte("fecha", fromDate);
      if (toDate) query = query.lte("fecha", toDate);
    }

    const { data, error, count } = await query.range(from, to);

    if (error) {
      console.error("Supabase leads error:", error);
      setPageError("No se pudieron cargar los leads. Intentá actualizar la página.");
      setLoadingLeads(false);
      return;
    }

    const rows = (data ?? []) as CrmLeadRow[];
    const mapped = rows.map((row) => mapCrmLeadToLead(row));
    const nextTotal = count ?? mapped.length;
    const nextFavorites = new Set(
      rows.filter((row) => row.is_favorite).map((row) => String(row.id))
    );

    setLeads(mapped);
    setFavoriteIds((prev) => {
      const next = new Set(prev);
      for (const id of nextFavorites) next.add(id);
      return next;
    });
    setCurrentPage(page);
    setTotalLeadsCount(nextTotal);
    setLoadingLeads(false);
  }

  async function handleImportCsv(importedLeads: Lead[]): Promise<string | null> {
    if (!canEdit) return "No tenés permisos para importar leads.";
    setPageError(null);
    if (importedLeads.length === 0) return "No hay filas válidas para importar.";

    const phaseIds = new Map<Lead["phase"], number>();
    const uniquePhases = Array.from(new Set(importedLeads.map((lead) => lead.phase)));

    for (const phase of uniquePhases) {
      phaseIds.set(phase, await resolvePhaseId(phase));
    }

    const rowsToInsert = importedLeads.map((lead) => ({
      propietario: cleanNullable(lead.ownerName),
      domicilio: cleanNullable(lead.address),
      telefono: cleanNullable(lead.phone),
      tasacion: cleanNullable(lead.valor),
      estado: cleanNullable(lead.status),
      fecha: cleanNullable(lead.fechaNoticia),
      fecha_contacto: cleanNullable(lead.fechaContacto),
      fecha_valoracion: cleanNullable(lead.fechaValoracion),
      hora: cleanNullable(lead.hora),
      source_desc: cleanNullable(lead.source),
      comercial_user_desc: cleanNullable(lead.owner),
      contact_user_desc: cleanNullable(lead.planner),
      dominio_desc: cleanNullable((lead as Lead & { dominio?: string | null }).dominio),
      postal_id: normalizePostalId(lead.cp),
      fase_id: phaseIds.get(lead.phase) ?? PHASE_ID_MAP[lead.phase] ?? 1,
      memo: cleanNullable(lead.notes),
      en_venta: null,
      medio: cleanNullable(lead.medio),
      source_id: sourceIdFor(lead.source),
      comercial_user_id: profileIdFor(lead.owner),
      contact_user_id: profileIdFor(lead.planner),
      team_id: null,
    }));

    const { data: insertedIds, error } = await supabase.rpc(
      "crm_import_leads_with_activity",
      { p_rows: rowsToInsert }
    );

    if (error) {
      console.error("Error importing CSV to Supabase:", error);
      const message = "No se pudieron importar los leads. Revisá el archivo e intentá nuevamente.";
      setPageError(message);
      return message;
    }

    if (!Array.isArray(insertedIds) || insertedIds.length !== rowsToInsert.length) {
      const message =
        "La importación no confirmó todos los leads. No se cerrará el archivo para evitar perder datos.";
      console.error(message, { insertedIds, expected: rowsToInsert.length });
      setPageError(message);
      return message;
    }

    await loadLeadsFromSupabase({ page: 1 });
    setSearchRefreshKey((value) => value + 1);
    return null;
  }

  async function handleCreateLead(form: NewLeadFormData): Promise<string | null> {
    if (!canEdit) return "No tenés permisos para crear leads.";
    setPageError(null);

    const resolvedPhaseId = await resolvePhaseId(form.phase as Lead["phase"]);

    const rowToInsert = {
      propietario: cleanNullable(form.ownerName),
      domicilio: cleanNullable(form.address),
      telefono: cleanNullable(form.phone),
      tasacion: cleanNullable(form.valor),
      estado: cleanNullable(form.status),
      fecha: cleanNullable(form.fechaNoticia),
      fecha_contacto: cleanNullable(form.fechaContacto),
      fecha_valoracion: cleanNullable(form.fechaValoracion),
      hora: cleanNullable(form.hora),
      source_desc: cleanNullable(form.source),
      comercial_user_desc: cleanNullable(form.owner),
      contact_user_desc: cleanNullable(form.planner),
      buyer_user_desc: cleanNullable(form.buyer),
      dominio_desc: cleanNullable(form.dominio),
      postal_id: normalizePostalId(form.cp),
      fase_id: resolvedPhaseId,
      memo: cleanNullable(form.notes),
      en_venta: cleanNullable(form.enVenta),
      medio: cleanNullable(form.medio),
      source_id: sourceIdFor(form.source),
      comercial_user_id: profileIdFor(form.owner),
      contact_user_id: profileIdFor(form.planner),
      buyer_user_id: profileIdFor(form.buyer),
      team_id: null,
    };

    const { data: insertedId, error } = await supabase.rpc(
      "crm_create_lead_with_activity",
      {
        p_data: rowToInsert,
        p_event_type: "lead_created",
      }
    );

    if (error) {
      console.error("Error creating lead in Supabase:", error);
      const message = "No se pudo crear el lead. Revisá los datos e intentá nuevamente.";
      setPageError(message);
      return message;
    }

    if (!insertedId) {
      const message =
        "Supabase no confirmó el lead creado. El formulario permanecerá abierto.";
      console.error(message, { insertedId });
      setPageError(message);
      return message;
    }

    await loadLeadsFromSupabase({ page: 1 });
    setSearchRefreshKey((value) => value + 1);
    return null;
  }

  async function handleSaveLead(next: Lead, changeDetails: string[]) {
    if (!canEdit) return;
    setPageError(null);

    const resolvedPhaseId = await resolvePhaseId(next.phase);
    const nextWithDominio = next as Lead & { dominio?: string | null };

    const updatePayload = {
      propietario: cleanNullable(next.ownerName),
      domicilio: cleanNullable(next.address),
      telefono: cleanNullable(next.phone),
      tasacion: cleanNullable(next.valor),
      estado: cleanNullable(next.status),
      fecha: next.fechaNoticia ? next.fechaNoticia.slice(0, 10) : null,
      fecha_contacto: next.fechaContacto ? next.fechaContacto.slice(0, 10) : null,
      fecha_valoracion: next.fechaValoracion
        ? next.fechaValoracion.slice(0, 10)
        : null,
      hora: cleanNullable(next.hora),
      source_desc: cleanNullable(next.source),
      comercial_user_desc: cleanNullable(next.owner),
      contact_user_desc: cleanNullable(next.planner),
      buyer_user_desc: cleanNullable(next.buyer),
      dominio_desc: cleanNullable(nextWithDominio.dominio),
      memo: cleanNullable(next.notes),
      medio: cleanNullable(next.medio),
      en_venta: cleanNullable(next.enVenta),
      fase_id: resolvedPhaseId,
      postal_id: normalizePostalId(next.cp),
      source_id: sourceIdFor(next.source),
      comercial_user_id: profileIdFor(next.owner),
      contact_user_id: profileIdFor(next.planner),
      buyer_user_id: profileIdFor(next.buyer),
    };

    const { data: updatedId, error } = await supabase.rpc(
      "crm_update_lead_with_activity",
      {
        p_opportunity_id: Number(next.id),
        p_data: updatePayload,
        p_change_details: changeDetails.join(" · ") || null,
      }
    );

    if (error) {
      console.error("Error actualizando lead:", error);
      const message = `No se pudo guardar el lead. Error Supabase: ${error.message}`;
      setPageError(message);
      throw new Error(message);
    }

    if (!updatedId) {
      const message =
        "Supabase no confirmó la actualización. Puede haber un problema de permisos/RLS o el ID no coincide.";
      console.error(message, { leadId: next.id, updatePayload, updatedId });
      setPageError(message);
      throw new Error(message);
    }

    const { data: savedRows, error: readBackError } = await supabase
      .from("crm_leads_view")
      .select("*")
      .eq("id", Number(next.id));

    if (readBackError) {
      console.error("Error leyendo lead actualizado:", readBackError);
      setPageError(
        `El lead y su historial se guardaron, pero no se pudo refrescar la vista: ${readBackError.message}`
      );
      setSelectedLead(next);
      return;
    }

    const savedRow = savedRows?.[0] as CrmLeadRow | undefined;
    const mappedLead = savedRow ? mapCrmLeadToLead(savedRow) : next;

    await loadLeadsFromSupabase({ page: 1 });
    setSearchRefreshKey((value) => value + 1);
    setSelectedLead(mappedLead);
  }

  async function handleMoveLead(leadId: string, nextPhase: Lead["phase"]) {
    if (!canEdit) return;
    setPageError(null);

    const currentLead =
      searchResults?.find((lead) => lead.id === leadId) ??
      leads.find((lead) => lead.id === leadId);

    if (!currentLead || currentLead.phase === nextPhase) {
      return;
    }

    const previousLeads = leads;
    const previousSearchResults = searchResults;
    const resolvedPhaseId = await resolvePhaseId(nextPhase);

    setLeads((prev) =>
      prev.map((lead) =>
        lead.id === leadId
          ? {
              ...lead,
              phase: nextPhase,
            }
          : lead
      )
    );
    setSearchResults((prev) =>
      prev?.map((lead) =>
        lead.id === leadId
          ? {
              ...lead,
              phase: nextPhase,
            }
          : lead
      ) ?? null
    );
    const { error } = await supabase.rpc("crm_change_lead_phase_with_activity", {
      p_opportunity_id: Number(leadId),
      p_phase_id: resolvedPhaseId,
    });

    if (error) {
      console.error("Error actualizando fase del lead:", error);
      setPageError("No se pudo mover el lead de fase. Intentá nuevamente.");
      setLeads(previousLeads);
      setSearchResults(previousSearchResults);
      return;
    }

  }

  async function handleToggleFavorite(leadId: string) {
    if (!canEdit) return;
    setPageError(null);
    const nextFavorite = !favoriteIds.has(leadId);

    setFavoriteIds((prev) => {
      const next = new Set(prev);
      if (nextFavorite) next.add(leadId);
      else next.delete(leadId);
      return next;
    });

    const { error } = await supabase
      .from("opportunities")
      .update({ is_favorite: nextFavorite })
      .eq("id", Number(leadId));

    if (error) {
      console.error("Error actualizando favorito:", error);
      setPageError("No se pudo actualizar el favorito. Intentá nuevamente.");

      setFavoriteIds((prev) => {
        const next = new Set(prev);
        if (nextFavorite) next.delete(leadId);
        else next.add(leadId);
        return next;
      });
    }
  }

  useEffect(() => {
    if (userLoading) return;
    if (!userWithRole?.crmUser) {
      setSearchResults(null);
      setLoadingSearchResults(false);
      return;
    }
    void loadPhaseIdMap();
    void loadRelationIdMaps();
  }, [userLoading, userWithRole]);

  useEffect(() => {
    if (userLoading || !userWithRole?.crmUser || searchTerm.trim()) return;
    void loadLeadsFromSupabase({ page: 1 });
  }, [
    dateFromFilter,
    dateQuickFilter,
    dateToFilter,
    domainFilter,
    phaseFilter,
    searchTerm,
    showFavoritesOnly,
    statusFilter,
    userLoading,
    userWithRole,
  ]);

  useEffect(() => {
    const trimmedSearch = searchTerm.trim();

    if (!trimmedSearch) {
      setSearchResults(null);
      setLoadingSearchResults(false);
      return;
    }

    if (userLoading) return;
    if (!userWithRole?.crmUser) {
      setSearchResults(null);
      setLoadingSearchResults(false);
      return;
    }

    const searchFilter = buildLeadSearchFilter(trimmedSearch);
    if (!searchFilter) {
      setSearchResults([]);
      setLoadingSearchResults(false);
      return;
    }
    const queryFilter = searchFilter;

    const crmUser = userWithRole.crmUser;
    let cancelled = false;

    setLoadingSearchResults(true);
    setSearchResults(null);
    setPageError(null);

    const timeoutId = window.setTimeout(() => {
      async function searchAllLeads() {
        const rows: CrmLeadRow[] = [];

        for (let from = 0; ; from += LEADS_SEARCH_PAGE_SIZE) {
          let query = supabase
            .from("crm_leads_view")
            .select("*")
            .or(queryFilter)
            .order("created_at", { ascending: false });

          if (!canViewAllLeads(crmUser)) {
            query = query.eq("comercial_name", crmUser.name);
          }

          const { data, error } = await query.range(
            from,
            from + LEADS_SEARCH_PAGE_SIZE - 1
          );

          if (cancelled) return;

          if (error) {
            console.error("Supabase global lead search error:", error);
            setSearchResults([]);
            setLoadingSearchResults(false);
            setPageError(
              "No se pudo buscar en todos los leads. Intentá nuevamente."
            );
            return;
          }

          const pageRows = (data ?? []) as CrmLeadRow[];
          rows.push(...pageRows);

          if (pageRows.length < LEADS_SEARCH_PAGE_SIZE) break;
        }

        if (cancelled) return;

        setSearchResults(rows.map((row) => mapCrmLeadToLead(row)));
        setCurrentPage(1);
        setFavoriteIds((prev) => {
          const next = new Set(prev);
          for (const row of rows) {
            if (row.is_favorite) next.add(String(row.id));
          }
          return next;
        });
        setLoadingSearchResults(false);
      }

      void searchAllLeads();
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [searchTerm, searchRefreshKey, userLoading, userWithRole]);

  useEffect(() => {
    setCurrentPage(1);
  }, [
    dateFromFilter,
    dateQuickFilter,
    dateToFilter,
    domainFilter,
    phaseFilter,
    searchTerm,
    showFavoritesOnly,
    statusFilter,
  ]);

  function clearLeadFilters() {
    setSearchTerm("");
    setShowFavoritesOnly(false);
    setDomainFilter("all");
    setPhaseFilter("all");
    setStatusFilter("all");
    setDateFilterField("fechaNoticia");
    setDateQuickFilter("all");
    setDateFromFilter("");
    setDateToFilter("");
    setDatePopoverOpen(false);
  }

  function applyDateRange(nextValue: DateQuickFilterValue, from: string, to: string) {
    setDateQuickFilter(nextValue);
    setDateFromFilter(from);
    setDateToFilter(to);
  }

  function applyTodayFilter() {
    const todayValue = toLocalDateInputValue(new Date());
    applyDateRange("custom", todayValue, todayValue);
    setDatePopoverOpen(false);
  }

  function applyTomorrowFilter() {
    const todayValue = toLocalDateInputValue(new Date());
    const tomorrowValue = addDaysToDateInputValue(todayValue, 1);
    applyDateRange("custom", tomorrowValue, tomorrowValue);
    setDatePopoverOpen(false);
  }

  function applyYesterdayFilter() {
    const todayValue = toLocalDateInputValue(new Date());
    const yesterdayValue = addDaysToDateInputValue(todayValue, -1);
    applyDateRange("custom", yesterdayValue, yesterdayValue);
    setDatePopoverOpen(false);
  }

  function applyLastDaysFilter(nextValue: "last7" | "last30") {
    const todayValue = toLocalDateInputValue(new Date());
    const daysBack = nextValue === "last7" ? 6 : 29;
    const fromValue = addDaysToDateInputValue(todayValue, -daysBack);
    applyDateRange(nextValue, fromValue, todayValue);
    setDatePopoverOpen(false);
  }

  function applyCustomDateFilter() {
    setDateQuickFilter("custom");
    setDatePopoverOpen(false);
  }

  const dateFilterLabel = useMemo(() => {
    if (dateQuickFilter === "all") return "Período (Todos)";

    let fromDate = dateFromFilter;
    let toDate = dateToFilter;

    if (dateQuickFilter === "last7" || dateQuickFilter === "last30") {
      const todayValue = toLocalDateInputValue(new Date());
      const daysBack = dateQuickFilter === "last7" ? 6 : 29;
      fromDate = addDaysToDateInputValue(todayValue, -daysBack);
      toDate = todayValue;
    }

    if (!fromDate && !toDate) return "Período (Todos)";
    if (fromDate && toDate) {
      return `${formatDateInputLabel(fromDate)} - ${formatDateInputLabel(toDate)}`;
    }
    if (fromDate) return `Desde ${formatDateInputLabel(fromDate)}`;
    return `Hasta ${formatDateInputLabel(toDate)}`;
  }, [dateQuickFilter, dateFromFilter, dateToFilter]);

  const ownerOptions = useMemo(() => {
    if (currentRole !== "comercial") return profileOptions;
    const currentName = userWithRole?.crmUser.name?.trim();
    return currentName ? [currentName] : [];
  }, [currentRole, profileOptions, userWithRole?.crmUser.name]);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const filteredLeads = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    const searchableLeads = q ? searchResults ?? leads : leads;
    const baseLeads = showFavoritesOnly
      ? searchableLeads.filter((lead) => favoriteIds.has(lead.id))
      : searchableLeads;

    return baseLeads.filter((lead) => {
      if (domainFilter !== "all" && lead.dominio !== domainFilter) return false;
      if (phaseFilter !== "all" && lead.phase !== phaseFilter) return false;
      if (statusFilter !== "all" && lead.status !== statusFilter) return false;

      const leadDateValue = lead[dateFilterField]?.slice(0, 10) || "";

      if (dateQuickFilter !== "all") {
        if (!leadDateValue) return false;

        let fromDate = dateFromFilter;
        let toDate = dateToFilter;

        if (dateQuickFilter === "last7" || dateQuickFilter === "last30") {
          const todayValue = toLocalDateInputValue(new Date());
          const daysBack = dateQuickFilter === "last7" ? 6 : 29;
          fromDate = addDaysToDateInputValue(todayValue, -daysBack);
          toDate = todayValue;
        }

        if (fromDate && leadDateValue < fromDate) return false;
        if (toDate && leadDateValue > toDate) return false;
      }

      if (!q) return true;

      return [
        lead.ownerName,
        lead.address,
        lead.distrito,
        lead.municipio,
        lead.provincia,
        lead.cp,
        lead.phone,
        lead.source,
        lead.medio,
        lead.enVenta,
        lead.month,
        lead.dominio,
        lead.planner,
        lead.owner,
        lead.buyer,
        PHASE_LABELS[lead.phase],
        getStatusConfig(lead.status).label,
        lead.valor,
        lead.hora ?? "",
        lead.fechaNoticia ?? "",
        lead.fechaContacto ?? "",
        lead.fechaValoracion ?? "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [
    leads,
    searchResults,
    searchTerm,
    showFavoritesOnly,
    favoriteIds,
    domainFilter,
    phaseFilter,
    statusFilter,
    dateFilterField,
    dateQuickFilter,
    dateFromFilter,
    dateToFilter,
  ]);

  const sortedLeads = useMemo(() => {
    if (!sortKey) return filteredLeads;

    return [...filteredLeads].sort((a, b) => {
      const av = getValue(a, sortKey);
      const bv = getValue(b, sortKey);

      if (av === "" && bv !== "") return 1;
      if (bv === "" && av !== "") return -1;

      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filteredLeads, sortKey, sortDir]);

  const isSearchPagination = Boolean(searchTerm.trim());
  const paginationTotal = isSearchPagination
    ? sortedLeads.length
    : totalLeadsCount ?? 0;
  const totalPages = Math.max(
    1,
    Math.ceil(paginationTotal / LEADS_PAGE_SIZE)
  );
  const paginationPages = getPaginationPages(totalPages, currentPage);
  const visibleTableLeads = isSearchPagination
    ? sortedLeads.slice(
        (currentPage - 1) * LEADS_PAGE_SIZE,
        currentPage * LEADS_PAGE_SIZE
      )
    : sortedLeads;

  return (
    <>
      <Topbar title="Oportunidades" />

      <main className="mt-14 flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex shrink-0 flex-col gap-3 border-b border-border bg-card px-4 py-3 lg:flex-row lg:items-center lg:justify-between lg:gap-4 lg:px-6 lg:py-2.5">
          <div className="flex w-full flex-wrap items-center gap-2 sm:gap-3 lg:w-auto lg:flex-nowrap lg:gap-4">
            <Button
              size="sm"
              variant={showFavoritesOnly ? "default" : "outline"}
              className="-ml-[calc(0.5rem+3mm)] h-8 w-8 shrink-0 p-0"
              onClick={() => setShowFavoritesOnly((prev) => !prev)}
              title="Filtrar favoritos"
              aria-label="Filtrar favoritos"
            >
              <Star
                className={cn(
                  "h-4 w-4",
                  showFavoritesOnly && "fill-current"
                )}
              />
            </Button>

            <div className="relative w-full sm:flex-1 lg:w-auto lg:flex-none">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por nombre o domicilio"
                className="h-10 w-full rounded-md border border-border bg-background pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground sm:h-8 lg:w-[260px]"
              />
            </div>

            <select
              value={domainFilter}
              onChange={(e) => setDomainFilter(e.target.value)}
              className="h-10 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-sm font-medium text-foreground outline-none sm:h-8 sm:flex-none sm:w-[170px]"
              aria-label="Filtrar por dominio"
            >
              <option value="all">Dominio (Todos)</option>
              {domainOptions.map((domain) => (
                <option key={domain} value={domain}>
                  {domain}
                </option>
              ))}
            </select>

            <select
              value={phaseFilter}
              onChange={(e) => setPhaseFilter(e.target.value as PhaseFilterValue)}
              className="h-10 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-sm font-medium text-foreground outline-none sm:h-8 sm:flex-none sm:w-[150px]"
              aria-label="Filtrar por fase"
            >
              {PHASE_FILTER_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilterValue)}
              className="h-10 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-sm font-medium text-foreground outline-none sm:h-8 sm:flex-none sm:w-[160px]"
              aria-label="Filtrar por estado"
            >
              {[
                { value: "all", label: "Estados (Todos)" },
                ...STATUS_FILTER_OPTIONS.slice(1),
              ].map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            <div className="relative w-full sm:w-auto">
              <button
                type="button"
                onClick={() => setDatePopoverOpen((prev) => !prev)}
                className="inline-flex h-10 w-full items-center justify-between gap-3 rounded-md border border-border bg-background px-3 text-left text-sm font-medium text-foreground outline-none transition hover:bg-muted/50 sm:h-8 sm:min-w-[245px] sm:w-auto"
                aria-label="Seleccionar periodo"
              >
                <span className="truncate">{dateFilterLabel}</span>
                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              </button>

              {datePopoverOpen && (
                <div className="absolute left-0 right-0 top-11 z-50 w-full max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-border bg-background shadow-2xl sm:right-auto sm:top-10 sm:w-[430px]">
                  <div className="border-b border-border bg-muted/30 p-3 sm:p-4">
                    <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Periodo de F. Noticia
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <label className="space-y-1">
                        <span className="text-[11px] font-semibold text-muted-foreground">
                          Fecha de inicio
                        </span>
                        <input
                          type="date"
                          value={dateFromFilter}
                          onChange={(e) => {
                            setDateQuickFilter("custom");
                            setDateFromFilter(e.target.value);
                          }}
                          className="h-10 w-full min-w-0 rounded-md border border-border bg-background px-2 text-xs font-medium text-foreground outline-none sm:h-9"
                        />
                      </label>
                      <label className="space-y-1">
                        <span className="text-[11px] font-semibold text-muted-foreground">
                          Fecha de fin
                        </span>
                        <input
                          type="date"
                          value={dateToFilter}
                          onChange={(e) => {
                            setDateQuickFilter("custom");
                            setDateToFilter(e.target.value);
                          }}
                          className="h-10 w-full min-w-0 rounded-md border border-border bg-background px-2 text-xs font-medium text-foreground outline-none sm:h-9"
                        />
                      </label>
                    </div>
                  </div>

                  <div className="max-h-[42vh] overflow-y-auto p-2 sm:max-h-none">
                    <button
                      type="button"
                      onClick={() => {
                        setDateQuickFilter("all");
                        setDateFromFilter("");
                        setDateToFilter("");
                        setDatePopoverOpen(false);
                      }}
                      className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm font-medium text-foreground hover:bg-muted"
                    >
                      Período (Todos)
                    </button>
                    <button
                      type="button"
                      onClick={applyTodayFilter}
                      className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm font-medium text-foreground hover:bg-muted"
                    >
                      Hoy
                    </button>
                    <button
                      type="button"
                      onClick={applyTomorrowFilter}
                      className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm font-medium text-foreground hover:bg-muted"
                    >
                      Mañana
                    </button>
                    <button
                      type="button"
                      onClick={applyYesterdayFilter}
                      className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm font-medium text-foreground hover:bg-muted"
                    >
                      Ayer
                    </button>
                    <button
                      type="button"
                      onClick={() => applyLastDaysFilter("last7")}
                      className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm font-medium text-foreground hover:bg-muted"
                    >
                      Últimos 7 días
                    </button>
                    <button
                      type="button"
                      onClick={() => applyLastDaysFilter("last30")}
                      className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm font-medium text-foreground hover:bg-muted"
                    >
                      Últimos 30 días
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2 border-t border-border bg-muted/20 p-3 sm:flex sm:items-center sm:justify-end">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-9 text-xs font-semibold sm:h-8"
                      onClick={() => setDatePopoverOpen(false)}
                    >
                      Cancelar
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      className="h-9 text-xs font-semibold sm:h-8"
                      onClick={applyCustomDateFilter}
                    >
                      Aplicar
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <Button
              type="button"
              size="sm"
              variant="outline"
              className={cn(
                "h-8 w-8 p-0",
                !(searchTerm ||
                  showFavoritesOnly ||
                  domainFilter !== "all" ||
                  phaseFilter !== "all" ||
                  statusFilter !== "all" ||
                  dateQuickFilter !== "all") &&
                  "pointer-events-none invisible"
              )}
              onClick={clearLeadFilters}
              title="Limpiar filtros"
              aria-label="Limpiar filtros"
              tabIndex={
                searchTerm ||
                showFavoritesOnly ||
                domainFilter !== "all" ||
                phaseFilter !== "all" ||
                statusFilter !== "all" ||
                dateQuickFilter !== "all"
                  ? 0
                  : -1
              }
              aria-hidden={
                !(searchTerm ||
                  showFavoritesOnly ||
                  domainFilter !== "all" ||
                  phaseFilter !== "all" ||
                  statusFilter !== "all" ||
                  dateQuickFilter !== "all")
              }
            >
              <Eraser className="h-3.5 w-3.5" />
            </Button>
          </div>

          <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto lg:flex-nowrap">
            <Button
              size="sm"
              variant="outline"
              className="h-8 w-8 p-0"
              onClick={() => {
                if (searchTerm.trim()) {
                  setSearchRefreshKey((value) => value + 1);
                  return;
                }
                void loadLeadsFromSupabase({ page: 1 });
              }}
              disabled={loadingLeads || loadingSearchResults}
              title="Refrescar tabla"
              aria-label="Refrescar tabla"
            >
              <RefreshCw
                className={cn(
                  "h-3.5 w-3.5",
                  (loadingLeads || loadingSearchResults) && "animate-spin"
                )}
              />
            </Button>

            {canEdit && (
              <Button
                size="sm"
                variant="outline"
                className="hidden h-8 w-8 p-0 sm:inline-flex"
                onClick={() => setImportOpen(true)}
                title="Importar CSV"
                aria-label="Importar CSV"
              >
                <FileUp className="h-3.5 w-3.5" />
              </Button>
            )}

            <div className="inline-flex items-center rounded-lg border border-border bg-background p-1">
              <button
                type="button"
                onClick={() => setViewMode("table")}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm font-semibold transition-colors",
                  viewMode === "table"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Table2 className="h-3.5 w-3.5" />
                Tabla
              </button>

              <button
                type="button"
                onClick={() => {
                  setViewMode("kanban");
                }}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm font-semibold transition-colors",
                  viewMode === "kanban"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                Kanban
              </button>
            </div>

            {canEdit && (
              <Button
                size="sm"
                className="hidden h-8 gap-1.5 text-sm font-semibold sm:inline-flex"
                onClick={() => setModalOpen(true)}
              >
                <Plus className="h-3.5 w-3.5" />
                Nuevo
              </Button>
            )}
          </div>
        </div>

        {pageError && (
          <div className="mx-6 mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
            {pageError}
          </div>
        )}

        {(loadingLeads || loadingSearchResults) && (
          <div className="shrink-0 border-b border-border bg-muted/40 px-6 py-2 text-xs text-muted-foreground">
            {loadingSearchResults
              ? "Buscando en todos los leads de Supabase..."
              : "Cargando leads desde Supabase..."}
          </div>
        )}

        {viewMode === "table" ? (
          <div className="relative flex-1 overflow-auto">
            <table className="w-full table-fixed border-collapse text-sm md:w-[2700px] md:[table-layout:fixed]">
              <colgroup>
                <col className="w-10 md:w-[48px]" />
                <col className="w-[28%] md:w-[230px]" />
                <col className="w-[42%] md:w-[310px]" />
                <col style={{ width: 95 }} className="hidden md:table-column" />
                <col className="w-[30%] md:w-[175px]" />
                <col style={{ width: 115 }} className="hidden md:table-column" />
                <col style={{ width: 135 }} className="hidden md:table-column" />
                <col style={{ width: 120 }} className="hidden md:table-column" />
                <col style={{ width: 120 }} className="hidden md:table-column" />
                <col style={{ width: 130 }} className="hidden md:table-column" />
                <col style={{ width: 85 }} className="hidden md:table-column" />
                <col style={{ width: 135 }} className="hidden md:table-column" />
                <col style={{ width: 105 }} className="hidden md:table-column" />
                <col style={{ width: 155 }} className="hidden md:table-column" />
                <col style={{ width: 155 }} className="hidden md:table-column" />
                <col style={{ width: 165 }} className="hidden md:table-column" />
                <col style={{ width: 150 }} className="hidden md:table-column" />
                <col style={{ width: 130 }} className="hidden md:table-column" />
                <col style={{ width: 170 }} className="hidden md:table-column" />
                <col style={{ width: 130 }} className="hidden md:table-column" />
              </colgroup>

              <thead className="sticky top-0 z-20 bg-card">
                <tr className="border-b border-border bg-card/95 text-left backdrop-blur">
                  <th className="w-10 px-2 py-2.5 md:w-9 md:px-3">
                    <span className="sr-only">Favorito</span>
                  </th>

                  <th
                    onClick={() => handleSort("ownerName")}
                    className="group cursor-pointer select-none whitespace-nowrap px-2 py-2.5 md:px-3"
                  >
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground transition-colors group-hover:text-foreground">
                      Propietario
                      <SortIcon
                        col={"ownerName"}
                        sortKey={sortKey}
                        sortDir={sortDir}
                      />
                    </span>
                  </th>
                  <th
                    onClick={() => handleSort("address")}
                    className="group cursor-pointer select-none whitespace-nowrap px-2 py-2.5 md:px-3"
                  >
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground transition-colors group-hover:text-foreground">
                      Domicilio
                      <SortIcon
                        col={"address"}
                        sortKey={sortKey}
                        sortDir={sortDir}
                      />
                    </span>
                  </th>
                  <th
                    onClick={() => handleSort("cp")}
                    className="group cursor-pointer select-none whitespace-nowrap px-3 py-2.5 hidden md:table-cell"
                  >
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground transition-colors group-hover:text-foreground">
                      CP
                      <SortIcon
                        col={"cp"}
                        sortKey={sortKey}
                        sortDir={sortDir}
                      />
                    </span>
                  </th>
                  <th
                    onClick={() => handleSort("distrito")}
                    className="group cursor-pointer select-none whitespace-nowrap px-2 py-2.5 md:px-3"
                  >
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground transition-colors group-hover:text-foreground">
                      Distrito
                      <SortIcon
                        col={"distrito"}
                        sortKey={sortKey}
                        sortDir={sortDir}
                      />
                    </span>
                  </th>
                  <th
                    onClick={() => handleSort("phase")}
                    className="group cursor-pointer select-none whitespace-nowrap px-3 py-2.5 hidden md:table-cell"
                  >
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground transition-colors group-hover:text-foreground">
                      Fase
                      <SortIcon
                        col={"phase"}
                        sortKey={sortKey}
                        sortDir={sortDir}
                      />
                    </span>
                  </th>
                  <th
                    onClick={() => handleSort("status")}
                    className="group cursor-pointer select-none whitespace-nowrap px-3 py-2.5 hidden md:table-cell"
                  >
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground transition-colors group-hover:text-foreground">
                      Estado
                      <SortIcon
                        col={"status"}
                        sortKey={sortKey}
                        sortDir={sortDir}
                      />
                    </span>
                  </th>
                  <th
                    onClick={() => handleSort("fechaNoticia")}
                    className="group cursor-pointer select-none whitespace-nowrap px-3 py-2.5 hidden md:table-cell"
                  >
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground transition-colors group-hover:text-foreground">
                      F. Noticia
                      <SortIcon
                        col={"fechaNoticia"}
                        sortKey={sortKey}
                        sortDir={sortDir}
                      />
                    </span>
                  </th>
                  <th
                    onClick={() => handleSort("fechaContacto")}
                    className="group cursor-pointer select-none whitespace-nowrap px-3 py-2.5 hidden md:table-cell"
                  >
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground transition-colors group-hover:text-foreground">
                      F. Contacto
                      <SortIcon
                        col={"fechaContacto"}
                        sortKey={sortKey}
                        sortDir={sortDir}
                      />
                    </span>
                  </th>
                  <th
                    onClick={() => handleSort("fechaValoracion")}
                    className="group cursor-pointer select-none whitespace-nowrap px-3 py-2.5 hidden md:table-cell"
                  >
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground transition-colors group-hover:text-foreground">
                      F. Valoración
                      <SortIcon
                        col={"fechaValoracion"}
                        sortKey={sortKey}
                        sortDir={sortDir}
                      />
                    </span>
                  </th>
                  <th
                    onClick={() => handleSort("hora")}
                    className="group cursor-pointer select-none whitespace-nowrap px-3 py-2.5 hidden md:table-cell"
                  >
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground transition-colors group-hover:text-foreground">
                      Hora
                      <SortIcon
                        col={"hora"}
                        sortKey={sortKey}
                        sortDir={sortDir}
                      />
                    </span>
                  </th>
                  <th
                    onClick={() => handleSort("medio")}
                    className="group cursor-pointer select-none whitespace-nowrap px-3 py-2.5 hidden md:table-cell"
                  >
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground transition-colors group-hover:text-foreground">
                      Medio
                      <SortIcon
                        col={"medio"}
                        sortKey={sortKey}
                        sortDir={sortDir}
                      />
                    </span>
                  </th>
                  <th
                    onClick={() => handleSort("month")}
                    className="group cursor-pointer select-none whitespace-nowrap px-3 py-2.5 hidden md:table-cell"
                  >
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground transition-colors group-hover:text-foreground">
                      Month
                      <SortIcon
                        col={"month"}
                        sortKey={sortKey}
                        sortDir={sortDir}
                      />
                    </span>
                  </th>
                  <th
                    onClick={() => handleSort("dominio")}
                    className="group cursor-pointer select-none whitespace-nowrap px-3 py-2.5 hidden md:table-cell"
                  >
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground transition-colors group-hover:text-foreground">
                      Dominio
                      <SortIcon
                        col={"dominio"}
                        sortKey={sortKey}
                        sortDir={sortDir}
                      />
                    </span>
                  </th>
                  <th
                    onClick={() => handleSort("planner")}
                    className="group cursor-pointer select-none whitespace-nowrap px-3 py-2.5 hidden md:table-cell"
                  >
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground transition-colors group-hover:text-foreground">
                      Planner
                      <SortIcon
                        col={"planner"}
                        sortKey={sortKey}
                        sortDir={sortDir}
                      />
                    </span>
                  </th>
                  <th
                    onClick={() => handleSort("owner")}
                    className="group cursor-pointer select-none whitespace-nowrap px-3 py-2.5 hidden md:table-cell"
                  >
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground transition-colors group-hover:text-foreground">
                      Owner
                      <SortIcon
                        col={"owner"}
                        sortKey={sortKey}
                        sortDir={sortDir}
                      />
                    </span>
                  </th>
                  <th
                    onClick={() => handleSort("source")}
                    className="group cursor-pointer select-none whitespace-nowrap px-3 py-2.5 hidden md:table-cell"
                  >
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground transition-colors group-hover:text-foreground">
                      Origen
                      <SortIcon
                        col={"source"}
                        sortKey={sortKey}
                        sortDir={sortDir}
                      />
                    </span>
                  </th>
                  <th
                    onClick={() => handleSort("valor")}
                    className="group cursor-pointer select-none whitespace-nowrap px-3 py-2.5 hidden md:table-cell"
                  >
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground transition-colors group-hover:text-foreground">
                      Valor
                      <SortIcon
                        col={"valor"}
                        sortKey={sortKey}
                        sortDir={sortDir}
                      />
                    </span>
                  </th>
                  <th
                    onClick={() => handleSort("phone")}
                    className="group cursor-pointer select-none whitespace-nowrap px-3 py-2.5 hidden md:table-cell"
                  >
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground transition-colors group-hover:text-foreground">
                      Teléfono
                      <SortIcon
                        col={"phone"}
                        sortKey={sortKey}
                        sortDir={sortDir}
                      />
                    </span>
                  </th>
                  <th
                    onClick={() => handleSort("enVenta")}
                    className="group cursor-pointer select-none whitespace-nowrap px-3 py-2.5 hidden md:table-cell"
                  >
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground transition-colors group-hover:text-foreground">
                      En Venta
                      <SortIcon
                        col={"enVenta"}
                        sortKey={sortKey}
                        sortDir={sortDir}
                      />
                    </span>
                  </th>
                </tr>
              </thead>

              <tbody className="bg-background">
                {visibleTableLeads.map((lead, i) => (
                  <tr
                    key={lead.id}
                    onClick={() => setSelectedLead(lead)}
                    className={cn(
                      "cursor-pointer border-b border-border transition-colors hover:bg-accent/60",
                      selectedLead?.id === lead.id && "bg-accent",
                      i % 2 === 0 ? "bg-card" : "bg-background"
                    )}
                  >
                    <td className="px-2 py-2.5 md:px-3">
                      <button
                        type="button"
                        disabled={!canEdit}
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleToggleFavorite(lead.id);
                        }}
                        className={cn(
                          "inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition",
                          canEdit && "hover:bg-muted hover:text-foreground",
                          !canEdit && "cursor-default"
                        )}
                        aria-label={
                          favoriteIds.has(lead.id)
                            ? "Quitar de favoritos"
                            : "Marcar como favorito"
                        }
                        title={
                          favoriteIds.has(lead.id)
                            ? "Quitar de favoritos"
                            : "Marcar como favorito"
                        }
                      >
                        <Star
                          className={cn(
                            "h-4 w-4",
                            favoriteIds.has(lead.id) &&
                              "fill-current text-amber-500"
                          )}
                        />
                      </button>
                    </td>

                    <td className="truncate whitespace-nowrap px-2 py-2.5 md:px-3">
                      <span className="font-bold text-foreground">
                        {lead.ownerName}
                      </span>
                    </td>

                    <td className="truncate whitespace-nowrap px-2 py-2.5 text-sm text-muted-foreground md:px-3">
                      {lead.address}
                    </td>

                    <td className="whitespace-nowrap px-3 py-2.5 text-sm text-muted-foreground hidden md:table-cell">
                      {lead.cp}
                    </td>

                    <td className="truncate whitespace-nowrap px-2 py-2.5 text-sm text-muted-foreground md:px-3">
                      {lead.distrito}
                    </td>

                    <td className="px-3 py-2.5 hidden md:table-cell">
                      <span
                        className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-sm font-medium whitespace-nowrap"
                        style={getPhaseBadgeStyle(lead.phase)}
                      >
                        <Circle className="h-1.5 w-1.5 fill-current" />
                        {PHASE_LABELS[lead.phase] ?? lead.phase}
                      </span>
                    </td>

                    <td className="px-3 py-2.5 hidden md:table-cell">
                      {(() => {
                        const statusConfig = getStatusConfig(lead.status);

                        return (
                          <span
                            className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-sm font-medium whitespace-nowrap"
                            style={{
                              backgroundColor: statusConfig.backgroundColor,
                              color: statusConfig.color,
                              borderColor: statusConfig.borderColor,
                            }}
                          >
                            <Circle className="h-1.5 w-1.5 fill-current" />
                            {statusConfig.label}
                          </span>
                        );
                      })()}
                    </td>

                    <td className="whitespace-nowrap px-3 py-2.5 text-sm text-muted-foreground hidden md:table-cell">
                      {fmt(lead.fechaNoticia)}
                    </td>

                    <td className="whitespace-nowrap px-3 py-2.5 text-sm text-muted-foreground hidden md:table-cell">
                      {fmt(lead.fechaContacto)}
                    </td>

                    <td className="whitespace-nowrap px-3 py-2.5 text-sm text-muted-foreground hidden md:table-cell">
                      {fmt(lead.fechaValoracion)}
                    </td>

                    <td className="whitespace-nowrap px-3 py-2.5 text-sm text-muted-foreground hidden md:table-cell">
                      {lead.hora || "—"}
                    </td>

                    <td className="px-3 py-2.5 hidden md:table-cell">
                      {lead.medio && lead.medio !== "—" ? (
                        <span
                          className="inline-flex items-center rounded-full border px-2 py-0.5 text-sm font-medium whitespace-nowrap"
                          style={getMedioBadgeStyle(lead.medio)}
                        >
                          {lead.medio}
                        </span>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </td>

                    <td className="whitespace-nowrap px-3 py-2.5 text-sm text-muted-foreground hidden md:table-cell">
                      {lead.month}
                    </td>

                    <td className="px-3 py-2.5 hidden md:table-cell">
                      {lead.dominio && lead.dominio !== "—" ? (
                        <span
                          className="inline-flex items-center rounded-full border px-2 py-0.5 text-sm font-medium whitespace-nowrap"
                          style={getDominioBadgeStyle(lead.dominio)}
                        >
                          {lead.dominio}
                        </span>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </td>

                    <td className="max-w-[110px] truncate whitespace-nowrap px-3 py-2.5 text-sm text-muted-foreground hidden md:table-cell">
                      {lead.planner ?? "—"}
                    </td>

                    <td className="px-3 py-2.5 hidden md:table-cell">
                      <div className="flex items-center gap-1.5 whitespace-nowrap">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[9px] font-semibold uppercase text-primary">
                          {lead.owner
                            .split(" ")
                            .slice(0, 2)
                            .map((n) => n[0])
                            .join("")}
                        </span>
                        <span className="max-w-[125px] truncate text-sm text-muted-foreground">
                          {lead.owner}
                        </span>
                      </div>
                    </td>

                    <td className="px-3 py-2.5 hidden md:table-cell">
                      <span
                        className="inline-flex items-center rounded-full border px-2 py-0.5 text-sm font-medium whitespace-nowrap"
                        style={getSourceBadgeStyle(lead.source)}
                      >
                        {lead.source}
                      </span>
                    </td>

                    <td className="whitespace-nowrap px-3 py-2.5 text-sm text-foreground hidden md:table-cell">
                      {lead.valor}
                    </td>

                    <td className="whitespace-nowrap px-3 py-2.5 text-sm text-muted-foreground hidden md:table-cell">
                      <MaskedPhone value={lead.phone} />
                    </td>

                    <td className="px-3 py-2.5 hidden md:table-cell">
                      <span
                        className="inline-flex items-center rounded-full border px-2 py-0.5 text-sm font-medium whitespace-nowrap"
                        style={getEnVentaBadgeStyle(lead.enVenta)}
                      >
                        {lead.enVenta}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>

              {visibleTableLeads.length === 0 && !loadingSearchResults && (
                <tbody>
                  <tr>
                    <td
                      colSpan={20}
                      className="px-6 py-10 text-center text-sm text-muted-foreground"
                    >
                      No hay leads que coincidan con la búsqueda.
                    </td>
                  </tr>
                </tbody>
              )}
            </table>

            {totalPages > 1 && (
              <nav
                className="flex flex-wrap items-center justify-center gap-1 border-t border-border bg-background px-6 py-4"
                aria-label="Paginación de oportunidades"
              >
                {paginationPages.map((page, index) => {
                  const previousPage = paginationPages[index - 1];
                  const showEllipsis = previousPage && page - previousPage > 1;

                  return (
                    <span key={page} className="inline-flex items-center gap-1">
                      {showEllipsis && (
                        <span className="px-1 text-sm text-muted-foreground">
                          ...
                        </span>
                      )}
                      <Button
                        type="button"
                        variant={page === currentPage ? "default" : "outline"}
                        size="sm"
                        className="h-8 min-w-8 px-2 text-sm font-medium"
                        onClick={() => {
                          if (isSearchPagination) {
                            setCurrentPage(page);
                          } else {
                            void loadLeadsFromSupabase({ page });
                          }
                        }}
                        disabled={loadingLeads || page === currentPage}
                        aria-current={page === currentPage ? "page" : undefined}
                        aria-label={`Ir a la página ${page}`}
                      >
                        {page}
                      </Button>
                    </span>
                  );
                })}
              </nav>
            )}
          </div>
        ) : (
          <div className="flex-1 overflow-auto px-6 py-5">
            {!loadingSearchResults && (
              <KanbanBoard
                leads={filteredLeads.filter((lead) =>
                  VALID_PHASES.includes(lead.phase)
                )}
                hideEmptyColumns={Boolean(searchTerm.trim())}
                onOpenLead={(lead) => setSelectedLead(lead)}
                onMoveLead={canEdit ? handleMoveLead : undefined}
              />
            )}
          </div>
        )}
      </main>

      <NewLeadModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        onSubmit={handleCreateLead}
        ownerOptions={ownerOptions}
        plannerOptions={profileOptions}
        buyerOptions={profileOptions}
        sourceOptions={sourceOptions}
        domainOptions={domainOptions}
      />

      <ImportLeadsCsvModal
        open={importOpen}
        onOpenChange={setImportOpen}
        onImport={handleImportCsv}
      />

      <LeadDetailPanel
        lead={selectedLead}
        onClose={() => setSelectedLead(null)}
        onSaveLead={handleSaveLead}
        readOnly={!canEdit}
        ownerOptions={ownerOptions}
        plannerOptions={profileOptions}
      />

    </>
  );
}
