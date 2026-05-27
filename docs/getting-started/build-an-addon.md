# Build an addon

An addon is a self-contained module that adds models, endpoints and UI to a Metacore-powered app. You write a manifest, the CLI builds a bundle, you install it on a host running the kernel. The host hot-installs it.

This page walks through the loop end-to-end. The deep dive — every manifest field, every CLI flag, every React primitive — lives in the [SDK docs](https://asteby.github.io/metacore-sdk/).

::: tip Write v3
The canonical contract is **Module Contract v3** (`apiVersion: asteby.com/v3`) — that's what you author. The kernel also **dual-reads legacy v2** for compatibility (the SDK tooling is migrating to emit v3), so older addons keep working. See [Manifest → v2 compatibility](/concepts/manifest#v2-compatibility).
:::

[[toc]]

## Prerequisites

- **Go 1.25+** (the CLI is a Go binary; TinyGo 0.31+ only if your addon ships a WASM backend)
- **Node.js 20+** and **pnpm 10+** if your addon ships React UI
- A host running the kernel (locally or remote) where you can install the bundle. If you don't have one, see [Embed the runtime](/getting-started/embed-the-runtime) for a small standalone server, or scaffold a full app with `npm create @asteby/metacore-app`.

## 1. Scaffold

Install the developer CLI and create a new addon:

```bash
go install github.com/asteby/metacore-sdk/cli@latest
metacore init tickets
cd tickets
```

You get a tree like this:

```
tickets/
├── manifest.json              # the contract — every host reads this
├── migrations/
│   └── 0001_init.sql          # initial DDL, scoped to the addon's schema
└── frontend/
    └── src/
        └── plugin.tsx         # federated UI entry (optional)
```

For a pure-CRUD addon you can ignore `frontend/` — the manifest alone is enough.

## 2. Define the manifest

Author a **v3 manifest** (`apiVersion: asteby.com/v3`):

```json
{
  "apiVersion": "asteby.com/v3",
  "kind": "Addon",
  "metadata": { "key": "tickets", "name": "Tickets", "version": "0.1.0" },
  "compatibility": { "requires": [ { "key": "kernel", "version": ">=3.0.0 <4.0.0" } ] },
  "tenancy": { "isolation": "shared", "rls_column": "organization_id" },
  "capabilities": [
    { "kind": "db:read",    "target": "addon_tickets.*" },
    { "kind": "db:write",   "target": "addon_tickets.*" },
    { "kind": "event:emit", "target": "tickets.changed" }
  ],
  "models": [
    {
      "key": "Ticket",
      "table": "tickets",
      "label": "tickets.model.ticket",
      "columns": [
        { "name": "id",          "type": "uuid", "primary_key": true, "default": "gen_random_uuid()" },
        { "name": "organization_id", "type": "uuid", "not_null": true },
        { "name": "title",       "type": "text", "not_null": true },
        { "name": "description", "type": "text" },
        { "name": "status",      "type": "text", "default": "'open'" },
        { "name": "priority",    "type": "text", "default": "'normal'" }
      ]
    }
  ]
}
```

A few things to notice:

- **`models[]` is the schema.** The installer reads it and runs the migration into the addon's isolated schema (`addon_tickets`). Column identifiers use SQL underscore casing; `default` literals go through a whitelist.
- **`capabilities[]` is what the addon promises to do.** The kernel enforces it: `db:write` on `addon_tickets.*` is the only way the addon can mutate its tables.
- **`compatibility.requires[]`** replaces the flat v2 `kernel` range and can also pin peer addons.

::: details Legacy v2 manifest (still accepted)
The kernel dual-reads the older flat v2 shape — `key`/`model_definitions`/`kernel` — and up-converts it. You'll see it in older addons and, for now, in some scaffolder output while the SDK tooling finishes migrating to v3:

```json
{
  "key": "tickets",
  "name": "Tickets",
  "version": "0.1.0",
  "kernel": ">=2.0.0 <3.0.0",
  "tenant_isolation": "shared",
  "model_definitions": [
    {
      "table_name": "tickets", "model_key": "tickets", "label": "Tickets",
      "org_scoped": true, "soft_delete": true,
      "columns": [
        { "name": "title",  "type": "string", "size": 255, "required": true },
        { "name": "status", "type": "string", "size": 20, "default": "'open'", "index": true }
      ]
    }
  ],
  "capabilities": [ { "kind": "db:read", "target": "tickets" }, { "kind": "db:write", "target": "tickets" } ]
}
```
:::

The full v3 contract lives in the [kernel docs](https://asteby.github.io/metacore-kernel/); the legacy v2 field reference is in the [SDK manifest spec](/sdk/manifest-spec).

## 3. Validate and build

```bash
metacore validate
# ok: tickets@0.1.0 passes validation

metacore build --strict
# built tickets-0.1.0.tar.gz
```

`validate` runs the same gates the marketplace runs at upload time: identifier regex, default-literal whitelist, capability scoping, semver. `--strict` rejects warnings (unscoped capabilities, missing reasons). If you have Go code, it's compiled with TinyGo to a WASM module and included; if you have React in `frontend/`, it's bundled.

## 4. Install on a host

In dev, drop the addon into the host's installations folder (the kernel installs on boot):

```bash
ln -s "$(pwd)" ../my-host/installations/tickets
```

Or upload the built bundle to a running host's install endpoint. Either way the installer:

1. Verifies the bundle signature (unsigned is allowed only with `KERNEL_ALLOW_UNSIGNED=1`).
2. Parses the manifest and checks for conflicts (schema/table collisions, capabilities outside the addon's namespace).
3. Runs the migration: creates the `tickets` table, indexes, FKs in `addon_tickets`.
4. Mounts the dynamic CRUD routes: `GET/POST/PUT/DELETE /api/dynamic/tickets`.
5. Registers metadata: `GET /api/metadata/table/tickets` now returns the column schema.
6. Loads the WASM module (if any) and registers any frontend slots.

No restart. The host is live with the new addon.

## 5. See the CRUD UI

Open the host's frontend. The addon shows up in the navigation; clicking it renders a `<DynamicTable>` against `/api/dynamic/tickets`:

```tsx
import { DynamicTable } from '@asteby/metacore-runtime-react'

<DynamicTable model="tickets" />
```

You get list / paginate / sort / filter / row-click-to-edit / create / delete — all from the metadata. Real-time updates flow over WebSocket.

For a custom view, drop to the runtime's client (`useApi`) and drive your own TanStack Query calls, or extend the table via the `getDynamicColumns` prop. See [Dynamic CRUD](/concepts/dynamic-crud#the-frontend-half).

## What's next

- **Custom actions.** Add actions for non-CRUD operations (a "close with reason" button, a bulk import). The runtime mounts the route and the UI — including an auto-built modal from declarative `fields`, a `confirm` prompt, or a custom modal — and you write the body.
- **Frontend slots.** Contribute a custom React component to a published slot kind, federated via the bundle's frontend entry and `registerActionComponent` / `loadFederatedAddon`.
- **Events & subscriptions.** Emit events (gated by `event:emit`) and react to other addons' events.
- **Validators.** Add Go-side validators for cross-field rules (e.g. closed tickets must have a reason).

Continue in the [SDK docs →](https://asteby.github.io/metacore-sdk/quickstart) for the full addon authoring guide, every CLI command, and every component reference.

## Related

- [Manifest concept](/concepts/manifest) — the contract in depth, and the v2/v3 transition.
- [Dynamic CRUD concept](/concepts/dynamic-crud) — what runs on the other side.
- [Permissions concept](/concepts/permissions) — capabilities and user grants.
