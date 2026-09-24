# Mapa de persistencia CRM

Documento auditado desde el front actual. Indica que acciones leen o escriben datos en Supabase y cuales son solo calculos/estado visual del navegador.

> Nota: este mapa confirma el uso desde el codigo frontend. No confirma politicas RLS, triggers, constraints ni permisos internos de Supabase.

## Resumen de tablas

| Tabla / vista | Uso principal | Escribe front | Lee front |
|---|---|---:|---:|
| `opportunities` | Registro base de oportunidades/leads | Si | Indirectamente via vista |
| `crm_leads_view` | Vista enriquecida de leads para tablas, paneles y metricas | No | Si |
| `opportunity_activities` | Actividades tipificadas: observaciones, historial, llamadas, valoraciones y R.G. | Si, mediante RPC | Si |
| `opportunity_orders` | Encargos | Si | Si |
| `opportunity_buyers` | Visitas y compradores | Si | Si |
| `phases` | Resolver IDs de fase | No | Si |
| `profiles` | Usuario CRM y rol | No | Si |
| `postal` | Lookup de codigo postal | No | Si |
| `opportunity_documentation_cases` | Configuracion y requisitos aplicables del expediente | Si | Si |
| `opportunity_documentation_files` | Metadatos inmutables de los documentos | Si, mediante RPC | Si |
| Storage `lead-documentation` | Archivos privados del expediente | Si | Si, mediante URL temporal |

## Oportunidades / Leads

| Accion en front | Tabla / vista | Operacion | Columnas usadas | Persistencia | Archivo |
|---|---|---|---|---|---|
| Listar leads | `crm_leads_view` | `select` | `*` | Solo lectura | `app/(crm)/leads/page.tsx` |
| Importar CSV | `opportunities` + `opportunity_activities` | RPC transaccional | Campos del lead + evento `lead_imported`; incluye fechas de contacto, valoración y hora | Guarda todo o revierte todo el archivo | `app/(crm)/leads/page.tsx` |
| Crear lead manual | `opportunities` + `opportunity_activities` | RPC transaccional | Campos del lead + evento `lead_created` con autor real | Guarda todo o revierte todo | `app/(crm)/leads/page.tsx` |
| Editar lead | `opportunities` + `opportunity_activities` | RPC transaccional | Campos del lead + evento `lead_updated` con detalle, `before` y `after` | Guarda todo o revierte todo | `app/(crm)/leads/page.tsx` |
| Leer lead actualizado | `crm_leads_view` | `select` | `*` por `id` | Solo lectura | `app/(crm)/leads/page.tsx` |
| Mover en Kanban / cambiar fase | `opportunities` + `opportunity_activities` | RPC transaccional | `fase_id` + evento `phase_changed` | Guarda | `app/(crm)/leads/page.tsx` |
| Marcar favorito | `opportunities` | `update` | `is_favorite` | Guarda | `app/(crm)/leads/page.tsx` |
| Eliminar seleccionados | `opportunities` + `opportunity_activities` | RPC transaccional | `deleted_at` + evento `lead_deleted` | Guarda | `app/(crm)/leads/page.tsx` |
| Resolver fase | `phases` | `select` | `id`, `name` | Solo lectura | `app/(crm)/leads/page.tsx` |
| Filtros, busqueda, orden, seleccion | Estado React local | N/A | No aplica | No guarda | `app/(crm)/leads/page.tsx` |

## Historial y observaciones

| Accion en front | Tabla | Operacion | Columnas usadas | Persistencia | Observacion |
|---|---|---|---|---|---|
| Registrar actividad general | `opportunity_activities` | RPC `crm_add_contact_activity` | `event_type`, actor, fecha efectiva, `metadata`, `memo` | Guarda | El prefijo queda sólo como texto legible |
| Agregar observacion manual | `opportunity_activities` | RPC + `select` verificacion | tipo `note`, actor, texto estructurado | Guarda | El autor se deriva de la sesión |
| Cargar observaciones e historial | `opportunity_activities` | `select` | campos base + `event_type`, actor y `metadata` | Solo lectura | Filtra por `opportunity_id` y tipo |
| Click en llamar | `opportunity_activities` | RPC | evento `call` con teléfono en `metadata` | Guarda | No depende de buscar “Llamó” en el memo |
| Contador ultima llamada | `opportunity_activities` | lectura/calculo | `created_at`, `event_type` | No guarda contador | Se calcula desde eventos `call` |
| Cambios en campos del panel | `opportunities` + `opportunity_activities` | RPC `crm_update_lead_with_activity` | Campos del lead + evento estructurado con detalle, `before` y `after` | Guarda atómicamente | Una edición sin diferencias no crea historial |

## Documentación

| Acción en front | Destino | Operación | Persistencia | Observación |
|---|---|---|---|---|
| Configurar expediente | `opportunity_documentation_cases` | `upsert` por `opportunity_id` | Guarda | Define propietarios y requisitos condicionales |
| Adjuntar archivo | Storage + `opportunity_documentation_files` + `opportunity_activities` | Carga física y RPC `crm_register_document_upload` | Conserva archivo; metadatos y auditoría se guardan atómicamente | Evento `document_uploaded` con autor y fecha |
| Abrir archivo | `opportunity_activities` + Storage | RPC `crm_record_document_view` y URL firmada de 60 segundos | Guarda auditoría antes de abrir | Evento `document_viewed` con autor y fecha |
| Eliminar o modificar un archivo | No disponible | N/A | No elimina ni altera | Los usuarios normales sólo leen metadatos y no pueden borrar ni reemplazar objetos documentales |
| Eliminar lead desde el listado | `opportunities` + `opportunity_activities` | RPC `crm_soft_delete_leads` | Borrado lógico | Conserva la fila, relaciones, documentos e historial |

## Valoraciones

| Accion en front | Tabla / vista | Operacion | Columnas usadas | Persistencia | Archivo |
|---|---|---|---|---|---|
| Agregar valoracion desde panel | `opportunity_activities` | RPC transaccional | tipo `valuation`, fecha efectiva, actor y `metadata` | Guarda | `components/crm/lead-detail-panel.tsx` |
| Editar valoracion desde panel | `opportunity_activities` | RPC transaccional | actualiza `valuation` y agrega `valuation_updated` | Guarda | Conserva `before` y `after` |
| Listar historial de valoraciones en panel | `opportunity_activities` | `select` | campos estructurados con tipo `valuation` | Solo lectura | `components/crm/lead-detail-panel.tsx` |
| Listar pagina Valoraciones | `opportunity_activities` | `select` | `event_type = valuation` | Solo lectura | `app/(crm)/valoraciones/page.tsx` |
| Enriquecer pagina Valoraciones | `crm_leads_view` | `select` | `*` | Solo lectura | `app/(crm)/valoraciones/page.tsx` |
| Impacto en dashboard comercial | `opportunity_activities` | lectura/calculo | `event_type`, `fecha`, `created_at`, `opportunity_id` | No guarda metrica | Cuenta tipos `valuation` |

Formato actual de memo: `[VALORACION] Nombre: Medio: X | Hora: HH:mm`.

## R.G.

| Accion en front | Tabla / vista | Operacion | Columnas usadas | Persistencia | Archivo |
|---|---|---|---|---|---|
| Agregar R.G. desde panel | `opportunity_activities` | RPC transaccional | tipo `rg`, fecha efectiva, actor y `metadata` | Guarda | `components/crm/lead-detail-panel.tsx` |
| Editar R.G. desde panel | `opportunity_activities` | RPC transaccional | actualiza `rg` y agrega `rg_updated` | Guarda | Conserva `before` y `after` |
| Listar historial R.G. en panel | `opportunity_activities` | `select` | campos estructurados con tipo `rg` | Solo lectura | `components/crm/lead-detail-panel.tsx` |
| Listar pagina R.G. | `opportunity_activities` | `select` | `event_type = rg` | Solo lectura | `app/(crm)/rg/page.tsx` |
| Enriquecer pagina R.G. | `crm_leads_view` | `select` | `*` | Solo lectura | `app/(crm)/rg/page.tsx` |
| Impacto en dashboard comercial | `opportunity_activities` | lectura/calculo | `event_type`, `fecha`, `created_at`, `opportunity_id` | No guarda metrica | Cuenta tipos `rg` |

Formato actual de memo: `[R.G.] Nombre: Medio: X | Resultado: Y | Hora: HH:mm`.

## Encargos

| Accion en front | Tabla / vista | Operacion | Columnas usadas | Persistencia | Archivo |
|---|---|---|---|---|---|
| Cargar encargos del panel | `opportunity_orders` | `select` | `*` por `opportunity_id` | Solo lectura | `components/crm/lead-detail-panel.tsx` |
| Agregar encargo desde panel | `opportunity_orders` | `insert` | `opportunity_id`, `fecha_inicio`, `fecha_fin`, `pvp_inicial`, `pvp_actual`, `pvp_estimado`, `com_vendedor`, `com_comprador`, `memo` | Guarda | `components/crm/lead-detail-panel.tsx` |
| Editar encargo desde panel | `opportunity_orders` | `update` | mismas columnas por `id` | Guarda | `components/crm/lead-detail-panel.tsx` |
| Registrar historial encargo | `opportunity_activities` | `insert` | `opportunity_id`, `fecha`, `memo`, `resultado` | Guarda | `components/crm/lead-detail-panel.tsx` |
| Listar pagina Encargos | `crm_leads_view` + `opportunity_orders` | `select` | leads en fase Encargo + `opportunity_orders.*` | Solo lectura | `app/(crm)/encargos/page.tsx` |
| Crear/editar encargo desde pagina Encargos | `opportunity_orders` | `insert` / `update` | `opportunity_id`, fechas, PVPs, comisiones, `memo`, `rebajas` | Guarda | `app/(crm)/encargos/page.tsx` |
| Calcular rebajas | `opportunity_orders` | calculo antes de guardar | `pvp_actual`, `rebajas` | Guarda solo `rebajas` final | Incrementa si baja PVP actual |
| Health / actividad reciente | `opportunity_activities`, `opportunity_buyers` | `select` | R.G. ultimos 15 dias, visitas ultimos 30 dias | Solo lectura | `app/(crm)/encargos/page.tsx` |

## Visitas

| Accion en front | Tabla / vista | Operacion | Columnas usadas | Persistencia | Archivo |
|---|---|---|---|---|---|
| Listar visitas | `opportunity_buyers` | `select` | `*` | Solo lectura | `app/(crm)/visitas/page.tsx` |
| Filtrar visitas para Comercial | `opportunity_buyers` | `select` con filtro | `owner`, `planner` | Solo lectura | `app/(crm)/visitas/page.tsx` |
| Cargar inmuebles para visita | RPC `crm_visit_property_options` | DTO seguro | `id`, `propietario`, `domicilio`, `owner`, `planner`, `estado`, `dominio` | Solo lectura | El gestor de visitas no obtiene acceso a `crm_leads_view` |
| Agregar visita | RPC `crm_save_visit_with_activity` | `insert` transaccional | `opportunity_id`, datos de visita y autor real | Guarda | RPC/RLS exigen oportunidad activa en Encargo |
| Editar visita | RPC `crm_save_visit_with_activity` | `update` transaccional | datos editables por `id`; no reasigna el inmueble | Guarda | `app/(crm)/visitas/page.tsx` |
| Registrar historial de visita | RPC → `opportunity_activities` | `insert` en la misma transacción | evento tipado, `visit_id`, detalle y actor | Guarda | Si falla el historial, se revierte la visita |
| Copiar telefonos seleccionados | Clipboard navegador | N/A | `telefono` | No guarda | Solo portapapeles |
| Click telefono / WhatsApp | Navegacion externa | N/A | `telefono` | No guarda | Abre WhatsApp/telefono segun implementacion |
| Impacto dashboard comercial | `opportunity_buyers` | lectura/calculo | `opportunity_id`, `fecha_visita`, `created_at` | No guarda metrica | Cuenta visitas por fecha |

## Dashboard

| Bloque | Tabla / vista | Operacion | Columnas usadas | Guarda? | Comentario |
|---|---|---|---|---|---|
| Metricas generales | `crm_leads_view` | `select` | `*` | No | Calcula fases, estados, origen, comercial |
| Actividad comerciales | `crm_leads_view` | `select` | `id`, fechas, fase, estado, comercial, dominio, origen | No | Base para atribuir acciones |
| Valoraciones/R.G. dashboard | `opportunity_activities` | `select` | `id`, `opportunity_id`, `fecha`, `event_type`, `created_at` | No | Cuenta actividades por tipo |
| Encargos dashboard | `opportunity_activities` | `select` | eventos `order_created` por `event_type` y fecha efectiva | No | Cuenta el alta auditada del encargo; `opportunity_orders` no tiene `created_at` |
| Visitas dashboard | `opportunity_buyers` | `select` | `id`, `opportunity_id`, `fecha_visita`, `created_at` | No | Cuenta por fecha de visita/creacion |
| Periodos del dashboard | Estado React local | N/A | `period`, `customFrom`, `customTo` | No | Solo filtro visual |
| Promedio, proyectado, gap, ratios | Calculo frontend | N/A | Datos leidos | No | No persiste resultados |

## Planning

| Accion en front | Tabla / vista | Operacion | Columnas usadas | Persistencia |
|---|---|---|---|---|
| Cargar planning | `crm_leads_view` | `select` | `*` | Solo lectura |
| Agrupar por fechas | Calculo frontend | N/A | fechas del lead | No guarda |

## Usuarios y permisos visibles

| Accion / regla | Tabla | Operacion | Columnas usadas | Persistencia |
|---|---|---|---|---|
| Obtener usuario CRM | `profiles` | `select` | `*` filtrando `auth_id` | Solo lectura |
| Login | Supabase Auth | `signInWithPassword` | email/password | Sesion Auth |
| Logout | Supabase Auth | `signOut` | N/A | Cierra sesion |
| Gestionar visitas globales | `profiles` + RPC/RLS | permiso `can_manage_visits` | booleano explícito | Guarda | No depende del nombre del usuario |
| Ver todos los leads | Regla frontend | N/A | `rol` | No guarda |
| Editar leads | Regla frontend | N/A | `rol` | No guarda |

Reglas frontend actuales:

- `Admin` y `Coordinador` pueden ver todos los leads.
- `Comercial` ve sus propios leads en varias vistas.
- `Admin` y `Comercial` pueden editar leads segun helper `canEditLeads`.
- El sidebar limita algunas secciones por rol.

Pendiente de confirmar en backend:

- Politicas RLS por tabla.
- Si `crm_leads_view` aplica filtros por usuario desde Supabase o solo desde front.
- Si existen triggers que completen IDs relacionales desde campos `_desc`.
- Si `opportunities.deleted_at` excluye filas en todas las vistas relevantes.

## Cosas que se ven en front pero no persisten como registro propio

| Elemento | Donde se calcula | Fuente |
|---|---|---|
| Contador ultima llamada | Panel lead | `opportunity_activities.event_type = call` |
| Promedios/proyecciones/gaps | Dashboard | Leads/contactos/encargos/visitas |
| Seleccion de filas | Estado React | Navegador |
| Busquedas y filtros | Estado React | Navegador |
| Modo tabla/kanban | Estado React | Navegador |
| Copia de telefonos | Clipboard | Navegador |
| Apertura de WhatsApp | URL externa | Telefono de visita |

## Riesgos / puntos a revisar

| Riesgo | Motivo | Recomendacion |
|---|---|---|
| Auditoria de autor en registros antiguos | Algunos memos antiguos no guardaban nombre real | Migrar o aceptar fallback visual |
| Registros históricos en texto libre | Se mantienen como `legacy` | Conservar el parser sólo como compatibilidad |
| Dashboard no guarda snapshots | Todo se recalcula al abrir | Si se necesita historico fijo, crear tabla de snapshots |
| Seguridad depende de RLS | El front filtra, pero no alcanza como seguridad fuerte | Auditar policies Supabase |
| Campos `_desc` vs IDs relacionales | El front inserta muchos IDs como null y guarda descripciones | Confirmar triggers/vista o normalizar |
| Objeto sin metadatos tras fallo excepcional | Storage y PostgreSQL no comparten una transacción | Conservar el objeto y añadir una conciliación administrativa futura |
