# Manifest

The manifest is a single JSON file that fully describes a unit of extensibility — an addon, a vertical preset, a theme or a connector pack. It is the **source of truth** for both the runtime (which uses it to provision the schema and mount routes) and the UI (which reads it to render typed components). Everything else — Go code, React components, assets — is optional.

The current format is **Module Contract v3** (`apiVersion: asteby.com/v3`). The principle behind it: *the manifest is the contract, code is an implementation detail.* If a capability, event, schema or UI slot isn't declared in the manifest, it doesn't exist — the kernel never introspects the addon binary to discover behaviour.

[[toc]]

## Why one file

Drift is the dominant cost of admin tooling: schemas evolve faster than handlers, handlers faster than UIs, and the three end up describing slightly different products. The manifest collapses that into a single artifact:

- **Versioned in git.** Diffs are reviewable; rollbacks are trivial.
- **Machine-validated.** A formal JSON Schema (`manifest-v3.schema.json`, Draft 2020-12) rejects ambiguous addons before they're built. The kernel's `v3.Validate` is strict — fields outside the contract are rejected.
- **Read by every layer.** The kernel, the SDK, the CLI, and the UI all read the same fields. There's no second contract to maintain.

When an addon misbehaves, the manifest is the only place to look.

## Kinds

`metadata.kind` selects the top-level shape the kernel installs:

| kind | What it is |
|---|---|
| `Addon` | A foundation module that contributes models, events, slots, RBAC and code. |
| `Preset` | A curated bundle of addons with default settings — a *vertical* installed as a single unit. Declares `preset.addons[]`; may not declare its own `models[]`. |
| `Theme` | A pure visual contribution (tokens, fonts, icon overrides). No code, no models. |
| `ConnectorPack` | A set of credentials + capability templates for third-party APIs (Stripe, Mercado Pago, …). |

The schema enforces the mutual exclusions (a `Preset` can't declare models, etc.); the kernel rejects mismatched bundles at install time.

## Top-level layout

```jsonc
{
  "apiVersion": "asteby.com/v3",
  "kind":       "Addon",

  "metadata":        { "key": "...", "version": "...", "i18n": {...}, "countries": [...] },
  "compatibility":   { "requires": [ { "key": "kernel", "version": ">=3.0.0 <4.0.0" } ] },
  "tenancy":         { "isolation": "shared", "rls_column": "organization_id" },
  "capabilities":    [ { "kind": "db:write", "target": "addon_inventory.*" } ],
  "models":          [ { "key": "Product", "table": "products", "columns": [...] } ],
  "contributions":   { "navigation": [...], "slots": [...], "actions": [...], "subscriptions": [...] },
  "extension_points":{ "events": [...], "slot_kinds": [...], "model_extensions_accepted": [...] },
  "lifecycle":       { "install": "Install", "upgrade": [...], "uninstall": "Uninstall" },
  "i18n":            { "default_locale": "es-MX", "bundles": [...] },
  "rbac":            { "roles": [...], "permissions": [...] },
  "settings":        [ { "key": "...", "type": "number", "description": "..." } ],
  "billing":         { "metered_events": [...] },
  "signature":       { "algorithm": "ed25519", "key_id": "...", "value": "...", "signed_at": "..." }
}
```

## Metadata

`metadata` carries the identity and catalog-facing fields:

- `key` — stable, globally-unique identifier (`^[a-z][a-z0-9_]{1,63}$`). Defines the Postgres schema `addon_<key>` and the route namespace.
- `name`, `version` (semver), `description`, `category`, `author`, `website`, `license`, `icon`, `screenshots`, `features`.
- `i18n` — per-locale overrides of the catalog strings (name/description), so the marketplace renders the addon in `es` or `en`.
- `countries` — optional ISO country codes that scope the addon to specific regions in the catalog.

## Models

A model maps to a database table. The installer reads it, generates the DDL, and runs it inside a migration transaction. Identifiers use **underscore** (SQL) casing.

```json
{
  "key": "Ticket",
  "table": "tickets",
  "label": "tickets.model.ticket",
  "columns": [
    { "name": "id",         "type": "uuid",        "primary_key": true, "default": "gen_random_uuid()" },
    { "name": "organization_id", "type": "uuid",   "not_null": true },
    { "name": "title",      "type": "text",        "not_null": true, "comment": "Short summary" },
    { "name": "status",     "type": "text",        "default": "'open'" },
    { "name": "created_at", "type": "timestamptz", "not_null": true, "default": "now()" }
  ],
  "indices": [ { "name": "tickets_org_status_idx", "columns": ["organization_id", "status"] } ],
  "foreign_keys": [
    { "columns": ["assignee_id"], "references": { "model": "core.User", "columns": ["id"] }, "policy": "physical" }
  ]
}
```

Column types map to Postgres (`uuid`, `text`, `numeric`, `boolean`, `timestamptz`, `jsonb`, …). Each column accepts `not_null`, `unique`, `default` (validated against a literal whitelist), and `comment`. Foreign keys carry a `policy` — `physical` (a real FK constraint) or `logical` (validated by the runtime, no DB constraint).

## Capabilities

Capabilities are the **addon contract with the runtime**. They declare what subsystems the addon will touch. The kernel enforces them at every call: an addon that tries to write a table it doesn't have `db:write` on is rejected, regardless of who the user is.

```json
"capabilities": [
  { "kind": "db:read",    "target": "addon_tickets.*" },
  { "kind": "db:write",   "target": "addon_tickets.*" },
  { "kind": "event:emit", "target": "tickets.changed" },
  { "kind": "http:fetch", "target": "https://api.example.com/*", "reason": "fetch external data" }
]
```

The closed set of kinds is: `db:read`, `db:write`, `http:fetch`, `event:emit`, `event:subscribe`, `fs:read`, `secrets:read`, `cron:register`, `queue:produce`, `queue:consume`, `file-storage:write`, `time:wallclock`. The addon's own schema (`addon_<key>.*`) is always accessible — never declare it. Cross-schema reads/writes need an explicit grant (`db:read public.users`, etc.).

Each capability has a `kind`, a `target`, and optionally a `reason` (surfaced to operators during install). The full list of kinds and target syntax is in the [kernel WASM ABI](https://asteby.github.io/metacore-kernel/wasm-abi). The kernel runs the enforcer in **shadow** (record violations, allow) or **enforce** (block the call) mode.

## RBAC: permissions and roles

Where capabilities gate the *addon*, RBAC gates the *user*. v3 declares both first-class roles and the permissions they bundle:

```json
"rbac": {
  "permissions": [
    { "key": "tickets.read",  "label": "Read tickets" },
    { "key": "tickets.write", "label": "Create / update / delete tickets" }
  ],
  "roles": [
    { "key": "tickets_agent", "label": "tickets.role.agent",
      "permissions": ["tickets.read", "tickets.write"] }
  ]
}
```

A call has to clear both axes. Even if the addon has `db:write`, the user still needs the permission. See [Permissions](/concepts/permissions) for the full model.

## Contributions

`contributions` is the consumer side of inter-addon coupling — everything the addon adds to the host's surface.

### Actions

CRUD covers reads and writes; actions cover everything else — bulk operations, integrations, side effects.

```json
"contributions": {
  "actions": [
    {
      "key": "close_with_reason",
      "label": "tickets.action.close",
      "target_model": "Ticket",
      "confirm": true,
      "fields": [
        { "name": "reason", "type": "text", "required": true }
      ],
      "handler": { "type": "wasm", "function": "CloseWithReason" }
    }
  ]
}
```

An action can drive its UI three ways: a **`confirm`** prompt, a generic **modal** auto-built from declarative **`fields`**, or a custom frontend **`modal`** slug. Fields support the usual input types plus repeatable **line-item groups** (a declarative repeatable group — e.g. invoice lines). The kernel mounts `POST /api/dynamic/:model/:id/actions/:key`; the runtime renders the button at the right scope and the body of the action is your code.

### Navigation, slots and subscriptions

- `navigation[]` — where the addon shows up in the host's nav. A nav item with a `model` is wired to dynamic CRUD with no frontend code.
- `slots[]` — the addon contributes a React component to a **published `slot_kind`** owned by another addon (or the host). The host renders it via `<Slot name="..." />`; coupling is by typed slot kind, never by import path.
- `subscriptions[]` — the addon reacts to a published event with a `handler` (`wasm` / `webhook`), optionally filtered. This replaces v2's free-form CRUD-hook maps.

## Extension points

`extension_points` is the publisher side: what *this* addon offers for others to extend.

- `events[]` — named events other addons may subscribe to, each with a `payload_schema`.
- `slot_kinds[]` — typed UI surfaces this addon owns, each with a `props_schema`.
- `model_extensions_accepted[]` — the models that opt into letting other addons attach columns.

The kernel rejects subscriptions to undeclared events, contributions to undeclared slot kinds, and extensions of models that didn't opt in.

## Tenancy

```json
"tenancy": { "isolation": "shared", "rls_column": "organization_id" }
```

`shared` (the default, correct for ~95% of addons) keeps every tenant in one schema with a `rls_column` and a Postgres RLS policy filtering by the current org. `schema` creates a schema per installation; `database` is reserved.

## Settings, billing, signature

- `settings[]` — per-installation configurable values. v3 adds `description` and a `number` type alongside `string`, `select`, `boolean`, etc. `secret: true` keeps the value server-side.
- `billing.metered_events[]` — manifest-declared metering with a `revenue_share`. (v2's free-form `price` is gone; pricing lives here and in the marketplace.)
- `signature` — ed25519 signature with `key_id` and `signed_at`, verified before the bundle is unpacked. Unsigned manifests install only in dev mode (`KERNEL_ALLOW_UNSIGNED=1`).

## v2 compatibility

**Write v3.** It's the canonical contract — `apiVersion: asteby.com/v3` is the shape this page describes and the surface every new feature lands on (presets, action modals, line-items, RBAC roles, `metadata.i18n`/`countries`).

For compatibility, the **kernel dual-reads v2**: since v0.13 the installer also accepts legacy v2 manifests (no `apiVersion`, flat `key`/`model_definitions`/`kernel` range) and transparently up-converts them into the v3 in-memory shape, so older addons keep installing and running while the ecosystem moves over. The SDK tooling (CLI, scaffolder, examples) is **migrating to emit v3**; until that lands you may still see v2 output in some flows. Kernel **4.x** removes v2 entirely. The field-by-field mapping is in the kernel's [v2→v3 migration guide](https://asteby.github.io/metacore-kernel/).

## What's not in the manifest

- **Business logic.** Custom validators, action bodies, integrations — all in Go (or WASM-compiled Go), not in JSON.
- **Federation wiring.** The `frontend`/`backend` runtime selection lives in the *bundle* manifest the loader reads, not in the inter-addon contract.
- **Per-deployment config.** Environment variables, secrets, feature flags — not the addon's concern.

## Related

- [Dynamic CRUD](/concepts/dynamic-crud) — what the runtime does with `models[]`.
- [Permissions](/concepts/permissions) — capability + RBAC model.
- [Lifecycle](/concepts/lifecycle) — what happens when a manifest changes between versions.
