<p align="center">
  <img src="/logo.svg" width="120" alt="Metacore" />
</p>

<h1 align="center">Addon Cookbook</h1>

Short recipes for the patterns that come up while building addons. Each entry is a question, the smallest working snippet, and a one-line note about *why*. For deep context on any feature, follow the links to [`manifest-spec.md`](./manifest-spec) and [`dynamic-ui.md`](./dynamic-ui).

## Table of contents

- [How do I get CRUD without writing any code?](#how-do-i-get-crud-without-writing-any-code)
- [How do I add a foreign-key relation?](#how-do-i-add-a-foreign-key-relation)
- [How do I make a column searchable?](#how-do-i-make-a-column-searchable)
- [How do I add a custom validation?](#how-do-i-add-a-custom-validation)
- [How do I create a custom action with a modal?](#how-do-i-create-a-custom-action-with-a-modal)
- [How do I require a permission for a button?](#how-do-i-require-a-permission-for-a-button)
- [How do I emit an event when a record changes?](#how-do-i-emit-an-event-when-a-record-changes)
- [How do I subscribe to events from another addon?](#how-do-i-subscribe-to-events-from-another-addon)
- [How do I show a different UI for create vs edit?](#how-do-i-show-a-different-ui-for-create-vs-edit)
- [How do I add a soft-delete column?](#how-do-i-add-a-soft-delete-column)
- [How do I scope records per organization?](#how-do-i-scope-records-per-organization)
- [How do I bundle a frontend extension with my addon?](#how-do-i-bundle-a-frontend-extension-with-my-addon)
- [How do I test my addon locally?](#how-do-i-test-my-addon-locally)
- [How do I prefetch metadata at app boot?](#how-do-i-prefetch-metadata-at-app-boot)
- [How do I add a row dropdown action that links to another page?](#how-do-i-add-a-row-dropdown-action-that-links-to-another-page)
- [How do I gate an action on the row's current state?](#how-do-i-gate-an-action-on-the-rows-current-state)
- [How do I group a big create/edit form into sections or a wizard?](#how-do-i-group-a-big-createedit-form-into-sections-or-a-wizard)
- [How do I embed line items (a document's sub-table) in the parent modal?](#how-do-i-embed-line-items-a-documents-sub-table-in-the-parent-modal)
- [How do I compute a column from other columns, or sum a parent from its children?](#how-do-i-compute-a-column-from-other-columns-or-sum-a-parent-from-its-children)
- [How do I build a kanban pipeline / stage machine?](#how-do-i-build-a-kanban-pipeline--stage-machine)
- [How do I seed default rows on install?](#how-do-i-seed-default-rows-on-install)
- [How do I add backend logic in WASM instead of a webhook?](#how-do-i-add-backend-logic-in-wasm-instead-of-a-webhook)
- [How do I read/write a row from a WASM handler without raw SQL?](#how-do-i-readwrite-a-row-from-a-wasm-handler-without-raw-sql)
- [How do I add a full federated page instead of the generic CRUD screen?](#how-do-i-add-a-full-federated-page-instead-of-the-generic-crud-screen)
- [How do I add a federated dashboard widget?](#how-do-i-add-a-federated-dashboard-widget)
- [How do I call a connector (payments, messaging) I don't own?](#how-do-i-call-a-connector-payments-messaging-i-dont-own)
- [How do I declare a role and its permissions?](#how-do-i-declare-a-role-and-its-permissions)
- [How do I publish my addon to the hub?](#how-do-i-publish-my-addon-to-the-hub)

## How do I get CRUD without writing any code?

Declare a model with `table` + `columns[]` — list, create, read, update,
delete, filtering, the create/edit modal and permission gating all come
for free from the metadata the kernel derives from the manifest:

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

**Do not hand-write a create/update/delete action or webhook for a model
that already has `table` declared** — that produces a duplicate, spurious
endpoint alongside the automatic one. Reach for `contributions.actions[]`
only for behavior CRUD doesn't cover: a state transition, a computed side
effect, a call into a connector. See
[manifest-spec.md §5](./manifest-spec#5-models) for the full column/
display/widget vocabulary that makes the auto-generated form and table
richer without any frontend code (`ref` pickers, `options`, `display`
renderers, `scan` barcode fields, `visible_when`).

## How do I add a foreign-key relation?

Declare a `foreign_keys[]` entry on the model. The host generates the
`FOREIGN KEY` constraint and exposes a relation-picker options endpoint the
edit modal uses.

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

The edit dialog renders a searchable combobox for `ticket_id`. `references.model` is the `<addon_key>.<ModelKey>` of the target; `policy` is `"physical"` (a real DB FK) or `"logical"` (app-enforced only).

## How do I make a column searchable?

Searchability is metadata the kernel derives for the model's list view —
a global ILIKE search (the toolbar's free-text input) plus per-column filter
chips. Declare the column normally and the kernel exposes it as a filter;
text columns participate in the `?search=` global search.

```json
{
  "key": "Ticket",
  "table": "tickets",
  "columns": [
    { "name": "title", "type": "text", "not_null": true }
  ]
}
```

## How do I add a custom validation?

For action fields, add `validation` (regex applied after `normalize`):

```json
"input_schema": [
  { "name": "rfc", "type": "string", "required": true,
    "normalize": "uppercase",
    "validation": "^[A-ZÑ&]{3,4}\\d{6}[A-Z0-9]{3}$" }
]
```

For column constraints beyond what the manifest expresses (NOT NULL, UNIQUE, length), validate in your action handler / WASM export. Keep schema-level constraints declarative; keep business rules in code.

## How do I create a custom action with a modal?

Declare the action under `contributions.actions[]` with `fields[]`. In v3 the
action carries its own `handler` (the server side is wired *into the action*,
not a separate `hooks{}` map), and `target_model` is the model `key` it acts on:

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

`<DynamicTable>` adds "Reassign" to the row dropdown. Clicking it fires `<ActionModalDispatcher>`, which renders a modal with the declared inputs and dispatches to the action's `handler` — a `webhook` (`{ "type": "webhook", "url": "…" }`) or a `wasm` export (`{ "type": "wasm", "function": "Reassign" }`).

For full custom UI register a component on the modal registry — the
component must accept the canonical `ModalProps` and narrow `payload` at the
entry:

```tsx
import type { AddonAPI, ModalProps } from '@asteby/metacore-sdk'

interface ReassignPayload { ticketId: string }

function ReassignDialog(props: ModalProps) {
  const { ticketId } = props.payload as unknown as ReassignPayload
  // …form, submit, then:
  // props.close({ ticketId })
}

export function register(api: AddonAPI) {
  api.registry.registerModal({ slug: 'tickets.reassign', component: ReassignDialog })
}
```

The action's `modal: "tickets.reassign"` field in the manifest tells the
dispatcher to mount this component instead of the generic field-driven
dialog. See [`docs/modals.md`](./modals) for the full contract.

## How do I require a permission for a button?

Wrap the affordance in `<CapabilityGate>`:

```tsx
import { CapabilityGate } from '@asteby/metacore-runtime-react'

<CapabilityGate require="db:write addon_tickets.tickets">
  <Button onClick={createTicket}>New ticket</Button>
</CapabilityGate>
```

The kernel still enforces the same capability server-side — gating UI is purely a UX courtesy. See [`dynamic-ui.md`](./dynamic-ui#capability-gates) for `all` / `any` / `invert` modes.

## How do I emit an event when a record changes?

Declare the capability and publish the event under `extension_points.events[]`
(v3 replaces the v2 free-form `events: [...]` list with typed published events
that can carry a `payload_schema`):

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

Event names are `<namespace>.<event>` (exactly two underscore-segments per
side). In a webhook / WASM export, call the host's event API with
`{ topic: 'ticket.resolved', payload: {…} }`. The kernel checks the
capability, persists the event, and fans out to subscribers.

For automatic reactions on CRUD operations, declare a subscription under
`contributions.subscriptions[]`:

```json
"contributions": {
  "subscriptions": [
    { "event": "ticket.created",
      "handler": { "type": "webhook", "url": "/webhooks/ticket_created" } }
  ]
}
```

## How do I subscribe to events from another addon?

Declare the capability and a subscription whose `handler` the kernel invokes
when the event fires:

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

The publishing addon declares `invoice.stamped` under its
`extension_points.events[]` so the host knows the schema.

## How do I show a different UI for create vs edit?

`<DynamicRecordDialog>` already swaps title and submit label per `mode`. If you need different fields, branch at the call site and render two distinct components (or two manifest models — one for the create funnel, one for editing the persisted record).

```tsx
{mode === 'create'
  ? <FullCreationWizard onDone={refetch} />
  : <DynamicRecordDialog open mode="edit" model="tickets" recordId={id} />}
```

## How do I add a soft-delete column?

Declare a `deleted_at` column on the model:

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

The host filters `deleted_at IS NOT NULL` out of default queries and routes a delete to `UPDATE … SET deleted_at = now()`.

## How do I scope records per organization?

Declare an `organization_id` column and set `tenancy` at the top level:

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

The kernel stamps `organization_id` on insert and every Go handler filters
by it explicitly on the read/write path — that explicit filter, not RLS
alone, is the real tenant boundary. A Postgres RLS policy on
`tenancy.rls_column` also exists as defense-in-depth, but don't write a
custom SQL path (`db_exec`, a hand-rolled query) that skips the org filter
on the assumption RLS alone will catch a leak.

For regulated data prefer `tenancy.isolation: "schema"` (schema-per-tenant) — see [`manifest-spec.md`](./manifest-spec).

## How do I bundle a frontend extension with my addon?

Declare a federation entry in the manifest:

```json
"frontend": {
  "entry": "/api/metacore/addons/tickets/frontend/remoteEntry.js",
  "format": "federation",
  "expose": "./plugin",
  "container": "metacore_tickets"
}
```

Build the frontend with `@module-federation/vite`, wired through
`metacoreFederationShared()` from `@asteby/metacore-starter-config/vite` —
the canonical helper that pre-declares every required singleton (React,
`@tanstack/react-query`, i18next, the SDK packages — see
[`docs/federation.md`](./federation) for the current full list and why
each one matters; skipping `@tanstack/react-query` in particular is the
single most common cause of a "No QueryClient set" crash). See
[`docs/federation.md`](./federation) for the full sample; the `host`
option must match the manifest's `frontend.container`.

The exposed module must export `register(api: AddonAPI)`, which receives the
host SDK and registers slot contributions, action handlers, navigation items,
etc.

```tsx
// frontend/src/plugin.tsx
import type { AddonAPI } from '@asteby/metacore-sdk'

export function register(api: AddonAPI) {
  api.slot.register('dashboard.widgets', RevenueWidget, { priority: 10 })
  api.action.register('tickets', 'reassign', ReassignDialog)
  api.nav.add({ key: 'tickets', label: 'Tickets', to: '/m/tickets' })
}
```

The host loads it via `<AddonLoader>` from `@asteby/metacore-runtime-react`.

## How do I test my addon locally?

```bash
metacore validate         # static checks: regex, semver, capabilities, defaults
metacore build --strict   # produces my-addon-0.1.0.tar.gz
metacore inspect *.tar.gz # prints manifest + migrations + bundle sizes
```

Run a host with a `file:` reference to your addon directory and reload — the kernel re-runs `AutoMigrate` on every restart in dev. Webhooks pointed at `http://localhost:7101/webhooks/...` work straight through; for WASM, use `metacore compile-wasm` to produce a fresh `backend/backend.wasm` before reloading.

## How do I prefetch metadata at app boot?

```tsx
import { useMetadataCache } from '@asteby/metacore-runtime-react'

function PrefetchMetadata() {
  const { prefetchAll } = useMetadataCache()
  const api = useApi()
  useEffect(() => { prefetchAll(api) }, [api])
  return null
}
```

`prefetchAll` issues a single `GET /metadata/all` and seeds both the table and modal caches. Subsequent `<DynamicTable>` mounts render with no network round-trip. The cache is namespaced by `metadataVersion` — when the kernel bumps it, the cache invalidates automatically.

## How do I make a column link to another page?

There's no "link"-typed row action in the current v3 manifest — the
declarative path is a **column** display, not an action:

```json
{ "name": "invoice_id", "type": "uuid", "display": "url",
  "display_config": { "base_path": "/invoices", "new_tab": false } }
```

`display: "url"` (or `ref` pointing at the target model, which the SDK
renders as a clickable relation link by default) turns the cell into a
navigable link, with no per-app frontend code. For a **button** in the row
dropdown that navigates instead of dispatching a handler, ship it from a
federated frontend (`api.action.register` / a custom slot contribution) —
see [`bridge-api.md`](./bridge-api) — rather than trying to express
client-side navigation as a manifest `action`, which is dispatch-only
(`handler.type`: `wasm`/`webhook`/`compiled`/`connector`).

## How do I gate an action on the row's current state?

Use `requires_state[]` on the action — the kernel **enforces** it at
dispatch time (HTTP 422 on a stale/disallowed state), not just a UI hint:

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

The host also hides the trigger from the row dropdown client-side when the
row's current `stage_field` (or `status`) value isn't in the list — but the
server check is the one that actually matters; never rely on the client
hide alone. If the model declares a [stage machine](#how-do-i-build-a-kanban-pipeline-stage-machine),
prefer expressing the allowed moves once via `Model.transitions[]` and let
every action/UI surface derive from it, rather than duplicating the state
list per action.

## How do I group a big create/edit form into sections or a wizard?

Declare `form_layout` on the model and bind columns to a section by key:

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

`mode: "steps"` renders the same sections as a validated wizard instead of
collapsible blocks — no other change needed. See
[manifest-spec.md §5.5](./manifest-spec#55-form_layout-and-columnsectionvisible_when).

## How do I embed line items (a document's sub-table) in the parent modal?

Set `embed: true` on the child relation. The parent's create/edit modal
renders the children inline as an editable sub-table — this is opt-in
specifically so large, independently-managed collections (a kardex, stock
movements) never get dragged wholesale into the parent form:

```json
"relations": [{
  "name": "items", "kind": "one_to_many",
  "through": "SalesOrderItem", "foreign_key": "order_id",
  "embed": true
}]
```

See [manifest-spec.md §5.7](./manifest-spec#57-relations-and-embedded-sub-tables).
For a line-items group inside an **action** modal (not a model's own
create/edit form — e.g. a "receive goods" wizard), use `ActionField.type:
"array"` + `item_fields[]` instead; see
[manifest-spec.md §7.2](./manifest-spec#72-actions--placement-federated-modals-wizards).

## How do I compute a column from other columns, or sum a parent from its children?

Same-row arithmetic → `Model.formulas[]` (Tier-2). Parent aggregate over
child rows → `relation.rollups[]` (Tier-1), which also powers the
auto-rendered **footer totals row**:

```json
"formulas": [{ "target": "subtotal", "expr": "quantity * unit_price - discount" }],
"relations": [{
  "name": "items", "kind": "one_to_many", "through": "SalesOrderItem",
  "foreign_key": "order_id", "embed": true,
  "rollups": [{ "target": "total", "fn": "sum", "from": "subtotal" }]
}]
```

`expr` is parsed with a strict arithmetic-only allowlist (identifiers,
numbers, `+ - * /`, parentheses) — it can never inject SQL. When the
computation needs more than arithmetic (a tiered price list), set
`"tier": 3, "handler": "wasm:<export>"` instead of `expr`. See
[manifest-spec.md §5.3](./manifest-spec#53-formulas-and-rollups--the-compute-engine).

## How do I build a kanban pipeline / stage machine?

Declare `stage_field` + `stages[]` + `transitions[]` on the model, then
point a nav entry at it with `view_type: "kanban"`:

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

The kernel **enforces** `transitions[]` server-side (a disallowed move gets
HTTP 422) and derives the column's `status` display from `stages[]`
automatically — no separate `options` declaration needed. See
[manifest-spec.md §5.6](./manifest-spec#56-stage-machines-stage_fieldstagestransitionson_transition).

## How do I seed default rows on install?

```json
"seed": {
  "key": "code",
  "rows": [{ "code": "open", "label": "Abierto" }, { "code": "closed", "label": "Cerrado" }]
}
```

`key` names the natural-key column the installer matches on — a row is
only inserted when no existing row (for the installing org) already has
that value, so re-installs/upgrades never duplicate data.

## How do I add backend logic in WASM instead of a webhook?

Set `"backend": {"runtime": "wasm", "entry": "backend/backend.wasm",
"exports": [...]}` and reference the export from an action's `handler`:

```json
"backend": { "runtime": "wasm", "entry": "backend/backend.wasm",
  "exports": ["resolve_ticket"], "memory_limit_mb": 64, "timeout_ms": 10000 },
"contributions": { "actions": [{ "key": "resolve", "target_model": "Ticket",
  "handler": { "type": "wasm", "function": "resolve_ticket" } }] }
```

Build with TinyGo per [`wasm-abi.md`](./wasm-abi#5-building). Prefer
WASM over a webhook when the logic needs to run in-process with low
latency and no outbound network dependency of its own; prefer a webhook
when the logic is easier to iterate on outside the sandbox or needs a
runtime WASM can't target.

## How do I read/write a row from a WASM handler without raw SQL?

Use the `data_mutate` / `data_query` host imports instead of hand-writing
`db_exec` SQL — you get canonical-event publication and the
reserved-column guard for free:

```json
{ "op": "update", "table": "tickets", "model": "Ticket", "id": "...",
  "data": { "status": "resolved" }, "inc": { "reopen_count": -1 } }
```

`inc{}` is an atomic `SET col = col + delta` — the safe way to touch a
counter/stock column from a guest. **There is no cross-call transaction or
`FOR UPDATE`** available to the guest: each host import call commits on its
own. For an increment-then-check invariant (stock never negative), pair
`inc{}` with `Model.locking: "row"` + a `Column.constraints[]` guard
declared in the manifest — that safety is enforced by the kernel's Go write
path, not from inside WASM. See
[`wasm-abi.md` §14](./wasm-abi#14-data_mutate--declarative-writes-from-a-guest)
for the full contract, and [§16](./wasm-abi#16-data_batch--atomic-multi-mutation-batch-v17)
(`data_batch`) when an invariant spans more than one row atomically.

## How do I add a full federated page instead of the generic CRUD screen?

Expose a `./pages/<slug>` module from the addon's federated bundle instead
of (or alongside) `./plugin` — the host mounts it full-viewport under the
addon's own route, with its own chrome (`frontend.layout: "immersive"`) or
inside the shell (`"shell"`, the default). See
[`full-page-federation.md`](./full-page-federation) for the exposes
config and routing contract, and
[manifest-spec.md §6](./manifest-spec#6-frontend--federation) for the
`frontend{}` fields.

## How do I add a federated dashboard widget?

Declarative widgets (`stat`/`bar`/`line`/…) need zero frontend code — just
a `query`. For a fully custom widget, use `kind: "custom"` + `expose`:

```json
"contributions": {
  "dashboard": [{
    "key": "heatmap", "title": "dash.heatmap", "kind": "custom",
    "expose": "./StockHeatmap", "size": "lg"
  }]
}
```

`expose` names a module from the addon's `frontend` bundle, mounted into
the dashboard grid with the same card chrome as the declarative widgets.
See [manifest-spec.md §7.3](./manifest-spec#73-dashboard).

## How do I call a connector (payments, messaging) I don't own?

Set the action's `handler.type` to `"connector"` instead of duplicating
that connector's client:

```json
{ "key": "send_receipt", "target_model": "SalesOrder",
  "handler": { "type": "connector", "connector": "link", "export": "send_message" } }
```

This dispatches `send_message` on whichever addon provides the `link`
connector, org-scoped, with the action's field payload — no dependency on
that addon's Go/WASM code, only on its published connector contract. See
[manifest-spec.md §7.2](./manifest-spec#72-actions--placement-federated-modals-wizards).

## How do I declare a role and its permissions?

Most permissions (`<table>.index/create/update/delete`, `<table>.<action>`)
are **derived automatically** — you don't declare them. Use `rbac.roles[]`
only to bundle keys into a named role an org admin can assign:

```json
"rbac": {
  "roles": [{ "key": "ticket_agent", "label": "Agente",
    "permissions": ["ticket.index", "ticket.resolve"] }]
}
```

Options/lookup endpoints (`/api/options/:ref`) carry **no permission
gate** by design — don't rely on a role lacking a model's permission to
also keep its values out of another model's picker. See
[manifest-spec.md §10](./manifest-spec#10-rbac--permissions) and
[`dynamic-ui.md`](./dynamic-ui#capabilitygate-vs-rbac-permissions--two-different-systems)
for how this differs from the `capabilities[]` sandbox.

## How do I publish my addon to the hub?

```bash
metacore keys init && metacore keys show   # register the printed pubkey with a hub admin
metacore publish --hub https://hub.asteby.com \
  --developer-id "$METACORE_DEVELOPER_ID" --token "$METACORE_TOKEN" \
  --key ~/.metacore/keys/dev.pem
```

`metacore publish` validates, packs, signs (hex ed25519 over sha256 of the
tarball) and uploads. The hub's scanner statically inspects any WASM
module: `http_request`/`connector_get` imports **must** be backed by a
matching `http:fetch`/`connector:read` capability in the manifest or the
publish is rejected outright. Everyone lands in `pending_review` by
default; the platform's own first-party developer accounts auto-approve.
See [`addon-publishing.md`](./addon-publishing) for the full flow.

---

Have a recipe to add? Send a PR — recipes live in this file as a flat list, no nesting.
