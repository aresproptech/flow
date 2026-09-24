-- Valoraciones se leen y editan exclusivamente como actividades tipadas.
create or replace function public.crm_save_valuation_with_activity(
  p_contact_id     bigint,
  p_opportunity_id bigint,
  p_data           jsonb,
  p_change_details text
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $function$
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
    raise exception 'Los datos de la valoración no son válidos' using errcode = '22023';
  end if;

  event_date := nullif(p_data ->> 'fecha', '')::date;
  event_time := nullif(p_data ->> 'hora', '')::time;

  if event_date is null then
    raise exception 'La fecha de la valoración es obligatoria' using errcode = '23502';
  end if;

  effective_value := (
    event_date + coalesce(event_time, time '00:00')
  ) at time zone 'Europe/Madrid';
  event_metadata := jsonb_build_object(
    'actor_name', actor_name,
    'medio', nullif(p_data ->> 'medio', ''),
    'hora', nullif(p_data ->> 'hora', ''),
    'notes', nullif(p_data ->> 'notes', '')
  );
  summary_text := '[VALORACION] ' || actor_name || ': Medio: ' ||
    coalesce(nullif(p_data ->> 'medio', ''), '—') ||
    case
      when event_time is not null then ' | Hora: ' || to_char(event_time, 'HH24:MI')
      else ''
    end;

  if nullif(p_data ->> 'notes', '') is not null then
    summary_text := summary_text || E'\n' || btrim(p_data ->> 'notes');
  end if;

  if p_contact_id is null then
    target_opportunity_id := p_opportunity_id;

    perform 1
    from public.opportunities
    where id = target_opportunity_id
      and deleted_at is null
    for update;

    if not found then
      raise exception 'El lead no existe o está eliminado' using errcode = 'P0002';
    end if;

    if not public.crm_can_write_opportunity(target_opportunity_id) then
      raise exception 'No tienes permiso para crear esta valoración' using errcode = '42501';
    end if;

    insert into public.opportunity_activities (
      opportunity_id,
      fecha,
      memo,
      resultado,
      event_type,
      actor_profile_id,
      effective_at,
      metadata
    )
    values (
      target_opportunity_id,
      event_date,
      summary_text,
      true,
      'valuation',
      actor_id,
      effective_value,
      event_metadata
    )
    returning id into saved_contact_id;
  else
    select
      opportunity_id,
      jsonb_build_object(
        'fecha', fecha,
        'effective_at', effective_at,
        'metadata', metadata,
        'memo', memo
      )
    into target_opportunity_id, previous_data
    from public.opportunity_activities
    where id = p_contact_id
      and event_type = 'valuation'
    for update;

    if not found then
      raise exception 'La valoración no existe' using errcode = 'P0002';
    end if;

    if not public.crm_can_write_opportunity(target_opportunity_id) then
      raise exception 'No tienes permiso para editar esta valoración' using errcode = '42501';
    end if;

    update public.opportunity_activities
    set
      fecha = event_date,
      memo = summary_text,
      resultado = true,
      event_type = 'valuation',
      actor_profile_id = actor_id,
      effective_at = effective_value,
      metadata = event_metadata
    where id = p_contact_id
    returning id into saved_contact_id;

    insert into public.opportunity_activities (
      opportunity_id,
      fecha,
      memo,
      resultado,
      event_type,
      actor_profile_id,
      effective_at,
      metadata,
      parent_event_id
    )
    values (
      target_opportunity_id,
      current_date,
      '[HISTORIAL] ' || actor_name || ': Editó una valoración' ||
        coalesce(nullif(p_change_details, ''), ' sin cambios visibles'),
      true,
      'valuation_updated',
      actor_id,
      now(),
      jsonb_build_object(
        'actor_name', actor_name,
        'change_details', p_change_details,
        'before', previous_data,
        'after', jsonb_build_object(
          'fecha', event_date,
          'effective_at', effective_value,
          'metadata', event_metadata,
          'memo', summary_text
        )
      ),
      saved_contact_id
    );
  end if;

  return saved_contact_id;
end
$function$;

grant execute on function public.crm_save_valuation_with_activity(bigint, bigint, jsonb, text)
to authenticated;

revoke all on function public.crm_save_valuation_with_activity(bigint, bigint, jsonb, text)
from public, anon;
