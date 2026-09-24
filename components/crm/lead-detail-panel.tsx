"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useUser } from "@/lib/hooks/useUser";
import {
  X,
  Phone,
  MapPin,
  User,
  Tag,
  Circle,
  Pencil,
  MessageSquare,
  Send,
  Clock,
  Euro,
  LocateFixed,
  Loader2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { LeadDocumentationTab } from "@/components/crm/lead-documentation-tab";
import { MaskedPhone } from "@/components/crm/masked-phone";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  type Lead,
  type Observacion,
  PHASE_LABELS,
  PHASE_OPTIONS,
  STATUS_OPTIONS,
  AGENT_OPTIONS,
} from "@/lib/crm-data";
import {
  matchesOpportunityContactEvent,
  opportunityContactMetadataText,
  parseOpportunityContactMemo,
} from "@/lib/opportunity-contact-memo";

const STATUS_CONFIG = {
  activa: {
    label: "Activa",
    badgeStyle: {
      backgroundColor: "#D4EDBC",
      color: "#288158",
      borderColor: "#B7D99C",
    },
  },
  caliente: {
    label: "Caliente",
    badgeStyle: {
      backgroundColor: "#FFE5D0",
      color: "#C2410C",
      borderColor: "#FDBA74",
    },
  },
  desestimada: {
    label: "Desestimada",
    badgeStyle: {
      backgroundColor: "#F1F5F9",
      color: "#64748B",
      borderColor: "#CBD5E1",
    },
  },
} as const;

interface LeadDetailPanelProps {
  lead: Lead | null;
  onClose: () => void;
  onSaveLead: (next: Lead, changeDetails: string[]) => Promise<void>;
  readOnly?: boolean;
  ownerOptions?: string[];
  plannerOptions?: string[];
}

type LeadWithDominio = Lead & {
  dominio?: string | null;
};

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className="text-sm text-foreground">{children}</span>
    </div>
  );
}

function IconRow({
  icon: Icon,
  children,
}: {
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <div className="flex-1">{children}</div>
    </div>
  );
}

function fmtDate(d: string) {
  if (!d) return "—";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return "—";
  return dt.toLocaleDateString("es-ES", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function fmtShort(d: string) {
  if (!d) return "—";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return "—";
  return dt.toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function fmtDateTimeShort(d: string) {
  if (!d) return "—";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return "—";
  return dt.toLocaleString("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toHistoryCreatedAt(value: string) {
  if (!value) return new Date().toISOString();

  const parsed = new Date(value);
  if (!isNaN(parsed.getTime())) return parsed.toISOString();

  return `${value}T00:00:00.000Z`;
}

function stringFromUnknown(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function cleanUserDisplayName(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return trimmed.includes("@") ? trimmed.split("@")[0] : trimmed;
}

type HistoryEventType = "note" | "field_change";

type LeadHistoryEvent = {
  id: string;
  leadId: string;
  type: HistoryEventType;
  field?: keyof LeadWithDominio;
  prevValue?: string;
  newValue?: string;
  createdAt: string;
  createdBy: string;
  noteText?: string;
};

type LeadActivityEvent = {
  id: string;
  leadId: string;
  createdAt: string;
  createdBy: string;
  text: string;
  eventType?: string;
};

const NOTE_PREFIX = "[NOTA]";
const HISTORY_PREFIX = "[HISTORIAL]";
const SYSTEM_MEMO_PREFIXES = ["[VALORACION]", "[R.G.]", HISTORY_PREFIX];
const LEGACY_ACTIVITY_STARTS = [
  "agrego-una-valoracion",
  "agrego-una-r-g",
  "agrego-un-encargo",
  "agrego-una-visita",
  "edito",
  "elimino",
  "registro-llamada",
  "llamo-al-lead",
  "cambio",
];

function parseStoredMemo(memo: string) {
  const trimmed = memo.trim();
  const noteMatch = trimmed.match(/^\[NOTA\]\s*(.*?):\s*([\s\S]*)$/);
  const historyMatch = trimmed.match(/^\[HISTORIAL\]\s*(.*?):\s*([\s\S]*)$/);

  if (noteMatch) {
    return {
      kind: "note" as const,
      createdBy: noteMatch[1].trim() || "Usuario",
      text: noteMatch[2].trim(),
    };
  }

  if (historyMatch) {
    return {
      kind: "history" as const,
      createdBy: historyMatch[1].trim() || "Usuario",
      text: historyMatch[2].trim(),
    };
  }

  return {
    kind: "plain" as const,
    createdBy: "Usuario",
    text: trimmed,
  };
}

function parseSystemMemoFields(
  memo: string,
  prefix: "[VALORACION]" | "[R.G.]",
  metadata?: unknown
) {
  const parsed = parseOpportunityContactMemo(memo, prefix, metadata);
  return {
    createdBy: cleanUserDisplayName(parsed.author),
    fields: parsed.fields,
    memo: parsed.memo,
  };
}

function buildEventDateLabel(value: string | null | undefined) {
  const formatted = fmtDate(value || "");
  return formatted && formatted !== "—" ? ` para el ${formatted}` : "";
}

function isLegacyActivityMemo(memo: string) {
  const key = normalizeBadgeKey(memo.trim());
  return LEGACY_ACTIVITY_STARTS.some((prefix) => key.startsWith(prefix));
}

function isManualNoteMemo(memo: string) {
  const trimmed = memo.trim();
  return (
    Boolean(trimmed) &&
    (trimmed.startsWith(NOTE_PREFIX) ||
      (!SYSTEM_MEMO_PREFIXES.some((prefix) => trimmed.startsWith(prefix)) &&
        !isLegacyActivityMemo(trimmed)))
  );
}


type RgHistoryEvent = {
  id: string;
  numero: number;
  fecha: string;
  hora: string;
  medio: string;
  resultado: string;
  dominio: string;
  planner: string;
  owner: string;
  memo: string;
};

type ValuationHistoryEvent = {
  id: string;
  numero: number;
  fecha: string;
  hora: string;
  medio: string;
  planner: string;
  owner: string;
  dominio: string;
  resultado: string;
  memo: string;
};

type ContactHistoryEvent = {
  id: string;
  numero: number;
  fecha: string;
  hora: string;
  medio: string;
  resultado: string;
  memo: string;
};

type OpportunityContactRow = {
  id: number | string;
  created_at?: string | null;
  fecha?: string | null;
  memo?: string | null;
  resultado?: boolean | null;
  event_type?: string | null;
  actor_profile_id?: number | null;
  effective_at?: string | null;
  metadata?: unknown;
  parent_event_id?: number | string | null;
};

type OpportunityOrderRow = {
  id?: number | string;
  opportunity_id?: number | string | null;
  fecha_inicio?: string | null;
  fecha_fin?: string | null;
  pvp_inicial?: string | number | null;
  pvp_actual?: string | number | null;
  pvp_estimado?: string | number | null;
  com_vendedor?: string | number | null;
  com_comprador?: string | number | null;
  rebajas?: string | number | null;
  health?: string | null;
  memo?: string | null;
  created_at?: string | null;
};

type VisitRow = {
  id?: number | string;
  opportunity_id?: number | string | null;
  estado?: string | null;
  dominio?: string | null;
  planner?: string | null;
  owner?: string | null;
  fecha_visita?: string | null;
  hora?: string | null;
  buyer?: string | null;
  nombre_apellido?: string | null;
  telefono?: string | null;
  telefono_comprador?: string | null;
  dni?: string | null;
  vende?: boolean | string | null;
  observaciones_visita?: string | null;
  created_by?: string | null;
  created_at?: string | null;
};

type LeadDetailTab =
  | "resumen"
  | "contactos"
  | "valoracion"
  | "encargo"
  | "rg"
  | "visitas"
  | "documentacion";

type EditLeadTab = "oportunidad" | "propietario" | "inmueble";

const LEAD_DETAIL_TABS: Array<{ value: LeadDetailTab; label: string }> = [
  { value: "resumen", label: "General" },
  { value: "contactos", label: "Contactos" },
  { value: "valoracion", label: "Valoraciones" },
  { value: "encargo", label: "Encargo" },
  { value: "rg", label: "R.G." },
  { value: "visitas", label: "Visitas" },
  { value: "documentacion", label: "Docs" },
];

const EDIT_LEAD_TABS: Array<{ value: EditLeadTab; label: string }> = [
  { value: "oportunidad", label: "Oportunidad" },
  { value: "propietario", label: "Propietario" },
  { value: "inmueble", label: "Inmueble" },
];

const LEAD_DETAIL_PHASE_OPTIONS = PHASE_OPTIONS.filter((opt) =>
  ["Identificada", "Cualificada", "Valorada", "Encargo"].includes(opt.label)
);

const LEAD_DETAIL_STATUS_OPTIONS = [
  { value: "activa", label: "Activa" },
  { value: "caliente", label: "Caliente" },
  { value: "desestimada", label: "Desestimada" },
];

const LEAD_DETAIL_MEDIO_OPTIONS = ["Presencial", "Videollamada", "Teléfono"];
const PHASE_BADGE_STYLES: Record<
  string,
  { backgroundColor: string; color: string; borderColor: string }
> = {
  identificada: {
    backgroundColor: "#D4EDBC",
    color: "#298259",
    borderColor: "#B7D99C",
  },
  cualificada: {
    backgroundColor: "#94EC89",
    color: "#060905",
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

const SOURCE_BADGE_STYLES: Record<
  string,
  { backgroundColor: string; color: string; borderColor: string }
> = {
  tasatucasa: {
    backgroundColor: "#FACC15",
    color: "#111827",
    borderColor: "#EAB308",
  },
  "tasar-online": {
    backgroundColor: "#E9D5FF",
    color: "#7E22CE",
    borderColor: "#D8B4FE",
  },
  home: {
    backgroundColor: "#F1F5F9",
    color: "#475569",
    borderColor: "#CBD5E1",
  },
  "venta-online": {
    backgroundColor: "#DC2626",
    color: "#FFFFFF",
    borderColor: "#B91C1C",
  },
  "venta-alquilada": {
    backgroundColor: "#7E22CE",
    color: "#FFFFFF",
    borderColor: "#6B21A8",
  },
};

function getSourceBadgeStyle(value: string | null | undefined) {
  const key = normalizeBadgeKey(value);

  return (
    SOURCE_BADGE_STYLES[key] ?? {
      backgroundColor: "#F1F5F9",
      color: "#475569",
      borderColor: "#CBD5E1",
    }
  );
}

function normalizeBadgeKey(value: string | null | undefined) {
  return (value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "-");
}

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

function getLeadDominio(lead: Lead) {
  const extendedLead = lead as LeadWithDominio;
  const dominio = extendedLead.dominio?.trim();
  return dominio && dominio !== "—" ? dominio : "";
}

function normalizeLeadStatusKey(status: string | null | undefined) {
  const value = normalizeBadgeKey(status);

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

  if (value === "caliente") return "caliente";
  if (value === "desestimada") return "desestimada";

  return "activa";
}

function getStatusConfig(status: string) {
  return STATUS_CONFIG[normalizeLeadStatusKey(status)];
}

function normalizeValue(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

function statusLabel(value: string) {
  return (
    LEAD_DETAIL_STATUS_OPTIONS.find((o) => o.value === value)?.label ??
    STATUS_OPTIONS.find((o) => o.value === value)?.label ??
    value
  );
}

function formatEuroValue(raw: string | null | undefined): string {
  const digits = raw?.replace(/\D/g, "") ?? "";
  if (!digits) return "";

  const formatted = new Intl.NumberFormat("es-ES", {
    maximumFractionDigits: 0,
  }).format(Number(digits));

  return `${formatted} €`;
}

function phaseLabel(value: string) {
  return PHASE_LABELS[value as keyof typeof PHASE_LABELS] ?? value;
}

function fieldDisplayName(field: keyof LeadWithDominio): string {
  switch (field) {
    case "ownerName":
      return "Propietario";
    case "phone":
      return "Teléfono";
    case "address":
      return "Domicilio";
    case "distrito":
      return "Distrito";
    case "municipio":
      return "Municipio";
    case "provincia":
      return "Provincia";
    case "cp":
      return "CP";
    case "source":
      return "Origen";
    case "status":
      return "Estado";
    case "phase":
      return "Fase";
    case "valor":
      return "Valor";
    case "fechaNoticia":
      return "Fecha noticia";
    case "fechaContacto":
      return "Fecha contacto";
    case "fechaValoracion":
      return "Fecha valoración";
    case "hora":
      return "Hora";
    case "planner":
      return "Planner";
    case "owner":
      return "Owner";
    case "buyer":
      return "Buyer";
    case "medio":
      return "Medio";
    case "enVenta":
      return "En Venta";
    case "dominio":
      return "Dominio";
    case "notes":
      return "Notas";
    default:
      return String(field);
  }
}

function formatFieldValue(field: keyof LeadWithDominio, value: string) {
  if (!value) return "—";
  if (field === "status") return statusLabel(value);
  if (field === "phase") return phaseLabel(value);
  if (
    field === "fechaNoticia" ||
    field === "fechaContacto" ||
    field === "fechaValoracion"
  ) {
    return fmtShort(value);
  }
  return value;
}

function displayValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

function displayMoney(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "number") return formatEuroValue(String(value));
  return formatEuroValue(String(value)) || String(value);
}

function formValue(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value);
}

function persistedRowId(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return null;

  const id = String(value);
  if (id.startsWith("rg-") || id.startsWith("valuation-") || id.startsWith("order-")) {
    return null;
  }

  return value;
}

function statusValueFromLabel(label: string) {
  const normalized = normalizeBadgeKey(label);

  return (
    LEAD_DETAIL_STATUS_OPTIONS.find(
      (option) =>
        option.value === normalized || normalizeBadgeKey(option.label) === normalized
    )?.value || ""
  );
}

function historyDisplayValue(value: unknown) {
  const displayed = displayValue(value);
  return displayed === "—" ? "sin dato" : displayed;
}

function historyDateValue(value: string | null | undefined) {
  const formatted = fmtDate(dateOnlyValue(value));
  return formatted === "—" ? "sin fecha" : formatted;
}

function historyMoneyValue(value: unknown) {
  const displayed = displayMoney(value);
  return displayed === "—" ? "sin dato" : displayed;
}

function historyPercentValue(value: unknown) {
  const displayed = percentageValue(value);
  return displayed === "—" ? "sin dato" : displayed;
}

function buildHistoryChangeLines(
  changes: Array<{
    label: string;
    before: unknown;
    after: unknown;
    format?: (value: unknown) => string;
  }>
) {
  return changes.flatMap((change) => {
    const formatter = change.format ?? historyDisplayValue;
    const before = formatter(change.before);
    const after = formatter(change.after);
    if (before === after) return [];
    return [`${change.label} cambió de ${before} a ${after}`];
  });
}


function getPlanningLabel(dateValue: string | null | undefined) {
  if (!dateValue) return "Sin fecha";

  const normalized = dateValue.slice(0, 10);
  const today = new Date();
  const todayValue = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  if (normalized < todayValue) return "Previas";
  if (normalized > todayValue) return "Próximas";
  return "Hoy";
}

function dateOnlyValue(value: string | null | undefined) {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);

  const parsed = new Date(value);
  if (isNaN(parsed.getTime())) return "";

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function localTodayValue() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function daysBetween(start: string | null | undefined, end: string | null | undefined) {
  const startValue = dateOnlyValue(start);
  const endValue = dateOnlyValue(end);

  if (!startValue || !endValue) return "—";

  const startDate = new Date(`${startValue}T00:00:00`);
  const endDate = new Date(`${endValue}T00:00:00`);

  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) return "—";

  return String(
    Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
  );
}

function daysSince(value: string | null | undefined) {
  if (!value) return null;

  const date = new Date(value);
  if (isNaN(date.getTime())) return null;

  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const today = new Date();
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  return Math.max(
    0,
    Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
  );
}

function lastCallLabel(days: number | null) {
  if (days === null) return "Sin llamadas";
  if (days === 0) return "Hoy";
  if (days === 1) return "Ayer";
  return `Hace ${days} días`;
}

function isCallActivityText(text: string) {
  const key = normalizeBadgeKey(text);
  return key.startsWith("llamo-al-lead") || key.startsWith("registro-llamada");
}

function monthValue(value: string | null | undefined) {
  const dateValue = dateOnlyValue(value);
  return dateValue ? dateValue.slice(0, 7) : "—";
}

function percentageValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  return `${String(value).replace("%", "")} %`;
}

function SmallDataCard({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <Row label={label}>{children}</Row>
    </div>
  );
}

function LeadDetailSection({
  title,
  count,
  children,
}: {
  title: string;
  count?: number | string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-5 border-t border-border pt-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h3>
        {count !== undefined && (
          <Badge variant="secondary" className="rounded-full text-[10px]">
            {count}
          </Badge>
        )}
      </div>
      {children}
    </section>
  );
}

interface PostalCodeResult {
  cp: string;
  municipio: string;
  provincia: string;
  distrito: string | null;
}

async function fetchPostalCode(cp: string): Promise<PostalCodeResult | null> {
  try {
    const res = await fetch(`/api/postal-code/${cp}`);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

interface EditLeadModalProps {
  lead: LeadWithDominio;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSave: (next: LeadWithDominio) => Promise<void>;
  ownerOptions: string[];
  plannerOptions: string[];
}

function EditLeadModal({
  lead,
  open,
  onOpenChange,
  onSave,
  ownerOptions,
  plannerOptions,
}: EditLeadModalProps) {
  const [form, setForm] = useState({
    ...lead,
    valor: formatEuroValue(lead.valor),
  });
  const [cpLoading, setCpLoading] = useState(false);
  const [cpAutoFilled, setCpAutoFilled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [activeEditTab, setActiveEditTab] = useState<EditLeadTab>("oportunidad");

  useEffect(() => {
    setForm({
      ...lead,
      valor: formatEuroValue(lead.valor),
    });
    setCpAutoFilled(false);
    setSaveError(null);
    setActiveEditTab("oportunidad");
  }, [lead]);

  function set(field: keyof LeadWithDominio, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleValorChange(value: string) {
    set("valor", formatEuroValue(value));
  }

  const handleCpChange = useCallback(async (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 5);
    set("cp", digits);
    setCpAutoFilled(false);

    if (digits.length !== 5) return;

    setCpLoading(true);
    try {
      const result = await fetchPostalCode(digits);
      if (result) {
        set("municipio", result.municipio);
        set("provincia", result.provincia);
        if (result.distrito) set("distrito", result.distrito);
        setCpAutoFilled(true);
      }
    } finally {
      setCpLoading(false);
    }
  }, []);

  function handleDistritoChange(value: string) {
    set("distrito", value);
  }

  async function handleSave() {
    setSaving(true);
    setSaveError(null);

    try {
      await onSave(form);
      onOpenChange(false);
    } catch (error) {
      console.error("Error guardando lead:", error);
      setSaveError(
        error instanceof Error
          ? error.message
          : "No se pudieron guardar los cambios. Revisá los datos e intentá nuevamente."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-3rem)] max-w-none sm:max-w-[1180px] max-h-[92vh] overflow-hidden p-0">
        <div className="flex max-h-[92vh] flex-col">
          <DialogHeader className="shrink-0 border-b border-border px-6 py-5">
            <DialogTitle className="text-base font-semibold">
              Editar lead
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Actualiza la información del lead.
            </DialogDescription>
          </DialogHeader>

          <div className="grid min-h-0 flex-1 grid-cols-[190px_minmax(0,1fr)] overflow-hidden">
            <aside className="border-r border-border bg-muted/20 p-4">
              <div className="mb-3 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Secciones
              </div>
              <nav className="space-y-1">
                {EDIT_LEAD_TABS.map((tab) => {
                  const isActive = activeEditTab === tab.value;

                  return (
                    <button
                      key={tab.value}
                      type="button"
                      onClick={() => setActiveEditTab(tab.value)}
                      className={cn(
                        "flex h-10 w-full items-center rounded-lg px-3 text-left text-xs font-semibold uppercase tracking-wide transition",
                        isActive
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-muted-foreground hover:bg-background hover:text-foreground"
                      )}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </nav>
            </aside>

            <div className="min-h-0 overflow-y-auto px-6 py-5">
              {activeEditTab === "oportunidad" && (
                <section className="space-y-3">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Estado del lead
                    </h3>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
                      <div className="flex flex-col gap-1.5">
                        <Label className="text-xs font-medium">Fase</Label>
                        <Select value={form.phase} onValueChange={(v) => set("phase", v)}>
                          <SelectTrigger className="h-9 text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {LEAD_DETAIL_PHASE_OPTIONS.map((o) => (
                              <SelectItem key={o.value} value={o.value} className="text-sm">
                                {o.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <Label className="text-xs font-medium">Estado</Label>
                        <Select
                          value={form.status}
                          onValueChange={(v) => set("status", v)}
                        >
                          <SelectTrigger className="h-9 text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {LEAD_DETAIL_STATUS_OPTIONS.map((o) => (
                              <SelectItem key={o.value} value={o.value} className="text-sm">
                                {o.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="edit-lead-planner" className="text-xs font-medium">
                          Planner
                        </Label>
                        <Select
                          value={form.planner ?? ""}
                          onValueChange={(v) => set("planner", v)}
                        >
                          <SelectTrigger id="edit-lead-planner" className="h-9 text-sm">
                            <SelectValue placeholder="Seleccionar planner" />
                          </SelectTrigger>
                          <SelectContent>
                            {Array.from(
                              new Set(
                                [...plannerOptions, form.planner]
                                  .map((value) => value?.trim())
                                  .filter(
                                    (value): value is string =>
                                      Boolean(value) && value !== "—"
                                  )
                              )
                            ).map((agent) => (
                              <SelectItem key={agent} value={agent} className="text-sm">
                                {agent}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <Label className="text-xs font-medium">Owner</Label>
                        <Select value={form.owner} onValueChange={(v) => set("owner", v)}>
                          <SelectTrigger className="h-9 text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Array.from(
                              new Set(
                                [...ownerOptions, form.owner]
                                  .map((value) => value?.trim())
                                  .filter(
                                    (value): value is string =>
                                      Boolean(value) && value !== "—"
                                  )
                              )
                            ).map((agent) => (
                              <SelectItem key={agent} value={agent} className="text-sm">
                                {agent}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <Label className="text-xs font-medium">Buyer</Label>
                        <Select
                          value={form.buyer ?? ""}
                          onValueChange={(v) => set("buyer", v)}
                        >
                          <SelectTrigger className="h-9 text-sm">
                            <SelectValue placeholder="Seleccionar buyer" />
                          </SelectTrigger>
                          <SelectContent>
                            {Array.from(
                              new Set(
                                [...ownerOptions, form.buyer]
                                  .map((value) => value?.trim())
                                  .filter(
                                    (value): value is string =>
                                      Boolean(value) && value !== "—"
                                  )
                              )
                            ).map((agent) => (
                              <SelectItem key={agent} value={agent} className="text-sm">
                                {agent}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                </section>
              )}

              {activeEditTab === "propietario" && (
                <section className="space-y-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Datos del propietario
                  </h3>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs font-medium">Propietario</Label>
                      <Input
                        value={form.ownerName}
                        onChange={(e) => set("ownerName", e.target.value)}
                        className="h-9 text-sm"
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs font-medium">Teléfono</Label>
                      <Input
                        value={form.phone}
                        onChange={(e) => set("phone", e.target.value)}
                        className="h-9 text-sm"
                      />
                    </div>
                  </div>
                </section>
              )}

              {activeEditTab === "inmueble" && (
                <section className="space-y-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Datos del inmueble
                  </h3>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                    <div className="flex flex-col gap-1.5 md:col-span-3">
                      <Label className="text-xs font-medium">Domicilio</Label>
                      <Input
                        value={form.address}
                        onChange={(e) => set("address", e.target.value)}
                        className="h-9 text-sm"
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs font-medium">Valor</Label>
                      <Input
                        value={form.valor}
                        onChange={(e) => handleValorChange(e.target.value)}
                        className="h-9 text-sm"
                        placeholder="Ej. 450.000 €"
                        inputMode="numeric"
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs font-medium">CP</Label>
                      <div className="relative">
                        <Input
                          value={form.cp}
                          onChange={(e) => handleCpChange(e.target.value)}
                          className="h-9 pr-8 text-sm font-mono"
                          placeholder="5 dígitos"
                          maxLength={5}
                          inputMode="numeric"
                          disabled={cpLoading}
                        />
                        {cpLoading && (
                          <Loader2 className="absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-primary" />
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <Label className="flex items-center gap-1.5 text-xs font-medium">
                        Municipio
                        {cpAutoFilled && (
                          <span className="inline-flex items-center gap-0.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium leading-none text-primary">
                            <LocateFixed className="h-2.5 w-2.5" />
                            auto
                          </span>
                        )}
                      </Label>
                      <Input
                        value={form.municipio}
                        onChange={(e) => set("municipio", e.target.value)}
                        className={cn(
                          "h-9 text-sm",
                          cpAutoFilled && "border-primary/40 bg-primary/5"
                        )}
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <Label className="flex items-center gap-1.5 text-xs font-medium">
                        Distrito
                        {cpAutoFilled && (
                          <span className="inline-flex items-center gap-0.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium leading-none text-primary">
                            <LocateFixed className="h-2.5 w-2.5" />
                            auto
                          </span>
                        )}
                      </Label>
                      <Input
                        value={form.distrito}
                        onChange={(e) => handleDistritoChange(e.target.value)}
                        className={cn(
                          "h-9 text-sm",
                          cpAutoFilled && "border-primary/40 bg-primary/5"
                        )}
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <Label className="flex items-center gap-1.5 text-xs font-medium">
                        Provincia
                        {cpAutoFilled && (
                          <span className="inline-flex items-center gap-0.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium leading-none text-primary">
                            <LocateFixed className="h-2.5 w-2.5" />
                            auto
                          </span>
                        )}
                      </Label>
                      <Input
                        value={form.provincia}
                        onChange={(e) => set("provincia", e.target.value)}
                        className={cn(
                          "h-9 text-sm",
                          cpAutoFilled && "border-primary/40 bg-primary/5"
                        )}
                      />
                    </div>
                  </div>
                </section>
              )}
            </div>
          </div>
        </div>
        <div className="shrink-0 border-t border-border bg-background px-6 py-4">
          {saveError && (
            <div className="mb-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
              {saveError}
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? "Guardando..." : "Guardar"}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function LeadDetailPanel({
  lead,
  onClose,
  onSaveLead,
  readOnly = false,
  ownerOptions = AGENT_OPTIONS,
  plannerOptions = AGENT_OPTIONS,
}: LeadDetailPanelProps) {
  const { userWithRole } = useUser();
  const [editOpen, setEditOpen] = useState(false);
  const [note, setNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);
  const [noteEvents, setNoteEvents] = useState<LeadHistoryEvent[]>([]);
  const [activityEvents, setActivityEvents] = useState<LeadActivityEvent[]>([]);
  const [localLead, setLocalLead] = useState<LeadWithDominio | null>(lead as LeadWithDominio | null);
  const [orders, setOrders] = useState<OpportunityOrderRow[]>([]);
  const [visits, setVisits] = useState<VisitRow[]>([]);
  const [relatedLoading, setRelatedLoading] = useState(false);
  const [relatedError, setRelatedError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<LeadDetailTab>("resumen");
  const tabsNavRef = useRef<HTMLElement>(null);
  const [canScrollTabsLeft, setCanScrollTabsLeft] = useState(false);
  const [canScrollTabsRight, setCanScrollTabsRight] = useState(false);
  const [openRgRowId, setOpenRgRowId] = useState<string | null>(null);
  const [openContactRowId, setOpenContactRowId] = useState<string | null>(null);
  const [openValuationRowId, setOpenValuationRowId] = useState<string | null>(null);
  const [openOrderRowId, setOpenOrderRowId] = useState<string | null>(null);
  const [openVisitRowId, setOpenVisitRowId] = useState<string | null>(null);
  const [valuationModalOpen, setValuationModalOpen] = useState(false);
  const [orderModalOpen, setOrderModalOpen] = useState(false);
  const [rgModalOpen, setRgModalOpen] = useState(false);
  const [editingValuationId, setEditingValuationId] = useState<number | string | null>(null);
  const [editingOrderId, setEditingOrderId] = useState<number | string | null>(null);
  const [editingRgId, setEditingRgId] = useState<number | string | null>(null);

  const [encargoForm, setEncargoForm] = useState({
    fecha_inicio: "",
    fecha_fin: "",
    pvp_inicial: "",
    pvp_actual: "",
    pvp_estimado: "",
    com_vendedor: "",
    com_comprador: "",
    memo: "",
  });
  const [encargoSaving, setEncargoSaving] = useState(false);
  const [encargoError, setEncargoError] = useState<string | null>(null);

  const [rgForm, setRgForm] = useState({
    fecha: "",
    hora: "",
    medio: "",
    resultado: "",
    memo: "",
  });
  const [rgSaving, setRgSaving] = useState(false);
  const [rgError, setRgError] = useState<string | null>(null);
  const [rgEntries, setRgEntries] = useState<OpportunityContactRow[]>([]);
  const [contactEntries, setContactEntries] = useState<OpportunityContactRow[]>([]);

  const [valuationForm, setValuationForm] = useState({
    fecha: "",
    hora: "",
    medio: "",
  });
  const [valuationSaving, setValuationSaving] = useState(false);
  const [valuationError, setValuationError] = useState<string | null>(null);
  const [valuationEntries, setValuationEntries] = useState<OpportunityContactRow[]>([]);
  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [editingContactId, setEditingContactId] = useState<number | string | null>(null);
  const [contactSaving, setContactSaving] = useState(false);
  const [contactError, setContactError] = useState<string | null>(null);
  const [contactForm, setContactForm] = useState({ fecha: "", hora: "", medio: "", resultado: "", memo: "" });

  useEffect(() => {
    setLocalLead(lead as LeadWithDominio | null);
    setNoteError(null);
  }, [lead]);

  async function loadRelatedData(leadId: string) {
    setRelatedLoading(true);
    setRelatedError(null);

    const numericLeadId = Number(leadId);

    const [ordersResponse, visitsResponse] = await Promise.all([
      supabase
        .from("opportunity_orders")
        .select("*")
        .eq("opportunity_id", numericLeadId),
      supabase
        .from("opportunity_buyers")
        .select("*")
        .eq("opportunity_id", numericLeadId)
        .order("fecha_visita", { ascending: false }),
    ]);

    if (ordersResponse.error || visitsResponse.error) {
      console.error("Error cargando relaciones del lead:", {
        ordersError: ordersResponse.error,
        visitsError: visitsResponse.error,
      });
      setRelatedError(
        ordersResponse.error?.message ||
          visitsResponse.error?.message ||
          "No se pudieron cargar las relaciones del lead."
      );
      setOrders([]);
      setVisits([]);
      setRelatedLoading(false);
      return;
    }

    setOrders((ordersResponse.data ?? []) as OpportunityOrderRow[]);
    setVisits((visitsResponse.data ?? []) as VisitRow[]);
    setRelatedLoading(false);
  }

  useEffect(() => {
    if (!lead?.id) {
      setOrders([]);
      setVisits([]);
      setRelatedError(null);
      return;
    }

    void loadRelatedData(lead.id);
  }, [lead?.id]);

  const updateTabScrollIndicators = useCallback(() => {
    const element = tabsNavRef.current;
    if (!element) return;

    const maxScrollLeft = element.scrollWidth - element.clientWidth;
    setCanScrollTabsLeft(element.scrollLeft > 4);
    setCanScrollTabsRight(maxScrollLeft - element.scrollLeft > 4);
  }, []);

  useEffect(() => {
    const element = tabsNavRef.current;
    if (!element) return;

    updateTabScrollIndicators();
    const animationFrameId = window.requestAnimationFrame(updateTabScrollIndicators);
    const settledLayoutTimer = window.setTimeout(updateTabScrollIndicators, 120);
    element.addEventListener("scroll", updateTabScrollIndicators, { passive: true });
    window.addEventListener("resize", updateTabScrollIndicators);

    const resizeObserver =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(updateTabScrollIndicators)
        : null;
    resizeObserver?.observe(element);

    return () => {
      window.cancelAnimationFrame(animationFrameId);
      window.clearTimeout(settledLayoutTimer);
      element.removeEventListener("scroll", updateTabScrollIndicators);
      window.removeEventListener("resize", updateTabScrollIndicators);
      resizeObserver?.disconnect();
    };
  }, [localLead?.id, updateTabScrollIndicators]);

  function scrollTabs(direction: -1 | 1) {
    const element = tabsNavRef.current;
    if (!element) return;

    element.scrollBy({
      left: direction * Math.max(element.clientWidth * 0.7, 180),
      behavior: "smooth",
    });
  }

  const effectiveLead = localLead;

  const currentUserName = useMemo(() => {
    const rawUser = userWithRole as Record<string, unknown> | null | undefined;
    const rawCrmUser = rawUser?.crmUser as Record<string, unknown> | null | undefined;
    const raw =
      stringFromUnknown(rawCrmUser?.name) ||
      stringFromUnknown(rawCrmUser?.nombre) ||
      stringFromUnknown(rawCrmUser?.email) ||
      stringFromUnknown(rawUser?.full_name) ||
      stringFromUnknown(rawUser?.display_name) ||
      stringFromUnknown(rawUser?.name) ||
      stringFromUnknown(rawUser?.nombre) ||
      stringFromUnknown(rawUser?.email) ||
      "Usuario";

    return cleanUserDisplayName(raw);
  }, [userWithRole]);

  async function persistActivity(
    text: string,
    eventType: "activity" | "call" | "lead_updated" = "lead_updated",
    metadata: Record<string, unknown> = {}
  ) {
    if (!effectiveLead || readOnly) return;

    const { error } = await supabase.rpc("crm_add_contact_activity", {
      p_opportunity_id: Number(effectiveLead.id),
      p_event_type: eventType,
      p_text: text,
      p_metadata: metadata,
    });

    if (error) {
      console.error("Error guardando historial:", error);
    }
  }

  async function handleCallLead() {
    if (!effectiveLead) return;

    if (!readOnly) {
      await persistActivity("Llamó al lead", "call", {
        phone: effectiveLead.phone,
      });
      await loadObservations(effectiveLead.id);
    }
  }

  async function loadObservations(leadId: string) {
    const { data, error } = await supabase
      .from("opportunity_activities")
      .select(
        "id, created_at, fecha, memo, resultado, event_type, actor_profile_id, effective_at, metadata, parent_event_id"
      )
      .eq("opportunity_id", Number(leadId))
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error cargando observaciones:", error);
      setNoteEvents([]);
      setActivityEvents([]);
      setNoteError(`No se pudieron cargar las observaciones: ${error.message}`);
      return;
    }

    const rows = (data ?? []) as OpportunityContactRow[];

    const notes: LeadHistoryEvent[] = rows
      .filter((row) => Boolean(row.memo?.trim()))
      .filter((row) =>
        matchesOpportunityContactEvent(
          row.event_type,
          row.memo,
          "note",
          NOTE_PREFIX
        ) ||
        ((!row.event_type || row.event_type === "legacy") &&
          isManualNoteMemo(row.memo || ""))
      )
      .map((row) => ({
        id: String(row.id),
        leadId,
        type: "note",
        createdAt: row.created_at || toHistoryCreatedAt(row.fecha || ""),
        createdBy:
          opportunityContactMetadataText(row.metadata, "actor_name") ||
          parseStoredMemo(row.memo || "").createdBy,
        noteText:
          opportunityContactMetadataText(row.metadata, "text") ||
          parseStoredMemo(row.memo || "").text,
      }));

    const activities: LeadActivityEvent[] = rows
      .filter((row) => Boolean(row.memo?.trim()))
      .flatMap((row) => {
        const memo = row.memo?.trim() || "";
        const parsed = parseStoredMemo(memo);
        const createdAt = row.created_at || toHistoryCreatedAt(row.fecha || "");
        const eventType = row.event_type || "legacy";
        const actorName =
          opportunityContactMetadataText(row.metadata, "actor_name") ||
          parsed.createdBy;

        if (
          eventType !== "legacy" &&
          eventType !== "note" &&
          eventType !== "valuation" &&
          eventType !== "rg"
        ) {
          return [
            {
              id: String(row.id),
              leadId,
              createdAt,
              createdBy: actorName,
              eventType,
              text:
                opportunityContactMetadataText(row.metadata, "text") ||
                parsed.text,
            },
          ];
        }

        if (
          matchesOpportunityContactEvent(
            row.event_type,
            memo,
            "valuation",
            "[VALORACION]"
          )
        ) {
          const detail = parseSystemMemoFields(
            memo,
            "[VALORACION]",
            row.metadata
          );
          const medio = detail.fields.medio || "";
          const hora = detail.fields.hora || "";
          const details = [medio, hora ? `Hora: ${hora}` : ""].filter(Boolean).join(" | ");
          return [
            {
              id: String(row.id),
              leadId,
              createdAt,
              createdBy: detail.createdBy || parsed.createdBy,
              eventType: "valuation",
              text: `Agregó una valoración${buildEventDateLabel(row.fecha)}${
                details ? `: ${details}` : ""
              }`,
            },
          ];
        }

        if (
          matchesOpportunityContactEvent(
            row.event_type,
            memo,
            "rg",
            "[R.G.]"
          )
        ) {
          const detail = parseSystemMemoFields(memo, "[R.G.]", row.metadata);
          const medio = detail.fields.medio || "";
          const resultado = detail.fields.resultado || "";
          const hora = detail.fields.hora || "";
          const details = [
            medio,
            resultado ? `Resultado: ${resultado}` : "",
            hora ? `Hora: ${hora}` : "",
          ]
            .filter(Boolean)
            .join(" | ");
          return [
            {
              id: String(row.id),
              leadId,
              createdAt,
              createdBy: detail.createdBy || parsed.createdBy,
              eventType: "rg",
              text: `Agregó una R.G.${buildEventDateLabel(row.fecha)}${
                details ? `: ${details}` : ""
              }`,
            },
          ];
        }

        if (parsed.kind === "history" || isLegacyActivityMemo(memo)) {
          return [
            {
              id: String(row.id),
              leadId,
              createdAt,
              createdBy: parsed.createdBy,
              eventType,
              text: parsed.kind === "history" ? parsed.text : memo,
            },
          ];
        }

        return [];
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    setNoteEvents(notes);
    setActivityEvents(activities);
  }

  async function loadRgEntries(leadId: string) {
    const { data, error } = await supabase
      .from("opportunity_activities")
      .select(
        "id, created_at, fecha, memo, resultado, event_type, actor_profile_id, effective_at, metadata, parent_event_id"
      )
      .eq("opportunity_id", Number(leadId))
      .eq("event_type", "rg")
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Error cargando R.G.:", error);
      setRgEntries([]);
      return;
    }

    setRgEntries((data ?? []) as OpportunityContactRow[]);
  }

  async function loadValuationEntries(leadId: string) {
    const { data, error } = await supabase
      .from("opportunity_activities")
      .select(
        "id, created_at, fecha, memo, resultado, event_type, actor_profile_id, effective_at, metadata, parent_event_id"
      )
      .eq("opportunity_id", Number(leadId))
      .eq("event_type", "valuation")
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Error cargando valoraciones:", error);
      setValuationEntries([]);
      return;
    }

    setValuationEntries((data ?? []) as OpportunityContactRow[]);
  }

  async function loadContactEntries(leadId: string) {
    const { data, error } = await supabase
      .from("opportunity_activities")
      .select("id, created_at, fecha, memo, resultado, event_type, actor_profile_id, effective_at, metadata, parent_event_id")
      .eq("opportunity_id", Number(leadId))
      .eq("event_type", "contact")
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Error cargando contactos:", error);
      setContactEntries([]);
      return;
    }

    setContactEntries((data ?? []) as OpportunityContactRow[]);
  }

  useEffect(() => {
    if (!lead?.id) {
      setNoteEvents([]);
      setActivityEvents([]);
      setRgEntries([]);
      setValuationEntries([]);
      setContactEntries([]);
      return;
    }

    void loadObservations(lead.id);
    void loadRgEntries(lead.id);
    void loadValuationEntries(lead.id);
    void loadContactEntries(lead.id);
  }, [lead?.id, currentUserName]);

  function buildFieldChangeEvents(prev: LeadWithDominio, next: LeadWithDominio) {
    const tracked: Array<keyof LeadWithDominio> = [
      "ownerName",
      "phone",
      "address",
      "distrito",
      "municipio",
      "provincia",
      "cp",
      "valor",
      "source",
      "phase",
      "status",
      "fechaNoticia",
      "fechaContacto",
      "fechaValoracion",
      "hora",
      "medio",
      "planner",
      "dominio",
      "owner",
      "buyer",
      "enVenta",
      "notes",
    ];

    return tracked.flatMap((field) => {
      const before = normalizeValue(prev[field]);
      const after = normalizeValue(next[field]);
      if (before === after) return [];

      return [
        {
          id: `change-${next.id}-${String(field)}-${Date.now()}`,
          leadId: next.id,
          type: "field_change" as const,
          field,
          prevValue: before,
          newValue: after,
          createdAt: new Date().toISOString(),
          createdBy: currentUserName || "Usuario",
        },
      ];
    });
  }

  async function handleSave(next: LeadWithDominio) {
    if (!effectiveLead || readOnly) return;

    const changes = buildFieldChangeEvents(effectiveLead, next);
    const changeDetails = changes.map(
      (event) =>
        `Cambió ${fieldDisplayName(event.field!)} de ${formatFieldValue(
          event.field!,
          event.prevValue || ""
        )} a ${formatFieldValue(event.field!, event.newValue || "")}`
    );

    await onSaveLead(next, changeDetails);
    setLocalLead(next);

    if (changes.length > 0) {
      await loadObservations(next.id);
    }
  }

  async function handleAddNote() {
    if (!effectiveLead || readOnly || !note.trim()) return;

    const text = note.trim();
    setSavingNote(true);
    setNoteError(null);

    const { data: insertedId, error: insertError } = await supabase.rpc(
      "crm_add_contact_activity",
      {
        p_opportunity_id: Number(effectiveLead.id),
        p_event_type: "note",
        p_text: text,
        p_metadata: {},
      }
    );

    if (insertError) {
      console.error("Error guardando observación:", insertError);
      setSavingNote(false);
      setNoteError(`No se pudo guardar la observación: ${insertError.message}`);
      return;
    }

    if (!insertedId) {
      setSavingNote(false);
      setNoteError(
        "La observación no devolvió ID al guardarse. Revisá permisos/RLS de opportunity_activities."
      );
      return;
    }

    const { data: persistedRow, error: readBackError } = await supabase
      .from("opportunity_activities")
      .select(
        "id, created_at, fecha, memo, resultado, event_type, actor_profile_id, effective_at, metadata, parent_event_id"
      )
      .eq("id", insertedId)
      .maybeSingle();

    if (readBackError) {
      console.error("Error verificando observación guardada:", readBackError);
      setSavingNote(false);
      setNoteError(
        `La observación se insertó, pero no se pudo verificar: ${readBackError.message}`
      );
      return;
    }

    if (!persistedRow) {
      setSavingNote(false);
      setNoteError(
        "La observación se insertó, pero no se puede leer después. Revisá políticas RLS de SELECT en opportunity_activities."
      );
      return;
    }

    setNote("");
    await loadObservations(effectiveLead.id);
    setSavingNote(false);
  }

  function resetEncargoForm() {
    setEditingOrderId(null);
    setEncargoError(null);
    setEncargoForm({
      fecha_inicio: "",
      fecha_fin: "",
      pvp_inicial: "",
      pvp_actual: "",
      pvp_estimado: "",
      com_vendedor: "",
      com_comprador: "",
      memo: "",
    });
  }

  function resetRgForm() {
    setEditingRgId(null);
    setRgError(null);
    setRgForm({ fecha: "", hora: "", medio: "", resultado: "", memo: "" });
  }

  function resetValuationForm() {
    setEditingValuationId(null);
    setValuationError(null);
    setValuationForm({ fecha: "", hora: "", medio: "" });
  }

  function resetContactForm() {
    setEditingContactId(null);
    setContactError(null);
    setContactForm({ fecha: "", hora: "", medio: "", resultado: "", memo: "" });
  }

  function openNewEncargoModal() {
    resetEncargoForm();
    setOrderModalOpen(true);
  }

  function openEditEncargoModal(order: OpportunityOrderRow) {
    const orderId = persistedRowId(order.id);
    if (!orderId) return;

    setEditingOrderId(orderId);
    setEncargoError(null);
    setEncargoForm({
      fecha_inicio: dateOnlyValue(order.fecha_inicio),
      fecha_fin: dateOnlyValue(order.fecha_fin),
      pvp_inicial: formValue(order.pvp_inicial),
      pvp_actual: formValue(order.pvp_actual),
      pvp_estimado: formValue(order.pvp_estimado),
      com_vendedor: formValue(order.com_vendedor),
      com_comprador: formValue(order.com_comprador),
      memo: formValue(order.memo),
    });
    setOrderModalOpen(true);
  }

  function openNewRgModal() {
    resetRgForm();
    setRgModalOpen(true);
  }

  function openEditRgModal(event: RgHistoryEvent) {
    const rgId = persistedRowId(event.id);
    if (!rgId) return;

    setEditingRgId(rgId);
    setRgError(null);
    setRgForm({
      fecha: dateOnlyValue(event.fecha),
      hora: event.hora || "",
      medio: event.medio === "—" ? "" : event.medio,
      resultado: statusValueFromLabel(event.resultado),
      memo: event.memo || "",
    });
    setRgModalOpen(true);
  }

  function openNewValuationModal() {
    resetValuationForm();
    setValuationModalOpen(true);
  }

  function openEditValuationModal(event: ValuationHistoryEvent) {
    const valuationId = persistedRowId(event.id);
    if (!valuationId) return;

    setEditingValuationId(valuationId);
    setValuationError(null);
    setValuationForm({
      fecha: dateOnlyValue(event.fecha),
      hora: event.hora || "",
      medio: event.medio === "—" ? "" : event.medio,
    });
    setValuationModalOpen(true);
  }

  function openNewContactModal() {
    resetContactForm();
    setContactModalOpen(true);
  }

  function openEditContactModal(event: ContactHistoryEvent) {
    const contactId = persistedRowId(event.id);
    if (!contactId) return;
    setEditingContactId(contactId);
    setContactError(null);
    setContactForm({
      fecha: dateOnlyValue(event.fecha),
      hora: event.hora || "",
      medio: event.medio === "—" ? "" : event.medio,
      resultado: event.resultado === "—" ? "" : event.resultado,
      memo: event.memo || "",
    });
    setContactModalOpen(true);
  }

  async function handleAddEncargo() {
    if (!effectiveLead || readOnly) return;

    setEncargoSaving(true);
    setEncargoError(null);
    const wasEditing = Boolean(editingOrderId);
    const previousOrder = wasEditing
      ? orders.find((order) => String(persistedRowId(order.id)) === String(editingOrderId))
      : null;

    const payload = {
      opportunity_id: Number(effectiveLead.id),
      fecha_inicio: encargoForm.fecha_inicio || null,
      fecha_fin: encargoForm.fecha_fin || null,
      pvp_inicial: encargoForm.pvp_inicial ? Number(encargoForm.pvp_inicial) : null,
      pvp_actual: encargoForm.pvp_actual ? Number(encargoForm.pvp_actual) : null,
      pvp_estimado: encargoForm.pvp_estimado ? Number(encargoForm.pvp_estimado) : null,
      com_vendedor: encargoForm.com_vendedor ? Number(encargoForm.com_vendedor) : null,
      com_comprador: encargoForm.com_comprador ? Number(encargoForm.com_comprador) : null,
      memo: encargoForm.memo.trim() || null,
      rebajas: Number(previousOrder?.rebajas ?? 0),
    };

    const encargoChanges = previousOrder
      ? buildHistoryChangeLines([
          {
            label: "Fecha inicio",
            before: previousOrder.fecha_inicio,
            after: payload.fecha_inicio,
            format: (value) => historyDateValue(value as string | null | undefined),
          },
          {
            label: "Fecha fin",
            before: previousOrder.fecha_fin,
            after: payload.fecha_fin,
            format: (value) => historyDateValue(value as string | null | undefined),
          },
          {
            label: "PVP inicial",
            before: previousOrder.pvp_inicial,
            after: payload.pvp_inicial,
            format: historyMoneyValue,
          },
          {
            label: "PVP actual",
            before: previousOrder.pvp_actual,
            after: payload.pvp_actual,
            format: historyMoneyValue,
          },
          {
            label: "PVP estimado",
            before: previousOrder.pvp_estimado,
            after: payload.pvp_estimado,
            format: historyMoneyValue,
          },
          {
            label: "Comisión vendedor",
            before: previousOrder.com_vendedor,
            after: payload.com_vendedor,
            format: historyPercentValue,
          },
          {
            label: "Comisión comprador",
            before: previousOrder.com_comprador,
            after: payload.com_comprador,
            format: historyPercentValue,
          },
          {
            label: "Memo",
            before: previousOrder.memo,
            after: payload.memo,
          },
        ])
      : [];

    const { error } = await supabase.rpc("crm_save_order_with_activity", {
      p_order_id: editingOrderId ?? null,
      p_opportunity_id: Number(effectiveLead.id),
      p_data: payload,
      p_change_details: wasEditing
        ? encargoChanges.length
          ? `:\n${encargoChanges.join("\n")}`
          : " sin cambios visibles"
        : null,
    });

    setEncargoSaving(false);

    if (error) {
      console.error("Error guardando encargo:", error);
      setEncargoError(`No se pudo guardar el encargo: ${error.message}`);
      return;
    }

    resetEncargoForm();
    setOrderModalOpen(false);
    await loadObservations(effectiveLead.id);
    await loadRelatedData(effectiveLead.id);
  }

  async function handleAddRg() {
    if (!effectiveLead || readOnly) return;

    if (!rgForm.fecha) {
      setRgError("La fecha es obligatoria.");
      return;
    }

    setRgSaving(true);
    setRgError(null);
    const wasEditing = Boolean(editingRgId);
    const previousRg = wasEditing
      ? rgHistoryEvents.find((event) => String(persistedRowId(event.id)) === String(editingRgId))
      : null;

    const resultadoLabel =
      LEAD_DETAIL_STATUS_OPTIONS.find((option) => option.value === rgForm.resultado)
        ?.label || "—";

    const rgChanges = previousRg
      ? buildHistoryChangeLines([
          {
            label: "Fecha",
            before: previousRg.fecha,
            after: rgForm.fecha,
            format: (value) => historyDateValue(value as string | null | undefined),
          },
          { label: "Hora", before: previousRg.hora, after: rgForm.hora },
          { label: "Medio", before: previousRg.medio, after: rgForm.medio || "—" },
          { label: "Resultado", before: previousRg.resultado, after: resultadoLabel },
          { label: "Memo", before: previousRg.memo, after: rgForm.memo.trim() },
        ])
      : [];

    const { error } = await supabase.rpc("crm_save_rg_with_activity", {
      p_contact_id: editingRgId ?? null,
      p_opportunity_id: Number(effectiveLead.id),
      p_data: {
        fecha: rgForm.fecha,
        hora: rgForm.hora || null,
        medio: rgForm.medio || null,
        resultado: resultadoLabel,
        notes: rgForm.memo.trim() || null,
      },
      p_change_details: wasEditing
        ? `${buildEventDateLabel(rgForm.fecha)}${
            rgChanges.length
              ? `:\n${rgChanges.join("\n")}`
              : " sin cambios visibles"
          }`
        : null,
    });

    setRgSaving(false);

    if (error) {
      console.error("Error guardando R.G.:", error);
      setRgError(`No se pudo guardar la R.G.: ${error.message}`);
      return;
    }

    resetRgForm();
    setRgModalOpen(false);
    await loadRgEntries(effectiveLead.id);
    await loadObservations(effectiveLead.id);
  }

  async function handleAddValuation() {
    if (!effectiveLead || readOnly) return;

    if (!valuationForm.fecha) {
      setValuationError("La fecha es obligatoria.");
      return;
    }

    setValuationSaving(true);
    setValuationError(null);
    const wasEditing = Boolean(editingValuationId);
    const previousValuation = wasEditing
      ? valuationHistoryEvents.find(
          (event) => String(persistedRowId(event.id)) === String(editingValuationId)
        )
      : null;

    const valuationChanges = previousValuation
      ? buildHistoryChangeLines([
          {
            label: "Fecha",
            before: previousValuation.fecha,
            after: valuationForm.fecha,
            format: (value) => historyDateValue(value as string | null | undefined),
          },
          { label: "Hora", before: previousValuation.hora, after: valuationForm.hora },
          {
            label: "Medio",
            before: previousValuation.medio,
            after: valuationForm.medio || "—",
          },
        ])
      : [];

    const { error } = await supabase.rpc("crm_save_valuation_with_activity", {
      p_contact_id: editingValuationId ?? null,
      p_opportunity_id: Number(effectiveLead.id),
      p_data: {
        fecha: valuationForm.fecha,
        hora: valuationForm.hora || null,
        medio: valuationForm.medio || null,
      },
      p_change_details: wasEditing
        ? `${buildEventDateLabel(valuationForm.fecha)}${
            valuationChanges.length
              ? `:\n${valuationChanges.join("\n")}`
              : " sin cambios visibles"
          }`
        : null,
    });

    setValuationSaving(false);

    if (error) {
      console.error("Error guardando valoración:", error);
      setValuationError(`No se pudo guardar la valoración: ${error.message}`);
      return;
    }

    resetValuationForm();
    setValuationModalOpen(false);
    await loadValuationEntries(effectiveLead.id);
    await loadObservations(effectiveLead.id);
  }

  async function handleAddContact() {
    if (!effectiveLead || readOnly) return;
    if (!contactForm.fecha) {
      setContactError("La fecha es obligatoria.");
      return;
    }

    setContactSaving(true);
    setContactError(null);
    const previous = editingContactId
      ? contactHistoryEvents.find((event) => String(persistedRowId(event.id)) === String(editingContactId))
      : null;
    const changes = previous
      ? buildHistoryChangeLines([
          { label: "Fecha", before: previous.fecha, after: contactForm.fecha, format: (value) => historyDateValue(value as string) },
          { label: "Hora", before: previous.hora, after: contactForm.hora },
          { label: "Medio", before: previous.medio, after: contactForm.medio || "—" },
          { label: "Resultado", before: previous.resultado, after: contactForm.resultado || "—" },
          { label: "Memo", before: previous.memo, after: contactForm.memo.trim() },
        ])
      : [];

    const { error } = await supabase.rpc("crm_save_contact_with_activity", {
      p_contact_id: editingContactId ?? null,
      p_opportunity_id: Number(effectiveLead.id),
      p_data: {
        fecha: contactForm.fecha,
        hora: contactForm.hora || null,
        medio: contactForm.medio || null,
        resultado: contactForm.resultado || null,
        notes: contactForm.memo.trim() || null,
      },
      p_change_details: previous
        ? `${buildEventDateLabel(contactForm.fecha)}${changes.length ? `:\n${changes.join("\n")}` : " sin cambios visibles"}`
        : null,
    });

    setContactSaving(false);
    if (error) {
      console.error("Error guardando contacto:", error);
      setContactError(`No se pudo guardar el contacto: ${error.message}`);
      return;
    }

    resetContactForm();
    setContactModalOpen(false);
    await loadContactEntries(effectiveLead.id);
    await loadObservations(effectiveLead.id);
  }

  if (!effectiveLead) return null;

  const domicilioParts = [
    effectiveLead.address,
    effectiveLead.municipio,
    effectiveLead.cp && effectiveLead.cp !== "—" ? `(${effectiveLead.cp})` : "",
  ].filter((part) => part && part !== "—");

  const parsedRgEntries: RgHistoryEvent[] = rgEntries.map((row, index) => {
    const memoText = row.memo?.trim() || "";
    const detail = parseSystemMemoFields(memoText, "[R.G.]", row.metadata);

    return {
      id: String(row.id),
      numero: index + 1,
      fecha: row.fecha || row.created_at || "",
      hora: detail.fields.hora || "",
      medio: detail.fields.medio || "—",
      resultado: detail.fields.resultado || "—",
      dominio: getLeadDominio(effectiveLead) || "—",
      planner: effectiveLead.planner || "—",
      owner: effectiveLead.owner || "—",
      memo: detail.memo,
    };
  });

  const legacyRgEvent: RgHistoryEvent[] =
    parsedRgEntries.length === 0 && effectiveLead.fechaNoticia
      ? [
          {
            id: `rg-${effectiveLead.id}-${effectiveLead.fechaNoticia}`,
            numero: 1,
            fecha: effectiveLead.fechaNoticia,
            hora: effectiveLead.hora || "",
            medio: effectiveLead.medio || "—",
            resultado: statusLabel(effectiveLead.status),
            dominio: getLeadDominio(effectiveLead) || "—",
            planner: effectiveLead.planner || "—",
            owner: effectiveLead.owner || "—",
            memo: "R.G. derivada de la información actual del lead.",
          },
        ]
      : [];

  const rgHistoryEvents: RgHistoryEvent[] = [...parsedRgEntries, ...legacyRgEvent];

  const parsedValuationEntries: ValuationHistoryEvent[] = valuationEntries.map(
    (row, index) => {
      const memoText = row.memo?.trim() || "";
      const detail = parseSystemMemoFields(
        memoText,
        "[VALORACION]",
        row.metadata
      );

      return {
        id: String(row.id),
        numero: index + 1,
        fecha: row.fecha || row.created_at || "",
        hora: detail.fields.hora || "",
        medio: detail.fields.medio || "—",
        planner: effectiveLead.planner || "—",
        owner: effectiveLead.owner || "—",
        dominio: getLeadDominio(effectiveLead) || "—",
        resultado: statusLabel(effectiveLead.status),
        memo: detail.memo,
      };
    }
  );

  const legacyValuationEvent: ValuationHistoryEvent[] =
    parsedValuationEntries.length === 0 && effectiveLead.fechaValoracion
      ? [
          {
            id: `valuation-${effectiveLead.id}-${effectiveLead.fechaValoracion}`,
            numero: 1,
            fecha: effectiveLead.fechaValoracion,
            hora: effectiveLead.hora || "",
            medio: effectiveLead.medio || "—",
            planner: effectiveLead.planner || "—",
            owner: effectiveLead.owner || "—",
            dominio: getLeadDominio(effectiveLead) || "—",
            resultado: statusLabel(effectiveLead.status),
            memo: "Valoración derivada de la información actual del lead.",
          },
        ]
      : [];

  const valuationHistoryEvents: ValuationHistoryEvent[] = [
    ...parsedValuationEntries,
    ...legacyValuationEvent,
  ];

  const contactHistoryEvents: ContactHistoryEvent[] = contactEntries.map((row, index) => {
    const memoText = row.memo?.trim() || "";
    return {
      id: String(row.id),
      numero: index + 1,
      fecha: row.fecha || row.created_at || "",
      hora: opportunityContactMetadataText(row.metadata, "hora") || "",
      medio: opportunityContactMetadataText(row.metadata, "medio") || "—",
      resultado: opportunityContactMetadataText(row.metadata, "resultado") || "—",
      memo: opportunityContactMetadataText(row.metadata, "notes") || memoText,
    };
  });

  const callEvents = activityEvents.filter(
    (event) => event.eventType === "call" || isCallActivityText(event.text)
  );
  const lastCallEvent = callEvents[0] || null;
  const lastCallDays = daysSince(lastCallEvent?.createdAt);
  const buyerName =
    effectiveLead.buyer?.trim() ||
    visits.find((visit) => visit.buyer?.trim())?.buyer?.trim() ||
    "—";

  return (
    <aside className="fixed right-0 top-0 z-40 flex h-screen w-[1080px] max-w-[calc(100vw-1rem)] flex-col border-l border-border bg-background shadow-2xl">
      <div className="relative grid shrink-0 gap-4 border-b border-border px-5 py-4 md:grid-cols-[minmax(0,1fr)_minmax(280px,auto)] md:items-start">
        <div className="min-w-0 text-center md:text-left">
          <h2 className="truncate text-2xl font-bold tracking-tight text-foreground">
            <span className="font-normal">
              {effectiveLead.id.padStart(6, "0")} - {" "}
            </span>
            {effectiveLead.ownerName}
          </h2>
          <div className="mx-auto mt-1 h-1 w-10 rounded-full bg-primary md:mx-0" />

          {effectiveLead.phone && effectiveLead.phone !== "—" && (
            <>
              <div className="mt-2 flex items-center gap-3">
                <MaskedPhone
                  value={effectiveLead.phone}
                  className="text-xs font-medium text-muted-foreground"
                />
                <a
                  href={`tel:${effectiveLead.phone.replace(/[^+\d]/g, "")}`}
                  onClick={() => void handleCallLead()}
                  className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground shadow-sm transition hover:bg-primary/90"
                >
                  <Phone className="h-3.5 w-3.5" />
                  Llamar
                </a>
              </div>
            </>
          )}

          <div className="mt-2 flex items-baseline justify-center gap-2 md:justify-start">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Valor
            </span>
            <span className="text-sm font-bold text-foreground">
              {formatEuroValue(effectiveLead.valor) || effectiveLead.valor || "—"}
            </span>
          </div>

          <div className="mt-1 flex flex-wrap items-center justify-center gap-x-2 text-[11px] font-medium text-muted-foreground md:justify-start">
            <span>Última llamada: {lastCallLabel(lastCallDays)}</span>
            <span aria-hidden="true">·</span>
            <span>
              {callEvents.length} {callEvents.length === 1 ? "llamada realizada" : "llamadas realizadas"}
            </span>
          </div>
        </div>

        <div className="min-w-0 text-center md:pr-8 md:text-right">
          <div className="inline-flex w-full max-w-full flex-col items-start rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 text-left shadow-sm md:w-auto md:items-end md:px-4 md:py-3 md:text-right">
            <p className="max-w-full truncate text-sm font-bold leading-tight text-foreground md:text-lg">
              {effectiveLead.address || "—"}
            </p>
            <div className="mt-1 space-y-0.5 text-xs font-semibold leading-tight text-muted-foreground md:text-sm md:leading-normal">
              <p className="truncate">{effectiveLead.distrito || "—"}</p>
              <p className="truncate">{effectiveLead.cp || "—"}</p>
              <p className="truncate">{effectiveLead.provincia || "—"}</p>
            </div>
          </div>
        </div>

        <div className="absolute right-5 top-4 flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground"
            aria-label="Cerrar panel"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-border px-4 py-2.5 md:gap-1.5 md:px-5 md:py-3">
        <Badge
          variant="outline"
          className="h-6 gap-1 rounded-md px-2 text-xs font-semibold md:h-7 md:gap-1.5 md:px-3 md:text-sm"
          style={getStatusConfig(effectiveLead.status).badgeStyle}
        >
          <Circle className="h-1.5 w-1.5 fill-current md:h-2 md:w-2" />
          {getStatusConfig(effectiveLead.status).label}
        </Badge>

        <Badge
          variant="outline"
          className="h-6 rounded-md px-2 text-xs font-semibold md:h-7 md:px-3 md:text-sm"
          style={
            PHASE_BADGE_STYLES[effectiveLead.phase] ?? {
              backgroundColor: "#F1F5F9",
              color: "#475569",
              borderColor: "#CBD5E1",
            }
          }
        >
          {PHASE_LABELS[effectiveLead.phase]}
        </Badge>

        <Badge
          variant="outline"
          className="h-6 rounded-md px-2 text-xs font-semibold md:h-7 md:px-3 md:text-sm"
          style={getSourceBadgeStyle(effectiveLead.source)}
        >
          {effectiveLead.source || "—"}
        </Badge>

        <Badge
          variant="outline"
          className="h-6 rounded-md px-2 text-xs font-semibold md:h-7 md:px-3 md:text-sm"
          style={getDominioBadgeStyle(getLeadDominio(effectiveLead))}
        >
          {getLeadDominio(effectiveLead) || "Sin dominio"}
        </Badge>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 md:px-5 md:py-4">
        <div className="mt-3 border-t border-border pt-3 md:mt-5 md:pt-4">
          {relatedError && (
            <div className="mb-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
              No se pudieron cargar algunas relaciones: {relatedError}
            </div>
          )}

          <div className="space-y-3 md:space-y-4">
            <div className="relative">
              <nav
                ref={tabsNavRef}
                className="flex w-full touch-pan-x gap-1 overflow-x-auto rounded-xl border border-border bg-muted/20 p-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:grid md:grid-cols-7 md:overflow-visible"
              >
                {LEAD_DETAIL_TABS.map((tab) => {
                  const isActive = activeTab === tab.value;
                  const count =
                    tab.value === "contactos"
                      ? contactHistoryEvents.length
                      : tab.value === "encargo"
                      ? orders.length
                      : tab.value === "visitas"
                        ? visits.length
                        : tab.value === "rg"
                          ? rgHistoryEvents.length
                          : tab.value === "valoracion"
                            ? valuationHistoryEvents.length
                            : undefined;

                  return (
                    <button
                      key={tab.value}
                      type="button"
                      onClick={(event) => {
                        setActiveTab(tab.value);
                        event.currentTarget.scrollIntoView({
                          behavior: "smooth",
                          block: "nearest",
                          inline: "center",
                        });
                      }}
                      className={cn(
                        "inline-flex h-10 min-w-max flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-center text-[11px] font-semibold uppercase tracking-wide transition sm:px-4 md:min-w-0 md:px-2",
                        isActive
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      )}
                    >
                      <span>{tab.label}</span>
                      {count !== undefined && (
                        <span
                          className={cn(
                            "shrink-0 rounded-full px-1.5 py-0.5 text-[10px]",
                            isActive
                              ? "bg-primary-foreground/20 text-primary-foreground"
                              : "bg-background text-muted-foreground"
                          )}
                        >
                          {count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </nav>

              {canScrollTabsLeft && (
                <button
                  type="button"
                  onClick={() => scrollTabs(-1)}
                  className="absolute left-1 top-1/2 z-10 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background/95 text-primary shadow-md backdrop-blur transition hover:bg-muted md:hidden"
                  aria-label="Ver pestañas anteriores"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
              )}

              {canScrollTabsRight && (
                <button
                  type="button"
                  onClick={() => scrollTabs(1)}
                  className="absolute right-1 top-1/2 z-10 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background/95 text-primary shadow-md backdrop-blur transition hover:bg-muted md:hidden"
                  aria-label="Ver más pestañas"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="min-w-0 rounded-xl border border-border bg-background p-3 shadow-sm md:p-5">
              {activeTab === "resumen" && (
                <div className="space-y-3">
                  <div className="space-y-4 md:space-y-5">
                    <section className="space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Datos generales
                        </h4>
                        {!readOnly && (
                          <Button
                            type="button"
                            size="sm"
                            className="h-8 gap-1.5 bg-primary px-3 text-xs font-semibold text-primary-foreground shadow-sm hover:bg-primary/90"
                            onClick={() => setEditOpen(true)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            Editar
                          </Button>
                        )}
                      </div>
                      <div className="grid gap-3 lg:grid-cols-[3fr_2fr]">
                        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
                          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            <User className="h-3.5 w-3.5 text-primary" />
                            Responsables
                          </div>
                          <dl className="mt-3 grid grid-cols-3 gap-2 md:mt-4 md:gap-4">
                            <div className="min-w-0">
                              <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                Planner
                              </dt>
                              <dd className="mt-1 truncate text-[11px] font-semibold text-foreground md:text-sm">
                                {effectiveLead.planner || "—"}
                              </dd>
                            </div>
                            <div className="min-w-0 border-l border-border pl-2 md:pl-4">
                              <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                Owner
                              </dt>
                              <dd className="mt-1 truncate text-[11px] font-semibold text-foreground md:text-sm">
                                {effectiveLead.owner || "—"}
                              </dd>
                            </div>
                            <div className="min-w-0 border-l border-border pl-2 md:pl-4">
                              <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                Buyer
                              </dt>
                              <dd className="mt-1 truncate text-[11px] font-semibold text-foreground md:text-sm">
                                {buyerName}
                              </dd>
                            </div>
                          </dl>
                        </div>

                        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
                          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            <Clock className="h-3.5 w-3.5 text-primary" />
                            Fechas clave
                          </div>
                          <dl className="mt-3 grid grid-cols-2 gap-2 md:mt-4 md:gap-4">
                            <div className="min-w-0">
                              <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                F. Noticia
                              </dt>
                              <dd className="mt-1 truncate text-[11px] font-semibold text-foreground md:text-sm">
                                {fmtDate(effectiveLead.fechaNoticia)}
                              </dd>
                            </div>
                            <div className="min-w-0 border-l border-border pl-2 md:pl-4">
                              <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                F. Contacto
                              </dt>
                              <dd className="mt-1 truncate text-[11px] font-semibold text-foreground md:text-sm">
                                {fmtDate(effectiveLead.fechaContacto)}
                              </dd>
                            </div>
                          </dl>
                        </div>
                      </div>
                    </section>

                  </div>

                  <div className="mt-5 border-t border-border pt-4">
                    <div className="mb-3 flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        <MessageSquare className="h-3.5 w-3.5" />
                        Observaciones
                      </div>
                      <Badge variant="secondary" className="rounded-full text-[10px]">
                        {noteEvents.length}
                      </Badge>
                    </div>

                    {!readOnly && (
                      <>
                        <Textarea
                          value={note}
                          onChange={(e) => setNote(e.target.value)}
                          placeholder="Escribe una observación..."
                          className="min-h-[76px] resize-none text-sm"
                        />
                        <div className="mt-2 flex justify-end">
                          <Button
                            size="sm"
                            className="h-8 gap-1.5 text-xs"
                            onClick={handleAddNote}
                            disabled={!note.trim() || savingNote}
                          >
                            <Send className="h-3.5 w-3.5" />
                            Añadir
                          </Button>
                        </div>
                      </>
                    )}

                    {noteError && (
                      <div className="mt-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
                        {noteError}
                      </div>
                    )}

                    <div className="mt-4 space-y-3">
                      {noteEvents.length === 0 && (
                        <p className="text-xs italic text-muted-foreground">
                          Sin observaciones todavía.
                        </p>
                      )}

                      {noteEvents.map((event) => (
                        <div key={event.id} className="relative border-l border-border pl-4">
                          <span className="absolute -left-[5px] top-1 h-2.5 w-2.5 rounded-full border border-primary bg-background" />
                          <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            <span>{fmtDateTimeShort(event.createdAt)}</span>
                            <span>por {event.createdBy}</span>
                          </div>
                          <div className="rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground">
                            {event.noteText}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="mt-5 border-t border-border pt-4">
                    <div className="mb-3 flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        <Clock className="h-3.5 w-3.5" />
                        Historial
                      </div>
                      <Badge variant="secondary" className="rounded-full text-[10px]">
                        {activityEvents.length}
                      </Badge>
                    </div>

                    <div className="space-y-3">
                      {activityEvents.length === 0 && (
                        <p className="text-xs italic text-muted-foreground">
                          Sin actividad registrada todavía.
                        </p>
                      )}

                      {activityEvents.map((event) => (
                        <div key={event.id} className="relative border-l border-border pl-4">
                          <span className="absolute -left-[5px] top-1 h-2.5 w-2.5 rounded-full border border-primary bg-background" />
                          <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            <span>{fmtDateTimeShort(event.createdAt)}</span>
                            <span>por {event.createdBy}</span>
                          </div>
                          <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-foreground">
                            {event.text}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "contactos" && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Historial de contactos
                      </h3>
                      <Badge variant="secondary" className="rounded-full text-[10px]">
                        {contactHistoryEvents.length}
                      </Badge>
                    </div>
                    {!readOnly && (
                      <Button type="button" size="sm" className="h-8 text-xs" onClick={openNewContactModal}>
                        Agregar contacto
                      </Button>
                    )}
                  </div>

                  {contactHistoryEvents.length === 0 ? (
                    <div className="rounded-lg border border-border bg-card p-4">
                      <p className="text-xs italic text-muted-foreground">
                        No hay contactos registrados todavía.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {contactHistoryEvents.map((event) => {
                        const isOpen = openContactRowId === event.id;
                        return (
                          <div key={event.id} className="border-b border-border last:border-b-0">
                            <button type="button" onClick={() => setOpenContactRowId((current) => current === event.id ? null : event.id)} className="grid w-full grid-cols-[64px_1.3fr_90px_1fr_1fr_72px] items-center px-3 py-3 text-left text-sm transition hover:bg-muted/40">
                              <span className="font-semibold text-foreground">#{event.numero}</span>
                              <span className="text-foreground">{fmtDate(event.fecha)}</span>
                              <span className="text-muted-foreground">{event.hora || "—"}</span>
                              <span className="text-muted-foreground">{event.medio}</span>
                              <span className="text-muted-foreground">{event.resultado}</span>
                              <span className="flex justify-end gap-2">
                                {!readOnly && <span role="button" tabIndex={0} title="Editar contacto" aria-label="Editar contacto" className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" onClick={(clickEvent) => { clickEvent.stopPropagation(); openEditContactModal(event); }}><Pencil className="h-3.5 w-3.5" /></span>}
                                <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", isOpen && "rotate-180")} />
                              </span>
                            </button>
                            {isOpen && <div className="border-t border-border bg-muted/20 px-4 py-4"><SmallDataCard label="Observación">{event.memo || "—"}</SmallDataCard></div>}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {activeTab === "valoracion" && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
  <div className="flex items-center gap-2">
    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      Historial de valoraciones
    </h3>
    <Badge variant="secondary" className="rounded-full text-[10px]">
      {valuationHistoryEvents.length}
    </Badge>
  </div>

  {!readOnly && (
    <Button
      type="button"
      size="sm"
      className="h-8 text-xs"
      onClick={openNewValuationModal}
    >
      Agregar valoración
    </Button>
  )}
</div>

                  {valuationHistoryEvents.length === 0 ? (
                    <div className="rounded-lg border border-border bg-card p-4">
                      <p className="text-xs italic text-muted-foreground">
                        No hay valoraciones cargadas todavía.
                      </p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto rounded-lg border border-border bg-card">
                      <div className="grid min-w-[760px] grid-cols-[94px_1.3fr_90px_1fr_1fr_1fr_72px] border-b border-border bg-muted/40 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        <span>Valoración</span>
                        <span>Fecha</span>
                        <span>Hora</span>
                        <span>Medio</span>
                        <span>Planner</span>
                        <span>Resultado</span>
                        <span />
                      </div>

                      {valuationHistoryEvents.map((event) => {
                        const isOpen = openValuationRowId === event.id;

                        return (
                          <div key={event.id} className="border-b border-border last:border-b-0">
                            <button
                              type="button"
                              onClick={() =>
                                setOpenValuationRowId((current) =>
                                  current === event.id ? null : event.id
                                )
                              }
                              className="grid w-full min-w-[760px] grid-cols-[94px_1.3fr_90px_1fr_1fr_1fr_72px] items-center px-3 py-3 text-left text-sm transition hover:bg-muted/40"
                            >
                              <span className="font-semibold text-foreground">
                                #{event.numero}
                              </span>
                              <span className="text-foreground">{fmtDate(event.fecha)}</span>
                              <span className="text-muted-foreground">
                                {event.hora || "—"}
                              </span>
                              <span className="text-muted-foreground">{event.medio}</span>
                              <span className="text-muted-foreground">{event.planner}</span>
                              <span>
                                <Badge variant="outline" className="rounded-md text-[11px]">
                                  {event.resultado}
                                </Badge>
                              </span>
                              <span className="flex items-center justify-end gap-2">
                                {!readOnly && (persistedRowId(event.id) ? (
                                  <span
                                    role="button"
                                    tabIndex={0}
                                    title="Editar valoración"
                                    aria-label="Editar valoración"
                                    className="rounded p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground"
                                    onClick={(clickEvent) => {
                                      clickEvent.stopPropagation();
                                      openEditValuationModal(event);
                                    }}
                                    onKeyDown={(keyEvent) => {
                                      if (keyEvent.key !== "Enter" && keyEvent.key !== " ") return;
                                      keyEvent.preventDefault();
                                      keyEvent.stopPropagation();
                                      openEditValuationModal(event);
                                    }}
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </span>
                                ) : (
                                  <Pencil className="h-3.5 w-3.5 text-muted-foreground/40" />
                                ))}
                                <ChevronDown
                                  className={cn(
                                    "h-4 w-4 text-muted-foreground transition-transform",
                                    isOpen && "rotate-180"
                                  )}
                                />
                              </span>
                            </button>

                            {isOpen && (
                              <div className="border-t border-border bg-muted/20 px-4 py-4">
                                <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                                  <SmallDataCard label="Número valoración">
                                    #{event.numero}
                                  </SmallDataCard>
                                  <SmallDataCard label="Fecha valoración">
                                    {fmtDate(event.fecha)}
                                  </SmallDataCard>
                                  <SmallDataCard label="Hora">
                                    {event.hora || "—"}
                                  </SmallDataCard>
                                  <SmallDataCard label="Medio">
                                    {event.medio}
                                  </SmallDataCard>
                                  <SmallDataCard label="Planner">
                                    {event.planner}
                                  </SmallDataCard>
                                  <SmallDataCard label="Owner">
                                    {event.owner}
                                  </SmallDataCard>
                                  <SmallDataCard label="Dominio">
                                    {event.dominio}
                                  </SmallDataCard>
                                  <SmallDataCard label="Resultado">
                                    {event.resultado}
                                  </SmallDataCard>
                                </div>

                                <div className="mt-3 rounded-md border border-border bg-background px-3 py-2 text-xs text-muted-foreground">
                                  <span className="font-semibold uppercase tracking-wide text-foreground">
                                    Observación / memo:{" "}
                                  </span>
                                  {event.memo || "—"}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {activeTab === "encargo" && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
  <div className="flex items-center gap-2">
    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      Encargo
    </h3>
    <Badge variant="secondary" className="rounded-full text-[10px]">
      {orders.length}
    </Badge>
  </div>

  {!readOnly && (
    <Button
      type="button"
      size="sm"
      className="h-8 text-xs"
      onClick={openNewEncargoModal}
    >
      Agregar encargo
    </Button>
  )}
</div>

                  {relatedLoading ? (
                    <p className="text-xs text-muted-foreground">Cargando encargos...</p>
                  ) : orders.length === 0 ? (
                    <div className="rounded-lg border border-border bg-card p-4">
                      <p className="text-xs italic text-muted-foreground">
                        No hay encargos cargados todavía.
                      </p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto rounded-lg border border-border bg-card">
                      <div className="grid min-w-[760px] grid-cols-[84px_1.2fr_1.2fr_1fr_1fr_1fr_72px] border-b border-border bg-muted/40 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        <span>Encargo</span>
                        <span>Inicio</span>
                        <span>Fin</span>
                        <span>PVP inicial</span>
                        <span>PVP actual</span>
                        <span>Health</span>
                        <span />
                      </div>

                      {orders.map((order, index) => {
                        const rowId = String(order.id ?? `order-${index}`);
                        const isOpen = openOrderRowId === rowId;
                        const inicio = order.fecha_inicio || "";
                        const fin = order.fecha_fin || "";
                        const diasGestion = daysBetween(inicio, localTodayValue());
                        const diasRestantes = daysBetween(localTodayValue(), fin);

                        return (
                          <div key={rowId} className="border-b border-border last:border-b-0">
                            <button
                              type="button"
                              onClick={() =>
                                setOpenOrderRowId((current) =>
                                  current === rowId ? null : rowId
                                )
                              }
                              className="grid w-full min-w-[760px] grid-cols-[84px_1.2fr_1.2fr_1fr_1fr_1fr_72px] items-center px-3 py-3 text-left text-sm transition hover:bg-muted/40"
                            >
                              <span className="font-semibold text-foreground">
                                #{index + 1}
                              </span>
                              <span className="text-foreground">{fmtDate(inicio)}</span>
                              <span className="text-foreground">{fmtDate(fin)}</span>
                              <span className="text-muted-foreground">
                                {displayMoney(order.pvp_inicial)}
                              </span>
                              <span className="text-muted-foreground">
                                {displayMoney(order.pvp_actual)}
                              </span>
                              <span>
                                <Badge variant="outline" className="rounded-md text-[11px]">
                                  {displayValue(order.health || "0,0")}
                                </Badge>
                              </span>
                              <span className="flex items-center justify-end gap-2">
                                {!readOnly && (persistedRowId(order.id) ? (
                                  <span
                                    role="button"
                                    tabIndex={0}
                                    title="Editar encargo"
                                    aria-label="Editar encargo"
                                    className="rounded p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground"
                                    onClick={(clickEvent) => {
                                      clickEvent.stopPropagation();
                                      openEditEncargoModal(order);
                                    }}
                                    onKeyDown={(keyEvent) => {
                                      if (keyEvent.key !== "Enter" && keyEvent.key !== " ") return;
                                      keyEvent.preventDefault();
                                      keyEvent.stopPropagation();
                                      openEditEncargoModal(order);
                                    }}
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </span>
                                ) : (
                                  <Pencil className="h-3.5 w-3.5 text-muted-foreground/40" />
                                ))}
                                <ChevronDown
                                  className={cn(
                                    "h-4 w-4 text-muted-foreground transition-transform",
                                    isOpen && "rotate-180"
                                  )}
                                />
                              </span>
                            </button>

                            {isOpen && (
                              <div className="border-t border-border bg-muted/20 px-4 py-4">
                                <section className="space-y-3">
                                  <h5 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                    Datos del encargo #{index + 1}
                                  </h5>
                                  <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                                    <SmallDataCard label="Health">
                                      {displayValue(order.health || "0,0")}
                                    </SmallDataCard>
                                    <SmallDataCard label="Estado">
                                      {statusLabel(effectiveLead.status)}
                                    </SmallDataCard>
                                    <SmallDataCard label="Dominio">
                                      {getLeadDominio(effectiveLead) || "—"}
                                    </SmallDataCard>
                                    <SmallDataCard label="Origen">
                                      {effectiveLead.source || "—"}
                                    </SmallDataCard>
                                    <SmallDataCard label="Inicio">
                                      {fmtDate(inicio)}
                                    </SmallDataCard>
                                    <SmallDataCard label="Fin">
                                      {fmtDate(fin)}
                                    </SmallDataCard>
                                    <SmallDataCard label="Días gestión">
                                      {diasGestion}
                                    </SmallDataCard>
                                    <SmallDataCard label="Días rest.">
                                      {diasRestantes}
                                    </SmallDataCard>
                                    <SmallDataCard label="In month">
                                      {monthValue(inicio)}
                                    </SmallDataCard>
                                    <SmallDataCard label="Out month">
                                      {monthValue(fin)}
                                    </SmallDataCard>
                                  </div>
                                </section>

                                <section className="mt-5 space-y-3 border-t border-border pt-4">
                                  <h5 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                    Inmueble y responsables
                                  </h5>
                                  <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                                    <SmallDataCard label="Domicilio">
                                      {domicilioParts.length > 0 ? domicilioParts.join(", ") : "—"}
                                    </SmallDataCard>
                                    <SmallDataCard label="Propietario">
                                      {effectiveLead.ownerName || "—"}
                                    </SmallDataCard>
                                    <SmallDataCard label="Planner">
                                      {effectiveLead.planner || "—"}
                                    </SmallDataCard>
                                    <SmallDataCard label="Owner">
                                      {effectiveLead.owner || "—"}
                                    </SmallDataCard>
                                  </div>
                                </section>

                                <section className="mt-5 space-y-3 border-t border-border pt-4">
                                  <h5 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                    Comisiones y PVP
                                  </h5>
                                  <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                                    <SmallDataCard label="% vendedor">
                                      {percentageValue(order.com_vendedor)}
                                    </SmallDataCard>
                                    <SmallDataCard label="% comprador">
                                      {percentageValue(order.com_comprador)}
                                    </SmallDataCard>
                                    <SmallDataCard label="PVP inicial">
                                      {displayMoney(order.pvp_inicial)}
                                    </SmallDataCard>
                                    <SmallDataCard label="PVP actual">
                                      {displayMoney(order.pvp_actual)}
                                    </SmallDataCard>
                                    <SmallDataCard label="PVP estimado">
                                      {displayMoney(order.pvp_estimado)}
                                    </SmallDataCard>
                                    <SmallDataCard label="Rebajas">
                                      {displayValue(order.rebajas)}
                                    </SmallDataCard>
                                    <SmallDataCard label="PVP desvío">
                                      —
                                    </SmallDataCard>
                                    <SmallDataCard label="% desvío">
                                      —
                                    </SmallDataCard>
                                  </div>
                                </section>

                                <section className="mt-5 border-t border-border pt-4">
                                  <h5 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                    Memo
                                  </h5>
                                  <div className="rounded-md border border-border bg-background px-3 py-2 text-xs text-muted-foreground">
                                    {order.memo || "—"}
                                  </div>
                                </section>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {activeTab === "rg" && (
                <div className="space-y-3">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Historial R.G.
                      </h4>
                      <Badge variant="secondary" className="rounded-full text-[10px]">
                        {rgHistoryEvents.length}
                      </Badge>
                    </div>

                    {!readOnly && (
                      <Button
                        type="button"
                        size="sm"
                        className="h-8 text-xs"
                        onClick={openNewRgModal}
                      >
                        Agregar R.G.
                      </Button>
                    )}
                  </div>

                  {rgHistoryEvents.length === 0 ? (
                    <p className="text-xs italic text-muted-foreground">
                      Sin gestiones R.G. registradas todavía.
                    </p>
                  ) : (
                    <div className="overflow-x-auto rounded-lg border border-border bg-card">
                      <div className="grid min-w-[720px] grid-cols-[64px_1.3fr_90px_1fr_1fr_1fr_72px] border-b border-border bg-muted/40 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        <span>R.G.</span>
                        <span>Fecha</span>
                        <span>Hora</span>
                        <span>Medio</span>
                        <span>Resultado</span>
                        <span>Dominio</span>
                        <span />
                      </div>

                      {rgHistoryEvents.map((event) => {
                        const isOpen = openRgRowId === event.id;

                        return (
                          <div key={event.id} className="border-b border-border last:border-b-0">
                            <button
                              type="button"
                              onClick={() =>
                                setOpenRgRowId((current) =>
                                  current === event.id ? null : event.id
                                )
                              }
                              className="grid w-full min-w-[720px] grid-cols-[64px_1.3fr_90px_1fr_1fr_1fr_72px] items-center px-3 py-3 text-left text-sm transition hover:bg-muted/40"
                            >
                              <span className="font-semibold text-foreground">
                                #{event.numero}
                              </span>
                              <span className="text-foreground">{fmtDate(event.fecha)}</span>
                              <span className="text-muted-foreground">
                                {event.hora || "—"}
                              </span>
                              <span className="text-muted-foreground">{event.medio}</span>
                              <span>
                                <Badge variant="outline" className="rounded-md text-[11px]">
                                  {event.resultado}
                                </Badge>
                              </span>
                              <span className="text-muted-foreground">{event.dominio}</span>
                              <span className="flex items-center justify-end gap-2">
                                {!readOnly && (persistedRowId(event.id) ? (
                                  <span
                                    role="button"
                                    tabIndex={0}
                                    title="Editar R.G."
                                    aria-label="Editar R.G."
                                    className="rounded p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground"
                                    onClick={(clickEvent) => {
                                      clickEvent.stopPropagation();
                                      openEditRgModal(event);
                                    }}
                                    onKeyDown={(keyEvent) => {
                                      if (keyEvent.key !== "Enter" && keyEvent.key !== " ") return;
                                      keyEvent.preventDefault();
                                      keyEvent.stopPropagation();
                                      openEditRgModal(event);
                                    }}
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </span>
                                ) : (
                                  <Pencil className="h-3.5 w-3.5 text-muted-foreground/40" />
                                ))}
                                <ChevronDown
                                  className={cn(
                                    "h-4 w-4 text-muted-foreground transition-transform",
                                    isOpen && "rotate-180"
                                  )}
                                />
                              </span>
                            </button>

                            {isOpen && (
                              <div className="border-t border-border bg-muted/20 px-4 py-4">
                                <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                                  <SmallDataCard label="Número R.G.">
                                    #{event.numero}
                                  </SmallDataCard>
                                  <SmallDataCard label="Fecha R.G.">
                                    {fmtDate(event.fecha)}
                                  </SmallDataCard>
                                  <SmallDataCard label="Hora">
                                    {event.hora || "—"}
                                  </SmallDataCard>
                                  <SmallDataCard label="Medio">
                                    {event.medio}
                                  </SmallDataCard>
                                  <SmallDataCard label="Resultado">
                                    {event.resultado}
                                  </SmallDataCard>
                                  <SmallDataCard label="Dominio">
                                    {event.dominio}
                                  </SmallDataCard>
                                  <SmallDataCard label="Planner">
                                    {event.planner}
                                  </SmallDataCard>
                                  <SmallDataCard label="Owner">
                                    {event.owner}
                                  </SmallDataCard>
                                </div>

                                <div className="mt-3 rounded-md border border-border bg-background px-3 py-2 text-xs text-muted-foreground">
                                  <span className="font-semibold uppercase tracking-wide text-foreground">
                                    Observación / memo:{" "}
                                  </span>
                                  {event.memo || "—"}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {activeTab === "visitas" && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Historial de visitas
                      </h3>
                      <Badge variant="secondary" className="rounded-full text-[10px]">
                        {visits.length}
                      </Badge>
                    </div>
                  </div>

                  {relatedLoading ? (
                    <p className="text-xs text-muted-foreground">Cargando visitas...</p>
                  ) : visits.length === 0 ? (
                    <div className="rounded-lg border border-border bg-card p-4">
                      <p className="text-xs italic text-muted-foreground">
                        Sin visitas asociadas todavía.
                      </p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto rounded-lg border border-border bg-card">
                      <div className="grid min-w-[760px] grid-cols-[84px_1.2fr_90px_1fr_1fr_1fr_72px] border-b border-border bg-muted/40 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        <span>Visita</span>
                        <span>Fecha</span>
                        <span>Hora</span>
                        <span>Comprador</span>
                        <span>Teléfono</span>
                        <span>Estado</span>
                        <span />
                      </div>

                      {visits.map((visit, index) => {
                        const rowId = String(visit.id ?? `visit-${index}`);
                        const isOpen = openVisitRowId === rowId;

                        return (
                          <div key={rowId} className="border-b border-border last:border-b-0">
                            <button
                              type="button"
                              onClick={() =>
                                setOpenVisitRowId((current) =>
                                  current === rowId ? null : rowId
                                )
                              }
                              className="grid w-full min-w-[760px] grid-cols-[84px_1.2fr_90px_1fr_1fr_1fr_72px] items-center px-3 py-3 text-left text-sm transition hover:bg-muted/40"
                            >
                              <span className="font-semibold text-foreground">
                                #{index + 1}
                              </span>
                              <span className="text-foreground">
                                {fmtDate(visit.fecha_visita || "")}
                              </span>
                              <span className="text-muted-foreground">
                                {visit.hora || "—"}
                              </span>
                              <span className="text-muted-foreground">
                                {displayValue(visit.nombre_apellido || visit.buyer)}
                              </span>
                              <span className="text-muted-foreground">
                                <MaskedPhone
                                  value={visit.telefono_comprador || visit.telefono}
                                />
                              </span>
                              <span>
                                <Badge variant="outline" className="rounded-md text-[11px]">
                                  {displayValue(visit.estado)}
                                </Badge>
                              </span>
                              <span className="flex items-center justify-end gap-2">
                                <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                                <ChevronDown
                                  className={cn(
                                    "h-4 w-4 text-muted-foreground transition-transform",
                                    isOpen && "rotate-180"
                                  )}
                                />
                              </span>
                            </button>

                            {isOpen && (
                              <div className="border-t border-border bg-muted/20 px-4 py-4">
                                <section className="space-y-3">
                                  <h5 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                    Datos de la visita #{index + 1}
                                  </h5>

                                  <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                                    <SmallDataCard label="Fecha visita">
                                      {fmtDate(visit.fecha_visita || "")}
                                    </SmallDataCard>
                                    <SmallDataCard label="Hora">
                                      {visit.hora || "—"}
                                    </SmallDataCard>
                                    <SmallDataCard label="Estado">
                                      {displayValue(visit.estado)}
                                    </SmallDataCard>
                                    <SmallDataCard label="Buyer">
                                      {displayValue(visit.buyer)}
                                    </SmallDataCard>
                                    <SmallDataCard label="Nombre">
                                      {displayValue(visit.nombre_apellido)}
                                    </SmallDataCard>
                                    <SmallDataCard label="Teléfono">
                                      <MaskedPhone
                                        value={visit.telefono_comprador || visit.telefono}
                                      />
                                    </SmallDataCard>
                                    <SmallDataCard label="DNI">
                                      {displayValue(visit.dni)}
                                    </SmallDataCard>
                                    <SmallDataCard label="Vende">
                                      {displayValue(visit.vende)}
                                    </SmallDataCard>
                                    <SmallDataCard label="Planner">
                                      {displayValue(visit.planner)}
                                    </SmallDataCard>
                                    <SmallDataCard label="Owner">
                                      {displayValue(visit.owner)}
                                    </SmallDataCard>
                                    <SmallDataCard label="Dominio">
                                      {displayValue(visit.dominio)}
                                    </SmallDataCard>
                                  </div>
                                </section>

                                <section className="mt-5 border-t border-border pt-4">
                                  <h5 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                    Observaciones
                                  </h5>
                                  <div className="rounded-md border border-border bg-background px-3 py-2 text-xs text-muted-foreground">
                                    {visit.observaciones_visita || "—"}
                                  </div>
                                </section>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {activeTab === "documentacion" && (
                <LeadDocumentationTab
                  leadId={effectiveLead.id}
                  currentUserName={currentUserName}
                  readOnly={readOnly}
                />
              )}

            </div>
          </div>
        </div>
      </div>

      <div className="shrink-0 border-t border-border p-4">
        <Button variant="outline" className="w-full" onClick={onClose}>
          Cerrar
        </Button>
      </div>

      <Dialog
        open={valuationModalOpen}
        onOpenChange={(open) => {
          setValuationModalOpen(open);
          if (!open) resetValuationForm();
        }}
      >
        <DialogContent className="sm:max-w-[720px]">
          <DialogHeader>
            <DialogTitle>
              {editingValuationId ? "Editar valoración" : "Agregar valoración"}
            </DialogTitle>
            <DialogDescription>
              {editingValuationId
                ? "Actualiza los datos principales de la valoración del lead."
                : "Carga los datos principales de la valoración del lead."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-medium">Fecha valoración</Label>
              <Input
                type="date"
                className="h-9 text-sm"
                value={valuationForm.fecha}
                onChange={(e) =>
                  setValuationForm((prev) => ({ ...prev, fecha: e.target.value }))
                }
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-medium">Hora</Label>
              <Input
                type="time"
                className="h-9 text-sm"
                value={valuationForm.hora}
                onChange={(e) =>
                  setValuationForm((prev) => ({ ...prev, hora: e.target.value }))
                }
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-medium">Medio</Label>
              <Select
                value={valuationForm.medio}
                onValueChange={(value) =>
                  setValuationForm((prev) => ({ ...prev, medio: value }))
                }
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Seleccionar medio" />
                </SelectTrigger>
                <SelectContent>
                  {LEAD_DETAIL_MEDIO_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option} className="text-sm">
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {valuationError ? (
            <p className="text-sm text-destructive">{valuationError}</p>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setValuationModalOpen(false)}
              disabled={valuationSaving}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleAddValuation}
              disabled={valuationSaving}
            >
              {valuationSaving
                ? "Guardando..."
                : editingValuationId
                  ? "Actualizar valoración"
                  : "Guardar valoración"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={orderModalOpen}
        onOpenChange={(open) => {
          setOrderModalOpen(open);
          if (!open) resetEncargoForm();
        }}
      >
        <DialogContent className="sm:max-w-[820px]">
          <DialogHeader>
            <DialogTitle>{editingOrderId ? "Editar encargo" : "Agregar encargo"}</DialogTitle>
            <DialogDescription>
              {editingOrderId
                ? "Actualiza los datos principales del encargo del lead."
                : "Carga los datos principales del encargo del lead."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-medium">Fecha inicio</Label>
              <Input
                type="date"
                className="h-9 text-sm"
                value={encargoForm.fecha_inicio}
                onChange={(e) =>
                  setEncargoForm((prev) => ({ ...prev, fecha_inicio: e.target.value }))
                }
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-medium">Fecha fin</Label>
              <Input
                type="date"
                className="h-9 text-sm"
                value={encargoForm.fecha_fin}
                onChange={(e) =>
                  setEncargoForm((prev) => ({ ...prev, fecha_fin: e.target.value }))
                }
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-medium">PVP inicial</Label>
              <Input
                className="h-9 text-sm"
                placeholder="Ej. 450.000 €"
                inputMode="numeric"
                value={encargoForm.pvp_inicial}
                onChange={(e) =>
                  setEncargoForm((prev) => ({ ...prev, pvp_inicial: e.target.value }))
                }
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-medium">PVP actual</Label>
              <Input
                className="h-9 text-sm"
                placeholder="Ej. 440.000 €"
                inputMode="numeric"
                value={encargoForm.pvp_actual}
                onChange={(e) =>
                  setEncargoForm((prev) => ({ ...prev, pvp_actual: e.target.value }))
                }
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-medium">PVP estimado</Label>
              <Input
                className="h-9 text-sm"
                placeholder="Ej. 430.000 €"
                inputMode="numeric"
                value={encargoForm.pvp_estimado}
                onChange={(e) =>
                  setEncargoForm((prev) => ({ ...prev, pvp_estimado: e.target.value }))
                }
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-medium">Comisión vendedor</Label>
              <Input
                className="h-9 text-sm"
                placeholder="Ej. 3 %"
                inputMode="decimal"
                value={encargoForm.com_vendedor}
                onChange={(e) =>
                  setEncargoForm((prev) => ({ ...prev, com_vendedor: e.target.value }))
                }
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-medium">Comisión comprador</Label>
              <Input
                className="h-9 text-sm"
                placeholder="Ej. 3 %"
                inputMode="decimal"
                value={encargoForm.com_comprador}
                onChange={(e) =>
                  setEncargoForm((prev) => ({ ...prev, com_comprador: e.target.value }))
                }
              />
            </div>

            <div className="flex flex-col gap-1.5 md:col-span-2">
              <Label className="text-xs font-medium">Observación</Label>
              <Textarea
                placeholder="Observaciones del encargo..."
                className="min-h-[96px] resize-none text-sm"
                value={encargoForm.memo}
                onChange={(e) =>
                  setEncargoForm((prev) => ({ ...prev, memo: e.target.value }))
                }
              />
            </div>
          </div>

          {encargoError ? (
            <p className="text-sm text-destructive">{encargoError}</p>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOrderModalOpen(false)}
              disabled={encargoSaving}
            >
              Cancelar
            </Button>
            <Button type="button" onClick={handleAddEncargo} disabled={encargoSaving}>
              {encargoSaving
                ? "Guardando..."
                : editingOrderId
                  ? "Actualizar encargo"
                  : "Guardar encargo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={rgModalOpen}
        onOpenChange={(open) => {
          setRgModalOpen(open);
          if (!open) resetRgForm();
        }}
      >
        <DialogContent className="sm:max-w-[720px]">
          <DialogHeader>
            <DialogTitle>{editingRgId ? "Editar R.G." : "Agregar R.G."}</DialogTitle>
            <DialogDescription>
              {editingRgId
                ? "Actualiza los datos principales de la reunión de gestión del lead."
                : "Carga los datos principales de la reunión de gestión del lead."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-medium">Fecha R.G.</Label>
              <Input
                type="date"
                className="h-9 text-sm"
                value={rgForm.fecha}
                onChange={(e) => setRgForm((prev) => ({ ...prev, fecha: e.target.value }))}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-medium">Hora</Label>
              <Input
                type="time"
                className="h-9 text-sm"
                value={rgForm.hora}
                onChange={(e) => setRgForm((prev) => ({ ...prev, hora: e.target.value }))}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-medium">Medio</Label>
              <Select
                value={rgForm.medio}
                onValueChange={(value) => setRgForm((prev) => ({ ...prev, medio: value }))}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Seleccionar medio" />
                </SelectTrigger>
                <SelectContent>
                  {LEAD_DETAIL_MEDIO_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option} className="text-sm">
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-medium">Resultado</Label>
              <Select
                value={rgForm.resultado}
                onValueChange={(value) =>
                  setRgForm((prev) => ({ ...prev, resultado: value }))
                }
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Seleccionar resultado" />
                </SelectTrigger>
                <SelectContent>
                  {LEAD_DETAIL_STATUS_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value} className="text-sm">
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5 md:col-span-2">
              <Label className="text-xs font-medium">Observación</Label>
              <Textarea
                placeholder="Observaciones de la R.G..."
                className="min-h-[96px] resize-none text-sm"
                value={rgForm.memo}
                onChange={(e) => setRgForm((prev) => ({ ...prev, memo: e.target.value }))}
              />
            </div>
          </div>

          {rgError ? <p className="text-sm text-destructive">{rgError}</p> : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setRgModalOpen(false)}
              disabled={rgSaving}
            >
              Cancelar
            </Button>
            <Button type="button" onClick={handleAddRg} disabled={rgSaving}>
              {rgSaving
                ? "Guardando..."
                : editingRgId
                  ? "Actualizar R.G."
                  : "Guardar R.G."}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={contactModalOpen}
        onOpenChange={(open) => {
          setContactModalOpen(open);
          if (!open) resetContactForm();
        }}
      >
        <DialogContent className="sm:max-w-[720px]">
          <DialogHeader>
            <DialogTitle>{editingContactId ? "Editar contacto" : "Agregar contacto"}</DialogTitle>
            <DialogDescription>
              {editingContactId ? "Actualiza los datos del contacto." : "Carga los datos principales del contacto."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-1.5"><Label className="text-xs font-medium">Fecha</Label><Input type="date" className="h-9 text-sm" value={contactForm.fecha} onChange={(e) => setContactForm((prev) => ({ ...prev, fecha: e.target.value }))} /></div>
            <div className="flex flex-col gap-1.5"><Label className="text-xs font-medium">Hora</Label><Input type="time" className="h-9 text-sm" value={contactForm.hora} onChange={(e) => setContactForm((prev) => ({ ...prev, hora: e.target.value }))} /></div>
            <div className="flex flex-col gap-1.5"><Label className="text-xs font-medium">Medio</Label><Select value={contactForm.medio} onValueChange={(value) => setContactForm((prev) => ({ ...prev, medio: value }))}><SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Seleccionar medio" /></SelectTrigger><SelectContent>{LEAD_DETAIL_MEDIO_OPTIONS.map((option) => <SelectItem key={option} value={option} className="text-sm">{option}</SelectItem>)}</SelectContent></Select></div>
            <div className="flex flex-col gap-1.5"><Label className="text-xs font-medium">Resultado</Label><Input className="h-9 text-sm" placeholder="Resultado del contacto" value={contactForm.resultado} onChange={(e) => setContactForm((prev) => ({ ...prev, resultado: e.target.value }))} /></div>
            <div className="flex flex-col gap-1.5 md:col-span-2"><Label className="text-xs font-medium">Observación</Label><Textarea className="min-h-[96px] resize-none text-sm" value={contactForm.memo} onChange={(e) => setContactForm((prev) => ({ ...prev, memo: e.target.value }))} /></div>
          </div>
          {contactError && <p className="text-sm text-destructive">{contactError}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setContactModalOpen(false)} disabled={contactSaving}>Cancelar</Button>
            <Button type="button" onClick={handleAddContact} disabled={contactSaving}>{contactSaving ? "Guardando..." : editingContactId ? "Actualizar contacto" : "Guardar contacto"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <EditLeadModal
        lead={effectiveLead}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSave={handleSave}
        ownerOptions={ownerOptions}
        plannerOptions={plannerOptions}
      />
    </aside>
  );
}
