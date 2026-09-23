"use client";

import { useEffect, useMemo, useState } from "react";
import { Topbar } from "@/components/crm/topbar";
import { supabase } from "@/lib/supabase";
import { canEditLeads, canViewAllLeads, useUser } from "@/lib/hooks/useUser";
import type { Lead } from "@/lib/crm-data";
import { LeadDetailPanel } from "@/components/crm/lead-detail-panel";
import { Plus, RefreshCw, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type OpportunityOrderRow = {
  id: number;
  opportunity_id: number;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  com_vendedor: number | null;
  com_comprador: number | null;
  pvp_inicial: number | null;
  pvp_actual: number | null;
  pvp_estimado: number | null;
  memo: string | null;
  health: number | null;
  rebajas: number | null;
  created_at?: string | null;
};

type LeadRow = {
  id: number;
  created_at?: string | null;
  fecha?: string | null;
  fecha_contacto?: string | null;
  fecha_valoracion?: string | null;
  hora?: string | null;
  propietario: string | null;
  telefono?: string | null;
  domicilio: string | null;
  tasacion?: string | null;
  estado: string | null;
  dominio_desc: string | null;
  contact_name: string | null;
  comercial_name: string | null;
  source_name: string | null;
  provincia?: string | null;
  distrito?: string | null;
  cp?: number | null;
  memo?: string | null;
};

type EncargoItem = {
  id: string;
  leadId: number;
  hasOrder: boolean;
  orderId: number | null;
  propietario: string;
  domicilio: string;
  estado: string;
  dominio: string;
  planner: string;
  owner: string;
  origen: string;
  fecha_inicio: string;
  fecha_fin: string;
  pvp_inicial: number | null;
  pvp_actual: number | null;
  pvp_estimado: number | null;
  com_vendedor: number | null;
  com_comprador: number | null;
  rebajas: number;
  rg_15d: number;
  visitas_30d: number;
  memo: string;
};

function encargoDateValue(value: string | null) {
  if (!value) return "—";
  const parsed = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("es-ES");
}

function encargoMoneyValue(value: number | null) {
  if (value === null) return "—";
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}

function encargoPercentValue(value: number | null) {
  return value === null ? "—" : `${value}%`;
}

function buildEncargoChangeLines(
  previous: EncargoItem,
  next: {
    fecha_inicio: string | null;
    fecha_fin: string | null;
    pvp_inicial: number | null;
    pvp_actual: number | null;
    pvp_estimado: number | null;
    com_vendedor: number | null;
    com_comprador: number | null;
    memo: string | null;
    rebajas: number;
  }
) {
  const changes: string[] = [];
  const addChange = <T,>(label: string, before: T, after: T, format: (value: T) => string) => {
    if (before === after) return;
    changes.push(`${label}: de ${format(before)} a ${format(after)}`);
  };

  addChange(
    "Fecha inicio",
    previous.fecha_inicio || null,
    next.fecha_inicio,
    encargoDateValue
  );
  addChange("Fecha fin", previous.fecha_fin || null, next.fecha_fin, encargoDateValue);
  addChange("PVP inicial", previous.pvp_inicial, next.pvp_inicial, encargoMoneyValue);
  addChange("PVP actual", previous.pvp_actual, next.pvp_actual, encargoMoneyValue);
  addChange("PVP estimado", previous.pvp_estimado, next.pvp_estimado, encargoMoneyValue);
  addChange(
    "Comisión vendedor",
    previous.com_vendedor,
    next.com_vendedor,
    encargoPercentValue
  );
  addChange(
    "Comisión comprador",
    previous.com_comprador,
    next.com_comprador,
    encargoPercentValue
  );
  addChange("Memo", previous.memo || null, next.memo, (value) => value || "—");
  addChange("Rebajas", previous.rebajas, next.rebajas, String);

  return changes;
}

function getHealthConfig(health: number | null): { label: string; className: string } {
  if (health === null) {
    return {
      label: "—",
      className: "bg-muted text-muted-foreground border-border",
    };
  }

  const label = new Intl.NumberFormat("es-ES", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(health);

  if (health <= 4) {
    return { label, className: "bg-red-100 text-red-700 border-red-300 shadow-sm" };
  }

  if (health <= 6) {
    return { label, className: "bg-amber-100 text-amber-700 border-amber-300 shadow-sm" };
  }

  return { label, className: "bg-emerald-100 text-emerald-700 border-emerald-300 shadow-sm" };
}

function calcAvance(fechaInicio: string | null, fechaFin: string | null): number | null {
  if (!fechaInicio || !fechaFin) return null;

  const inicio = new Date(fechaInicio);
  const fin = new Date(fechaFin);
  const hoy = new Date();

  if (isNaN(inicio.getTime()) || isNaN(fin.getTime())) return null;

  const total = fin.getTime() - inicio.getTime();
  if (total <= 0) return null;

  const transcurrido = hoy.getTime() - inicio.getTime();
  return Math.min(100, Math.max(0, Math.round((transcurrido / total) * 100)));
}

function getAvanceColor(pct: number | null): string {
  if (pct === null) return "text-muted-foreground";
  if (pct < 50) return "text-emerald-600";
  if (pct < 70) return "text-amber-600";
  return "text-red-600";
}

function fmt(d: string | null) {
  if (!d) return "—";

  const parsed = new Date(d);
  if (isNaN(parsed.getTime())) return d;

  return parsed.toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}

function fmtMonth(d: string | null) {
  if (!d) return "—";
  return d.slice(0, 7);
}

function calcDias(from: string | null, to: string | null): number | null {
  if (!from || !to) return null;

  const a = new Date(from);
  const b = new Date(to);

  if (isNaN(a.getTime()) || isNaN(b.getTime())) return null;

  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

function fmtEuro(n: number | null) {
  if (n === null) return "—";

  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);
}

function fmtPct(n: number | null) {
  if (n === null) return "—";

  return new Intl.NumberFormat("es-ES", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(n) + "%";
}

function calcPvpDesvio(pvpActual: number | null, pvpEstimado: number | null): number | null {
  if (pvpActual === null || pvpEstimado === null || pvpActual <= 0) return null;
  return pvpActual - pvpEstimado;
}

function calcDesvioPct(pvpActual: number | null, pvpEstimado: number | null): number | null {
  const pvpDesvio = calcPvpDesvio(pvpActual, pvpEstimado);
  if (pvpDesvio === null || pvpActual === null || pvpActual <= 0) return null;

  return (pvpDesvio / pvpActual) * 100;
}

type HealthBreakdown = {
  health: number | null;
  scoreAvance: number;
  scoreDesvio: number;
  scoreRG: number;
  scoreVisitas: number;
};

function calcHealthBreakdown({
  diasRestantes,
  avancePct,
  desvioPct,
  rg15d,
  visitas30d,
}: {
  diasRestantes: number | null;
  avancePct: number | null;
  desvioPct: number | null;
  rg15d: number;
  visitas30d: number;
}): HealthBreakdown {
  if (diasRestantes === null || diasRestantes <= 0) {
    return {
      health: 0,
      scoreAvance: 0,
      scoreDesvio: 0,
      scoreRG: 0,
      scoreVisitas: 0,
    };
  }

  const scoreAvance =
    avancePct === null ? 0 :
    avancePct <= 50 ? 2 :
    avancePct <= 70 ? 1 :
    0;

  const scoreDesvio =
    desvioPct === null ? 0 :
    desvioPct <= 7.5 ? 4 :
    desvioPct <= 10 ? 3 :
    avancePct !== null && avancePct < 25 ? 3 :
    0;

  const scoreRG = rg15d > 1 ? 2 : rg15d > 0 ? 1 : 0;
  const scoreVisitas = visitas30d === 0 ? 0 : visitas30d <= 4 ? 1 : 2;

  return {
    health: scoreAvance + scoreDesvio + scoreRG + scoreVisitas,
    scoreAvance,
    scoreDesvio,
    scoreRG,
    scoreVisitas,
  };
}

function calcHealthBySheetRule({
  diasRestantes,
  avancePct,
  desvioPct,
  rg15d,
  visitas30d,
}: {
  diasRestantes: number | null;
  avancePct: number | null;
  desvioPct: number | null;
  rg15d: number;
  visitas30d: number;
}): number | null {
  return calcHealthBreakdown({
    diasRestantes,
    avancePct,
    desvioPct,
    rg15d,
    visitas30d,
  }).health;
}

function getRebajasColor(rebajas: number): string {
  if (rebajas === 0) return "text-red-600";
  if (rebajas === 1) return "text-amber-600";
  return "text-emerald-600";
}

function getActivityColor(value: number): string {
  if (value === 0) return "text-red-600";
  if (value === 1) return "text-amber-600";
  return "text-emerald-600";
}

function buildHealthTitle({
  health,
  avancePct,
  desvioPct,
  rg15d,
  visitas30d,
}: {
  health: number | null;
  avancePct: number | null;
  desvioPct: number | null;
  rg15d: number;
  visitas30d: number;
}): string {
  if (health === null) return "Health no calculado";

  const breakdown = calcHealthBreakdown({
    diasRestantes: 1,
    avancePct,
    desvioPct,
    rg15d,
    visitas30d,
  });

  return `Health ${fmtPct(health).replace("%", "")} · Avance +${breakdown.scoreAvance} · Desvío +${breakdown.scoreDesvio} · RG +${breakdown.scoreRG} · Visitas +${breakdown.scoreVisitas}`;
}

function HealthBreakdownCard({ item }: { item: EncargoItem }) {
  const hoy = new Date().toISOString().slice(0, 10);
  const diasRestantes = calcDias(hoy, item.fecha_fin);
  const avancePct = calcAvance(item.fecha_inicio, item.fecha_fin);
  const desvioPct = calcDesvioPct(item.pvp_actual, item.pvp_estimado);
  const breakdown = calcHealthBreakdown({
    diasRestantes,
    avancePct,
    desvioPct,
    rg15d: item.rg_15d,
    visitas30d: item.visitas_30d,
  });
  const healthCfg = getHealthConfig(breakdown.health);

  const rows = [
    {
      label: "% Avance",
      value: avancePct !== null ? `${avancePct}%` : "—",
      score: breakdown.scoreAvance,
    },
    {
      label: "% Desvío",
      value: fmtPct(desvioPct),
      score: breakdown.scoreDesvio,
    },
    {
      label: "R.G. 15 días",
      value: String(item.rg_15d),
      score: breakdown.scoreRG,
    },
    {
      label: "Visitas 30 días",
      value: String(item.visitas_30d),
      score: breakdown.scoreVisitas,
    },
  ];

  return (
    <div className="rounded-lg border border-border bg-muted/20 p-3 sm:col-span-2 sm:p-4">
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Health del encargo</p>
          <p className="mt-1 text-xs text-muted-foreground">Desglose informativo del score calculado.</p>
        </div>
        <span
          className={cn(
            "inline-flex w-fit min-w-12 items-center justify-center rounded-full border px-3 py-1.5 text-sm font-bold",
            healthCfg.className
          )}
        >
          {healthCfg.label}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {rows.map((row) => (
          <div key={row.label} className="rounded-md border border-border bg-background px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">{row.label}</span>
              <span className="text-xs font-medium text-foreground">{row.value}</span>
            </div>
            <div className="mt-1 text-xs font-semibold text-foreground">+{row.score}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function EncargosPage() {
  const { userWithRole } = useUser();
  const canEdit = Boolean(userWithRole?.crmUser && canEditLeads(userWithRole.crmUser));
  const [items, setItems] = useState<EncargoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [selected, setSelected] = useState<EncargoItem | null>(null);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [createLeadId, setCreateLeadId] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [editForm, setEditForm] = useState({
    fecha_inicio: "",
    fecha_fin: "",
    pvp_inicial: "",
    pvp_actual: "",
    pvp_estimado: "",
    com_vendedor: "",
    com_comprador: "",
    memo: "",
  });

  function resetEditForm() {
    setEditForm({
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

  function setField(field: keyof typeof editForm, value: string) {
    setEditForm((prev) => ({ ...prev, [field]: value }));
  }

  function validateForm(): string | null {
    const fechaInicio = editForm.fecha_inicio ? new Date(editForm.fecha_inicio) : null;
    const fechaFin = editForm.fecha_fin ? new Date(editForm.fecha_fin) : null;

    if (fechaInicio && fechaFin && fechaFin < fechaInicio) {
      return "La fecha fin no puede ser anterior a la fecha inicio.";
    }

    const numericFields = [
      { label: "PVP inicial", value: editForm.pvp_inicial },
      { label: "PVP actual", value: editForm.pvp_actual },
      { label: "PVP estimado", value: editForm.pvp_estimado },
      { label: "% vendedor", value: editForm.com_vendedor },
      { label: "% comprador", value: editForm.com_comprador },
    ];

    for (const field of numericFields) {
      if (!field.value) continue;

      const parsed = Number(field.value);

      if (!Number.isFinite(parsed)) {
        return `${field.label} debe ser un número válido.`;
      }

      if (parsed < 0) {
        return `${field.label} no puede ser negativo.`;
      }
    }

    const comVendedor = editForm.com_vendedor ? Number(editForm.com_vendedor) : null;
    const comComprador = editForm.com_comprador ? Number(editForm.com_comprador) : null;

    if (comVendedor !== null && comVendedor > 100) {
      return "% vendedor no puede ser mayor a 100.";
    }

    if (comComprador !== null && comComprador > 100) {
      return "% comprador no puede ser mayor a 100.";
    }

    return null;
  }

  async function loadEncargos() {
    setLoading(true);
    setPageError(null);

    const nombre = userWithRole?.crmUser.name;

    const [phaseLeadsResult, ordersResult] = await Promise.all([
      supabase
        .from("crm_leads_view")
        .select("id, comercial_name")
        .eq("fase_name", "Encargo"),
      supabase.from("opportunity_orders").select("*"),
    ]);

    if (phaseLeadsResult.error) {
      console.error("Error cargando encargos:", phaseLeadsResult.error);
      setPageError("No se pudieron cargar los encargos. Intentá refrescar la tabla.");
      setLoading(false);
      return;
    }

    if (ordersResult.error) {
      console.error("Error cargando datos de encargos:", ordersResult.error);
      setPageError("Algunos datos de encargos no se pudieron cargar correctamente.");
    }

    const ordersByLead = new Map<number, OpportunityOrderRow[]>();
    for (const raw of ordersResult.data ?? []) {
      const order = raw as OpportunityOrderRow;
      const list = ordersByLead.get(order.opportunity_id) ?? [];
      list.push(order);
      ordersByLead.set(order.opportunity_id, list);
    }

    for (const list of ordersByLead.values()) {
      list.sort((a, b) => {
        const diff = new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
        return diff !== 0 ? diff : b.id - a.id;
      });
    }

    const targetLeadIds = new Set<number>([
      ...(phaseLeadsResult.data ?? []).map((r) => r.id as number),
      ...ordersByLead.keys(),
    ]);
    const safeLeadIds = targetLeadIds.size > 0 ? Array.from(targetLeadIds) : [0];

    let leadsQuery = supabase
      .from("crm_leads_view")
      .select("id, propietario, domicilio, estado, dominio_desc, contact_name, comercial_name, source_name")
      .in("id", safeLeadIds);

    if (userWithRole?.crmUser && !canViewAllLeads(userWithRole.crmUser) && nombre) {
      leadsQuery = leadsQuery.eq("comercial_name", nombre);
    }

    const { data: leadsData, error: leadsError } = await leadsQuery;

    if (leadsError) {
      console.error("Error cargando encargos:", leadsError);
      setPageError("No se pudieron cargar los encargos. Intentá refrescar la tabla.");
      setLoading(false);
      return;
    }

    const finalLeadIds = (leadsData ?? []).map((r) => r.id as number);
    const safeFinalLeadIds = finalLeadIds.length > 0 ? finalLeadIds : [0];

    const today = new Date();
    const fifteenDaysAgo = new Date(today);
    fifteenDaysAgo.setDate(today.getDate() - 15);
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(today.getDate() - 30);

    const formatDate = (date: Date) => date.toISOString().slice(0, 10);

    const [contactsResult, visitsResult] = await Promise.all([
      supabase
        .from("opportunity_activities")
        .select("opportunity_id, fecha")
        .in("opportunity_id", safeFinalLeadIds)
        .eq("event_type", "rg")
        .gte("fecha", formatDate(fifteenDaysAgo)),
      supabase
        .from("opportunity_buyers")
        .select("opportunity_id, fecha_visita")
        .in("opportunity_id", safeFinalLeadIds)
        .gte("fecha_visita", formatDate(thirtyDaysAgo)),
    ]);

    if (contactsResult.error) {
      console.error("Error cargando R.G. 15 días:", contactsResult.error);
      setPageError("Algunos datos de R.G. no se pudieron cargar correctamente.");
    }

    if (visitsResult.error) {
      console.error("Error cargando visitas 30 días:", visitsResult.error);
      setPageError("Algunos datos de visitas no se pudieron cargar correctamente.");
    }

    const rg15dMap = new Map<number, number>();
    for (const contact of contactsResult.data ?? []) {
      const opportunityId = Number((contact as { opportunity_id: number | null }).opportunity_id);
      if (!Number.isFinite(opportunityId)) continue;
      rg15dMap.set(opportunityId, (rg15dMap.get(opportunityId) ?? 0) + 1);
    }

    const visitas30dMap = new Map<number, number>();
    for (const visit of visitsResult.data ?? []) {
      const opportunityId = Number((visit as { opportunity_id: number | null }).opportunity_id);
      if (!Number.isFinite(opportunityId)) continue;
      visitas30dMap.set(opportunityId, (visitas30dMap.get(opportunityId) ?? 0) + 1);
    }

    const mapped: EncargoItem[] = (leadsData ?? []).flatMap<EncargoItem>((row) => {
      const lead = row as LeadRow;
      const orders = ordersByLead.get(lead.id) ?? [];
      const baseFields = {
        leadId: lead.id,
        propietario: lead.propietario?.trim() || "—",
        domicilio: lead.domicilio?.trim() || "—",
        estado: lead.estado?.trim() || "—",
        dominio: lead.dominio_desc?.trim() || "—",
        planner: lead.contact_name?.trim() || "—",
        owner: lead.comercial_name?.trim() || "—",
        origen: lead.source_name?.trim() || "—",
        rg_15d: rg15dMap.get(lead.id) ?? 0,
        visitas_30d: visitas30dMap.get(lead.id) ?? 0,
      };

      if (orders.length === 0) {
        return [
          {
            id: `${lead.id}-empty`,
            hasOrder: false,
            orderId: null,
            ...baseFields,
            fecha_inicio: "",
            fecha_fin: "",
            pvp_inicial: null,
            pvp_actual: null,
            pvp_estimado: null,
            com_vendedor: null,
            com_comprador: null,
            rebajas: 0,
            memo: "",
          },
        ];
      }

      return orders.map((order) => ({
        id: `${lead.id}-${order.id}`,
        hasOrder: true,
        orderId: order.id,
        ...baseFields,
        fecha_inicio: order.fecha_inicio ?? "",
        fecha_fin: order.fecha_fin ?? "",
        pvp_inicial: order.pvp_inicial ?? null,
        pvp_actual: order.pvp_actual ?? null,
        pvp_estimado: order.pvp_estimado ?? null,
        com_vendedor: order.com_vendedor ?? null,
        com_comprador: order.com_comprador ?? null,
        rebajas: order.rebajas ?? 0,
        memo: order.memo?.trim() ?? "",
      }));
    });

    setItems(mapped);
    setLoading(false);
  }

  useEffect(() => {
    if (userWithRole) void loadEncargos();
  }, [userWithRole]);

  function handleCreateClick() {
    if (!canEdit) return;
    setFormError(null);
    setSelected(null);
    setCreateLeadId("");
    resetEditForm();
    setEditOpen(true);
  }

  async function handleOpenLead(item: EncargoItem) {
    const { data, error } = await supabase
      .from("crm_leads_view")
      .select("*")
      .eq("id", item.leadId)
      .maybeSingle();

    if (error || !data) return;
    const row = data as LeadRow & Record<string, unknown>;
    const address = row.domicilio?.trim() || "—";
    const district = row.distrito?.trim() || "—";
    setSelectedLead({
      id: String(row.id),
      ownerName: row.propietario?.trim() || "—",
      address,
      distrito: district,
      municipio: district,
      provincia: row.provincia?.trim() || "—",
      cp: row.cp ? String(row.cp) : "—",
      valor: row.tasacion?.trim() || "—",
      phone: row.telefono?.trim() || "—",
      source: row.source_name?.trim() || "Sin origen",
      phase: "encargo",
      status: "activa",
      fechaNoticia: row.fecha || row.created_at || "",
      fechaContacto: row.fecha_contacto || "",
      fechaValoracion: row.fecha_valoracion || "",
      hora: row.hora || "",
      planner: row.contact_name?.trim() || "—",
      owner: row.comercial_name?.trim() || "—",
      createdAt: row.created_at || "",
      assignedUser: row.comercial_name?.trim() || "—",
      propertyAddress: address,
      notes: row.memo?.trim() || "",
      observaciones: [],
    });
  }

  async function handleSave() {
    if (!canEdit) return;
    const activeItem =
      selected ?? items.find((item) => String(item.leadId) === createLeadId) ?? null;

    if (!activeItem) {
      setFormError("Seleccioná una oportunidad para crear el encargo.");
      return;
    }

    setSaving(true);
    setFormError(null);

    const validationError = validateForm();

    if (validationError) {
      setFormError(validationError);
      setSaving(false);
      return;
    }

    const nextPvpActual = editForm.pvp_actual ? Number(editForm.pvp_actual) : null;
    const shouldIncrementRebajas =
      activeItem.pvp_actual !== null &&
      nextPvpActual !== null &&
      nextPvpActual < activeItem.pvp_actual;
    const nextRebajas = activeItem.rebajas + (shouldIncrementRebajas ? 1 : 0);

    const payload = {
      opportunity_id: activeItem.leadId,
      fecha_inicio: editForm.fecha_inicio || null,
      fecha_fin: editForm.fecha_fin || null,
      pvp_inicial: editForm.pvp_inicial ? Number(editForm.pvp_inicial) : null,
      pvp_actual: nextPvpActual,
      pvp_estimado: editForm.pvp_estimado ? Number(editForm.pvp_estimado) : null,
      com_vendedor: editForm.com_vendedor ? Number(editForm.com_vendedor) : null,
      com_comprador: editForm.com_comprador ? Number(editForm.com_comprador) : null,
      memo: editForm.memo.trim() || null,
      rebajas: nextRebajas,
    };
    const isEditing = Boolean(selected && selected.orderId !== null);
    const changes = isEditing ? buildEncargoChangeLines(activeItem, payload) : [];

    const { error } = await supabase.rpc("crm_save_order_with_activity", {
      p_order_id: selected?.orderId ?? null,
      p_opportunity_id: activeItem.leadId,
      p_data: payload,
      p_change_details: isEditing
        ? changes.length
          ? `:\n${changes.join("\n")}`
          : " sin cambios visibles"
        : null,
    });

    setSaving(false);

    if (error) {
      console.error("Error guardando encargo:", error);
      setFormError("No se pudo guardar el encargo. Revisá los datos e intentá nuevamente.");
      return;
    }

    setEditOpen(false);
    setSelected(null);
    setCreateLeadId("");
    resetEditForm();
    void loadEncargos();
  }

  const filteredItems = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return items;

    return items.filter((item) =>
      [item.propietario, item.domicilio, item.estado, item.dominio, item.owner, item.origen]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [items, searchTerm]);

  const leadOptions = useMemo(() => {
    const seen = new Set<number>();
    const result: EncargoItem[] = [];

    for (const item of items) {
      if (seen.has(item.leadId)) continue;
      seen.add(item.leadId);
      result.push(item);
    }

    return result;
  }, [items]);

  const columns = [
    "Health", "Domicilio", "Propietario", "Estado", "Dominio",
    "Planner", "Owner", "Origen", "Inicio", "Fin",
    "Días Gestión", "Días Rest.", "IN Month", "OUT Month",
    "% Vendedor", "% Comprador", "PVP Inicial", "PVP Actual", "PVP Estimado", "PVP Desvío", "% Desvío",
    "% Avance", "Rebajas", "R.G. 15d", "Visitas 30d"
  ];

  return (
    <>
      <Topbar title="Encargos" />

      <main className="mt-14 flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex shrink-0 flex-col gap-3 border-b border-border bg-card px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-6 sm:py-2.5">
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-nowrap sm:gap-4">
            <span className="text-xs text-muted-foreground sm:whitespace-nowrap">
              {filteredItems.length} encargos en total
            </span>
            <button
              type="button"
              onClick={() => void loadEncargos()}
              disabled={loading}
              title="Refrescar encargos"
              aria-label="Refrescar encargos"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            </button>
            <div className="relative w-full sm:w-auto">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar encargos..."
                className="h-10 w-full rounded-md border border-border bg-background pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground sm:h-8 sm:w-[260px]"
              />
            </div>
          </div>
          {canEdit && (
            <button
              type="button"
              onClick={handleCreateClick}
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90 sm:h-8 sm:w-auto"
            >
              <Plus className="h-3.5 w-3.5" />
              Crear Encargo
            </button>
          )}
        </div>

        {pageError && (
          <div className="shrink-0 border-b border-red-200 bg-red-50 px-6 py-2 text-xs font-medium text-red-700">
            {pageError}
          </div>
        )}

        {loading && (
          <div className="shrink-0 border-b border-border bg-muted/40 px-6 py-2 text-xs text-muted-foreground">
            Cargando encargos desde Supabase...
          </div>
        )}

        <div className="relative flex-1 overflow-auto">
          <table className="w-full min-w-[2320px] table-auto border-collapse text-sm">
            <thead className="sticky top-0 z-20 bg-card">
              <tr className="border-b border-border bg-card/95 text-left backdrop-blur">
                {columns.map((col) => (
                  <th
                    key={col}
                    className={cn(
                      "px-2 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap md:px-3",
                      col === "Health" && "min-w-[92px]",
                      col === "Domicilio" && "min-w-[220px]",
                      col === "Propietario" && "min-w-[180px]",
                      col === "Estado" && "min-w-[120px]"
                    )}
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-background">
              {filteredItems.length === 0 && !loading ? (
                <tr>
                  <td colSpan={columns.length} className="px-6 py-10 text-center text-xs text-muted-foreground">
                    No hay encargos registrados
                  </td>
                </tr>
              ) : (
                filteredItems.map((item, i) => {
                  const hoy = new Date().toISOString().slice(0, 10);
                  const diasGestion = calcDias(item.fecha_inicio, hoy);
                  const diasRestantes = calcDias(hoy, item.fecha_fin);
                  const pvpDesvio = calcPvpDesvio(item.pvp_actual, item.pvp_estimado);
                  const avance = calcAvance(item.fecha_inicio, item.fecha_fin);
                  const desvioPct = calcDesvioPct(item.pvp_actual, item.pvp_estimado);
                  const calculatedHealth = calcHealthBySheetRule({
                    diasRestantes,
                    avancePct: avance,
                    desvioPct,
                    rg15d: item.rg_15d,
                    visitas30d: item.visitas_30d,
                  });
                  const healthCfg = getHealthConfig(calculatedHealth);
                  const healthTitle = buildHealthTitle({
                    health: calculatedHealth,
                    avancePct: avance,
                    desvioPct,
                    rg15d: item.rg_15d,
                    visitas30d: item.visitas_30d,
                  });

                  return (
                    <tr
                      key={item.id}
                      onClick={() => void handleOpenLead(item)}
                      className={cn(
                        "border-b border-border transition-colors",
                        "cursor-pointer hover:bg-accent/60",
                        i % 2 === 0 ? "bg-card" : "bg-background"
                      )}
                    >
                      <td className="px-2 py-2.5 md:px-3">
                        <span
                          title={healthTitle}
                          className={cn(
                            "inline-flex min-w-10 items-center justify-center rounded-full border px-2.5 py-1 text-[11px] font-bold",
                            healthCfg.className
                          )}
                        >
                          {healthCfg.label}
                        </span>
                      </td>
                      <td className="truncate whitespace-nowrap px-2 py-2.5 text-xs text-muted-foreground md:px-3">{item.domicilio}</td>
                      <td className="truncate whitespace-nowrap px-2 py-2.5 text-xs font-medium text-foreground md:px-3">{item.propietario}</td>
                      <td className="truncate whitespace-nowrap px-2 py-2.5 text-xs text-muted-foreground md:px-3">{item.estado}</td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground">{item.dominio}</td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground">{item.planner}</td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground">{item.owner}</td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground">{item.origen}</td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground">{fmt(item.fecha_inicio)}</td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground">{fmt(item.fecha_fin)}</td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground">{diasGestion !== null ? diasGestion : "—"}</td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground">{diasRestantes !== null ? diasRestantes : "—"}</td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground">{fmtMonth(item.fecha_inicio)}</td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground">{fmtMonth(item.fecha_fin)}</td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground">{item.com_vendedor !== null ? `${item.com_vendedor}%` : "—"}</td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground">{item.com_comprador !== null ? `${item.com_comprador}%` : "—"}</td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground">{fmtEuro(item.pvp_inicial)}</td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground">{fmtEuro(item.pvp_actual)}</td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground">{fmtEuro(item.pvp_estimado)}</td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground">{fmtEuro(pvpDesvio)}</td>
                      <td className={cn("px-3 py-2.5 text-xs font-medium", getAvanceColor(desvioPct))}>
                        {fmtPct(desvioPct)}
                      </td>
                      <td className={cn("px-3 py-2.5 text-xs font-medium", getAvanceColor(avance))}>
                        {avance !== null ? `${avance}%` : "—"}
                      </td>
                      <td className={cn("px-3 py-2.5 text-xs font-medium", getRebajasColor(item.rebajas))}>
                        {item.rebajas}
                      </td>
                      <td className={cn("px-3 py-2.5 text-xs font-medium", getActivityColor(item.rg_15d))}>{item.rg_15d}</td>
                      <td className={cn("px-3 py-2.5 text-xs font-medium", getActivityColor(item.visitas_30d))}>{item.visitas_30d}</td>
                    </tr>
                  );
                })
              )}
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

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-2xl gap-3 overflow-y-auto p-4 sm:max-h-[90vh] sm:w-full sm:gap-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="pr-8 text-left text-base font-semibold">
              {selected ? "Editar encargo" : "Crear encargo"}
            </DialogTitle>
            <DialogDescription className="break-words pr-8 text-left text-xs text-muted-foreground">
              {selected
                ? `${selected.domicilio} — ${selected.propietario}`
                : "Seleccioná una oportunidad y cargá los datos del encargo."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-3 py-1 sm:grid-cols-2 sm:gap-x-4 sm:gap-y-4 sm:py-2">
            {!selected && (
              <div className="flex min-w-0 flex-col gap-1.5 sm:col-span-2">
                <Label className="text-xs font-medium">Oportunidad</Label>
                <select
                  value={createLeadId}
                  onChange={(e) => setCreateLeadId(e.target.value)}
                  className="h-10 min-w-0 rounded-md border border-border bg-background px-3 text-sm outline-none sm:h-8"
                >
                  <option value="">Seleccionar oportunidad...</option>
                  {leadOptions.map((item) => (
                    <option key={item.leadId} value={String(item.leadId)}>
                      {item.propietario} — {item.domicilio}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {(() => {
              const activeItem =
                selected ?? items.find((item) => String(item.leadId) === createLeadId) ?? null;

              if (!activeItem) return null;

              return (
                <div className="grid grid-cols-1 gap-2 rounded-lg border border-border bg-muted/30 px-3 py-3 text-xs sm:col-span-2 sm:grid-cols-3 sm:gap-3 sm:px-4">
                  <div className="min-w-0 break-words"><span className="text-muted-foreground">Estado: </span><span className="font-medium">{activeItem.estado}</span></div>
                  <div className="min-w-0 break-words"><span className="text-muted-foreground">Dominio: </span><span className="font-medium">{activeItem.dominio}</span></div>
                  <div className="min-w-0 break-words"><span className="text-muted-foreground">Owner: </span><span className="font-medium">{activeItem.owner}</span></div>
                  <div className="min-w-0 break-words"><span className="text-muted-foreground">Origen: </span><span className="font-medium">{activeItem.origen}</span></div>
                  <div className="min-w-0 break-words"><span className="text-muted-foreground">Planner: </span><span className="font-medium">{activeItem.planner}</span></div>
                </div>
              );
            })()}

            {(() => {
              const activeItem =
                selected ?? items.find((item) => String(item.leadId) === createLeadId) ?? null;

              return activeItem ? <HealthBreakdownCard item={activeItem} /> : null;
            })()}
            {formError && (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700 sm:col-span-2">
                {formError}
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-medium">% Vendedor (sin IVA)</Label>
              <Input
                value={editForm.com_vendedor}
                onChange={(e) => setField("com_vendedor", e.target.value)}
                className="h-10 text-sm sm:h-8"
                placeholder="Ej: 3.5"
                type="number"
                step="0.1"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-medium">% Comprador (sin IVA)</Label>
              <Input
                value={editForm.com_comprador}
                onChange={(e) => setField("com_comprador", e.target.value)}
                className="h-10 text-sm sm:h-8"
                placeholder="Ej: 2.5"
                type="number"
                step="0.1"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-medium">Fecha Inicio</Label>
              <Input
                type="date"
                value={editForm.fecha_inicio}
                onChange={(e) => setField("fecha_inicio", e.target.value)}
                className="h-10 text-sm sm:h-8"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-medium">Fecha Fin</Label>
              <Input
                type="date"
                value={editForm.fecha_fin}
                onChange={(e) => setField("fecha_fin", e.target.value)}
                className="h-10 text-sm sm:h-8"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-medium">PVP Inicial</Label>
              <Input
                value={editForm.pvp_inicial}
                onChange={(e) => setField("pvp_inicial", e.target.value)}
                className="h-10 text-sm sm:h-8"
                placeholder="Ej: 250000"
                type="number"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-medium">PVP Actual</Label>
              <Input
                value={editForm.pvp_actual}
                onChange={(e) => setField("pvp_actual", e.target.value)}
                className="h-10 text-sm sm:h-8"
                placeholder="Ej: 240000"
                type="number"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-medium">Rebajas acumuladas</Label>
              <div className="flex h-10 items-center rounded-md border border-border bg-muted/40 px-3 text-sm text-muted-foreground sm:h-8">
                {(selected ?? items.find((item) => String(item.leadId) === createLeadId))?.rebajas ?? 0}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-medium">PVP Estimado</Label>
              <Input
                value={editForm.pvp_estimado}
                onChange={(e) => setField("pvp_estimado", e.target.value)}
                className="h-10 text-sm sm:h-8"
                placeholder="Ej: 235000"
                type="number"
              />
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label className="text-xs font-medium">Memo del encargo</Label>
              <Textarea
                value={editForm.memo}
                onChange={(e) => setField("memo", e.target.value)}
                className="min-h-[104px] resize-none text-sm sm:min-h-[90px]"
                placeholder="Notas internas del encargo, condiciones pactadas, límites de precio, contexto comercial..."
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <button
              type="button"
              onClick={() => {
                setEditOpen(false);
                setSelected(null);
                setCreateLeadId("");
                resetEditForm();
              }}
              disabled={saving}
              className="inline-flex h-10 w-full items-center justify-center rounded-md border border-border bg-background px-3 text-xs font-medium hover:bg-accent sm:h-8 sm:w-auto"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              className="inline-flex h-10 w-full items-center justify-center rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 sm:h-8 sm:w-auto"
            >
              {saving ? "Guardando..." : "Guardar cambios"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
