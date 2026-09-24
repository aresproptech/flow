CREATE OR REPLACE FUNCTION public.crm_record_system_activity (
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
begin
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
    '[HISTORIAL] ' || actor_name || ': ' || p_text,
    true,
    p_event_type,
    actor_id,
    now(),
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
      'actor_name', actor_name,
      'text', p_text
    )
  )
  returning id into saved_event_id;

  return saved_event_id;
end
$function$;

GRANT EXECUTE ON FUNCTION "public"."crm_record_system_activity"(bigint, text, text, jsonb) TO "postgres";

REVOKE ALL ON FUNCTION "public"."crm_record_system_activity"(bigint, text, text, jsonb) FROM PUBLIC;
