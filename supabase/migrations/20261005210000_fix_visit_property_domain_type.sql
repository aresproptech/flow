begin;

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

revoke all on function public.crm_visit_property_options() from public;
grant execute on function public.crm_visit_property_options() to authenticated, postgres, service_role;

notify pgrst, 'reload schema';

commit;
