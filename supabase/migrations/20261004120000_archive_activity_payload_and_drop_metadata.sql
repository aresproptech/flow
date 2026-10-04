begin;

create table if not exists public.opportunity_activity_history_archive (
  activity_id bigint primary key
    references public.opportunity_activities(id) on delete cascade,
  opportunity_id bigint
    references public.opportunities(id) on delete cascade,
  legacy_payload jsonb not null,
  archived_at timestamptz not null default now()
);

insert into public.opportunity_activity_history_archive (
  activity_id, opportunity_id, legacy_payload
)
select id, opportunity_id, metadata
from public.opportunity_activities
on conflict (activity_id) do update
set opportunity_id = excluded.opportunity_id,
    legacy_payload = excluded.legacy_payload;

alter table public.opportunity_activity_history_archive enable row level security;
revoke all on table public.opportunity_activity_history_archive from public, anon, authenticated;
grant select on table public.opportunity_activity_history_archive to authenticated;
grant all on table public.opportunity_activity_history_archive to postgres, service_role;

drop policy if exists activity_history_archive_select_by_opportunity
  on public.opportunity_activity_history_archive;
create policy activity_history_archive_select_by_opportunity
on public.opportunity_activity_history_archive
for select to authenticated
using (
  opportunity_id is not null
  and public.crm_can_read_opportunity(opportunity_id)
);

update public.opportunity_activities
set
  hora = coalesce(
    hora,
    case
      when metadata ->> 'hora' ~ '^([0-9]|[01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$'
        then (metadata ->> 'hora')::time
      else null
    end
  ),
  medio = coalesce(medio, nullif(btrim(metadata ->> 'medio'), '')),
  resultado_text = coalesce(resultado_text, nullif(btrim(metadata ->> 'resultado'), ''));

create or replace function public.crm_register_document_upload(
  p_opportunity_id bigint,
  p_data jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
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
$function$;

create or replace function public.crm_record_document_view(p_file_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
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
$function$;

create or replace function public.crm_soft_delete_leads(lead_ids bigint[])
returns void
language plpgsql
security definer
set search_path = ''
as $function$
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
$function$;

alter table public.opportunity_activities drop column metadata;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'opportunity_activities'
      and column_name = 'metadata'
  ) then
    raise exception 'opportunity_activities.metadata still exists';
  end if;

  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and position('opportunity_activities' in p.prosrc) > 0
      and position('metadata' in p.prosrc) > 0
  ) then
    raise exception 'A public function still references activity metadata';
  end if;
end
$$;

commit;
