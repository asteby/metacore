<p align="center">
  <img src="/logo.svg" width="120" alt="Metacore" />
</p>

<h1 align="center">Inicio rápido</h1>

<p align="center">
  <strong>Construí un addon CRUD en 5 minutos — declaralo, no lo programes.</strong>
</p>

Al terminar esta guía vas a tener:

- Un nuevo scaffold de addon con un `manifest.json` declarando un modelo.
- El kernel auto-migrando la tabla al instalar y exponiendo endpoints CRUD.
- Una UI tabular funcional en tu app host — ordenable, filtrable, paginada, con diálogos de create/edit/delete — renderizada desde una sola línea `<DynamicTable model="..." />`.

Sin código de pegamento. Sin controllers. Sin formularios. El contrato es el manifest.

## Tabla de contenidos

- [Prerequisitos](#prerequisitos)
- [Paso 1 — Scaffoldear un addon](#paso-1--scaffoldear-un-addon)
- [Paso 2 — Declará tu modelo](#paso-2--declará-tu-modelo)
- [Paso 3 — Instalalo en un host](#paso-3--instalalo-en-un-host)
- [Paso 4 — Renderizá la UI](#paso-4--renderizá-la-ui)
- [Paso 5 — Agregá una acción custom](#paso-5--agregá-una-acción-custom)
- [Lo que conseguís gratis](#lo-que-conseguís-gratis)
- [Próximos pasos](#próximos-pasos)

## Prerequisitos

| Herramienta | Para qué |
|---|---|
| Node.js 20+ | Frontend del host, scaffolders. |
| pnpm 9+ | Package manager del workspace. |
| Go 1.25+ | Requerido si compilás el CLI del addon desde fuente o un backend WASM (coincide con el `go.mod` del repo). |
| TinyGo 0.31+ | Solo si tu addon incluye un backend WASM (opcional para esta guía). |
| Un host Metacore corriendo | Cualquier app host que embeba el kernel, o una app fresca de `npm create @asteby/metacore-app`. |

Si todavía no tenés un host, scaffoldealo en 30 segundos:

```bash
npm create @asteby/metacore-app my-host
cd my-host
pnpm dev
```

`@asteby/create-metacore-app` cablea `@asteby/metacore-starter-config`, theme, UI, auth, i18n y el runtime — ver [`CONSUMER_GUIDE.md`](./consumer-guide) para la integración completa.

## Paso 1 — Scaffoldear un addon

Instalá el CLI de developer y creá un nuevo directorio de addon:

```bash
go install github.com/asteby/metacore-sdk/cli@latest
metacore init tickets
cd tickets
```

El scaffold deja:

```
tickets/
├── manifest.json              # el contrato — cada host lee esto
├── migrations/
│   └── 0001_init.sql          # DDL inicial, scoped al schema del addon
└── frontend/
    └── src/
        └── plugin.tsx         # entry de UI federada (opcional)
```

El manifest ya declara un modelo (`tickets_items`) con dos columnas. Reemplacémoslo con algo más interesante.

## Paso 2 — Declará tu modelo

`metacore init` emite un manifest **Module Contract v3** (`apiVersion:
"asteby.com/v3"`). Abrí `manifest.json` y reemplazá la entrada de `models[]`
con algo más interesante (v3 declara las columnas completas inline):

```json
"models": [
  {
    "key": "Ticket",
    "table": "tickets",
    "label": "Tickets",
    "columns": [
      { "name": "id",              "type": "uuid",        "primary_key": true, "default": "gen_random_uuid()" },
      { "name": "organization_id", "type": "uuid",        "not_null": true },
      { "name": "number",          "type": "text",        "not_null": true },
      { "name": "title",           "type": "text",        "not_null": true },
      { "name": "description",     "type": "text" },
      { "name": "status",          "type": "text",        "not_null": true, "default": "open" },
      { "name": "priority",        "type": "text",        "default": "normal" },
      { "name": "due_at",          "type": "timestamptz" },
      { "name": "created_at",      "type": "timestamptz", "not_null": true, "default": "now()" }
    ],
    "indices": [
      { "name": "tickets_org_number_uq", "columns": ["organization_id", "number"], "unique": true },
      { "name": "tickets_status_idx",    "columns": ["status"] }
    ]
  }
]
```

Validá el manifest:

```bash
metacore validate
# ok: tickets@0.1.0 passes validation against the v3 contract (asteby.com/v3)
```

`validate` corre los mismos checks que el marketplace ejecuta al subir: regex de identificadores, whitelist de literales por defecto, scoping de capabilities, semver. Las fallas son ruidosas y específicas.

Buildeá el bundle ya que estás — vas a necesitar el `.tar.gz` para instalarlo en un host:

```bash
metacore build --strict
# built tickets-0.1.0.tar.gz (1 migration, 0 frontend files, 0 backend files, target=webhook)
```

`--strict` rechaza warnings (capabilities sin scope, faltan razones, dist de frontend sin tag). Usalo para cualquier build de producción.

## Paso 3 — Instalalo en un host

En dev, dropeá el directorio del addon en la carpeta de installations del host (o symlinkealo). El kernel observa instalaciones al bootear:

```bash
ln -s "$(pwd)" ../my-host/installations/tickets
```

Reiniciá el host. El kernel:

1. Parsea `manifest.json` y corre `AutoMigrate` contra el schema Postgres aislado del addon (`addon_tickets`).
2. Agrega `org_id` (porque `org_scoped: true`), `deleted_at` (porque `soft_delete: true`) y las columnas estándar `id`/`created_at`/`updated_at`.
3. Registra `/data/tickets` (CRUD) y `/metadata/table/tickets` (metadata de UI) bajo el namespace de routes `/m/tickets`.

Verificá que esté arriba:

```bash
curl http://localhost:8080/api/metadata/table/tickets | jq '.data.columns | length'
# 9
```

## Paso 4 — Renderizá la UI

En el frontend del host, montá un componente:

```tsx
// src/routes/tickets.tsx
import { DynamicTable } from '@asteby/metacore-runtime-react'

export function TicketsPage() {
  return (
    <div className="h-full p-6">
      <h1 className="text-2xl font-semibold mb-4">Tickets</h1>
      <DynamicTable model="tickets" />
    </div>
  )
}
```

Recargá el host. Deberías ver:

- Una tabla con columnas `number`, `title`, `status`, `priority`, `due_at`.
- Un buscador, filtros por columna, headers ordenables.
- Paginación con el default que declaró el manifest (o 10).
- Acciones de fila (`view`, `edit`, `delete`) bajo el dropdown.
- Un botón "Crear" que abre un modal manejado por la misma metadata.

Escribiste cero código de rendering. Cada tipo de columna, cada filtro, cada diálogo viene del documento de metadata que el kernel materializó desde tu manifest. Ver [`dynamic-ui.md`](./dynamic-ui) para la superficie completa.

## Paso 5 — Agregá una acción custom

En v3, las acciones viven bajo `contributions.actions[]`. Cada acción trae su
propio `handler` (el lado servidor se cablea *dentro de la acción*, no en un
mapa `hooks{}` aparte). Declará una acción respaldada por webhook:

```json
"contributions": {
  "actions": [
    {
      "key": "resolve",
      "label": "Resolve",
      "icon": "CheckCircle2",
      "target_model": "Ticket",
      "handler": { "type": "webhook", "url": "/webhooks/resolve_ticket" },
      "confirm": true,
      "confirm_message": "Mark this ticket as resolved?"
    }
  ]
}
```

`metacore validate && metacore build --strict` — reiniciá el host. El dropdown de la fila ahora muestra una entrada "Resolve". Al clickearla aparece un diálogo de confirmación (`<ActionModalDispatcher>` decide qué UI renderizar según la forma de la acción) y dispatchea al `handler` de la acción.

El handler puede ser un `webhook` (el host postea un envelope firmado HMAC a `handler.url` con el id del ticket y la identidad del operador) o una función `wasm` (`{ "type": "wasm", "function": "ResolveTicket" }` — el export nombrado de tu `backend/backend.wasm` compilado). Ver [`addon-publishing.md`](./addon-publishing) para el formato del envelope y [`wasm-abi.md`](./wasm-abi) para el ABI de wasm.

Para UIs de acción que necesitan campos de formulario, agregá `fields: [...]` a la acción — `<ActionModalDispatcher>` va a renderizar un formulario dinámico desde ellos automáticamente. Para modales totalmente custom, registrá un componente:

```tsx
import { registerActionComponent } from '@asteby/metacore-sdk'
registerActionComponent('tickets', 'resolve', MyResolveDialog)
```

El dispatcher va a usar `MyResolveDialog` en vez de la confirmación genérica. Ver [`dynamic-ui.md`](./dynamic-ui#actionmodaldispatcher).

## Lo que conseguís gratis

Por aproximadamente 25 líneas de JSON y 1 línea de TSX:

| Capa | Lo que produjo el manifest |
|---|---|
| Base de datos | Tabla `addon_tickets.tickets` con constraints, índices, FK refs, RLS para org scoping, columna de soft delete. |
| HTTP | Listado paginado, fetch de un registro, create, update, delete, endpoints de acciones custom. |
| Metadata | `/metadata/table/tickets`, `/metadata/modal/tickets`, `/metadata/all` (el endpoint de prefetch). |
| Permisos | Checks de capabilities contra `db:read`/`db:write` en el schema propio del addon (implícito) y cualquier acceso cross-schema que declaraste. |
| Frontend | Tabla ordenable/filtrable/paginada, modal de create/edit/view, dispatcher de acciones custom, bulk delete con progreso, filtros sincronizables con URL, gates de capabilities. |
| Lifecycle | Hooks `before_create`, `after_create`, `before_update`, `after_update`, `before_delete`, `after_delete` si los cableás. |

Lo que *no* escribiste: un controller, un archivo de routes, una migración SQL, un componente de formulario, un renderer de columna, un diálogo de confirmación, una state machine para el botón de acción, un `axios.delete`, ni un middleware de permisos.

## Próximos pasos

- [`dynamic-ui.md`](./dynamic-ui) — todos los componentes del runtime, con props y patrones de personalización.
- [`addon-cookbook.md`](./addon-cookbook) — recetas: foreign keys, validaciones custom, soft delete, emisión de eventos, modales custom.
- [`manifest-spec.md`](./manifest-spec) — cada campo de `manifest.json`.
- [`capabilities.md`](./capabilities) — declarando permisos sandboxed.
- [`wasm-abi.md`](./wasm-abi) — cuando necesitás lógica server-side con un backend TinyGo.
- [`addon-publishing.md`](./addon-publishing) — firma, upload y el flujo de review del marketplace.
- [`CONSUMER_GUIDE.md`](./consumer-guide) — construyendo una app host que consume los packages del SDK.
