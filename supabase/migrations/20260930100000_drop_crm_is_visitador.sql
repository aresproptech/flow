drop policy if exists opportunities_insert_by_role on public.opportunities;
create policy opportunities_insert_by_role
on public.opportunities for insert to authenticated
with check (
	public.crm_current_role() in ('admin', 'coordinador')
	or (
		public.crm_current_role() = 'comercial'
		and not public.crm_can_manage_visits()
		and (
			(comercial_user_id is not null
				and comercial_user_id = public.crm_current_profile_id())
			or
			(comercial_user_id is null
				and lower(btrim(coalesce(comercial_user_desc, ''))) =
						lower(btrim(coalesce(public.crm_current_name(), ''))))
		)
	)
);

drop policy if exists opportunities_update_by_role on public.opportunities;
create policy opportunities_update_by_role
on public.opportunities for update to authenticated
using (public.crm_can_write_opportunity(id))
with check (
	public.crm_current_role() in ('admin', 'coordinador')
	or (
		public.crm_current_role() = 'comercial'
		and not public.crm_can_manage_visits()
		and (
			(comercial_user_id is not null
				and comercial_user_id = public.crm_current_profile_id())
			or
			(comercial_user_id is null
				and lower(btrim(coalesce(comercial_user_desc, ''))) =
						lower(btrim(coalesce(public.crm_current_name(), ''))))
		)
	)
);

drop function if exists public.crm_is_visitador();