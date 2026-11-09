import { PHASE_LABELS, type Lead } from "@/lib/crm-data";

export const LEAD_FILTER_COLUMNS = [
  { key: "id", label: "ID" },
  { key: "ownerName", label: "Propietario" },
  { key: "address", label: "Domicilio" },
  { key: "distrito", label: "Distrito" },
  { key: "fechaNoticia", label: "Fecha" },
  { key: "dominio", label: "Dominio" },
  { key: "source", label: "Origen" },
  { key: "phase", label: "Fase" },
  { key: "status", label: "Estado" },
  { key: "owner", label: "Responsable" },
  { key: "valor", label: "Valor" },
  { key: "enVenta", label: "En Venta" },
] as const;

export type LeadColumnKey = typeof LEAD_FILTER_COLUMNS[number]["key"];
export type ColumnFilter = {
  text: string;
  values: string[];
  exact: string;
  from: string;
  to: string;
};
export type LeadColumnFilters = Partial<Record<LeadColumnKey, ColumnFilter>>;
export type FilterableLead = Lead & {
  month: string;
  dominio: string;
  columnFilterValues?: Partial<Record<LeadColumnKey, string>>;
};
export const EMPTY_COLUMN_FILTER: ColumnFilter = {
  text: "", values: [], exact: "", from: "", to: "",
};

export function normalizeColumnValue(value: string) {
  const text = value.trim();
  return ["—", "-", "Sin origen"].includes(text) ? "" : text;
}

export function columnValue(lead: FilterableLead, key: LeadColumnKey): string {
  if (lead.columnFilterValues?.[key] !== undefined) return lead.columnFilterValues[key];
  if (key === "phase") return PHASE_LABELS[lead.phase];
  if (key === "status") {
    return { activa: "Activa", caliente: "Caliente", desestimada: "Desestimada" }[lead.status];
  }
  if (key === "id") return lead.id.padStart(6, "0");
  if (key === "fechaNoticia") return lead.fechaNoticia.slice(0, 10);
  return normalizeColumnValue(lead[key] ?? "");
}

export function isColumnFilterActive(filter: ColumnFilter) {
  return Boolean(filter.text.trim() || filter.values.length || filter.exact || filter.from || filter.to);
}

export function matchesColumnFilters(lead: FilterableLead, filters: LeadColumnFilters) {
  return LEAD_FILTER_COLUMNS.every(({ key }) => {
    const filter = filters[key];
    if (!filter) return true;
    const value = columnValue(lead, key);
    if (filter.text.trim() && !value.toLocaleLowerCase().includes(filter.text.trim().toLocaleLowerCase())) return false;
    if (filter.values.length && !filter.values.includes(value)) return false;
    if (key === "fechaNoticia") {
      if ((filter.exact || filter.from || filter.to) && !value) return false;
      if (filter.exact && value !== filter.exact) return false;
      if (filter.from && value < filter.from) return false;
      if (filter.to && value > filter.to) return false;
    }
    return true;
  });
}

export function getColumnOptions(leads: FilterableLead[]) {
  return Object.fromEntries(LEAD_FILTER_COLUMNS.map(({ key }) => {
    const values = Array.from(new Set(leads.map(lead => columnValue(lead, key))));
    values.sort((a, b) => a.localeCompare(b, "es", { numeric: true }));
    return [key, values];
  })) as Record<LeadColumnKey, string[]>;
}
