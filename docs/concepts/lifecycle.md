# Lifecycle

An addon goes through three runtime moments: **install**, **upgrade**, **uninstall**. The kernel's installer handles each transactionally — either the whole thing succeeds, or the host is left exactly as it was. This page explains what runs at each step and what hooks an addon can plug into.

[[toc]]

## Install

When a `.mcbundle` arrives (uploaded via API, dropped in `BundleDir`, or registered in code as an embedded addon), the installer runs:

1. **Verify** — bundle signature, manifest schema, version format.
2. **Resolve dependencies** — every entry in `manifest.dependencies[]` must already be installed at a compatible version. If not, the install is rejected.
3. **Conflict check** — table names, capability targets and permission IDs must not collide with installed addons.
4. **Open transaction** — every step below runs inside a single DB transaction.
5. **Apply DDL** — for each `tables[]` entry, generate `CREATE TABLE` + indexes + foreign keys. Type mappings (uuid, timestamp, enum, etc.) are dialect-aware (Postgres / SQLite).
6. **Register metadata** — column schema, capability declarations, permission IDs, action routes.
7. **Run install hook** — if the addon defines `lifecycle.install`, the kernel calls it (in WASM if the addon ships a WASM module, in-process if it's an embedded addon).
8. **Mount routes** — dynamic CRUD, actions, frontend slot endpoints.
9. **Load WASM** — if present, instantiate the module in wazero with its capability set.
10. **Commit** — the addon is now live.

If any step fails, the transaction rolls back. The host is left exactly as it was; no partial install.

### Install hooks

Optional. Used for one-time setup that DDL alone can't express — seeding a default record, registering an external webhook, scheduling a cron entry.

```json
"lifecycle": {
  "install": "./go/install.go"
}
```

The hook receives the kernel's installer context (DB handle, KV, secret store, identity helpers) and returns an error to abort the install.

## Upgrade

When a new version of an installed addon arrives, the installer:

1. **Compare versions** — same `manifest.id`, higher `version`. Older versions are rejected by default (downgrade requires an explicit flag).
2. **Diff manifests** — table-level, column-level, permission-level. The diff is the source of truth for what migrations to run.
3. **Plan migrations** — additions are safe (new columns, new indexes, new permissions); changes and removals require explicit handling. Some are blocked outright (e.g. changing a primary key type) without a manifest-declared migration.
4. **Open transaction.**
5. **Apply DDL diff** — `ADD COLUMN`, `CREATE INDEX`, etc. Dialect-aware.
6. **Run upgrade hook** — if defined, called with the previous version + the new one. Used for data migrations (e.g. backfilling a new column from an old one).
7. **Update metadata** — new column schema, new permission IDs, new action routes.
8. **Reload WASM** — the old module is torn down, the new one instantiated.
9. **Commit.**

Same atomicity guarantee: failure rolls back the entire upgrade.

### Upgrade hooks

```json
"lifecycle": {
  "upgrade": [
    { "from": "0.1.0", "to": "0.2.0", "hook": "./go/upgrade_0_1_to_0_2.go" }
  ]
}
```

Multiple hooks can be chained; the installer applies them in order, skipping ones that don't match the current version. Each runs in its own savepoint.

### What's blocked without an explicit migration

- Changing a column's type (other than widening, e.g. `int → bigint`)
- Removing a `primaryKey: true` column
- Removing a column referenced by another addon's `ref` columns
- Removing a permission that's currently granted to users (data exists)

These are surfaced as install errors with clear messages; the addon author has to declare a migration that handles them.

## Uninstall

Reverses install:

1. **Check dependencies** — no other installed addon may depend on this one. If any does, uninstall is rejected unless `--cascade` is set.
2. **Open transaction.**
3. **Run uninstall hook** — if defined. Used to clean up external resources (deregister webhooks, cancel cron entries).
4. **Tear down WASM** — module evicted, sandbox closed.
5. **Unmount routes** — dynamic CRUD, actions, slots.
6. **Drop schema** — `DROP TABLE` for each `tables[]` entry. By default the kernel **does not** drop tables; it renames them with a `_tombstone` suffix and a timestamp, so an operator can restore data if the uninstall was a mistake. A `--purge` flag drops them outright.
7. **Remove metadata** — capabilities, permissions, action declarations.
8. **Commit.**

### Uninstall hooks

```json
"lifecycle": {
  "uninstall": "./go/uninstall.go"
}
```

The hook runs **before** any schema teardown, so it has full access to the data.

## What hosts see

The host's installer API exposes each step's outcome — the migration log, hook output, dependency tree at install time, the diff plan at upgrade time. A host admin UI typically renders this as a timeline using `GET /api/installs/:id`.

## Versioning

Versions are semver. The kernel doesn't enforce semver semantics (i.e. it doesn't check that a major version bump is "really" breaking) — the addon author owns that. What it does enforce:

- Versions strictly monotonic per addon ID
- Migrations declared between consecutive versions
- Bundle signatures matching the version they claim

## Related

- [Manifest](/concepts/manifest) — where lifecycle hooks are declared.
- [Permissions](/concepts/permissions) — what changes when permissions are added/removed during an upgrade.
- [Kernel docs / installer ↗](https://asteby.github.io/metacore-kernel/) — full installer internals.
