<p align="center">
  <img src="/logo.svg" width="120" alt="Metacore" />
</p>

<h1 align="center">Quickstart</h1>

<p align="center">
  <strong>Build a CRUD addon in 5 minutes — declare it, don't code it.</strong>
</p>

By the end of this guide you will have:

- A new addon scaffold with a `manifest.json` declaring one model.
- The kernel auto-migrating the table on install and exposing CRUD endpoints.
- A working tabular UI in your host app — sortable, filterable, paginated, with create/edit/delete dialogs — rendered from a single `<DynamicTable model="..." />` line.

No glue code. No controllers. No forms. The contract is the manifest.

## Table of contents

- [Prerequisites](#prerequisites)
- [Step 1 — Scaffold an addon](#step-1--scaffold-an-addon)
- [Step 2 — Declare your model](#step-2--declare-your-model)
- [Step 3 — Install it in a host](#step-3--install-it-in-a-host)
- [Step 4 — Render the UI](#step-4--render-the-ui)
- [Step 5 — Add a custom action](#step-5--add-a-custom-action)
- [What you got for free](#what-you-got-for-free)
- [Next steps](#next-steps)

## Prerequisites

| Tool | Why |
|---|---|
| Node.js 20+ | Host frontend, scaffolders. |
| pnpm 9+ | Workspace package manager. |
| Go 1.22+ | Required if you build the addon CLI from source or compile a WASM backend. |
| TinyGo 0.31+ | Only if your addon ships a WASM backend (optional for this guide). |
| A running Metacore host | Asteby Ops, Asteby Link, or a fresh app from `npx create-metacore-app`. |

If you don't have a host yet, scaffold one in 30 seconds:

```bash
npx create-metacore-app my-host
cd my-host
pnpm dev
```

`create-metacore-app` wires `@asteby/metacore-starter-config`, theme, UI, auth, i18n and the runtime — see [`consumer-guide.md`](./consumer-guide) for the full integration.

## Step 1 — Scaffold an addon

Install the developer CLI and create a new addon directory:

```bash
go install github.com/asteby/metacore-sdk/cli@latest
metacore init tickets
cd tickets
```

The scaffold lays down:

```
tickets/
├── manifest.json              # the contract — every host reads this
├── migrations/
│   └── 0001_init.sql          # initial DDL, scoped to the addon's schema
└── frontend/
    └── src/
        └── plugin.tsx         # federated UI entry (optional)
```

The manifest already declares one model (`tickets_items`) with two columns. Let's replace it with something more interesting.

## Step 2 — Declare your model

Open `manifest.json` and replace `model_definitions` with:

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

Validate the manifest:

```bash
metacore validate
# ok: tickets@0.1.0 passes validation against kernel 2.0.0
```

`validate` runs the same gates the marketplace runs at upload time: identifier regex, default-literal whitelist, capability scoping, semver. Failures are loud and specific.

Build the bundle while you're here — you'll need the `.tar.gz` to install it in a host:

```bash
metacore build --strict
# built tickets-0.1.0.tar.gz (1 migration, 0 frontend files, 0 backend files, target=webhook)
```

`--strict` rejects warnings (unscoped capabilities, missing reasons, untagged frontend dist). Use it for any production build.

## Step 3 — Install it in a host

In dev, drop the addon directory into the host's installations folder (or symlink it). The kernel watches for installations on boot:

```bash
ln -s "$(pwd)" ../my-host/installations/tickets
```

Restart the host. The kernel:

1. Parses `manifest.json` and runs `AutoMigrate` against the addon's isolated Postgres schema (`addon_tickets`).
2. Adds `org_id` (because `org_scoped: true`), `deleted_at` (because `soft_delete: true`) and standard `id`/`created_at`/`updated_at` columns.
3. Registers `/data/tickets` (CRUD) and `/metadata/table/tickets` (UI metadata) under the route namespace `/m/tickets`.

Check it's up:

```bash
curl http://localhost:8080/api/metadata/table/tickets | jq '.data.columns | length'
# 9
```

## Step 4 — Render the UI

In the host frontend, mount one component:

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

Reload the host. You should see:

- A table with `number`, `title`, `status`, `priority`, `due_at` columns.
- A search box, per-column filters, sortable headers.
- Pagination defaulting to whatever the manifest declared (or 10).
- Row actions (`view`, `edit`, `delete`) under the dropdown.
- A "Create" button that opens a modal driven by the same metadata.

You wrote zero rendering code. Every column type, every filter, every dialog comes from the metadata document the kernel materialised from your manifest. See [`dynamic-ui.md`](./dynamic-ui) for the full surface.

## Step 5 — Add a custom action

Declare an action under the model:

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

`metacore validate && metacore build --strict` — restart the host. The row dropdown now shows a "Resolve" entry. Clicking it pops a confirmation dialog (`<ActionModalDispatcher>` decides which UI to render based on the action shape) and POSTs to `/data/tickets/<id>/action/resolve`.

Wire the server side via `hooks`:

```json
"hooks": {
  "tickets::resolve": "/webhooks/resolve_ticket"
}
```

The host POSTs an HMAC-signed envelope to your webhook with the ticket id and the operator's identity. See [`addon-publishing.md`](./addon-publishing) for the envelope format.

For action UIs that need form fields, add `fields: [...]` to the action — `<ActionModalDispatcher>` will render a dynamic form from them automatically. For full-custom modals, register a component:

```tsx
import { actionRegistry } from '@asteby/metacore-sdk'
actionRegistry.register('tickets', 'resolve', MyResolveDialog)
```

The dispatcher will use `MyResolveDialog` instead of the generic confirmation. See [`dynamic-ui.md`](./dynamic-ui.md#actionmodaldispatcher).

## What you got for free

For roughly 25 lines of JSON and 1 line of TSX:

| Layer | What the manifest produced |
|---|---|
| Database | `addon_tickets.tickets` table with constraints, indexes, FK refs, RLS for org scoping, soft delete column. |
| HTTP | Paginated list, single-record fetch, create, update, delete, custom action endpoints. |
| Metadata | `/metadata/table/tickets`, `/metadata/modal/tickets`, `/metadata/all` (the prefetch endpoint). |
| Permissions | Capability checks against `db:read`/`db:write` on the addon's own schema (implicit) and any cross-schema access you declared. |
| Frontend | Sortable/filterable/paginated table, create/edit/view modal, custom-action dispatcher, bulk delete with progress, URL-syncable filters, capability gates. |
| Lifecycle | `before_create`, `after_create`, `before_update`, `after_update`, `before_delete`, `after_delete` hooks if you wire them. |

What you *didn't* write: a controller, a route file, a SQL migration, a form component, a column renderer, a confirmation dialog, a state-machine for the action button, an `axios.delete` call, or a permission middleware.

## Next steps

- [`dynamic-ui.md`](./dynamic-ui) — every component the runtime ships, with props and customization patterns.
- [`addon-cookbook.md`](./addon-cookbook) — recipes: foreign keys, custom validations, soft delete, event emission, custom modals.
- [`manifest-spec.md`](./manifest-spec) — every field of `manifest.json`.
- [`capabilities.md`](./capabilities) — declaring sandboxed permissions.
- [`wasm-abi.md`](./wasm-abi) — when you need server-side logic with a TinyGo backend.
- [`addon-publishing.md`](./addon-publishing) — signing, uploading and the marketplace review flow.
- [`consumer-guide.md`](./consumer-guide) — building a host app that consumes the SDK packages.
