do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'opportunity_activities_created_by_fkey'
      and conrelid = 'public.opportunity_activities'::regclass
  ) then
    alter table public.opportunity_activities
      add constraint opportunity_activities_created_by_fkey
      foreign key (created_by) references public.profiles(id) on delete set null;
  end if;
end
$$;