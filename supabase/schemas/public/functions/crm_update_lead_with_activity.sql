CREATE OR REPLACE FUNCTION public.crm_update_lead_with_activity (
  p_opportunity_id bigint,
  p_data           jsonb,
  p_change_details text
)
  RETURNS bigint
  LANGUAGE plpgsql
  SECURITY INVOKER
  SET search_path TO ''
  AS $function$
declare
  saved_opportunity public.opportunities%rowtype;
  before_data jsonb;
  after_data jsonb;
  before_snapshot jsonb;
  after_snapshot jsonb;
  actor_id bigint := public.crm_current_profile_id();
  actor_name text := coalesce(nullif(public.crm_current_name(), ''), 'Usuario');
  clean_change_details text := nullif(btrim(p_change_details), '');
  activity_text text;
begin
  if auth.uid() is null or public.crm_current_role() is null then
    raise exception 'Sesión no válida' using errcode = '42501';
  end if;

  if p_opportunity_id is null then
    raise exception 'El lead es obligatorio' using errcode = '23502';
  end if;

  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    raise exception 'Los datos del lead no son válidos' using errcode = '22023';
  end if;

  select to_jsonb(o)
  into before_data
  from public.opportunities o
  where o.id = p_opportunity_id
    and o.deleted_at is null
  for update of o;

  if not found then
    raise exception 'El lead no existe, está eliminado o no tenés permiso para editarlo' using errcode = 'P0002';
  end if;

  update public.opportunities
  set
    propietario = nullif(btrim(p_data ->> 'propietario'), ''),
    domicilio = nullif(btrim(p_data ->> 'domicilio'), ''),
    telefono = nullif(btrim(p_data ->> 'telefono'), ''),
    tasacion = nullif(btrim(p_data ->> 'tasacion'), ''),
    estado = nullif(btrim(p_data ->> 'estado'), ''),
    fecha = nullif(btrim(p_data ->> 'fecha'), ''),
    fecha_contacto = nullif(p_data ->> 'fecha_contacto', '')::date,
    fecha_valoracion = nullif(p_data ->> 'fecha_valoracion', '')::date,
    hora = nullif(p_data ->> 'hora', '')::time,
    source_desc = nullif(btrim(p_data ->> 'source_desc'), ''),
    comercial_user_desc = nullif(btrim(p_data ->> 'comercial_user_desc'), ''),
    contact_user_desc = nullif(btrim(p_data ->> 'contact_user_desc'), ''),
    buyer_user_desc = nullif(btrim(p_data ->> 'buyer_user_desc'), ''),
    dominio_desc = nullif(btrim(p_data ->> 'dominio_desc'), ''),
    postal_id = nullif(p_data ->> 'postal_id', '')::bigint,
    fase_id = nullif(p_data ->> 'fase_id', '')::bigint,
    memo = nullif(btrim(p_data ->> 'memo'), ''),
    en_venta = nullif(btrim(p_data ->> 'en_venta'), ''),
    medio = nullif(btrim(p_data ->> 'medio'), ''),
    source_id = nullif(p_data ->> 'source_id', '')::bigint,
    comercial_user_id = nullif(p_data ->> 'comercial_user_id', '')::bigint,
    contact_user_id = nullif(p_data ->> 'contact_user_id', '')::bigint,
    buyer_user_id = nullif(p_data ->> 'buyer_user_id', '')::bigint
  where id = p_opportunity_id
  returning * into saved_opportunity;

  if not found then
    raise exception 'No se pudo actualizar el lead' using errcode = 'P0002';
  end if;

  after_data := to_jsonb(saved_opportunity);
  before_snapshot := before_data - array['id', 'created_at', 'deleted_at', 'is_favorite', 'contacto', 'team_id'];
  after_snapshot := after_data - array['id', 'created_at', 'deleted_at', 'is_favorite', 'contacto', 'team_id'];

  if before_snapshot is distinct from after_snapshot then
    activity_text := 'Actualizó el lead' || case
      when clean_change_details is not null then ': ' || clean_change_details
      else ''
    end;

    insert into public.opportunity_activities (
      opportunity_id, fecha, memo, resultado, event_type,
      actor_profile_id, effective_at, metadata
    )
    values (
      p_opportunity_id,
      current_date,
      '[HISTORIAL] ' || actor_name || ': ' || activity_text,
      true,
      'lead_updated',
      actor_id,
      now(),
      jsonb_build_object(
        'actor_name', actor_name,
        'text', activity_text,
        'change_details', clean_change_details,
        'before', before_snapshot,
        'after', after_snapshot
      )
    );
  end if;

  return saved_opportunity.id;
end
$function$;

GRANT EXECUTE ON FUNCTION "public"."crm_update_lead_with_activity"(bigint, jsonb, text) TO "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."crm_update_lead_with_activity"(bigint, jsonb, text) FROM PUBLIC;
