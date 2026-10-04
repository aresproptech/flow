begin;

drop view if exists public.crm_lead_details_view;

notify pgrst, 'reload schema';

commit;
