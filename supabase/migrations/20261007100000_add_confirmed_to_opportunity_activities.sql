begin;

alter table public.opportunity_activities
  add column if not exists confirmed boolean not null default false;

notify pgrst, 'reload schema';

commit;