# Architecture

Metacore is four layers stacked on top of each other. Each layer has one job and a clean contract with the layer above. Most teams will only care about two of them at a time — the host they're embedding into, and the addon they're building. The rest is what makes it work end-to-end.

[[toc]]

## The four layers

```
┌──────────────────────────────────────────────────────────┐
│  Hosts (link, ops, your-app)                the surface  │
│   └─ React + Vite + @asteby/metacore-runtime-react       │
├──────────────────────────────────────────────────────────┤
│  Host backends (Go)                          the embed   │
│   └─ host.App + host.Host                                │
├──────────────────────────────────────────────────────────┤
│  metacore-kernel                             the runtime │
│   └─ dynamic CRUD · permissions · ws · wasm · lifecycle  │
├──────────────────────────────────────────────────────────┤
│  metacore-sdk + addons                       the contract│
│   └─ manifest.json · runtime-react · CLI · 16 packages   │
└──────────────────────────────────────────────────────────┘
```

### 1. The contract — `metacore-sdk` + addons

The bottom layer is **what an addon is**. The SDK defines:

- The **manifest schema** — the shape of `manifest.json`, the addon's source of truth.
- The **bundle format** — `.mcbundle`, a signed tarball with the manifest, optional WASM module, assets, and frontend code.
- The **frontend runtime** — `@asteby/metacore-runtime-react` plus 15 sibling packages (forms, tables, dialogs, navigation, charts, etc.) that read the same metadata the kernel exposes and render typed UI without bespoke code.
- The **CLI** — `metacore-sdk` scaffolds, builds, signs and publishes addons.

An addon is just a directory with a manifest, optional Go code (compiled to WASM), and optional React code that gets registered as a slot. It's the only layer most app builders ever touch.

### 2. The runtime — `metacore-kernel`

The kernel is a Go library you embed in any HTTP server (Gin, Chi, Echo, stdlib). It owns:

- **Dynamic CRUD.** A generic store reads the manifest's `tables[]` and serves list / get / create / update / delete over REST. Pagination, sort and filter come for free.
- **Permissions.** Two layers: capability checks (does the addon have `db:write` on this table?) and per-user resource permissions (does this user have `tickets.create`?). Both enforced at every call.
- **Lifecycle.** Install, upgrade, uninstall — schema migrations, hook execution, metadata registration. Hot, no restart.
- **WASM sandbox.** Addons that run code do it inside [wazero](https://wazero.io/). The kernel exposes a small, audited ABI; the addon can't see the host's memory or filesystem.
- **WebSockets.** A real-time hub is mounted automatically. Addons emit events; clients subscribe by tenant + channel.

The kernel exposes its own surface as a Go API and as HTTP routes. Hosts choose how much to mount.

### 3. The embed — host backends

A **host backend** is a Go binary that imports the kernel and adds whatever is specific to that product: auth, billing, integrations, custom domain endpoints. The SDK provides `host.App` and `host.Host` helpers that handle the boilerplate (config, DI, routing, graceful shutdown).

The kernel doesn't care what HTTP router you use — `host.App` lets you mount it under any path, alongside your existing routes. A typical `main.go` is under 60 lines.

### 4. The surface — host frontends

A **host frontend** is a Vite + React app that uses `@asteby/metacore-runtime-react` to render addon UIs. The runtime fetches metadata from the kernel, mounts the right components, and exposes hooks for everything else: queries, mutations, real-time, navigation, slot composition.

The two production hosts today are:

- **link** — the operator panel; how internal teams use installed addons.
- **ops** — the marketplace and admin; how addons are discovered, installed, and managed.

Both consume the same SDK; neither has any custom logic for any individual addon.

## Data flow: declare → CRUD UI

A user opens the Tickets page in **link**. Here's what happens:

```
manifest.json                      ┌──────────────────┐
  tables: tickets                  │  installer       │
  capabilities: db:rw              │  applies DDL,    │
        │                          │  registers meta  │
        ▼                          └────────┬─────────┘
  installed bundle ────────────────────────▶│
                                            ▼
   ┌────────────────────────────────────────────────┐
   │  kernel                                        │
   │  GET  /addons/tickets/_meta/columns      ──────┼──▶ schema
   │  GET  /addons/tickets/tickets?page=1&...  ─────┼──▶ rows
   │  enforces: capability + user permission         │
   └────────┬───────────────────────────────────────┘
            │
            ▼
   ┌──────────────────────┐
   │  link frontend       │
   │  <DynamicTable>      │
   │   reads meta + rows  │
   │   renders columns,   │
   │   pagination, sort   │
   └──────────────────────┘
```

A few things are worth pointing out:

1. **There is no per-table code.** No `TicketsController`, no `TicketsListPage`. The runtime composes both from metadata.
2. **Every call is permissioned.** The kernel checks both the addon's capability (declared in the manifest) and the user's resource permission (granted at runtime). A misconfigured addon can't escape its own contract.
3. **Real-time is implicit.** The same store that handles writes pushes change events through the WebSocket hub; the SDK's table component subscribes by default.

## A custom action

CRUD covers the 80%. The remaining 20% — domain operations, integrations, side effects — comes through `manifest.actions[]`:

```json
{
  "actions": [
    {
      "id": "close-with-reason",
      "label": "Close ticket",
      "target": "tickets",
      "scope": "row",
      "input": [
        { "name": "reason", "type": "string", "required": true }
      ]
    }
  ]
}
```

The kernel mounts `POST /addons/tickets/_actions/close-with-reason`. The runtime renders a button on every row of the `<DynamicTable>` and a dialog for the inputs. The body of the action is yours — Go code inside the addon (compiled to WASM, or registered directly if it's an embedded addon).

The pattern repeats: declare the shape, plug in the behavior, the rest is automatic.

## Cross-repo release pipeline

```
asteby/metacore-sdk                    asteby/metacore-kernel
  ├─ changesets PR                       ├─ feature PR
  ├─ Version Packages PR                 ├─ tag vX.Y.Z
  ├─ npm publish (16 packages)           ├─ GoReleaser → GitHub Release
  └─ TypeDoc → Pages                     └─ pkg.go.dev refresh
                                                │
   ┌────────────────────────────────────────────┴────────┐
   ▼                                                     ▼
 hosts (link, ops, third-parties)                 host backends
 install via pnpm,                                go get -u,
 pickup new SDK in Vite                           rebuild binary
```

Both repos cut releases independently. The SDK is the noisy one (frontend churn); the kernel is the conservative one (runtime contract). Versions are coordinated when an SDK release requires a kernel feature, but they don't have to ship together.

## Where to go next

- [Manifest](/concepts/manifest) — the contract in depth.
- [Dynamic CRUD](/concepts/dynamic-crud) — the request/response loop.
- [Permissions](/concepts/permissions) — capability + per-user model.
- [Lifecycle](/concepts/lifecycle) — install, upgrade, uninstall.
- [Kernel docs ↗](https://asteby.github.io/metacore-kernel/) — internal subsystems and APIs.
- [SDK docs ↗](https://asteby.github.io/metacore-sdk/) — every package and every component.
