begin;

create table public.opportunity_loader (
	id text,
	nombre_del_lead text,
	compania text,
	contacto_principal text,
	compania_del_lead text,
	responsable text,
	estatus_del_lead text,
	embudo_de_ventas text,
	presupuesto text,
	fecha_de_creacion text,
	creado_por text,
	ultima_modificacion_el text,
	modificado_por text,
	etiquetas_del_lead text,
	tareas_proximas text,
	cerrado_el text,
	fecha text,
	catastro text,
	origen text,
	intencion text,
	ubicacion text,
	tipo text,
	domicilio text,
	complemento text,
	codigo_postal text,
	metros text,
	reforma text,
	objetivo text,
	utm_content text,
	utm_medium text,
	utm_campaign text,
	utm_source text,
	utm_term text,
	utm_referrer text,
	referrer text,
	gclientid text,
	gclid text,
	fbclid text,
	cargo_contacto text,
	correo_contacto text,
	email_priv_contacto text,
	otro_email_contacto text,
	telefono_oficina_contacto text,
	telefono_oficina_directo_contacto text,
	telefono_celular_contacto text,
	fax_contacto text,
	telefono_de_casa_contacto text,
	otro_telefono_contacto text,
	terminos_y_condiciones_contacto text,
	nota_1 text,
	nota_2 text,
	nota_3 text,
	nota_4 text,
	nota_5 text
);

alter table public.opportunity_loader enable row level security;
create policy opportunity_loader_select_by_admin
	on public.opportunity_loader for select to authenticated
	using ((select public.crm_current_role()) = 'admin'::text);
create policy opportunity_loader_insert_by_admin
	on public.opportunity_loader for insert to authenticated
	with check ((select public.crm_current_role()) = 'admin'::text);
revoke all on table public.opportunity_loader from anon, authenticated;
grant insert, select on table public.opportunity_loader to authenticated;
grant all on table public.opportunity_loader to postgres, service_role;

commit;
