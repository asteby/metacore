<p align="center">
  <img src="/logo.svg" width="120" alt="Metacore" />
</p>

<h1 align="center">Referencia de <code>manifest.json</code></h1>

El manifest es el **contrato único** entre un addon y el kernel de metacore.
Es consumido por Go (`kernel/manifest`) y mirroreado por el SDK TS vía
[`tygo`](https://github.com/gzuidhof/tygo). Este documento refleja
`APIVersion = "2.0.0"`.

Cuando esta especificación evoluciona, `APIVersion` se bumpea y se documenta
un path de migración. Los addons opt-in a una ventana de compatibilidad
vía el field top-level `kernel`.

## Tabla de contenidos

- [Fields top-level](#fields-top-level)
- [1. Identidad](#1-identidad)
- [2. Aislamiento de tenants](#2-aislamiento-de-tenants)
- [3. `model_definitions[]`](#3-model_definitions)
- [4. `navigation[]`](#4-navigation)
- [5. `actions{}`](#5-actions-disparadas-por-ui)
- [6. `tools[]`](#6-tools-disparadas-por-llm)
- [7. `capabilities[]`](#7-capabilities)
- [8. `hooks{}` y `lifecycle_hooks{}`](#8-hooks-y-lifecycle_hooks)
- [9. `settings[]`](#9-settings)
- [10. `frontend{}`](#10-frontend)
- [11. `backend{}`](#11-backend)
- [12. `signature{}`](#12-signature)
- [13. `events[]`](#13-events)

## Fields top-level

| Field | Tipo | Requerido | Sección |
|---|---|---|---|
| `key`, `name`, `version`, `kernel` | string | sí (key/name/version) | [Identidad](#1-identidad) |
| `description`, `category`, `author`, `website`, `license`, `icon_*` | string | no | [Identidad](#1-identidad) |
| `tenant_isolation` | enum | no (default `"shared"`) | [Aislamiento de tenants](#2-aislamiento-de-tenants) |
| `model_definitions` | array | no | [Modelos](#3-model_definitions) |
| `navigation` | array | no | [Navigation](#4-navigation) |
| `actions` | object | no | [Actions](#5-actions-disparadas-por-ui) |
| `tools` | array | no | [Tools](#6-tools-disparadas-por-llm) |
| `capabilities` | array | recomendado | [Capabilities](#7-capabilities) |
| `hooks`, `lifecycle_hooks` | object | no | [Hooks](#8-hooks-y-lifecycle_hooks) |
| `settings` | array | no | [Settings](#9-settings) |
| `frontend` | object | no | [Frontend](#10-frontend) |
| `backend` | object | no | [Backend](#11-backend) |
| `signature` | object | stampeado al publicar | [Signature](#12-signature) |
| `events` | string[] | no | [Events](#13-events) |
| `i18n` | object | no | Locale → árbol de namespace, mergeado al i18next del host vía [`I18nProvider`](./dynamic-ui.md#i18n). |

## 1. Identidad

```json
{
  "key": "fiscal_mexico",
  "name": "Facturación Electrónica México",
  "version": "1.0.0",
  "kernel": ">=2.0.0 <3.0.0"
}
```

| Field | Tipo | Requerido | Notas |
|---|---|---|---|
| `key` | string | sí | Regex `^[a-z][a-z0-9_]{1,63}$`. Globalmente único. Define el schema Postgres `addon_<key>` y el namespace de routes `/m/<key>`. |
| `name` | string | sí | Nombre para mostrar. |
| `description` | string | no | Descripción corta, mostrada en la card del marketplace. |
| `version` | string | sí | Semver estricto. |
| `category` | string | no | Una de `integration`, `utility`, `finance`, `crm`, `operations`, `ai`. |
| `kernel` | string | recomendado | Rango semver que el kernel del host debe satisfacer. Vacío = legacy. |
| `author`, `website`, `license` | string | no | Metadata de marketplace. |
| `icon_type`, `icon_slug`, `icon_color` | string | no | Triplete para renderizado más rico. `icon_type`: `"lucide"`, `"brand"` (simple-icons), o `"url"`. |

## 2. Aislamiento de tenants

```json
"tenant_isolation": "shared"
```

| Valor | Comportamiento |
|---|---|
| `"shared"` (default) | Schema único `addon_<key>`, columna `organization_id` + Postgres RLS. |
| `"schema-per-tenant"` | Un schema por instalación (`addon_<key>_<orgshort>`), creado al instalar y dropeado al desinstalar. Usar para data regulada. |
| `"database-per-tenant"` | Reservado para uso futuro. |

Vacío se trata como `shared` por compatibilidad hacia atrás.

## 3. `model_definitions[]`

Cada entrada se materializa como `CREATE TABLE addon_<key>.<table_name>`.

```json
"model_definitions": [{
  "table_name": "tickets",
  "model_key": "tickets",
  "label": "Tickets",
  "org_scoped": true,
  "soft_delete": true,
  "columns": [
    { "name": "title",  "type": "string", "size": 255, "required": true },
    { "name": "status", "type": "string", "size": 20, "default": "'open'", "index": true },
    { "name": "total",  "type": "decimal", "default": 0 },
    { "name": "opened_at", "type": "timestamp", "default": "now()" }
  ]
}]
```

### Tipos de columna

| Tipo | Postgres | Notas |
|---|---|---|
| `string` | `varchar(<size>)` | `size` requerido, máximo 10485760. |
| `text` | `text` | Sin límite. |
| `uuid` | `uuid` | |
| `int` | `integer` | |
| `bigint` | `bigint` | |
| `decimal` | `numeric` | |
| `bool` | `boolean` | |
| `timestamp` | `timestamptz` | Siempre con timezone. |
| `jsonb` | `jsonb` | |

### Opciones de columna

| Field | Tipo | Significado |
|---|---|---|
| `required` | bool | Constraint NOT NULL. |
| `index` | bool | Crea un índice btree. |
| `unique` | bool | Constraint UNIQUE. |
| `default` | any | Ver whitelist abajo. |
| `ref` | string | Target de foreign key. `"orders"` o `"addon_tickets.comments"`. |

### Whitelist de `default`

`default` va raw al DDL. Solo estos literales pasan validación:

| Forma | Ejemplo |
|---|---|
| Numérico | `42`, `-3`, `3.14` |
| String entrecomillado | `"'open'"`, `"'es-MX'"` (sin `'`, `"`, `;`, `\` embebidos) |
| Llamada a builtin | `"now()"`, `"gen_random_uuid()"`, `"uuid_generate_v4()"`, `"current_timestamp"` |
| Boolean / null | `true`, `false`, `"null"` |

Cualquier otra cosa (incluyendo SQL arbitrario) es rechazada por `metacore validate`.

### Regex de keys

Cada identificador suministrado por el usuario (`key`, `model_key`, `table_name`,
`name` de columna) debe matchear `^[a-z][a-z0-9_]{1,63}$`. Esto bloquea tanto SQL injection
como ambigüedades de quoting de Postgres.

## 4. `navigation[]`

```json
"navigation": [{
  "title": "sidebar.tickets",
  "icon": "Ticket",
  "target": "sidebar.operations",
  "items": [{
    "title": "sidebar.tickets.board",
    "url": "/m/tickets",
    "icon": "Kanban",
    "model": "tickets"
  }]
}]
```

- `target` (opcional): id de un grupo existente del sidebar core. Cuando
  matchea, los items se mergean adentro; si no, se crea un grupo nuevo.
- `model`: cuando está presente, el host sabe que la route es CRUD dinámico sobre esa
  tabla. No se requiere código de frontend.

## 5. `actions{}` (disparadas por UI)

```json
"actions": {
  "tickets": [{
    "key": "resolve",
    "label": "Resolve",
    "confirm": true,
    "requiresState": ["open", "in_progress"],
    "fields": [
      { "name": "note", "type": "text", "required": true }
    ]
  }]
}
```

Ejecutado como `POST /api/models/tickets/:id/actions/resolve`. El host
despacha a un webhook declarado en `hooks`, un export WASM, o un
`ActionInterceptor` compilado. `modal: "custom_slug"` abre un modal de frontend custom.

## 6. `tools[]` (disparadas por LLM)

Contraparte semántica de las acciones. Hosts conversacionales las registran en
su registry de agent-tool al instalar.

```json
"tools": [{
  "id": "create_order",
  "name": "Crear pedido",
  "description": "Crea un pedido cuando el cliente expresa intención de comprar. NO llamar para cotizaciones.",
  "category": "action",
  "endpoint": "/webhooks/create_order",
  "method": "POST",
  "input_schema": [
    { "name": "product_sku", "type": "string", "required": true,
      "extraction_hint": "Código tipo SKU-123 o nombre del producto",
      "normalize": "uppercase" },
    { "name": "quantity", "type": "number", "default_value": "1",
      "extraction_hint": "Si el cliente dice 'una' o 'un par' inferir 1 o 2" }
  ],
  "trigger_keywords": ["pedido", "comprar", "quiero"],
  "trigger_intents": ["order.create"],
  "timeout": 15
}]
```

| Field | Propósito |
|---|---|
| `description` | Prompt que el LLM ve. Sé específico; incluí casos negativos. |
| `trigger_keywords` / `trigger_intents` | Hints para la capa de routing. |
| `input_schema[i].extraction_hint` | Instrucción en lenguaje natural para el LLM al extraer ese field. |
| `input_schema[i].normalize` | Transform post-extracción: `uppercase`, `lowercase`, `trim`, `phone_e164`. |
| `input_schema[i].validation` | Regex que el valor debe matchear después de la normalización. |
| `cache_ttl` | Segundos; distinto de cero marca el tool como tipo idempotent-GET. |

## 7. `capabilities[]`

Permisos sandboxed que el addon solicita. Enforceados en runtime por
`kernel/security/context.go`. Ver [capabilities.md](./capabilities) para
el catálogo completo de kinds y reglas de validación.

```json
"capabilities": [
  { "kind": "db:read",    "target": "users", "reason": "Display author names" },
  { "kind": "http:fetch", "target": "api.factura.com", "reason": "Timbrar CFDI" },
  { "kind": "event:emit", "target": "fiscal.stamped" }
]
```

El schema propio del addon (`addon_<key>.*`) es siempre accesible — nunca lo declares.

## 8. `hooks{}` y `lifecycle_hooks{}`

```json
"hooks": {
  "tickets::resolve": "/webhooks/resolve_ticket"
}
```

- `hooks`: `"<model>::<action>" → <path o URL del webhook>`. El host hace POST
  de un envelope firmado HMAC (ver [addon-publishing.md](./addon-publishing)).
- `lifecycle_hooks`: triggers CRUD por modelo:
  ```json
  "lifecycle_hooks": {
    "tickets": [
      { "event": "after_create",
        "target": { "type": "webhook", "url": "/webhooks/ticket_created" },
        "async": true }
    ]
  }
  ```
  Tipos de target: `webhook`, `wasm_call`, `agent_task`.

## 9. `settings[]`

Valores configurables por instalación. Almacenados por el host en
`metacore_installations.settings`.

```json
"settings": [
  { "key": "slack_webhook", "label": "Slack webhook", "type": "text", "secret": true },
  { "key": "default_locale", "label": "Locale",
    "type": "select",
    "default_value": "es-MX",
    "options": [
      { "value": "es-MX", "label": "Español (México)" },
      { "value": "en-US", "label": "English (US)" }
    ] }
]
```

`secret: true` asegura que el valor nunca sale del servidor en GETs y se
almacena en el secrets manager cuando el host lo soporta.

## 10. `frontend{}`

```json
"frontend": {
  "entry": "https://cdn.example.com/addons/tickets@1.0.0/remoteEntry.js",
  "format": "federation",
  "expose": "./plugin",
  "container": "metacore_tickets",
  "integrity": "sha384-..."
}
```

| Field | Significado |
|---|---|
| `entry` | URL o path relativo de `remoteEntry.js`. |
| `format` | `"federation"` (recomendado) o `"script"` (window global legacy). |
| `expose` | Nombre de módulo de federation para importar (ej. `./plugin`). |
| `container` | Nombre del container global. Debe matchear la opción `name` de `@originjs/vite-plugin-federation`. Default: `metacore_<key>`. |
| `integrity` | Hash SRI opcional. |

## 11. `backend{}`

```json
"backend": {
  "runtime": "wasm",
  "entry": "backend/backend.wasm",
  "exports": ["resolve_ticket", "ping"],
  "memory_limit_mb": 64,
  "timeout_ms": 10000
}
```

| Runtime | Comportamiento |
|---|---|
| `"webhook"` (default) | Los hooks despachan como HTTP firmado HMAC saliente. |
| `"wasm"` | Sandboxed in-process por [wasm-abi.md](./wasm-abi). |
| `"binary"` | Reservado. |

## 12. `signature{}`

Stampeado por el marketplace al publicar. Contiene `developer_id`,
`algorithm` (`ed25519`), `digest` (sha256 del bundle), valor de firma
y checksums por archivo. Los addons nunca escriben este bloque; lo produce
`metacore sign` y lo verifica el host al instalar.

## 13. `events[]`

Lista de nombres de topic que el addon va a publicar. Hosts con un event bus
registran el schema; los suscriptores declaran `capabilities: [{kind: "event:subscribe"}]`.

```json
"events": ["ticket.created", "ticket.resolved"]
```

## Ver también

- [`dynamic-ui.md`](./dynamic-ui) — cómo el SDK convierte la metadata derivada de este manifest en una UI CRUD funcional.
- [`addon-cookbook.md`](./addon-cookbook) — recetas para foreign keys, soft delete, acciones custom, eventos y más.
- [`capabilities.md`](./capabilities) — catálogo completo de valores `kind` y patterns de target.
- [`quickstart.md`](./quickstart) — walkthrough hands-on end-to-end.
