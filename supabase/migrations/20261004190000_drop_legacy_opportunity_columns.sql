begin;

create or replace function public.crm_can_read_opportunity(target_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.opportunities o
    where o.id = target_id
      and o.deleted_at is null
      and (
        public.crm_current_role() in ('admin', 'coordinador')
        or (
          public.crm_current_role() = 'comercial'
          and not public.crm_can_manage_visits()
          and o.comercial_user_id = public.crm_current_profile_id()
        )
      )
  )
$$;

create or replace function public.crm_can_write_opportunity(target_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.opportunities o
    where o.id = target_id
      and o.deleted_at is null
      and (
        public.crm_current_role() in ('admin', 'coordinador')
        or (
          public.crm_current_role() = 'comercial'
          and not public.crm_can_manage_visits()
          and o.comercial_user_id = public.crm_current_profile_id()
        )
      )
  )
$$;

drop policy if exists opportunities_insert_by_role on public.opportunities;
create policy opportunities_insert_by_role
on public.opportunities
for insert to authenticated
with check (
  public.crm_current_role() in ('admin', 'coordinador')
  or (
    public.crm_current_role() = 'comercial'
    and not public.crm_can_manage_visits()
    and comercial_user_id = public.crm_current_profile_id()
  )
);

drop policy if exists opportunities_select_by_role on public.opportunities;
create policy opportunities_select_by_role
on public.opportunities
for select to authenticated
using (public.crm_can_read_opportunity(id));

drop policy if exists opportunities_update_by_role on public.opportunities;
create policy opportunities_update_by_role
on public.opportunities
for update to authenticated
using (public.crm_can_write_opportunity(id))
with check (public.crm_can_write_opportunity(id));

create or replace function public.crm_visit_property_options()
returns table (
  id bigint,
  propietario text,
  domicilio text,
  owner text,
  planner text,
  estado text,
  dominio text
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null or public.crm_current_role() is null then
    raise exception 'Sesión no válida' using errcode = '42501';
  end if;

  return query
  select
    o.id,
    o.propietario,
    o.domicilio,
    coalesce(owner_profile.name, 'Sin comercial') as owner,
    'Sin contacto'::text as planner,
    o.estado,
    domain.description as dominio
  from public.opportunities o
  join public.phases phase on phase.id = o.fase_id
  left join public.profiles owner_profile on owner_profile.id = o.comercial_user_id
  left join public.domain domain on domain.id = o.domain_id
  where o.deleted_at is null
    and lower(btrim(phase.name)) = 'encargo'
    and (
      public.crm_can_manage_visits()
      or public.crm_can_read_opportunity(o.id)
    )
  order by o.propietario nulls last, o.id;
end
$function$;

alter table public.opportunities
  drop column if exists dominio_desc,
  drop column if exists comercial_user_desc,
  drop column if exists contact_user_desc,
  drop column if exists source_desc,
  drop column if exists contact_user_id,
  drop column if exists fecha_contacto,
  drop column if exists fecha_valoracion,
  drop column if exists hora,
  drop column if exists medio,
  drop column if exists buyer_user_desc,
  drop column if exists buyer_user_id,
  drop column if exists contacto;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'opportunities'
      and column_name = any (array[
        'dominio_desc', 'comercial_user_desc', 'contact_user_desc',
        'source_desc', 'contact_user_id', 'fecha_contacto', 'fecha_valoracion',
        'hora', 'medio', 'buyer_user_desc', 'buyer_user_id', 'contacto'
      ])
  ) then
    raise exception 'Some requested legacy opportunities columns still exist';
  end if;
end
$$;

notify pgrst, 'reload schema';

commit;
