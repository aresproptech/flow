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
  return {
    data: ids.map(
      (id): CrmLeadDetails => ({
        id,
        fecha_contacto: null,
        fecha_valoracion: null,
        hora: null,
        medio: null,
        contact_user_id: null,
        contact_name: null,
        buyer_user_id: null,
        buyer_name: null,
      })
    ),
    error: null,
  };
}
