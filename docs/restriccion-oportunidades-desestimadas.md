# Oportunidades desestimadas: acceso exclusivo de Admin

## Alcance

Las oportunidades cuyo `lower(btrim(coalesce(estado, '')))` es `desestimada`
solo son accesibles a Admin, siempre respetando `deleted_at`.
Coordinador y Comercial no pueden leerlas, recuperarlas, modificarlas,
crearlas ni transformar otra oportunidad en desestimada.
`NULL`, cadena vacia y otros estados conservan los permisos anteriores.

La restriccion se aplica en:

- Policies SELECT, INSERT y UPDATE de `opportunities`.
- `crm_can_read_opportunity` y `crm_can_write_opportunity`, incluidos sus
  consumidores en encargos, contactos/actividades, documentacion y Storage.
- Visitas, mediante `crm_can_read_visit_opportunity`: mantiene la excepcion de
  gestion de visitas, pero exige un padre activo y no desestimado salvo Admin.
- `crm_can_create_visit_for_opportunity` y `crm_visit_property_options`:
  conservan el requisito de fase Encargo y bloquean padres desestimados.

La policy UPDATE conserva `USING` para la fila anterior y comprueba directamente
el nuevo estado y responsable en `WITH CHECK`. No depende de una consulta STABLE
por ID para validar los valores propuestos.
`crm_can_manage_visits` no cambia: sigue siendo una capacidad del perfil.
No se amplian permisos de rol, asignacion, perfiles deshabilitados o borrados.
Las visitas de padres borrados tampoco quedan accesibles mediante la excepcion.
`crm_leads_view` conserva `security_invoker = true`.

## Migracion local generada

`supabase/migrations/20261110114249_restrict_discarded_opportunities_to_admin.sql`
se genero mediante `npx supabase db schema declarative sync --no-apply`.
Contiene seis sustituciones de policies, cuatro funciones existentes y un nuevo
helper de lectura de visitas. No cambia tablas, datos ni migraciones anteriores.

La ejecucion desde el repositorio falla al reconstruir la primera migracion
historica: requiere `public.profiles` y otras relaciones anteriores al historial.
Para generar y probar el delta se uso un proyecto temporal aislado:

1. Baseline generado desde las definiciones de `supabase/schemas` del HEAD previo.
2. Aplicacion de las definiciones modificadas al mismo proyecto temporal.
3. Generacion del delta con `sync --no-apply --name restrict_discarded_opportunities_to_admin`.
4. Revision manual del SQL y ejecucion exclusivamente en PostgreSQL local aislado.

Solo en esa copia temporal se omitieron las sentencias de grants de
`appsheet_user`, un rol externo no declarado en el arbol. Los grants del
repositorio no se modificaron. Se mantuvo una declaracion de rol de prueba para
reproducir el baseline local.

La revision detecto que el generador heredaba EXECUTE para `anon` en el nuevo
helper por privilegios predeterminados. La migracion revisada y la declaracion
revocan explicitamente ese permiso. El helper usa `SECURITY DEFINER`,
`search_path = ''` y solo concede EXECUTE a authenticated, postgres y service_role.

Esto no repara el bootstrap historico del repositorio. Antes de desplegar debe
validarse el delta contra el esquema real del entorno de destino mediante el
proceso habitual de revision. No se ejecuto `db push` ni se modifico produccion.

## Pruebas

`supabase/tests/database/discarded_opportunities_rls.test.sql` usa pgTAP,
identidades sinteticas y una transaccion con rollback. Comprueba:

- Admin, Coordinador, Comerciales asignados/no asignados, solo visitas,
  Admin deshabilitado, Partner y anon.
- Estados normales, NULL, vacios, variantes de Desestimada y filas borradas.
- SELECT, UPDATE, INSERT, transiciones de estado y recuperacion de filas ocultas.
- Vista invoker, helpers, selector de inmuebles y visitas fuera de Encargo.
- Encargos, actividades, expedientes, metadatos de documentos y Storage.
- RPCs de apertura/registro de documentos y borrado logico.
- Creacion y reasignacion de datos relacionados a padres desestimados.

El script `supabase/tests/role-access.sql` conserva su prueba con identidades
existentes y actualiza los resultados esperados a la nueva restriccion.

### Resultado de validacion local

- 1204 aserciones pgTAP de la nueva suite: correctas.
- `role-access.sql`, ejecutado con las identidades sinteticas: correcto.
- Migracion aplicada al baseline local aislado y nueva ejecucion de
  `sync --no-apply`: `No schema changes found`.
- `git diff --check`: correcto.
- La suite adicional existente `admin_settings_rls.test.sql` no completa:
  contiene CTEs de escritura dentro de expresiones que PostgreSQL rechaza
  y expectativas de grants del loader incompatibles con los privilegios
  heredados del baseline generado. Su expectativa de lectura de appsheet
  tampoco aplica a esta copia, donde esos grants se omitieron expresamente.
  Esos archivos y permisos ajenos a oportunidades no se modificaron.

No se ejecutaron TypeScript, lint de frontend ni build: el cambio afecta
unicamente definiciones SQL, pruebas de base de datos y esta documentacion.
