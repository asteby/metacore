<p align="center">
  <img src="/logo.svg" width="120" alt="Metacore" />
</p>

<h1 align="center">Recetario de addons</h1>

Recetas cortas para los patrones que aparecen al construir addons. Cada entrada es una pregunta, el snippet mínimo que funciona, y una nota de una línea sobre el *por qué*. Para contexto profundo de cualquier feature, seguí los links a [`manifest-spec.md`](./manifest-spec) y [`dynamic-ui.md`](./dynamic-ui).

## Tabla de contenidos

- [¿Cómo agrego una relación foreign-key?](#cómo-agrego-una-relación-foreign-key)
- [¿Cómo hago una columna buscable?](#cómo-hago-una-columna-buscable)
- [¿Cómo agrego una validación custom?](#cómo-agrego-una-validación-custom)
- [¿Cómo creo una acción custom con un modal?](#cómo-creo-una-acción-custom-con-un-modal)
- [¿Cómo requiero un permiso para un botón?](#cómo-requiero-un-permiso-para-un-botón)
- [¿Cómo emito un evento cuando un registro cambia?](#cómo-emito-un-evento-cuando-un-registro-cambia)
- [¿Cómo me suscribo a eventos de otro addon?](#cómo-me-suscribo-a-eventos-de-otro-addon)
- [¿Cómo muestro una UI distinta para create vs edit?](#cómo-muestro-una-ui-distinta-para-create-vs-edit)
- [¿Cómo agrego una columna de soft-delete?](#cómo-agrego-una-columna-de-soft-delete)
- [¿Cómo scopeo registros por organización?](#cómo-scopeo-registros-por-organización)
- [¿Cómo bundleo una extensión de frontend con mi addon?](#cómo-bundleo-una-extensión-de-frontend-con-mi-addon)
- [¿Cómo testeo mi addon localmente?](#cómo-testeo-mi-addon-localmente)
- [¿Cómo precargo metadata al boot de la app?](#cómo-precargo-metadata-al-boot-de-la-app)
- [¿Cómo agrego una acción de dropdown de fila que linkea a otra página?](#cómo-agrego-una-acción-de-dropdown-de-fila-que-linkea-a-otra-página)
- [¿Cómo gateo una acción según el estado actual de la fila?](#cómo-gateo-una-acción-según-el-estado-actual-de-la-fila)

## ¿Cómo agrego una relación foreign-key?

Declará `ref` en la columna. El host genera la constraint `FOREIGN KEY` y expone un endpoint `/options/<model>` que el relation picker del modal usa.

```json
{
  "table_name": "ticket_comments",
  "columns": [
    { "name": "ticket_id", "type": "uuid", "required": true,
      "ref": "addon_tickets.tickets" }
  ]
}
```

El diálogo de edit va a renderizar un combobox buscable para `ticket_id`. Los targets pueden ser cross-schema (`addon_<other>.<table>`) o core (`users`, `organizations`).

## ¿Cómo hago una columna buscable?

Dos capas — filtrabilidad a nivel columna (manejada por metadata, surfaceada como un chip de filtro por columna en el toolbar) y búsqueda global (manejada por el input de texto libre del toolbar).

```json
{
  "name": "title",
  "type": "string",
  "size": 255,
  "searchable": true,
  "filterable": true
}
```

`searchable: true` incluye la columna en la búsqueda global estilo ILIKE que el toolbar emite como `?search=`. `filterable: true` hace que el kernel produzca un `FilterDefinition` para que los usuarios vean un botón de filtro por columna.

## ¿Cómo agrego una validación custom?

Para fields de acción, agregá `validation` (regex aplicado después de `normalize`):

```json
"input_schema": [
  { "name": "rfc", "type": "string", "required": true,
    "normalize": "uppercase",
    "validation": "^[A-ZÑ&]{3,4}\\d{6}[A-Z0-9]{3}$" }
]
```

Para constraints de columna más allá de lo que expresa el manifest (NOT NULL, UNIQUE, length), validá en tu handler de acción / export WASM. Mantené las constraints de schema declarativas; mantené las reglas de negocio en código.

## ¿Cómo creo una acción custom con un modal?

Declará la acción bajo el modelo con `fields[]`:

```json
"actions": {
  "tickets": [
    {
      "key": "reassign",
      "label": "Reassign",
      "icon": "UserPlus",
      "fields": [
        { "name": "assignee_id", "label": "New assignee", "type": "user", "required": true },
        { "name": "note", "label": "Note", "type": "text" }
      ]
    }
  ]
}
```

`<DynamicTable>` agrega "Reassign" al dropdown de fila. Clickearla dispara `<ActionModalDispatcher>`, que renderiza un modal con los inputs declarados y hace POST a `/data/tickets/<id>/action/reassign`. Cableá el lado servidor vía `hooks` (webhook), un export WASM, o un `ActionInterceptor` compilado — ver [`manifest-spec.md`](./manifest-spec.md#8-hooks-and-lifecycle_hooks).

Para UI totalmente custom registrá un componente:

```tsx
import { actionRegistry } from '@asteby/metacore-sdk'
actionRegistry.register('tickets', 'reassign', ReassignDialog)
```

El dispatcher rutea a tu componente cuando `(model, action.key)` coincide.

## ¿Cómo requiero un permiso para un botón?

Envolvé el affordance en `<CapabilityGate>`:

```tsx
import { CapabilityGate } from '@asteby/metacore-runtime-react'

<CapabilityGate require="db:write addon_tickets.tickets">
  <Button onClick={createTicket}>New ticket</Button>
</CapabilityGate>
```

El kernel sigue enforciando la misma capability server-side — gatear UI es puramente una cortesía de UX. Ver [`dynamic-ui.md`](./dynamic-ui.md#capability-gates) para los modos `all` / `any` / `invert`.

## ¿Cómo emito un evento cuando un registro cambia?

Declará la capability y el topic del evento:

```json
"capabilities": [
  { "kind": "event:emit", "target": "ticket.*", "reason": "Notify state changes" }
],
"events": ["ticket.created", "ticket.resolved"]
```

En un webhook / export WASM, llamá la API de eventos del host con `{ topic: 'ticket.resolved', payload: {…} }`. El kernel chequea la capability, persiste el evento, y lo distribuye a los suscriptores.

Para eventos automáticos en cada operación CRUD, usá `lifecycle_hooks`:

```json
"lifecycle_hooks": {
  "tickets": [
    { "event": "after_create",
      "target": { "type": "webhook", "url": "/webhooks/ticket_created" },
      "async": true }
  ]
}
```

## ¿Cómo me suscribo a eventos de otro addon?

Declará la capability y traé eventos del bus en tu handler:

```json
"capabilities": [
  { "kind": "event:subscribe", "target": "invoice.stamped" }
]
```

El addon publicador debe declarar `events: ["invoice.stamped"]` para que el host conozca el schema. Suscribite vía la API de bus del kernel en tu módulo WASM o vía un webhook que el kernel llama cuando el evento dispara.

## ¿Cómo muestro una UI distinta para create vs edit?

`<DynamicRecordDialog>` ya intercambia título y label de submit por `mode`. Si necesitás fields distintos, branchá en el call site y renderizá dos componentes distintos (o dos modelos de manifest — uno para el funnel de creación, otro para editar el registro persistido).

```tsx
{mode === 'create'
  ? <FullCreationWizard onDone={refetch} />
  : <DynamicRecordDialog open mode="edit" model="tickets" recordId={id} />}
```

## ¿Cómo agrego una columna de soft-delete?

```json
{
  "table_name": "tickets",
  "soft_delete": true,
  "columns": [ /* … */ ]
}
```

El host agrega una columna `deleted_at timestamptz`, la filtra fuera de las queries por defecto, y rutea `DELETE /data/tickets/<id>` a un `UPDATE … SET deleted_at = now()`. Sin cableado a nivel app requerido.

## ¿Cómo scopeo registros por organización?

```json
{
  "table_name": "tickets",
  "org_scoped": true,
  "columns": [ /* … */ ]
}
```

El host agrega una columna `organization_id`, le pone NOT NULL + index, aplica una policy RLS de Postgres, y stampea la columna en insert. Las lecturas cross-tenant son negadas por el kernel incluso si una capability las permitiría de otro modo.

Para data regulada preferí `tenant_isolation: "schema-per-tenant"` — ver [`manifest-spec.md`](./manifest-spec.md#2-tenant-isolation).

## ¿Cómo bundleo una extensión de frontend con mi addon?

Declará un entry de federación en el manifest:

```json
"frontend": {
  "entry": "/api/metacore/addons/tickets/frontend/remoteEntry.js",
  "format": "federation",
  "expose": "./plugin",
  "container": "metacore_tickets"
}
```

Buildeá el frontend con `@originjs/vite-plugin-federation` y un `name` que matchee `container`. El módulo expuesto debe exportar `register(api: AddonAPI)`, que recibe el SDK del host y registra contribuciones de slot, handlers de acción, items de navegación, etc.

```tsx
// frontend/src/plugin.tsx
import type { AddonAPI } from '@asteby/metacore-sdk'

export function register(api: AddonAPI) {
  api.slot.register('dashboard.widgets', RevenueWidget, { priority: 10 })
  api.action.register('tickets', 'reassign', ReassignDialog)
  api.nav.add({ key: 'tickets', label: 'Tickets', to: '/m/tickets' })
}
```

El host lo carga vía `<AddonLoader>` desde `@asteby/metacore-runtime-react`.

## ¿Cómo testeo mi addon localmente?

```bash
metacore validate         # checks estáticos: regex, semver, capabilities, defaults
metacore build --strict   # produce my-addon-0.1.0.tar.gz
metacore inspect *.tar.gz # imprime manifest + migraciones + tamaños del bundle
```

Corré un host con una referencia `file:` a tu directorio de addon y recargá — el kernel re-corre `AutoMigrate` en cada restart en dev. Los webhooks apuntando a `http://localhost:7101/webhooks/...` funcionan directo; para WASM, usá `metacore compile-wasm` para producir un `backend/backend.wasm` fresco antes de recargar.

## ¿Cómo precargo metadata al boot de la app?

```tsx
import { useMetadataCache } from '@asteby/metacore-runtime-react'

function PrefetchMetadata() {
  const { prefetchAll } = useMetadataCache()
  const api = useApi()
  useEffect(() => { prefetchAll(api) }, [api])
  return null
}
```

`prefetchAll` emite un solo `GET /metadata/all` y siembra los caches de tabla y modal. Mounts subsiguientes de `<DynamicTable>` renderizan sin round-trip de red. El cache está namespaceado por `metadataVersion` — cuando el kernel lo bumpea, el cache se invalida automáticamente.

## ¿Cómo agrego una acción de dropdown de fila que linkea a otra página?

Declará una acción con `type: "link"` y un template `linkUrl`:

```json
{
  "key": "open_invoice",
  "label": "Open invoice",
  "icon": "ExternalLink",
  "type": "link",
  "linkUrl": "/invoices/{invoice_id}"
}
```

Tokens como `{invoice_id}` son reemplazados con el valor de la fila antes de la navegación. `<DynamicTable>` reconoce `type: "link"` y usa el `navigate()` de TanStack Router del host en vez de abrir un modal.

## ¿Cómo gateo una acción según el estado actual de la fila?

Usá `condition` para esconder la acción del dropdown cuando la fila no matchea, y `requiresState` para asegurarlo en el servidor:

```json
{
  "key": "resolve",
  "label": "Resolve",
  "icon": "CheckCircle2",
  "confirm": true,
  "condition": { "field": "status", "operator": "in", "value": ["open", "in_progress"] },
  "requiresState": ["open", "in_progress"]
}
```

`condition` filtra el dropdown del lado cliente (`eq`, `neq`, `in`, `not_in`); `requiresState` hace que el kernel rechace ejecuciones obsoletas donde el estado de la fila cambió entre el fetch y el click.

---

¿Tenés una receta para agregar? Mandá un PR — las recetas viven en este archivo como una lista plana, sin anidar.
