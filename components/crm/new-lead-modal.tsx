"use client";

import { useState, useEffect } from "react";
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
import { AlertTriangle, LocateFixed, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";

export interface NewLeadFormData {
  ownerName: string;
  address: string;
  distrito: string;
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
  notes: string;
}

function todayDateInput(): string {
  const today = new Date();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${today.getFullYear()}-${month}-${day}`;
}

function createEmptyForm(): NewLeadFormData {
  return {
    ownerName: "",
    address: "",
    distrito: "",
    provincia: "",
    cp: "",
    valor: "",
    dominio: "",
    occupancy: "",
    phone: "",
    source: "",
    medio: "",
    enVenta: "",
    status: "activa",
    phase: "identificada",
    fechaNoticia: todayDateInput(),
    fechaContacto: "",
    fechaValoracion: "",
    hora: "",
    owner: "",
    notes: "",
  };
}

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
  id: string;
  cp: string;
  municipio: string | null;
  provincia: string;
  distrito: string | null;
}

interface NewLeadModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit?: (data: NewLeadFormData) => Promise<string | null>;
  defaultOwner?: string;
  ownerOptions?: string[];
  sourceOptions?: string[];
  domainOptions?: string[];
}

export function NewLeadModal({
  open,
  onOpenChange,
  onSubmit,
  defaultOwner = "",
  ownerOptions = AGENT_OPTIONS,
  sourceOptions = SOURCE_OPTIONS,
  domainOptions = [],
}: NewLeadModalProps) {
  const [form, setForm] = useState<NewLeadFormData>(createEmptyForm);
  const [cpLoading, setCpLoading] = useState(false);
  const [cpSearchResults, setCpSearchResults] = useState<PostalCodeResult[]>([]);
  const [cpSearchError, setCpSearchError] = useState<string | null>(null);
  const [cpOpen, setCpOpen] = useState(false);
  const [activeCpIndex, setActiveCpIndex] = useState(0);
  const [selectedCp, setSelectedCp] = useState<string | null>(null);
  const [cpAutoFilled, setCpAutoFilled] = useState(false);
  const [occupancyOptions, setOccupancyOptions] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const availableOwnerOptions =
    defaultOwner && !ownerOptions.includes(defaultOwner)
      ? [defaultOwner, ...ownerOptions]
      : ownerOptions;

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

  useEffect(() => {
    const query = form.cp.trim().replace(/\s+/g, " ");
    if (!open || query.length < 2 || selectedCp === query) return;

    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      setCpLoading(true);
      setCpSearchError(null);

      try {
        const response = await fetch(
          `/api/postal-search?q=${encodeURIComponent(query)}`,
          { signal: controller.signal }
        );
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error || "No se pudieron buscar los CP.");
        }

        setCpSearchResults(payload.results as PostalCodeResult[]);
        setActiveCpIndex(0);
        setCpOpen(true);
      } catch (error) {
        if (controller.signal.aborted) return;
        setCpSearchResults([]);
        setCpSearchError(
          error instanceof Error
            ? error.message
            : "No se pudieron buscar los códigos postales."
        );
        setCpOpen(true);
      } finally {
        if (!controller.signal.aborted) setCpLoading(false);
      }
    }, 300);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [form.cp, open, selectedCp]);

  function handleCpChange(value: string) {
    const nextValue = value.slice(0, 80);
    handleField("cp", nextValue);
    setSelectedCp(null);
    setCpSearchResults([]);
    setCpSearchError(null);
    setActiveCpIndex(0);
    setCpLoading(nextValue.trim().length >= 2);
    setCpOpen(nextValue.trim().length >= 2);
    setCpAutoFilled(false);

    setForm((previous) => ({ ...previous, distrito: "", provincia: "" }));
  }

  function selectPostalCode(result: PostalCodeResult) {
    const cp = String(Number(result.id)).padStart(5, "0");
    setForm((previous) => ({
      ...previous,
      cp,
      distrito: result.distrito ?? "",
      provincia: result.provincia,
    }));
    setSelectedCp(cp);
    setCpAutoFilled(true);
    setCpSearchResults([]);
    setCpLoading(false);
    setCpSearchError(null);
    setCpOpen(false);
  }

  function clearPostalCode() {
    setForm((previous) => ({
      ...previous,
      cp: "",
      distrito: "",
      provincia: "",
    }));
    setSelectedCp(null);
    setCpAutoFilled(false);
    setCpSearchResults([]);
    setCpLoading(false);
    setCpSearchError(null);
    setCpOpen(false);
  }

  function handleCpKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setCpOpen(false);
      return;
    }

    if (event.key === "ArrowDown" && cpSearchResults.length > 0) {
      event.preventDefault();
      setCpOpen(true);
      setActiveCpIndex((index) => (index + 1) % cpSearchResults.length);
      return;
    }

    if (event.key === "ArrowUp" && cpSearchResults.length > 0) {
      event.preventDefault();
      setCpOpen(true);
      setActiveCpIndex(
        (index) => (index - 1 + cpSearchResults.length) % cpSearchResults.length
      );
      return;
    }

    if (event.key === "Enter" && cpOpen) {
      event.preventDefault();
      const result = cpSearchResults[activeCpIndex];
      if (result) selectPostalCode(result);
    }
  }

  function handleCpBlur(event: React.FocusEvent<HTMLDivElement>) {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setCpOpen(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!onSubmit || submitting) return;

    const postalCode = form.cp.trim();
    if (selectedCp !== postalCode || !/^\d{5}$/.test(postalCode)) {
      setSubmitError("Selecciona un código postal de la lista antes de guardar.");
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    try {
      const errorMessage = await onSubmit({
        ...form,
        owner: form.owner || defaultOwner,
      });
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

    setForm(createEmptyForm());
    setSelectedCp(null);
    setCpSearchResults([]);
    setCpLoading(false);
    setCpSearchError(null);
    setCpOpen(false);
    setActiveCpIndex(0);
    setCpAutoFilled(false);
    onOpenChange(false);
  }

  function handleCancel() {
    if (submitting) return;
    setForm(createEmptyForm());
    setSelectedCp(null);
    setCpSearchResults([]);
    setCpLoading(false);
    setCpSearchError(null);
    setCpOpen(false);
    setActiveCpIndex(0);
    setCpAutoFilled(false);
    setSubmitError(null);
    onOpenChange(false);
  }

  const isValid =
    form.ownerName.trim() &&
    form.address.trim() &&
    form.phone.trim() &&
    form.cp.trim() &&
    selectedCp === form.cp.trim() &&
    /^\d{5}$/.test(form.cp.trim()) &&
    form.distrito.trim() &&
    form.provincia.trim() &&
    form.valor.trim() &&
    form.dominio &&
    form.source &&
    form.status &&
    form.phase &&
    form.fechaNoticia &&
    (form.owner || defaultOwner) &&
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
            Nueva Oportunidad
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
          <div className="grid gap-3 md:grid-cols-4">
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="dominio" className="text-xs font-medium">
                Dominio <span className="text-destructive">*</span>
              </Label>
              <Select
                value={form.dominio}
                onValueChange={(value) => handleField("dominio", value)}
              >
                <SelectTrigger id="dominio" className="h-8 w-full min-w-0 text-sm">
                  <SelectValue className="truncate" placeholder="Seleccionar" />
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

            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="source" className="text-xs font-medium">
                Origen <span className="text-destructive">*</span>
              </Label>
              <Select
                value={form.source}
                onValueChange={(v) => handleField("source", v)}
              >
                <SelectTrigger id="source" className="h-8 w-full min-w-0 text-sm">
                  <SelectValue className="truncate" placeholder="Seleccionar" />
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

            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="phase" className="text-xs font-medium">
                Fase <span className="text-destructive">*</span>
              </Label>
              <Select
                value={form.phase}
                onValueChange={(v) => handleField("phase", v)}
              >
                <SelectTrigger id="phase" className="h-8 w-full min-w-0 text-sm">
                  <SelectValue className="truncate" placeholder="Seleccionar" />
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

            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="status" className="text-xs font-medium">
                Estado <span className="text-destructive">*</span>
              </Label>
              <Select
                value={form.status}
                onValueChange={(v) => handleField("status", v)}
              >
                <SelectTrigger id="status" className="h-8 w-full min-w-0 text-sm">
                  <SelectValue className="truncate" placeholder="Seleccionar" />
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
            <div className="grid gap-3 md:col-span-2 md:grid-cols-2">
              <div className="flex min-w-0 flex-col gap-1.5">
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
              <div className="relative" onBlur={handleCpBlur}>
                <Input
                  value={form.cp}
                  onChange={(e) => handleCpChange(e.target.value)}
                  onKeyDown={handleCpKeyDown}
                  onFocus={() => {
                    if (form.cp.trim().length >= 2 && selectedCp !== form.cp.trim()) {
                      setCpOpen(true);
                    }
                  }}
                  placeholder="Buscar CP o localidad"
                  maxLength={80}
                  className="h-8 pr-8 text-sm"
                  disabled={cpLoading}
                  role="combobox"
                  aria-autocomplete="list"
                  aria-expanded={cpOpen}
                  aria-controls="new-lead-cp-options"
                  aria-activedescendant={
                    cpOpen && cpSearchResults[activeCpIndex]
                      ? `new-lead-cp-option-${activeCpIndex}`
                      : undefined
                  }
                  aria-busy={cpLoading}
                  required
                />
                {cpLoading ? (
                  <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-primary" />
                ) : form.cp ? (
                  <button
                    type="button"
                    aria-label="Borrar código postal"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={clearPostalCode}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                ) : null}
                {cpOpen && form.cp.trim().length >= 2 && (
                  <div
                    id="new-lead-cp-options"
                    role="listbox"
                    aria-label="Resultados de códigos postales"
                    className="absolute left-0 top-full z-50 mt-1 max-h-[55vh] w-[min(24rem,calc(100vw-3rem))] overflow-y-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
                  >
                    {cpLoading ? (
                      <div role="status" className="px-3 py-2 text-sm text-muted-foreground">
                        Buscando...
                      </div>
                    ) : cpSearchError ? (
                      <div role="alert" className="px-3 py-2 text-sm text-destructive">
                        {cpSearchError}
                      </div>
                    ) : cpSearchResults.length === 0 ? (
                      <div role="status" className="px-3 py-2 text-sm text-muted-foreground">
                        No se encontraron resultados.
                      </div>
                    ) : (
                      cpSearchResults.map((result, index) => (
                        <button
                          key={result.id}
                          id={`new-lead-cp-option-${index}`}
                          type="button"
                          role="option"
                          aria-selected={index === activeCpIndex}
                          tabIndex={-1}
                          onMouseDown={(event) => event.preventDefault()}
                          onMouseEnter={() => setActiveCpIndex(index)}
                          onClick={() => selectPostalCode(result)}
                          className={cn(
                            "w-full rounded-sm px-3 py-2 text-left text-sm outline-none",
                            index === activeCpIndex
                              ? "bg-accent text-accent-foreground"
                              : "hover:bg-accent/60"
                          )}
                        >
                          {[result.cp, result.distrito, result.provincia]
                            .filter(Boolean)
                            .join(" · ")}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
              </div>
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

            <div className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2">
              <div className="flex min-w-0 flex-col gap-1.5">
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

              <div className="flex min-w-0 flex-col gap-1.5">
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
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

          </div>

          <div className="grid gap-3 md:grid-cols-2">
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

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="owner" className="text-xs font-medium">
                RESPONSABLE <span className="text-destructive">*</span>
              </Label>
              <Select
                value={form.owner || defaultOwner}
                onValueChange={(value) => handleField("owner", value)}
              >
                <SelectTrigger id="owner" className="h-8 text-sm">
                  <SelectValue placeholder="Seleccionar" />
                </SelectTrigger>
                <SelectContent>
                  {availableOwnerOptions.map((owner) => (
                    <SelectItem key={owner} value={owner}>
                      {owner}
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
              placeholder="Comentarios iniciales de la oportunidad..."
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
