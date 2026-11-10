CREATE OR REPLACE FUNCTION public.crm_can_create_visit_for_opportunity(target_id bigint)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select exists (
    select 1
    from public.opportunities o
    join public.phases phase on phase.id = o.fase_id
    where o.id = target_id
      and o.deleted_at is null
      and (
        public.crm_current_role() = 'admin'
        or lower(btrim(coalesce(o.estado, ''))) <> 'desestimada'
      )
      and lower(btrim(phase.name)) = 'encargo'
      and (
        public.crm_can_manage_visits()
        or public.crm_can_write_opportunity(o.id)
      )
  )
$function$;

GRANT EXECUTE ON FUNCTION "public"."crm_can_create_visit_for_opportunity"(bigint) TO "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."crm_can_create_visit_for_opportunity"(bigint) FROM PUBLIC;
