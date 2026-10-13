create unique index if not exists idx_profiles_auth_id
  on public.profiles using btree (auth_id)
  where auth_id is not null;

alter policy "profiles_select_by_role"
  on public.profiles
  using (
    auth_id = (select auth.uid())
    or (
      (select public.crm_current_role())
      = any (array['admin'::text, 'coordinador'::text])
    )
  );

alter policy "opportunities_select_by_role"
  on public.opportunities
  using (
    deleted_at is null
    and (
      (select public.crm_current_role())
        = any (array['admin'::text, 'coordinador'::text])
      or (
        (select public.crm_current_role()) = 'comercial'::text
        and not (select public.crm_can_manage_visits())
        and responsible_user_id = (
          select public.crm_current_profile_id()
        )
      )
    )
  );