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
  { "kind": "db:read",    "target": "tickets" },
  { "kind": "db:write",   "target": "tickets" },
  { "kind": "event:emit", "target": "tickets.changed" },
  { "kind": "http:fetch", "target": "https://api.example.com/*", "reason": "external sync" }
]
```

Capability kinds include:

| Kind | Targets | What it covers |
|---|---|---|
| `db:read` | table name | Reading a table |
| `db:write` | table name | Inserts, updates, deletes |
| `event:emit` | event name | Publishing on the WebSocket hub |
| `event:subscribe` | event name | Subscribing on the WebSocket hub |
| `http:fetch` | URL pattern | Outbound HTTP from WASM-sandboxed code |
| `secret:read` | secret name | Reading a host-managed secret |
| `kv:rw` | namespace | Read/write the kernel's KV store |

The full list is at [SDK docs / capabilities](https://asteby.github.io/metacore-sdk/manifest-spec#capabilities).

### Why capabilities exist

Without them, an addon could do anything the host process can — read every table, call every external API, exfiltrate every secret. Capabilities make the addon's surface explicit and reviewable. An operator looking at a manifest sees exactly what the addon can touch, and the kernel enforces it at every call.

### Enforcement modes

The kernel runs the security enforcer in one of two modes, configurable per host:

- **Shadow.** Capability violations are logged as warnings but the call proceeds. Useful in development to discover missing declarations without breaking flows.
- **Enforce.** Capability violations 403. Used in production.

The mode is part of the host's config; the addon doesn't know which one is active.

### What targets look like

Targets are matched literally for most kinds. For `http:fetch`, they support glob patterns (`https://api.example.com/*`); for `db:read` and `db:write`, the target is always a fully-qualified table name within the addon's namespace.

An addon cannot declare a capability against a table it doesn't own. The installer rejects manifests that try.

## Permissions — the user contract

A permission is something a user can be granted, declared in `manifest.permissions[]`:

```json
"permissions": [
  { "id": "tickets.view",   "label": "View tickets" },
  { "id": "tickets.create", "label": "Create tickets" },
  { "id": "tickets.edit",   "label": "Edit tickets" },
  { "id": "tickets.delete", "label": "Delete tickets" },
  { "id": "tickets.export", "label": "Export tickets" }
]
```

Permission IDs are **opaque to the kernel** — they're addon-defined strings. The kernel just stores grants and checks them.

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
| `GET .../:table` | `:table.view` | manifest |
| `GET .../:table/:id` | `:table.view` | manifest |
| `POST .../:table` | `:table.create` | manifest |
| `PATCH .../:table/:id` | `:table.edit` | manifest |
| `DELETE .../:table/:id` | `:table.delete` | manifest |

For actions, the manifest declares the required permission explicitly:

```json
{ "id": "close-with-reason", "permission": "tickets.edit", ... }
```

### UI gating

The SDK reads the user's effective permissions and gates components automatically:

```tsx
import { useCapabilities } from '@asteby/metacore-runtime-react'

const can = useCapabilities()
if (!can('tickets.create')) return <ReadOnlyView />
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
