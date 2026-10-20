import { supabase } from "@/lib/supabase";
import {
  mapCsvRowsToOpportunityLoader,
  type OpportunityLoaderRow,
} from "@/lib/leads-csv-import";
import {
  normalizeOpportunityText,
  type Lead,
} from "@/lib/crm-data";

type LookupRow = {
  id: number;
  name?: string | null;
  code?: string | null;
  description?: string | null;
};

type PhaseKey = Lead["phase"];

const FALLBACK_PHASE_IDS: Partial<Record<PhaseKey, number>> = {
  identificada: 1,
  cualificada: 2,
  valorada: 3,
  encargo: 4,
};

function normalizeLookupText(value: string | null | undefined) {
  return (value || "")
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function phaseNameToKey(name: string | null | undefined): PhaseKey | null {
  const value = normalizeLookupText(name);
  if (value.includes("noticia") || value.includes("identificada")) return "identificada";
  if (value.includes("concertada") || value.includes("cualificada")) return "cualificada";
  if (value.includes("valorada")) return "valorada";
  if (value.includes("encargo")) return "encargo";
  return null;
}

function cleanNullable(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed || ["—", "-", "N/A", "Sin origen", "Sin asignar"].includes(trimmed)) {
    return null;
  }
  return trimmed;
}

function normalizePostalId(value: string | null | undefined): number | null {
  const postalCode = value?.trim();
  return postalCode && /^\d{5}$/.test(postalCode) ? Number(postalCode) : null;
}

export async function insertOpportunityLoaderRows(
  csvRows: Record<string, string>[]
): Promise<{ rows: OpportunityLoaderRow[] } | { error: string }> {
  if (csvRows.length === 0) {
    return { error: "El CSV no contiene filas para cargar." };
  }

  const { matchedColumns, rows } = mapCsvRowsToOpportunityLoader(csvRows);
  if (matchedColumns === 0) {
    return { error: "No se encontraron encabezados que coincidan con opportunity_loader." };
  }

  const { data, error } = await supabase
    .from("opportunity_loader")
    .insert(rows)
    .select("*");

  if (error) {
    console.error("Error cargando opportunity_loader:", error.code);
    return {
      error: "No se pudo cargar el archivo. Verificá que la migración esté aplicada e intentá nuevamente.",
    };
  }

  if (!data || data.length !== rows.length) {
    return { error: "La base no confirmó todas las filas del CSV." };
  }

  return { rows: data as OpportunityLoaderRow[] };
}

export async function insertImportedLeads(leads: Lead[]): Promise<string | null> {
  if (leads.length === 0) return "No hay filas válidas para importar.";

  const [phasesResponse, profilesResponse, sourcesResponse, domainsResponse] =
    await Promise.all([
      supabase.from("phases").select("id, name"),
      supabase.rpc("crm_profile_assignment_options"),
      supabase.from("sources").select("id, code").eq("enabled", true),
      supabase.from("domain").select("id, code, description").eq("enabled", true),
    ]);

  if (profilesResponse.error || sourcesResponse.error) {
    console.error("Error cargando catálogos para importación:", {
      profilesCode: profilesResponse.error?.code,
      sourcesCode: sourcesResponse.error?.code,
    });
  }
  if (phasesResponse.error) console.error("Error cargando fases:", phasesResponse.error.code);
  if (domainsResponse.error) console.error("Error cargando dominios:", domainsResponse.error.code);

  const phaseIds = new Map<PhaseKey, number>();
  for (const phase of (phasesResponse.data ?? []) as LookupRow[]) {
    const key = phaseNameToKey(phase.name);
    if (key) phaseIds.set(key, phase.id);
  }

  const profileIdByName = new Map(
    ((profilesResponse.data ?? []) as LookupRow[])
      .filter((profile) => profile.name?.trim())
      .map((profile) => [normalizeLookupText(profile.name), profile.id])
  );
  const sourceIdByCode = new Map(
    ((sourcesResponse.data ?? []) as LookupRow[])
      .filter((source) => source.code?.trim())
      .map((source) => [normalizeLookupText(source.code), source.id])
  );
  const domainIdByName = new Map<string, number>();
  for (const domain of (domainsResponse.data ?? []) as LookupRow[]) {
    const label = domain.description?.trim() || domain.code?.trim() || "";
    if (label) domainIdByName.set(normalizeLookupText(label), domain.id);
  }

  const rowsToInsert = leads.map((lead) => {
    const phaseId = phaseIds.get(lead.phase) ?? FALLBACK_PHASE_IDS[lead.phase] ?? 1;
    const domainName = (lead as Lead & { dominio?: string | null }).dominio;

    return {
      propietario: normalizeOpportunityText(lead.ownerName),
      domicilio: normalizeOpportunityText(lead.address),
      telefono: cleanNullable(lead.phone),
      valuation: cleanNullable(lead.valor),
      estado: cleanNullable(lead.status),
      fecha: cleanNullable(lead.fechaNoticia),
      domain_id: domainIdByName.get(normalizeLookupText(domainName)) ?? null,
      postal_id: normalizePostalId(lead.cp),
      fase_id: phaseId,
      memo: cleanNullable(lead.notes),
      en_venta: null,
      occupancy: cleanNullable(lead.occupancy),
      source_id: sourceIdByCode.get(normalizeLookupText(lead.source)) ?? null,
      responsible_user_id: profileIdByName.get(normalizeLookupText(lead.owner)) ?? null,
    };
  });

  const { data, error } = await supabase
    .from("opportunities")
    .insert(rowsToInsert)
    .select("id");

  if (error) {
    console.error("Error importing CSV to Supabase:", error.code);
    return "No se pudieron importar los leads. Revisá el archivo e intentá nuevamente.";
  }

  if (!data || data.length !== rowsToInsert.length) {
    console.error("Supabase no confirmó todas las oportunidades.", {
      insertedCount: data?.length ?? 0,
      expectedCount: rowsToInsert.length,
    });
    return "La importación no confirmó todas las oportunidades.";
  }

  return null;
}