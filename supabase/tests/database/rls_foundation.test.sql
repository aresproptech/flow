begin;

select plan(55);

select ok(relrowsecurity, relname || ' tiene RLS activo')
from pg_catalog.pg_class
where oid = any (array[
  'public.profiles'::regclass,
  'public.opportunities'::regclass,
  'public.opportunity_activities'::regclass,
  'public.opportunity_orders'::regclass,
  'public.opportunity_buyers'::regclass
]);

select ok(
  not has_table_privilege('anon', relation_name, privilege_name),
  'anon no tiene ' || privilege_name || ' sobre ' || relation_name
)
from unnest(array[
  'public.profiles',
  'public.opportunities',
  'public.opportunity_activities',
  'public.opportunity_orders',
  'public.opportunity_buyers'
]) relation_name
cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) privilege_name;

select ok(
  not has_table_privilege('anon', 'public.crm_leads_view', 'SELECT'),
  'anon no puede leer crm_leads_view'
);

select ok(
  has_table_privilege('authenticated', relation_name, privilege_name),
  'authenticated tiene ' || privilege_name || ' sobre ' || relation_name
)
from unnest(array[
  'public.profiles',
  'public.opportunities',
  'public.opportunity_activities',
  'public.opportunity_orders',
  'public.opportunity_buyers'
]) relation_name
cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) privilege_name;

select ok(
  has_table_privilege('authenticated', 'public.crm_leads_view', 'SELECT'),
  'authenticated puede leer crm_leads_view'
);

select is(
  (
    select count(*)::integer
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = any (array[
        'profiles',
        'opportunities',
        'opportunity_activities',
        'opportunity_orders',
        'opportunity_buyers'
      ])
  ),
  20,
  'existen las 20 policies esperadas del CRM'
);

select is(
  (
    select count(*)::integer
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = any (array[
        'profiles',
        'opportunities',
        'opportunity_activities',
        'opportunity_orders',
        'opportunity_buyers'
      ])
      and ('anon' = any (roles) or 'public' = any (roles))
  ),
  0,
  'ninguna policy del CRM se aplica a anon o public'
);

select ok(
  coalesce(
    (
      select 'security_invoker=true' = any (reloptions)
      from pg_catalog.pg_class
      where oid = 'public.crm_leads_view'::regclass
    ),
    false
  ),
  'crm_leads_view usa security_invoker'
);

select ok(
  not has_function_privilege('anon', function_name, 'EXECUTE'),
  'anon no puede ejecutar ' || function_name
)
from unnest(array[
  'public.crm_current_role()',
  'public.crm_current_name()',
  'public.crm_is_visitador()',
  'public.crm_can_read_opportunity(bigint)',
  'public.crm_can_write_opportunity(bigint)'
]) function_name;

select * from finish();
rollback;
