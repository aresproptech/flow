create or replace function public.crm_soft_delete_leads(lead_ids bigint[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_id bigint;
  actor_name text := coalesce(nullif(public.crm_current_name(), ''), 'Usuario');
begin
  if auth.uid() is null or public.crm_current_role() is null then
    raise exception 'Sesión no válida' using errcode = '42501';
  end if;

  if lead_ids is null or cardinality(lead_ids) = 0 then
    return;
  end if;

  perform 1
  from public.opportunities
  where id = any(lead_ids)
    and deleted_at is null
  order by id
  for update;

  foreach target_id in array lead_ids loop
    if not public.crm_can_write_opportunity(target_id) then
      raise exception 'No tienes permiso para eliminar uno de los leads' using errcode = '42501';
    end if;
  end loop;

  update public.opportunities
  set deleted_at = now()
  where id = any(lead_ids);

  foreach target_id in array lead_ids loop
    insert into public.opportunity_activities (
      opportunity_id, fecha, memo, resultado, event_type, effective_at, metadata
    ) values (
      target_id,
      current_date,
      null,
      true,
      'lead_deleted',
      now(),
      jsonb_build_object('actor_name', actor_name, 'text', 'Eliminó el lead', 'lead_id', target_id)
    );
  end loop;
end
$$;