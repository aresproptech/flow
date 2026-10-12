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

  return target_file.storage_path;
end
$function$;

GRANT EXECUTE ON FUNCTION "public"."crm_record_document_view"(uuid) TO "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."crm_record_document_view"(uuid) FROM PUBLIC;
