begin;

alter table public.opportunity_buyers
  rename column buyer to assigned_profile_id;

update public.opportunity_buyers as visit
set assigned_profile_id = profile.id::text
from public.profiles as profile
where visit.assigned_profile_id is not null
  and nullif(btrim(visit.assigned_profile_id), '') is not null
  and lower(btrim(visit.assigned_profile_id)) = lower(btrim(profile.name));

update public.opportunity_buyers
set assigned_profile_id = null
where lower(btrim(assigned_profile_id)) = 'facu';

update public.opportunity_buyers
set assigned_profile_id = null
where nullif(btrim(assigned_profile_id), '') is null;

do $$
begin
  if exists (
    select 1
    from public.opportunity_buyers
    where assigned_profile_id is not null
      and btrim(assigned_profile_id) !~ '^[0-9]+$'
  ) then
    raise exception 'Some opportunity_buyers.assigned_profile_id values could not be mapped to profiles';
  end if;

  if exists (
    select 1
    from public.opportunity_buyers as visit
    where visit.assigned_profile_id is not null
      and not exists (
        select 1
        from public.profiles as profile
        where profile.id = btrim(visit.assigned_profile_id)::bigint
      )
  ) then
    raise exception 'Some opportunity_buyers.assigned_profile_id values do not reference an existing profile';
  end if;
end
$$;

alter table public.opportunity_buyers
  alter column assigned_profile_id type bigint
  using nullif(btrim(assigned_profile_id), '')::bigint;

alter table public.opportunity_buyers
  add constraint opportunity_buyers_assigned_profile_id_fkey
  foreign key (assigned_profile_id)
  references public.profiles(id)
  on delete set null;

notify pgrst, 'reload schema';

commit;