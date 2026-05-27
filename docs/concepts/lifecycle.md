# Lifecycle

An addon goes through three runtime moments: **install**, **upgrade**, **uninstall**. The kernel's installer handles each transactionally — either the whole thing succeeds, or the host is left exactly as it was. This page explains what runs at each step and what hooks an addon can plug into.

[[toc]]

## Install

When a `.mcbundle` arrives (uploaded via API, dropped in `BundleDir`, or registered in code as an embedded addon), the installer runs:

1. **Verify** — bundle signature (ed25519), manifest validation (strict v3, or v2 up-converted), version format.
2. **Resolve dependencies** — every `compatibility.requires[]` entry must be satisfied: `key: "kernel"` against the host version, and any other `key` against an installed addon at a compatible semver range. `optional: true` entries don't fail the install if absent.
3. **Conflict check** — table names, capability targets and permission keys must not collide with installed addons.
4. **Open transaction** — every step below runs inside a single DB transaction.
5. **Apply DDL** — for each `models[]` entry, generate `CREATE TABLE` + indexes + foreign keys into the addon's Postgres schema (`addon_<key>`). `dynamic.EnsureSchema → Apply` is idempotent.
6. **Register metadata** — column schema, capability declarations, RBAC permissions/roles, action routes.
7. **Run install hook** — if the manifest declares `lifecycle.install` (a function name like `"Install"`), the kernel dispatches it (in WASM if the addon ships a module, in-process if embedded). A non-nil error aborts.
8. **Project CRUD hooks** — `contributions.subscriptions[]` are registered into the hook registry.
9. **Mount routes** — dynamic CRUD, actions, frontend slot endpoints.
10. **Commit** — the addon is now live, and the kernel broadcasts a `ManifestChangeEvent` so SDK frontends drop their metadata cache without polling.

If any step fails, the transaction rolls back. The host is left exactly as it was; no partial install.

### Install hooks

Optional. Used for one-time setup that DDL alone can't express — seeding a default record, registering an external webhook, scheduling a cron entry.

```json
"lifecycle": {
  "install":   "Install",
  "uninstall": "Uninstall",
  "enable":    "Enable",
  "disable":   "Disable"
}
```

Each value is an **exported function name** the addon's WASM backend (or embedded Go) provides — not a file path. The hook receives the installer context and returns an error to abort the install.

## Upgrade

`Installer.Upgrade(ctx, orgID, newBundle)` drives the transition (the `upgrade` lifecycle event is fired by the installer, not by `Install`):

1. **Verify** the new bundle's signature and re-validate the manifest. Guard errors (`ErrNotInstalled`, `ErrSameVersionUpgrade`, `ErrCannotDowngrade`) surface **before any mutation**.
2. **Compare versions** — same `metadata.key`, higher `version`. Downgrades are rejected.
3. **Dispatch `upgrade` (phase `before`)** — payload carries `from_version` / `to_version`. A non-nil error aborts: the row is untouched, no schema work runs.
4. **Apply schema** — `EnsureSchema → Apply → CreateTable / SyncSchema` on the new manifest. Additive: old columns survive; already-recorded migrations are skipped.
5. **Re-project CRUD hooks** — the old subscriptions are unregistered and the new shape registered.
6. **Persist the version bump** with a settings merge — user-tuned values win; new manifest defaults are added.
7. **Dispatch `upgrade` (phase `after`)** — with a `migrations_applied` counter. `after` errors are logged and swallowed (the upgrade has committed; DDL rollback is unsafe).
8. **Broadcast `ManifestChangeEvent`** so SDK frontends drop their metadata cache.

### Upgrade ladder

The manifest declares a semver-matched migration ladder. Each step matches the *recorded* version against `from`:

```json
"lifecycle": {
  "upgrade": [
    { "from": ">=1.0.0 <1.3.0", "type": "wasm", "function": "MigrateTo_1_3" },
    { "from": ">=1.3.0 <2.0.0", "type": "sql",  "function": "migrations/1_3_to_2_0.sql" }
  ]
}
```

`type: "wasm"` calls a function exported by the addon's backend; `type: "sql"` runs a goose-compatible SQL file from the bundle. (A `kind: "Preset"` may not declare `lifecycle.upgrade[]`.)

### What's blocked without an explicit migration

- Changing a column's type (other than widening, e.g. `integer → bigint`)
- Removing a `primary_key: true` column
- Removing a column referenced by another model's foreign keys
- Removing a permission that's currently granted to users (data exists)

These are surfaced as install errors with clear messages; the addon author has to declare a migration that handles them.

## Uninstall

Reverses install:

1. **Check dependencies** — no other installed addon may depend on this one. If any does, uninstall is rejected unless `--cascade` is set.
2. **Open transaction.**
3. **Run uninstall hook** — if defined. Used to clean up external resources (deregister webhooks, cancel cron entries).
4. **Tear down WASM** — module evicted, sandbox closed.
5. **Unmount routes** — dynamic CRUD, actions, slots.
6. **Drop schema** — `DROP TABLE` for each `models[]` entry. By default the kernel **does not** drop tables; it renames them with a `_tombstone` suffix and a timestamp, so an operator can restore data if the uninstall was a mistake. A `--purge` flag drops them outright.
7. **Remove metadata** — capabilities, permissions, action declarations.
8. **Commit.**

### Uninstall hooks

```json
"lifecycle": { "uninstall": "Uninstall" }
```

The hook (an exported function name) runs **before** any schema teardown, so it has full access to the data.

## What hosts see

The host's installer API exposes each step's outcome — the migration log, hook output, dependency tree at install time. Installs live under `/api/metacore/installations`; the upgrade endpoint is `PUT /api/metacore/installations/:key/version` (multipart bundle upload). A host admin UI typically renders the history as a timeline.

## Versioning

Versions are semver. The kernel doesn't enforce semver semantics (i.e. it doesn't check that a major version bump is "really" breaking) — the addon author owns that. What it does enforce:

- Versions strictly monotonic per addon `metadata.key`
- Migrations declared between consecutive versions
- Bundle signatures matching the version they claim

## A note on Presets

Installing a `kind: "Preset"` is a single transition that resolves and installs its `preset.addons[]` in dependency order, then applies the preset's `defaults` (settings) on top. A preset is the unit of distribution for a vertical — install one, get a coherent set of foundation addons wired together.

## Related

- [Manifest](/concepts/manifest) — where lifecycle hooks are declared.
- [Permissions](/concepts/permissions) — what changes when permissions are added/removed during an upgrade.
- [Kernel docs / installer ↗](https://asteby.github.io/metacore-kernel/) — full installer internals.
