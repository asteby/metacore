# Dynamic CRUD

The kernel turns `manifest.models[]` into a working REST + UI layer without any per-table code. This page explains how, from both sides — what the runtime does on the backend, and what the SDK does on the frontend.

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

The kernel mounts a fixed, **model-centric** set of routes (the host wires them under a prefix — typically `/api`):

```
GET    /api/metadata/table/:model
GET    /api/metadata/modal/:model
GET    /api/metadata/all

GET    /api/dynamic/:model?page=&size=&sort=&filter=
GET    /api/dynamic/:model/:id
POST   /api/dynamic/:model
PUT    /api/dynamic/:model/:id
DELETE /api/dynamic/:model/:id

POST   /api/dynamic/:model/:id/actions/:key
GET    /api/options/:model        # select-option lookups (host opts in via MountOptions)
GET    /api/search/:model         # typeahead search
```

There is one set of handler code in the kernel, regardless of how many addons or models exist.

### What a list call does

A `GET /api/dynamic/tickets?page=2&size=20&sort=created_at:desc&filter=status:open`:

1. **Auth.** The host's middleware has set the request identity on the context.
2. **Resolution.** The router parses `model=tickets`.
3. **Capability check.** Does the `tickets` addon have `db:read` on `tickets`? If not, 403.
4. **Permission check.** Does the user have `tickets.view`? If not, 403.
5. **Tenancy scope.** The store filters by `org_id = ctx.OrgID` automatically (multi-tenant by default).
6. **Query build.** Filter and sort are validated against the manifest's column schema; unknown columns are rejected.
7. **Execute.** A single SQL statement against the addon's database.
8. **Serialize.** Every kernel response uses the envelope `{ "success": true, "data": ..., "meta": ... }` — rows in `data`, pagination + total count in `meta`. Errors are `{ "success": false, "message": "<reason>" }`. TS consumers read `.data` for the payload.
9. **Audit (optional).** The call is logged via the kernel's audit hook.

Steps 3 and 4 are the gates that make Metacore safe by default. Steps 5 and 6 are why you don't write `WHERE org_id = ? AND ...` in your handlers.

### What a write does

`POST /api/dynamic/tickets` with `{"title":"...", "status":"open"}`:

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

The addon's tables are physical tables in the host's database, namespaced in the addon's schema (`addon_<key>`). Migrations are run inside a transaction; failed installs are rolled back atomically.

## The frontend half

### `<DynamicTable>` from manifest

```tsx
import { DynamicTable } from '@asteby/metacore-runtime-react'

<DynamicTable model="tickets" />
```

What the component does:

1. Calls `GET /api/metadata/table/tickets` once, caches it (`useMetadataCache`).
2. Builds a column config from the metadata: header label, cell style, sortability, filterability. The default `getDynamicColumns` handles every cell style the kernel emits — badge, avatar, phone, date, boolean, relation badges, media gallery, image, plus a text fallback.
3. Calls `GET /api/dynamic/tickets` with the current page/sort/filter state.
4. Renders the table — pagination, sorting, multi-column filters, row actions, create/edit/delete dialogs.
5. Subscribes to model-change events on the WebSocket hub; invalidates the query on each event.

None of it is per-model code.

### Customizing without escaping

`<DynamicTable>` accepts a `getDynamicColumns` prop — a pure function that turns metadata into TanStack `ColumnDef[]` — so you can extend or override the default cell rendering:

```tsx
import { DynamicTable, makeDefaultGetDynamicColumns } from '@asteby/metacore-runtime-react'

<DynamicTable
  model="tickets"
  getDynamicColumns={makeDefaultGetDynamicColumns({
    overrides: { status: (col) => ({ ...col, cell: StatusBadge }) },
  })}
/>
```

When you need raw access, the runtime exposes `useApi` (the typed client over the kernel envelope), `useOptions` / `useOptionsResolver` (select lookups), and `useMetadataCache`; you drive your own TanStack Query calls and do the rendering.

### Forms

`<DynamicForm>` is the create/edit counterpart:

```tsx
import { DynamicForm } from '@asteby/metacore-runtime-react'

<DynamicForm model="tickets" rowId={id} />
```

It reads the same metadata, builds a form from the model's columns, runs the same validators client-side, and submits to the kernel's CRUD endpoint. Custom inputs are pluggable per type, and you can register extra validators via `registerValidator`.

## Where dynamic CRUD ends

The query layer now does more than flat list/get. It supports **relation filters**, **`group_by`**, **aggregations** and relation **preloads** — enough to back dashboards and grouped views without bespoke handlers. A few cases stay deliberately out of scope:

- **Arbitrary cross-addon joins.** The dynamic store reads a model and its declared relations; an ad-hoc join across unrelated addons is a custom action.
- **Fully bespoke reports.** Once a report needs domain math beyond what the aggregation API expresses, write it as an action or a host endpoint.
- **Bespoke layouts.** When the metadata-driven UI fights the design, contribute a custom slot instead.

These are the right boundaries — dynamic CRUD is an 80% solution; the remaining 20% is where addons earn their keep.

## Related

- [Manifest](/concepts/manifest) — the schema dynamic CRUD reads.
- [Permissions](/concepts/permissions) — the gates on every CRUD call.
- [SDK docs / DynamicTable ↗](https://asteby.github.io/metacore-sdk/) — every prop, every hook.
- [Kernel docs / dynamic store ↗](https://asteby.github.io/metacore-kernel/) — the backend internals.
