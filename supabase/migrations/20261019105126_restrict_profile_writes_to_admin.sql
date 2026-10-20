begin;

drop policy if exists "profiles_insert_by_manager" on public.profiles;
drop policy if exists "profiles_update_by_manager" on public.profiles;
drop policy if exists "profiles_delete_by_manager" on public.profiles;

create policy "profiles_insert_by_admin"
	on public.profiles for insert to authenticated
	with check ((select public.crm_current_role()) = 'admin'::text);

create policy "profiles_update_by_admin"
	on public.profiles for update to authenticated
	using ((select public.crm_current_role()) = 'admin'::text)
	with check ((select public.crm_current_role()) = 'admin'::text);

create policy "profiles_delete_by_admin"
	on public.profiles for delete to authenticated
	using ((select public.crm_current_role()) = 'admin'::text);

revoke all on table public.profiles from anon, authenticated, appsheet_user;
grant select, insert, update, delete on table public.profiles to authenticated;
grant select on table public.profiles to appsheet_user;

revoke all on table public.opportunity_loader from anon, authenticated, appsheet_user;
grant select, insert on table public.opportunity_loader to authenticated;

commit;
