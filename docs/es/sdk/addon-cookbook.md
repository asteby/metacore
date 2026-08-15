<p align="center">
  <img src="/logo.svg" width="120" alt="Metacore" />
</p>

<h1 align="center">Recetario de addons</h1>

Recetas cortas para los patrones que aparecen construyendo addons. Cada entrada es una pregunta, el snippet funcional más chico, y una nota de una línea sobre el *por qué*. Para contexto profundo sobre cualquier feature, seguí los links a [`manifest-spec.md`](./manifest-spec) y [`dynamic-ui.md`](./dynamic-ui).

## Tabla de contenidos

- [¿Cómo consigo CRUD sin escribir código?](#cómo-consigo-crud-sin-escribir-código)
- [¿Cómo agrego una relación de foreign key?](#cómo-agrego-una-relación-de-foreign-key)
- [¿Cómo hago que una columna sea buscable?](#cómo-hago-que-una-columna-sea-buscable)
- [¿Cómo agrego una validación custom?](#cómo-agrego-una-validación-custom)
- [¿Cómo creo una acción custom con un modal?](#cómo-creo-una-acción-custom-con-un-modal)
- [¿Cómo requiero un permiso para un botón?](#cómo-requiero-un-permiso-para-un-botón)
- [¿Cómo emito un evento cuando cambia un registro?](#cómo-emito-un-evento-cuando-cambia-un-registro)
- [¿Cómo me suscribo a eventos de otro addon?](#cómo-me-suscribo-a-eventos-de-otro-addon)
- [¿Cómo muestro una UI distinta para create vs edit?](#cómo-muestro-una-ui-distinta-para-create-vs-edit)
- [¿Cómo agrego una columna de soft-delete?](#cómo-agrego-una-columna-de-soft-delete)
- [¿Cómo scopeo registros por organización?](#cómo-scopeo-registros-por-organización)
- [¿Cómo empaqueto una extensión frontend con mi addon?](#cómo-empaqueto-una-extensión-frontend-con-mi-addon)
- [¿Cómo pruebo mi addon localmente?](#cómo-pruebo-mi-addon-localmente)
- [¿Cómo hago prefetch de metadata al bootear la app?](#cómo-hago-prefetch-de-metadata-al-bootear-la-app)
- [¿Cómo agrego una acción de dropdown de fila que linkea a otra página?](#cómo-agrego-una-acción-de-dropdown-de-fila-que-linkea-a-otra-página)
- [¿Cómo gateo una acción según el estado actual de la fila?](#cómo-gateo-una-acción-según-el-estado-actual-de-la-fila)
- [¿Cómo agrupo un form grande de create/edit en secciones o un wizard?](#cómo-agrupo-un-form-grande-de-createedit-en-secciones-o-un-wizard)
- [¿Cómo embebo line items (la sub-tabla de un documento) en el modal padre?](#cómo-embebo-line-items-la-sub-tabla-de-un-documento-en-el-modal-padre)
- [¿Cómo computo una columna a partir de otras, o sumo un padre desde sus hijos?](#cómo-computo-una-columna-a-partir-de-otras-o-sumo-un-padre-desde-sus-hijos)
- [¿Cómo construyo un pipeline kanban / stage machine?](#cómo-construyo-un-pipeline-kanban--stage-machine)
- [¿Cómo hago seed de filas default al instalar?](#cómo-hago-seed-de-filas-default-al-instalar)
- [¿Cómo agrego lógica de backend en WASM en vez de un webhook?](#cómo-agrego-lógica-de-backend-en-wasm-en-vez-de-un-webhook)
- [¿Cómo leo/escribo una fila desde un handler WASM sin SQL raw?](#cómo-leoescribo-una-fila-desde-un-handler-wasm-sin-sql-raw)
- [¿Cómo agrego una página federada completa en vez de la pantalla CRUD genérica?](#cómo-agrego-una-página-federada-completa-en-vez-de-la-pantalla-crud-genérica)
- [¿Cómo agrego un widget de dashboard federado?](#cómo-agrego-un-widget-de-dashboard-federado)
- [¿Cómo llamo a un connector (pagos, mensajería) que no poseo?](#cómo-llamo-a-un-connector-pagos-mensajería-que-no-poseo)
- [¿Cómo declaro un rol y sus permisos?](#cómo-declaro-un-rol-y-sus-permisos)
- [¿Cómo publico mi addon al hub?](#cómo-publico-mi-addon-al-hub)

## ¿Cómo consigo CRUD sin escribir código?

Declará un modelo con `table` + `columns[]` — list, create, read, update,
delete, filtrado, el modal de create/edit y el gating de permisos vienen
todos gratis desde la metadata que el kernel deriva del manifest:

```json
"models": [{
  "key": "Ticket",
  "table": "tickets",
  "label": "tickets.model.label",
  "columns": [
    { "name": "title", "type": "string", "not_null": true },
    { "name": "status", "type": "string", "default": "open", "display": "status" }
  ]
}],
"contributions": {
  "navigation": [{ "title": "sidebar.tickets", "icon": "Ticket",
    "items": [{ "title": "sidebar.tickets.all", "url": "/m/tickets", "model": "Ticket" }] }]
}
```

**No escribas a mano una acción/webhook de create/update/delete para un
modelo que ya tiene `table` declarado** — eso produce un endpoint
duplicado, espurio, al lado del automático. Recurrí a
`contributions.actions[]` solo para comportamiento que CRUD no cubre: una
transición de estado, un side effect computado, una llamada a un
connector. Ver [manifest-spec.md §5](./manifest-spec#5-models) para el
vocabulario completo de columna/display/widget que hace más rico el form y
la tabla auto-generados sin código frontend (pickers `ref`, `options`,
renderers `display`, fields de barcode `scan`, `visible_when`).

## ¿Cómo agrego una relación de foreign key?

Declará una entrada `foreign_keys[]` en el modelo. El host genera el
constraint `FOREIGN KEY` y expone un endpoint de options de relation-picker
que usa el modal de edit.

```json
{
  "key": "TicketComment",
  "table": "ticket_comments",
  "columns": [
    { "name": "id", "type": "uuid", "primary_key": true, "default": "gen_random_uuid()" },
    { "name": "ticket_id", "type": "uuid", "not_null": true }
  ],
  "foreign_keys": [
    {
      "columns": ["ticket_id"],
      "references": { "model": "tickets.Ticket", "columns": ["id"] },
      "policy": "physical",
      "on_delete": "cascade"
    }
  ]
}
```

El diálogo de edit renderiza un combobox buscable para `ticket_id`.
`references.model` es el `<addon_key>.<ModelKey>` del target; `policy` es
`"physical"` (una FK de DB real) o `"logical"` (enforced solo por la app).

## ¿Cómo hago que una columna sea buscable?

La buscabilidad es metadata que el kernel deriva para la vista de lista del
modelo — una búsqueda global ILIKE (el input de texto libre de la toolbar)
más chips de filtro por columna. Declará la columna normalmente y el kernel
la expone como filtro; las columnas de texto participan en la búsqueda
global `?search=`.

```json
{
  "key": "Ticket",
  "table": "tickets",
  "columns": [
    { "name": "title", "type": "text", "not_null": true }
  ]
}
```

## ¿Cómo agrego una validación custom?

Para fields de action, agregá `validation` (regex aplicada después de
`normalize`):

```json
"input_schema": [
  { "name": "rfc", "type": "string", "required": true,
    "normalize": "uppercase",
    "validation": "^[A-ZÑ&]{3,4}\\d{6}[A-Z0-9]{3}$" }
]
```

Para constraints de columna más allá de lo que expresa el manifest (NOT
NULL, UNIQUE, largo), validá en tu action handler / export WASM. Mantené
los constraints a nivel schema declarativos; mantené las reglas de negocio
en código.

## ¿Cómo creo una acción custom con un modal?

Declará la acción bajo `contributions.actions[]` con `fields[]`. En v3 la
acción carga su propio `handler` (el lado servidor se cablea *dentro de la
acción*, no en un mapa `hooks{}` aparte), y `target_model` es la `key` del
modelo sobre el que actúa:

```json
"contributions": {
  "actions": [
    {
      "key": "reassign",
      "label": "Reassign",
      "icon": "UserPlus",
      "target_model": "Ticket",
      "handler": { "type": "webhook", "url": "/webhooks/reassign" },
      "fields": [
        { "key": "assignee_id", "label": "New assignee", "type": "user", "required": true },
        { "key": "note", "label": "Note", "type": "text" }
      ]
    }
  ]
}
```

`<DynamicTable>` agrega "Reassign" al dropdown de la fila. Al clickearla se
dispara `<ActionModalDispatcher>`, que renderiza un modal con los inputs
declarados y dispatchea al `handler` de la acción — un `webhook`
(`{ "type": "webhook", "url": "…" }`) o un export `wasm`
(`{ "type": "wasm", "function": "Reassign" }`).

Para UI totalmente custom, registrá un componente en el registry de
modals — el componente debe aceptar el `ModalProps` canónico y estrechar el
`payload` en la entrada:

```tsx
import type { AddonAPI, ModalProps } from '@asteby/metacore-sdk'

interface ReassignPayload { ticketId: string }

function ReassignDialog(props: ModalProps) {
  const { ticketId } = props.payload as unknown as ReassignPayload
  // …form, submit, después:
  // props.close({ ticketId })
}

export function register(api: AddonAPI) {
  api.registry.registerModal({ slug: 'tickets.reassign', component: ReassignDialog })
}
```

El field `modal: "tickets.reassign"` de la acción en el manifest le dice al
dispatcher que monte este componente en vez del diálogo genérico manejado
por fields. Ver [`docs/modals.md`](./modals) para el contrato completo.

## ¿Cómo requiero un permiso para un botón?

Envolvé el affordance en `<CapabilityGate>`:

```tsx
import { CapabilityGate } from '@asteby/metacore-runtime-react'

<CapabilityGate require="db:write addon_tickets.tickets">
  <Button onClick={createTicket}>New ticket</Button>
</CapabilityGate>
```

El kernel igual enforcea la misma capability server-side — gatear la UI es
puramente una cortesía de UX. Ver
[`dynamic-ui.md`](./dynamic-ui#capability-gates) para los modos `all` /
`any` / `invert`.

## ¿Cómo emito un evento cuando cambia un registro?

Declará la capability y publicá el evento bajo
`extension_points.events[]` (v3 reemplaza la lista `events: [...]` de
forma libre de v2 con eventos publicados tipados que pueden llevar un
`payload_schema`):

```json
"capabilities": [
  { "kind": "event:emit", "target": "ticket.created", "reason": "Notify creation" },
  { "kind": "event:emit", "target": "ticket.resolved", "reason": "Notify resolution" }
],
"extension_points": {
  "events": [
    { "name": "ticket.created",  "description": "A ticket was created." },
    { "name": "ticket.resolved", "description": "A ticket was resolved." }
  ]
}
```

Los nombres de evento son `<namespace>.<event>` (exactamente dos
segmentos separados por punto). En un webhook / export WASM, llamá a la
API de eventos del host con `{ topic: 'ticket.resolved', payload: {…} }`.
El kernel chequea la capability, persiste el evento, y hace fan-out a los
suscriptores.

Para reacciones automáticas ante operaciones CRUD, declará una
subscription bajo `contributions.subscriptions[]`:

```json
"contributions": {
  "subscriptions": [
    { "event": "ticket.created",
      "handler": { "type": "webhook", "url": "/webhooks/ticket_created" } }
  ]
}
```

## ¿Cómo me suscribo a eventos de otro addon?

Declará la capability y una subscription cuyo `handler` el kernel invoca
cuando el evento dispara:

```json
"capabilities": [
  { "kind": "event:subscribe", "target": "invoice.stamped" }
],
"contributions": {
  "subscriptions": [
    { "event": "invoice.stamped",
      "handler": { "type": "wasm", "function": "OnInvoiceStamped" } }
  ]
}
```

El addon que publica declara `invoice.stamped` bajo su
`extension_points.events[]` así el host conoce el schema.

## ¿Cómo muestro una UI distinta para create vs edit?

`<DynamicRecordDialog>` ya cambia el título y el label de submit según
`mode`. Si necesitás fields distintos, ramificá en el call site y
renderizá dos componentes distintos (o dos modelos de manifest — uno para
el funnel de create, otro para editar el registro persistido).

```tsx
{mode === 'create'
  ? <FullCreationWizard onDone={refetch} />
  : <DynamicRecordDialog open mode="edit" model="tickets" recordId={id} />}
```

## ¿Cómo agrego una columna de soft-delete?

Declará una columna `deleted_at` en el modelo:

```json
{
  "key": "Ticket",
  "table": "tickets",
  "columns": [
    { "name": "id", "type": "uuid", "primary_key": true, "default": "gen_random_uuid()" },
    { "name": "deleted_at", "type": "timestamptz" }
  ]
}
```

El host filtra `deleted_at IS NOT NULL` fuera de las queries default y
rutea un delete a `UPDATE … SET deleted_at = now()`.

## ¿Cómo scopeo registros por organización?

Declará una columna `organization_id` y seteá `tenancy` a nivel top-level:

```json
"tenancy": { "isolation": "shared", "rls_column": "organization_id" },
"models": [
  {
    "key": "Ticket",
    "table": "tickets",
    "columns": [
      { "name": "id", "type": "uuid", "primary_key": true, "default": "gen_random_uuid()" },
      { "name": "organization_id", "type": "uuid", "not_null": true }
    ]
  }
]
```

El kernel estampa `organization_id` en el insert y cada handler Go filtra
por él explícitamente en el path de read/write — ese filtro explícito, no
RLS solo, es el límite real de tenant. También existe una policy de RLS
de Postgres sobre `tenancy.rls_column` como defensa en profundidad, pero
no escribas un path SQL custom (`db_exec`, una query armada a mano) que
se salte el filtro de org asumiendo que RLS solo va a atajar un leak.

Para datos regulados preferí `tenancy.isolation: "schema"`
(schema-per-tenant) — ver [`manifest-spec.md`](./manifest-spec).

## ¿Cómo empaqueto una extensión frontend con mi addon?

Declará una entrada de federación en el manifest:

```json
"frontend": {
  "entry": "/api/metacore/addons/tickets/frontend/remoteEntry.js",
  "format": "federation",
  "expose": "./plugin",
  "container": "metacore_tickets"
}
```

Buildeá el frontend con `@module-federation/vite`, cableado a través de
`metacoreFederationShared()` de `@asteby/metacore-starter-config/vite` —
el helper canónico que pre-declara cada singleton requerido (React,
`@tanstack/react-query`, i18next, los packages del SDK — ver
[`docs/federation.md`](./federation) para la lista completa actual y por
qué importa cada uno; saltearse `@tanstack/react-query` en particular es
la causa más común de un crash "No QueryClient set"). Ver
[`docs/federation.md`](./federation) para el ejemplo completo; la opción
`host` debe matchear el `frontend.container` del manifest.

El módulo expuesto debe exportar `register(api: AddonAPI)`, que recibe el
SDK del host y registra contribuciones a slots, handlers de acción, ítems
de navegación, etc.

```tsx
// frontend/src/plugin.tsx
import type { AddonAPI } from '@asteby/metacore-sdk'

export function register(api: AddonAPI) {
  api.slot.register('dashboard.widgets', RevenueWidget, { priority: 10 })
  api.action.register('tickets', 'reassign', ReassignDialog)
  api.nav.add({ key: 'tickets', label: 'Tickets', to: '/m/tickets' })
}
```

El host lo carga vía `<AddonLoader>` de `@asteby/metacore-runtime-react`.

## ¿Cómo pruebo mi addon localmente?

```bash
metacore validate         # checks estáticos: regex, semver, capabilities, defaults
metacore build --strict   # produce my-addon-0.1.0.tar.gz
metacore inspect *.tar.gz # imprime manifest + migrations + tamaños del bundle
```

Corré un host con una referencia `file:` a tu directorio de addon y
recargá — el kernel re-corre `AutoMigrate` en cada restart en dev. Los
webhooks apuntando a `http://localhost:7101/webhooks/...` funcionan
directo; para WASM, usá `metacore compile-wasm` para producir un
`backend/backend.wasm` fresco antes de recargar.

## ¿Cómo hago prefetch de metadata al bootear la app?

```tsx
import { useMetadataCache } from '@asteby/metacore-runtime-react'

function PrefetchMetadata() {
  const { prefetchAll } = useMetadataCache()
  const api = useApi()
  useEffect(() => { prefetchAll(api) }, [api])
  return null
}
```

`prefetchAll` emite un único `GET /metadata/all` y siembra tanto el cache
de tabla como el de modal. Los montajes subsecuentes de `<DynamicTable>`
renderizan sin round-trip de red. El cache está namespaced por
`metadataVersion` — cuando el kernel lo bumpea, el cache se invalida
automáticamente.

## ¿Cómo agrego una acción de dropdown de fila que linkea a otra página?

No hay una acción de fila tipo "link" en el manifest v3 actual — el path
declarativo es un **display de columna**, no una acción:

```json
{ "name": "invoice_id", "type": "uuid", "display": "url",
  "display_config": { "base_path": "/invoices", "new_tab": false } }
```

`display: "url"` (o `ref` apuntando al modelo target, que el SDK renderiza
como link de relación clickeable por default) convierte la celda en un
link navegable, sin código frontend por app. Para un **botón** en el
dropdown de fila que navega en vez de dispatchear un handler, enviálo
desde un frontend federado (`api.action.register` / una contribución de
slot custom) — ver [`bridge-api.md`](./bridge-api) — en vez de intentar
expresar navegación del lado cliente como una `action` de manifest, que es
solo-dispatch (`handler.type`: `wasm`/`webhook`/`compiled`/`connector`).

## ¿Cómo gateo una acción según el estado actual de la fila?

Usá `requires_state[]` en la acción — el kernel lo **enforcea** al momento
del dispatch (HTTP 422 sobre un estado viejo/no permitido), no solo un hint
de UI:

```json
{
  "key": "resolve",
  "label": "Resolve",
  "icon": "CheckCircle2",
  "confirm": true,
  "target_model": "Ticket",
  "handler": { "type": "wasm", "function": "resolve_ticket" },
  "requires_state": ["open", "in_progress"]
}
```

El host también esconde el trigger del dropdown de fila del lado cliente
cuando el valor actual de `stage_field` (o `status`) de la fila no está en
la lista — pero el check del servidor es el que realmente importa; nunca
confíes solo en el hide del cliente. Si el modelo declara una
[stage machine](#cómo-construyo-un-pipeline-kanban--stage-machine),
preferí expresar los movimientos permitidos una vez vía
`Model.transitions[]` y dejá que cada superficie de action/UI derive de
ahí, en vez de duplicar la lista de estados por acción.

## ¿Cómo agrupo un form grande de create/edit en secciones o un wizard?

Declará `form_layout` en el modelo y atá columnas a una sección por key:

```json
"form_layout": {
  "mode": "sections",
  "sections": [
    { "key": "general", "title": "form.section.general" },
    { "key": "billing", "title": "form.section.billing",
      "visible_when": { "field": "type", "equals": "invoice" } }
  ]
},
"columns": [
  { "name": "title", "type": "string", "section": "general" },
  { "name": "tax_id", "type": "string", "section": "billing" }
]
```

`mode: "steps"` renderiza las mismas secciones como un wizard validado en
vez de bloques colapsables — sin ningún otro cambio necesario. Ver
[manifest-spec.md §5.5](./manifest-spec#55-form_layout-y-columnsectionvisible_when).

## ¿Cómo embebo line items (la sub-tabla de un documento) en el modal padre?

Seteá `embed: true` en la relation hija. El modal de create/edit del padre
renderiza los hijos inline como una sub-tabla editable — esto es opt-in
específicamente para que las colecciones grandes, gestionadas
independientemente (un kardex, movimientos de stock), nunca se arrastren
enteras al form del padre:

```json
"relations": [{
  "name": "items", "kind": "one_to_many",
  "through": "SalesOrderItem", "foreign_key": "order_id",
  "embed": true
}]
```

Ver [manifest-spec.md §5.7](./manifest-spec#57-relations-y-sub-tablas-embebidas).
Para un grupo de line-items dentro de un modal de **acción** (no el form
de create/edit propio de un modelo — ej. un wizard de "recibir
mercadería"), usá `ActionField.type: "array"` + `item_fields[]` en su
lugar; ver
[manifest-spec.md §7.2](./manifest-spec#72-actions--placement-modals-federados-wizards).

## ¿Cómo computo una columna a partir de otras, o sumo un padre desde sus hijos?

Aritmética de la misma fila → `Model.formulas[]` (Tier-2). Agregado del
padre sobre filas hijas → `relation.rollups[]` (Tier-1), que también
potencia la **fila de totales del footer** auto-renderizada:

```json
"formulas": [{ "target": "subtotal", "expr": "quantity * unit_price - discount" }],
"relations": [{
  "name": "items", "kind": "one_to_many", "through": "SalesOrderItem",
  "foreign_key": "order_id", "embed": true,
  "rollups": [{ "target": "total", "fn": "sum", "from": "subtotal" }]
}]
```

`expr` se parsea con una whitelist estricta solo-aritmética
(identificadores, números, `+ - * /`, paréntesis) — nunca puede inyectar
SQL. Cuando el cálculo necesita más que aritmética (una lista de precios
escalonada), seteá `"tier": 3, "handler": "wasm:<export>"` en vez de
`expr`. Ver
[manifest-spec.md §5.3](./manifest-spec#53-formulas-y-rollups--el-motor-de-compute).

## ¿Cómo construyo un pipeline kanban / stage machine?

Declará `stage_field` + `stages[]` + `transitions[]` en el modelo, después
apuntá una entrada de nav a él con `view_type: "kanban"`:

```json
"stage_field": "status",
"stages": [
  { "key": "open", "label": "Abierto", "color": "slate", "order": 0 },
  { "key": "closed", "label": "Cerrado", "color": "green", "order": 1, "is_final": true }
],
"transitions": [{ "from": "open", "to": "closed" }],
"on_transition": [{ "from": "*", "to": "closed", "set": { "closed_at": "now()" } }]
```

```json
"navigation": [{ "items": [{ "title": "sidebar.tickets.board", "url": "/m/tickets",
  "model": "Ticket", "view_type": "kanban", "group_by": "status" }] }]
```

El kernel **enforcea** `transitions[]` server-side (un movimiento no
permitido recibe HTTP 422) y deriva el display `status` de la columna
desde `stages[]` automáticamente — sin necesitar una declaración `options`
aparte. Ver
[manifest-spec.md §5.6](./manifest-spec#56-stage-machines-stage_fieldstagestransitionson_transition).

## ¿Cómo hago seed de filas default al instalar?

```json
"seed": {
  "key": "code",
  "rows": [{ "code": "open", "label": "Abierto" }, { "code": "closed", "label": "Cerrado" }]
}
```

`key` nombra la columna de natural-key contra la que matchea el
installer — una fila solo se inserta cuando ninguna fila existente (para
la org que instala) ya tiene ese valor, así que reinstalaciones/upgrades
nunca duplican datos.

## ¿Cómo agrego lógica de backend en WASM en vez de un webhook?

Seteá `"backend": {"runtime": "wasm", "entry": "backend/backend.wasm",
"exports": [...]}` y referenciá el export desde el `handler` de una
acción:

```json
"backend": { "runtime": "wasm", "entry": "backend/backend.wasm",
  "exports": ["resolve_ticket"], "memory_limit_mb": 64, "timeout_ms": 10000 },
"contributions": { "actions": [{ "key": "resolve", "target_model": "Ticket",
  "handler": { "type": "wasm", "function": "resolve_ticket" } }] }
```

Buildeá con TinyGo según [`wasm-abi.md`](./wasm-abi#5-build). Preferí WASM
sobre un webhook cuando la lógica necesita correr in-process con baja
latencia y sin dependencia de red saliente propia; preferí un webhook
cuando la lógica es más fácil de iterar fuera del sandbox o necesita un
runtime al que WASM no puede targetear.

## ¿Cómo leo/escribo una fila desde un handler WASM sin SQL raw?

Usá los imports del host `data_mutate` / `data_query` en vez de escribir
SQL de `db_exec` a mano — obtenés publicación de evento canónico y el
guard de columnas reservadas gratis:

```json
{ "op": "update", "table": "tickets", "model": "Ticket", "id": "...",
  "data": { "status": "resolved" }, "inc": { "reopen_count": -1 } }
```

`inc{}` es un `SET col = col + delta` atómico — la forma segura de tocar
una columna de contador/stock desde un guest. **No hay transacción
cross-call ni `FOR UPDATE`** disponible para el guest: cada llamada de
import del host commitea por su cuenta. Para un invariante
increment-then-check (stock nunca negativo), combiná `inc{}` con
`Model.locking: "row"` + un guard `Column.constraints[]` declarado en el
manifest — esa seguridad la enforcea el write path Go del kernel, no
desde dentro de WASM. Ver
[`wasm-abi.md` §14](./wasm-abi#14-data_mutate--writes-declarativos-desde-un-guest)
para el contrato completo, y
[§16](./wasm-abi#16-data_batch--batch-atómico-multi-mutación-v17)
(`data_batch`) cuando un invariante abarca más de una fila atómicamente.

## ¿Cómo agrego una página federada completa en vez de la pantalla CRUD genérica?

Exponé un módulo `./pages/<slug>` desde el bundle federado del addon en
vez de (o junto con) `./plugin` — el host lo monta a viewport completo
bajo la ruta propia del addon, con su propio chrome
(`frontend.layout: "immersive"`) o dentro del shell (`"shell"`, el
default). Ver [`full-page-federation.md`](./full-page-federation) para la
config de exposes y el contrato de ruteo, y
[manifest-spec.md §6](./manifest-spec#6-frontend--federación) para los
fields de `frontend{}`.

## ¿Cómo agrego un widget de dashboard federado?

Los widgets declarativos (`stat`/`bar`/`line`/…) necesitan cero código
frontend — solo una `query`. Para un widget totalmente custom, usá
`kind: "custom"` + `expose`:

```json
"contributions": {
  "dashboard": [{
    "key": "heatmap", "title": "dash.heatmap", "kind": "custom",
    "expose": "./StockHeatmap", "size": "lg"
  }]
}
```

`expose` nombra un módulo del bundle `frontend` del addon, montado en el
grid del dashboard con el mismo chrome de card que los widgets
declarativos. Ver [manifest-spec.md §7.3](./manifest-spec#73-dashboard).

## ¿Cómo llamo a un connector (pagos, mensajería) que no poseo?

Seteá el `handler.type` de la acción a `"connector"` en vez de duplicar el
cliente de ese connector:

```json
{ "key": "send_receipt", "target_model": "SalesOrder",
  "handler": { "type": "connector", "connector": "link", "export": "send_message" } }
```

Esto dispatchea `send_message` en el addon que sea que provea el
connector `link`, scoped a org, con el payload de fields de la acción —
sin dependencia del código Go/WASM de ese addon, solo de su contrato de
connector publicado. Ver
[manifest-spec.md §7.2](./manifest-spec#72-actions--placement-modals-federados-wizards).

## ¿Cómo declaro un rol y sus permisos?

La mayoría de los permisos (`<table>.index/create/update/delete`,
`<table>.<action>`) se **derivan automáticamente** — no los declarás.
Usá `rbac.roles[]` solo para agrupar keys en un rol nombrado que un admin
de org pueda asignar:

```json
"rbac": {
  "roles": [{ "key": "ticket_agent", "label": "Agente",
    "permissions": ["ticket.index", "ticket.resolve"] }]
}
```

Los endpoints de options/lookup (`/api/options/:ref`) no llevan **ningún
gate de permisos** por diseño — no confíes en que un rol sin permiso sobre
un modelo también mantenga sus valores fuera de las options de otro
modelo. Ver [manifest-spec.md §10](./manifest-spec#10-rbac--permisos) y
[`dynamic-ui.md`](./dynamic-ui#capabilitygate-vs-permisos-rbac--dos-sistemas-distintos)
para cómo esto difiere del sandbox de `capabilities[]`.

## ¿Cómo publico mi addon al hub?

```bash
metacore keys init && metacore keys show   # registrá la pubkey impresa con un admin del hub
metacore publish --hub https://hub.asteby.com \
  --developer-id "$METACORE_DEVELOPER_ID" --token "$METACORE_TOKEN" \
  --key ~/.metacore/keys/dev.pem
```

`metacore publish` valida, empaqueta, firma (ed25519 hex sobre el sha256
del tarball) y sube. El scanner del hub inspecciona estáticamente
cualquier módulo WASM: los imports `http_request`/`connector_get`
**tienen** que estar respaldados por una capability
`http:fetch`/`connector:read` correspondiente en el manifest o el publish
se rechaza de plano. Todos caen en `pending_review` por default; las
cuentas de developer first-party propias de la plataforma auto-aprueban.
Ver [`addon-publishing.md`](./addon-publishing) para el flujo completo.

---

¿Tenés una receta para agregar? Mandá un PR — las recetas viven en este
archivo como una lista plana, sin anidar.
