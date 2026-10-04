begin;

alter table public.opportunities
  rename column team_id to domain_id;

alter table public.opportunities
  rename constraint opportunities_team_id_fkey to opportunities_domain_id_fkey;

alter view public.crm_leads_view
  rename column team_id to domain_id;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'opportunities'
      and column_name = 'team_id'
  ) then
    raise exception 'opportunities.team_id still exists';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'opportunities'
      and column_name = 'domain_id'
  ) then
    raise exception 'opportunities.domain_id was not created';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'crm_leads_view'
      and column_name = 'team_id'
  ) then
    raise exception 'crm_leads_view.team_id still exists';
  end if;
end
$$;

commit;
