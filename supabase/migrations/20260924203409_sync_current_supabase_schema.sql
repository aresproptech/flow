begin;

-- Supabase already uses these current relation names. Keep a fresh local replay
-- compatible with the historical migrations that originally created the old names.
do $$
begin
  if to_regclass('public.opportunity_activities') is null
     and to_regclass('public.opportunity_contacts') is not null then
    alter table public.opportunity_contacts rename to opportunity_activities;
  end if;

  if to_regclass('public.opportunity_buyers') is null
     and to_regclass('public.visitas') is not null then
    alter table public.visitas rename to opportunity_buyers;
  end if;

  if to_regclass('public.opportunity_activities') is null then
    raise exception 'Missing required relation public.opportunity_activities';
  end if;

  if to_regclass('public.opportunity_buyers') is null then
    raise exception 'Missing required relation public.opportunity_buyers';
  end if;
end
$$;

-- Include the structured contact event introduced by the preceding migration,
-- while preserving every event type already accepted by the current database.
alter table public.opportunity_activities
  drop constraint if exists opportunity_contacts_event_type_check;

alter table public.opportunity_activities
  add constraint opportunity_contacts_event_type_check check (
    event_type = any (array[
      'legacy', 'activity', 'note', 'call', 'contact', 'valuation',
      'valuation_updated', 'rg', 'rg_updated', 'lead_created',
      'lead_imported', 'lead_updated', 'lead_deleted', 'phase_changed',
      'visit_created', 'visit_updated', 'order_created', 'order_updated',
      'document_uploaded', 'document_viewed'
    ]::text[])
  );

-- Recompile every affected public function against the current relation names.
-- pg_get_functiondef keeps signatures, defaults and security settings unchanged.
do $$
declare
  affected_function record;
  updated_definition text;
begin
  for affected_function in
    select p.oid
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and (
        position('public.opportunity_contacts' in p.prosrc) > 0
        or position('public.visitas' in p.prosrc) > 0
      )
  loop
    updated_definition := pg_get_functiondef(affected_function.oid);
    updated_definition := replace(
      updated_definition,
      'public.opportunity_contacts',
      'public.opportunity_activities'
    );
    updated_definition := replace(
      updated_definition,
      'public.visitas',
      'public.opportunity_buyers'
    );
    execute updated_definition;
  end loop;

  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and (
        position('public.opportunity_contacts' in p.prosrc) > 0
        or position('public.visitas' in p.prosrc) > 0
      )
  ) then
    raise exception 'Some public functions still reference removed CRM relations';
  end if;
end
$$;

commit;
