-- Prueba el permiso explícito de gestión de visitas. No conserva escrituras.
begin;

do $$
declare
  visit_manager record;
  target_opportunity_id bigint;
  non_order_opportunity_id bigint;
  target_phase_id bigint;
  saved_visit_id bigint;
  history_before bigint;
  blocked boolean := false;
begin
  select p.id, p.auth_id, p.name, lower(btrim(p.rol)) as role_name
  into visit_manager
  from public.profiles p
  where coalesce(p.enabled, true)
    and p.auth_id is not null
    and p.can_manage_visits
  order by p.id
  limit 1;

  if not found then
    raise exception 'No existe un perfil habilitado con permiso para gestionar visitas';
  end if;

  if visit_manager.role_name <> 'comercial' then
    raise exception 'El gestor de visitas debe conservar el rol Comercial';
  end if;

  select phase.id
  into target_phase_id
  from public.phases phase
  where coalesce(phase.enabled, true)
  order by phase.id
  limit 1;

  perform set_config('request.jwt.claim.sub', visit_manager.auth_id::text, true);
  set local role authenticated;

  if not public.crm_can_manage_visits() then
    raise exception 'El permiso explícito no se resolvió para el perfil configurado';
  end if;

  if (select count(*) from public.crm_leads_view) <> 0 then
    raise exception 'El gestor de visitas puede leer Oportunidades';
  end if;

  if exists (
    select 1 from public.opportunities o where public.crm_can_read_opportunity(o.id)
  ) then
    raise exception 'El gestor de visitas conserva acceso general a leads';
  end if;

  if (select count(*) from public.opportunity_activities) <> 0
    or (select count(*) from public.opportunity_orders) <> 0
    or (select count(*) from public.opportunity_documentation_files) <> 0 then
    raise exception 'El gestor de visitas puede leer datos de flujos comerciales';
  end if;

  select option_row.id
  into target_opportunity_id
  from public.crm_visit_property_options() option_row
  order by option_row.id
  limit 1;

  if target_opportunity_id is null then
    raise exception 'La consulta segura no devolvió inmuebles en Encargo';
  end if;

  reset role;
  select o.id
  into non_order_opportunity_id
  from public.opportunities o
  join public.phases phase on phase.id = o.fase_id
  where o.deleted_at is null
    and lower(btrim(phase.name)) <> 'encargo'
  order by o.id
  limit 1;

  if non_order_opportunity_id is null then
    select phase.id
    into target_phase_id
    from public.phases phase
    where lower(btrim(phase.name)) <> 'encargo'
    order by phase.id
    limit 1;

    if target_phase_id is null then
      raise exception 'No existe una fase distinta de Encargo para probar el límite';
    end if;

    insert into public.opportunities (propietario, fase_id)
    values ('Lead temporal sin Encargo', target_phase_id)
    returning id into non_order_opportunity_id;
  end if;

  set local role authenticated;
  if public.crm_can_create_visit_for_opportunity(non_order_opportunity_id) then
    raise exception 'El gestor puede crear visitas fuera de la fase Encargo';
  end if;

  blocked := false;
  begin
    perform public.crm_save_visit_with_activity(
      null,
      non_order_opportunity_id,
      jsonb_build_object(
        'fecha_visita', current_date::text,
        'hora', '09:00',
        'buyer', visit_manager.name,
        'nombre_apellido', 'Visita no autorizada'
      ),
      null
    );
  exception
    when insufficient_privilege then
      blocked := true;
  end;

  if not blocked then
    raise exception 'El RPC permitió crear una visita fuera de Encargo';
  end if;

  blocked := false;
  begin
    insert into public.opportunity_buyers (opportunity_id, created_by)
    values (non_order_opportunity_id, visit_manager.name);
  exception
    when insufficient_privilege then
      blocked := true;
  end;

  if not blocked then
    raise exception 'La política RLS permitió insertar una visita fuera de Encargo';
  end if;

  reset role;
  select count(*)
  into history_before
  from public.opportunity_activities
  where opportunity_id = target_opportunity_id;

  set local role authenticated;
  select public.crm_save_visit_with_activity(
    null,
    target_opportunity_id,
    jsonb_build_object(
      'fecha_visita', current_date::text,
      'hora', '10:00',
      'buyer', visit_manager.name,
      'nombre_apellido', 'Comprador de prueba',
      'telefono', '600000000',
      'vende', false
    ),
    null
  ) into saved_visit_id;

  if not exists (
    select 1
    from public.opportunity_buyers
    where id = saved_visit_id
      and opportunity_id = target_opportunity_id
  ) then
    raise exception 'El gestor no pudo crear una visita autorizada';
  end if;

  perform public.crm_save_visit_with_activity(
    saved_visit_id,
    target_opportunity_id,
    jsonb_build_object(
      'fecha_visita', (current_date + 1)::text,
      'hora', '11:00',
      'buyer', visit_manager.name,
      'nombre_apellido', 'Comprador de prueba',
      'telefono', '600000000',
      'vende', true
    ),
    ': prueba de edición'
  );

  reset role;
  if (
    select count(*)
    from public.opportunity_activities
    where opportunity_id = target_opportunity_id
  ) <> history_before + 2 then
    raise exception 'Crear y editar la visita no generó exactamente dos eventos';
  end if;

  if not exists (
    select 1
    from public.opportunity_activities
    where opportunity_id = target_opportunity_id
      and event_type = 'visit_created'
      and actor_profile_id = visit_manager.id
      and metadata ->> 'visit_id' = saved_visit_id::text
  ) or not exists (
    select 1
    from public.opportunity_activities
    where opportunity_id = target_opportunity_id
      and event_type = 'visit_updated'
      and actor_profile_id = visit_manager.id
      and metadata ->> 'visit_id' = saved_visit_id::text
  ) then
    raise exception 'La actividad de visita no conserva el autor real';
  end if;

  set local role authenticated;
  blocked := false;
  begin
    perform public.crm_create_lead_with_activity(
      jsonb_build_object(
        'propietario', 'Lead no autorizado del gestor de visitas',
        'fase_id', target_phase_id,
        'comercial_user_id', visit_manager.id,
        'comercial_user_desc', visit_manager.name
      ),
      'lead_created'
    );
  exception
    when insufficient_privilege then
      blocked := true;
  end;

  if not blocked then
    raise exception 'El gestor de visitas pudo crear un lead comercial';
  end if;

  reset role;
end
$$;

select 'PASS: gestor ve cero oportunidades y sólo crea Visitas en Encargo; todo revertido' as result;

rollback;
