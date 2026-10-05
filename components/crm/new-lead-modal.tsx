"use client";

import { useState, useCallback, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AGENT_OPTIONS,
  PHASE_OPTIONS,
  STATUS_OPTIONS,
  SOURCE_OPTIONS,
  EN_VENTA_OPTIONS,
} from "@/lib/crm-data";
import { AlertTriangle, LocateFixed, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";

export interface NewLeadFormData {
  ownerName: string;
  address: string;
  distrito: string;
  municipio: string;
  provincia: string;
  cp: string;
  valor: string;
  dominio: string;
  occupancy: string;
  phone: string;
  source: string;
  medio: string;
  enVenta: string;
  status: string;
  phase: string;
  fechaNoticia: string;
  fechaContacto: string;
  fechaValoracion: string;
  hora: string;
  owner: string;
  planner: string;
  buyer: string;
  notes: string;
}

const EMPTY_FORM: NewLeadFormData = {
  ownerName: "",
  address: "",
  distrito: "",
  municipio: "",
  provincia: "",
  cp: "",
  valor: "",
  dominio: "",
  occupancy: "",
  phone: "",
  source: "",
  medio: "",
  enVenta: "",
  status: "",
  phase: "",
  fechaNoticia: "",
  fechaContacto: "",
  fechaValoracion: "",
  hora: "",
  owner: "",
  planner: "",
  buyer: "",
  notes: "",
};

const NEW_LEAD_PHASE_OPTIONS = PHASE_OPTIONS.filter((opt) =>
  ["Identificada", "Cualificada", "Valorada", "Encargo"].includes(opt.label)
);

const NEW_LEAD_STATUS_OPTIONS = STATUS_OPTIONS;

function formatEuroValue(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";

  const formatted = new Intl.NumberFormat("es-ES", {
    maximumFractionDigits: 0,
  }).format(Number(digits));

  return `${formatted} €`;
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

interface NewLeadModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit?: (data: NewLeadFormData) => Promise<string | null>;
  ownerOptions?: string[];
  plannerOptions?: string[];
  buyerOptions?: string[];
  sourceOptions?: string[];
  domainOptions?: string[];
}

export function NewLeadModal({
  open,
  onOpenChange,
  onSubmit,
  ownerOptions = AGENT_OPTIONS,
  plannerOptions = AGENT_OPTIONS,
  buyerOptions = AGENT_OPTIONS,
  sourceOptions = SOURCE_OPTIONS,
  domainOptions = [],
}: NewLeadModalProps) {
  const [form, setForm] = useState<NewLeadFormData>(EMPTY_FORM);
  const [cpLoading, setCpLoading] = useState(false);
  const [cpAutoFilled, setCpAutoFilled] = useState(false);
  const [occupancyOptions, setOccupancyOptions] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void supabase
      .from("lookups")
      .select("name")
      .eq("category", "Occupancy")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .then(({ data, error }) => {
        if (error) {
          console.error("Error cargando opciones de Occupancy:", error);
          return;
        }
        if (active) {
          setOccupancyOptions(
            (data ?? [])
              .map((row) => row.name?.trim() || "")
              .filter(Boolean)
          );
        }
      });

    return () => {
      active = false;
    };
  }, []);

  function handleField(field: keyof NewLeadFormData, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleValorChange(value: string) {
    handleField("valor", formatEuroValue(value));
  }

  const handleCpChange = useCallback(async (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 5);
    handleField("cp", digits);
    setCpAutoFilled(false);

    if (digits.length !== 5) return;

    setCpLoading(true);
    try {
      const result = await fetchPostalCode(digits);
      if (result) {
        setForm((prev) => ({
          ...prev,
          municipio: result.municipio,
          provincia: result.provincia,
          distrito: result.distrito || prev.distrito,
        }));
        setCpAutoFilled(true);
      }
    } finally {
      setCpLoading(false);
    }
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!onSubmit || submitting) return;

    setSubmitting(true);
    setSubmitError(null);

    try {
      const errorMessage = await onSubmit(form);
      if (errorMessage) {
        setSubmitError(errorMessage);
        return;
      }
    } catch (error) {
      console.error("Error inesperado creando el lead:", error);
      setSubmitError("No se pudo crear el lead. Intentá nuevamente.");
      return;
    } finally {
      setSubmitting(false);
    }

    setForm(EMPTY_FORM);
    setCpAutoFilled(false);
    onOpenChange(false);
  }

  function handleCancel() {
    if (submitting) return;
    setForm(EMPTY_FORM);
    setCpAutoFilled(false);
    setSubmitError(null);
    onOpenChange(false);
  }

  const isValid =
    form.ownerName.trim() &&
    form.address.trim() &&
    form.phone.trim() &&
    form.cp.trim() &&
    form.municipio.trim() &&
    form.distrito.trim() &&
    form.provincia.trim() &&
    form.valor.trim() &&
    form.dominio &&
    form.source &&
    form.status &&
    form.phase &&
    form.fechaNoticia &&
    form.owner &&
    form.planner &&
    form.buyer &&
    form.notes.trim();

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!submitting) onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">
            Nuevo lead
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="mt-1 flex flex-col gap-5">
          {submitError && (
            <div
              role="alert"
              aria-live="polite"
              className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{submitError}</span>
            </div>
          )}
          <div className="grid gap-3 md:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ownerName" className="text-xs font-medium">
                Propietario <span className="text-destructive">*</span>
              </Label>
              <Input
                id="ownerName"
                placeholder="Ej. Carlos Sánchez Ruiz"
                value={form.ownerName}
                onChange={(e) => handleField("ownerName", e.target.value)}
                className="h-8 text-sm"
                required
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="phone" className="text-xs font-medium">
                Teléfono <span className="text-destructive">*</span>
              </Label>
              <Input
                id="phone"
                type="tel"
                placeholder="Ej. +34 612 345 678"
                value={form.phone}
                onChange={(e) => handleField("phone", e.target.value)}
                className="h-8 text-sm"
                required
              />
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="flex flex-col gap-1.5 md:col-span-2">
              <Label htmlFor="address" className="text-xs font-medium">
                Domicilio <span className="text-destructive">*</span>
              </Label>
              <Input
                id="address"
                placeholder="Ej. C/ Serrano 12"
                value={form.address}
                onChange={(e) => handleField("address", e.target.value)}
                className="h-8 text-sm"
                required
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cp" className="text-xs font-medium">
                CP <span className="text-destructive">*</span>
              </Label>
              <div className="relative">
                <Input
                  id="cp"
                  placeholder="5 dígitos"
                  value={form.cp}
                  onChange={(e) => void handleCpChange(e.target.value)}
                  className="h-8 text-sm font-mono pr-8"
                  maxLength={5}
                  inputMode="numeric"
                  disabled={cpLoading}
                  required
                />
                {cpLoading && (
                  <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-primary" />
                )}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="occupancy" className="text-xs font-medium">
                Situación
              </Label>
              <Select
                value={form.occupancy}
                onValueChange={(value) => handleField("occupancy", value)}
              >
                <SelectTrigger id="occupancy" className="h-8 w-full min-w-0 text-sm">
                  <SelectValue placeholder="Seleccionar" />
                </SelectTrigger>
                <SelectContent className="max-h-[240px] overflow-y-auto">
                  {occupancyOptions.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="en-venta" className="text-xs font-medium">
                En Venta
              </Label>
              <Select
                value={form.enVenta}
                onValueChange={(value) => handleField("enVenta", value)}
              >
                <SelectTrigger id="en-venta" className="h-8 w-full min-w-0 text-sm">
                  <SelectValue placeholder="Seleccionar" />
                </SelectTrigger>
                <SelectContent>
                  {EN_VENTA_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label
                htmlFor="municipio"
                className="text-xs font-medium flex items-center gap-1.5"
              >
                Municipio
                <span className="text-destructive">*</span>
                {cpAutoFilled && (
                  <span className="inline-flex items-center gap-0.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary leading-none">
                    <LocateFixed className="h-2.5 w-2.5" />
                    auto
                  </span>
                )}
              </Label>
              <Input
                id="municipio"
                value={form.municipio}
                onChange={(e) => handleField("municipio", e.target.value)}
                className={cn(
                  "h-8 text-sm",
                  cpAutoFilled && "border-primary/40 bg-primary/5"
                )}
                placeholder="—"
                required
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label
                htmlFor="distrito"
                className="text-xs font-medium flex items-center gap-1.5"
              >
                Distrito
                <span className="text-destructive">*</span>
                {cpAutoFilled && (
                  <span className="inline-flex items-center gap-0.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary leading-none">
                    <LocateFixed className="h-2.5 w-2.5" />
                    auto
                  </span>
                )}
              </Label>
              <Input
                id="distrito"
                value={form.distrito}
                onChange={(e) => handleField("distrito", e.target.value)}
                className={cn(
                  "h-8 text-sm",
                  cpAutoFilled && "border-primary/40 bg-primary/5"
                )}
                placeholder="—"
                required
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label
                htmlFor="provincia"
                className="text-xs font-medium flex items-center gap-1.5"
              >
                Provincia
                <span className="text-destructive">*</span>
                {cpAutoFilled && (
                  <span className="inline-flex items-center gap-0.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary leading-none">
                    <LocateFixed className="h-2.5 w-2.5" />
                    auto
                  </span>
                )}
              </Label>
              <Input
                id="provincia"
                value={form.provincia}
                onChange={(e) => handleField("provincia", e.target.value)}
                className={cn(
                  "h-8 text-sm",
                  cpAutoFilled && "border-primary/40 bg-primary/5"
                )}
                placeholder="—"
                required
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="valor" className="text-xs font-medium">
                Valor <span className="text-destructive">*</span>
              </Label>
              <Input
                id="valor"
                placeholder="Ej. 450.000 €"
                value={form.valor}
                onChange={(e) => handleValorChange(e.target.value)}
                className="h-8 text-sm"
                inputMode="numeric"
                required
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="dominio" className="text-xs font-medium">
                Dominio <span className="text-destructive">*</span>
              </Label>
              <Select
                value={form.dominio}
                onValueChange={(value) => handleField("dominio", value)}
              >
                <SelectTrigger id="dominio" className="h-8 text-sm">
                  <SelectValue placeholder="Seleccionar dominio" />
                </SelectTrigger>
                <SelectContent>
                  {domainOptions.map((domain) => (
                    <SelectItem key={domain} value={domain}>
                      {domain}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="source" className="text-xs font-medium">
                Origen <span className="text-destructive">*</span>
              </Label>
              <Select
                value={form.source}
                onValueChange={(v) => handleField("source", v)}
              >
                <SelectTrigger id="source" className="h-8 text-sm">
                  <SelectValue placeholder="Seleccionar origen" />
                </SelectTrigger>
                <SelectContent>
                  {sourceOptions.map((opt) => (
                    <SelectItem key={opt} value={opt}>
                      {opt}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="phase" className="text-xs font-medium">
                Fase <span className="text-destructive">*</span>
              </Label>
              <Select
                value={form.phase}
                onValueChange={(v) => handleField("phase", v)}
              >
                <SelectTrigger id="phase" className="h-8 text-sm">
                  <SelectValue placeholder="Seleccionar fase" />
                </SelectTrigger>
                <SelectContent>
                  {NEW_LEAD_PHASE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="status" className="text-xs font-medium">
                Estado <span className="text-destructive">*</span>
              </Label>
              <Select
                value={form.status}
                onValueChange={(v) => handleField("status", v)}
              >
                <SelectTrigger id="status" className="h-8 text-sm">
                  <SelectValue placeholder="Seleccionar estado" />
                </SelectTrigger>
                <SelectContent>
                  {NEW_LEAD_STATUS_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="fechaNoticia" className="text-xs font-medium">
                Fecha noticia <span className="text-destructive">*</span>
              </Label>
              <Input
                id="fechaNoticia"
                type="date"
                value={form.fechaNoticia}
                onChange={(e) => handleField("fechaNoticia", e.target.value)}
                className="h-8 text-sm"
                required
              />
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="owner" className="text-xs font-medium">
                Owner <span className="text-destructive">*</span>
              </Label>
              <Select
                value={form.owner}
                onValueChange={(v) => handleField("owner", v)}
              >
                <SelectTrigger id="owner" className="h-8 text-sm">
                  <SelectValue placeholder="Seleccionar agente" />
                </SelectTrigger>
                <SelectContent>
                  {ownerOptions.map((agent) => (
                    <SelectItem key={agent} value={agent}>
                      {agent}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="planner" className="text-xs font-medium">
                Planner <span className="text-destructive">*</span>
              </Label>
              <Select
                value={form.planner}
                onValueChange={(v) => handleField("planner", v)}
              >
                <SelectTrigger id="planner" className="h-8 text-sm">
                  <SelectValue placeholder="Seleccionar planner" />
                </SelectTrigger>
                <SelectContent>
                  {plannerOptions.map((agent) => (
                    <SelectItem key={agent} value={agent}>
                      {agent}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="buyer" className="text-xs font-medium">
                Buyer <span className="text-destructive">*</span>
              </Label>
              <Select
                value={form.buyer}
                onValueChange={(value) => handleField("buyer", value)}
              >
                <SelectTrigger id="buyer" className="h-8 text-sm">
                  <SelectValue placeholder="Seleccionar buyer" />
                </SelectTrigger>
                <SelectContent>
                  {buyerOptions.map((agent) => (
                    <SelectItem key={agent} value={agent}>
                      {agent}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="notes" className="text-xs font-medium">
              Memo inicial <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="notes"
              value={form.notes}
              onChange={(e) => handleField("notes", e.target.value)}
              className="min-h-[72px] text-sm resize-none"
              placeholder="Memo inicial sobre el lead..."
              required
            />
          </div>

          <DialogFooter className="mt-1 flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleCancel}
              disabled={submitting}
            >
              Cancelar
            </Button>
            <Button type="submit" size="sm" disabled={!isValid || submitting}>
              {submitting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Guardando...
                </>
              ) : (
                "Crear"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
