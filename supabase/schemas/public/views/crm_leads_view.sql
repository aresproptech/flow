CREATE VIEW "public"."crm_leads_view" WITH (security_invoker=true) AS  SELECT o.id,
    o.created_at,
    o.fecha,
    o.propietario,
    o.telefono,
    o.domicilio,
    o.tasacion,
    o.estado,
    o.memo,
    o.en_venta,
    o.medio,
    o.fase_id,
    COALESCE(p.name, 'Sin fase'::character varying) AS fase_name,
    o.source_id,
    COALESCE(s.code, (o.source_desc)::character varying, 'Sin origen'::character varying) AS source_name,
    o.comercial_user_id,
    COALESCE(u.name, o.comercial_user_desc, 'Sin comercial'::text) AS comercial_name,
    o.contact_user_id,
    COALESCE(uc.name, o.contact_user_desc, 'Sin contacto'::text) AS contact_name,
    o.postal_id,
    po.id AS cp,
    po.provincia,
    po.distrito,
    o.team_id,
    o.dominio_desc,
    o.deleted_at,
    o.fecha_contacto,
    o.fecha_valoracion,
    o.hora,
    o.buyer_user_id,
    COALESCE(ub.name, o.buyer_user_desc, 'Sin buyer'::text) AS buyer_name,
    o.is_favorite
   FROM ((((((public.opportunities o
     LEFT JOIN public.phases p ON ((p.id = o.fase_id)))
     LEFT JOIN public.sources s ON ((s.id = o.source_id)))
     LEFT JOIN public.profiles u ON ((u.id = o.comercial_user_id)))
     LEFT JOIN public.profiles uc ON ((uc.id = o.contact_user_id)))
     LEFT JOIN public.profiles ub ON ((ub.id = o.buyer_user_id)))
     LEFT JOIN public.postal po ON ((po.id = o.postal_id)))
  WHERE (o.deleted_at IS NULL);

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."crm_leads_view" TO "appsheet_user";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."crm_leads_view" TO "postgres", "service_role";

REVOKE ALL ON TABLE "public"."crm_leads_view" FROM "authenticated";

GRANT SELECT ON TABLE "public"."crm_leads_view" TO "authenticated";
