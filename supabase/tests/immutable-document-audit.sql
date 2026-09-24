-- Prueba la auditoría documental y el bloqueo de borrado. No conserva escrituras.
begin;

do $$
declare
  writer_profile record;
  profile_row record;
  target_opportunity_id bigint;
  test_file_id uuid;
  test_object_name text;
  returned_path text;
  expected_access boolean;
  access_succeeded boolean;
  affected bigint;
  hard_delete_blocked boolean := false;
begin
  select p.id, p.auth_id
  into writer_profile
  from public.profiles p
  where coalesce(p.enabled, true)
    and p.auth_id is not null
    and lower(btrim(p.rol)) in ('admin', 'coordinador')
  order by p.id
  limit 1;

  if not found then
    raise exception 'No existe un administrador o coordinador habilitado para probar documentación';
  end if;

  select o.id
  into target_opportunity_id
  from public.opportunities o
  where o.deleted_at is null
  order by o.id
  limit 1;

  if target_opportunity_id is null then
    raise exception 'No existe un lead activo para probar documentación';
  end if;

  test_object_name := target_opportunity_id::text
    || '/test-immutable-audit/'
    || gen_random_uuid()::text
    || '-audit-test.png';

  insert into storage.objects (bucket_id, name, metadata)
  values (
    'lead-documentation',
    test_object_name,
    jsonb_build_object('mimetype', 'image/png', 'size', 1)
  );

  perform set_config('request.jwt.claim.sub', writer_profile.auth_id::text, true);
  set local role authenticated;

  select (public.crm_register_document_upload(
    target_opportunity_id,
    jsonb_build_object(
      'requirement_key', 'test-immutable-audit',
      'file_name', 'audit-test.png',
      'storage_path', test_object_name,
      'mime_type', 'image/png',
      'file_size', 1
    )
  ) ->> 'id')::uuid
  into test_file_id;

  if test_file_id is null or not exists (
    select 1
    from public.opportunity_documentation_files f
    where f.id = test_file_id
      and f.opportunity_id = target_opportunity_id
      and f.storage_path = test_object_name
  ) then
    raise exception 'La carga no registró correctamente los metadatos';
  end if;

  if not exists (
    select 1
    from public.opportunity_activities c
    where c.opportunity_id = target_opportunity_id
      and c.event_type = 'document_uploaded'
      and c.actor_profile_id = writer_profile.id
      and c.metadata ->> 'document_id' = test_file_id::text
  ) then
    raise exception 'La carga no creó su evento de auditoría';
  end if;

  select public.crm_record_document_view(test_file_id)
  into returned_path;

  if returned_path is distinct from test_object_name or not exists (
    select 1
    from public.opportunity_activities c
    where c.opportunity_id = target_opportunity_id
      and c.event_type = 'document_viewed'
      and c.actor_profile_id = writer_profile.id
      and c.metadata ->> 'document_id' = test_file_id::text
  ) then
    raise exception 'La apertura no quedó auditada correctamente';
  end if;

  begin
    delete from public.opportunity_documentation_files where id = test_file_id;
    get diagnostics affected = row_count;
    hard_delete_blocked := affected = 0;
  exception
    when insufficient_privilege then
      hard_delete_blocked := true;
  end;

  if not hard_delete_blocked then
    raise exception 'Un usuario autenticado pudo borrar físicamente los metadatos';
  end if;

  begin
    update public.opportunity_documentation_files
    set file_name = 'alterado.png'
    where id = test_file_id;
    get diagnostics affected = row_count;
  exception
    when insufficient_privilege then
      affected := 0;
  end;

  if affected <> 0 then
    raise exception 'Un usuario autenticado pudo alterar metadatos documentales inmutables';
  end if;

  hard_delete_blocked := false;
  begin
    delete from public.opportunities where id = target_opportunity_id;
    get diagnostics affected = row_count;
    hard_delete_blocked := affected = 0;
  exception
    when insufficient_privilege then
      hard_delete_blocked := true;
  end;

  if not hard_delete_blocked then
    raise exception 'Un usuario autenticado pudo borrar físicamente un lead';
  end if;

  hard_delete_blocked := false;
  begin
    delete from storage.objects
    where bucket_id = 'lead-documentation'
      and name = test_object_name;
    get diagnostics affected = row_count;
    hard_delete_blocked := affected = 0;
  exception
    when insufficient_privilege then
      hard_delete_blocked := true;
  end;

  if not hard_delete_blocked then
    raise exception 'Un usuario autenticado pudo borrar físicamente un objeto documental';
  end if;

  reset role;

  if not exists (
    select 1
    from public.opportunity_documentation_files
    where id = test_file_id
      and file_name = 'audit-test.png'
  ) or not exists (
    select 1
    from storage.objects
    where bucket_id = 'lead-documentation'
      and name = test_object_name
  ) then
    raise exception 'El intento de borrado alteró la documentación conservada';
  end if;

  for profile_row in
    select p.id, p.auth_id
    from public.profiles p
    where coalesce(p.enabled, true)
      and p.auth_id is not null
    order by p.id
  loop
    perform set_config('request.jwt.claim.sub', profile_row.auth_id::text, true);
    set local role authenticated;
    expected_access := public.crm_can_read_opportunity(target_opportunity_id);
    access_succeeded := false;

    begin
      perform public.crm_record_document_view(test_file_id);
      access_succeeded := true;
    exception
      when insufficient_privilege then
        access_succeeded := false;
    end;

    if access_succeeded is distinct from expected_access then
      raise exception 'Permiso documental incorrecto para el perfil %', profile_row.id;
    end if;

    reset role;
  end loop;
end
$$;

select 'PASS: carga y apertura auditadas; documentos y leads sin borrado físico; todo revertido' as result;

rollback;
