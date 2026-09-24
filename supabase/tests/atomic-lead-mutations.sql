-- Prueba las altas, importaciones y ediciones atómicas de leads. No conserva escrituras.
begin;

do $$
declare
  profile_row record;
  phase_id bigint;
  source_id bigint;
  created_id bigint;
  imported_ids bigint[];
  contact_count bigint;
  before_owner text;
  failed_import_owner text := 'Importación revertida ' || clock_timestamp()::text;
  import_rolled_back boolean := false;
begin
  select p.id, p.auth_id, p.name
  into profile_row
  from public.profiles p
  where coalesce(p.enabled, true)
    and p.auth_id is not null
    and lower(btrim(p.rol)) in ('admin', 'coordinador')
  order by p.id
  limit 1;

  if not found then
    raise exception 'No existe un perfil administrador o coordinador para probar leads';
  end if;

  select id into phase_id
  from public.phases
  where coalesce(enabled, true)
  order by id
  limit 1;

  select id into source_id
  from public.sources
  where coalesce(enabled, true)
  order by id
  limit 1;

  perform set_config('request.jwt.claim.sub', profile_row.auth_id::text, true);
  set local role authenticated;

  select public.crm_create_lead_with_activity(
    jsonb_build_object(
      'propietario', 'Lead atómico de prueba',
      'telefono', '600000001',
      'estado', 'activa',
      'fase_id', phase_id,
      'source_id', source_id,
      'source_desc', 'Prueba',
      'comercial_user_id', profile_row.id,
      'comercial_user_desc', profile_row.name
    ),
    'lead_created'
  ) into created_id;

  if not exists (
    select 1
    from public.opportunities
    where id = created_id
      and propietario = 'Lead atómico de prueba'
  ) or not exists (
    select 1
    from public.opportunity_activities
    where opportunity_id = created_id
      and event_type = 'lead_created'
      and actor_profile_id = profile_row.id
  ) then
    raise exception 'La creación no guardó el lead y su historial';
  end if;

  select propietario into before_owner
  from public.opportunities
  where id = created_id;

  select count(*) into contact_count
  from public.opportunity_activities
  where opportunity_id = created_id;

  perform public.crm_update_lead_with_activity(
    created_id,
    jsonb_build_object(
      'propietario', 'Lead atómico editado',
      'telefono', '600000001',
      'estado', 'activa',
      'fase_id', phase_id,
      'source_id', source_id,
      'source_desc', 'Prueba',
      'comercial_user_id', profile_row.id,
      'comercial_user_desc', profile_row.name
    ),
    'Cambió Propietario de ' || before_owner || ' a Lead atómico editado'
  );

  if not exists (
    select 1
    from public.opportunities
    where id = created_id
      and propietario = 'Lead atómico editado'
  ) or not exists (
    select 1
    from public.opportunity_activities
    where opportunity_id = created_id
      and event_type = 'lead_updated'
      and metadata -> 'before' ->> 'propietario' = before_owner
      and metadata -> 'after' ->> 'propietario' = 'Lead atómico editado'
  ) then
    raise exception 'La edición no guardó el cambio y su auditoría';
  end if;

  if (
    select count(*)
    from public.opportunity_activities
    where opportunity_id = created_id
  ) <> contact_count + 1 then
    raise exception 'La edición no creó exactamente un evento de historial';
  end if;

  select public.crm_import_leads_with_activity(
    jsonb_build_array(
      jsonb_build_object(
        'propietario', 'Importación atómica 1',
        'fase_id', phase_id,
        'comercial_user_id', profile_row.id,
        'comercial_user_desc', profile_row.name
      ),
      jsonb_build_object(
        'propietario', 'Importación atómica 2',
        'fase_id', phase_id,
        'comercial_user_id', profile_row.id,
        'comercial_user_desc', profile_row.name
      )
    )
  ) into imported_ids;

  if cardinality(imported_ids) <> 2 or (
    select count(*)
    from public.opportunities
    where id = any(imported_ids)
  ) <> 2 or (
    select count(*)
    from public.opportunity_activities
    where opportunity_id = any(imported_ids)
      and event_type = 'lead_imported'
  ) <> 2 then
    raise exception 'La importación no guardó cada lead con su historial';
  end if;

  begin
    perform public.crm_import_leads_with_activity(
      jsonb_build_array(
        jsonb_build_object(
          'propietario', failed_import_owner,
          'fase_id', phase_id,
          'comercial_user_id', profile_row.id,
          'comercial_user_desc', profile_row.name
        ),
        jsonb_build_object(
          'propietario', 'Fila inválida para forzar rollback',
          'fase_id', -999999999,
          'comercial_user_id', profile_row.id,
          'comercial_user_desc', profile_row.name
        )
      )
    );
  exception
    when foreign_key_violation then
      import_rolled_back := true;
  end;

  if not import_rolled_back or exists (
    select 1
    from public.opportunities
    where propietario = failed_import_owner
  ) then
    raise exception 'Una fila inválida no revirtió la importación completa';
  end if;

  reset role;
end
$$;

do $$
declare
  profile_row record;
  phase_id bigint;
  created_id bigint;
  should_create boolean;
  permission_blocked boolean;
  checked_profiles integer := 0;
begin
  select id into phase_id
  from public.phases
  where coalesce(enabled, true)
  order by id
  limit 1;

  for profile_row in
    select id, auth_id, name, lower(btrim(rol)) as role_name
    from public.profiles
    where coalesce(enabled, true)
      and auth_id is not null
    order by id
  loop
    perform set_config('request.jwt.claim.sub', profile_row.auth_id::text, true);
    set local role authenticated;

    should_create := profile_row.role_name in ('admin', 'coordinador') or (
      profile_row.role_name = 'comercial' and not public.crm_can_manage_visits()
    );
    permission_blocked := false;
    created_id := null;

    begin
      select public.crm_create_lead_with_activity(
        jsonb_build_object(
          'propietario', 'Prueba de rol ' || profile_row.id,
          'fase_id', phase_id,
          'comercial_user_id', profile_row.id,
          'comercial_user_desc', profile_row.name
        ),
        'lead_created'
      ) into created_id;
    exception
      when insufficient_privilege then
        permission_blocked := true;
    end;

    if should_create and (permission_blocked or created_id is null) then
      raise exception 'El perfil % debería poder crear leads', profile_row.id;
    end if;

    if not should_create and not permission_blocked then
      raise exception 'El perfil % creó un lead sin permiso', profile_row.id;
    end if;

    if created_id is not null and not exists (
      select 1
      from public.opportunity_activities
      where opportunity_id = created_id
        and event_type = 'lead_created'
        and actor_profile_id = profile_row.id
    ) then
      raise exception 'El perfil % creó un lead sin autor correcto en historial', profile_row.id;
    end if;

    checked_profiles := checked_profiles + 1;
    reset role;
  end loop;

  if checked_profiles = 0 then
    raise exception 'No se encontraron perfiles vinculados a Auth para probar permisos';
  end if;
end
$$;

select 'PASS: crear, importar y editar leads guarda el historial en la misma transacción; todo revertido' as result;

rollback;
