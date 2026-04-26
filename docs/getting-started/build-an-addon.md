# Build an addon

An addon is a self-contained module that adds tables, endpoints and UI to a Metacore-powered app. You write a manifest, the SDK builds a `.mcbundle`, you publish it (or copy it to a host's bundle directory). The host hot-installs it.

This page walks through the loop end-to-end. The deep dive — every manifest field, every CLI flag, every React primitive — lives in the [SDK docs](https://asteby.github.io/metacore-sdk/).

[[toc]]

## Prerequisites

- **Node.js 20+** and **pnpm 10+**
- A host running the kernel (locally or remote) where you can install the bundle. If you don't have one, see [Embed the runtime](/getting-started/embed-the-runtime) for a 60-line standalone server.

## 1. Scaffold

```bash
pnpm dlx @asteby/metacore-cli init tickets --template=basic
cd tickets
```

You get a tree like this:

```
tickets/
├── manifest.json          # the source of truth
├── package.json           # only if the addon ships React UI
├── src/
│   └── index.ts           # optional frontend slot
├── go/                    # optional Go logic (compiled to WASM)
│   └── main.go
└── README.md
```

For a pure-CRUD addon you can delete `go/` and `src/` — the manifest alone is enough.

## 2. Define the manifest

```json
{
  "id": "tickets",
  "name": "Tickets",
  "version": "0.1.0",
  "displayName": "Support Tickets",
  "tables": [
    {
      "name": "tickets",
      "displayName": "Tickets",
      "columns": [
        { "name": "id",         "type": "uuid",   "primaryKey": true },
        { "name": "title",      "type": "string", "required": true,  "label": "Title" },
        { "name": "body",       "type": "text",   "label": "Description" },
        { "name": "status",     "type": "enum",   "values": ["open", "in_progress", "closed"], "default": "open" },
        { "name": "priority",   "type": "enum",   "values": ["low", "med", "high"],            "default": "med" },
        { "name": "assignee",   "type": "string", "label": "Assignee" },
        { "name": "created_at", "type": "timestamp", "default": "now()" }
      ]
    }
  ],
  "capabilities": [
    { "kind": "db:read",  "target": "tickets" },
    { "kind": "db:write", "target": "tickets" },
    { "kind": "event:emit", "target": "tickets.changed" }
  ],
  "permissions": [
    { "id": "tickets.view",   "label": "View tickets" },
    { "id": "tickets.create", "label": "Create tickets" },
    { "id": "tickets.edit",   "label": "Edit tickets" },
    { "id": "tickets.delete", "label": "Delete tickets" }
  ]
}
```

A few things to notice:

- **`tables[]` is the schema.** The kernel's installer reads this and runs the migration.
- **`capabilities[]` is what the addon promises to do.** The kernel enforces it: a `db:write` on `tickets` is the only way the addon can mutate the table.
- **`permissions[]` is what users can be granted.** Hosts gate the UI based on these IDs.

The full manifest spec — every column type, every validator, every action shape — is at [`asteby.github.io/metacore-sdk/manifest-spec`](https://asteby.github.io/metacore-sdk/manifest-spec).

## 3. Build the bundle

```bash
pnpm metacore-sdk build
```

This produces `dist/tickets-0.1.0.mcbundle`. The bundle is a tarball with the manifest, any compiled WASM, any built frontend assets, and a manifest signature.

For a pure-CRUD addon, that's the whole build. If you have Go code in `go/`, the CLI compiles it with `tinygo` to a WASM module and includes it. If you have React in `src/`, it's bundled with the SDK's slot loader.

## 4. Install on a host

If you're running the kernel locally:

```bash
pnpm metacore-sdk install dist/tickets-0.1.0.mcbundle --host=http://localhost:8080
```

The host's installer:

1. Verifies the bundle signature.
2. Loads the manifest and checks for conflicts (table name collisions, capability requests outside the addon's namespace).
3. Runs the migration: creates the `tickets` table, indexes, FKs.
4. Mounts the dynamic CRUD routes: `GET/POST/PATCH/DELETE /api/addons/tickets/tickets`.
5. Registers metadata: `GET /api/addons/tickets/_meta/columns` now returns the column schema.
6. Loads the WASM module (if any) and any frontend slots.

No restart. The host is live with the new addon.

## 5. See the CRUD UI

Open the host's frontend. The addon shows up in the navigation; clicking it renders a `<DynamicTable>` against `/api/addons/tickets/tickets`:

```tsx
import { DynamicTable } from '@asteby/metacore-runtime-react'

<DynamicTable addon="tickets" table="tickets" />
```

You get list / paginate / sort / filter / row-click-to-edit / create / delete — all from the metadata. Real-time updates flow over WebSocket.

If you want a custom view, mount your own component instead:

```tsx
import { useDynamicQuery } from '@asteby/metacore-runtime-react'

const { rows, isLoading } = useDynamicQuery({
  addon: 'tickets',
  table: 'tickets',
  filter: { status: 'open' },
  sort: [{ col: 'priority', dir: 'desc' }],
})
```

The hook handles pagination, real-time invalidation and permission checks; you do the rendering.

## What's next

- **Custom actions.** Add `manifest.actions[]` for non-CRUD operations (a "close with reason" button, a bulk import). The runtime mounts the route and the UI; you write the body.
- **Frontend slots.** Replace the default detail view with a custom React component, registered via `manifest.frontend.slots`.
- **Validators.** Add Go-side validators for cross-field rules (e.g. closed tickets must have a reason).
- **Real-time emit.** Push updates to clients with `kernel.WS.Emit("tickets.changed", payload)`.

Continue in the [SDK docs →](https://asteby.github.io/metacore-sdk/quickstart) for the full addon authoring guide, every CLI command, and every component reference.

## Related

- [Manifest concept](/concepts/manifest) — the contract in depth.
- [Dynamic CRUD concept](/concepts/dynamic-crud) — what runs on the other side.
- [Permissions concept](/concepts/permissions) — capabilities and user grants.
