# Manifest

The manifest is a single JSON file that fully describes an addon. It is the **source of truth** for both the runtime (which uses it to provision the schema and mount routes) and the UI (which reads it to render typed components). Everything else in an addon — Go code, React components, assets — is optional.

[[toc]]

## Why one file

Drift is the dominant cost of admin tooling: schemas evolve faster than handlers, handlers faster than UIs, and the three end up describing slightly different products. The manifest collapses that into a single artifact:

- **Versioned in git.** Diffs are reviewable; rollbacks are trivial.
- **Machine-validated.** A formal schema rejects ambiguous addons before they're built.
- **Read by every layer.** The kernel, the SDK, the CLI, and the UI all read the same fields. There's no second contract to maintain.

When an addon misbehaves, the manifest is the only place to look.

## Top-level fields

| Field | Purpose |
|---|---|
| `id` | Stable identifier. Used in routes (`/api/addons/:id/...`) and in storage. Must be unique within a host. |
| `name`, `displayName`, `version` | Human-facing metadata. The version is semver and gates upgrade migrations. |
| `tables[]` | Schema. The installer translates this into DDL. See below. |
| `capabilities[]` | What the addon promises to do. Enforced by the kernel's `security.Enforcer`. |
| `permissions[]` | What users can be granted. Enforced by `permission.Service`. |
| `actions[]` | Custom (non-CRUD) operations. The runtime mounts a route per action; the body is yours. |
| `events[]` | Real-time channels the addon emits / subscribes to. Surfaced through the WebSocket hub. |
| `frontend.slots` | Named UI extension points. The runtime renders them via `<Slot>`. |
| `frontend.navigation` | Where the addon shows up in the host's nav (sidebar, header, etc.). |
| `dependencies[]` | Other addons this one needs. The installer resolves them. |
| `lifecycle` | Hooks for `install`, `upgrade`, `uninstall`. Optional. |

## Tables

A table entry maps to a database table. The kernel's installer reads it, generates the DDL, and runs it inside a migration transaction.

```json
{
  "name": "tickets",
  "displayName": "Tickets",
  "columns": [
    { "name": "id",         "type": "uuid",      "primaryKey": true },
    { "name": "title",      "type": "string",    "required": true, "max": 200 },
    { "name": "status",     "type": "enum",      "values": ["open","closed"], "default": "open" },
    { "name": "assignee",   "type": "string",    "label": "Assigned to" },
    { "name": "created_at", "type": "timestamp", "default": "now()" }
  ],
  "indexes": [
    { "columns": ["status"] },
    { "columns": ["assignee", "created_at"] }
  ]
}
```

Column types include `string`, `text`, `int`, `float`, `double`, `bool`, `uuid`, `timestamp`, `date`, `enum`, `json`, `ref`. Each type has its own validator set; the runtime enforces them on every write.

## Capabilities

Capabilities are the **addon contract with the runtime**. They declare what subsystems the addon will touch. The kernel enforces them at every call: an addon that tries to write a table it doesn't have `db:write` on is rejected, regardless of who the user is.

```json
"capabilities": [
  { "kind": "db:read",    "target": "tickets" },
  { "kind": "db:write",   "target": "tickets" },
  { "kind": "event:emit", "target": "tickets.changed" },
  { "kind": "http:fetch", "target": "https://api.example.com/*", "reason": "fetch external data" }
]
```

Each capability has a `kind`, a `target`, and optionally a `reason` (surfaced to operators during install). The full list of kinds is at [SDK docs / capabilities](https://asteby.github.io/metacore-sdk/manifest-spec#capabilities).

The kernel runs the enforcer in two modes:

- **Shadow** — record violations to logs but allow them. Used in development.
- **Enforce** — block the call. Used in production.

## Permissions vs capabilities

These two things are easy to confuse:

| | Capability | Permission |
|---|---|---|
| **Who has it** | The addon (declared in manifest) | The user (granted at runtime) |
| **What it gates** | What subsystems the addon may touch | What actions a user may take |
| **Enforced where** | Kernel security enforcer | Kernel permission service |
| **Example** | `db:write` on `tickets` | `tickets.delete` for user u_42 |

A call has to clear both. Even if the addon has `db:write`, the user still needs the permission. See [Permissions concept](/concepts/permissions) for the full model.

## Actions

CRUD covers reads and writes; actions cover everything else — bulk operations, integrations, side effects, anything that isn't a row mutation.

```json
{
  "actions": [
    {
      "id": "close-with-reason",
      "label": "Close ticket",
      "target": "tickets",
      "scope": "row",
      "permission": "tickets.edit",
      "input": [
        { "name": "reason", "type": "string", "required": true }
      ]
    },
    {
      "id": "import-csv",
      "label": "Import",
      "target": "tickets",
      "scope": "table",
      "permission": "tickets.create",
      "input": [
        { "name": "file", "type": "file", "accept": "text/csv" }
      ]
    }
  ]
}
```

The kernel mounts `POST /api/addons/:id/_actions/:action.id`. The runtime renders a button (with a dialog if there's input) at the right scope — per-row or per-table. The body of the action is your code: a Go function in the addon, called with parsed inputs and the kernel's services.

## Frontend slots

Slots let an addon contribute custom React components to a host's UI without the host knowing about the addon ahead of time. A typical use is overriding the default detail view:

```json
"frontend": {
  "slots": [
    { "name": "tickets.detail", "component": "./src/TicketDetail.tsx" }
  ]
}
```

The host renders `<Slot name="tickets.detail" />`; if the addon is installed and provides that slot, its component shows up. If not, the slot falls back to its default.

## What's not in the manifest

- **Business logic.** Custom validators, action bodies, integrations — all in Go (or WASM-compiled Go) inside the addon, not in JSON.
- **Custom UI layouts.** Beyond slots, the host's frontend is free to render whatever it wants on top of the SDK hooks.
- **Per-deployment config.** Environment variables, secrets, feature flags — not the addon's concern.

## Full reference

This page is the conceptual overview. The full manifest spec — every field, every type, every validator — is in the SDK docs:

[SDK docs / manifest spec →](https://asteby.github.io/metacore-sdk/manifest-spec)

## Related

- [Dynamic CRUD](/concepts/dynamic-crud) — what the runtime does with `tables[]`.
- [Permissions](/concepts/permissions) — capability + per-user model.
- [Lifecycle](/concepts/lifecycle) — what happens when a manifest changes between versions.
