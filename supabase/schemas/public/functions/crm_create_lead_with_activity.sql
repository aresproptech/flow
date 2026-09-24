CREATE OR REPLACE FUNCTION public.crm_create_lead_with_activity (
  p_data       jsonb,
  p_event_type text
)
  RETURNS bigint
  LANGUAGE plpgsql
  SECURITY INVOKER
  SET search_path TO ''
  AS $function$
declare
  saved_opportunity_id bigint;
  actor_id bigint := public.crm_current_profile_id();
  actor_name text := coalesce(nullif(public.crm_current_name(), ''), 'Usuario');
  activity_text text;
begin
  if auth.uid() is null or public.crm_current_role() is null then
    raise exception 'Sesión no válida' using errcode = '42501';
  end if;

  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    raise exception 'Los datos del lead no son válidos' using errcode = '22023';
  end if;

  if p_event_type is null or p_event_type not in ('lead_created', 'lead_imported') then
    raise exception 'Tipo de alta de lead no permitido' using errcode = '22023';
  end if;

  insert into public.opportunities (
    propietario, domicilio, telefono, tasacion, estado, fecha,
    fecha_contacto, fecha_valoracion, hora, source_desc,
    comercial_user_desc, contact_user_desc, buyer_user_desc, dominio_desc, postal_id,
    fase_id, memo, en_venta, medio, source_id, comercial_user_id,
    contact_user_id, buyer_user_id, team_id, deleted_at
  )
  values (
    nullif(btrim(p_data ->> 'propietario'), ''),
    nullif(btrim(p_data ->> 'domicilio'), ''),
    nullif(btrim(p_data ->> 'telefono'), ''),
    nullif(btrim(p_data ->> 'tasacion'), ''),
    nullif(btrim(p_data ->> 'estado'), ''),
    nullif(btrim(p_data ->> 'fecha'), ''),
    nullif(p_data ->> 'fecha_contacto', '')::date,
    nullif(p_data ->> 'fecha_valoracion', '')::date,
    nullif(p_data ->> 'hora', '')::time,
    nullif(btrim(p_data ->> 'source_desc'), ''),
    nullif(btrim(p_data ->> 'comercial_user_desc'), ''),
    nullif(btrim(p_data ->> 'contact_user_desc'), ''),
    nullif(btrim(p_data ->> 'buyer_user_desc'), ''),
    nullif(btrim(p_data ->> 'dominio_desc'), ''),
    nullif(p_data ->> 'postal_id', '')::bigint,
    nullif(p_data ->> 'fase_id', '')::bigint,
    nullif(btrim(p_data ->> 'memo'), ''),
    nullif(btrim(p_data ->> 'en_venta'), ''),
    nullif(btrim(p_data ->> 'medio'), ''),
    nullif(p_data ->> 'source_id', '')::bigint,
    nullif(p_data ->> 'comercial_user_id', '')::bigint,
    nullif(p_data ->> 'contact_user_id', '')::bigint,
    nullif(p_data ->> 'buyer_user_id', '')::bigint,
    nullif(p_data ->> 'team_id', '')::bigint,
    null
  )
  returning id into saved_opportunity_id;

  activity_text := case p_event_type
    when 'lead_imported' then 'Importó el lead por CSV'
    else 'Creó el lead'
  end;

  insert into public.opportunity_activities (
    opportunity_id, fecha, memo, resultado, event_type,
    actor_profile_id, effective_at, metadata
  )
  values (
    saved_opportunity_id,
    current_date,
    '[HISTORIAL] ' || actor_name || ': ' || activity_text,
    true,
    p_event_type,
    actor_id,
    now(),
    jsonb_build_object(
      'actor_name', actor_name,
      'text', activity_text,
      'lead_id', saved_opportunity_id
    )
  );

  return saved_opportunity_id;
end
$function$;

GRANT EXECUTE ON FUNCTION "public"."crm_create_lead_with_activity"(jsonb, text) TO "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."crm_create_lead_with_activity"(jsonb, text) FROM PUBLIC;
