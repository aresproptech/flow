-- Auditoría de solo lectura para la Fase 1.
-- No crea, modifica ni elimina datos.

with active_opportunities as (
  select *
  from public.opportunities
  where deleted_at is null
), metrics(section, metric, value) as (
  select 'leads', 'activos', count(*) from active_opportunities
  union all
  select 'leads', 'eliminados_logicamente', count(*) from public.opportunities where deleted_at is not null

  union all
  select 'comercial', 'id_informado', count(*) from active_opportunities where comercial_user_id is not null
  union all
  select 'comercial', 'id_nulo_con_nombre', count(*) from active_opportunities where comercial_user_id is null and nullif(btrim(comercial_user_desc), '') is not null
  union all
  select 'comercial', 'id_nulo_nombre_asignable', count(*)
  from active_opportunities o
  where o.comercial_user_id is null
    and exists (
      select 1 from public.profiles p
      where lower(btrim(p.name)) = lower(btrim(o.comercial_user_desc))
    )
  union all
  select 'comercial', 'id_nulo_nombre_sin_coincidencia', count(*)
  from active_opportunities o
  where o.comercial_user_id is null
    and nullif(btrim(o.comercial_user_desc), '') is not null
    and not exists (
      select 1 from public.profiles p
      where lower(btrim(p.name)) = lower(btrim(o.comercial_user_desc))
    )
  union all
  select 'comercial', 'id_y_nombre_inconsistentes', count(*)
  from active_opportunities o
  join public.profiles p on p.id = o.comercial_user_id
  where nullif(btrim(o.comercial_user_desc), '') is not null
    and lower(btrim(o.comercial_user_desc)) <> lower(btrim(p.name))

  union all
  select 'planner', 'id_informado', count(*) from active_opportunities where contact_user_id is not null
  union all
  select 'planner', 'id_nulo_con_nombre', count(*) from active_opportunities where contact_user_id is null and nullif(btrim(contact_user_desc), '') is not null
  union all
  select 'planner', 'id_nulo_nombre_asignable', count(*)
  from active_opportunities o
  where o.contact_user_id is null
    and exists (
      select 1 from public.profiles p
      where lower(btrim(p.name)) = lower(btrim(o.contact_user_desc))
    )
  union all
  select 'planner', 'id_nulo_nombre_sin_coincidencia', count(*)
  from active_opportunities o
  where o.contact_user_id is null
    and nullif(btrim(o.contact_user_desc), '') is not null
    and not exists (
      select 1 from public.profiles p
      where lower(btrim(p.name)) = lower(btrim(o.contact_user_desc))
    )
  union all
  select 'planner', 'id_y_nombre_inconsistentes', count(*)
  from active_opportunities o
  join public.profiles p on p.id = o.contact_user_id
  where nullif(btrim(o.contact_user_desc), '') is not null
    and lower(btrim(o.contact_user_desc)) <> lower(btrim(p.name))

  union all
  select 'origen', 'id_informado', count(*) from active_opportunities where source_id is not null
  union all
  select 'origen', 'id_nulo_con_codigo', count(*) from active_opportunities where source_id is null and nullif(btrim(source_desc), '') is not null
  union all
  select 'origen', 'id_nulo_codigo_asignable', count(*)
  from active_opportunities o
  where o.source_id is null
    and exists (
      select 1 from public.sources s
      where lower(btrim(s.code)) = lower(btrim(o.source_desc))
    )
  union all
  select 'origen', 'id_nulo_codigo_sin_coincidencia', count(*)
  from active_opportunities o
  where o.source_id is null
    and nullif(btrim(o.source_desc), '') is not null
    and not exists (
      select 1 from public.sources s
      where lower(btrim(s.code)) = lower(btrim(o.source_desc))
    )
  union all
  select 'origen', 'id_y_codigo_inconsistentes', count(*)
  from active_opportunities o
  join public.sources s on s.id = o.source_id
  where nullif(btrim(o.source_desc), '') is not null
    and lower(btrim(o.source_desc)) <> lower(btrim(s.code))

  union all
  select 'perfiles', 'total', count(*) from public.profiles
  union all
  select 'perfiles', 'habilitados', count(*) from public.profiles where enabled is true
  union all
  select 'perfiles', 'habilitados_sin_auth', count(*) from public.profiles where enabled is true and auth_id is null
  union all
  select 'perfiles', 'auth_id_duplicado', coalesce(sum(repeticiones), 0)::bigint
  from (
    select count(*) as repeticiones
    from public.profiles
    where auth_id is not null
    group by auth_id
    having count(*) > 1
  ) duplicates

  union all
  select 'relaciones', 'contactos_sin_lead', count(*) from public.opportunity_activities where opportunity_id is null
  union all
  select 'relaciones', 'visitas_sin_lead', count(*) from public.opportunity_buyers where opportunity_id is null
  union all
  select 'relaciones', 'documentos_sin_lead', count(*) from public.opportunity_documentation_files where opportunity_id is null
), unmatched(relation, raw_value, occurrences) as (
  -- Valores que no tienen equivalencia exacta en los catálogos actuales.
  select 'comercial', btrim(o.comercial_user_desc), count(*)
  from public.opportunities o
  where o.deleted_at is null
    and o.comercial_user_id is null
    and nullif(btrim(o.comercial_user_desc), '') is not null
    and not exists (
      select 1 from public.profiles p
      where lower(btrim(p.name)) = lower(btrim(o.comercial_user_desc))
    )
  group by btrim(o.comercial_user_desc)

  union all

  select 'planner', btrim(o.contact_user_desc), count(*)
  from public.opportunities o
  where o.deleted_at is null
    and o.contact_user_id is null
    and nullif(btrim(o.contact_user_desc), '') is not null
    and not exists (
      select 1 from public.profiles p
      where lower(btrim(p.name)) = lower(btrim(o.contact_user_desc))
    )
  group by btrim(o.contact_user_desc)

  union all

  select 'origen', btrim(o.source_desc), count(*)
  from public.opportunities o
  where o.deleted_at is null
    and o.source_id is null
    and nullif(btrim(o.source_desc), '') is not null
    and not exists (
      select 1 from public.sources s
      where lower(btrim(s.code)) = lower(btrim(o.source_desc))
    )
  group by btrim(o.source_desc)
)
select section, metric, value
from metrics
union all
select 'sin_catalogo_' || relation, raw_value, occurrences
from unmatched
order by section, metric;
