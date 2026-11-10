begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, aud, role, email)
select ('d15ca000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
       'authenticated', 'authenticated', 'discarded-rls-' || n || '@example.invalid'
from generate_series(1, 7) n;

insert into public.profiles (id, auth_id, name, rol, enabled, can_manage_visits)
select 910000 + n,
       ('d15ca000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
       'discarded-rls-' || n,
       (array['Admin', 'Coordinador', 'Comercial', 'Comercial', 'Comercial', 'Admin', 'Partner'])[n],
       n <> 6, n = 5
from generate_series(1, 7) n;

insert into public.phases (id, name)
values (910001, 'Encargo'), (910002, 'Identificada');

insert into public.opportunities (id, estado, responsible_user_id, fase_id, deleted_at)
select 920000 + n,
       (array['Activa', null, '', 'Desestimada', 'desestimada', ' DESESTIMADA ',
              'Desestimada', 'Activa', 'Desestimada', 'Activa'])[n],
       case when n in (8, 9) then 910004 else 910003 end,
       case when n = 10 then 910002 else 910001 end,
       case when n = 7 then now() else null end
from generate_series(1, 10) n;

insert into public.opportunity_buyers (opportunity_id, nombre_apellido)
select 920000 + n, 'discarded-visit-' || n from generate_series(1, 10) n;
insert into public.opportunity_orders (opportunity_id, memo)
select 920000 + n, 'discarded-order-' || n from generate_series(1, 10) n;
insert into public.opportunity_activities (opportunity_id, event_type, memo)
select 920000 + n, 'contact', 'discarded-contact-' || n from generate_series(1, 10) n;
insert into public.opportunity_documentation_cases (opportunity_id, state)
select 920000 + n, '{}'::jsonb from generate_series(1, 10) n;
insert into public.opportunity_documentation_files
  (id, opportunity_id, requirement_key, file_name, storage_path)
select ('d0c00000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
       920000 + n, 'test', 'test.pdf', (920000 + n)::text || '/test.pdf'
from generate_series(1, 10) n;

insert into storage.buckets (id, name, public)
values ('lead-documentation', 'lead-documentation', false)
on conflict (id) do nothing;
insert into storage.objects (bucket_id, name)
select 'lead-documentation', (920000 + n)::text || '/test.pdf'
from generate_series(1, 10) n;

select ok(
  (select 'security_invoker=true' = any(reloptions)
   from pg_class where oid = 'public.crm_leads_view'::regclass),
  'crm_leads_view conserva security_invoker'
);
select ok(
  not has_function_privilege('anon', 'public.crm_can_read_visit_opportunity(bigint)', 'execute'),
  'el nuevo helper de visitas no se expone a anon'
);

create function pg_temp.check_discarded_access()
returns setof text language plpgsql as $$
declare
  role_index integer;
  n integer;
  target bigint;
  readable boolean;
  visit_readable boolean;
  discarded boolean;
  deleted boolean;
  assigned boolean;
  role_label text;
  relation_name text;
  affected integer;
begin
  for role_index in 1..7 loop
    role_label := (array['admin', 'coordinador', 'comercial propio', 'comercial ajeno',
                         'solo visitas', 'admin deshabilitado', 'partner'])[role_index];
    perform set_config('request.jwt.claim.sub',
      'd15ca000-0000-4000-8000-' || lpad(role_index::text, 12, '0'), true);
    set local role authenticated;
    for n in 1..10 loop
      target := 920000 + n;
      discarded := n in (4, 5, 6, 7, 9);
      deleted := n = 7;
      assigned := (role_index = 3 and n not in (8, 9)) or (role_index = 4 and n in (8, 9));
      readable := not deleted and (
        role_index = 1 or (not discarded and (role_index = 2 or assigned))
      );
      visit_readable := not deleted and (
        role_index = 1 or (not discarded and (role_index in (2, 5) or assigned))
      );
      return next is(
        (select exists(select 1 from public.opportunities where id = target)),
        readable, role_label || ': SELECT oportunidad ' || n
      );
      return next is(
        (select exists(select 1 from public.crm_leads_view where id = target)),
        readable, role_label || ': vista invoker ' || n
      );
      return next is(public.crm_can_read_opportunity(target), readable,
        role_label || ': helper lectura ' || n);
      return next is(public.crm_can_write_opportunity(target), readable,
        role_label || ': helper escritura ' || n);
      return next is(public.crm_can_read_visit_opportunity(target), visit_readable,
        role_label || ': helper lectura visitas ' || n);
      return next is(public.crm_can_create_visit_for_opportunity(target), visit_readable and n <> 10,
        role_label || ': helper crear visita ' || n);
      if role_index <> 6 then
        return next is(
          (select exists(select 1 from public.crm_visit_property_options() where id = target)),
          visit_readable and n <> 10, role_label || ': selector visitas ' || n
        );
      else
        return next throws_ok('select * from public.crm_visit_property_options()', '42501', null,
          role_label || ': selector deniega perfil inactivo ' || n);
      end if;
      return next is(
        (select exists(select 1 from public.opportunity_buyers where opportunity_id = target)),
        visit_readable, role_label || ': lectura visitas ' || n
      );
      foreach relation_name in array array['opportunity_orders', 'opportunity_activities',
          'opportunity_documentation_cases', 'opportunity_documentation_files'] loop
        execute format('select exists(select 1 from public.%I where opportunity_id = $1)', relation_name)
          into assigned using target;
        return next is(assigned, readable, role_label || ': ' || relation_name || ' ' || n);
      end loop;
      return next is(
        (select exists(select 1 from storage.objects
         where bucket_id = 'lead-documentation' and name = target::text || '/test.pdf')),
        readable, role_label || ': descarga Storage ' || n
      );
      update public.opportunities set memo = 'test' where id = target;
      get diagnostics affected = row_count;
      return next is(affected, case when readable then 1 else 0 end,
        role_label || ': UPDATE fila existente ' || n);
      if not readable then
        update public.opportunities set estado = 'Activa' where id = target;
        get diagnostics affected = row_count;
        return next is(affected, 0, role_label || ': no recupera fila oculta ' || n);
        return next throws_ok(format(
          'select public.crm_record_document_view(%L::uuid)',
          'd0c00000-0000-4000-8000-' || lpad(n::text, 12, '0')),
          '42501', null, role_label || ': RPC abrir documento denegada ' || n);
      else
        return next is(public.crm_record_document_view(
          ('d0c00000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid),
          target::text || '/test.pdf', role_label || ': RPC documento permitida ' || n);
      end if;
    end loop;
    reset role;
  end loop;
end;
$$;
select * from pg_temp.check_discarded_access();

create function pg_temp.check_discarded_mutations()
returns setof text language plpgsql as $mutation_tests$
declare
  role_index integer;
  state_value text;
  target bigint;
  role_label text;
  sql_command text;
  child_table text;
  affected integer;
begin
  for role_index in 1..5 loop
    role_label := (array['admin','coordinador','comercial propio','comercial ajeno','solo visitas'])[role_index];
    target := case when role_index = 4 then 920008 else 920001 end;
    perform set_config('request.jwt.claim.sub',
      'd15ca000-0000-4000-8000-' || lpad(role_index::text, 12, '0'), true);
    set local role authenticated;
    foreach state_value in array array['Desestimada', 'desestimada', ' DESESTIMADA '] loop
      sql_command := format('insert into public.opportunities (estado, responsible_user_id) values (%L, %s)',
        state_value, 910000 + role_index);
      if role_index = 1 then
        return next lives_ok(sql_command, role_label || ': INSERT ' || state_value);
        return next lives_ok(format('update public.opportunities set estado = %L where id = %s',
          state_value, target), role_label || ': transicion a ' || state_value);
        return next lives_ok(format('update public.opportunities set estado = %L where id = %s',
          'Activa', target), role_label || ': recupera desestimada');
      else
        return next throws_ok(sql_command, '42501', null, role_label || ': INSERT denegado ' || state_value);
        if role_index <> 5 then
          return next throws_ok(format('update public.opportunities set estado = %L where id = %s',
            state_value, target), '42501', null, role_label || ': transicion denegada ' || state_value);
        end if;
      end if;
    end loop;
    if role_index <> 5 then
      foreach state_value in array array['Activa', null, ''] loop
        return next lives_ok(format('insert into public.opportunities (estado, responsible_user_id) values (%L, %s)',
          state_value, 910000 + role_index), role_label || ': INSERT estado permitido ' || coalesce(state_value, 'NULL'));
        return next lives_ok(format('update public.opportunities set estado = %L where id = %s',
          state_value, target), role_label || ': UPDATE estado permitido ' || coalesce(state_value, 'NULL'));
      end loop;
    end if;
    if role_index in (2, 3, 4, 5) then
      foreach child_table in array array['opportunity_orders', 'opportunity_activities',
          'opportunity_documentation_cases', 'opportunity_buyers'] loop
        sql_command := case child_table
          when 'opportunity_activities' then 'insert into public.opportunity_activities (opportunity_id, event_type) values (920004, ''contact'')'
          when 'opportunity_documentation_cases' then 'insert into public.opportunity_documentation_cases (opportunity_id, state) values (920004, ''{}'') on conflict (opportunity_id) do update set state = excluded.state'
          else format('insert into public.%I (opportunity_id) values (920004)', child_table) end;
        return next throws_ok(sql_command, '42501', null, role_label || ': INSERT relacionado denegado ' || child_table);
        if role_index <> 5 then
          return next throws_ok(format('update public.%I set opportunity_id = 920004 where opportunity_id = %s',
            child_table, target), '42501', null, role_label || ': mover hijo a desestimada ' || child_table);
        end if;
      end loop;
      return next throws_ok(
        $$insert into storage.objects (bucket_id, name) values ('lead-documentation', '920004/blocked.pdf')$$,
        '42501', null, role_label || ': subida Storage denegada');
      return next throws_ok(
        $$select public.crm_register_document_upload(920004,
          '{"requirement_key":"test","file_name":"test.pdf","storage_path":"920004/test.pdf","mime_type":"application/pdf","file_size":100}'::jsonb)$$,
        '42501', null, role_label || ': RPC registro documento denegada');
      return next throws_ok('select public.crm_soft_delete_leads(array[920004]::bigint[])',
        '42501', null, role_label || ': RPC borrado logico denegada');
    end if;
    if role_index = 5 then
      return next throws_ok(
        'update public.opportunity_buyers set opportunity_id = 920004 where opportunity_id = 920001',
        '42501', null, 'solo visitas no mueve visita a oportunidad desestimada');
      return next lives_ok('insert into public.opportunity_buyers (opportunity_id) values (920001)',
        'solo visitas conserva creacion para Encargo permitido');
      return next throws_ok('insert into public.opportunity_buyers (opportunity_id) values (920010)',
        '42501', null, 'solo visitas no crea visita fuera de Encargo');
      update public.opportunity_buyers set resultado = 'blocked' where opportunity_id = 920004;
      get diagnostics affected = row_count;
      return next is(affected, 0, 'solo visitas no modifica visita desestimada');
      delete from public.opportunity_buyers where opportunity_id = 920004;
      get diagnostics affected = row_count;
      return next is(affected, 0, 'solo visitas no elimina visita desestimada');
    end if;
    reset role;
  end loop;
end;
$mutation_tests$;
select * from pg_temp.check_discarded_mutations();

select set_config('request.jwt.claim.sub', '', true);
set local role anon;
select is((select count(*) from public.opportunities), 0::bigint,
  'anon no puede consultar oportunidades');
select throws_ok('select public.crm_can_read_visit_opportunity(920004)', '42501', null,
  'anon no puede invocar el nuevo helper');
reset role;

select * from finish();
rollback;
