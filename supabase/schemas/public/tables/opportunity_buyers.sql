CREATE TABLE "public"."opportunity_buyers" (
  "id"                   bigint                   NOT NULL DEFAULT nextval('public.visitas_id_seq'::regclass),
  "opportunity_id"       bigint,
  "planning"             text,
  "fecha_visita"         date,
  "hora"                 time without time zone,
  "equipo"               text,
  "medio"                text                     DEFAULT 'Presencial'::text,
  "resultado"            text,
  "planner"              text,
  "owner"                text,
  "buyer"                text,
  "notas"                text,
  "created_by"           text                     NOT NULL DEFAULT 'Sistema'::text,
  "created_at"           timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"           timestamp with time zone NOT NULL DEFAULT now(),
  "estado"               text,
  "dominio"              text,
  "nombre_apellido"      text,
  "telefono"             text,
  "dni"                  text,
  "vende"                boolean,
  "observaciones_visita" text,
  CONSTRAINT "visitas_opportunity_id_fkey" FOREIGN KEY (opportunity_id) REFERENCES public.opportunities(id),
  CONSTRAINT "visitas_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."opportunity_buyers"
  ENABLE ROW LEVEL SECURITY;

ALTER SEQUENCE "public"."visitas_id_seq" OWNED BY "public"."opportunity_buyers"."id";

CREATE INDEX idx_visitas_fecha ON public.opportunity_buyers USING btree (fecha_visita);

CREATE INDEX idx_visitas_opportunity_id ON public.opportunity_buyers USING btree (opportunity_id);

CREATE POLICY "visitas_delete_by_role" ON "public"."opportunity_buyers"
  FOR DELETE
  TO "authenticated"
  USING ((public.crm_can_manage_visits() OR public.crm_can_write_opportunity(opportunity_id)));

CREATE POLICY "visitas_insert_by_role" ON "public"."opportunity_buyers"
  FOR INSERT
  TO "authenticated"
  WITH CHECK (public.crm_can_create_visit_for_opportunity(opportunity_id));

CREATE POLICY "visitas_select_by_role" ON "public"."opportunity_buyers"
  FOR SELECT
  TO "authenticated"
  USING ((public.crm_can_manage_visits() OR public.crm_can_read_opportunity(opportunity_id)));

CREATE POLICY "visitas_update_by_role" ON "public"."opportunity_buyers"
  FOR UPDATE
  TO "authenticated"
  USING ((public.crm_can_manage_visits() OR public.crm_can_write_opportunity(opportunity_id)))
  WITH CHECK (public.crm_can_create_visit_for_opportunity(opportunity_id));

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."opportunity_buyers" TO "appsheet_user";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."opportunity_buyers" TO "postgres", "service_role";

REVOKE ALL ON TABLE "public"."opportunity_buyers" FROM "authenticated";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."opportunity_buyers" TO "authenticated";
