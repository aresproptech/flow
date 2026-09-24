# Diagnostico de persistencia del CRM

## Objetivo

Este documento explica el mapa entre lo que el usuario ve o acciona en el front y donde se guarda o se calcula en el backend.

El Excel relacionado esta en:

`outputs/crm-persistence-map/mapa-front-back-crm.xlsx`

## Como leer el Excel

La hoja `Mapa front-back` muestra cada bloque funcional del CRM.

- `Accion en front`: lo que hace el usuario en pantalla.
- `Ubicacion front`: archivo o componente donde vive esa accion.
- `Ubicacion backend`: tabla, vista o API que recibe o entrega los datos.
- `Operacion`: lectura, creacion, edicion, borrado logico o calculo.
- `Columnas backend`: campos principales que se usan.
- `Persiste`: indica si queda guardado en Supabase o si solo afecta la pantalla.
- `Estado`: clasificacion rapida del punto.

La hoja `Resumen` agrupa el estado general.

La hoja `Riesgos y mejoras` lista los puntos que conviene revisar antes de considerar cerrado el circuito de persistencia.

## Que esta bien

Las acciones principales del negocio si tienen respaldo en backend:

- Los leads se leen desde `crm_leads_view` y se actualizan en `opportunities`.
- Las observaciones se guardan en `opportunity_activities`.
- El historial visible del panel se apoya en registros guardados, principalmente dentro de `opportunity_activities`.
- Las valoraciones se guardan como contactos tipo valoracion en `opportunity_activities`.
- Las R.G. se guardan como contactos tipo R.G. en `opportunity_activities`.
- Los encargos se guardan en `opportunity_orders`.
- Las visitas se guardan en `opportunity_buyers`.
- El dashboard calcula metricas desde datos reales de `opportunities`, `opportunity_activities` y `opportunity_buyers`; las altas de encargos se cuentan mediante eventos `order_created`.

En resumen: las acciones operativas importantes no quedan solo en el front. La mayoria se escriben o se leen desde Supabase.

## Que no se guarda, y esta bien que no se guarde

Hay acciones que son solo de uso visual o de navegacion. No necesitan persistencia:

- Cambiar entre tabla y kanban.
- Abrir o cerrar paneles.
- Seleccionar filtros temporales en pantalla.
- Copiar telefonos.
- Abrir WhatsApp desde un telefono.
- Ver ratios, porcentajes o proyecciones del dashboard.

Estos puntos no son un problema mientras el objetivo sea usarlos como ayudas de trabajo en la sesion actual.

## Que conviene revisar

### 1. Reglas de seguridad en Supabase

Desde el codigo se ve que el front usa Supabase, pero no alcanza para confirmar todas las reglas de permisos.

Matriz de permisos aplicada en el frontend:

| Perfil | Visualizacion | Edicion |
| --- | --- | --- |
| Admin | Todos los registros y metricas | Todo el CRM |
| Coordinador | Todos los registros y metricas | Todo el CRM |
| Comercial | Solo sus leads y datos relacionados | Solo sus leads y datos relacionados |
| Gestor de visitas | Sólo Visitas y datos mínimos del inmueble | Crear y editar Visitas |

Gonzalo mantiene `profiles.rol = 'Comercial'` y tiene
`profiles.can_manage_visits = true`. Oportunidades y los flujos comerciales le
devuelven cero registros. En Visitas puede leer, crear y editar visitas; el selector
de inmuebles usa `crm_visit_property_options` y sólo entrega los campos necesarios
de inmuebles en Encargo. La RPC y la política RLS validan también esa fase antes
de crear la visita, por lo que el selector no es la única barrera. Tampoco se
incluye en las comparativas comerciales.

Estado actualizado el 9 de septiembre: políticas RLS aplicadas en la base de prueba y aislamiento comprobado mediante SQL. Quedan las pruebas completas de navegador; ver `fase-0-seguridad-supabase.md`.

Situación histórica detectada en la auditoría de solo lectura del 14 de julio de 2026, antes de aplicar las correcciones:

- `crm_leads_view`: 3316 registros accesibles.
- `opportunities`: 4785 registros accesibles.
- `opportunity_activities`: 38 registros accesibles.
- `opportunity_orders`: consulta accesible.
- `opportunity_buyers`: 11 registros accesibles.
- `profiles`: 14 registros accesibles.

Conclusión histórica: un cliente anónimo podía consultar datos del CRM. Ese riesgo crítico quedó corregido en la Fase 0.

El 8 de septiembre de 2026 se confirmó y cerró el acceso anónimo mediante las migraciones versionadas. El usuario autorizó aplicarlas directamente a la base de prueba sin backup. El 14 de septiembre se sustituyó la excepción nominal de Gonzalo por `can_manage_visits`. La sonda API y las pruebas SQL por usuario pasan; el alcance y los pendientes constan en `fase-0-seguridad-supabase.md`.

Controles aplicados y comprobados en Supabase mediante pruebas SQL:

- Que cada Comercial solo pueda leer y modificar sus propios leads y datos relacionados.
- Que Admin y Coordinador tengan acceso completo.
- Que el gestor de visitas vea cero oportunidades y pueda operar únicamente en Visitas.
- Que no haya escrituras abiertas por error.
- Que las tablas criticas tengan Row Level Security bien configurado.

### 2. Uso mixto de `opportunity_activities`

La tabla `opportunity_activities` guarda varias cosas distintas:

- Observaciones.
- Historial.
- Valoraciones.
- R.G.
- Eventos generados por acciones.

Estado: estructurado sobre la misma tabla, sin crear una tabla nueva ni eliminar
los memos existentes.

Clasificación de los 55 registros existentes al aplicar la migración:

- 3 observaciones con prefijo `[NOTA]`.
- 5 valoraciones con prefijo `[VALORACION]`.
- 3 R.G. con prefijo `[R.G.]`.
- 27 observaciones antiguas en texto libre.
- 17 actividades de auditoría tipificadas, entre llamadas, cambios de fase,
  encargos, ediciones y actividades generales.
- Todos tienen lead asociado, fecha funcional y fecha/hora de creacion.

Reglas vigentes:

- `event_type = note` se muestra en Observaciones.
- Los tipos de auditoria se muestran en Historial.
- `event_type = valuation` alimenta Valoraciones, Historial, Planning y metricas.
- `event_type = rg` alimenta R.G., Historial, Planning y metricas.
- Los textos libres antiguos se mantienen como observaciones heredadas.

Correcciones realizadas:

- Todos los registros tienen un tipo estructurado; los 27 textos libres antiguos
  se mantienen como `legacy`.
- Valoraciones y R.G. guardan campos operativos en `metadata` y conservan el
  formato antiguo como respaldo legible.
- Planning lee valoraciones, R.G. y visitas realmente persistidas, en lugar de inferirlas desde la fase actual del lead.
- Se mantiene un parser compartido sólo para compatibilidad histórica.
- Las políticas de escritura ya no buscan palabras dentro del `memo`.

Conclusion: `opportunity_activities` continúa siendo la tabla única, pero la
clasificación y las métricas ya no dependen de prefijos.

### 3. Historial de acciones

Estado: estructurado y transaccional; quedan pendientes los recorridos completos
de navegador por rol.

El historial ya muestra acciones y persiste en `opportunity_activities`, pero no todas se registran con el mismo nivel de detalle.

Revision del comportamiento actual:

- El panel del lead registra llamadas con usuario real y fecha/hora de creacion.
- Las observaciones guardan el usuario real y se mantienen separadas del historial.
- Las valoraciones y R.G. guardan autor, fecha programada, hora, medio y resultado cuando corresponde.
- Las ediciones realizadas desde el panel detallan los valores anteriores y nuevos de los campos controlados.
- Los encargos editados desde el panel detallan fechas, importes, comisiones y memo anteriores/nuevos.
- Corregido: las visitas y los encargos editados desde sus pantallas generales registran cada campo modificado con su valor anterior y nuevo.
- Corregido: crear, importar, cambiar de fase o eliminar desde Oportunidades registra el nombre real del usuario autenticado.
- Corregido: la edicion general del lead audita propietario, telefono, domicilio, ubicacion, CP, origen, fechas, asignacion, fase, estado, valor y notas.
- No hay acciones de eliminacion para valoraciones, R.G., encargos o visitas en las pantallas revisadas.

Acciones que deben mantenerse cubiertas:

- Crear.
- Editar.
- Eliminar.
- Cambiar fase.
- Cambiar estado.
- Registrar llamada.
- Crear valoracion.
- Crear R.G.
- Crear encargo.
- Crear visita.

Tambien conviene guardar siempre:

- Usuario real.
- Fecha y hora.
- Accion realizada.
- Valor anterior.
- Valor nuevo.

Conclusion: el historial es util y persistente, pero antes de considerarlo una auditoria completa hay que unificar el autor real y ampliar el detalle de las ediciones realizadas fuera del panel.

### 4. Campos descriptivos e IDs

La aplicacion guarda y consume principalmente textos descriptivos para comerciales, planners y origenes. La vista `crm_leads_view` los expone correctamente aunque el ID relacionado este vacio.

Revision realizada sobre los 3316 leads activos:

- 3034 muestran un comercial real, pero no tienen `comercial_user_id`.
- 2999 muestran un planner/contacto real, pero no tienen `contact_user_id`.
- 3310 muestran un origen real, pero no tienen `source_id`.
- Cuando no existe un nombre, la vista devuelve textos de sustitucion como `Sin comercial` o `Sin contacto`.

El front actual funciona porque lee `comercial_name`, `contact_name` y `source_name`. Tambien crea e importa leads guardando `comercial_user_desc`, `contact_user_desc` y `source_desc`, dejando sus IDs en `null`.

Estado actualizado el 9 de septiembre: las coincidencias únicas fueron normalizadas mediante IDs y el frontend guarda las relaciones nuevas por ID. RLS también prioriza `comercial_user_id`. Los valores ambiguos conservan el texto heredado y están detallados en `fase-1-integridad-datos.md`; requieren una decisión de negocio antes de migrarlos.

### 5. Borrado logico

Algunas operaciones pueden usar `deleted_at` en lugar de borrar fisicamente.

Revision realizada:

- `opportunities` contiene registros con `deleted_at`.
- `crm_leads_view` expone el campo `deleted_at`.
- `crm_leads_view` no devuelve registros con `deleted_at` informado.

Conclusion: las pantallas que leen desde `crm_leads_view` no deberian mostrar ni contar leads eliminados.

### 6. Dashboard sin snapshot historico

El dashboard calcula metricas desde datos actuales.

Eso esta bien para ver el estado vivo del negocio, pero si se quiere comparar exactamente "como estabamos ayer" aunque luego cambien datos, conviene guardar snapshots diarios.

Sin snapshots, el dashboard puede recalcular datos historicos con informacion actualizada.

## Recomendaciones priorizadas

1. Completar las pruebas de navegador por cada rol; las reglas RLS y el bloqueo anónimo ya están aplicados y comprobados mediante SQL.
2. Mantener las operaciones compuestas dentro de RPC transaccionales; altas,
   importaciones y ediciones de leads ya guardan su historial atómicamente.
3. Mantener `event_type` y `metadata` como clasificación estructurada de
   `opportunity_activities`; los prefijos quedan sólo para lectura humana y legado.
4. Evaluar snapshots diarios para metricas historicas del dashboard.
5. Resolver manualmente los valores ambiguos restantes de comerciales, planners y orígenes; las coincidencias únicas y las nuevas escrituras ya usan IDs.

## Conclusion

El CRM tiene una base de persistencia correcta para empezar a operar: leads, visitas, valoraciones, R.G., encargos, observaciones e historial tienen conexion con Supabase.

La seguridad crítica de datos quedó reforzada en la Fase 0 y las operaciones
principales ya conservan trazabilidad estructurada y transaccional. Antes de
producción todavía hay que completar las pruebas funcionales por rol y resolver
las decisiones de negocio pendientes:

- confirmar los recorridos de cada perfil en el navegador,
- resolver las asignaciones heredadas ambiguas,
- y decidir si el dashboard debe ser calculado en vivo o guardar cortes historicos diarios.
