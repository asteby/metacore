# RFC 0001 — Shell + apps and immersive addons

- **Status**: Draft
- **Date**: 2026-05-11
- **Author**: dannyjp49

## Context

metacore is positioned as an addon platform: every host application (link,
ops, future hosts) boots the kernel, mounts the bridge, and assembles its
behaviour from federated addons. That much is settled — `metacore-kernel`'s
Law 0 (`/home/user/projects/metacore-kernel/ARCHITECTURE.md`, lines 7-56)
codifies it: the kernel is the substrate, the SDK is reusable infra, and the
addon platform packages (`manifest`, `bundle`, `installer`, `runtime/wasm`,
`bridge`) live in the kernel because they are the product thesis, not because
they are universally needed.

What is _not_ yet codified is how the host frames the addon on screen. Today
ops is an ERP whose CRUD plane is fully resolved by `dynamic/` plus
`runtime-react`: the host owns a sidebar + topbar shell and the addon
contributes a content viewport, navigation entries, model definitions, and
actions. That works for record-oriented workflows (inventory, invoicing,
customer master). It does not work for screens with their own flow:

- POS terminal — touch-first, full screen, no shell.
- KDS (kitchen display) — full screen tablet, no chrome, auto-refresh.
- Customer-facing waiting-room / queue display — TV mode, kiosk-style.

These cases need the same addon machinery (manifest, capabilities, signed
backend code, lifecycle, navigation entry for the operator that launches the
screen) but the rendered surface is the entire viewport, not a slot inside the
host shell. They are still _addons_; they are not separate apps, because
splitting them into apps would duplicate the kernel, the SDK, the auth
session, the marketplace, and the install/uninstall flow.

This RFC documents the decision to support that distinction inside the
existing manifest contract, plus the four federation/runtime decisions that
ride along with it.

Work in progress when this RFC was drafted:

- `metacore-kernel@feat/manifest-layout-immersive` — adds `FrontendSpec.Layout`
  with validation (see `manifest/manifest.go:108-142` and
  `manifest/validate.go:60-65,199-202`).
- `metacore-sdk@feat/immersive-federation-wasm-client` — runtime-react
  branch that will honour `layout` when rendering an addon and exposes the
  client-side WASM helper described in Decision 3.
- `ops` — work has not landed on a tracked branch yet. The first adopter will
  be the kitchen-display addon under `addons-wasm/kitchen-display/` (manifest
  already drafted; backend WASM build is staged under `build/`).

None of the above is merged.

## Goals

- One way to express "this addon owns the entire viewport" inside the
  existing `Manifest`. No new top-level config, no parallel manifest format.
- Federation that does not duplicate React, the SDK, or the host's auth /
  theme / query contexts when an addon is loaded.
- A documented escape hatch for addons that need to run signed logic in the
  browser (offline validation, local cryptographic signing of fiscal
  documents) without spawning a second runtime model.
- A mechanism for the host to drop the cached metadata when an addon is
  installed, updated, or uninstalled, without a full page reload.
- A documented guarantee that addon-driven DB writes and WASM hooks commit or
  roll back together.

## Non-goals

- A second manifest format for "kiosk apps". Immersive is a layout flag, not
  a parallel pipeline.
- Cross-tab routing inside an immersive addon. The addon owns its own router
  once the host hands it the viewport. The host only knows how to mount and
  unmount it.
- Replacing webhook addons. Webhook (`Backend.Runtime = "webhook"`) and WASM
  (`Backend.Runtime = "wasm"`) coexist; this RFC does not retire either.
- A general-purpose plugin system for non-metacore apps. Everything here
  assumes the host loaded `@asteby/metacore-sdk` and wired the bridge.

## Decision 1 — Layout in FrontendSpec

`manifest.FrontendSpec.Layout` is the single source of truth for how the host
frames an addon's UI. It is a closed enum with two values plus a legacy empty
string for backward compatibility (see
`/home/user/projects/metacore-kernel/manifest/manifest.go:124-142` for the
canonical comment and `/home/user/projects/metacore-kernel/manifest/validate.go:60-65,199-202`
for the enforcement).

```json
{
  "frontend": {
    "entry": "/api/metacore/addons/kds/frontend/remoteEntry.js",
    "format": "federation",
    "expose": "./plugin",
    "container": "metacore_kds",
    "layout": "immersive"
  }
}
```

| Value         | Meaning                                                                                                |
|---------------|--------------------------------------------------------------------------------------------------------|
| `""` (unset)  | Treated as `shell` for retro-compat with every manifest published before this field landed.            |
| `"shell"`     | Default: sidebar + topbar around an addon-owned content slot.                                          |
| `"immersive"` | Full-page takeover: the addon owns the viewport. Host renders no chrome and exposes a "back to shell" affordance the addon may use. |

The kernel only stores and validates the value. Interpretation lives in
`runtime-react`: the addon loader (`packages/runtime-react/src/addon-loader.tsx`)
remains unchanged for the loading mechanics, and a host-side route component
inspects `manifest.frontend.layout` to decide whether to wrap the rendered
addon in the standard shell layout or to mount it directly into a full-viewport
container. TODO: confirm — the runtime-react branch
`feat/immersive-federation-wasm-client` is where the route wrapper lands; the
exact component name has not been committed yet.

Manifests without `layout` continue to work; this is the entire migration
story (see "Migration / retro-compat" below).

## Decision 2 — Federation with shared singleton deps

Module Federation is non-negotiable for the addon pipeline (it is already in
the manifest contract: `format: "federation"`, `expose`, `container`). The
open question was how to share React, the SDK, and the host providers.

Decision: every metacore host and every metacore addon goes through the
helper `metacoreFederationShared` in
`@asteby/metacore-starter-config/vite`
(`/home/user/projects/metacore-sdk/packages/starter-config/vite-preset.ts:158-188`).
It produces a federation config that declares the canonical singletons:

```ts
export const METACORE_FEDERATION_SINGLETONS = [
  'react',
  'react-dom',
  '@asteby/metacore-runtime-react',
  '@asteby/metacore-theme',
  '@asteby/metacore-auth',
  '@asteby/metacore-ui',
  '@asteby/metacore-sdk',
] as const
```

with `singleton: true` and `requiredVersion: false`. The host wins on version
arbitration; the addon does not duplicate React (the classic "Invalid hook
call" cause) or the SDK (which would split the AddonAPI types and break the
bridge). Extras like `@tanstack/react-query`, `i18next`, `zustand`, `sonner`
go through the `extras` option of the helper when the addon needs them.

`requiredVersion: false` is a deliberate tradeoff during the v0.x SDK era:
strict semver pinning between hosts and addons would force a coordinated
rebuild of every addon for every minor SDK bump. Once the singleton APIs
stabilise we move to `^X` per package; the helper already accepts per-package
overrides for that future state
(`vite-preset.ts:115-119` `overrides` field).

Companion concern — Vite dev mode: the same preset exports
`metacoreOptimizeDeps`
(`vite-preset.ts:32-56`). Apps consuming the metacore packages via workspace
`file:` linking must include it, otherwise Vite skips pre-bundling and the
browser sees bare specifiers. This is enforced by convention, not by code; the
starter scaffolds it correctly out of the box.

## Decision 3 — Client-side WASM mirroring the backend

A subset of immersive addons (fiscal stamping, offline POS, anything that
must validate or sign locally without a backend round-trip) needs to run the
same logic in the browser that runs in the kernel's WASM runtime.

Decision: ship a thin client-side wrapper in
`@asteby/metacore-runtime-react` that loads a `.wasm` module declared in
`BackendSpec` (or a sibling URL co-located with the frontend bundle), using
the same ABI as the host runtime — see
`/home/user/projects/metacore-kernel/runtime/wasm/abi.go:10-26`. The guest
exports `memory`, `alloc(size) -> ptr` and one function per declared export
with the `(ptr, len) -> (ptr<<32 | len)` calling convention. The browser
wrapper provides a degenerate host module: `log`, `env_get`, no
`http_fetch` (forbidden capability in the browser), no DB.

When this applies:

- Fiscal signing of receipts before submission (signature happens locally,
  the network call is just the submission).
- Form-level validation that must match server-side rules exactly without
  duplicating them in TypeScript.
- POS subtotal / discount logic that has to keep running offline.

When this does **not** apply: anything that needs DB access, signed network
fetches, or capability enforcement. Those keep running in the kernel WASM
runtime via the existing action trigger pipeline (Decision 5).

Integrity: client WASM modules carry an SRI hash declared next to the bundle
hash. The frontend bundle's `FrontendSpec.Integrity` already establishes the
pattern; the WASM file follows the same shape. TODO: confirm — the exact
JSON key for the client WASM SRI is not in the current manifest schema; the
SDK branch `feat/immersive-federation-wasm-client` is the natural place to add
it (proposed `FrontendSpec.ClientWasm = { url, integrity, exports }` rather
than overloading `BackendSpec` which is server-side).

## Decision 4 — Hot-swap of manifest

`packages/runtime-react/src/metadata-cache.ts` (lines 31-103) is a
`zustand` store persisted in `localStorage` under `metacore-metadata-cache`.
It already does version-based invalidation: on `prefetchAll()` it compares
the server-side `version` with the locally-stored `metadataVersion`, and
when they differ it drops the entire cache before reseeding. That mechanism
works on app boot.

What is missing is the runtime signal: when an admin installs or updates an
addon while the operator's tab is already open, today the operator has to
reload the page. Decision: emit a kernel-side event when a manifest mutation
lands and have the runtime-react cache subscribe to it.

The transport stays inside the existing primitives — `kernel/ws` (WebSocket
Hub) is the right channel because it already carries per-org messages and
because the operator's session already holds a WS connection for
notifications. `kernel/push` (Web Push VAPID) is the wrong channel: push is
for background notifications when the tab is closed, not for in-tab cache
invalidation. Polling `/metadata/all` on focus would work as a degraded
fallback but the WS path is what we ship.

Event shape: a single `metacore.manifest.changed` message carrying the new
`metadataVersion`. The runtime-react store reacts by setting
`prefetched=false` and calling `prefetchAll()` again, which falls through to
the existing version-mismatch path and rebuilds the cache.

TODO: confirm — the kernel installer (`installer/installer.go`) does not
currently broadcast on the WS hub. The wiring is one line at the install /
upgrade / uninstall completion sites; it is not in the current
`feat/manifest-layout-immersive` diff (which only touches the manifest
schema). The SDK branch is the right place to add the subscription side; the
kernel-side broadcast is a follow-up commit on the kernel branch or a
dedicated `feat/installer-broadcast-manifest-version` branch.

## Decision 5 — Atomic DB + WASM transaction

Already supported, documented here so the contract is not forgotten and so
the test gating it is explicit.

`dynamic.Service.ExecAction` (`dynamic/action.go:119-199`) implements the
contract: when an action's trigger declares `type: "wasm"` and
`run_in_tx: true`, the dispatcher receives an `ActionRequest.DB = tx` carrying
the open `*gorm.DB` transaction. The action's WASM export runs inside the
same transaction as the row mutation that triggered it; on success the kernel
commits, on `Success: false` (or a Go error) it rolls back via the
`errRollbackOnFailure` sentinel
(`dynamic/action.go:101-104,182-198`).

This unlocks the canonical "stamp an invoice and write the linked log entry
atomically" flow that fiscal addons need, without leaking partially-applied
state when the WASM side fails.

Gating: v1 of the immersive pipeline ships only after an end-to-end test
exercises the rollback path through a real WASM module — a unit test on
`ExecAction` is not sufficient because the failure surface includes the
runtime/wasm host imports for `db_query` / `db_exec`
(`runtime/wasm/dbquery.go`, `runtime/wasm/dbexec.go`) which must honour the
in-transaction `*gorm.DB` rather than opening a sibling connection. TODO:
confirm — verify in `runtime/wasm/dbexec.go` that the host import resolves
the DB handle from the call context rather than the runtime's package-level
DB; if it resolves from the package-level handle, the rollback gate fails
and that is the bug to fix before v1.

## Migration / retro-compat

- Manifests without `layout` keep working: `validate.go` accepts the empty
  string and the runtime-react route wrapper treats empty as `shell`. Every
  manifest published before the field landed is unchanged.
- Manifests without `Backend.Runtime` keep working: the legacy webhook
  behaviour applies, the bridge falls back to `manifest.Hooks` URL
  resolution. See `bridge/actions.go:59-90`.
- Manifests without `Frontend.Container` keep working: the SDK derives
  `metacore_<sanitized_key>` (`sdk/src/federation.ts:108-128`).
- Adding the singleton federation helper to an addon that previously
  hand-rolled its `shared` block is a non-breaking change at runtime; the
  remoteEntry continues to load. Bundle size may change because some packages
  the addon previously bundled will now be imported from the host scope.

## Alternatives considered

### Micro-iframes per immersive addon

Each immersive addon would render inside an iframe sourced from a kernel
endpoint. Hard isolation, easy CSP story. Rejected because:

- Auth session is in the host's React context; passing it through an iframe
  requires postMessage protocols the bridge does not have.
- Latency on every navigation between addon and shell (iframe load), which
  defeats the POS / KDS use case (the operator switches contexts often).
- Splits the action and slot registries across two JS realms — no shared
  AddonAPI, no shared theme, no shared query client.

### Remote ES modules without Module Federation

Load the addon's `index.js` as a remote ES module via dynamic `import()`.
Simpler than federation on the surface. Rejected because:

- No shared scope: every addon bundles its own React and SDK. This is the
  classical "duplicated React" failure mode and breaks every hook-based
  context the host provides.
- No version arbitration story for the singleton list in Decision 2.
- Loses the ergonomic `container.get('./plugin')` entry point which the
  addon loader already depends on
  (`runtime-react/src/addon-loader.tsx:57-68`).

### A separate `kiosk` manifest type

Parallel manifest format for full-screen addons. Rejected because the rest of
the contract (capabilities, navigation, actions, bridge) is identical between
shell and immersive addons — the only difference is the framing decision
made at render time. A new manifest type would duplicate every existing field
and force the bridge, installer, and marketplace to fork their codepaths.

## Open risks

- **Drift between SDK and addon singleton versions.** `requiredVersion:false`
  means an addon built against SDK v0.7 will run on a host with SDK v0.9.
  Public surface stays compatible across minor bumps by Law 1 of the kernel
  architecture, but the SDK is not under the same discipline yet. Mitigation:
  surface the SDK version in the bridge handshake and log a warning when the
  addon was built against a major version older than the host.
- **Cross-bundle debugging.** Source maps live with each remote bundle; a
  React error inside an addon shows a stack rooted in the addon's
  remoteEntry. Mitigation: ensure the federation build emits source maps and
  the host serves them with permissive CORS so dev tools resolve them.
- **CSP for external remoteEntry.** Today the manifest's `Entry` is a
  same-origin path served through the kernel's frontend route
  (`installer/frontend.go`). Allowing third-party origins means the host CSP
  must whitelist them per-installation. Out of scope for v1; cross-origin
  remoteEntry stays gated behind an explicit org config switch.
- **Client-side WASM as a side channel.** A signed WASM module shipped with
  the frontend bundle can read DOM. Its capabilities are not the same as the
  server-side WASM capability set. Mitigation: document the restricted host
  imports (`log`, `env_get` only) and refuse to load a client WASM module
  that declares server-only capabilities like `http:fetch` or `db:*`.

## Plan of rollout

Merge order — each step is independently shippable:

1. **kernel** — `feat/manifest-layout-immersive` lands first. Adds
   `FrontendSpec.Layout` and its validator. Semver: minor bump
   (`v2.1.0` candidate — additive field on the manifest, no contract
   changes). No host needs to upgrade immediately; old SDKs ignore the field.
2. **kernel** — `feat/installer-broadcast-manifest-version` (new branch,
   not in flight). Emits `metacore.manifest.changed` on the WS hub on
   install / upgrade / uninstall. Semver: minor.
3. **sdk** — `feat/immersive-federation-wasm-client`. runtime-react learns
   to honour `layout`, subscribes to the WS event, and exposes the
   client-WASM loader. Semver: minor on `@asteby/metacore-runtime-react`,
   minor on `@asteby/metacore-sdk` if any new public type lands (likely the
   `FrontendSpec.ClientWasm` field in the generated mirror — see TODO in
   Decision 3).
4. **ops** — kitchen-display becomes the first immersive adopter. The
   manifest already declares `actions.kds_tickets[].trigger.type = "wasm"`
   and `run_in_tx: true`
   (`/home/user/projects/ops/addons-wasm/kitchen-display/manifest.json`), so
   it doubles as the rollback E2E gating test for Decision 5. Adding
   `frontend.layout = "immersive"` is the only manifest change needed.
5. POS and waiting-room displays follow once KDS proves the pipeline.

Renovate auto-merges the kernel and SDK bumps into ops via the singularity
preset (`renovate-config` central, see memory note); no manual coordination
needed for the version dance.
