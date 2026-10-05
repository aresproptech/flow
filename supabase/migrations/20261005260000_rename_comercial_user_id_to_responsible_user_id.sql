begin;

alter table public.opportunities
  rename column comercial_user_id to responsible_user_id;

alter table public.opportunities
  rename constraint opportunities_comercial_user_id_fkey
  to opportunities_responsible_user_id_fkey;

alter index public.idx_opportunities_comercial_user_id
  rename to idx_opportunities_responsible_user_id;

alter view public.crm_leads_view
  rename column comercial_user_id to responsible_user_id;

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
          and o.responsible_user_id = public.crm_current_profile_id()
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
          and o.responsible_user_id = public.crm_current_profile_id()
        )
      )
  )
$$;

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
    coalesce(owner_profile.name, 'Sin comercial')::text as owner,
    'Sin contacto'::text as planner,
    o.estado,
    domain.description::text as dominio
  from public.opportunities o
  join public.phases phase on phase.id = o.fase_id
  left join public.profiles owner_profile on owner_profile.id = o.responsible_user_id
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

notify pgrst, 'reload schema';

commit;
