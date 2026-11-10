SET local check_function_bodies = off;

DROP POLICY "opportunities_insert_by_role" ON "public"."opportunities";

DROP POLICY "opportunities_select_by_role" ON "public"."opportunities";

DROP POLICY "opportunities_update_by_role" ON "public"."opportunities";

DROP POLICY "visitas_delete_by_role" ON "public"."opportunity_buyers";

DROP POLICY "visitas_select_by_role" ON "public"."opportunity_buyers";

DROP POLICY "visitas_update_by_role" ON "public"."opportunity_buyers";

CREATE OR REPLACE FUNCTION public.crm_can_create_visit_for_opportunity (
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

CREATE OR REPLACE FUNCTION public.crm_can_read_opportunity (
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
        public.crm_current_role() = 'admin'
        or lower(btrim(coalesce(o.estado, ''))) <> 'desestimada'
      )
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

CREATE OR REPLACE FUNCTION public.crm_can_read_visit_opportunity (
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
        public.crm_current_role() = 'admin'
        or lower(btrim(coalesce(o.estado, ''))) <> 'desestimada'
      )
      and (
        public.crm_can_manage_visits()
        or public.crm_can_read_opportunity(o.id)
      )
  )
$function$;

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
        public.crm_current_role() = 'admin'
        or lower(btrim(coalesce(o.estado, ''))) <> 'desestimada'
      )
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

CREATE OR REPLACE FUNCTION public.crm_visit_property_options()
  RETURNS TABLE (
    id          bigint,
    propietario text,
    domicilio   text,
    owner       text,
    planner     text,
    estado      text,
    dominio     text
  )
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  if auth.uid() is null or public.crm_current_role() is null then
    raise exception 'Sesión no válida' using errcode = '42501';
  end if;

  return query
  select
    o.id,
    o.propietario,
    o.domicilio,
      coalesce(owner_profile.name, 'Sin comercial') as owner,
      'Sin contacto'::text as planner,
    o.estado,
    domain.description::text as dominio
  from public.opportunities o
  join public.phases phase on phase.id = o.fase_id
  left join public.profiles owner_profile on owner_profile.id = o.responsible_user_id
    left join public.domain domain on domain.id = o.domain_id
  where o.deleted_at is null
    and (
      public.crm_current_role() = 'admin'
      or lower(btrim(coalesce(o.estado, ''))) <> 'desestimada'
    )
    and lower(btrim(phase.name)) = 'encargo'
    and (
      public.crm_can_manage_visits()
      or public.crm_can_read_opportunity(o.id)
    )
  order by o.propietario nulls last, o.id;
end
$function$;

CREATE POLICY "opportunities_insert_by_role" ON "public"."opportunities"
  FOR INSERT
  TO "authenticated"
  WITH
    CHECK
    ((((public.crm_current_role() = 'admin'::text) OR (lower(btrim(COALESCE(estado, ''::text))) <> 'desestimada'::text)) AND ((public.crm_current_role() = ANY (ARRAY['admin'::text,
    'coordinador'::text])) OR
    ((public.crm_current_role() = 'comercial'::text) AND (NOT public.crm_can_manage_visits()) AND (responsible_user_id = public.crm_current_profile_id())))));

CREATE POLICY "opportunities_select_by_role" ON "public"."opportunities"
  FOR SELECT
  TO "authenticated"
  USING
    (((deleted_at IS NULL) AND ((( SELECT public.crm_current_role() AS crm_current_role) = 'admin'::text) OR (lower(btrim(COALESCE(estado, ''::text))) <> 'desestimada'::text)) AND
    ((( SELECT public.crm_current_role() AS crm_current_role) = ANY (ARRAY['admin'::text, 'coordinador'::text])) OR ((( SELECT public.crm_current_role() AS crm_current_role) =
    'comercial'::text) AND (NOT ( SELECT public.crm_can_manage_visits() AS crm_can_manage_visits)) AND
    (responsible_user_id = ( SELECT public.crm_current_profile_id() AS crm_current_profile_id))))));

CREATE POLICY "opportunities_update_by_role" ON "public"."opportunities"
  FOR UPDATE
  TO "authenticated"
  USING (public.crm_can_write_opportunity(id))
  WITH
    CHECK
    ((public.crm_can_write_opportunity(id) AND ((public.crm_current_role() = 'admin'::text) OR (lower(btrim(COALESCE(estado, ''::text))) <> 'desestimada'::text)) AND
    ((public.crm_current_role() = ANY (ARRAY['admin'::text, 'coordinador'::text])) OR ((public.crm_current_role() = 'comercial'::text) AND (NOT public.crm_can_manage_visits()) AND
    (responsible_user_id = public.crm_current_profile_id())))));

CREATE POLICY "visitas_delete_by_role" ON "public"."opportunity_buyers"
  FOR DELETE
  TO "authenticated"
  USING ((public.crm_can_read_visit_opportunity(opportunity_id) AND (public.crm_can_manage_visits() OR public.crm_can_write_opportunity(opportunity_id))));

CREATE POLICY "visitas_select_by_role" ON "public"."opportunity_buyers"
  FOR SELECT
  TO "authenticated"
  USING (public.crm_can_read_visit_opportunity(opportunity_id));

CREATE POLICY "visitas_update_by_role" ON "public"."opportunity_buyers"
  FOR UPDATE
  TO "authenticated"
  USING ((public.crm_can_read_visit_opportunity(opportunity_id) AND (public.crm_can_manage_visits() OR public.crm_can_write_opportunity(opportunity_id))))
  WITH CHECK (public.crm_can_create_visit_for_opportunity(opportunity_id));

REVOKE ALL ON FUNCTION "public"."crm_can_read_visit_opportunity"(bigint) FROM PUBLIC;

REVOKE ALL ON FUNCTION "public"."crm_can_read_visit_opportunity"(bigint) FROM "anon";

GRANT EXECUTE ON FUNCTION "public"."crm_can_read_visit_opportunity"(bigint) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."crm_can_read_visit_opportunity"(bigint) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."crm_can_read_visit_opportunity"(bigint) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."crm_can_read_visit_opportunity"(bigint) TO "service_role";
