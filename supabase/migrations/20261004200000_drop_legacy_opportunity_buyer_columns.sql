begin;

alter table public.opportunity_buyers
  drop column if exists planning,
  drop column if exists equipo,
  drop column if exists planner,
  drop column if exists owner,
  drop column if exists estado,
  drop column if exists dominio,
  drop column if exists notas;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'opportunity_buyers'
      and column_name = any (array[
        'planning', 'equipo', 'planner', 'owner', 'estado', 'dominio', 'notas'
      ])
  ) then
    raise exception 'Some requested legacy opportunity_buyers columns still exist';
  end if;
end
$$;

notify pgrst, 'reload schema';

commit;
