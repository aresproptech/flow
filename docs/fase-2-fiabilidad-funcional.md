# Fase 2 — fiabilidad funcional

Actualizado: 14 de septiembre de 2026. Proyecto de prueba: `rzgedcknhcoprcpdtrki`.

## Objetivo

Evitar que una acción parezca guardada cuando Supabase la rechazó, conservar los
datos del formulario ante un fallo y hacer visibles los errores operativos.

## Bloques aplicados

### Creación de leads

- El formulario espera ahora la respuesta real de Supabase.
- Mientras guarda, bloquea el cierre y los envíos duplicados.
- Si la creación falla, conserva todos los campos, mantiene abierto el diálogo y
  muestra el error dentro del propio formulario.
- Sólo limpia y cierra después de una inserción correcta.

### Importación CSV

- Los tres botones capaces de confirmar la importación comparten un único estado
  de ejecución y no pueden disparar importaciones simultáneas.
- El diálogo espera a que finalice la inserción, no se puede cerrar durante el
  proceso y permanece abierto con el CSV intacto si Supabase devuelve un error.
- El resultado de la persistencia se devuelve explícitamente al diálogo en lugar
  de depender de un error que sólo aparecía en la consola.
- La importación completa se ejecuta ahora con
  `crm_import_leads_with_activity`: si falla una sola fila, PostgreSQL revierte
  todo el archivo, incluidos los eventos de historial ya creados.
- Las fechas de contacto, valoración y hora del CSV se conservan en la nueva
  operación; antes se validaban en el frontend pero no se enviaban a la tabla.

### Leads e historial atómicos

- El alta manual usa `crm_create_lead_with_activity` y confirma el lead junto
  con el evento `lead_created` en una sola transacción.
- La edición general usa `crm_update_lead_with_activity`; guarda el cambio y un
  único evento `lead_updated` con el detalle legible y los estados completos
  `before` y `after` en `metadata`.
- Una edición sin diferencias no genera ruido en el historial.
- Las tres RPC usan los permisos RLS del usuario autenticado. Comerciales sólo
  pueden crear o editar sus oportunidades; visitadores y perfiles sin permiso
  quedan bloqueados.
- `opportunities.fase_id` tiene ahora una clave foránea real a `phases.id`. La
  auditoría previa confirmó que las 3316 oportunidades existentes eran válidas.

### Configuración documental

- La configuración ya no se cierra cuando falla el `upsert` del expediente.
- El error se muestra dentro del asistente y el botón indica `Guardando...`.
- Se bloquea el cierre mientras la escritura está en curso.
- La interfaz ya no ofrece eliminar archivos: toda la documentación cargada se
  conserva.
- `crm_register_document_upload` registra en una misma transacción los metadatos
  y el evento `document_uploaded`, después de comprobar que el objeto existe en
  el bucket privado.
- Antes de generar la URL temporal, `crm_record_document_view` comprueba el
  acceso y registra quién abrió el archivo y cuándo mediante `document_viewed`.
- Los usuarios normales ya no tienen permisos de borrado físico sobre leads,
  expedientes, archivos ni historial, ni de actualización o borrado de objetos
  del bucket documental. El ocultamiento de leads continúa siendo lógico con
  `deleted_at` y deja su evento de auditoría.
- Los metadatos documentales son de solo lectura para el navegador: únicamente
  la RPC auditada puede crearlos y no pueden modificarse después.

### Visitas

- Los fallos de carga de visitas o inmuebles aparecen en la pantalla.
- Los fallos al crear o editar una visita aparecen en el diálogo correspondiente.
- El formulario se conserva y el diálogo permanece abierto cuando la escritura
  falla.

### Operaciones transaccionales

- Crear y editar una visita guarda ahora la visita y su historial mediante una
  única RPC de PostgreSQL: `crm_save_visit_with_activity`.
- Crear y editar un encargo, tanto desde la pestaña Encargos como desde el panel
  del lead, usa `crm_save_order_with_activity`.
- Mover un lead de fase usa `crm_change_lead_phase_with_activity`.
- Las tres funciones validan la sesión y los permisos dentro de la base, obtienen
  el nombre del autor desde el perfil autenticado y bloquean la fila afectada
  durante la operación.
- Si falla la escritura principal o el historial, PostgreSQL revierte todo. Ya no
  puede quedar guardada una visita, un encargo o una fase sin su auditoría.

### Actividades estructuradas

- `opportunity_activities` continúa siendo la fuente única, pero ahora incluye
  `event_type`, `actor_profile_id`, `effective_at`, `metadata`,
  `parent_event_id` y `updated_at`.
- Los registros existentes se clasificaron sin modificar ni eliminar su `memo`.
  Los textos libres antiguos permanecen como `legacy` y siguen apareciendo como
  observaciones.
- Valoraciones, R.G., Planning, Dashboard y la salud de Encargos consultan ahora
  `event_type`; ya no clasifican registros leyendo prefijos de texto.
- Las nuevas notas, llamadas y actividades se crean con
  `crm_add_contact_activity`. El autor se obtiene de la sesión dentro de la base.
- Crear o editar Valoraciones y R.G. usa RPC transaccionales. Las ediciones
  conservan `before`, `after` y la referencia al registro original.
- Los eventos de auditoría son inmutables. Un trigger mantiene compatibilidad con
  clientes antiguos que todavía escriban los prefijos conocidos.
- Los prefijos se conservan únicamente como representación legible y mecanismo
  temporal de compatibilidad.

## Comportamientos que ya estaban protegidos

- La edición general de un lead lanza el error al formulario y no lo cierra si la
  actualización o la lectura de comprobación fallan.
- El borrado lógico de leads y su historial se ejecuta mediante la RPC atómica
  `crm_soft_delete_leads`.
- Encargos, valoraciones, R.G. y observaciones muestran errores de escritura y no
  cierran sus formularios cuando falla su registro principal.
- Ninguna operación documental del navegador elimina objetos de Storage. Si la
  carga física termina pero falla el registro posterior, el objeto se conserva y
  el usuario recibe un error explícito para su futura conciliación.

## Riesgos todavía abiertos

### 1. Usuarios no conectados

La pestaña Usuarios es todavía una maqueta local. Muestra un usuario fijo y el
botón `Invitar usuario` sólo agrega una fila al estado de React; al recargar se
pierde y no crea una cuenta en Supabase Auth ni un perfil real. Es un bloqueo de
producción y deberá resolverse desde un endpoint de servidor protegido para
administradores, nunca exponiendo una `service_role` en el navegador. El usuario
decidió dejar este bloque para la última fase.

### 2. Pruebas funcionales pendientes

Faltan pruebas automatizadas de navegador que provoquen respuestas fallidas y
comprueben que los formularios conservan los datos. También sigue pendiente el
recorrido manual completo con cada rol indicado en la Fase 0.

## Verificación de este bloque

- `npx tsc --noEmit`: PASS.
- `npm run lint -- --quiet`: PASS, cero errores.
- Migración `20260910100000_atomic_business_mutations.sql`: aplicada en el
  proyecto Supabase de prueba.
- Migración `20260910120000_structure_opportunity_contacts.sql`: aplicada;
  conserva los memos y clasifica las actividades existentes.
- Migración `20260911110000_atomic_lead_mutations.sql`: aplicada; crea las RPC
  transaccionales para alta, importación y edición de leads.
- Migración `20260911113000_enforce_opportunity_phase_fk.sql`: aplicada después
  de confirmar que no existían fases huérfanas.
- Migración `20260914100000_immutable_document_audit.sql`: aplicada; permite
  conservar documentación, impedir borrados físicos desde sesiones normales y
  auditar cargas y aperturas.
- Migración `20260914103000_immutable_document_metadata.sql`: aplicada; bloquea
  altas directas o modificaciones de metadatos fuera de la RPC auditada.
- Migración `20260914110000_explicit_visit_manager_permission.sql`: aplicada;
  añade `can_manage_visits`, elimina la identificación por nombre y expone para
  Visitas un DTO limitado de inmuebles en Encargo.
- Migración `20260914111500_fix_opportunity_insert_visibility.sql`: aplicada;
  mantiene el alta transaccional de leads compatible con la nueva política de
  lectura.
- Migración `20260914113000_limit_visit_creation_to_orders.sql`: aplicada;
  exige desde la RPC y RLS que cada visita nueva corresponda a una oportunidad
  activa en Encargo, incluso si se intenta enviar otro ID fuera del selector.
- `supabase/tests/atomic-lead-mutations.sql`: PASS para todos los perfiles Auth;
  comprobó alta, edición, importación, autor, permisos y rollback total ante una
  fila inválida. Todas las escrituras terminaron con `ROLLBACK`.
- `supabase/tests/structured-opportunity-contacts.sql`: PASS; comprobó tipos,
  metadatos, actor, fecha efectiva, compatibilidad, auditoría e inmutabilidad y
  terminó con `ROLLBACK`.
- `supabase/tests/atomic-business-mutations.sql`: PASS para todos los perfiles
  habilitados; comprobó creación/edición e historial y terminó con `ROLLBACK`.
- `supabase/tests/role-access.sql`: PASS; se mantienen el aislamiento y las reglas
  de escritura por rol.
- `supabase/tests/immutable-document-audit.sql`: PASS; comprobó que la carga y apertura
  quedan auditadas, respeta el acceso por perfil y bloquea el borrado físico; sus
  escrituras terminan con `ROLLBACK`.
- `supabase/tests/visit-manager-access.sql`: PASS; Gonzalo mantiene el rol
  Comercial, ve cero oportunidades, puede crear y editar Visitas con auditoría y
  no puede crear una visita fuera de Encargo.
- `npm run security:supabase:anon`: PASS; una sesión anónima sigue sin poder leer
  ninguna tabla protegida.
- `npx next build --webpack`: PASS con las 13 rutas. Turbopack no pudo abrir su
  proceso local dentro del entorno restringido, por lo que se verificó con el
  compilador webpack soportado por Next.js.
- Navegador local con Facu/Coordinador: Leads carga 3316 registros; los diálogos
  de Nuevo lead, Importar CSV y Agregar visita abren correctamente después de los
  cambios. No se escribieron datos durante esta comprobación.

## Próximo bloque recomendado

Extender la conservación sin borrado físico a Visitas y Encargos. Los recorridos
funcionales de navegador quedan para una fase posterior y la gestión real de
usuarios con Supabase Auth para la última.

El CRM todavía no se declara apto para producción.
