<p align="center">
  <img src="/logo.svg" width="120" alt="Metacore" />
</p>

<h1 align="center">Federation</h1>

<p align="center">
  <strong>How metacore addons declare Module Federation so the host's React, SDK and providers stay as single instances at runtime.</strong>
</p>

> **TL;DR.** Use [`metacoreFederationShared()`](#metacorefederationshared-the-canonical-helper)
> from `@asteby/metacore-starter-config/vite`. It is the only API the SDK
> documents and the only one guaranteed to typecheck across upgrades of the
> underlying federation plugin — **`@module-federation/vite`**, the current
> build (older revisions of this doc referenced `@originjs/vite-plugin-federation`;
> the ecosystem migrated off it).

## Why federation needs canonicalisation

A metacore addon ships only its own code. React, react-query, i18next, the
SDK, the auth store, the theme provider, the UI primitives and the addon
registry all come from the host shell at runtime, through Module
Federation's shared scope. Without every one of these obligatory singletons
declared on **both** ends, the addon ends up with a duplicate React
(canonical `Invalid hook call`), a duplicate `QueryClient` (`No QueryClient
set` from inside `app-providers`), broken contexts (`useAuth()`,
`useTheme()`, `useApi()` all return `undefined`), or a private `Registry`
the shell never reads — see the
[shared-deps audit](./audits/2026-05-04-mf-shared-deps.md) for the long form.

The list of singletons is a moving target — it has grown release over
release as `app-providers`, `react-query` and the i18n stack were folded
into the shared scope. Hard-coding the list in every addon's
`vite.config.ts` makes it impossible for the SDK to evolve without breaking
every addon — which is what
[`metacoreFederationShared()`](#metacorefederationshared-the-canonical-helper)
exists to fix.

## `metacoreFederationShared()` — the canonical helper

Exported from `@asteby/metacore-starter-config/vite`. It returns a config
object ready to pass straight to `@module-federation/vite`, with
**every singleton the SDK requires** pre-declared.

### Addon (federated remote)

```ts
// addon vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import { federation } from '@module-federation/vite'
import {
  metacoreFederationShared,
  metacoreOptimizeDeps,
} from '@asteby/metacore-starter-config/vite'

export default defineConfig({
  plugins: [
    react(),
    federation(
      metacoreFederationShared({
        host: 'metacore_tickets',                       // == containerName(manifest)
        exposes: { './plugin': './src/plugin.tsx' },
      }),
    ),
  ],
  optimizeDeps: metacoreOptimizeDeps,
  build: { target: 'esnext', modulePreload: false, cssCodeSplit: false },
})
```

### Addon that imports only part of the list: `only`

By default the helper declares the whole singleton list. A remote that
declares a shared package it never imports breaks `loadShare` at runtime
(`Cannot read properties of undefined (reading 'M_ID')`), so an addon that
only uses React plus the host UI passes `only`: the result contains exactly
those canonical singletons (same `singleton` / host-only router
`import: false` config), nothing else.

```ts
metacoreFederationShared({
  host: 'metacore_warehouse',
  exposes: { './register': './src/register.tsx' },
  only: ['react', 'react-dom', 'react/jsx-runtime', '@asteby/metacore-runtime-react'],
  hostProvided: ['@asteby/metacore-ui'], // singleton + import:false (added on top of `only`)
  extras: ['sonner'],                    // non-canonical package
  overrides: { react: { requiredVersion: false } },
})
```

- `only` is preferred over an `omit` list on purpose: it is explicit and a
  singleton added to the canonical list later is not pulled into addons that
  do not use it. There is no `omit`.
- Names must belong to `METACORE_FEDERATION_SINGLETONS`; anything else throws
  (non-canonical packages go in `extras` / `extra`).
- Precedence: `only` picks the canonical base, then manifest/`pageShares`,
  `extras`, `extra`, `hostProvided` and `overrides` apply on top (so
  `hostProvided` naming a singleton outside `only` adds it). A mandatory
  singleton that is declared must still be `singleton: true`.
- In `overrides`, a property set to `undefined` removes it, e.g.
  `{ '@tanstack/react-router': { import: undefined } }` drops the canonical
  `import: false` to match an older hand-written entry.
- The hand-rolled `shared` guard accepts configs built with `only`.

### Host (shell consuming addons)

```ts
// host vite.config.ts
import { defineConfig } from 'vite'
import { federation } from '@module-federation/vite'
import { metacoreFederationShared } from '@asteby/metacore-starter-config/vite'

export default defineConfig({
  plugins: [
    federation(
      metacoreFederationShared({
        host: 'metacore_ops',
        apps: {
          metacore_tickets: 'https://addons.example.com/tickets/remoteEntry.js',
          metacore_orders:  'https://addons.example.com/orders/remoteEntry.js',
        },
      }),
    ),
  ],
})
```

Hosts pass `apps` (remote map) instead of `exposes`; addons do the opposite.
Both ends share the same singleton list and the same plugin call.

The full option reference (including `extras`, `overrides` and `filename`)
lives in [`packages/starter-config/README.md`](../packages/starter-config/README.md#module-federation-singletons-metacorefederationshared).

## ⚠️ Do not hand-roll a `shared:` block against the plugin's raw type

The federation plugin's own TypeScript type for a `shared` entry has drifted
across versions in ways that don't always match what the runtime actually
honours. Hand-authoring a `shared:` block against that raw type is what
broke addons in the past (a `singleton` field the plugin's exported type no
longer declared, even though the runtime still read it at build time).

The fix is either of:

1. **Use `metacoreFederationShared()`** (recommended). It returns a value
   typed against `MetacoreFederationShareConfig`
   (`packages/starter-config/vite-preset.ts`) — the SDK's own stable type,
   insulated from upstream plugin type drift.
2. **Declare a local share config type** that mirrors
   `MetacoreFederationShareConfig` (`singleton?`, `requiredVersion?`,
   `shareScope?`, `packagePath?`, `generate?`) if you have a structural
   reason not to use the helper. This is what the helper does internally.

## Addon `vite.config.ts` checklist (no hand-rolled `shared`, no pwa stub)

```ts
import { federation } from '@module-federation/vite'
import {
  metacoreFederationShared,
  metacoreFederationPlugin,
} from '@asteby/metacore-starter-config/vite'

plugins: [
  federation(
    metacoreFederationShared({
      host: 'metacore_<key>',
      exposes,
      manifest,
      // host always provides these: singleton + import:false (no fallback copy)
      hostProvided: ['@asteby/metacore-ui', '@asteby/metacore-runtime-react'],
      // relax a version skew with the host
      overrides: { '@asteby/metacore-runtime-react': { requiredVersion: false } },
      // singleton extras the addon really imports
      extras: ['sonner'],
    })
  ),
  metacoreFederationPlugin(),
]
```

`metacoreFederationPlugin()` (a) fails the build if the config declares a
`shared` map by hand (`singleton: true` literals / `federation(` without
`metacoreFederationShared`; `handRolledShared: 'warn' | 'off'` to relax) and
(b) aliases `virtual:pwa-register/react` to the stub shipped by the preset, so
`src/_pwa-register-stub.ts` and its alias can be deleted.

Migrating the existing hand-written maps: every per-addon difference maps to an
option — `import: false` -> `hostProvided`; `requiredVersion: false` ->
`overrides`; `sonner` -> `extras`; `react-i18next`/`i18next`/react-query/sdk/
app-providers/theme/auth are already canonical singletons (ui/runtime-react
are NOT `import:false` by default, hence `hostProvided`); `lucide-react` is
intentionally not shared; nothing uses `eager`. `@tanstack/react-router` is
already a remote `import: false` singleton.

## Tailwind `@source` for SDK packages

Tailwind v4 ignores `node_modules`. Import every SDK package that emits classes
with one line (generated list, `scripts/gen-tailwind-sources.mjs`, 26 packages):

```css
@import '@asteby/metacore-theme/sources.css';
```

Under pnpm that file's relative paths may not reach the app's links; use
`pnpm exec metacore-tailwind-sources write` (emits app-relative `@source`
lines into `src/styles/metacore-sources.css`) and
`metacore-tailwind-sources check` in CI: it fails listing every `@asteby/*`
dependency of the app with no `@source` coverage. The SDK CI fails when
`sources.css` is stale (`node scripts/gen-tailwind-sources.mjs --check`).

## The singleton list (currently thirteen)

`metacoreFederationShared()` declares the following packages as
`{ singleton: true }` (`METACORE_FEDERATION_SINGLETONS` in
`packages/starter-config/vite-preset.ts` — the exported constant is the
single source of truth; this list must match it exactly):

- `react`
- `react-dom`
- `react/jsx-runtime`
- `react-i18next`
- `i18next`
- `@tanstack/react-query`
- `@asteby/metacore-ui`
- `@asteby/metacore-runtime-react`
- `@asteby/metacore-sdk`
- `@asteby/metacore-app-providers`
- `@asteby/metacore-theme`
- `@asteby/metacore-auth`
- `@tanstack/react-router` — one router: federated pages navigate through the
  host's router (`useAddonNavigate`). Remotes (`role: 'remote'`, the default
  when `exposes` is set) declare it with `import: false`, so an addon that does
  not install the router still builds and never ships a copy.

**`@tanstack/react-query` is mandatory.** It carries a React context (the
`QueryClient`); the host renders `<QueryClientProvider>` and the shared
`@asteby/metacore-app-providers` calls `useQueryClient`/`useQuery` inside
it (org-config, platform-config providers). Skip sharing it and the host's
provider and the addon's consumer can resolve **different copies** of
react-query — different context — crashing with `"No QueryClient set, use
QueryClientProvider to set one"` thrown from the app-providers loadShare
chunk. It's intermittent because it depends on which container wins the
share negotiation / chunk load order, which makes it easy to miss in local
dev and only surface in production.

**Build-time gotcha**: `@module-federation/vite` must **resolve** every
shared bare specifier at build time — every package in the list above must
be an installed (dev)dependency of whichever package is building (host or
addon), even ones the addon's own code never imports directly (`i18next`/
`react-i18next` are a common miss).

The list grows as `app-providers` and friends evolve — do not hand-roll it
in an addon's `vite.config.ts`; always go through the helper so a bump to
the shared-config package propagates without touching every addon.

## Lazy page shares (maps and charts)

Federated pages (`manifest.frontend.pages[]`, see
[`full-page-federation.md`](./full-page-federation)) may import heavy UI
libraries **only** from this closed set, which the kernel mirrors in
`pages[].shares` (`v3.PageShares`):

| Share | Host capability |
|---|---|
| `@asteby/metacore-maps`, `maplibre-gl` | `ui.maps` |
| `@asteby/metacore-charts`, `recharts` | `ui.charts` |

`METACORE_PAGE_SHARES` declares them `singleton: true, eager: false` (the host
downloads them only when a page imports them, never in the shell) and, in
remotes, `import: false` (the remote never bundles a fallback; installation
already checked the host capability). Anything else fails the build.

```ts
// host (ops)
federation(metacoreFederationShared({ host: 'metacore_ops', role: 'host', pageShares: [...METACORE_PAGE_SHARES] }))
// addon: shares come from manifest.json; every pages[].expose must be in exposes
federation(metacoreFederationShared({ host: 'metacore_shipping', exposes, manifest: '../manifest.json' }))
```

## Per-page budget

`metacorePageBudgetPlugin({ manifest, exposes })` measures each expose on the
real chunk graph — gzip of its static closure, shares and the MF runtime
excluded; lazy `import()` code is reported apart — and fails the build when a
page exceeds its `budget_kb` (default and ceiling **150 KB**). It writes
`dist/metacore-pages.json`, which `metacore build` reads to refuse packing an
over-budget page (and then stamps `frontend.sdk` and `frontend.integrity`).

## CI size budgets (fail before hub publish)

Hub publish rejects remotes over **512 KiB** `remoteEntry.js` or **4 MiB**
total `frontend/` (`validateFrontendBudgets`). Catch the same limits in the
addon Vite build:

```ts
import { federation } from '@module-federation/vite'
import {
  metacoreFederationShared,
  metacoreFederationBudgetPlugin,
} from '@asteby/metacore-starter-config/vite'

export default defineConfig({
  plugins: [
    federation(metacoreFederationShared({ host: 'metacore_tickets', exposes: { … } })),
    metacoreFederationBudgetPlugin(),
  ],
})
```

`metacoreFederationShared()` also throws if a mandatory singleton is missing
or overridden to `singleton: false`. Helpers for scripts/CI without Vite:
`assertMetacoreFederationShared`, `assertFederationDistBudgets`.

## Pre-bundling SDK packages locally

When the addon is linked via `file:` / `workspace:` (development), Vite
does **not** pre-bundle linked deps by default. The SDK packages reach the
browser with bare specifiers and the browser throws
`Failed to resolve module specifier`. Use `metacoreOptimizeDeps` from
`@asteby/metacore-starter-config/vite` to force pre-bundling — see
[the starter-config README](../packages/starter-config/README.md#pre-bundling-linked-sdk-packages).

## Hardening a remote: `requireIntegrity` and `timeoutMs`

`loadFederatedAddon(spec, addonKey?, version?, options?)` takes two optional
policies. Without `options` nothing changes (integrity stays optional, no
timeout).

```ts
await loadFederatedAddon(spec, key, undefined, {
  requireIntegrity: true, // promise rejects if spec.integrity is missing
  timeoutMs: 8_000,       // promise rejects if the remote does not load in time
})
```

`requireIntegrity` is evaluated before the in-memory cache, and the cache key
includes `integrity`, so an earlier load without it (or with another hash)
never satisfies a caller that requires one. Limit: if a container with the same
global name is already registered on `window`, the loader reuses it and does
not inject a new `<script>`, so SRI only protects the first load of a container.
On timeout the cache entry is dropped so a retry loads again.

`<AddonSlot>` does not go through `loadFederatedAddon`: it has its own
`requireIntegrity` / `timeoutMs` (props or `<AddonSlotProvider>`). The
manifest's `slot.timeout_ms` is clamped to 1000..30000 ms (invalid, 0 or
negative values fall back to the host timeout). The slot does not read
`metadata.visibility`, so a host that serves private addons must enable
`requireIntegrity` itself. Visibility, `permission` and `condition` are
enforced by the server filtering the manifests it hands to the host.

## Mounting slot contributions: `<AddonSlot>`

`@asteby/metacore-runtime-react` exports `<AddonSlot kind context>`. It renders
the `contributions.slots[]` of the installed manifests (provided through
`<AddonSlotProvider manifests sdkVersion onEvent>`) plus the in-process entries
of the canonical slot store, ordered by `order` ascending and then `priority`
descending. Each contribution is isolated (ErrorBoundary + Suspense + timeout):
a remote that throws, hangs, has no integrity (with `requireIntegrity`) or needs
an incompatible `frontend.sdk` range shows its fallback and emits
`addon_slot_failed{addon,kind,reason}` through `onEvent`; siblings and the shell
are untouched. `reason` is one of `timeout | load | render | missing_expose |
integrity_required | sdk_incompatible`. The exposed module default-exports
`({ context, props, sdk }) => JSX`.

## See also

- [`packages/starter-config/README.md`](../packages/starter-config/README.md#module-federation-singletons-metacorefederationshared) — full helper option reference.
- [`bridge-api.md`](./bridge-api#golden-rules) — golden rules every federated addon must obey.
- [`full-page-federation.md`](./full-page-federation) — federated pages (`frontend.pages[]`, embedded or full screen); same shared config.
- [`declarative-views.md`](./declarative-views) — `view_type` map/timeline/calendar/chart/split and detail panels: zero JavaScript per addon.
- [`docs/audits/2026-05-04-mf-shared-deps.md`](./audits/2026-05-04-mf-shared-deps.md) — design rationale for the singleton list.
