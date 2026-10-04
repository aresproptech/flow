CREATE VIEW public.crm_lead_details_view WITH (security_invoker = true) AS
SELECT
  o.id,
  o.fecha_contacto,
  o.fecha_valoracion,
  o.hora,
  o.medio,
  o.contact_user_id,
  COALESCE(uc.name, o.contact_user_desc, 'Sin contacto'::text) AS contact_name,
  o.buyer_user_id,
  COALESCE(ub.name, o.buyer_user_desc, 'Sin buyer'::text) AS buyer_name
FROM public.opportunities o
LEFT JOIN public.profiles uc ON uc.id = o.contact_user_id
LEFT JOIN public.profiles ub ON ub.id = o.buyer_user_id
WHERE o.deleted_at IS NULL;

REVOKE ALL ON TABLE public.crm_lead_details_view FROM public, anon, authenticated;
GRANT SELECT ON TABLE public.crm_lead_details_view TO authenticated;
GRANT SELECT ON TABLE public.crm_lead_details_view TO postgres, service_role;
