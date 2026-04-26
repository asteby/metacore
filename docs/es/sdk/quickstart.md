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
| Go 1.22+ | Requerido si compilás el CLI del addon desde fuente o un backend WASM. |
| TinyGo 0.31+ | Solo si tu addon incluye un backend WASM (opcional para esta guía). |
| Un host Metacore corriendo | Cualquier app host embebiendo el kernel, o una app fresca de `npx create-metacore-app`. |

Si todavía no tenés un host, scaffoldealo en 30 segundos:

```bash
npx create-metacore-app my-host
cd my-host
pnpm dev
```

`create-metacore-app` cablea `@asteby/metacore-starter-config`, theme, UI, auth, i18n y el runtime — ver [`consumer-guide.md`](./consumer-guide) para la integración completa.

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

Abrí `manifest.json` y reemplazá `model_definitions` con:

```json
"model_definitions": [
  {
    "table_name": "tickets",
    "model_key": "tickets",
    "label": "Tickets",
    "org_scoped": true,
    "soft_delete": true,
    "columns": [
      { "name": "number",      "type": "string",  "size": 32,  "required": true, "unique": true },
      { "name": "title",       "type": "string",  "size": 255, "required": true },
      { "name": "description", "type": "text" },
      { "name": "status",      "type": "string",  "size": 20,  "required": true, "default": "'open'", "index": true },
      { "name": "priority",    "type": "string",  "size": 10,  "default": "'normal'" },
      { "name": "due_at",      "type": "timestamp" }
    ]
  }
]
```

Validá el manifest:

```bash
metacore validate
# ok: tickets@0.1.0 passes validation against kernel 2.0.0
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

Declará una acción bajo el modelo:

```json
"actions": {
  "tickets": [
    {
      "key": "resolve",
      "label": "Resolve",
      "icon": "CheckCircle2",
      "confirm": true,
      "confirmMessage": "Mark this ticket as resolved?",
      "requiresState": ["open", "in_progress"]
    }
  ]
}
```

`metacore validate && metacore build --strict` — reiniciá el host. El dropdown de la fila ahora muestra una entrada "Resolve". Al clickearla aparece un diálogo de confirmación (`<ActionModalDispatcher>` decide qué UI renderizar según la forma de la acción) y hace POST a `/data/tickets/<id>/action/resolve`.

Cableá el lado del servidor vía `hooks`:

```json
"hooks": {
  "tickets::resolve": "/webhooks/resolve_ticket"
}
```

El host postea un envelope firmado HMAC a tu webhook con el id del ticket y la identidad del operador. Ver [`addon-publishing.md`](./addon-publishing) para el formato del envelope.

Para UIs de acción que necesitan campos de formulario, agregá `fields: [...]` a la acción — `<ActionModalDispatcher>` va a renderizar un formulario dinámico desde ellos automáticamente. Para modales totalmente custom, registrá un componente:

```tsx
import { actionRegistry } from '@asteby/metacore-sdk'
actionRegistry.register('tickets', 'resolve', MyResolveDialog)
```

El dispatcher va a usar `MyResolveDialog` en vez de la confirmación genérica. Ver [`dynamic-ui.md`](./dynamic-ui.md#actionmodaldispatcher).

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
- [`consumer-guide.md`](./consumer-guide) — construyendo una app host que consume los packages del SDK.
