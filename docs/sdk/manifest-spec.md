<p align="center">
  <img src="/logo.svg" width="120" alt="Metacore" />
</p>

<h1 align="center"><code>manifest.json</code> reference — Module Contract v3</h1>

The manifest is the **single contract** between an addon and the metacore
kernel/hub. It is authored as JSON, validated by Go
(`metacore-kernel/manifest/v3`), scanned by the hub's publish pipeline
(`hub/backend/internal/scanner`) and mirrored into TS types for the SDK.

> **This document reflects `apiVersion: "asteby.com/v3"` only.** v3 is
> **strict** — `Validate()` rejects unknown top-level fields and malformed
> shapes. The kernel still dual-reads legacy v2 manifests (no `apiVersion`)
> for addons published before v3 shipped, but **author every new addon in
> v3** — the shape below is the one the current kernel (`metacore-kernel`
> v0.94.x at the time of writing) actually understands. The authoritative Go
> source of truth is `metacore-kernel/manifest/v3/types.go` (heavily
> commented — read it directly when this doc and the code ever disagree,
> the code wins).
>
> Scaffold with `metacore init <key>` and look at a real, published addon —
> e.g. `addons/packages/mercadopago/manifest.json` in the
> `asteby-hq/addons` monorepo — as a working reference.

## Table of contents

- [Top-level shape](#top-level-shape)
- [1. `metadata{}`](#1-metadata)
- [2. `compatibility{}`](#2-compatibility)
- [3. `tenancy{}`](#3-tenancy)
- [4. `capabilities[]`](#4-capabilities)
- [5. `models[]`](#5-models)
  - [5.1 `columns[]`](#51-columns)
  - [5.2 `seed`](#52-seed)
  - [5.3 `formulas[]` and `rollups[]` — the compute engine](#53-formulas-and-rollups--the-compute-engine)
  - [5.4 `sequences[]`](#54-sequences)
  - [5.5 `form_layout` and `Column.section`/`visible_when`](#55-form_layout-and-columnsectionvisible_when)
  - [5.6 Stage machines: `stage_field`/`stages[]`/`transitions[]`/`on_transition[]`](#56-stage-machines-stage_fieldstagestransitionson_transition)
  - [5.7 `relations[]` and embedded sub-tables](#57-relations-and-embedded-sub-tables)
  - [5.8 `locking` and `constraints[]`](#58-locking-and-constraints)
- [6. `frontend{}` — federation](#6-frontend--federation)
- [7. `contributions{}`](#7-contributions)
  - [7.1 `navigation[]`](#71-navigation)
  - [7.2 `actions[]` — placement, federated modals, wizards](#72-actions--placement-federated-modals-wizards)
  - [7.3 `dashboard[]`](#73-dashboard)
  - [7.4 `documents[]`](#74-documents)
  - [7.5 `notifications[]`](#75-notifications)
- [8. `connectors[]`](#8-connectors)
- [9. `schedules[]` and `webhooks[]`](#9-schedules-and-webhooks)
- [10. `rbac{}` — permissions](#10-rbac--permissions)
- [11. `i18n{}`](#11-i18n)
- [12. `extension_points{}`](#12-extension_points)
- [13. `lifecycle{}`](#13-lifecycle)
- [14. `settings[]`](#14-settings)
- [15. `signature{}`](#15-signature)
- [16. `kind: Preset | Theme | ConnectorPack`](#16-kind-preset--theme--connectorpack)

## Top-level shape

```json
{
  "apiVersion": "asteby.com/v3",
  "kind": "Addon",
  "metadata": { "...": "identity + marketplace copy" },
  "compatibility": { "requires": [{ "key": "kernel", "version": ">=3.0.0 <4.0.0" }] },
  "tenancy": { "isolation": "shared", "rls_column": "organization_id" },
  "capabilities": [ "..." ],
  "models": [ "..." ],
  "frontend": { "...": "federated bundle" },
  "contributions": { "...": "navigation, actions, dashboard, documents, notifications" },
  "connectors": [ "..." ],
  "schedules": [ "..." ],
  "webhooks": [ "..." ],
  "extension_points": { "...": "..." },
  "lifecycle": { "...": "..." },
  "i18n": { "...": "..." },
  "rbac": { "...": "..." },
  "settings": [ "..." ],
  "billing": { "...": "..." },
  "signature": { "stamped": "by the hub on publish" }
}
```

`kind` selects the document shape: `Addon` (the common case — everything
below), `Preset` (a bundle of addons + defaults, see [§16](#16-kind-preset--theme--connectorpack)),
`Theme` (design tokens) or `ConnectorPack` (a standalone credential provider
not tied to one addon).

## 1. `metadata{}`

```json
"metadata": {
  "key": "tickets",
  "name": "Tickets",
  "description": "Mesa de ayuda con SLAs y asignación automática.",
  "version": "1.0.0",
  "category": "operations",
  "icon": { "type": "lucide", "slug": "Ticket", "color": "#f59e0b" },
  "author": "Asteby",
  "website": "https://asteby.com",
  "license": "Apache-2.0",
  "readme": "README.md",
  "screenshots": ["screenshots/board.png"],
  "features": ["SLA automático", "Asignación por carga"],
  "countries": ["MX"],
  "i18n": {
    "es": { "name": "Tickets", "description": "..." },
    "en": { "name": "Tickets", "description": "..." }
  }
}
```

| Field | Required | Notes |
|---|---|---|
| `key` | yes | Regex `^[a-z][a-z0-9_]{1,63}$`, globally unique. Defines the Postgres schema `addon_<key>` and route namespace `/m/<key>`. |
| `name`, `version` | yes | `version` is strict semver. |
| `description`, `category`, `author`, `website`, `license`, `readme`, `screenshots[]`, `features[]` | no | Marketplace card copy. |
| `icon` | no | `{type, slug, color}`. `type`: `"lucide"`, `"brand"` (simple-icons), or `"url"`. |
| `countries` | no | ISO 3166-1 alpha-2 codes (e.g. `["MX"]`). Empty = global. Use for region-locked fiscal complements. |
| `i18n` | no | Per-locale `{name, description, features}` overriding the default copy for the hub's localized catalog. Distinct from the top-level `i18n{}` block (app-UI string bundles, [§11](#11-i18n)). |

## 2. `compatibility{}`

```json
"compatibility": { "requires": [{ "key": "kernel", "version": ">=3.0.0 <4.0.0" }] }
```

`requires[]` is a peer-dependency list; `key: "kernel"` is reserved for the
kernel semver range. `optional: true` + `reason` document a soft dependency
(e.g. "richer UI if `crm-lite` is installed").

## 3. `tenancy{}`

```json
"tenancy": { "isolation": "shared", "rls_column": "organization_id" }
```

| `isolation` | Behaviour |
|---|---|
| `"shared"` (default) | Single schema `addon_<key>`, `organization_id` column. Tenant scoping is enforced **in the Go query layer**, not by relying on Postgres RLS as the sole boundary — RLS policies exist but every handler still filters by org explicitly (defense in depth; do not assume RLS alone is safe to skip an org filter). |
| `"schema"` | One schema per installation, created on install / dropped on uninstall. Use for regulated data. |
| `"database"` | Reserved for future use. |

## 4. `capabilities[]`

Sandboxed permissions the addon requests, enforced at runtime. See
[`capabilities.md`](./capabilities) for the full kind catalog.

```json
"capabilities": [
  { "kind": "db:read",       "target": "users",           "reason": "Display author names" },
  { "kind": "http:fetch",    "target": "api.mercadopago.com", "reason": "Create payment preferences" },
  { "kind": "connector:read","target": "mercadopago",      "reason": "Read the org's credentials" },
  { "kind": "event:emit",    "target": "ticket.resolved" }
]
```

The addon's own schema (`addon_<key>.*`) is always accessible — never
declare it. If a WASM handler imports `http_request` or `connector_get`,
the corresponding `http:fetch` / `connector:read` capability is
**mandatory**: the hub scanner statically detects those two host imports in
the compiled `.wasm` module (they are gated, real ABI imports, not a
text grep) and **rejects the publish** if the matching capability is
missing.

## 5. `models[]`

Each entry is materialized as `CREATE TABLE addon_<key>.<table>` (or extends
the org-scoped host schema when the model isn't schema-local — see
`table`).

```json
"models": [{
  "key": "Ticket",
  "table": "tickets",
  "label": "tickets.model.label",
  "columns": [
    { "name": "title",  "type": "string", "not_null": true },
    { "name": "status", "type": "string", "default": "open" },
    { "name": "total",  "type": "decimal", "default": 0 }
  ]
}]
```

Declaring a model with just `table` + `columns[]` is enough to get **full
CRUD automatically** — list/create/read/update/delete, the dynamic table UI,
the create/edit modal, permissions gating — with zero handwritten
frontend or backend code. Do **not** hand-write a CRUD action/handler for a
model that already gets it for free through `table`; that produces spurious
duplicate endpoints. Reach for an explicit `actions[]` entry only for
non-CRUD operations (state transitions, calling a connector, a custom
wizard).

| Field | Notes |
|---|---|
| `key` | Logical model key, PascalCase by convention (`Ticket`, `SalesOrder`). Referenced by `Column.ref`, relations, actions' `target_model`, dashboard queries. |
| `table` | Physical/logical table name, snake_case. |
| `label` | Display label — literal or an i18n key. |
| `columns[]` | See [§5.1](#51-columns). |
| `indices[]` | `{name, columns[], unique, method}`. |
| `foreign_keys[]` | `{columns[], references:{model, columns[]}, policy: "logical"\|"physical", on_delete}`. |
| `extensions[]` | Attach columns to **another addon's** model: `{target_model, columns[]}`. |
| `relations[]` | Inverse 1:N/N:M edges for the "related records" panel. See [§5.7](#57-relations-and-embedded-sub-tables). |
| `seed` | Default rows inserted (idempotently) on install. See [§5.2](#52-seed). |
| `formulas[]` | Computed columns. See [§5.3](#53-formulas-and-rollups--the-compute-engine). |
| `sequences[]` | Atomic per-org/per-branch folio counters. See [§5.4](#54-sequences). |
| `form_layout` | Sections/wizard grouping for the native create/edit form. See [§5.5](#55-form_layout-and-columnsectionvisible_when). |
| `import` | Spreadsheet import template override; omit to let the kernel derive one from the columns. |
| `locking` | `""` (default) or `"row"`. See [§5.8](#58-locking-and-constraints). |
| `stage_field`, `stages[]`, `transitions[]`, `on_transition[]` | Stage machine (Bitrix-style pipeline). See [§5.6](#56-stage-machines-stage_fieldstagestransitionson_transition). |

### 5.1 `columns[]`

```json
{
  "name": "customer_id", "type": "uuid", "label": "Cliente",
  "ref": "Customer",
  "display": "creator", "widget": "dynamic_select",
  "section": "general",
  "visible_when": { "field": "channel", "equals": "b2b" }
}
```

**DDL plane** (touches the physical table): `name`, `type`
(`string`|`text`|`uuid`|`int`|`bigint`|`decimal`|`bool`|`timestamp`|`jsonb`),
`primary_key`, `not_null`, `default`, `generated` (a
`GENERATED ALWAYS AS (<expr>) STORED` Postgres column — incompatible with
`default`/`not_null`; the expression uses the same restricted arithmetic
grammar as `formulas[].expr`).

**Pure UI-plane metadata** (ignored by DDL/install, projected onto the
served table/form metadata so the SDK renders richly with zero per-app
code):

| Field | Purpose |
|---|---|
| `display` | Cell renderer: `url`, `email`, `phone`, `currency`, `creator`, `status`, `badge`, `tags`, `color`, `code`, `percent`, `image`, `boolean`, `date`. Empty = inferred from name/type. |
| `widget` | Form input: `textarea`, `select`, `dynamic_select`, `email`, `url`, `date`, `number`, `boolean`, `upload`, `image`. Empty = inferred. |
| `display_config` | Renderer options: `label_field`, `url_field`, `currency`, `decimals`, `base_path`, `new_tab`, `name_field`, `max_length`. |
| `ref` | Turns the column into an FK picker — names the target model key. Renders a searchable `dynamic_select` resolving against `/api/options/:Ref`. |
| `options` | **Either** a static array `[{value,label,icon?,color?,image?}]` **or** an object form (dependent picker): `{source, filter_by, value, label, label_ref, description}` — a `dynamic_select` scoped by a sibling field (`depends_on`), with the label resolved from a related model. The two shapes are mutually exclusive on one column. |
| `options_source` | Names a **host-registered provider key** (e.g. `"registered_models"`) resolved at metadata-serve time — an escape hatch for host-computed option lists the kernel itself doesn't implement. |
| `depends_on` | Sibling column whose value supplies the cascade filter for a dependent `options` picker. |
| `scan` | `true` renders a camera barcode-scan button on the field (SKU-style inputs). |
| `section` | Binds the field into a `form_layout` section/step (see [§5.5](#55-form_layout-and-columnsectionvisible_when)). |
| `visible_when` | `{field, equals}` or `{field, in:[...]}` — conditionally hides the field in the create/edit modal based on a sibling field's live value. A hidden field never gates submit. |
| `readonly` | System-generated value (external id, computed field): excluded from the create form, read-only in edit, still rendered in tables/detail. |
| `sequence` | Binds to a `Model.sequences[].key`; the kernel stamps the next folio value on create when the column is empty. |
| `tooltip`, `description` | Secondary text paths for richer cell rendering (e.g. show the creator's email under their name). |
| `label_image`, `label_icon`, `label_color` (on `ActionField`, not `Column`) | See [§7.2](#72-actions--placement-federated-modals-wizards). |

`default` for the **DDL plane** only accepts a whitelist: numeric literals,
quoted strings without `'`/`"`/`;`/`\`, the builtins `now()`,
`gen_random_uuid()`, `uuid_generate_v4()`, `current_timestamp`, booleans,
`null`. Anything else is rejected by `metacore validate` — this is a
deliberate anti-SQL-injection gate, not a limitation to work around.

Every user-supplied identifier (`key`, `table`, column `name`) must match
`^[a-z][a-z0-9_]{1,63}$`.

### 5.2 `seed`

```json
"seed": {
  "key": "code",
  "rows": [
    { "code": "open", "label": "Abierto" },
    { "code": "closed", "label": "Cerrado" }
  ]
}
```

Declarative default data, inserted on install. `key` names the column the
installer matches on for idempotency — a row is only inserted if no
existing row (scoped to the installing org) already has that key value, so
re-installs and upgrades never duplicate rows.

### 5.3 `formulas[]` and `rollups[]` — the compute engine

Two tiers of the declarative compute engine (a third, WASM-backed tier
exists for logic an expression can't express):

- **Tier-2 — `Model.formulas[]`**: a column computed from *other columns on
  the same row*, evaluated before every create/update write.
  ```json
  "formulas": [{ "target": "subtotal", "expr": "quantity * unit_price - discount" }]
  ```
  `expr` is parsed with a **strict allowlist**: identifiers resolving to
  real columns, decimal numbers, whitespace, `+ - * /`, parentheses —
  nothing else (no quotes, semicolons, function calls). Set
  `"tier": 3, "handler": "wasm:<export>"` instead of `expr` when the
  computation needs data/logic arithmetic can't express (price-list
  resolution, tiered margins); the kernel invokes the WASM export with the
  merged row and writes the returned value.

- **Tier-1 — `Model.relations[].rollups[]`**: a **parent** column
  maintained as an aggregate over a relation's child rows (sum/count/avg/
  min/max), recomputed on every child create/update/delete via a single
  `UPDATE`.
  ```json
  "relations": [{
    "name": "items", "kind": "one_to_many", "through": "SalesOrderItem",
    "foreign_key": "order_id",
    "rollups": [{ "target": "total", "fn": "sum", "from": "subtotal" }]
  }]
  ```
  Powers the auto-generated **footer totals row** the dynamic table renders
  for any model with rollups/formulas — no per-addon UI code. `expr` (a
  child-row arithmetic expression instead of `from`) uses the same strict
  allowlist as `Formula.expr`.

### 5.4 `sequences[]`

```json
"sequences": [{ "key": "folio", "scope": "branch", "format": "A-{seq:06}" }]
```

Atomic, gap-tolerant per-org (or per-branch) counters — the primitive
behind invoice folios and service-order tickets. Bind a column via
`Column.sequence: "folio"` to auto-stamp the next formatted value on
create, or pull one from a WASM handler via the `sequence_next` host
import.

### 5.5 `form_layout` and `Column.section`/`visible_when`

```json
"form_layout": {
  "mode": "sections",
  "sections": [
    { "key": "general", "title": "form.section.general" },
    { "key": "billing", "title": "form.section.billing",
      "visible_when": { "field": "type", "equals": "invoice" } }
  ]
}
```

`mode: "sections"` renders titled, collapsible blocks on one scroll;
`mode: "steps"` renders a validated step wizard — same `FormSection` shape,
only the presentation differs. Columns opt into a section via
`Column.section == FormSection.key`; unassigned columns fall into an
implicit "General" block. `FormSection.visible_when` hides the **whole
block**; `Column.visible_when` hides a **single field** — both use the
same `{field, equals}`/`{field, in}` predicate against sibling values, at
create/edit-modal render time. Purely UI metadata: the DDL/write plane
ignores all of it. Nil = a flat form (legacy behaviour).

### 5.6 Stage machines: `stage_field`/`stages[]`/`transitions[]`/`on_transition[]`

```json
"stage_field": "status",
"stages": [
  { "key": "open", "label": "Abierto", "color": "slate", "order": 0 },
  { "key": "in_progress", "label": "En progreso", "color": "amber", "order": 1 },
  { "key": "closed", "label": "Cerrado", "color": "green", "order": 2, "is_final": true }
],
"transitions": [
  { "from": "open", "to": "in_progress" },
  { "from": "in_progress", "to": "closed" }
],
"on_transition": [{
  "from": "*", "to": "closed",
  "set": { "closed_at": "now()" },
  "do": "webhook:notify_closed",
  "required": false
}]
```

Declaring `stage_field` + `stages[]` turns a model into a **Bitrix-style
kanban pipeline**: the kernel derives a `status` display for the column
(colour/label/order — no separate `options` needed), the sidebar can render
a kanban board via `NavItem.view_type: "kanban"` + `group_by`, and every
`Update` that moves `stage_field` is validated against `transitions[]`
(a disallowed move is rejected with HTTP 422). `on_transition[]` fires
Bitrix-style side effects on a valid move: `set` stamps fields on the row
itself (ride the same save, visible in the canonical event), `do`
dispatches a handler (`wasm:`/`webhook:`/`compiled:`); at least one of the
two is required per hook. `required: true` rolls the whole transition back
on a `do` dispatch failure.

### 5.7 `relations[]` and embedded sub-tables

```json
"relations": [{
  "name": "items", "kind": "one_to_many", "through": "SalesOrderItem",
  "foreign_key": "order_id", "embed": true,
  "rollups": [{ "target": "total", "fn": "sum", "from": "subtotal" }]
}]
```

`relations[]` declares the **inverse** edges of a model — the child records
a detail page/modal can list under it (a Customer's vehicles, a document's
line items). `kind: "one_to_many"` + `through` (child model key) +
`foreign_key` (child column pointing back) is the common shape;
`kind: "many_to_many"` joins through a target model. `scope` adds a static
equality filter for **polymorphic** children (an `Attachment` table shared
by many owners, discriminated by `owner_model`).

`embed: true` is the opt-in flag that turns a relation into a **composition
rendered inline as a sub-table inside the parent's create/edit modal** — use
it for a document's LINES (order items, journal entries). Leave it `false`
(default) for large, independently-managed collections (stock movements, a
kardex) so opening the parent record never drags thousands of rows into the
form; those stay reachable from their own model page. `readonly: true`
makes the panel/sub-table display-only (no create/edit/delete of children)
— appropriate for an append-only ledger.

### 5.8 `locking` and `constraints[]`

```json
"locking": "row",
"columns": [{
  "name": "quantity", "type": "int",
  "constraints": [{ "expr": "quantity >= 0", "error_key": "stock.negative" }]
}]
```

`Column.constraints[]` are guard predicates the kernel evaluates **inside**
the create/update transaction, before the write — the declarative twin of a
CHECK constraint enforced at the application layer, no WASM handler
required. `Model.locking: "row"` wraps the whole `Update` in a transaction
and loads the target row with `SELECT … FOR UPDATE` before evaluating
constraints, which is what makes an increment-then-check guard
(`quantity >= 0` after a concurrent decrement) race-free. **This locking
guarantee is a Go-side, single-request property** — it does not extend
across multiple WASM host-import calls (see [`wasm-abi.md` §14](./wasm-abi#14-data_mutate--declarative-writes-from-a-guest)):
a guest module wanting the same safety uses `data_mutate`'s `inc{}` for an
atomic `SET col = col + delta`, not a read-then-write pair.

## 6. `frontend{}` — federation

```json
"frontend": {
  "entry": "https://cdn.example.com/addons/tickets@1.0.0/remoteEntry.js",
  "format": "federation",
  "expose": "./plugin",
  "container": "metacore_tickets",
  "layout": "shell",
  "integrity": "sha384-..."
}
```

| Field | Meaning |
|---|---|
| `entry` | URL (or relative path) of `remoteEntry.js`. |
| `format` | `"federation"` (recommended) or `"script"` (legacy `window` global). |
| `expose` | Federation module name imported by default (e.g. `./plugin`). Actions/dashboard widgets that federate reference **other** exposed modules from the same bundle by name. |
| `container` | Global container name; must match the addon's Module Federation build config. Default `metacore_<key>`. |
| `layout` | `"shell"` (rendered inside the host chrome/sidebar) or `"immersive"` (full-viewport, own chrome — e.g. a POS screen). |
| `integrity` | Optional SRI hash. |

See [`federation.md`](./federation) for the required shared-singleton
config, [`full-page-federation.md`](./full-page-federation) for
`./pages/<slug>` full-page exposes, and [`modals.md`](./modals) for
federated action modals.

## 7. `contributions{}`

### 7.1 `navigation[]`

```json
"navigation": [{
  "title": "sidebar.tickets", "icon": "Ticket", "target": "sidebar.operations",
  "items": [{
    "title": "sidebar.tickets.board", "url": "/m/tickets", "icon": "Kanban",
    "model": "Ticket", "view_type": "kanban", "group_by": "status",
    "requires": [{ "model": "Ticket", "actions": ["index", "resolve"] }]
  }]
}]
```

- `target`: id of an existing sidebar group to merge into; unmatched =
  a new group.
- `model`: the host knows the route is dynamic CRUD on that model — no
  frontend code required.
- `view_type`: `"table"` (default) or `"kanban"` (renders a board grouped by
  `group_by`, typically the model's `stage_field`).
- `filter`: static column→value filter for a nav entry (e.g. one entry per
  status).
- `requires[]` / `requires_capabilities[]`: declares the screen's actual
  data surface (model + actions, or raw capability strings) so the host can
  expand a coarse `screen.<slug>.access` grant into the concrete
  `<table>.<action>` RBAC checks the federated UI's `/api/data/*` calls need
  — prefer the structured `requires[]` form for new manifests.

### 7.2 `actions[]` — placement, federated modals, wizards

```json
"contributions": {
  "actions": [{
    "key": "resolve", "label": "Resolver", "target_model": "Ticket",
    "handler": { "type": "wasm", "function": "resolve_ticket" },
    "placement": "row",
    "requires_state": ["open", "in_progress"],
    "confirm": true,
    "fields": [{ "name": "note", "type": "text", "required": true }],
    "idempotency": { "key_field": "request_id" }
  }]
}
```

`placement` decides **where the trigger surfaces**:

| Value | Renders as |
|---|---|
| `""`/`"row"` (default) | Per-row action in the model's table, executes against the hovered record. |
| `"table"` | A toolbar button at the page level, no record context. |
| `"create"` | A toolbar button that **replaces** the generic "create" button — for addons shipping a custom create experience (e.g. a journal entry with debit/credit lines). Opens with an empty record; the host suppresses its default create affordance. |

An action's UI comes from **one of two mutually-reinforcing surfaces**:

- **Declarative form** — `fields[]` (flat) or `steps[]` (a validated
  multi-step wizard, mutually exclusive with `fields[]`). Each field is an
  `ActionField`: `type`, `widget`, `ref`/`options`/`options_source` (same
  picker vocabulary as a column), `visible_when`, `scan`, `depends_on`, plus
  line-item support (`type: "array"` + `item_fields[]`, `lock_rows` to
  forbid adding/removing rows, `total`/`balance` for a summed footer with a
  balanced/out-of-balance indicator — e.g. Σdebit == Σcredit), and upload
  fields (`accept`, `max_size`, `storage_path`).
- **Federated modal** — `"modal": "custom_slug"` mounts a **custom React
  component the addon's own frontend bundle exposes**, in place of (or
  alongside) the declarative form, for UI too rich for a flat field list
  (a checkout panel, a rich picker). This is the addon-authored twin of
  `Action.placement: "create"` — see [`modals.md`](./modals) for the
  federation contract (slot addressing, props, how the host mounts it).

`handler.type`: `"wasm"` (a WASM export), `"webhook"` (outbound HMAC-signed
HTTP), `"compiled"` (a host-linked Go function), or **`"connector"`** —
dispatches **another addon's connector** export
(`{connector: "mercadopago", export: "create_preference"}`), letting an
action drive a connector it does not own without duplicating that
connector's client (e.g. a CRM action that sends a WhatsApp message through
a `link` connector it never implements itself).

`requires_state[]` gates the action on the target record's `stage_field`
(or `status`/`state`) — the kernel **enforces** this at dispatch, not just
hides the button. `idempotency.key_field` makes the action replay-safe: the
kernel keys a stored response by `(org, model, action, <payload field
value>)` and returns the same response on a retry without re-dispatching —
required for anything money- or fiscal-stamp-adjacent that a flaky network
might retry.

### 7.3 `dashboard[]`

```json
"dashboard": [
  { "key": "open_tickets", "title": "dash.open_tickets", "kind": "stat",
    "query": { "model": "Ticket", "aggregate": "count", "where": { "status": "open" } },
    "accent": "amber", "size": "sm" },
  { "key": "heatmap", "title": "dash.heatmap", "kind": "custom",
    "expose": "./StockHeatmap", "size": "lg" }
]
```

Two flavours in the same grid: **declarative** (every `kind` but
`"custom"` — `stat`|`bar`|`line`|`area`|`pie`|`donut`|`list`|`progress`) —
the host computes the aggregate from `query` with the kernel aggregation
engine (org-scoped, soft-delete aware, permission-gated) and the SDK paints
it with a built-in renderer, zero per-addon code; and **federated**
(`kind: "custom"`) — the addon ships its own React widget via `expose`
(from its `frontend` bundle), mounted into the grid with the same card
chrome. `permission` gates visibility; default is derived as
`<table>.index` from `query.model`.

### 7.4 `documents[]`

```json
"documents": [{
  "key": "remision", "model": "SalesOrder",
  "template": "templates/remision.html", "paper": "ticket80"
}]
```

Binds a bundle-relative HTML template to a model so the host renders a
per-record PDF at `GET /api/data/:model/:id/documents/:key.pdf`, hydrated
with `{{record.<col>}}`, `{{org.branding.<field>}}`, `{{line_items}}`,
`{{now}}`. `paper`: `A4`|`letter`|`ticket80` (80mm POS receipt roll).

### 7.5 `notifications[]`

In-app bell notifications the host emits when a matching canonical CRUD
event fires (`<addon>.<Model>.<action>`) — no WASM required, evaluated
host-side.

## 8. `connectors[]`

```json
"connectors": [{
  "key": "mercadopago", "label": "mercadopago.connector.label", "auth": "token",
  "form_layout": {
    "mode": "steps",
    "sections": [
      { "key": "connection", "title": "mercadopago.connector.section.connection" },
      { "key": "advanced", "title": "mercadopago.connector.section.advanced" }
    ]
  },
  "credentials": [
    { "key": "access_token", "type": "secret", "required": true, "section": "connection" },
    { "key": "webhook_secret", "type": "secret", "section": "advanced" }
  ],
  "test_export": "test_connection"
}]
```

Declares a third-party credential provider the addon depends on. The host
collects + encrypts `credentials[]` per org (`type: "secret"` fields never
leave the server on GETs); a WASM handler reads a credential via the
`connector_get` host import (gated by the `connector:read` capability), and
an inbound webhook's `secret_ref` (`"<connector_key>.<credential_key>"`)
resolves to one of these. `form_layout` groups credentials into sections or
a multi-step wizard exactly like a model's `form_layout` — useful when a
step needs a live connection first (e.g. a `dynamic_select` fed by
`options_source` gated by `visible_when` on an earlier step's field).
`test_export` names a WASM export the host invokes for a "test connection"
button in the config UI — a cheap read-only call that returns
`{success, data:{ok, message}}`.

This is distinct from a **standalone `kind: "ConnectorPack"` manifest**
([§16](#16-kind-preset--theme--connectorpack)), which publishes a reusable
provider not tied to one addon.

## 9. `schedules[]` and `webhooks[]`

```json
"schedules": [{ "key": "sync_issues", "every": "5m", "do": "wasm:sync_issues" }],
"webhooks": [{
  "key": "github_push", "path": "/webhooks/github",
  "verify": "hmac-sha256", "secret_ref": "github.webhook_secret",
  "do": "wasm:handle_push"
}]
```

`schedules[]` are declarative cron jobs the kernel scheduler fires per
installed org on `every` (a Go duration), dispatching `do` — the backstop
that reconciles whatever an inbound webhook missed (webhook-primary +
cron-reconcile pattern). `webhooks[]` are inbound routes the host mounts
under the addon+org namespace; `verify` selects the signature scheme,
`secret_ref` resolves the signing secret from a declared connector
credential.

## 10. `rbac{}` — permissions

```json
"rbac": {
  "roles": [{ "key": "ticket_agent", "label": "Agente", "permissions": ["ticket.index", "ticket.resolve"] }],
  "permissions": [{ "key": "ticket.resolve", "label": "Resolver tickets" }]
}
```

Permissions are **derived automatically from the manifest** for the
standard surfaces — every model gets `<table>.index/create/update/delete`,
every custom action gets `<table>.<action_key>`, every nav entry with
`requires[]` expands `screen.<slug>.access` into the concrete capabilities
it needs. `rbac.permissions[]` is only for declaring **extra** permission
keys with no automatic model/action mapping (a coarse feature flag); `roles[]`
bundles keys into a named role the org admin can assign. The permission
check runs **role × module × action**, gated in Go on every write path —
options/search endpoints (`/api/options/:ref`, dynamic-select lookups) are
a documented exception with **no permission gate**, since they only leak
value/label pairs used for pickers, not full records.

## 11. `i18n{}`

```json
"i18n": {
  "default_locale": "es",
  "bundles": [
    { "locale": "es", "path": "locales/es.json" },
    { "locale": "en", "path": "locales/en.json" }
  ]
}
```

Points at bundle-relative locale files merged into the host's i18next
instance via the SDK's `I18nProvider`. Every `label`/`title`/`description`
elsewhere in the manifest may be either a literal string or a key resolved
against this bundle — the same mechanism resolves both. This is distinct
from `metadata.i18n` ([§1](#1-metadata)), which only localizes the
marketplace catalog card.

## 12. `extension_points{}`

```json
"extension_points": {
  "events": [{ "name": "ticket.resolved", "description": "Fired after a ticket moves to closed" }],
  "slot_kinds": [{ "name": "ticket_sidebar_widget", "description": "Renders in the ticket detail sidebar" }],
  "model_extensions_accepted": ["Ticket"]
}
```

What this addon **publishes for others to extend**: event names other
addons can subscribe to, UI slot kinds other addons can contribute into via
`contributions.slots[]` (`{slot_kind, entry, order, permission}`), and which
of its own models accept `Model.extensions[]` from other addons.

## 13. `lifecycle{}`

```json
"lifecycle": {
  "install": "wasm:on_install",
  "uninstall": "wasm:on_uninstall",
  "upgrade": [{ "from": "<1.2.0", "type": "sql", "function": "migrations/001_add_priority.sql" }]
}
```

`install`/`uninstall`/`enable`/`disable` are handler references dispatched
at those points. `upgrade[]` is an ordered ladder of migration steps run
when upgrading from a version matching `from`.

## 14. `settings[]`

Per-installation configurable values, stored on the host's installation
record.

```json
"settings": [
  { "key": "slack_webhook", "type": "text", "secret": true, "label": "Slack webhook" },
  { "key": "default_locale", "type": "select", "default": "es-MX",
    "options": [{ "value": "es-MX", "label": "Español (México)" }] }
]
```

`secret: true` never leaves the server on GETs. `options_source` names a
WASM export invoked to fetch options live (e.g. a connector's series list
from the third-party API) instead of a static `options[]`. `section` binds
into a `form_layout` the same way a connector credential does.

## 15. `signature{}`

Stamped by the hub at publish time — never author it. `{algorithm: "ed25519",
key_id, value, signed_at}` over the tarball's sha256 digest, verified by the
host on install. See [`addon-publishing.md`](./addon-publishing) for the
full publish/sign/verify flow.

## 16. `kind: Preset | Theme | ConnectorPack`

- **`Preset`** — `preset.addons[]`: `{key, version, optional, requires[]}`
  bundles multiple addons; `requires[]` cross-references other keys in the
  *same* preset and is topologically sorted at install time.
- **`Theme`** — `theme.tokens`, `theme.fonts[]`, `theme.icon_overrides{}`:
  design-token overrides for white-label branding.
- **`ConnectorPack`** — `connector_pack.providers[]`: standalone credential
  providers (`{key, label, credentials[]}`) not tied to one addon's models.

## See also

- [`addon-cookbook.md`](./addon-cookbook) — end-to-end recipes: scaffolding, CRUD, actions, WASM, federation, publishing.
- [`addon-publishing.md`](./addon-publishing) — the real `metacore publish` flow, signing, review, scanner.
- [`wasm-abi.md`](./wasm-abi) — the WASM guest/host contract, including `data_mutate`/`data_query`.
- [`capabilities.md`](./capabilities) — full `kind` catalog for `capabilities[]`.
- [`federation.md`](./federation), [`full-page-federation.md`](./full-page-federation), [`modals.md`](./modals) — frontend federation contracts.
- [`dynamic-ui.md`](./dynamic-ui) — how the SDK turns this metadata into a working CRUD UI.
