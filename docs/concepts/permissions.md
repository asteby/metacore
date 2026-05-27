# Permissions

Metacore has two parallel permission systems that work together: **capabilities** (what an addon may do) and **permissions** (what a user may do). Every call has to satisfy both. This page explains the model and the enforcement points.

[[toc]]

## Two layers, one decision

```
       ┌─────────────────────────────────────┐
       │          incoming request            │
       └────────────────────┬────────────────┘
                            ▼
            ┌───────────────────────────────┐
            │  1. capability check           │
            │     (does the addon have      │
            │      permission to do this?)  │
            │     enforced by:              │
            │     security.Enforcer         │
            └────────────┬──────────────────┘
                         ▼ allowed
            ┌───────────────────────────────┐
            │  2. permission check           │
            │     (is this user allowed     │
            │      to take this action?)    │
            │     enforced by:              │
            │     permission.Service         │
            └────────────┬──────────────────┘
                         ▼ allowed
                  handler runs
```

Both checks run on every CRUD call, every action call, every WebSocket subscribe. A request is allowed only if both clear.

## Capabilities — the addon contract

A capability is something an addon promises to do, declared in `manifest.capabilities[]`:

```json
"capabilities": [
  { "kind": "db:read",    "target": "addon_tickets.*" },
  { "kind": "db:write",   "target": "addon_tickets.*" },
  { "kind": "event:emit", "target": "tickets.changed" },
  { "kind": "http:fetch", "target": "https://api.example.com/*", "reason": "external sync" }
]
```

The closed set of capability kinds is:

| Kind | Targets | What it covers |
|---|---|---|
| `db:read` | schema/table glob | Reading a table |
| `db:write` | schema/table glob | Inserts, updates, deletes |
| `event:emit` | event name | Publishing on the in-process event bus / WebSocket hub |
| `event:subscribe` | event name | Subscribing to a published event |
| `http:fetch` | URL prefix | Outbound HTTP from WASM-sandboxed code |
| `secrets:read` | secret glob | Reading a host-managed secret |
| `fs:read` | path glob | Reading bundled read-only files |
| `cron:register` | cron expression | Registering a scheduled sweep |
| `queue:produce` / `queue:consume` | queue name | Producing / consuming on a queue |
| `file-storage:write` | path glob | Writing to file storage (exports, attachments) |
| `time:wallclock` | — | Reading the host wall clock |

The addon's own schema (`addon_<key>.*`) is always accessible — never declare it. The full list and target syntax is in the [kernel WASM ABI](https://asteby.github.io/metacore-kernel/wasm-abi).

### Why capabilities exist

Without them, an addon could do anything the host process can — read every table, call every external API, exfiltrate every secret. Capabilities make the addon's surface explicit and reviewable. An operator looking at a manifest sees exactly what the addon can touch, and the kernel enforces it at every call.

### Enforcement modes

The kernel runs the security enforcer in one of two modes, configurable per host:

- **Shadow.** Capability violations are logged as warnings but the call proceeds. Useful in development to discover missing declarations without breaking flows.
- **Enforce.** Capability violations 403. Used in production.

The mode is part of the host's config; the addon doesn't know which one is active.

### What targets look like

Target syntax depends on the kind: `http:fetch` matches a URL prefix, `cron:register` a cron expression, `event:*` an event name, and `db:read`/`db:write` a `schema.table` glob (e.g. `addon_tickets.*`). The addon's own schema is implicit; cross-schema access needs an explicit grant (`db:read public.users`) and the installer rejects manifests that overreach.

## Permissions and roles — the user contract

v3 declares the user-facing side under `rbac`: first-class **roles** plus the **permissions** they bundle.

```json
"rbac": {
  "permissions": [
    { "key": "tickets.read",   "label": "View tickets" },
    { "key": "tickets.write",  "label": "Create / edit / delete tickets" },
    { "key": "tickets.export", "label": "Export tickets" }
  ],
  "roles": [
    { "key": "tickets_agent",   "label": "tickets.role.agent",
      "permissions": ["tickets.read", "tickets.write"] },
    { "key": "tickets_viewer",  "label": "tickets.role.viewer",
      "permissions": ["tickets.read"] }
  ]
}
```

Permission keys are **opaque to the kernel** — they're addon-defined strings. The kernel stores grants, resolves a user's effective set, and checks them. (Kernel 3.x dual-read maps a legacy v2 `permissions[]` array into `rbac.permissions[]`; roles are new in v3.)

### How users get permissions

That's the host's responsibility. A typical host has:

- **Roles** — named bundles of permissions (`viewer`, `operator`, `admin`).
- **Per-user grants** — direct grants outside any role.
- **Per-org defaults** — what every user in an org gets by default.

The kernel exposes an API for managing these (`/api/permissions/...`); how the host's admin UI looks is up to the host.

### How permissions map to CRUD

The runtime maps permission IDs to CRUD operations via convention or explicit declaration in the manifest:

| Operation | Default permission | Override |
|---|---|---|
| `GET /api/dynamic/:model` | `:model.read` | manifest |
| `GET /api/dynamic/:model/:id` | `:model.read` | manifest |
| `POST /api/dynamic/:model` | `:model.write` | manifest |
| `PUT /api/dynamic/:model/:id` | `:model.write` | manifest |
| `DELETE /api/dynamic/:model/:id` | `:model.write` | manifest |

For actions, the manifest declares the required permission explicitly:

```json
{ "key": "close_with_reason", "permission": "tickets.write", "...": "..." }
```

### UI gating

The SDK reads the user's effective permissions and gates components automatically:

```tsx
import { useCapabilities, CapabilityGate } from '@asteby/metacore-runtime-react'

// Hook form — returns { has, all, any }.
const can = useCapabilities()
if (!can.has('tickets.write')) return <ReadOnlyView />

// Declarative form.
<CapabilityGate require="tickets.write" fallback={<ReadOnlyView />}>
  <CreateButton />
</CapabilityGate>
```

Built-in components — `<DynamicTable>`, `<DynamicForm>`, action buttons — already check the right permissions and hide / disable themselves. You only need explicit checks for custom UI.

## Tenancy

Both layers operate inside the user's tenant scope. The kernel auto-filters every dynamic CRUD query by `org_id`; cross-tenant data is not reachable from a normal request, even with the right permission. Cross-tenant access requires an explicit `superuser` capability the kernel ships with disabled.

## Audit

Every capability check and permission check produces an audit event (allowed or denied), routed through the kernel's audit hook. Hosts plug in their own sink — typically a structured log or a dedicated audit table.

## Related

- [Manifest](/concepts/manifest) — where both layers are declared.
- [Dynamic CRUD](/concepts/dynamic-crud) — where they're enforced.
- [Kernel docs / security ↗](https://asteby.github.io/metacore-kernel/) — Enforcer internals.
- [SDK docs / capabilities ↗](https://asteby.github.io/metacore-sdk/) — full capability reference.
