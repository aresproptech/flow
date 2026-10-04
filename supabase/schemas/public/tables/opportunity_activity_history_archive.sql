CREATE TABLE public.opportunity_activity_history_archive (
  activity_id bigint NOT NULL,
  opportunity_id bigint,
  legacy_payload jsonb NOT NULL,
  archived_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT opportunity_activity_history_archive_pkey PRIMARY KEY (activity_id),
  CONSTRAINT opportunity_activity_history_archive_activity_id_fkey
    FOREIGN KEY (activity_id) REFERENCES public.opportunity_activities(id) ON DELETE CASCADE,
  CONSTRAINT opportunity_activity_history_archive_opportunity_id_fkey
    FOREIGN KEY (opportunity_id) REFERENCES public.opportunities(id) ON DELETE CASCADE
);

ALTER TABLE public.opportunity_activity_history_archive
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY activity_history_archive_select_by_opportunity
  ON public.opportunity_activity_history_archive
  FOR SELECT
  TO authenticated
  USING (
    opportunity_id IS NOT NULL
    AND public.crm_can_read_opportunity(opportunity_id)
  );

REVOKE ALL ON TABLE public.opportunity_activity_history_archive
  FROM public, anon, authenticated;

GRANT SELECT ON TABLE public.opportunity_activity_history_archive TO authenticated;
GRANT ALL ON TABLE public.opportunity_activity_history_archive TO postgres, service_role;
