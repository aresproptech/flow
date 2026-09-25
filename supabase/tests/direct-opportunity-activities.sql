-- Verifica la edición directa de una actividad funcional bajo RLS.
begin;

do $$
declare
  profile_row record;
  target_opportunity_id bigint;
  activity_id bigint;
begin
  select p.id, p.auth_id
  into profile_row
  from public.profiles p
  where p.auth_id is not null
    and lower(btrim(p.rol)) in ('admin', 'coordinador')
  limit 1;

  if not found then
    raise exception 'No existe un perfil con permiso de escritura para probar actividades';
  end if;

  perform set_config('request.jwt.claim.sub', profile_row.auth_id::text, true);
  set local role authenticated;

  select id into target_opportunity_id
  from public.opportunities
  where public.crm_can_write_opportunity(id)
    and deleted_at is null
  order by id
  limit 1;

  insert into public.opportunity_activities (
    opportunity_id, fecha, memo, resultado, event_type, effective_at, metadata
  ) values (
    target_opportunity_id, current_date, 'Nota de contacto', true, 'contact', now(), '{}'::jsonb
  ) returning id into activity_id;

  update public.opportunity_activities
  set memo = 'Nota de contacto actualizada'
  where id = activity_id
    and event_type = 'contact';

  if not exists (
    select 1 from public.opportunity_activities
    where id = activity_id and memo = 'Nota de contacto actualizada'
  ) then
    raise exception 'La actualización directa de actividad funcional falló';
  end if;

  reset role;
end
$$;

rollback;