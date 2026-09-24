begin;

do $$
begin
  if to_regclass('public.opportunity_contacts') is not null then
    alter table public.opportunity_contacts
      drop constraint if exists opportunity_contacts_event_type_check,
      add constraint opportunity_contacts_event_type_check check (
        event_type = any (array[
          'legacy', 'activity', 'note', 'call', 'contact', 'valuation',
          'valuation_updated', 'rg', 'rg_updated', 'lead_created',
          'lead_imported', 'lead_updated', 'lead_deleted', 'phase_changed',
          'visit_created', 'visit_updated', 'order_created', 'order_updated'
        ]::text[])
      );
  end if;
end
$$;

create or replace function public.crm_save_contact_with_activity(
  p_contact_id bigint,
  p_opportunity_id bigint,
  p_data jsonb,
  p_change_details text
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_opportunity_id bigint;
  saved_contact_id bigint;
  actor_id bigint := public.crm_current_profile_id();
  actor_name text := coalesce(nullif(public.crm_current_name(), ''), 'Usuario');
  event_date date;
  event_time time;
  effective_value timestamptz;
  event_metadata jsonb;
  summary_text text;
  previous_data jsonb;
begin
  if auth.uid() is null or public.crm_current_role() is null then
    raise exception 'Sesión no válida' using errcode = '42501';
  end if;

  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    raise exception 'Los datos del contacto no son válidos' using errcode = '22023';
  end if;

  event_date := nullif(p_data ->> 'fecha', '')::date;
  event_time := nullif(p_data ->> 'hora', '')::time;
  if event_date is null then
    raise exception 'La fecha del contacto es obligatoria' using errcode = '23502';
  end if;

  effective_value := (event_date + coalesce(event_time, time '00:00')) at time zone 'Europe/Madrid';
  event_metadata := jsonb_build_object(
    'actor_name', actor_name,
    'medio', nullif(p_data ->> 'medio', ''),
    'resultado', nullif(p_data ->> 'resultado', ''),
    'hora', nullif(p_data ->> 'hora', ''),
    'notes', nullif(p_data ->> 'notes', '')
  );
  summary_text := '[CONTACTO] ' || actor_name || ': Medio: ' ||
    coalesce(nullif(p_data ->> 'medio', ''), '—') ||
    ' | Resultado: ' || coalesce(nullif(p_data ->> 'resultado', ''), '—') ||
    case when event_time is not null then ' | Hora: ' || to_char(event_time, 'HH24:MI') else '' end;
  if nullif(p_data ->> 'notes', '') is not null then
    summary_text := summary_text || E'\n' || btrim(p_data ->> 'notes');
  end if;

  if p_contact_id is null then
    target_opportunity_id := p_opportunity_id;
    perform 1 from public.opportunities where id = target_opportunity_id and deleted_at is null for update;
    if not found then raise exception 'La oportunidad no existe o está eliminada' using errcode = 'P0002'; end if;
    if not public.crm_can_write_opportunity(target_opportunity_id) then
      raise exception 'No tienes permiso para crear este contacto' using errcode = '42501';
    end if;

    insert into public.opportunity_contacts (
      opportunity_id, fecha, memo, resultado, event_type, actor_profile_id,
      effective_at, metadata
    ) values (
      target_opportunity_id, event_date, summary_text, true, 'contact', actor_id,
      effective_value, event_metadata
    ) returning id into saved_contact_id;
  else
    select opportunity_id, jsonb_build_object(
      'fecha', fecha, 'metadata', metadata, 'memo', memo
    ) into target_opportunity_id, previous_data
    from public.opportunity_contacts
    where id = p_contact_id and event_type = 'contact'
    for update;
    if not found then raise exception 'El contacto no existe' using errcode = 'P0002'; end if;
    if not public.crm_can_write_opportunity(target_opportunity_id) then
      raise exception 'No tienes permiso para editar este contacto' using errcode = '42501';
    end if;

    update public.opportunity_contacts set
      fecha = event_date, memo = summary_text, resultado = true,
      actor_profile_id = actor_id, effective_at = effective_value, metadata = event_metadata
    where id = p_contact_id
    returning id into saved_contact_id;

    insert into public.opportunity_contacts (
      opportunity_id, fecha, memo, resultado, event_type, actor_profile_id,
      effective_at, metadata, parent_event_id
    ) values (
      target_opportunity_id, current_date,
      '[HISTORIAL] ' || actor_name || ': Editó un contacto' ||
        coalesce(nullif(p_change_details, ''), ' sin cambios visibles'),
      true, 'activity', actor_id, now(), '{}'::jsonb, saved_contact_id
    );
  end if;

  return saved_contact_id;
end;
$$;

grant execute on function public.crm_save_contact_with_activity(bigint, bigint, jsonb, text)
to authenticated;

commit;
