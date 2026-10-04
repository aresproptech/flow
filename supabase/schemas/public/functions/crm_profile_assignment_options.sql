CREATE OR REPLACE FUNCTION public.crm_profile_assignment_options()
  RETURNS TABLE (
    id   bigint,
    name text,
    rol  text
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select p.id, p.name, p.rol
  from public.profiles p
  where coalesce(p.enabled, true)
    and public.crm_current_role() is not null
    and nullif(btrim(p.name), '') is not null
    and btrim(coalesce(p.rol, '')) <> 'Admin'
  order by p.rol, p.name
$function$;

GRANT EXECUTE ON FUNCTION "public"."crm_profile_assignment_options"() TO "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."crm_profile_assignment_options"() FROM PUBLIC;
