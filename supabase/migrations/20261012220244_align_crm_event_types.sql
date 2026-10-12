begin;

alter table public.opportunity_buyers
  add column event_type text;

alter table public.opportunity_activities
  alter column event_type drop default;

alter table public.opportunity_activities
  drop constraint if exists opportunity_contacts_event_type_check;

alter table public.opportunity_activities
  add constraint opportunity_contacts_event_type_check
  check (
    event_type = any (
      array[
        'call'::text,
        'contact'::text,
        'valuation'::text,
        'rg'::text,
        'visit'::text,
        'order'::text,
        'lead_updated'::text,
        'document_uploaded'::text
      ]
    )
  );

create or replace function public.crm_record_document_view(
  p_file_id uuid
)
returns text
language plpgsql
security definer
set search_path to ''
as $function$
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

grant execute on function public.crm_record_document_view(uuid)
  to authenticated, postgres, service_role;

revoke all on function public.crm_record_document_view(uuid) from public;

create or replace function public.crm_soft_delete_leads(
  lead_ids bigint[]
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  target_id bigint;
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
end
$function$;

grant execute on function public.crm_soft_delete_leads(bigint[])
  to authenticated, postgres, service_role;

revoke all on function public.crm_soft_delete_leads(bigint[]) from public;

commit;
