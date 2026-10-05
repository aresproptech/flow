CREATE VIEW "public"."crm_leads_view" WITH (security_invoker=true) AS
SELECT
  o.id,
  o.is_favorite,
  o.created_at,
  o.fecha,
  o.propietario,
  o.telefono,
  o.domicilio,
  o.postal_id AS cp,
  po.provincia,
  po.distrito,
  o.domain_id,
  d.description AS domain_name,
  o.source_id,
  s.code AS source_name,
  o.fase_id,
  p.name AS fase_name,
  o.estado,
  o.comercial_user_id,
  u.name AS responsable,
  o.tasacion,
  o.en_venta,
  o.memo,
  o.deleted_at,
  o.occupancy
FROM public.opportunities o
LEFT JOIN public.domain d ON d.id = o.domain_id
LEFT JOIN public.phases p ON p.id = o.fase_id
LEFT JOIN public.sources s ON s.id = o.source_id
LEFT JOIN public.profiles u ON u.id = o.comercial_user_id
LEFT JOIN public.postal po ON po.id = o.postal_id
WHERE o.deleted_at IS NULL;

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."crm_leads_view" TO "appsheet_user";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."crm_leads_view" TO "postgres", "service_role";

REVOKE ALL ON TABLE "public"."crm_leads_view" FROM "authenticated";

GRANT SELECT ON TABLE "public"."crm_leads_view" TO "authenticated";
