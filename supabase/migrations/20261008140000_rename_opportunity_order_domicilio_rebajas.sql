begin;

do $$
begin
  if exists (
    select 1
    from public.opportunity_orders
    where rebajas is not null
      and rebajas not in (0, 1)
  ) then
    raise exception 'Cannot convert opportunity_orders.rebajas: expected only 0, 1, or NULL';
  end if;
end
$$;

alter table public.opportunity_orders
  rename column domicilio to event_type;

alter table public.opportunity_orders
  alter column event_type type text using event_type::text;

alter table public.opportunity_orders
  rename column rebajas to is_current;

alter table public.opportunity_orders
  alter column is_current drop default;

alter table public.opportunity_orders
  alter column is_current type boolean
  using case
    when is_current = 1 then true
    when is_current = 0 then false
    else null
  end;

alter table public.opportunity_orders
  alter column is_current set default false;

notify pgrst, 'reload schema';

commit;