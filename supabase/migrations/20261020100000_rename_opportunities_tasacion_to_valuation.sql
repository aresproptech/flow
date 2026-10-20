begin;

alter table public.opportunities
  rename column tasacion to valuation;

alter view public.crm_leads_view
  rename column tasacion to valuation;

commit;