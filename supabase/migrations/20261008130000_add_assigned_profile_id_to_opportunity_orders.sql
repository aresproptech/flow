begin;

alter table public.opportunity_orders
  add column if not exists assigned_profile_id bigint;

alter table public.opportunity_orders
  add constraint opportunity_orders_assigned_profile_id_fkey
  foreign key (assigned_profile_id)
  references public.profiles(id)
  on delete set null;

notify pgrst, 'reload schema';

commit;