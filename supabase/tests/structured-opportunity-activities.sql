-- Prueba la estructura tipada de opportunity_activities. No conserva escrituras.
begin;

do $$
declare
  profile_row record;
  target_opportunity_id bigint;
  note_id bigint;
  valuation_id bigint;
  rg_id bigint;
  legacy_id bigint;
  immutable_blocked boolean := false;
begin
  select p.id, p.auth_id
  into profile_row
  from public.profiles p
  where coalesce(p.enabled, true)
    and p.auth_id is not null
    and exists (
      select 1
      from public.opportunities o
      where o.deleted_at is null
        and (
          lower(btrim(p.rol)) in ('admin', 'coordinador')
          or (
            lower(btrim(p.rol)) = 'comercial'
            and not p.can_manage_visits
            and (
              o.comercial_user_id = p.id
              or (
                o.comercial_user_id is null
                and lower(btrim(o.comercial_user_desc)) = lower(btrim(p.name))
              )
            )
          )
        )
    )
  order by
    case when lower(btrim(p.rol)) in ('admin', 'coordinador') then 0 else 1 end,
    p.id
  limit 1;

  if not found then
    raise exception 'No existe un perfil habilitado para probar eventos';
  end if;

  perform set_config('request.jwt.claim.sub', profile_row.auth_id::text, true);
  set local role authenticated;

  select id
  into target_opportunity_id
  from public.opportunities
  where public.crm_can_write_opportunity(id)
    and deleted_at is null
  order by id
  limit 1;

  if target_opportunity_id is null then
    raise exception 'No existe un lead escribible para probar eventos';
  end if;

  select public.crm_add_contact_activity(
    target_opportunity_id,
    'note',
    'Nota de prueba estructurada',
    '{}'::jsonb
  ) into note_id;

  if not exists (
    select 1
    from public.opportunity_activities
    where id = note_id
      and event_type = 'note'
      and actor_profile_id = profile_row.id
      and metadata ->> 'text' = 'Nota de prueba estructurada'
      and effective_at is not null
  ) then
    raise exception 'La nota no se guardó con su estructura completa';
  end if;

  select public.crm_save_valuation_with_activity(
    null,
    target_opportunity_id,
    jsonb_build_object(
      'fecha', (current_date + 1)::text,
      'hora', '10:30',
      'medio', 'Presencial'
    ),
    null
  ) into valuation_id;

  if not exists (
    select 1
    from public.opportunity_activities
    where id = valuation_id
      and event_type = 'valuation'
      and metadata ->> 'medio' = 'Presencial'
      and metadata ->> 'hora' = '10:30'
      and actor_profile_id = profile_row.id
  ) then
    raise exception 'La valoración no se guardó con metadatos estructurados';
  end if;

  perform public.crm_save_valuation_with_activity(
    valuation_id,
    target_opportunity_id,
    jsonb_build_object(
      'fecha', (current_date + 2)::text,
      'hora', '11:45',
      'medio', 'Videollamada'
    ),
    ': prueba de edición'
  );

  if not exists (
    select 1
    from public.opportunity_activities
    where id = valuation_id
      and event_type = 'valuation'
      and metadata ->> 'medio' = 'Videollamada'
  ) or not exists (
    select 1
    from public.opportunity_activities
    where parent_event_id = valuation_id
      and event_type = 'valuation_updated'
      and metadata ? 'before'
      and metadata ? 'after'
  ) then
    raise exception 'La edición de valoración no conservó su auditoría';
  end if;

  select public.crm_save_rg_with_activity(
    null,
    target_opportunity_id,
    jsonb_build_object(
      'fecha', current_date::text,
      'hora', '12:15',
      'medio', 'Teléfono',
      'resultado', 'Seguimiento',
      'notes', 'Volver a llamar'
    ),
    null
  ) into rg_id;

  perform public.crm_save_rg_with_activity(
    rg_id,
    target_opportunity_id,
    jsonb_build_object(
      'fecha', (current_date + 1)::text,
      'hora', '12:45',
      'medio', 'Teléfono',
      'resultado', 'Positiva',
      'notes', 'Acepta avanzar'
    ),
    ': prueba de edición'
  );

  if not exists (
    select 1
    from public.opportunity_activities
    where id = rg_id
      and event_type = 'rg'
      and metadata ->> 'resultado' = 'Positiva'
  ) or not exists (
    select 1
    from public.opportunity_activities
    where parent_event_id = rg_id
      and event_type = 'rg_updated'
      and metadata ? 'before'
      and metadata ? 'after'
  ) then
    raise exception 'La edición de R.G. no conservó su auditoría';
  end if;

  insert into public.opportunity_activities (
    opportunity_id,
    fecha,
    memo,
    resultado
  )
  values (
    target_opportunity_id,
    current_date,
    '[VALORACION] Compatibilidad: Medio: Presencial',
    true
  )
  returning id into legacy_id;

  if not exists (
    select 1
    from public.opportunity_activities
    where id = legacy_id
      and event_type = 'valuation'
      and actor_profile_id = profile_row.id
  ) then
    raise exception 'El trigger no clasificó una escritura antigua';
  end if;

  begin
    update public.opportunity_activities
    set memo = memo || ' alterada'
    where id = note_id;
  exception
    when sqlstate '22023' then
      immutable_blocked := true;
  end;

  if not immutable_blocked then
    raise exception 'Los eventos de auditoría no son inmutables';
  end if;

  if exists (
    select 1
    from public.opportunity_activities
    where event_type is null
      or metadata is null
      or updated_at is null
  ) then
    raise exception 'Existen actividades sin estructura obligatoria';
  end if;

  reset role;

  if exists (
    select 1
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'opportunity_activities'
      and policyname = 'contacts_insert_by_opportunity'
      and coalesce(with_check, '') ilike '%memo%'
  ) then
    raise exception 'La política de inserción todavía depende del texto del memo';
  end if;
end
$$;

select 'PASS: opportunity_activities usa tipos, metadatos, actor, auditoría y compatibilidad; todo revertido' as result;

rollback;
