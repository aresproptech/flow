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
    .from("crm_lead_details_view")
    .select("id, fecha_contacto, fecha_valoracion, hora, medio, contact_user_id, contact_name, buyer_user_id, buyer_name")
    .in("id", ids);

  return { data: (data ?? []) as CrmLeadDetails[], error };
}
