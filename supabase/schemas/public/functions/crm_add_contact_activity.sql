CREATE OR REPLACE FUNCTION public.crm_add_contact_activity (
  p_opportunity_id bigint,
  p_event_type     text,
  p_text           text,
  p_metadata       jsonb
)
  RETURNS bigint
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  saved_event_id bigint;
  actor_id bigint := public.crm_current_profile_id();
  actor_name text := coalesce(nullif(public.crm_current_name(), ''), 'Usuario');
  clean_text text := nullif(btrim(p_text), '');
  event_metadata jsonb := coalesce(p_metadata, '{}'::jsonb);
begin
  if auth.uid() is null or public.crm_current_role() is null then
    raise exception 'Sesión no válida' using errcode = '42501';
  end if;

  if p_event_type is null or p_event_type not in (
    'activity',
    'note',
    'call',
    'lead_created',
    'lead_imported',
    'lead_updated'
  ) then
    raise exception 'Tipo de actividad no permitido' using errcode = '22023';
  end if;

  if clean_text is null then
    raise exception 'El texto de la actividad es obligatorio' using errcode = '22023';
  end if;

  if jsonb_typeof(event_metadata) <> 'object' then
    raise exception 'Los metadatos no son válidos' using errcode = '22023';
  end if;

  perform 1
  from public.opportunities
  where id = p_opportunity_id
    and deleted_at is null
  for update;

  if not found then
    raise exception 'El lead no existe o está eliminado' using errcode = 'P0002';
  end if;

  if not public.crm_can_write_opportunity(p_opportunity_id) then
    raise exception 'No tienes permiso para registrar esta actividad' using errcode = '42501';
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
    p_opportunity_id,
    current_date,
    case
      when p_event_type = 'note' then '[NOTA] '
      else '[HISTORIAL] '
    end || actor_name || ': ' || clean_text,
    true,
    p_event_type,
    actor_id,
    now(),
    event_metadata || jsonb_build_object(
      'actor_name', actor_name,
      'text', clean_text
    )
  )
  returning id into saved_event_id;

  return saved_event_id;
end
$function$;

GRANT EXECUTE ON FUNCTION "public"."crm_add_contact_activity"(bigint, text, text, jsonb) TO "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."crm_add_contact_activity"(bigint, text, text, jsonb) FROM PUBLIC;
