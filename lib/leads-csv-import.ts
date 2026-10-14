import {
  type Lead,
  type LeadPhase,
  type LeadStatus,
  PHASE_LABELS,
  PHASE_OPTIONS,
  SOURCE_OPTIONS,
  STATUS_OPTIONS,
} from "@/lib/crm-data";

export type ImportTargetField =
  | "ownerName"
  | "address"
  | "distrito"
  | "cp"
  | "phone"
  | "valor"
  | "source"
  | "phase"
  | "status"
  | "fechaNoticia"
  | "fechaContacto"
  | "fechaValoracion"
  | "hora"
  | "planner" // legacy / ignored in Lead model
  | "owner";

export const IMPORT_TARGET_FIELDS: { key: ImportTargetField; label: string; required?: boolean }[] =
  [
    { key: "ownerName", label: "Propietario" },
    { key: "phone", label: "Teléfono" },
    { key: "address", label: "Domicilio" },
    { key: "distrito", label: "Distrito" },
    { key: "cp", label: "CP" },
    { key: "valor", label: "Valor" },
    { key: "source", label: "Origen" },
    { key: "phase", label: "Fase" },
    { key: "status", label: "Estado" },
    { key: "fechaNoticia", label: "Fecha noticia" },
    { key: "fechaContacto", label: "Fecha contacto" },
    { key: "fechaValoracion", label: "Fecha valoración" },
    { key: "hora", label: "Hora" },
    { key: "planner", label: "Planner (ignorado)" },
    { key: "owner", label: "Owner" },
  ];

export type ColumnMapping = Partial<Record<ImportTargetField, string>>; // target -> csv header

export const OPPORTUNITY_LOADER_COLUMNS = [
  "id",
  "nombre_del_lead",
  "compania",
  "contacto_principal",
  "compania_del_lead",
  "responsable",
  "estatus_del_lead",
  "embudo_de_ventas",
  "presupuesto",
  "fecha_de_creacion",
  "creado_por",
  "ultima_modificacion_el",
  "modificado_por",
  "etiquetas_del_lead",
  "tareas_proximas",
  "cerrado_el",
  "fecha",
  "catastro",
  "origen",
  "intencion",
  "ubicacion",
  "tipo",
  "domicilio",
  "complemento",
  "codigo_postal",
  "metros",
  "reforma",
  "objetivo",
  "utm_content",
  "utm_medium",
  "utm_campaign",
  "utm_source",
  "utm_term",
  "utm_referrer",
  "referrer",
  "gclientid",
  "gclid",
  "fbclid",
  "cargo_contacto",
  "correo_contacto",
  "email_priv_contacto",
  "otro_email_contacto",
  "telefono_oficina_contacto",
  "telefono_oficina_directo_contacto",
  "telefono_celular_contacto",
  "fax_contacto",
  "telefono_de_casa_contacto",
  "otro_telefono_contacto",
  "terminos_y_condiciones_contacto",
  "nota_1",
  "nota_2",
  "nota_3",
  "nota_4",
  "nota_5",
] as const;

export type OpportunityLoaderColumn = (typeof OPPORTUNITY_LOADER_COLUMNS)[number];
export type OpportunityLoaderRow = Partial<
  Record<OpportunityLoaderColumn, string | null>
>;

const OPPORTUNITY_LOADER_COLUMN_SET: ReadonlySet<string> = new Set(
  OPPORTUNITY_LOADER_COLUMNS
);

function normalizeOpportunityLoaderHeader(value: string) {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");

  return normalized === "e_mail_priv_contacto"
    ? "email_priv_contacto"
    : normalized;
}

export function mapCsvRowsToOpportunityLoader(rows: Record<string, string>[]) {
  const headerMappings = Object.keys(rows[0] ?? {}).flatMap((header) => {
    const column = normalizeOpportunityLoaderHeader(header);
    return OPPORTUNITY_LOADER_COLUMN_SET.has(column)
      ? [{ header, column: column as OpportunityLoaderColumn }]
      : [];
  });

  const mappedRows = rows.map((row) => {
    const mapped: Partial<Record<OpportunityLoaderColumn, string>> = {};
    for (const { header, column } of headerMappings) {
      mapped[column] = row[header] ?? "";
    }
    return mapped;
  });

  return { matchedColumns: headerMappings.length, rows: mappedRows };
}

export function mapOpportunityLoaderRowsToTargets(
  rows: OpportunityLoaderRow[],
  headers: string[],
  mapping: ColumnMapping
) {
  const targetColumns = Object.entries(mapping).flatMap(([target, header]) => {
    if (!header) return [];
    const column = normalizeOpportunityLoaderHeader(header);
    return OPPORTUNITY_LOADER_COLUMN_SET.has(column)
      ? [{ target: target as ImportTargetField, column: column as OpportunityLoaderColumn }]
      : [];
  });

  const missingColumns = targetColumns
    .filter(({ column }) => !headers.some((header) => normalizeOpportunityLoaderHeader(header) === column))
    .map(({ column }) => column);

  if (missingColumns.length > 0) {
    throw new Error(
      `No se encontraron estas columnas del CSV en opportunity_loader: ${missingColumns.join(", ")}.`
    );
  }

  return rows.map((row) => {
    const mapped: Partial<Record<ImportTargetField, string>> = {};
    for (const { target, column } of targetColumns) {
      mapped[target] = row[column] ?? "";
    }
    return mapped;
  });
}

function norm(s: string) {
  return (s ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

// Default mapping for common exports (e.g. Kommo).
// Note: we intentionally do NOT auto-assign estado, owner, fechaContacto, fechaValoracion, hora, planner.
export const DEFAULT_MAPPING: Partial<Record<ImportTargetField, string>> = {
  ownerName: "Contacto principal",
  address: "Domicilio",
  cp: "Código Postal",
  valor: "Presupuesto",
  source: "Origen",
  phase: "Embudo de ventas",
  fechaNoticia: "Fecha de Creación",
};

const KOMMO_SUGGESTIONS: Array<{ csv: string; target: ImportTargetField }> = [
  { csv: "Contacto principal", target: "ownerName" },
  { csv: "Nombre completo", target: "ownerName" },
  { csv: "Teléfono celular", target: "phone" },
  { csv: "Domicilio", target: "address" },
  { csv: "Código Postal", target: "cp" },
  { csv: "Presupuesto", target: "valor" },
  { csv: "Presupuesto €", target: "valor" },
  { csv: "Origen", target: "source" },
  { csv: "Estatus del lead", target: "status" },
  { csv: "Embudo de ventas", target: "phase" },
  { csv: "Fecha de Creación", target: "fechaNoticia" },
  { csv: "Respons. usuario", target: "owner" },
  { csv: "Ubicación", target: "distrito" },
];

export function suggestMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  const headerNorm = new Map(headers.map((h) => [norm(h), h]));

  // 1) Apply DEFAULT_MAPPING when the CSV contains those columns.
  for (const [target, desiredHeader] of Object.entries(DEFAULT_MAPPING) as Array<
    [ImportTargetField, string]
  >) {
    const match = headerNorm.get(norm(desiredHeader));
    if (match) mapping[target] = match;
  }

  // Prefer the real contact person over the generic lead title when both exist.
  const contactoPrincipal = headerNorm.get(norm("Contacto principal"));
  if (contactoPrincipal) {
    mapping.ownerName = contactoPrincipal;
  }

  // Phone fallback: oficina -> celular -> teléfono
  const phoneCandidates = ["Teléfono oficina", "Teléfono celular", "Teléfono"];
  for (const candidate of phoneCandidates) {
    const match = headerNorm.get(norm(candidate));
    if (match) {
      mapping.phone = match;
      break;
    }
  }

  for (const s of KOMMO_SUGGESTIONS) {
    // Do not override defaults / intentional non-auto fields.
    if (mapping[s.target]) continue;
    if (
      s.target === "status" ||
      s.target === "owner" ||
      s.target === "fechaContacto" ||
      s.target === "fechaValoracion" ||
      s.target === "hora" ||
      s.target === "planner"
    ) {
      continue;
    }
    const match = headerNorm.get(norm(s.csv));
    if (match) mapping[s.target] = match;
  }

  // Light heuristics for common Spanish variants
  const heuristics: Array<{ re: RegExp; target: ImportTargetField }> = [
    { re: /\b(propietario|nombre)\b/i, target: "ownerName" },
    { re: /\b(telefono|m(o|ó)vil|celular)\b/i, target: "phone" },
    { re: /\b(domicilio|direccion|dirección)\b/i, target: "address" },
    { re: /\b(cp|codigo postal|c(o|ó)digo postal)\b/i, target: "cp" },
    { re: /\b(valor|presupuesto|importe)\b/i, target: "valor" },
    { re: /\b(origen|fuente)\b/i, target: "source" },
    { re: /\b(fase|embudo|pipeline)\b/i, target: "phase" },
    { re: /\b(estado|estatus)\b/i, target: "status" },
    { re: /\b(fecha.*noticia|fecha.*creaci(o|ó)n|created)\b/i, target: "fechaNoticia" },
    { re: /\b(fecha.*contacto)\b/i, target: "fechaContacto" },
    { re: /\b(fecha.*valoraci(o|ó)n)\b/i, target: "fechaValoracion" },
    { re: /\b(hora)\b/i, target: "hora" },
    { re: /\b(owner|responsable|agente)\b/i, target: "owner" },
  ];

  for (const h of headers) {
    const n = norm(h);
    for (const { re, target } of heuristics) {
      if (mapping[target]) continue;
      if (
        target === "status" ||
        target === "owner" ||
        target === "fechaContacto" ||
        target === "fechaValoracion" ||
        target === "hora" ||
        target === "planner"
      ) {
        continue;
      }
      if (re.test(n)) mapping[target] = h;
    }
  }

  return mapping;
}

function normalizePhase(value: string): LeadPhase {
  const v = norm(value);
  const direct = PHASE_OPTIONS.find((o) => norm(o.value) === v)?.value;
  if (direct) return direct;
  const byLabel = Object.entries(PHASE_LABELS).find(([, label]) => norm(label) === v);
  if (byLabel) return byLabel[0] as LeadPhase;
  if (v.includes("noticia")) return "identificada";
  if (v.includes("concertada")) return "cualificada";
  if (v.includes("vendida") || v.includes("vender")) return "encargo";
  return "identificada";
}

function normalizeStatus(value: string): LeadStatus {
  const v = norm(value);
  if (
    !v ||
    v === "activa" ||
    v === "activo" ||
    v === "identificar" ||
    v === "identificada" ||
    v === "identificado" ||
    v === "identificacion" ||
    v === "identificación" ||
    v === "cualificada" ||
    v === "seguimiento"
  ) {
    return "activa";
  }
  const direct = STATUS_OPTIONS.find((o) => norm(o.value) === v)?.value;
  if (direct) return direct as LeadStatus;
  const byLabel = STATUS_OPTIONS.find((o) => norm(o.label) === v)?.value;
  if (byLabel) return byLabel as LeadStatus;
  return "activa";
}

function normalizeSource(value: string): string {
  const v = norm(value);
  const match = SOURCE_OPTIONS.find((o) => norm(o) === v);
  return match ?? (value?.trim() ? value.trim() : "Otro");
}

function normalizeCsvDateToIsoDate(value: string | undefined | null): string {
  const raw = (value || "").trim();
  if (!raw) return "";

  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  }

  const dottedMatch = raw.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
  if (dottedMatch) {
    const day = dottedMatch[1].padStart(2, "0");
    const month = dottedMatch[2].padStart(2, "0");
    const year = dottedMatch[3].length === 2 ? `20${dottedMatch[3]}` : dottedMatch[3];

    return `${year}-${month}-${day}`;
  }

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, "0");
    const day = String(parsed.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
  }

  return "";
}

export type RowValidationResult = {
  valid: boolean;
  missingRequired: ImportTargetField[];
};

export function validateMappedRow(
  mapped: Partial<Record<ImportTargetField, string>>
): RowValidationResult {
  const hasName = Boolean(mapped.ownerName && mapped.ownerName.trim());
  const hasPhone = Boolean(mapped.phone && mapped.phone.trim());
  const valid = hasName || hasPhone;
  const missing: ImportTargetField[] = [];
  if (!hasName) missing.push("ownerName");
  if (!hasPhone) missing.push("phone");
  return { valid, missingRequired: valid ? [] : missing };
}

export function mapCsvRowToTargets(
  row: Record<string, string>,
  mapping: ColumnMapping
): Partial<Record<ImportTargetField, string>> {
  const out: Partial<Record<ImportTargetField, string>> = {};
  for (const key of Object.keys(mapping) as ImportTargetField[]) {
    const header = mapping[key];
    if (!header) continue;
    out[key] = (row[header] ?? "").trim();
  }
  return out;
}

export function buildLeadFromMapped(
  mapped: Partial<Record<ImportTargetField, string>>
): Lead {
  const now = new Date().toISOString().slice(0, 10);
  const owner = mapped.owner?.trim() || "";

  const address = mapped.address?.trim() || "";
  const distrito = mapped.distrito?.trim() || "";
  const cp = mapped.cp?.trim() || "";

  const fechaNoticia = normalizeCsvDateToIsoDate(mapped.fechaNoticia) || now;
  const fechaContacto = normalizeCsvDateToIsoDate(mapped.fechaContacto);
  const fechaValoracion = normalizeCsvDateToIsoDate(mapped.fechaValoracion);

  const phase = mapped.phase ? normalizePhase(mapped.phase) : "identificada";
  // If address is missing, keep the lead active so it can be completed later.
  const status =
    !address
      ? "activa"
      : mapped.status
        ? normalizeStatus(mapped.status)
        : "activa";
  const source = mapped.source ? normalizeSource(mapped.source) : "Otro";

  return {
    id: crypto.randomUUID(),
    ownerName: mapped.ownerName?.trim() || "",
    address,
    distrito,
    municipio: "",
    provincia: "",
    cp,
    valor: mapped.valor?.trim() || "",
    phone: mapped.phone?.trim() || "",
    source,
    phase,
    status,
    fechaNoticia,
    fechaContacto,
    fechaValoracion,
    hora: mapped.hora?.trim() || "",
    owner,
    createdAt: fechaNoticia || now,
    assignedUser: owner,
    propertyAddress: address,
    notes: "",
    observaciones: [],
  };
}
