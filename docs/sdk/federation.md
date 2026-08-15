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

## The singleton list (currently eleven)

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

## Pre-bundling SDK packages locally

When the addon is linked via `file:` / `workspace:` (development), Vite
does **not** pre-bundle linked deps by default. The SDK packages reach the
browser with bare specifiers and the browser throws
`Failed to resolve module specifier`. Use `metacoreOptimizeDeps` from
`@asteby/metacore-starter-config/vite` to force pre-bundling — see
[the starter-config README](../packages/starter-config/README.md#pre-bundling-linked-sdk-packages).

## See also

- [`packages/starter-config/README.md`](../packages/starter-config/README.md#module-federation-singletons-metacorefederationshared) — full helper option reference.
- [`bridge-api.md`](./bridge-api#golden-rules) — golden rules every federated addon must obey.
- [`full-page-federation.md`](./full-page-federation) — `./pages/<slug>` exposes that take over the viewport; same shared config.
- [`docs/audits/2026-05-04-mf-shared-deps.md`](./audits/2026-05-04-mf-shared-deps.md) — design rationale for the singleton list.
