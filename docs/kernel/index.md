<p align="center">
  <img src="/logo.svg" width="120" alt="Metacore Kernel" />
</p>

<h1 align="center">Metacore Kernel</h1>

<p align="center"><em>The Metacore runtime — secure WASM, dynamic CRUD, and a declarative permission model in a single Go library.</em></p>

The **Metacore Kernel** is the Go library you embed in your app. It owns the database schema, the dynamic CRUD surface, the permission gates, the addon lifecycle, the WebSocket hub, the metrics endpoint, the WASM sandbox, and the manifest installer. You bring a Fiber router and a Postgres handle; the kernel mounts everything else and keeps it consistent across reloads.

## Quick links

- [Embedding Quickstart](./embedding-quickstart) — your first host with the kernel embedded.
- [Dynamic System](./dynamic-system) — how a manifest becomes a working CRUD module.
- [Dynamic API](./dynamic-api) — full HTTP API reference with curl examples.
- [Permissions](./permissions) — capability model, modes, store implementations.
- [Consumer Guide](./consumer-guide) — long-form embedding guide.
- [Dev Setup](./dev-setup) — contributing to the kernel itself.
- [Release](./release) — how kernel versions are cut.

## Subsystems

| Subsystem | Responsibility |
|---|---|
| `runtime/wasm` | wazero-backed WASM sandbox; per-addon module instances with capability-scoped imports. |
| `ws` | WebSocket hub — fan-out by user, org, channel; auto-reconnect contract with the SDK provider. |
| `security` | Compiled `Capabilities` policy; egress SSRF guard; addon-level enforcer. |
| `installer` | Hot-loads `.mcbundle`s — runs migrations, registers metadata, mounts handlers, signs in. |
| `lifecycle` | Install / enable / disable / upgrade / uninstall transitions for addons. |
| `host` | `host.Host` and `host.App` — the public surface every embedding app composes against. |
| `events` | Pub/sub event bus addons emit on; in-process today, pluggable. |
| `eventlog` | Append-only audit log of CRUD ops, permission decisions, and addon lifecycle events. |
| `navigation` | Sidebar / route tree built from manifests; respects capability gates per user. |
| `metadata` | Materialized table/modal/options schemas served to `<DynamicTable>` clients. |
| `manifest` | `manifest.json` parser and validator; canonical types shared with the SDK. |
| `dynamic` | Generic CRUD service + handler — list, get, create, update, delete on any registered model. |
| `permission` | User-level role/capability service + Fiber middleware. |
| `notifications` | Per-user notification queue, fan-out into `ws` and durable storage. |
| `webhooks` | Outbound HMAC-signed webhooks — list, create, deliver, retry, test/replay. |
| `query` | Filter / sort / paginate parser shared by `dynamic` and host handlers. |

## Repository

Source, issues and releases live at [`asteby/metacore-kernel`](https://github.com/asteby/metacore-kernel). The kernel is Apache-2.0.

## Pair with the SDK

The kernel exposes the metadata, permission and CRUD contract the [Metacore SDK](/sdk/) consumes from the React side. The two ship independently — kernel version `vX.Y.Z` and SDK version `vA.B.C` are compatible whenever they agree on the JSON shapes documented in [Dynamic API](./dynamic-api).
