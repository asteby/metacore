<p align="center">
  <img src="/logo.svg" width="120" alt="Metacore" />
</p>

<h1 align="center"><code>manifest.json</code> reference</h1>

The manifest is the **single contract** between an addon and the metacore
kernel. It is consumed by Go (`kernel/manifest`) and mirrored by the TS SDK
via [`tygo`](https://github.com/gzuidhof/tygo). This document reflects
`APIVersion = "2.0.0"`.

When this spec evolves, `APIVersion` is bumped and a migration path is
documented. Addons opt into a compatibility window via the top-level
`kernel` field.

## Table of contents

- [Top-level fields](#top-level-fields)
- [1. Identity](#1-identity)
- [2. Tenant isolation](#2-tenant-isolation)
- [3. `model_definitions[]`](#3-model_definitions)
- [4. `navigation[]`](#4-navigation)
- [5. `actions{}`](#5-actions-ui-triggered)
- [6. `tools[]`](#6-tools-llm-triggered)
- [7. `capabilities[]`](#7-capabilities)
- [8. `hooks{}` and `lifecycle_hooks{}`](#8-hooks-and-lifecycle_hooks)
- [9. `settings[]`](#9-settings)
- [10. `frontend{}`](#10-frontend)
- [11. `backend{}`](#11-backend)
- [12. `signature{}`](#12-signature)
- [13. `events[]`](#13-events)

## Top-level fields

| Field | Type | Required | Section |
|---|---|---|---|
| `key`, `name`, `version`, `kernel` | string | yes (key/name/version) | [Identity](#1-identity) |
| `description`, `category`, `author`, `website`, `license`, `icon_*` | string | no | [Identity](#1-identity) |
| `tenant_isolation` | enum | no (default `"shared"`) | [Tenant isolation](#2-tenant-isolation) |
| `model_definitions` | array | no | [Models](#3-model_definitions) |
| `navigation` | array | no | [Navigation](#4-navigation) |
| `actions` | object | no | [Actions](#5-actions-ui-triggered) |
| `tools` | array | no | [Tools](#6-tools-llm-triggered) |
| `capabilities` | array | recommended | [Capabilities](#7-capabilities) |
| `hooks`, `lifecycle_hooks` | object | no | [Hooks](#8-hooks-and-lifecycle_hooks) |
| `settings` | array | no | [Settings](#9-settings) |
| `frontend` | object | no | [Frontend](#10-frontend) |
| `backend` | object | no | [Backend](#11-backend) |
| `signature` | object | stamped at publish | [Signature](#12-signature) |
| `events` | string[] | no | [Events](#13-events) |
| `i18n` | object | no | Locale → namespace tree, merged into the host's i18next via [`I18nProvider`](./dynamic-ui.md#i18n). |

## 1. Identity

```json
{
  "key": "fiscal_mexico",
  "name": "Facturación Electrónica México",
  "version": "1.0.0",
  "kernel": ">=2.0.0 <3.0.0"
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `key` | string | yes | Regex `^[a-z][a-z0-9_]{1,63}$`. Globally unique. Defines the Postgres schema `addon_<key>` and the route namespace `/m/<key>`. |
| `name` | string | yes | Display name. |
| `description` | string | no | Short description, shown in the marketplace card. |
| `version` | string | yes | Strict semver. |
| `category` | string | no | One of `integration`, `utility`, `finance`, `crm`, `operations`, `ai`. |
| `kernel` | string | recommended | Semver range the host kernel must satisfy. Empty = legacy. |
| `author`, `website`, `license` | string | no | Marketplace metadata. |
| `icon_type`, `icon_slug`, `icon_color` | string | no | Triplet for richer rendering. `icon_type`: `"lucide"`, `"brand"` (simple-icons), or `"url"`. |

## 2. Tenant isolation

```json
"tenant_isolation": "shared"
```

| Value | Behaviour |
|---|---|
| `"shared"` (default) | Single schema `addon_<key>`, `organization_id` column + Postgres RLS. |
| `"schema-per-tenant"` | One schema per installation (`addon_<key>_<orgshort>`), created on install and dropped on uninstall. Use for regulated data. |
| `"database-per-tenant"` | Reserved for future use. |

Empty is treated as `shared` for backwards compatibility.

## 3. `model_definitions[]`

Each entry is materialized as `CREATE TABLE addon_<key>.<table_name>`.

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

### Column types

| Type | Postgres | Notes |
|---|---|---|
| `string` | `varchar(<size>)` | `size` required, max 10485760. |
| `text` | `text` | Unbounded. |
| `uuid` | `uuid` | |
| `int` | `integer` | |
| `bigint` | `bigint` | |
| `decimal` | `numeric` | |
| `bool` | `boolean` | |
| `timestamp` | `timestamptz` | Always with timezone. |
| `jsonb` | `jsonb` | |

### Column options

| Field | Type | Meaning |
|---|---|---|
| `required` | bool | NOT NULL constraint. |
| `index` | bool | Creates a btree index. |
| `unique` | bool | UNIQUE constraint. |
| `default` | any | See whitelist below. |
| `ref` | string | Foreign key target. `"orders"` or `"addon_tickets.comments"`. |

### `default` whitelist

`default` goes raw into the DDL. Only these literals pass validation:

| Form | Example |
|---|---|
| Numeric | `42`, `-3`, `3.14` |
| Quoted string | `"'open'"`, `"'es-MX'"` (no embedded `'`, `"`, `;`, `\`) |
| Builtin call | `"now()"`, `"gen_random_uuid()"`, `"uuid_generate_v4()"`, `"current_timestamp"` |
| Boolean / null | `true`, `false`, `"null"` |

Anything else (including arbitrary SQL) is rejected by `metacore validate`.

### Key regex

Every user-supplied identifier (`key`, `model_key`, `table_name`, column
`name`) must match `^[a-z][a-z0-9_]{1,63}$`. This blocks both SQL injection
and Postgres quoting ambiguities.

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

- `target` (optional): id of an existing core sidebar group. When it
  matches, items are merged in; otherwise a new group is created.
- `model`: when present, the host knows the route is dynamic CRUD on that
  table. No frontend code is required.

## 5. `actions{}` (UI-triggered)

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

Executed as `POST /api/models/tickets/:id/actions/resolve`. The host
dispatches to a webhook declared in `hooks`, a WASM export, or a compiled
`ActionInterceptor`. `modal: "custom_slug"` opens a custom frontend modal.

## 6. `tools[]` (LLM-triggered)

Semantic counterpart to actions. Conversational hosts register these in
their agent-tool registry on install.

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

| Field | Purpose |
|---|---|
| `description` | Prompt the LLM sees. Be specific; include negative cases. |
| `trigger_keywords` / `trigger_intents` | Hints for the routing layer. |
| `input_schema[i].extraction_hint` | Natural-language instruction for the LLM when extracting that field. |
| `input_schema[i].normalize` | Post-extraction transform: `uppercase`, `lowercase`, `trim`, `phone_e164`. |
| `input_schema[i].validation` | Regex the value must match after normalization. |
| `cache_ttl` | Seconds; non-zero marks the tool as idempotent-GET-like. |

## 7. `capabilities[]`

Sandboxed permissions the addon requests. Enforced at runtime by
`kernel/security/context.go`. See [capabilities.md](./capabilities) for
the full kind catalog and validation rules.

```json
"capabilities": [
  { "kind": "db:read",    "target": "users", "reason": "Display author names" },
  { "kind": "http:fetch", "target": "api.factura.com", "reason": "Timbrar CFDI" },
  { "kind": "event:emit", "target": "fiscal.stamped" }
]
```

The addon's own schema (`addon_<key>.*`) is always accessible — never declare it.

## 8. `hooks{}` and `lifecycle_hooks{}`

```json
"hooks": {
  "tickets::resolve": "/webhooks/resolve_ticket"
}
```

- `hooks`: `"<model>::<action>" → <webhook path or URL>`. The host POSTs
  an HMAC-signed envelope (see [addon-publishing.md](./addon-publishing)).
- `lifecycle_hooks`: per-model CRUD triggers:
  ```json
  "lifecycle_hooks": {
    "tickets": [
      { "event": "after_create",
        "target": { "type": "webhook", "url": "/webhooks/ticket_created" },
        "async": true }
    ]
  }
  ```
  Target types: `webhook`, `wasm_call`, `agent_task`.

## 9. `settings[]`

Per-installation configurable values. Stored by the host in
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

`secret: true` ensures the value never leaves the server on GETs and is
stored in the secrets manager when the host supports it.

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

| Field | Meaning |
|---|---|
| `entry` | URL or relative path of `remoteEntry.js`. |
| `format` | `"federation"` (recommended) or `"script"` (legacy window global). |
| `expose` | Federation module name to import (e.g. `./plugin`). |
| `container` | Global container name. Must match the `name` option of `@originjs/vite-plugin-federation`. Default: `metacore_<key>`. |
| `integrity` | Optional SRI hash. |

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

| Runtime | Behaviour |
|---|---|
| `"webhook"` (default) | Hooks dispatch as outbound HMAC-signed HTTP. |
| `"wasm"` | Sandboxed in-process module per [wasm-abi.md](./wasm-abi). |
| `"binary"` | Reserved. |

## 12. `signature{}`

Stamped by the marketplace at publish time. Contains `developer_id`,
`algorithm` (`ed25519`), `digest` (sha256 of the bundle), signature value
and per-file checksums. Addons never author this block; it is produced by
`metacore sign` and verified by the host on install.

## 13. `events[]`

List of topic names the addon will publish. Hosts with an event bus
register the schema; subscribers declare `capabilities: [{kind: "event:subscribe"}]`.

```json
"events": ["ticket.created", "ticket.resolved"]
```

## See also

- [`dynamic-ui.md`](./dynamic-ui) — how the SDK turns metadata derived from this manifest into a working CRUD UI.
- [`addon-cookbook.md`](./addon-cookbook) — recipes for foreign keys, soft delete, custom actions, events and more.
- [`capabilities.md`](./capabilities) — full catalog of `kind` values and target patterns.
- [`quickstart.md`](./quickstart) — hands-on walkthrough end-to-end.
