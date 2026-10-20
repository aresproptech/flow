begin;

select plan(34);

insert into auth.users (id, aud, role, email)
values
  ('a11ce000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'admin-settings-test@example.invalid'),
  ('a11ce000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'coordinator-settings-test@example.invalid');

insert into public.profiles (auth_id, rol, name, enabled)
values
  ('a11ce000-0000-4000-8000-000000000001', 'Admin', 'admin-settings-test', true),
  ('a11ce000-0000-4000-8000-000000000002', 'Coordinador', 'coordinator-settings-test', true);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.profiles'::regclass),
  'profiles mantiene RLS habilitado'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.opportunity_loader'::regclass),
  'opportunity_loader mantiene RLS habilitado'
);

select ok(not has_table_privilege('anon', 'public.profiles', 'SELECT'), 'anon no puede leer profiles');
select ok(not has_table_privilege('anon', 'public.profiles', 'INSERT'), 'anon no puede insertar profiles');
select ok(not has_table_privilege('anon', 'public.profiles', 'UPDATE'), 'anon no puede actualizar profiles');
select ok(not has_table_privilege('anon', 'public.profiles', 'DELETE'), 'anon no puede borrar profiles');
select ok(
  not has_table_privilege('anon', 'public.opportunity_loader', 'SELECT,INSERT,UPDATE,DELETE'),
  'anon no tiene acceso a opportunity_loader'
);

select ok(has_table_privilege('authenticated', 'public.profiles', 'SELECT'), 'authenticated conserva lectura de profiles');
select ok(has_table_privilege('authenticated', 'public.profiles', 'INSERT'), 'authenticated tiene grant de insert en profiles, limitado por RLS');
select ok(has_table_privilege('authenticated', 'public.profiles', 'UPDATE'), 'authenticated tiene grant de update en profiles, limitado por RLS');
select ok(has_table_privilege('authenticated', 'public.profiles', 'DELETE'), 'authenticated tiene grant de delete en profiles, limitado por RLS');
select ok(has_table_privilege('authenticated', 'public.opportunity_loader', 'SELECT'), 'authenticated tiene grant de lectura del loader, limitado por RLS');
select ok(has_table_privilege('authenticated', 'public.opportunity_loader', 'INSERT'), 'authenticated tiene grant de insert del loader, limitado por RLS');
select ok(not has_table_privilege('authenticated', 'public.opportunity_loader', 'UPDATE,DELETE'), 'authenticated no puede modificar ni borrar filas del loader');

select ok(has_table_privilege('appsheet_user', 'public.profiles', 'SELECT'), 'appsheet_user conserva lectura de profiles');
select ok(not has_table_privilege('appsheet_user', 'public.profiles', 'INSERT'), 'appsheet_user no puede insertar profiles');
select ok(not has_table_privilege('appsheet_user', 'public.profiles', 'UPDATE'), 'appsheet_user no puede actualizar profiles');
select ok(not has_table_privilege('appsheet_user', 'public.profiles', 'DELETE'), 'appsheet_user no puede borrar profiles');
select ok(not has_table_privilege('appsheet_user', 'public.opportunity_loader', 'SELECT,INSERT,UPDATE,DELETE'), 'appsheet_user no tiene acceso al loader');

select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'profiles'
      and policyname = 'profiles_select_by_role'
      and qual like '%auth_id%' and qual like '%admin%' and qual like '%coordinador%'
  ),
  'profiles conserva lectura propia y de admin/coordinador'
);
select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'profiles'
      and policyname = 'profiles_insert_by_admin' and cmd = 'INSERT'
      and roles::text = '{authenticated}' and with_check like '%admin%'
      and with_check not like '%coordinador%'
  ),
  'solo Admin puede insertar perfiles'
);
select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'profiles'
      and policyname = 'profiles_update_by_admin' and cmd = 'UPDATE'
      and roles::text = '{authenticated}' and qual like '%admin%'
      and with_check like '%admin%' and qual not like '%coordinador%'
      and with_check not like '%coordinador%'
  ),
  'solo Admin puede actualizar perfiles'
);
select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'profiles'
      and policyname = 'profiles_delete_by_admin' and cmd = 'DELETE'
      and roles::text = '{authenticated}' and qual like '%admin%'
      and qual not like '%coordinador%'
  ),
  'solo Admin puede borrar perfiles'
);
select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'opportunity_loader'
      and policyname = 'opportunity_loader_select_by_admin' and cmd = 'SELECT'
      and roles::text = '{authenticated}' and qual like '%admin%'
  ),
  'solo Admin puede leer opportunity_loader'
);
select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'opportunity_loader'
      and policyname = 'opportunity_loader_insert_by_admin' and cmd = 'INSERT'
      and roles::text = '{authenticated}' and with_check like '%admin%'
  ),
  'solo Admin puede insertar en opportunity_loader'
);
select ok(
  not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename in ('profiles', 'opportunity_loader')
      and ('anon' = any (roles) or 'public' = any (roles))
  ),
  'ninguna policy administrativa se aplica a anon o public'
);

select set_config('request.jwt.claim.sub', 'a11ce000-0000-4000-8000-000000000001', true);
set local role authenticated;
select results_eq(
  $$insert into public.profiles (name, rol, enabled) values ('admin-created-test', 'Comercial', true) returning name$$,
  $$values ('admin-created-test'::text)$$,
  'Admin puede crear perfiles'
);
select results_eq(
  $$update public.profiles set name = 'admin-updated-test' where name = 'admin-created-test' returning name$$,
  $$values ('admin-updated-test'::text)$$,
  'Admin puede actualizar perfiles'
);
select results_eq(
  $$delete from public.profiles where name = 'admin-updated-test' returning name$$,
  $$values ('admin-updated-test'::text)$$,
  'Admin puede borrar perfiles'
);
select results_eq(
  $$insert into public.opportunity_loader (id_external, nombre_del_lead) values ('admin-loader-test', 'Admin test') returning created_by$$,
  $$select id::text from public.profiles where auth_id = 'a11ce000-0000-4000-8000-000000000001'::uuid$$,
  'Admin carga opportunity_loader con profiles.id como created_by'
);
reset role;

select set_config('request.jwt.claim.sub', 'a11ce000-0000-4000-8000-000000000002', true);
set local role authenticated;
select throws_ok(
  $$insert into public.profiles (name, rol, enabled) values ('coordinator-created-test', 'Comercial', true)$$,
  '42501',
  null,
  'Coordinador no puede crear perfiles'
);
select is(
  (with changed as (update public.profiles set rol = 'Admin' where auth_id = 'a11ce000-0000-4000-8000-000000000002'::uuid returning id) select count(*)::integer from changed),
  0,
  'Coordinador no puede cambiar su propio rol'
);
select is(
  (with deleted as (delete from public.profiles where auth_id = 'a11ce000-0000-4000-8000-000000000002'::uuid returning id) select count(*)::integer from deleted),
  0,
  'Coordinador no puede borrar su perfil'
);
select throws_ok(
  $$insert into public.opportunity_loader (id_external, nombre_del_lead) values ('coordinator-loader-test', 'Coordinator test')$$,
  '42501',
  null,
  'Coordinador no puede insertar en opportunity_loader'
);
reset role;

select * from finish();
rollback;