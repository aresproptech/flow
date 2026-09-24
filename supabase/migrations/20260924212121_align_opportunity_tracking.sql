-- El entorno actual usa opportunity_tracking. Conservamos una migración
-- compatible con bases históricas que todavía tengan opportunity_history.
do $$
begin
  if to_regclass('public.opportunity_tracking') is null
     and to_regclass('public.opportunity_history') is not null then
    alter table public.opportunity_history rename to opportunity_tracking;
  end if;

  if to_regclass('public.opportunity_tracking') is null then
    raise exception 'Missing required relation public.opportunity_tracking';
  end if;
end
$$;
