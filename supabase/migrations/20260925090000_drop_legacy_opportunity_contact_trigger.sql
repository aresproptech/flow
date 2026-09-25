-- opportunity_activities is a functional activity log; it no longer uses the
-- legacy contact-preparation trigger from the former opportunity_contacts table.
drop trigger if exists crm_prepare_opportunity_contact_trigger
  on public.opportunity_activities;