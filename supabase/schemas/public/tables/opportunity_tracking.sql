CREATE TABLE "public"."opportunity_tracking" (
  "oportunity_id" bigint            NOT NULL,
  "phase_id"      bigint            NOT NULL,
  "fecha"         date,
  "memo"          character varying,
  CONSTRAINT "oportunity_detail_oportunity_id_fkey" FOREIGN KEY (oportunity_id) REFERENCES public.opportunities(id),
  CONSTRAINT "oportunity_phase_pkey" PRIMARY KEY (oportunity_id, phase_id),
  CONSTRAINT "oportunity_phase_phase_id_fkey1" FOREIGN KEY (phase_id) REFERENCES public.phases(id)
);

ALTER TABLE "public"."opportunity_tracking"
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "history_read" ON "public"."opportunity_tracking"
  FOR SELECT
  TO "authenticated"
  USING (public.crm_can_read_opportunity(oportunity_id));

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."opportunity_tracking" TO "appsheet_user";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."opportunity_tracking" TO "postgres", "service_role";

COMMENT ON TABLE "public"."opportunity_tracking" IS 'Oportunidad Histórico';

REVOKE ALL ON TABLE "public"."opportunity_tracking" FROM "authenticated";

GRANT SELECT ON TABLE "public"."opportunity_tracking" TO "authenticated";
