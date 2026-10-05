CREATE OR REPLACE FUNCTION public.crm_can_write_opportunity (
  target_id bigint
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select exists (
    select 1
    from public.opportunities o
    where o.id = target_id
      and o.deleted_at is null
      and (
        public.crm_current_role() in ('admin', 'coordinador')
        or (
          public.crm_current_role() = 'comercial'
          and not public.crm_can_manage_visits()
          and o.responsible_user_id = public.crm_current_profile_id()
        )
      )
  )
$function$;

GRANT EXECUTE ON FUNCTION "public"."crm_can_write_opportunity"(bigint) TO "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."crm_can_write_opportunity"(bigint) FROM PUBLIC;
