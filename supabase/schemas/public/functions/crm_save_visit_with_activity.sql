CREATE OR REPLACE FUNCTION public.crm_save_visit_with_activity (
  p_visit_id       bigint,
  p_opportunity_id bigint,
  p_data           jsonb,
  p_change_details text
)
  RETURNS bigint
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  target_opportunity_id bigint;
  saved_visit_id bigint;
  activity_text text;
  activity_type text;
begin
  if auth.uid() is null or public.crm_current_role() is null then
    raise exception 'Sesión no válida' using errcode = '42501';
  end if;

  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    raise exception 'Los datos de la visita no son válidos' using errcode = '22023';
  end if;

  if p_visit_id is null then
    target_opportunity_id := p_opportunity_id;
    if target_opportunity_id is null then
      raise exception 'La oportunidad es obligatoria' using errcode = '23502';
    end if;

    perform 1
    from public.opportunities
    where id = target_opportunity_id
      and deleted_at is null
    for update;

    if not found then
      raise exception 'El lead no existe o está eliminado' using errcode = 'P0002';
    end if;

    if not public.crm_can_create_visit_for_opportunity(target_opportunity_id) then
      raise exception 'Solo se pueden crear visitas para inmuebles activos en Encargo'
        using errcode = '42501';
    end if;

    insert into public.opportunity_buyers (
      opportunity_id,
      estado,
      dominio,
      planner,
      owner,
      fecha_visita,
      hora,
      buyer,
      nombre_apellido,
      telefono,
      dni,
      vende,
      observaciones_visita,
      created_by
    )
    values (
      target_opportunity_id,
      nullif(p_data ->> 'estado', ''),
      nullif(p_data ->> 'dominio', ''),
      nullif(p_data ->> 'planner', ''),
      nullif(p_data ->> 'owner', ''),
      nullif(p_data ->> 'fecha_visita', '')::date,
      nullif(p_data ->> 'hora', '')::time,
      nullif(p_data ->> 'buyer', ''),
      nullif(p_data ->> 'nombre_apellido', ''),
      nullif(p_data ->> 'telefono', ''),
      nullif(p_data ->> 'dni', ''),
      case
        when p_data ->> 'vende' in ('true', 'false') then (p_data ->> 'vende')::boolean
        else null
      end,
      nullif(p_data ->> 'observaciones_visita', ''),
      coalesce(nullif(public.crm_current_name(), ''), 'Usuario')
    )
    returning id into saved_visit_id;

    activity_text := 'Agregó una visita';
    activity_type := 'visit_created';
  else
    select opportunity_id
    into target_opportunity_id
    from public.opportunity_buyers
    where id = p_visit_id
    for update;

    if not found then
      raise exception 'La visita no existe' using errcode = 'P0002';
    end if;

    if not (
      public.crm_can_manage_visits()
      or public.crm_can_write_opportunity(target_opportunity_id)
    ) then
      raise exception 'No tienes permiso para editar esta visita' using errcode = '42501';
    end if;

    update public.opportunity_buyers
    set
      fecha_visita = nullif(p_data ->> 'fecha_visita', '')::date,
      hora = nullif(p_data ->> 'hora', '')::time,
      buyer = nullif(p_data ->> 'buyer', ''),
      nombre_apellido = nullif(p_data ->> 'nombre_apellido', ''),
      telefono = nullif(p_data ->> 'telefono', ''),
      dni = nullif(p_data ->> 'dni', ''),
      vende = case
        when p_data ->> 'vende' in ('true', 'false') then (p_data ->> 'vende')::boolean
        else null
      end,
      observaciones_visita = nullif(p_data ->> 'observaciones_visita', ''),
      updated_at = now()
    where id = p_visit_id
    returning id into saved_visit_id;

    activity_text := 'Editó una visita' ||
      coalesce(nullif(p_change_details, ''), ' sin cambios visibles');
    activity_type := 'visit_updated';
  end if;

  perform public.crm_record_system_activity(
    target_opportunity_id,
    activity_type,
    activity_text,
    jsonb_build_object(
      'visit_id', saved_visit_id,
      'change_details', p_change_details
    )
  );

  return saved_visit_id;
end
$function$;

GRANT EXECUTE ON FUNCTION "public"."crm_save_visit_with_activity"(bigint, bigint, jsonb, text) TO "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."crm_save_visit_with_activity"(bigint, bigint, jsonb, text) FROM PUBLIC;
