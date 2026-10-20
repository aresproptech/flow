


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "public"."crm_can_create_visit_for_opportunity"("target_id" bigint) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select exists (
    select 1
    from public.opportunities o
    join public.phases phase on phase.id = o.fase_id
    where o.id = target_id
      and o.deleted_at is null
      and lower(btrim(phase.name)) = 'encargo'
      and (
        public.crm_can_manage_visits()
        or public.crm_can_write_opportunity(o.id)
      )
  )
$$;


ALTER FUNCTION "public"."crm_can_create_visit_for_opportunity"("target_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."crm_can_manage_visits"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select exists (
    select 1
    from public.profiles p
    where p.auth_id = auth.uid()
      and coalesce(p.enabled, true)
      and lower(btrim(coalesce(p.rol, ''))) = 'comercial'
      and p.can_manage_visits
  )
$$;


ALTER FUNCTION "public"."crm_can_manage_visits"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."crm_can_read_opportunity"("target_id" bigint) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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
$$;


ALTER FUNCTION "public"."crm_can_read_opportunity"("target_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."crm_can_write_opportunity"("target_id" bigint) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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
$$;


ALTER FUNCTION "public"."crm_can_write_opportunity"("target_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."crm_current_name"() RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select btrim(p.name)
  from public.profiles p
  where p.auth_id = auth.uid()
    and coalesce(p.enabled, true)
  limit 1
$$;


ALTER FUNCTION "public"."crm_current_name"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."crm_current_profile_id"() RETURNS bigint
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select p.id
  from public.profiles p
  where p.auth_id = auth.uid()
    and coalesce(p.enabled, true)
  limit 1
$$;


ALTER FUNCTION "public"."crm_current_profile_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."crm_current_role"() RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select lower(btrim(p.rol))
  from public.profiles p
  where p.auth_id = auth.uid()
    and coalesce(p.enabled, true)
  limit 1
$$;


ALTER FUNCTION "public"."crm_current_role"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."crm_document_opportunity_id"("object_name" "text") RETURNS bigint
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
begin
  return nullif(split_part(object_name, '/', 1), '')::bigint;
exception when invalid_text_representation or numeric_value_out_of_range then
  return null;
end
$$;


ALTER FUNCTION "public"."crm_document_opportunity_id"("object_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."crm_profile_assignment_options"() RETURNS TABLE("id" bigint, "name" "text", "rol" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select p.id, p.name, p.rol
  from public.profiles p
  where coalesce(p.enabled, true)
    and public.crm_current_role() is not null
    and nullif(btrim(p.name), '') is not null
    and btrim(coalesce(p.rol, '')) <> 'Admin'
  order by p.rol, p.name
$$;


ALTER FUNCTION "public"."crm_profile_assignment_options"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."crm_record_document_view"("p_file_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  target_file public.opportunity_documentation_files%rowtype;
  actor_id bigint := public.crm_current_profile_id();
  actor_name text := coalesce(nullif(public.crm_current_name(), ''), 'Usuario');
  activity_text text;
begin
  if auth.uid() is null or public.crm_current_role() is null then
    raise exception 'Sesión no válida' using errcode = '42501';
  end if;

  select * into target_file
  from public.opportunity_documentation_files
  where id = p_file_id;
  if not found then
    raise exception 'El documento no existe' using errcode = 'P0002';
  end if;

  if not public.crm_can_read_opportunity(target_file.opportunity_id) then
    raise exception 'No tenés permiso para abrir este documento' using errcode = '42501';
  end if;

  if not exists (
    select 1 from storage.objects
    where bucket_id = 'lead-documentation'
      and name = target_file.storage_path
  ) then
    raise exception 'El archivo no existe en Storage' using errcode = 'P0002';
  end if;

  activity_text := 'Abrió el documento «' || target_file.file_name || '»';
  insert into public.opportunity_activities (
    opportunity_id, fecha, memo, resultado, event_type, assigned_profile_id
  )
  values (
    target_file.opportunity_id,
    current_date,
    '[HISTORIAL] ' || actor_name || ': ' || activity_text,
    true,
    'document_viewed',
    actor_id
  );

  return target_file.storage_path;
end
$$;


ALTER FUNCTION "public"."crm_record_document_view"("p_file_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."crm_register_document_upload"("p_opportunity_id" bigint, "p_data" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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
    opportunity_id, fecha, memo, resultado, event_type, assigned_profile_id
  )
  values (
    p_opportunity_id,
    current_date,
    '[HISTORIAL] ' || actor_name || ': ' || activity_text,
    true,
    'document_uploaded',
    actor_id
  );

  return to_jsonb(saved_file);
end
$$;


ALTER FUNCTION "public"."crm_register_document_upload"("p_opportunity_id" bigint, "p_data" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."crm_soft_delete_leads"("lead_ids" bigint[]) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  target_id bigint;
  actor_id bigint := public.crm_current_profile_id();
  actor_name text := coalesce(nullif(public.crm_current_name(), ''), 'Usuario');
begin
  if auth.uid() is null or public.crm_current_role() is null then
    raise exception 'Sesión no válida' using errcode = '42501';
  end if;

  if lead_ids is null or cardinality(lead_ids) = 0 then
    return;
  end if;

  perform 1
  from public.opportunities
  where id = any(lead_ids)
    and deleted_at is null
  order by id
  for update;

  foreach target_id in array lead_ids loop
    if not public.crm_can_write_opportunity(target_id) then
      raise exception 'No tienes permiso para eliminar uno de los leads' using errcode = '42501';
    end if;
  end loop;

  update public.opportunities
  set deleted_at = now()
  where id = any(lead_ids);

  foreach target_id in array lead_ids loop
    insert into public.opportunity_activities (
      opportunity_id, fecha, memo, resultado, event_type, assigned_profile_id
    ) values (
      target_id,
      current_date,
      '[HISTORIAL] ' || actor_name || ': Eliminó el lead',
      true,
      'lead_deleted',
      actor_id
    );
  end loop;
end
$$;


ALTER FUNCTION "public"."crm_soft_delete_leads"("lead_ids" bigint[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."crm_visit_property_options"() RETURNS TABLE("id" bigint, "propietario" "text", "domicilio" "text", "owner" "text", "planner" "text", "estado" "text", "dominio" "text")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if auth.uid() is null or public.crm_current_role() is null then
    raise exception 'Sesión no válida' using errcode = '42501';
  end if;

  return query
  select
    o.id,
    o.propietario,
    o.domicilio,
    coalesce(owner_profile.name, 'Sin comercial')::text as owner,
    'Sin contacto'::text as planner,
    o.estado,
    domain.description::text as dominio
  from public.opportunities o
  join public.phases phase on phase.id = o.fase_id
  left join public.profiles owner_profile on owner_profile.id = o.responsible_user_id
  left join public.domain domain on domain.id = o.domain_id
  where o.deleted_at is null
    and lower(btrim(phase.name)) = 'encargo'
    and (
      public.crm_can_manage_visits()
      or public.crm_can_read_opportunity(o.id)
    )
  order by o.propietario nulls last, o.id;
end
$$;


ALTER FUNCTION "public"."crm_visit_property_options"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."sources" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "digital" boolean,
    "code" character varying,
    "enabled" boolean,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "deleted_at" timestamp with time zone,
    "created_by" bigint,
    "updated_by" bigint,
    "deleted_by" bigint
);


ALTER TABLE "public"."sources" OWNER TO "postgres";


COMMENT ON TABLE "public"."sources" IS 'Tipos de Origenes';



ALTER TABLE "public"."sources" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."Sources_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."domain" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "code" character varying NOT NULL,
    "description" character varying,
    "enabled" boolean,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "deleted_at" timestamp with time zone,
    "created_by" bigint,
    "updated_by" bigint,
    "deleted_by" bigint
);


ALTER TABLE "public"."domain" OWNER TO "postgres";


COMMENT ON TABLE "public"."domain" IS 'Tipos de Dominio';



ALTER TABLE "public"."domain" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."Teams_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "rol" "text",
    "name" "text",
    "enabled" boolean,
    "auth_id" "uuid",
    "can_manage_visits" boolean DEFAULT false NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "deleted_at" timestamp with time zone,
    "created_by" bigint,
    "updated_by" bigint,
    "deleted_by" bigint
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


COMMENT ON TABLE "public"."profiles" IS 'Perfil y Roles del Usuario';



ALTER TABLE "public"."profiles" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."Users_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."opportunities" (
    "estado" "text",
    "fecha" "text",
    "postal_id" bigint,
    "valuation" "text",
    "domicilio" "text",
    "propietario" "text",
    "telefono" "text",
    "en_venta" "text",
    "memo" character varying,
    "id" bigint NOT NULL,
    "source_id" bigint,
    "responsible_user_id" bigint,
    "domain_id" bigint,
    "created_at" timestamp without time zone DEFAULT "now"(),
    "fase_id" bigint,
    "deleted_at" timestamp without time zone,
    "is_favorite" boolean DEFAULT false NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "created_by" bigint,
    "updated_by" bigint,
    "deleted_by" bigint,
    "occupancy" "text"
);


ALTER TABLE "public"."opportunities" OWNER TO "postgres";


COMMENT ON TABLE "public"."opportunities" IS 'Oportunidades';



CREATE TABLE IF NOT EXISTS "public"."phases" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "name" character varying NOT NULL,
    "enabled" boolean,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "deleted_at" timestamp with time zone,
    "created_by" bigint,
    "updated_by" bigint,
    "deleted_by" bigint
);


ALTER TABLE "public"."phases" OWNER TO "postgres";


COMMENT ON TABLE "public"."phases" IS 'Tipos de Fases';



CREATE TABLE IF NOT EXISTS "public"."postal" (
    "id" bigint NOT NULL,
    "provincia_id" bigint,
    "provincia" "text",
    "distrito" "text",
    "created_at" timestamp without time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "deleted_at" timestamp with time zone,
    "created_by" bigint,
    "updated_by" bigint,
    "deleted_by" bigint
);


ALTER TABLE "public"."postal" OWNER TO "postgres";


COMMENT ON TABLE "public"."postal" IS 'Tipos de Códigos Postales';



CREATE OR REPLACE VIEW "public"."crm_leads_view" WITH ("security_invoker"='true') AS
 SELECT "o"."id",
    "o"."is_favorite",
    "o"."created_at",
    "o"."fecha",
    "o"."propietario",
    "o"."telefono",
    "o"."domicilio",
    "o"."postal_id" AS "cp",
    "po"."provincia",
    "po"."distrito",
    "o"."domain_id",
    "d"."description" AS "domain_name",
    "o"."source_id",
    "s"."code" AS "source_name",
    "o"."fase_id",
    "p"."name" AS "fase_name",
    "o"."estado",
    "o"."responsible_user_id",
    "u"."name" AS "responsable",
    "o"."valuation",
    "o"."en_venta",
    "o"."memo",
    "o"."deleted_at",
    "o"."occupancy"
   FROM ((((("public"."opportunities" "o"
     LEFT JOIN "public"."domain" "d" ON (("d"."id" = "o"."domain_id")))
     LEFT JOIN "public"."phases" "p" ON (("p"."id" = "o"."fase_id")))
     LEFT JOIN "public"."sources" "s" ON (("s"."id" = "o"."source_id")))
     LEFT JOIN "public"."profiles" "u" ON (("u"."id" = "o"."responsible_user_id")))
     LEFT JOIN "public"."postal" "po" ON (("po"."id" = "o"."postal_id")))
  WHERE ("o"."deleted_at" IS NULL);


ALTER VIEW "public"."crm_leads_view" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lookups" (
    "id" bigint NOT NULL,
    "category" character varying(100) NOT NULL,
    "code" character varying(100) NOT NULL,
    "name" character varying(255) NOT NULL,
    "description" character varying(500),
    "sort_order" integer DEFAULT 0,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    "updated_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" timestamp with time zone,
    "created_by" bigint,
    "updated_by" bigint,
    "deleted_by" bigint
);


ALTER TABLE "public"."lookups" OWNER TO "postgres";


ALTER TABLE "public"."lookups" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."lookups_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE SEQUENCE IF NOT EXISTS "public"."opportunities_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."opportunities_id_seq" OWNER TO "postgres";


ALTER TABLE "public"."opportunities" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."opportunities_id_seq1"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."opportunity_activities" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "opportunity_id" bigint,
    "fecha" "date",
    "memo" character varying,
    "resultado" boolean,
    "event_type" "text" DEFAULT 'legacy'::"text" NOT NULL,
    "assigned_profile_id" bigint,
    "parent_event_id" bigint,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "hora" time without time zone,
    "medio" "text",
    "valuation" "text",
    "resultado_text" "text",
    "deleted_at" timestamp with time zone,
    "created_by" bigint,
    "updated_by" bigint,
    "deleted_by" bigint,
    "confirmed" boolean DEFAULT false NOT NULL,
    CONSTRAINT "opportunity_contacts_event_type_check" CHECK (("event_type" = ANY (ARRAY['legacy'::"text", 'activity'::"text", 'note'::"text", 'call'::"text", 'contact'::"text", 'valuation'::"text", 'valuation_updated'::"text", 'rg'::"text", 'rg_updated'::"text", 'lead_created'::"text", 'lead_imported'::"text", 'lead_updated'::"text", 'lead_deleted'::"text", 'phase_changed'::"text", 'visit_created'::"text", 'visit_updated'::"text", 'order_created'::"text", 'order_updated'::"text", 'document_uploaded'::"text", 'document_viewed'::"text"])))
);


ALTER TABLE "public"."opportunity_activities" OWNER TO "postgres";


COMMENT ON TABLE "public"."opportunity_activities" IS 'Actividades de la Oportunidad';



CREATE TABLE IF NOT EXISTS "public"."opportunity_activity_history_archive" (
    "activity_id" bigint NOT NULL,
    "opportunity_id" bigint,
    "legacy_payload" "jsonb" NOT NULL,
    "archived_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."opportunity_activity_history_archive" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."opportunity_buyers" (
    "id" bigint NOT NULL,
    "opportunity_id" bigint,
    "fecha_visita" "date",
    "hora" time without time zone,
    "medio" "text" DEFAULT 'Presencial'::"text",
    "resultado" "text",
    "assigned_profile_id" bigint,
    "created_by" "text" DEFAULT 'Sistema'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "nombre_apellido" "text",
    "telefono" "text",
    "dni" "text",
    "vende" boolean,
    "observaciones_visita" "text",
    "deleted_at" timestamp with time zone,
    "updated_by" bigint,
    "deleted_by" bigint
);


ALTER TABLE "public"."opportunity_buyers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."opportunity_documentation_cases" (
    "id" bigint NOT NULL,
    "opportunity_id" bigint NOT NULL,
    "state" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "updated_by" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "created_by" bigint,
    "deleted_by" bigint
);


ALTER TABLE "public"."opportunity_documentation_cases" OWNER TO "postgres";


ALTER TABLE "public"."opportunity_documentation_cases" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."opportunity_documentation_cases_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."opportunity_documentation_files" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "opportunity_id" bigint NOT NULL,
    "requirement_key" "text" NOT NULL,
    "file_name" "text" NOT NULL,
    "storage_path" "text" NOT NULL,
    "mime_type" "text",
    "file_size" bigint,
    "uploaded_by" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "deleted_at" timestamp with time zone,
    "created_by" bigint,
    "updated_by" bigint,
    "deleted_by" bigint
);


ALTER TABLE "public"."opportunity_documentation_files" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."opportunity_orders" (
    "opportunity_id" bigint NOT NULL,
    "fecha_inicio" "date",
    "fecha_fin" "date",
    "com_vendedor" numeric(5,2),
    "com_comprador" numeric(5,2),
    "pvp_inicial" bigint,
    "pvp_actual" bigint,
    "pvp_estimado" bigint,
    "memo" character varying,
    "event_type" "text",
    "is_current" boolean DEFAULT false,
    "health" integer,
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "deleted_at" timestamp with time zone,
    "created_by" bigint,
    "updated_by" bigint,
    "deleted_by" bigint,
    "assigned_profile_id" bigint,
    CONSTRAINT "opportunity_orders_health_check" CHECK ((("health" >= 1) AND ("health" <= 10)))
);


ALTER TABLE "public"."opportunity_orders" OWNER TO "postgres";


COMMENT ON TABLE "public"."opportunity_orders" IS 'Oportunidad Encargos';



ALTER TABLE "public"."opportunity_orders" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."opportunity_orders_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



ALTER TABLE "public"."opportunity_activities" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."order_contacts_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



ALTER TABLE "public"."phases" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."phases_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE SEQUENCE IF NOT EXISTS "public"."visitas_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."visitas_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."visitas_id_seq" OWNED BY "public"."opportunity_buyers"."id";



ALTER TABLE ONLY "public"."opportunity_buyers" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."visitas_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."sources"
    ADD CONSTRAINT "Sources_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "Users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lookups"
    ADD CONSTRAINT "lookups_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."opportunities"
    ADD CONSTRAINT "opportunities_id_key" UNIQUE ("id");



ALTER TABLE ONLY "public"."opportunities"
    ADD CONSTRAINT "opportunities_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."opportunity_activity_history_archive"
    ADD CONSTRAINT "opportunity_activity_history_archive_pkey" PRIMARY KEY ("activity_id");



ALTER TABLE ONLY "public"."opportunity_documentation_cases"
    ADD CONSTRAINT "opportunity_documentation_cases_opportunity_id_key" UNIQUE ("opportunity_id");



ALTER TABLE ONLY "public"."opportunity_documentation_cases"
    ADD CONSTRAINT "opportunity_documentation_cases_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."opportunity_documentation_files"
    ADD CONSTRAINT "opportunity_documentation_files_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."opportunity_documentation_files"
    ADD CONSTRAINT "opportunity_documentation_files_storage_path_key" UNIQUE ("storage_path");



ALTER TABLE ONLY "public"."opportunity_orders"
    ADD CONSTRAINT "opportunity_orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."opportunity_activities"
    ADD CONSTRAINT "order_contacts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."phases"
    ADD CONSTRAINT "phases_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."postal"
    ADD CONSTRAINT "postal_id_key" UNIQUE ("id");



ALTER TABLE ONLY "public"."postal"
    ADD CONSTRAINT "postal_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sources"
    ADD CONSTRAINT "sources_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."domain"
    ADD CONSTRAINT "teams_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lookups"
    ADD CONSTRAINT "uq_lookups_category_code" UNIQUE ("category", "code");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "users_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."opportunity_buyers"
    ADD CONSTRAINT "visitas_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_opportunities_responsible_user_id" ON "public"."opportunities" USING "btree" ("responsible_user_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_opportunities_source_id" ON "public"."opportunities" USING "btree" ("source_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_opportunity_activities_assigned_profile_id" ON "public"."opportunity_activities" USING "btree" ("assigned_profile_id") WHERE ("assigned_profile_id" IS NOT NULL);



CREATE INDEX "idx_opportunity_contacts_event_type_fecha" ON "public"."opportunity_activities" USING "btree" ("event_type", "fecha" DESC);



CREATE INDEX "idx_opportunity_contacts_opportunity_event_created" ON "public"."opportunity_activities" USING "btree" ("opportunity_id", "event_type", "created_at" DESC);



CREATE INDEX "idx_opportunity_orders_opportunity_id" ON "public"."opportunity_orders" USING "btree" ("opportunity_id");



CREATE INDEX "idx_visitas_fecha" ON "public"."opportunity_buyers" USING "btree" ("fecha_visita");



CREATE INDEX "idx_visitas_opportunity_id" ON "public"."opportunity_buyers" USING "btree" ("opportunity_id");



CREATE INDEX "opportunity_documentation_files_opportunity_idx" ON "public"."opportunity_documentation_files" USING "btree" ("opportunity_id", "requirement_key");



ALTER TABLE ONLY "public"."opportunity_activities"
    ADD CONSTRAINT "oportunity_contacts_oportunity_id_fkey" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id");



ALTER TABLE ONLY "public"."opportunity_orders"
    ADD CONSTRAINT "oportunity_orders_opportunity_id_fkey" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id");



ALTER TABLE ONLY "public"."opportunities"
    ADD CONSTRAINT "opportunities_domain_id_fkey" FOREIGN KEY ("domain_id") REFERENCES "public"."domain"("id");



ALTER TABLE ONLY "public"."opportunities"
    ADD CONSTRAINT "opportunities_fase_id_fkey" FOREIGN KEY ("fase_id") REFERENCES "public"."phases"("id");



ALTER TABLE ONLY "public"."opportunities"
    ADD CONSTRAINT "opportunities_postal_id_fkey" FOREIGN KEY ("postal_id") REFERENCES "public"."postal"("id");



ALTER TABLE ONLY "public"."opportunities"
    ADD CONSTRAINT "opportunities_responsible_user_id_fkey" FOREIGN KEY ("responsible_user_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."opportunities"
    ADD CONSTRAINT "opportunities_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id");



ALTER TABLE ONLY "public"."opportunity_activities"
    ADD CONSTRAINT "opportunity_activities_assigned_profile_id_fkey" FOREIGN KEY ("assigned_profile_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."opportunity_activities"
    ADD CONSTRAINT "opportunity_activities_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."opportunity_activity_history_archive"
    ADD CONSTRAINT "opportunity_activity_history_archive_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "public"."opportunity_activities"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."opportunity_activity_history_archive"
    ADD CONSTRAINT "opportunity_activity_history_archive_opportunity_id_fkey" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."opportunity_buyers"
    ADD CONSTRAINT "opportunity_buyers_assigned_profile_id_fkey" FOREIGN KEY ("assigned_profile_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."opportunity_activities"
    ADD CONSTRAINT "opportunity_contacts_parent_event_id_fkey" FOREIGN KEY ("parent_event_id") REFERENCES "public"."opportunity_activities"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."opportunity_documentation_cases"
    ADD CONSTRAINT "opportunity_documentation_cases_opportunity_id_fkey" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."opportunity_documentation_files"
    ADD CONSTRAINT "opportunity_documentation_files_opportunity_id_fkey" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."opportunity_orders"
    ADD CONSTRAINT "opportunity_orders_assigned_profile_id_fkey" FOREIGN KEY ("assigned_profile_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "users_auth_id_fkey" FOREIGN KEY ("auth_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."opportunity_buyers"
    ADD CONSTRAINT "visitas_opportunity_id_fkey" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id");



CREATE POLICY "activities_update_functional_records" ON "public"."opportunity_activities" FOR UPDATE TO "authenticated" USING (("public"."crm_can_write_opportunity"("opportunity_id") AND ("event_type" = ANY (ARRAY['contact'::"text", 'rg'::"text", 'valuation'::"text"])))) WITH CHECK (("public"."crm_can_write_opportunity"("opportunity_id") AND ("event_type" = ANY (ARRAY['contact'::"text", 'rg'::"text", 'valuation'::"text"]))));



CREATE POLICY "activity_history_archive_select_by_opportunity" ON "public"."opportunity_activity_history_archive" FOR SELECT TO "authenticated" USING ((("opportunity_id" IS NOT NULL) AND "public"."crm_can_read_opportunity"("opportunity_id")));



CREATE POLICY "catalog_manage" ON "public"."domain" TO "authenticated" USING (("public"."crm_current_role"() = ANY (ARRAY['admin'::"text", 'coordinador'::"text"]))) WITH CHECK (("public"."crm_current_role"() = ANY (ARRAY['admin'::"text", 'coordinador'::"text"])));



CREATE POLICY "catalog_manage" ON "public"."lookups" TO "authenticated" USING (("public"."crm_current_role"() = ANY (ARRAY['admin'::"text", 'coordinador'::"text"]))) WITH CHECK (("public"."crm_current_role"() = ANY (ARRAY['admin'::"text", 'coordinador'::"text"])));



CREATE POLICY "catalog_manage" ON "public"."phases" TO "authenticated" USING (("public"."crm_current_role"() = ANY (ARRAY['admin'::"text", 'coordinador'::"text"]))) WITH CHECK (("public"."crm_current_role"() = ANY (ARRAY['admin'::"text", 'coordinador'::"text"])));



CREATE POLICY "catalog_manage" ON "public"."postal" TO "authenticated" USING (("public"."crm_current_role"() = ANY (ARRAY['admin'::"text", 'coordinador'::"text"]))) WITH CHECK (("public"."crm_current_role"() = ANY (ARRAY['admin'::"text", 'coordinador'::"text"])));



CREATE POLICY "catalog_manage" ON "public"."sources" TO "authenticated" USING (("public"."crm_current_role"() = ANY (ARRAY['admin'::"text", 'coordinador'::"text"]))) WITH CHECK (("public"."crm_current_role"() = ANY (ARRAY['admin'::"text", 'coordinador'::"text"])));



CREATE POLICY "catalog_read" ON "public"."domain" FOR SELECT TO "authenticated" USING (("public"."crm_current_role"() = ANY (ARRAY['admin'::"text", 'coordinador'::"text", 'comercial'::"text"])));



CREATE POLICY "catalog_read" ON "public"."lookups" FOR SELECT TO "authenticated" USING (("public"."crm_current_role"() = ANY (ARRAY['admin'::"text", 'coordinador'::"text", 'comercial'::"text"])));



CREATE POLICY "catalog_read" ON "public"."phases" FOR SELECT TO "authenticated" USING (("public"."crm_current_role"() = ANY (ARRAY['admin'::"text", 'coordinador'::"text", 'comercial'::"text"])));



CREATE POLICY "catalog_read" ON "public"."postal" FOR SELECT TO "authenticated" USING (("public"."crm_current_role"() = ANY (ARRAY['admin'::"text", 'coordinador'::"text", 'comercial'::"text"])));



CREATE POLICY "catalog_read" ON "public"."sources" FOR SELECT TO "authenticated" USING (("public"."crm_current_role"() = ANY (ARRAY['admin'::"text", 'coordinador'::"text", 'comercial'::"text"])));



CREATE POLICY "contacts_insert_by_opportunity" ON "public"."opportunity_activities" FOR INSERT TO "authenticated" WITH CHECK ("public"."crm_can_write_opportunity"("opportunity_id"));



CREATE POLICY "contacts_select_by_opportunity" ON "public"."opportunity_activities" FOR SELECT TO "authenticated" USING ("public"."crm_can_read_opportunity"("opportunity_id"));



CREATE POLICY "documentation_cases_insert" ON "public"."opportunity_documentation_cases" FOR INSERT TO "authenticated" WITH CHECK ("public"."crm_can_write_opportunity"("opportunity_id"));



CREATE POLICY "documentation_cases_select" ON "public"."opportunity_documentation_cases" FOR SELECT TO "authenticated" USING ("public"."crm_can_read_opportunity"("opportunity_id"));



CREATE POLICY "documentation_cases_update" ON "public"."opportunity_documentation_cases" FOR UPDATE TO "authenticated" USING ("public"."crm_can_write_opportunity"("opportunity_id")) WITH CHECK ("public"."crm_can_write_opportunity"("opportunity_id"));



CREATE POLICY "documentation_files_select" ON "public"."opportunity_documentation_files" FOR SELECT TO "authenticated" USING ("public"."crm_can_read_opportunity"("opportunity_id"));



ALTER TABLE "public"."domain" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."lookups" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."opportunities" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "opportunities_insert_by_role" ON "public"."opportunities" FOR INSERT TO "authenticated" WITH CHECK ((("public"."crm_current_role"() = ANY (ARRAY['admin'::"text", 'coordinador'::"text"])) OR (("public"."crm_current_role"() = 'comercial'::"text") AND (NOT "public"."crm_can_manage_visits"()) AND ("responsible_user_id" = "public"."crm_current_profile_id"()))));



CREATE POLICY "opportunities_select_by_role" ON "public"."opportunities" FOR SELECT TO "authenticated" USING ("public"."crm_can_read_opportunity"("id"));



CREATE POLICY "opportunities_update_by_role" ON "public"."opportunities" FOR UPDATE TO "authenticated" USING ("public"."crm_can_write_opportunity"("id")) WITH CHECK ("public"."crm_can_write_opportunity"("id"));



ALTER TABLE "public"."opportunity_activities" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."opportunity_activity_history_archive" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."opportunity_buyers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."opportunity_documentation_cases" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."opportunity_documentation_files" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."opportunity_orders" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "orders_delete_by_opportunity" ON "public"."opportunity_orders" FOR DELETE TO "authenticated" USING ("public"."crm_can_write_opportunity"("opportunity_id"));



CREATE POLICY "orders_insert_by_opportunity" ON "public"."opportunity_orders" FOR INSERT TO "authenticated" WITH CHECK ("public"."crm_can_write_opportunity"("opportunity_id"));



CREATE POLICY "orders_select_by_opportunity" ON "public"."opportunity_orders" FOR SELECT TO "authenticated" USING ("public"."crm_can_read_opportunity"("opportunity_id"));



CREATE POLICY "orders_update_by_opportunity" ON "public"."opportunity_orders" FOR UPDATE TO "authenticated" USING ("public"."crm_can_write_opportunity"("opportunity_id")) WITH CHECK ("public"."crm_can_write_opportunity"("opportunity_id"));



ALTER TABLE "public"."phases" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."postal" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_delete_by_manager" ON "public"."profiles" FOR DELETE TO "authenticated" USING (("public"."crm_current_role"() = ANY (ARRAY['admin'::"text", 'coordinador'::"text"])));



CREATE POLICY "profiles_insert_by_manager" ON "public"."profiles" FOR INSERT TO "authenticated" WITH CHECK (("public"."crm_current_role"() = ANY (ARRAY['admin'::"text", 'coordinador'::"text"])));



CREATE POLICY "profiles_select_by_role" ON "public"."profiles" FOR SELECT TO "authenticated" USING ((("auth_id" = "auth"."uid"()) OR ("public"."crm_current_role"() = ANY (ARRAY['admin'::"text", 'coordinador'::"text"]))));



CREATE POLICY "profiles_update_by_manager" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (("public"."crm_current_role"() = ANY (ARRAY['admin'::"text", 'coordinador'::"text"]))) WITH CHECK (("public"."crm_current_role"() = ANY (ARRAY['admin'::"text", 'coordinador'::"text"])));



ALTER TABLE "public"."sources" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "visitas_delete_by_role" ON "public"."opportunity_buyers" FOR DELETE TO "authenticated" USING (("public"."crm_can_manage_visits"() OR "public"."crm_can_write_opportunity"("opportunity_id")));



CREATE POLICY "visitas_insert_by_role" ON "public"."opportunity_buyers" FOR INSERT TO "authenticated" WITH CHECK ("public"."crm_can_create_visit_for_opportunity"("opportunity_id"));



CREATE POLICY "visitas_select_by_role" ON "public"."opportunity_buyers" FOR SELECT TO "authenticated" USING (("public"."crm_can_manage_visits"() OR "public"."crm_can_read_opportunity"("opportunity_id")));



CREATE POLICY "visitas_update_by_role" ON "public"."opportunity_buyers" FOR UPDATE TO "authenticated" USING (("public"."crm_can_manage_visits"() OR "public"."crm_can_write_opportunity"("opportunity_id"))) WITH CHECK ("public"."crm_can_create_visit_for_opportunity"("opportunity_id"));



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";
GRANT USAGE ON SCHEMA "public" TO "appsheet_user";



REVOKE ALL ON FUNCTION "public"."crm_can_create_visit_for_opportunity"("target_id" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."crm_can_create_visit_for_opportunity"("target_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."crm_can_create_visit_for_opportunity"("target_id" bigint) TO "service_role";



REVOKE ALL ON FUNCTION "public"."crm_can_manage_visits"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."crm_can_manage_visits"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."crm_can_manage_visits"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."crm_can_read_opportunity"("target_id" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."crm_can_read_opportunity"("target_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."crm_can_read_opportunity"("target_id" bigint) TO "service_role";



REVOKE ALL ON FUNCTION "public"."crm_can_write_opportunity"("target_id" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."crm_can_write_opportunity"("target_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."crm_can_write_opportunity"("target_id" bigint) TO "service_role";



REVOKE ALL ON FUNCTION "public"."crm_current_name"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."crm_current_name"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."crm_current_name"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."crm_current_profile_id"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."crm_current_profile_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."crm_current_profile_id"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."crm_current_role"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."crm_current_role"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."crm_current_role"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."crm_document_opportunity_id"("object_name" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."crm_document_opportunity_id"("object_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."crm_document_opportunity_id"("object_name" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."crm_profile_assignment_options"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."crm_profile_assignment_options"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."crm_profile_assignment_options"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."crm_record_document_view"("p_file_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."crm_record_document_view"("p_file_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."crm_record_document_view"("p_file_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."crm_register_document_upload"("p_opportunity_id" bigint, "p_data" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."crm_register_document_upload"("p_opportunity_id" bigint, "p_data" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."crm_register_document_upload"("p_opportunity_id" bigint, "p_data" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."crm_soft_delete_leads"("lead_ids" bigint[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."crm_soft_delete_leads"("lead_ids" bigint[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."crm_soft_delete_leads"("lead_ids" bigint[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."crm_visit_property_options"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."crm_visit_property_options"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."crm_visit_property_options"() TO "service_role";



GRANT ALL ON TABLE "public"."sources" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."sources" TO "appsheet_user";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."sources" TO "authenticated";



GRANT ALL ON SEQUENCE "public"."Sources_id_seq" TO "service_role";
GRANT SELECT ON SEQUENCE "public"."Sources_id_seq" TO "appsheet_user";
GRANT SELECT,USAGE ON SEQUENCE "public"."Sources_id_seq" TO "authenticated";



GRANT ALL ON TABLE "public"."domain" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."domain" TO "appsheet_user";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."domain" TO "authenticated";



GRANT ALL ON SEQUENCE "public"."Teams_id_seq" TO "service_role";
GRANT SELECT ON SEQUENCE "public"."Teams_id_seq" TO "appsheet_user";
GRANT SELECT,USAGE ON SEQUENCE "public"."Teams_id_seq" TO "authenticated";



GRANT ALL ON TABLE "public"."profiles" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."profiles" TO "appsheet_user";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."profiles" TO "authenticated";



GRANT ALL ON SEQUENCE "public"."Users_id_seq" TO "service_role";
GRANT SELECT ON SEQUENCE "public"."Users_id_seq" TO "appsheet_user";
GRANT SELECT,USAGE ON SEQUENCE "public"."Users_id_seq" TO "authenticated";



GRANT ALL ON TABLE "public"."opportunities" TO "service_role";
GRANT SELECT,INSERT,UPDATE ON TABLE "public"."opportunities" TO "appsheet_user";
GRANT SELECT,INSERT,UPDATE ON TABLE "public"."opportunities" TO "authenticated";



GRANT ALL ON TABLE "public"."phases" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."phases" TO "appsheet_user";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."phases" TO "authenticated";



GRANT ALL ON TABLE "public"."postal" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."postal" TO "appsheet_user";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."postal" TO "authenticated";



GRANT ALL ON TABLE "public"."crm_leads_view" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."crm_leads_view" TO "appsheet_user";
GRANT SELECT ON TABLE "public"."crm_leads_view" TO "authenticated";



GRANT ALL ON TABLE "public"."lookups" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."lookups" TO "appsheet_user";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."lookups" TO "authenticated";



GRANT ALL ON SEQUENCE "public"."lookups_id_seq" TO "service_role";
GRANT SELECT,USAGE ON SEQUENCE "public"."lookups_id_seq" TO "authenticated";



GRANT ALL ON SEQUENCE "public"."opportunities_id_seq" TO "service_role";
GRANT SELECT ON SEQUENCE "public"."opportunities_id_seq" TO "appsheet_user";
GRANT SELECT,USAGE ON SEQUENCE "public"."opportunities_id_seq" TO "authenticated";



GRANT ALL ON SEQUENCE "public"."opportunities_id_seq1" TO "service_role";
GRANT SELECT ON SEQUENCE "public"."opportunities_id_seq1" TO "appsheet_user";
GRANT SELECT,USAGE ON SEQUENCE "public"."opportunities_id_seq1" TO "authenticated";



GRANT ALL ON TABLE "public"."opportunity_activities" TO "service_role";
GRANT SELECT,INSERT,UPDATE ON TABLE "public"."opportunity_activities" TO "appsheet_user";
GRANT SELECT,INSERT,UPDATE ON TABLE "public"."opportunity_activities" TO "authenticated";



GRANT ALL ON TABLE "public"."opportunity_activity_history_archive" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."opportunity_activity_history_archive" TO "appsheet_user";
GRANT SELECT ON TABLE "public"."opportunity_activity_history_archive" TO "authenticated";



GRANT ALL ON TABLE "public"."opportunity_buyers" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."opportunity_buyers" TO "appsheet_user";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."opportunity_buyers" TO "authenticated";



GRANT ALL ON TABLE "public"."opportunity_documentation_cases" TO "service_role";
GRANT SELECT,INSERT,UPDATE ON TABLE "public"."opportunity_documentation_cases" TO "appsheet_user";
GRANT SELECT,INSERT,UPDATE ON TABLE "public"."opportunity_documentation_cases" TO "authenticated";



GRANT ALL ON SEQUENCE "public"."opportunity_documentation_cases_id_seq" TO "service_role";
GRANT SELECT,USAGE ON SEQUENCE "public"."opportunity_documentation_cases_id_seq" TO "authenticated";



GRANT ALL ON TABLE "public"."opportunity_documentation_files" TO "service_role";
GRANT SELECT ON TABLE "public"."opportunity_documentation_files" TO "appsheet_user";
GRANT SELECT ON TABLE "public"."opportunity_documentation_files" TO "authenticated";



GRANT ALL ON TABLE "public"."opportunity_orders" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."opportunity_orders" TO "appsheet_user";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."opportunity_orders" TO "authenticated";



GRANT ALL ON SEQUENCE "public"."opportunity_orders_id_seq" TO "service_role";
GRANT SELECT,USAGE ON SEQUENCE "public"."opportunity_orders_id_seq" TO "authenticated";



GRANT ALL ON SEQUENCE "public"."order_contacts_id_seq" TO "service_role";
GRANT SELECT ON SEQUENCE "public"."order_contacts_id_seq" TO "appsheet_user";
GRANT SELECT,USAGE ON SEQUENCE "public"."order_contacts_id_seq" TO "authenticated";



GRANT ALL ON SEQUENCE "public"."phases_id_seq" TO "service_role";
GRANT SELECT ON SEQUENCE "public"."phases_id_seq" TO "appsheet_user";
GRANT SELECT,USAGE ON SEQUENCE "public"."phases_id_seq" TO "authenticated";



GRANT ALL ON SEQUENCE "public"."visitas_id_seq" TO "service_role";
GRANT SELECT,USAGE ON SEQUENCE "public"."visitas_id_seq" TO "authenticated";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT SELECT,INSERT,DELETE,UPDATE ON TABLES TO "appsheet_user";







