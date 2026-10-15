begin;

alter table public.opportunity_loader
	alter column id type bigint using id::bigint,
	add column id_external text,
	add column created_at timestamp without time zone,
	add column updated_at timestamp without time zone,
	add column deleted_at timestamp without time zone,
	add column created_by text,
	add column updated_by text,
	add column deleted_by text;

commit;
