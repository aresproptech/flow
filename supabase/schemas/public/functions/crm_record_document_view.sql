CREATE OR REPLACE FUNCTION public.crm_record_document_view (
  p_file_id uuid
)
  RETURNS text
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  target_file public.opportunity_documentation_files%rowtype;
  actor_id bigint := public.crm_current_profile_id();
  actor_name text := coalesce(nullif(public.crm_current_name(), ''), 'Usuario');
  activity_text text;
begin
  if auth.uid() is null or public.crm_current_role() is null then
    raise exception 'Sesión no válida' using errcode = '42501';
  end if;

  select *
  into target_file
  from public.opportunity_documentation_files
  where id = p_file_id;

  if not found then
    raise exception 'El documento no existe' using errcode = 'P0002';
  end if;

  if not public.crm_can_read_opportunity(target_file.opportunity_id) then
    raise exception 'No tenés permiso para abrir este documento' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from storage.objects
    where bucket_id = 'lead-documentation'
      and name = target_file.storage_path
  ) then
    raise exception 'El archivo no existe en Storage' using errcode = 'P0002';
  end if;

  activity_text := 'Abrió el documento «' || target_file.file_name || '»';

  insert into public.opportunity_activities (
    opportunity_id, fecha, memo, resultado, event_type,
    actor_profile_id, effective_at, metadata
  )
  values (
    target_file.opportunity_id,
    current_date,
    null,
    true,
    'document_viewed',
    actor_id,
    now(),
    jsonb_build_object(
      'actor_name', actor_name,
      'text', activity_text,
      'document_id', target_file.id,
      'requirement_key', target_file.requirement_key,
      'file_name', target_file.file_name,
      'storage_path', target_file.storage_path
    )
  );

  return target_file.storage_path;
end
$function$;

GRANT EXECUTE ON FUNCTION "public"."crm_record_document_view"(uuid) TO "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."crm_record_document_view"(uuid) FROM PUBLIC;
