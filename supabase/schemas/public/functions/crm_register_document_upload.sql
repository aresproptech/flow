CREATE OR REPLACE FUNCTION public.crm_register_document_upload (
  p_opportunity_id bigint,
  p_data           jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  saved_file public.opportunity_documentation_files%rowtype;
  actor_id bigint := public.crm_current_profile_id();
  actor_name text := coalesce(nullif(public.crm_current_name(), ''), 'Usuario');
  requirement_key text;
  file_name text;
  storage_path text;
  mime_type text;
  file_size bigint;
  activity_text text;
begin
  if auth.uid() is null or public.crm_current_role() is null then
    raise exception 'Sesión no válida' using errcode = '42501';
  end if;

  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    raise exception 'Los datos del documento no son válidos' using errcode = '22023';
  end if;

  requirement_key := nullif(btrim(p_data ->> 'requirement_key'), '');
  file_name := nullif(btrim(p_data ->> 'file_name'), '');
  storage_path := nullif(btrim(p_data ->> 'storage_path'), '');
  mime_type := nullif(btrim(p_data ->> 'mime_type'), '');
  file_size := nullif(p_data ->> 'file_size', '')::bigint;

  if requirement_key is null or file_name is null or storage_path is null then
    raise exception 'Faltan datos obligatorios del documento' using errcode = '23502';
  end if;

  if mime_type not in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp') then
    raise exception 'Formato de archivo no permitido' using errcode = '22023';
  end if;

  if file_size is null or file_size <= 0 or file_size > 15728640 then
    raise exception 'El tamaño del archivo no es válido' using errcode = '22023';
  end if;

  if public.crm_document_opportunity_id(storage_path) is distinct from p_opportunity_id then
    raise exception 'La ruta del documento no corresponde al lead' using errcode = '22023';
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
    raise exception 'No tenés permiso para adjuntar documentación' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from storage.objects
    where bucket_id = 'lead-documentation'
      and name = storage_path
  ) then
    raise exception 'El archivo no existe en Storage' using errcode = 'P0002';
  end if;

  insert into public.opportunity_documentation_files (
    opportunity_id, requirement_key, file_name, storage_path, mime_type,
    file_size, uploaded_by
  )
  values (
    p_opportunity_id, requirement_key, file_name, storage_path, mime_type,
    file_size, actor_name
  )
  returning * into saved_file;

  activity_text := 'Subió el documento «' || file_name || '»';

  insert into public.opportunity_activities (
    opportunity_id, fecha, memo, resultado, event_type,
    actor_profile_id, effective_at, metadata
  )
  values (
    p_opportunity_id,
    current_date,
    '[HISTORIAL] ' || actor_name || ': ' || activity_text,
    true,
    'document_uploaded',
    actor_id,
    now(),
    jsonb_build_object(
      'actor_name', actor_name,
      'text', activity_text,
      'document_id', saved_file.id,
      'requirement_key', requirement_key,
      'file_name', file_name,
      'storage_path', storage_path,
      'mime_type', mime_type,
      'file_size', file_size
    )
  );

  return to_jsonb(saved_file);
end
$function$;

GRANT EXECUTE ON FUNCTION "public"."crm_register_document_upload"(bigint, jsonb) TO "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."crm_register_document_upload"(bigint, jsonb) FROM PUBLIC;
