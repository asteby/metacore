<p align="center">
  <img src="/logo.svg" width="120" alt="Metacore" />
</p>

<h1 align="center">Dynamic UI</h1>

<p align="center">
  <strong>Metadata in. CRUD out. No glue code.</strong>
</p>

The Metacore frontend runtime turns a kernel-served metadata document into a fully-featured CRUD surface — table, filters, pagination, edit modal, custom actions, capability-gated buttons, i18n. You declare the model in `manifest.json`; the kernel materializes the database, the metadata endpoints and the permission gates; the SDK renders everything from a single component.

This document covers the React side: which components exist, what props they accept, how data flows, and how to extend or replace any part of it.

## Table of contents

- [Architecture](#architecture)
- [`<DynamicTable>`](#dynamictable)
- [`<DynamicForm>`](#dynamicform)
- [`<DynamicRecordDialog>`](#dynamicrecorddialog)
- [`<ActionModalDispatcher>`](#actionmodaldispatcher)
- [`getDynamicColumns` and the column factory](#getdynamiccolumns-and-the-column-factory)
- [Capability gates](#capability-gates)
- [Slots](#slots)
- [Navigation merging](#navigation-merging)
- [i18n](#i18n)
- [Metadata cache](#metadata-cache)
- [Customization patterns](#customization-patterns)
- [Performance](#performance)
- [What you can't do (yet)](#what-you-cant-do-yet)

## Architecture

```
   manifest.json                kernel                       runtime-react
   ─────────────                ──────                       ─────────────
   model_definitions[] ──▶  AutoMigrate  ──▶  /metadata/table/<model>
   actions[]                                  /data/<model>
   capabilities[]                             /data/<model>/<id>
                                              /data/<model>/<id>/action/<key>
                                              /options/<endpoint>

                                                            │
                                                            ▼
                                            ┌────────────────────────────┐
                                            │  <DynamicTable model="…"/> │
                                            │   <DynamicForm/>           │
                                            │   <DynamicRecordDialog/>   │
                                            │   <ActionModalDispatcher/> │
                                            └────────────────────────────┘
                                                            │
                                                            ▼
                                                  CRUD UI rendered
```

The contract between kernel and SDK is a JSON document: `TableMetadata` for tables (columns, filters, actions, capabilities, pagination defaults) and `ModalMetadata` for the edit/create dialog. Both are cached client-side via [`useMetadataCache`](#metadata-cache).

The runtime never assumes a specific HTTP client, design system or auth flow. Hosts inject these through providers:

| Provider | Source | Purpose |
|---|---|---|
| `<ApiProvider client={axios}>` | `@asteby/metacore-runtime-react` | Axios-compatible client used for every request. |
| `<BranchProvider branch={…}>` | `@asteby/metacore-runtime-react` | Optional tenant-branch context. Switching branches resets table state. |
| `<CapabilityProvider capabilities={…}>` | `@asteby/metacore-runtime-react` | Drives `<CapabilityGate>` and capability-gated actions. |
| `<I18nextProvider i18n={…}>` | `react-i18next` | All user-facing copy resolves through `useTranslation()`. |
| `<OptionsContext.Provider>` | `@asteby/metacore-runtime-react` | Internal — `<DynamicTable>` populates this with prefetched select options. |

## `<DynamicTable>`

The single component that turns a model name into a full CRUD table.

```tsx
import { DynamicTable } from '@asteby/metacore-runtime-react'

export function TicketsPage() {
  return <DynamicTable model="tickets" />
}
```

What you get:

- Sortable, paginated, filterable table driven by metadata returned from `GET /metadata/table/<model>`.
- URL state sync (`?page=`, `?sortBy=`, `?f_status=open`) — bookmarkable views.
- Server-side data via `GET /data/<model>` with the same filter/sort/pagination params.
- Built-in `view`, `edit`, `delete` actions when metadata declares them.
- Custom actions (`actions[]` in the manifest) routed to `<ActionModalDispatcher>`.
- Bulk select + bulk delete with progress UI.
- Export and Import dialogs when `metadata.canExport` / `metadata.canImport`.
- Skeleton states, empty states, error toasts.

### Props

| Prop | Type | Default | Notes |
|---|---|---|---|
| `model` | `string` | — | Model key. Used in `/metadata/table/<model>` and `/data/<model>`. |
| `endpoint` | `string` | `/data/<model>` | Override the data endpoint. Useful for nested resources. |
| `enableUrlSync` | `boolean` | `true` | Mirrors filter/sort/page state into `?query=…`. Set `false` for embedded tables. |
| `hiddenColumns` | `string[]` | `[]` | Column keys to hide. Hidden columns still load — use this for context-specific views, not for permission gating (that's the kernel's job). |
| `onAction` | `(action, row) => void \| Promise<void>` | — | Called for any action emitted by the row dropdown. If omitted, built-in `view`/`edit`/`delete` are handled internally. |
| `refreshTrigger` | `any` | — | Change this value (counter, timestamp) to force a data refetch from a parent. |
| `defaultFilters` | `Record<string, any>` | — | Filters applied unconditionally and excluded from URL sync. Useful for scoping a table to a parent record (e.g. `{ ticket_id: '…' }`). |
| `extraColumns` | `ColumnDef<any>[]` | `[]` | Extra TanStack columns appended before the actions column. |
| `getDynamicColumns` | `GetDynamicColumns` | `defaultGetDynamicColumns` | Factory that turns metadata into TanStack column defs. See [below](#getdynamiccolumns-and-the-column-factory). |

### Expected response shape

`GET /metadata/table/<model>` returns `TableMetadata`:

```ts
interface TableMetadata {
  title: string
  endpoint: string
  columns: ColumnDefinition[]      // see below
  actions: ActionDefinition[]
  filters?: FilterDefinition[]
  perPageOptions: number[]
  defaultPerPage: number
  searchPlaceholder: string
  enableCRUDActions: boolean
  hasActions: boolean
  canExport?: boolean
  canImport?: boolean
  canCreate?: boolean
}
```

`GET /data/<model>` returns the canonical `ApiResponse<T[]>` envelope:

```ts
interface ApiResponse<T> {
  success: boolean
  data: T
  meta?: { current_page; from; last_page; per_page; to; total }
  message?: string
}
```

### Quick reference

```tsx
// Bookmarkable list view at /tickets
<DynamicTable model="tickets" />

// Embedded inside a ticket detail page — no URL sync, prefiltered by parent.
<DynamicTable
  model="ticket_comments"
  enableUrlSync={false}
  defaultFilters={{ ticket_id: ticket.id }}
/>

// Custom action handler — caller decides what to do for non-built-in keys.
<DynamicTable
  model="invoices"
  onAction={async (action, row) => {
    if (action === 'send_pdf') await sendInvoicePdf(row.id)
  }}
/>
```

## `<DynamicForm>`

A standalone form renderer that consumes `ActionFieldDef[]` — the same shape used by manifest actions and modal metadata. Use it for one-off forms that aren't tied to a record dialog.

```tsx
import { DynamicForm } from '@asteby/metacore-runtime-react'

const fields = [
  { key: 'note', label: 'Note', type: 'textarea', required: true },
  { key: 'send_email', label: 'Send confirmation', type: 'boolean', defaultValue: true },
]

<DynamicForm
  fields={fields}
  initialValues={{ note: '' }}
  onSubmit={async (values) => api.post('/notes', values)}
  submitLabel="Send"
/>
```

### Props

| Prop | Type | Default | Notes |
|---|---|---|---|
| `fields` | `ActionFieldDef[]` | — | Required. Each field renders an input based on `type`. |
| `initialValues` | `Record<string, any>` | — | Pre-populates inputs. Falls back to each field's `defaultValue`, then a type-appropriate empty value. |
| `onSubmit` | `(values) => void \| Promise<void>` | — | Called after a synchronous required-field check. |
| `onCancel` | `() => void` | — | When provided, renders a Cancel button to the left of Submit. |
| `submitLabel` | `string` | `'Guardar'` | Submit button label. Pass through `t()` if you need it localized. |
| `cancelLabel` | `string` | `'Cancelar'` | Cancel button label. |
| `disabled` | `boolean` | `false` | Disables both buttons. |

### `ActionFieldDef` shape

```ts
interface ActionFieldDef {
  key: string
  label: string
  type: 'text' | 'textarea' | 'select' | 'number' | 'date' | 'boolean'
      | 'email' | 'url' | string
  required?: boolean
  options?: { value: string; label: string }[]
  defaultValue?: any
  placeholder?: string
  searchEndpoint?: string
}
```

`type` falls back to a plain text input when the value is unrecognised. `email` and `url` upgrade the underlying `<input type=…>` for native validation but no extra logic runs in the SDK — server-side validation remains authoritative.

## `<DynamicRecordDialog>`

The create / edit / view modal opened from the row dropdown. Reads `GET /metadata/modal/<model>` (cached) and `GET /data/<model>/<id>` for edit/view.

```tsx
import { DynamicRecordDialog } from '@asteby/metacore-runtime-react'

const [dialog, setDialog] = useState({ open: false, mode: 'create' as const, recordId: null })

<DynamicRecordDialog
  open={dialog.open}
  onOpenChange={(open) => setDialog((s) => ({ ...s, open }))}
  mode={dialog.mode}            // 'create' | 'edit' | 'view'
  model="tickets"
  recordId={dialog.recordId}    // null for create
  onSaved={() => refetchTable()}
/>
```

`<DynamicTable>` renders this for you on `view`/`edit`. You only mount it directly when wiring a "Create…" button outside a table (e.g. in the page header).

| Prop | Type | Notes |
|---|---|---|
| `open` | `boolean` | Controlled. |
| `onOpenChange` | `(open: boolean) => void` | Called by close button / outside click. |
| `mode` | `'view' \| 'edit' \| 'create'` | Drives title, submit label and field readonly state. |
| `model` | `string` | Same model key as `<DynamicTable>`. |
| `recordId` | `string \| null` | Required for `view` / `edit`. |
| `endpoint` | `string` | Override `/data/<model>`. |
| `onSaved` | `() => void` | Called on successful create/edit so callers can refetch. |

The dialog uses native `react-hook-form`-style local state (no external store dependency). Field types come from the kernel-served modal metadata: `text`, `textarea`, `select`, `search` (relation picker), `number`, `date`, `email`, `url`, `boolean`, `image`. Foreign-key fields with `searchEndpoint` populate via `/options/<endpoint>` on demand.

## `<ActionModalDispatcher>`

Routes a custom action declared in `manifest.actions[]` to the right modal:

1. **Custom registered component.** If the SDK's action registry has a component for `<model>::<action.key>`, it is used. Hosts register these via:
   ```ts
   import { actionRegistry } from '@asteby/metacore-sdk'
   actionRegistry.register('tickets', 'reassign', ReassignDialog)
   ```
2. **`action.fields[].length > 0`.** Renders a generic modal with `<DynamicForm>`-style inputs.
3. **`action.confirm === true`.** Renders an `AlertDialog` confirmation.
4. **None of the above.** Returns `null` — caller is expected to execute immediately.

`<DynamicTable>` wires this for you. You only render it directly when implementing actions outside a table.

```tsx
<ActionModalDispatcher
  open={open}
  onOpenChange={setOpen}
  action={{
    key: 'resolve',
    label: 'Resolve',
    icon: 'CheckCircle2',
    confirm: true,
    confirmMessage: 'Mark this ticket as resolved?',
  }}
  model="tickets"
  record={ticket}
  onSuccess={() => refetch()}
/>
```

The dispatcher posts to `POST /data/<model>/me/<id>/action/<key>` (or `<endpoint>/<id>/action/<key>` if you override the endpoint).

## `getDynamicColumns` and the column factory

`<DynamicTable>` accepts a `getDynamicColumns` prop — a pure function that turns metadata into TanStack `ColumnDef[]`. The default implementation handles every cell style emitted by the kernel: badge (static + endpoint-loaded options), avatar, phone, date, boolean, relation badges, media gallery, image, plus a generic text fallback.

### Backend contract: `col.key`

The factory reads each column from the `key` field. The backend is the source of truth for that name:

```ts
metadata.columns.forEach((col) => {
  // col.key — primary identifier (used as accessorKey AND id)
  // col.label — header label
  // col.type — drives the cell renderer
  // ...
})
```

Older host implementations expected `col.name` and produced empty rows when the kernel switched to `col.key`. The SDK has been on `col.key` since `runtime-react@4.0.1`; ensure your kernel and host versions match.

### Using the factory

For most hosts the default is sufficient:

```tsx
<DynamicTable model="tickets" />
```

If you need to pass URL helpers (avatar resolution, CDN base path), use `makeDefaultGetDynamicColumns`:

```tsx
import { DynamicTable, makeDefaultGetDynamicColumns } from '@asteby/metacore-runtime-react'

const getDynamicColumns = makeDefaultGetDynamicColumns({
  apiBaseUrl: import.meta.env.VITE_API_URL.replace('/api', ''),
  getImageUrl: (path) => path.startsWith('http') ? path : `${CDN}/${path}`,
})

<DynamicTable model="users" getDynamicColumns={getDynamicColumns} />
```

### Replacing it

Pass a fully custom factory when your design system diverges meaningfully from shadcn/Radix:

```tsx
const myColumns: GetDynamicColumns = (metadata, onAction, t, lang, filterConfigs) =>
  metadata.columns.map((col) => ({
    accessorKey: col.key,
    id: col.key,
    header: col.label,
    cell: ({ row }) => <MyBrandedCell value={row.original[col.key]} type={col.type} />,
  }))

<DynamicTable model="orders" getDynamicColumns={myColumns} />
```

The factory is called every render; memoize externally if it's heavy (most aren't).

### Cell types

| `col.type` / `col.cellStyle` | Renderer |
|---|---|
| `text`, default | Truncated `<span>` with title attribute. |
| `date` | Calendar icon + locale-formatted date (`date-fns`, ES/EN). |
| `boolean` | "Sí" / "No" badges (translate at the host level). |
| `phone` | Plain string (formatting is the host's responsibility). |
| `avatar`, `search` | Avatar + name + optional description. Resolves via `apiBaseUrl` + `basePath`. |
| `image` | Thumbnail with fallback hide on error. |
| `media-gallery` | Stacked avatars, +N indicator beyond 3. |
| `relation-badge-list` | Wraps `displayField`/`iconField` from each related record. |
| `cellStyle === 'badge'` | Static `options[]` lookup; falls back to outline badge. |
| `cellStyle === 'badge'` + `useOptions` + `searchEndpoint` | Endpoint-prefetched options via `OptionsContext`. |

## Capability gates

Wrap any UI you want to hide behind a permission:

```tsx
import { CapabilityGate, CapabilityProvider } from '@asteby/metacore-runtime-react'

// At the root, once.
<CapabilityProvider capabilities={user.capabilities}>
  {children}
</CapabilityProvider>

// At any usage site.
<CapabilityGate require="db:write addon_tickets.tickets">
  <Button onClick={createTicket}>New ticket</Button>
</CapabilityGate>

<CapabilityGate all={['cap.a', 'cap.b']} fallback={<UpgradeBanner />}>
  <PremiumWidget />
</CapabilityGate>

<CapabilityGate any={['db:read users', 'db:read members']}>
  <Assignee />
</CapabilityGate>
```

| Prop | Notes |
|---|---|
| `require` | A single capability that must be present. |
| `all` | All listed capabilities must be present. |
| `any` | At least one must be present. |
| `invert` | Render children when capability is **absent**. |
| `fallback` | Element shown when the gate denies. Default `null`. |

Capability strings are free-form — the canonical format is `<kind> <target>` (e.g. `db:read addon_tickets.*`) but hosts can use any naming. The gate is purely a UI affordance: the kernel still enforces capabilities server-side. See [`capabilities.md`](./capabilities).

## Slots

Named extension points the host renders and addons contribute to:

```tsx
import { Slot, slotRegistry } from '@asteby/metacore-runtime-react'

// Inside an addon's register() function:
slotRegistry.register('dashboard.widgets', RevenueWidget, { priority: 10, source: 'billing' })

// In the host:
<Slot name="dashboard.widgets" props={{ orgId }} fallback={<EmptyDashboard />} />
```

The registry is render-store backed (`useSyncExternalStore`); contributions appear and disappear instantly when an addon registers/unregisters. Higher `priority` renders first.

Common slot ids: `dashboard.widgets`, `app.command-palette`, `record.<model>.header`, `record.<model>.footer`. There is no enforced enum — slot ids are a convention between the host and addons.

## Navigation merging

`mergeNavigation` (and the `useNavigation` hook) merges the host's base sidebar with `manifest.navigation` from every loaded addon, deduping by `key` and respecting `priority`.

```tsx
import { useNavigation } from '@asteby/metacore-runtime-react'

const items = useNavigation(baseSidebar, [
  { source: 'tickets', items: ticketsManifest.navigation },
  { source: 'billing', items: billingManifest.navigation },
])

return <AppSidebar navGroups={items} />
```

`NavItem` supports `requires` (capability), `priority` (sort weight), and nested `children`.

## i18n

Addon translations declared in `manifest.i18n` are folded into the host's i18next instance via `<I18nProvider>`:

```tsx
import { I18nProvider } from '@asteby/metacore-runtime-react'

<I18nProvider
  i18n={i18n}
  contributions={[
    { source: 'tickets', resources: ticketsManifest.i18n },
    { source: 'billing', resources: billingManifest.i18n },
  ]}
>
  {children}
</I18nProvider>
```

Each addon contributes a namespace equal to its `source` key. Components inside the runtime use the default namespace plus a `common.*` and `datatable.*` set the host is expected to provide — see `@asteby/metacore-ui` README for the full key list.

Column headers are rendered as `{col.label}` straight from the metadata. Hosts can preprocess the metadata before passing it to a custom `getDynamicColumns` if they want to translate labels through `t(col.label)` instead.

## Metadata cache

`useMetadataCache` is a Zustand store that persists table and modal metadata across mounts and across full page reloads (LocalStorage, namespace `metacore-metadata-cache`).

```ts
import { useMetadataCache } from '@asteby/metacore-runtime-react'

const { prefetchAll, getMetadata, hasMetadata } = useMetadataCache()

// Once at app startup — populates the cache from a single round trip.
useEffect(() => { prefetchAll(api) }, [api])
```

`prefetchAll(api)` calls `GET /metadata/all` (returning `{ tables, modals, version }`). When the server's `version` differs from the cached one, the entire cache is invalidated — perfect for invalidating client caches after a kernel upgrade.

`<DynamicTable>` reads the cache before issuing a network request. Repeat visits to the same model render instantly.

## Customization patterns

### Custom cell renderers

Replace `getDynamicColumns` and branch on `col.type` / `col.cellStyle`. See [the factory section](#getdynamiccolumns-and-the-column-factory).

### Custom action handlers

Two layers:

1. Declarative — declare `actions[]` in the manifest with `confirm`, `fields[]` and let `<ActionModalDispatcher>` render the modal.
2. Imperative — register a fully custom modal component:
   ```ts
   import { actionRegistry } from '@asteby/metacore-sdk'
   actionRegistry.register('invoices', 'send_email', SendEmailDialog)
   ```
   The dispatcher will pick up your component when an action key matches.

### Wiring a "Create" button outside the table

```tsx
const [createOpen, setCreateOpen] = useState(false)

<Button onClick={() => setCreateOpen(true)}>New ticket</Button>
<DynamicRecordDialog
  open={createOpen}
  onOpenChange={setCreateOpen}
  mode="create"
  model="tickets"
  onSaved={() => queryClient.invalidateQueries({ queryKey: ['tickets'] })}
/>
```

### Hiding columns conditionally

```tsx
<DynamicTable
  model="invoices"
  hiddenColumns={user.role === 'viewer' ? ['total', 'tax'] : []}
/>
```

For permission-driven hiding, prefer kernel-side filtering — the metadata endpoint can omit columns the caller cannot read, which is more robust than client-side hiding.

### Different UI for create vs edit

`mode` is a regular prop on `<DynamicRecordDialog>`. Pass `'create'` or `'edit'`; the dialog reads the same metadata but uses `createTitle` / `editTitle` and clears values for create.

For radically different create flows, branch at the call site and render a different component for `mode === 'create'`.

## Performance

| Concern | What the runtime does |
|---|---|
| Metadata round-trips | Cached in LocalStorage via `useMetadataCache`. `prefetchAll()` fetches every model in one call at startup. |
| Pagination | Server-side. The runtime sends `page=` and `per_page=` and respects the response `meta.total`. |
| Sorting / filtering | Server-side. URL params are `sortBy=`, `order=`, `f_<col>=`. |
| Select option prefetch | One batched fetch per unique `searchEndpoint` on mount; results held in `OptionsContext`. |
| Re-renders | `getDynamicColumns` is invoked inside a `useMemo`. Filter configs and column visibility live in component state. |
| Virtualization | Not built in. For very large pages (>200 rows) wrap your custom `getDynamicColumns` cell renderers in `React.memo` and consider switching to a smaller `defaultPerPage`. |

## What you can't do (yet)

The runtime is opinionated. These are intentional gaps; treat them as places where you should drop down to a custom component instead.

- **Multi-table joins.** `<DynamicTable>` is one model per mount. For master-detail, render two tables and link them with `defaultFilters`.
- **Inline editing.** Cells are read-only. Edits go through the record dialog.
- **Custom RPC.** Actions are POSTs to `/data/<model>/.../action/<key>`. Other shapes (long-poll, SSE, websocket-only) need their own components.
- **Cross-model search.** The toolbar's global search is per-model. For app-wide search use `@asteby/metacore-ui/command-menu`.
- **Optimistic updates.** Mutations always refetch. If you need optimistic cache writes, wrap the mutation yourself outside the runtime.
- **Schema-less rendering.** The runtime requires a `TableMetadata` document. Free-form data needs a different component.

When a host needs more, the recommended pattern is to compose: wrap `<DynamicTable>` for the parts that fit and drop down to `@asteby/metacore-ui` primitives for the rest.

## Related

- [`quickstart.md`](./quickstart) — your first addon in 5 minutes.
- [`manifest-spec.md`](./manifest-spec) — the source of every `col.*` and `actions[]` field.
- [`addon-cookbook.md`](./addon-cookbook) — recipes for common scenarios.
- [`capabilities.md`](./capabilities) — declaring scoped permissions.
- [`consumer-guide.md`](./consumer-guide) — wiring the SDK into a host app.
