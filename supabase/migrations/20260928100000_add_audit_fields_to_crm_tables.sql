-- Add missing audit columns to the current CRM tables.
-- Existing columns and types are preserved to avoid changing historical data.
do $$
declare
  table_name text;
  table_names text[] := array[
    'domain',
    'lookups',
    'opportunities',
    'opportunity_activities',
    'opportunity_buyers',
    'opportunity_documentation_cases',
    'opportunity_documentation_files',
    'opportunity_orders',
    'phases',
    'postal',
    'profiles',
    'sources'
  ];
begin
  foreach table_name in array table_names loop
    execute format(
      'alter table public.%I add column if not exists created_at timestamptz not null default now()',
      table_name
    );
    execute format(
      'alter table public.%I add column if not exists updated_at timestamptz default now()',
      table_name
    );
    execute format(
      'alter table public.%I add column if not exists deleted_at timestamptz',
      table_name
    );
    execute format(
      'alter table public.%I add column if not exists created_by bigint',
      table_name
    );
    execute format(
      'alter table public.%I add column if not exists updated_by bigint',
      table_name
    );
    execute format(
      'alter table public.%I add column if not exists deleted_by bigint',
      table_name
    );
  end loop;
end
$$;
