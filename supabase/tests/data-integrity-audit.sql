-- Read-only audit for the current normalized CRM schema.
-- Reports active rows and missing relational keys without legacy text columns.

with active_opportunities as (
  select *
  from public.opportunities
  where deleted_at is null
), metrics(section, metric, value) as (
  select 'leads', 'activos', count(*) from active_opportunities
  union all
  select 'leads', 'eliminados_logicamente', count(*)
  from public.opportunities
  where deleted_at is not null

  union all
  select 'responsable', 'id_nulo', count(*)
  from active_opportunities
  where responsible_user_id is null
  union all
  select 'dominio', 'id_nulo', count(*)
  from active_opportunities
  where domain_id is null
  union all
  select 'origen', 'id_nulo', count(*)
  from active_opportunities
  where source_id is null
  union all
  select 'fase', 'id_nulo', count(*)
  from active_opportunities
  where fase_id is null

  union all
  select 'perfiles', 'total', count(*) from public.profiles
  union all
  select 'perfiles', 'habilitados', count(*)
  from public.profiles
  where enabled is true
  union all
  select 'perfiles', 'habilitados_sin_auth', count(*)
  from public.profiles
  where enabled is true and auth_id is null
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
  select 'relaciones', 'actividades_sin_lead', count(*)
  from public.opportunity_activities
  where opportunity_id is null
  union all
  select 'relaciones', 'visitas_sin_lead', count(*)
  from public.opportunity_buyers
  where opportunity_id is null
  union all
  select 'relaciones', 'documentos_sin_lead', count(*)
  from public.opportunity_documentation_files
  where opportunity_id is null
)
select section, metric, value
from metrics
order by section, metric;
