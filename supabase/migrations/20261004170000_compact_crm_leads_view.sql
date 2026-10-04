begin;

drop view public.crm_leads_view;

create view public.crm_leads_view with (security_invoker = true) as
select
  o.id,
  o.is_favorite,
  o.created_at,
  o.fecha,
  o.propietario,
  o.telefono,
  o.domicilio,
  o.postal_id as cp,
  po.provincia,
  po.distrito,
  o.domain_id,
  d.description as domain_name,
  o.source_id,
  s.code as source_name,
  o.fase_id,
  p.name as fase_name,
  o.estado,
  o.comercial_user_id,
  u.name as responsable,
  o.tasacion,
  o.en_venta,
  o.memo,
  o.deleted_at
from public.opportunities o
left join public.domain d on d.id = o.domain_id
left join public.phases p on p.id = o.fase_id
left join public.sources s on s.id = o.source_id
left join public.profiles u on u.id = o.comercial_user_id
left join public.postal po on po.id = o.postal_id
where o.deleted_at is null;

revoke all on table public.crm_leads_view from public, anon, authenticated;
grant select on table public.crm_leads_view to authenticated;
grant delete, insert, select, update on table public.crm_leads_view to appsheet_user;
grant all on table public.crm_leads_view to postgres, service_role;

notify pgrst, 'reload schema';

commit;
