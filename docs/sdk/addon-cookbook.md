<p align="center">
  <img src="/logo.svg" width="120" alt="Metacore" />
</p>

<h1 align="center">Addon Cookbook</h1>

Short recipes for the patterns that come up while building addons. Each entry is a question, the smallest working snippet, and a one-line note about *why*. For deep context on any feature, follow the links to [`manifest-spec.md`](./manifest-spec) and [`dynamic-ui.md`](./dynamic-ui).

## Table of contents

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

## How do I add a foreign-key relation?

Declare `ref` on the column. The host generates the `FOREIGN KEY` constraint and exposes a `/options/<model>` endpoint that the modal's relation picker uses.

```json
{
  "table_name": "ticket_comments",
  "columns": [
    { "name": "ticket_id", "type": "uuid", "required": true,
      "ref": "addon_tickets.tickets" }
  ]
}
```

The edit dialog will render a searchable combobox for `ticket_id`. Targets can be cross-schema (`addon_<other>.<table>`) or core (`users`, `organizations`).

## How do I make a column searchable?

Two layers — column-level filterability (driven by metadata, surfaced as a per-column filter chip in the toolbar) and global search (driven by the toolbar's free-text input).

```json
{
  "name": "title",
  "type": "string",
  "size": 255,
  "searchable": true,
  "filterable": true
}
```

`searchable: true` includes the column in the global ILIKE-style search the toolbar emits as `?search=`. `filterable: true` lets the kernel produce a `FilterDefinition` for it so users see a per-column filter button.

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

Declare the action under the model with `fields[]`:

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

`<DynamicTable>` adds "Reassign" to the row dropdown. Clicking it fires `<ActionModalDispatcher>`, which renders a modal with the declared inputs and POSTs to `/data/tickets/<id>/action/reassign`. Wire the server side via `hooks` (webhook), a WASM export, or a compiled `ActionInterceptor` — see [`manifest-spec.md`](./manifest-spec.md#8-hooks-and-lifecycle_hooks).

For full custom UI register a component:

```tsx
import { actionRegistry } from '@asteby/metacore-sdk'
actionRegistry.register('tickets', 'reassign', ReassignDialog)
```

The dispatcher routes to your component when `(model, action.key)` matches.

## How do I require a permission for a button?

Wrap the affordance in `<CapabilityGate>`:

```tsx
import { CapabilityGate } from '@asteby/metacore-runtime-react'

<CapabilityGate require="db:write addon_tickets.tickets">
  <Button onClick={createTicket}>New ticket</Button>
</CapabilityGate>
```

The kernel still enforces the same capability server-side — gating UI is purely a UX courtesy. See [`dynamic-ui.md`](./dynamic-ui.md#capability-gates) for `all` / `any` / `invert` modes.

## How do I emit an event when a record changes?

Declare the capability and the event topic:

```json
"capabilities": [
  { "kind": "event:emit", "target": "ticket.*", "reason": "Notify state changes" }
],
"events": ["ticket.created", "ticket.resolved"]
```

In a webhook / WASM export, call the host's event API with `{ topic: 'ticket.resolved', payload: {…} }`. The kernel checks the capability, persists the event, and fans out to subscribers.

For automatic events on every CRUD operation, use `lifecycle_hooks`:

```json
"lifecycle_hooks": {
  "tickets": [
    { "event": "after_create",
      "target": { "type": "webhook", "url": "/webhooks/ticket_created" },
      "async": true }
  ]
}
```

## How do I subscribe to events from another addon?

Declare the capability and pull events from the bus in your handler:

```json
"capabilities": [
  { "kind": "event:subscribe", "target": "invoice.stamped" }
]
```

The publishing addon must declare `events: ["invoice.stamped"]` so the host knows the schema. Subscribe via the kernel's bus API in your WASM module or via a webhook the kernel calls when the event fires.

## How do I show a different UI for create vs edit?

`<DynamicRecordDialog>` already swaps title and submit label per `mode`. If you need different fields, branch at the call site and render two distinct components (or two manifest models — one for the create funnel, one for editing the persisted record).

```tsx
{mode === 'create'
  ? <FullCreationWizard onDone={refetch} />
  : <DynamicRecordDialog open mode="edit" model="tickets" recordId={id} />}
```

## How do I add a soft-delete column?

```json
{
  "table_name": "tickets",
  "soft_delete": true,
  "columns": [ /* … */ ]
}
```

The host adds a `deleted_at timestamptz` column, filters it out from default queries, and routes `DELETE /data/tickets/<id>` to a `UPDATE … SET deleted_at = now()`. No app-level wiring required.

## How do I scope records per organization?

```json
{
  "table_name": "tickets",
  "org_scoped": true,
  "columns": [ /* … */ ]
}
```

The host adds an `organization_id` column, sets a NOT NULL + index, applies a Postgres RLS policy, and stamps the column on insert. Cross-tenant reads are denied by the kernel even if a capability would otherwise allow them.

For regulated data prefer `tenant_isolation: "schema-per-tenant"` instead — see [`manifest-spec.md`](./manifest-spec.md#2-tenant-isolation).

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

Build the frontend with `@originjs/vite-plugin-federation` and a `name` matching `container`. The exposed module must export `register(api: AddonAPI)`, which receives the host SDK and registers slot contributions, action handlers, navigation items, etc.

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

## How do I add a row dropdown action that links to another page?

Declare an action with `type: "link"` and a `linkUrl` template:

```json
{
  "key": "open_invoice",
  "label": "Open invoice",
  "icon": "ExternalLink",
  "type": "link",
  "linkUrl": "/invoices/{invoice_id}"
}
```

Tokens like `{invoice_id}` are replaced with the row's value before navigation. `<DynamicTable>` recognises `type: "link"` and uses the host's TanStack Router `navigate()` instead of opening a modal.

## How do I gate an action on the row's current state?

Use `condition` to hide the action from the dropdown when the row doesn't match, and `requiresState` to assert the same on the server:

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

`condition` filters the dropdown client-side (`eq`, `neq`, `in`, `not_in`); `requiresState` makes the kernel reject stale executions where the row state changed between fetch and click.

---

Have a recipe to add? Send a PR — recipes live in this file as a flat list, no nesting.
