begin;

alter table public.opportunity_loader
	alter column created_at set default now(),
	alter column created_by set default public.crm_current_profile_id()::text;

commit;
