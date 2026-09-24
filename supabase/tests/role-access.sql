-- Prueba con las identidades reales, sin revelar sus datos ni conservar escrituras.
begin;
do $$
declare p record; expected bigint; actual bigint; affected bigint; target_id bigint; foreign_id bigint; checked integer := 0; profile_options bigint; expected_profile_options bigint; expected_visit_options bigint; expected_visits bigint;
begin
  select count(*) into expected_profile_options
  from public.profiles
  where coalesce(enabled, true) and nullif(btrim(name), '') is not null;

  for p in select id, auth_id, name, lower(btrim(rol)) rol, can_manage_visits from public.profiles where enabled and auth_id is not null loop
    target_id := null;
    foreign_id := null;
    select count(*) into expected from public.opportunities o where deleted_at is null and
      (p.rol in ('admin','coordinador') or (p.rol='comercial' and not p.can_manage_visits and
        (o.comercial_user_id=p.id
          or (o.comercial_user_id is null and lower(btrim(o.comercial_user_desc))=lower(btrim(p.name))))));
    select count(*) into expected_visit_options
    from public.opportunities o
    join public.phases phase on phase.id = o.fase_id
    where o.deleted_at is null
      and lower(btrim(phase.name)) = 'encargo'
      and (
        p.rol in ('admin', 'coordinador')
        or p.can_manage_visits
        or (
          p.rol = 'comercial'
          and not p.can_manage_visits
          and (
            o.comercial_user_id = p.id
            or (
              o.comercial_user_id is null
              and lower(btrim(o.comercial_user_desc)) = lower(btrim(p.name))
            )
          )
        )
      );
    select count(*) into expected_visits
    from public.opportunity_buyers v
    left join public.opportunities o on o.id = v.opportunity_id
    where p.can_manage_visits
      or (
        p.rol in ('admin', 'coordinador')
        and o.id is not null
        and o.deleted_at is null
      )
      or (
        p.rol = 'comercial'
        and not p.can_manage_visits
        and o.deleted_at is null
        and (
          o.comercial_user_id = p.id
          or (
            o.comercial_user_id is null
            and lower(btrim(o.comercial_user_desc)) = lower(btrim(p.name))
          )
        )
      );
    if p.rol='comercial' then
      select o.id into foreign_id
      from public.opportunities o
      where o.deleted_at is null
        and not (
          o.comercial_user_id=p.id
          or (o.comercial_user_id is null and lower(btrim(o.comercial_user_desc))=lower(btrim(p.name)))
        )
      limit 1;
    end if;
    perform set_config('request.jwt.claim.sub', p.auth_id::text, true);
    set local role authenticated;
    select count(*) into actual from public.crm_leads_view;
    if actual <> expected then raise exception 'Vista: esperado %, obtenido % para rol %', expected, actual, p.rol; end if;
    select count(*) into actual from public.crm_visit_property_options();
    if actual <> expected_visit_options then raise exception 'Inmuebles de visitas: esperado %, obtenido % para perfil %', expected_visit_options, actual, p.id; end if;
    select count(*) into actual from public.opportunity_buyers;
    if actual <> expected_visits then raise exception 'Visitas: esperado %, obtenido % para perfil %', expected_visits, actual, p.id; end if;
    select count(*) into profile_options from public.crm_profile_assignment_options();
    if profile_options <> expected_profile_options then
      raise exception 'Catalogo de perfiles incompleto para rol %', p.rol;
    end if;
    if p.rol='comercial' then
      update public.profiles set rol='Admin' where auth_id=p.auth_id;
      get diagnostics affected = row_count;
      if affected<>0 then raise exception 'Un comercial puede elevar su rol'; end if;
      update public.opportunities set memo=memo where id=foreign_id;
      get diagnostics affected = row_count;
      if affected<>0 then raise exception 'Un comercial puede editar leads ajenos'; end if;
    end if;
    select id into target_id from public.opportunities where public.crm_can_write_opportunity(id) limit 1;
    if target_id is not null then
      insert into public.opportunity_documentation_cases(opportunity_id,state) values (target_id,'{}')
        on conflict(opportunity_id) do update set updated_at=now();
      perform public.crm_soft_delete_leads(array[target_id]);
      if exists(select 1 from public.crm_leads_view where id=target_id) then
        raise exception 'El lead borrado sigue visible';
      end if;
    end if;
    reset role;
    checked := checked+1;
  end loop;
  if checked=0 then raise exception 'No se probaron usuarios'; end if;
end $$;
select 'PASS: acceso por ID, permiso explícito de visitas, aislamiento y bloqueo de escalada; todo revertido' result;
rollback;
