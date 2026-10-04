import { supabase } from "@/lib/supabase";

export type CrmLeadDetails = {
  id: number;
  fecha_contacto: string | null;
  fecha_valoracion: string | null;
  hora: string | null;
  medio: string | null;
  contact_user_id: number | null;
  contact_name: string | null;
  buyer_user_id: number | null;
  buyer_name: string | null;
};

export async function loadCrmLeadDetails(opportunityIds: number[]) {
  const ids = Array.from(new Set(opportunityIds));
  if (ids.length === 0) {
    return { data: [] as CrmLeadDetails[], error: null };
  }

  const { data, error } = await supabase
    .from("opportunities")
    .select(
      "id, fecha_contacto, fecha_valoracion, hora, medio, contact_user_id, contact_user_desc, buyer_user_id, buyer_user_desc, contact_profile:profiles!opportunities_contact_user_id_fkey(name), buyer_profile:profiles!opportunities_buyer_user_id_fkey(name)"
    )
    .in("id", ids);

  const rows = (data ?? []) as Array<{
    id: number;
    fecha_contacto: string | null;
    fecha_valoracion: string | null;
    hora: string | null;
    medio: string | null;
    contact_user_id: number | null;
    contact_user_desc: string | null;
    buyer_user_id: number | null;
    buyer_user_desc: string | null;
    contact_profile: { name: string | null } | { name: string | null }[] | null;
    buyer_profile: { name: string | null } | { name: string | null }[] | null;
  }>;
  const profileName = (
    profile: { name: string | null } | { name: string | null }[] | null
  ) => (Array.isArray(profile) ? profile[0]?.name : profile?.name)?.trim() || "";

  return {
    data: rows.map((row) => ({
      id: row.id,
      fecha_contacto: row.fecha_contacto,
      fecha_valoracion: row.fecha_valoracion,
      hora: row.hora,
      medio: row.medio,
      contact_user_id: row.contact_user_id,
      contact_name: profileName(row.contact_profile) || row.contact_user_desc?.trim() || "Sin contacto",
      buyer_user_id: row.buyer_user_id,
      buyer_name: profileName(row.buyer_profile) || row.buyer_user_desc?.trim() || "Sin buyer",
    })) as CrmLeadDetails[],
    error,
  };
}
