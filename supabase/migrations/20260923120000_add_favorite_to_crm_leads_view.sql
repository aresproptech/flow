create or replace view public.crm_leads_view
with (security_invoker = true)
as
select
  o.id,
  o.created_at,
  o.fecha,
  o.propietario,
  o.telefono,
  o.domicilio,
  o.tasacion,
  o.estado,
  o.memo,
  o.en_venta,
  o.medio,
  o.fase_id,
  coalesce(p.name, 'Sin fase'::character varying) as fase_name,
  o.source_id,
  coalesce(s.code, o.source_desc::character varying, 'Sin origen'::character varying) as source_name,
  o.comercial_user_id,
  coalesce(u.name, o.comercial_user_desc, 'Sin comercial'::text) as comercial_name,
  o.contact_user_id,
  coalesce(uc.name, o.contact_user_desc, 'Sin contacto'::text) as contact_name,
  o.postal_id,
  po.id as cp,
  po.provincia,
  po.distrito,
  o.team_id,
  o.dominio_desc,
  o.deleted_at,
  o.fecha_contacto,
  o.fecha_valoracion,
  o.hora,
  o.buyer_user_id,
  coalesce(ub.name, o.buyer_user_desc, 'Sin buyer'::text) as buyer_name,
  o.is_favorite
from public.opportunities o
left join public.phases p on p.id = o.fase_id
left join public.sources s on s.id = o.source_id
left join public.profiles u on u.id = o.comercial_user_id
left join public.profiles uc on uc.id = o.contact_user_id
left join public.profiles ub on ub.id = o.buyer_user_id
left join public.postal po on po.id = o.postal_id
where o.deleted_at is null;