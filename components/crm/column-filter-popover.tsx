"use client";

import { useEffect, useMemo, useState } from "react";
import { Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { EMPTY_COLUMN_FILTER, isColumnFilterActive, type ColumnFilter, type LeadColumnKey } from "@/lib/lead-column-filters";

export function ColumnFilterPopover({
  column, label, filter, options, loading, onOpen, onApply,
}: {
  column: LeadColumnKey;
  label: string;
  filter?: ColumnFilter;
  options: string[];
  loading: boolean;
  onOpen: () => void;
  onApply: (filter: ColumnFilter) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<ColumnFilter>(EMPTY_COLUMN_FILTER);
  const [listSearch, setListSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(listSearch.trim().toLocaleLowerCase()), 250);
    return () => clearTimeout(timer);
  }, [listSearch]);
  const visibleOptions = useMemo(
    () => options.filter(value => (value || "Sin valor").toLocaleLowerCase().includes(debouncedSearch)),
    [options, debouncedSearch]
  );
  const active = filter && isColumnFilterActive(filter);
  const invalidRange = Boolean(draft.from && draft.to && draft.from > draft.to);
  return (
    <span onClick={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>
      <Popover open={open} onOpenChange={next => {
        setOpen(next);
        if (next) {
          setDraft(filter ?? EMPTY_COLUMN_FILTER);
          setListSearch("");
          onOpen();
        }
      }}>
        <PopoverTrigger asChild>
          <button type="button" aria-label={`Filtrar ${label}`} title={`Filtrar ${label}`}
            className={cn("inline-flex h-6 min-w-6 items-center justify-center gap-0.5 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring hover:bg-muted", active && "bg-primary/10 text-primary")}
          >
            <Filter className={cn("h-3 w-3", active && "fill-current")} aria-hidden="true" />
            {!!filter?.values.length && <span className="text-[9px]">{filter.values.length}</span>}
            {active && <span className="sr-only">Filtro activo</span>}
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 max-w-[calc(100vw-2rem)] space-y-3 text-sm font-normal normal-case tracking-normal">
          <div className="font-semibold">Filtrar {label}</div>
          {column === "fechaNoticia" ? (
            <div className="space-y-2">
              {([{ key: "exact", label: "Fecha exacta" }, { key: "from", label: "Desde" }, { key: "to", label: "Hasta" }] as const).map(item => (
                <div key={item.key} className="space-y-1">
                  <Label htmlFor={`column-${column}-${item.key}`}>{item.label}</Label>
                  <Input id={`column-${column}-${item.key}`} type="date" value={draft[item.key]}
                    onChange={event => setDraft(prev => ({ ...prev, [item.key]: event.target.value }))} />
                </div>
              ))}
              {invalidRange && <p role="alert" className="text-destructive">Desde no puede ser posterior a Hasta.</p>}
            </div>
          ) : (
            <>
              <Input aria-label={`Texto para filtrar ${label}`} placeholder="Contiene texto..."
                value={draft.text} onChange={event => setDraft(prev => ({ ...prev, text: event.target.value }))} />
              <Input aria-label={`Buscar valores de ${label}`} placeholder="Buscar valores..."
                value={listSearch} onChange={event => setListSearch(event.target.value)} />
              <div className="max-h-56 overflow-y-auto space-y-2" aria-label={`Valores de ${label}`}>
                {loading ? <p role="status">Cargando valores...</p> : visibleOptions.length ? visibleOptions.map((value, index) => (
                  <div key={value} className="flex items-center gap-2">
                    <Checkbox id={`column-${column}-${index}`} checked={draft.values.includes(value)}
                      onCheckedChange={checked => setDraft(prev => ({
                        ...prev, values: checked ? [...prev.values, value] : prev.values.filter(item => item !== value),
                      }))} />
                    <Label htmlFor={`column-${column}-${index}`} className="min-w-0 break-words font-normal">{value || "Sin valor"}</Label>
                  </div>
                )) : <p>No hay valores disponibles.</p>}
              </div>
            </>
          )}
          <div className="flex justify-between gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => {
              onApply(EMPTY_COLUMN_FILTER); setOpen(false);
            }}>Limpiar</Button>
            <Button type="button" size="sm" disabled={loading || invalidRange} onClick={() => {
              onApply({ ...draft, text: draft.text.trim() }); setOpen(false);
            }}>Aplicar</Button>
          </div>
        </PopoverContent>
      </Popover>
    </span>
  );
}
