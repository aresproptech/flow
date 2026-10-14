begin;

alter table public.opportunity_loader
	add constraint opportunity_loader_pkey primary key (id);

commit;
