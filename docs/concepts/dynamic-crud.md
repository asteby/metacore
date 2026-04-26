# Dynamic CRUD

The kernel turns `manifest.tables[]` into a working REST + UI layer without any per-table code. This page explains how, from both sides — what the runtime does on the backend, and what the SDK does on the frontend.

[[toc]]

## Why it's worth a concept page

CRUD is a solved problem at the request-handler level — but solving it once per table gets old fast. **Dynamic CRUD** means:

1. The runtime reads metadata at startup (or after each install).
2. It mounts a generic store + handler that knows how to serve any table the metadata describes.
3. The frontend reads the same metadata and renders forms / tables that match.
4. Adding a column requires zero code on either side.

This is the core leverage Metacore provides. Every other piece — actions, slots, lifecycle — extends this loop.

## The backend half

### What gets mounted

For each addon, the kernel mounts a fixed set of routes:

```
GET    /api/addons/:id/_meta/columns
GET    /api/addons/:id/_meta/columns/:table

GET    /api/addons/:id/:table?page=&size=&sort=&filter=
GET    /api/addons/:id/:table/:rowId
POST   /api/addons/:id/:table
PATCH  /api/addons/:id/:table/:rowId
DELETE /api/addons/:id/:table/:rowId

POST   /api/addons/:id/_actions/:actionId
```

There is one set of handler code in the kernel, regardless of how many addons or tables exist.

### What a list call does

A `GET /api/addons/tickets/tickets?page=2&size=20&sort=created_at:desc&filter=status:open`:

1. **Auth.** The host's middleware has set `kernel.Identity` on the context.
2. **Resolution.** The router parses `addon=tickets`, `table=tickets`.
3. **Capability check.** Does the `tickets` addon have `db:read` on `tickets`? If not, 403.
4. **Permission check.** Does the user have `tickets.view`? If not, 403.
5. **Tenancy scope.** The store filters by `org_id = ctx.OrgID` automatically (multi-tenant by default).
6. **Query build.** Filter and sort are validated against the manifest's column schema; unknown columns are rejected.
7. **Execute.** A single SQL statement against the addon's database.
8. **Serialize.** Rows + pagination cursor + total count, JSON.
9. **Audit (optional).** The call is logged via the kernel's audit hook.

Steps 3 and 4 are the gates that make Metacore safe by default. Steps 5 and 6 are why you don't write `WHERE org_id = ? AND ...` in your handlers.

### What a write does

`POST /api/addons/tickets/tickets` with `{"title":"...", "status":"open"}`:

1. Auth + resolution as above.
2. **Capability check.** `db:write` on `tickets`?
3. **Permission check.** `tickets.create`?
4. **Validation.** Body is checked against the manifest column schema: types, required, max length, enum values, regex.
5. **Custom validators.** Any Go-side validators registered on the addon run.
6. **Insert.** Within a transaction; tenancy fields are auto-populated.
7. **Event emit.** The runtime publishes `tickets.changed` on the WebSocket hub.
8. **Response.** The created row, including server-generated fields.

Updates and deletes follow the same shape with the relevant verb-specific checks.

### Where the data lives

The addon's tables are physical tables in the host's database. Each table is namespaced by addon ID at schema or table-name level (configurable). Migrations are run inside a transaction; failed installs are rolled back atomically.

## The frontend half

### `<DynamicTable>` from manifest

```tsx
<DynamicTable addon="tickets" table="tickets" />
```

What the component does:

1. Calls `GET /api/addons/tickets/_meta/columns/tickets` once, caches it.
2. Builds a column config from the metadata: header label, cell type, sortability, filterability.
3. Calls `GET /api/addons/tickets/tickets` with the current page/sort/filter state.
4. Renders the table.
5. Subscribes to `tickets.changed` on the WebSocket hub; invalidates the query on each event.

You get pagination, sorting, multi-column filters, row-click-to-edit, create button, delete confirmation, and real-time updates. None of it is per-table code.

### Customizing without escaping

`<DynamicTable>` accepts overrides:

```tsx
<DynamicTable
  addon="tickets"
  table="tickets"
  columns={{
    status:  { renderCell: (v) => <Badge tone={v}>{v}</Badge> },
    title:   { width: '40%' },
  }}
  onRowClick={(row) => navigate(`/tickets/${row.id}`)}
  toolbar={<MyExtraButtons />}
/>
```

When overrides aren't enough, drop to the hooks layer:

```tsx
import { useDynamicQuery, useDynamicMutation } from '@asteby/metacore-runtime-react'

const { rows, isLoading, page, setPage } = useDynamicQuery({
  addon: 'tickets',
  table: 'tickets',
  filter: { status: 'open' },
  sort:   [{ col: 'priority', dir: 'desc' }],
})

const update = useDynamicMutation({ addon: 'tickets', table: 'tickets', op: 'update' })
```

The hooks handle pagination, real-time invalidation, optimistic updates and permission gating; you do the rendering.

### Forms

`<DynamicForm>` is the create/edit counterpart:

```tsx
<DynamicForm addon="tickets" table="tickets" rowId={id} />
```

It reads the same metadata, builds a form from `columns[]`, runs the same validators client-side, and submits to the kernel's CRUD endpoint. Custom inputs are pluggable per type (e.g. a rich-text editor for `text` columns).

## Where dynamic CRUD ends

A few cases are deliberately out of scope:

- **Cross-addon joins.** The dynamic store reads one table at a time. Joins are either denormalized into the manifest or implemented as a custom action.
- **Aggregations.** Reports and dashboards are addon-defined, not auto-generated.
- **Bespoke layouts.** When the metadata-driven UI fights the design, mount a custom slot instead.

These are the right boundaries — dynamic CRUD is an 80% solution; the remaining 20% is where addons earn their keep.

## Related

- [Manifest](/concepts/manifest) — the schema dynamic CRUD reads.
- [Permissions](/concepts/permissions) — the gates on every CRUD call.
- [SDK docs / DynamicTable ↗](https://asteby.github.io/metacore-sdk/) — every prop, every hook.
- [Kernel docs / dynamic store ↗](https://asteby.github.io/metacore-kernel/) — the backend internals.
