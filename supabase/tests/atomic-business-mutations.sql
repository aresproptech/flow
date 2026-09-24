-- Prueba transaccional de las RPC de Fase 2. No conserva escrituras.
begin;

do $$
declare
  profile_row record;
  writable_opportunity_id bigint;
  readable_opportunity_id bigint;
  current_phase_id bigint;
  target_phase_id bigint;
  saved_visit_id bigint;
  saved_order_id bigint;
  history_count bigint;
  checked_visits integer := 0;
  checked_writes integer := 0;
begin
  for profile_row in
    select auth_id, lower(btrim(rol)) as role_name
    from public.profiles
    where coalesce(enabled, true)
      and auth_id is not null
  loop
    perform set_config('request.jwt.claim.sub', profile_row.auth_id::text, true);
    set local role authenticated;

    select id
    into readable_opportunity_id
    from public.crm_visit_property_options()
    order by id
    limit 1;

    if readable_opportunity_id is not null then
      reset role;
      select count(*)
      into history_count
      from public.opportunity_activities
      where opportunity_id = readable_opportunity_id;

      set local role authenticated;
      select public.crm_save_visit_with_activity(
        null,
        readable_opportunity_id,
        jsonb_build_object(
          'fecha_visita', current_date::text,
          'hora', '10:00',
          'buyer', 'Prueba transaccional',
          'vende', false
        ),
        null
      ) into saved_visit_id;

      if not exists (
        select 1 from public.opportunity_buyers where id = saved_visit_id
      ) then
        raise exception 'La RPC no creó la visita para el rol %', profile_row.role_name;
      end if;

      reset role;
      if (
        select count(*)
        from public.opportunity_activities
        where opportunity_id = readable_opportunity_id
      ) <> history_count + 1 then
        raise exception 'La visita no creó exactamente una línea de historial';
      end if;

      set local role authenticated;
      perform public.crm_save_visit_with_activity(
        saved_visit_id,
        readable_opportunity_id,
        jsonb_build_object(
          'fecha_visita', current_date::text,
          'hora', '11:00',
          'buyer', 'Prueba transaccional',
          'vende', true
        ),
        ': prueba de edición'
      );

      reset role;
      if (
        select count(*)
        from public.opportunity_activities
        where opportunity_id = readable_opportunity_id
      ) <> history_count + 2 then
        raise exception 'La edición de visita no creó exactamente una línea de historial';
      end if;

      checked_visits := checked_visits + 1;
    end if;

    set local role authenticated;
    select id
    into writable_opportunity_id
    from public.opportunities
    where public.crm_can_write_opportunity(id)
    order by id
    limit 1;

    if writable_opportunity_id is not null then
      select fase_id
      into current_phase_id
      from public.opportunities
      where id = writable_opportunity_id;

      select id
      into target_phase_id
      from public.phases
      where coalesce(enabled, true)
        and id is distinct from current_phase_id
      order by id
      limit 1;

      if target_phase_id is not null then
        select count(*)
        into history_count
        from public.opportunity_activities
        where opportunity_id = writable_opportunity_id;

        perform public.crm_change_lead_phase_with_activity(
          writable_opportunity_id,
          target_phase_id
        );

        if not exists (
          select 1
          from public.opportunities
          where id = writable_opportunity_id
            and fase_id = target_phase_id
        ) then
          raise exception 'La RPC no actualizó la fase para el rol %', profile_row.role_name;
        end if;

        if (
          select count(*)
          from public.opportunity_activities
          where opportunity_id = writable_opportunity_id
        ) <> history_count + 1 then
          raise exception 'El cambio de fase no creó exactamente una línea de historial';
        end if;
      end if;

      select count(*)
      into history_count
      from public.opportunity_activities
      where opportunity_id = writable_opportunity_id;

      select public.crm_save_order_with_activity(
        null,
        writable_opportunity_id,
        jsonb_build_object(
          'fecha_inicio', current_date::text,
          'pvp_inicial', 100000,
          'pvp_actual', 100000,
          'rebajas', 0
        ),
        null
      ) into saved_order_id;

      if not exists (
        select 1 from public.opportunity_orders where id = saved_order_id
      ) then
        raise exception 'La RPC no creó el encargo para el rol %', profile_row.role_name;
      end if;

      if (
        select count(*)
        from public.opportunity_activities
        where opportunity_id = writable_opportunity_id
      ) <> history_count + 1 then
        raise exception 'El encargo no creó exactamente una línea de historial';
      end if;

      perform public.crm_save_order_with_activity(
        saved_order_id,
        writable_opportunity_id,
        jsonb_build_object(
          'fecha_inicio', current_date::text,
          'pvp_inicial', 100000,
          'pvp_actual', 95000,
          'rebajas', 1
        ),
        ': prueba de edición'
      );

      if (
        select count(*)
        from public.opportunity_activities
        where opportunity_id = writable_opportunity_id
      ) <> history_count + 2 then
        raise exception 'La edición de encargo no creó exactamente una línea de historial';
      end if;

      checked_writes := checked_writes + 1;
    end if;

    reset role;
  end loop;

  if checked_visits = 0 then
    raise exception 'No se pudo probar ninguna visita';
  end if;

  if checked_writes = 0 then
    raise exception 'No se pudo probar ningún encargo/cambio de fase';
  end if;
end
$$;

select 'PASS: visitas, encargos y cambios de fase guardan el historial en la misma transacción; todo revertido' as result;

rollback;
