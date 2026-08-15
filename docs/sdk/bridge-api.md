<p align="center">
  <img src="/logo.svg" width="120" alt="Metacore" />
</p>

<h1 align="center">Bridge API</h1>

<p align="center">
  <strong>The contract a federated addon consumes from the shell.</strong>
</p>

## What is the Bridge

The **Bridge** is the runtime contract between a Metacore **host shell** (Ops,
Link, any internal or third-party panel) and a **federated addon** loaded via
Module Federation. The addon ships only its own code; React, the SDK, auth,
theme, i18n, the HTTP client, the WebSocket and the registry come from the
shell through shared dependencies and a single `AddonAPI` object handed to the
addon's `register(api)` entrypoint.

Everything the addon needs to behave like a first-class part of the shell —
the current user, the tenant, the API client, the theme tokens, the language,
the toast queue, the WebSocket bus, the navigation tree — is exposed
**through this bridge**. The addon does not import these from the SDK as its
own copies; it consumes the **shell's singleton instances**.

```
   ┌─────────────────────────── HOST SHELL (Ops / Link / 3P) ────────────────────────────┐
   │                                                                                     │
   │   <QueryClientProvider>                                                              │
   │     <ApiProvider client={axiosFromCreateApiClient}>      ← packages/auth             │
   │       <PlatformConfigProvider fetcher>                   ← packages/app-providers    │
   │         <OrgConfigProvider fetcher>                                                  │
   │           <ThemeProvider>                                ← packages/theme            │
   │             <I18nextProvider>                            ← packages/i18n             │
   │               <WebSocketProvider url getToken>           ← packages/websocket        │
   │                 <AuthProvider> + useAuthStore            ← packages/auth             │
   │                   <Registry singleton>                   ← packages/sdk              │
   │                     <AddonLoader scope url api={api}>    ← packages/runtime-react    │
   │                       ┊                                                              │
   │                       ┊  loadScript(remoteEntry.js)                                  │
   │                       ┊  __webpack_init_sharing__()                                  │
   │                       ┊  container.get('./plugin')                                   │
   │                       ▼                                                              │
   │              ┌─────────────────────────────────────────────────────────┐             │
   │              │             FEDERATED ADDON BUNDLE                      │             │
   │              │                                                         │             │
   │              │   export default definePlugin({                         │             │
   │              │     key: 'tickets',                                     │             │
   │              │     register(api) {  ◀───── AddonAPI from shell ──┐     │             │
   │              │       api.registry.registerRoute(...)             │     │             │
   │              │       api.registry.registerSlot('dashboard',...)  │     │             │
   │              │       api.client.invokeWebhook(...)               │     │             │
   │              │     },                                            │     │             │
   │              │   })                                              │     │             │
   │              │                                                   │     │             │
   │              │   shell's singletons (via MF `shared`):           │     │             │
   │              │     • react                                       │     │             │
   │              │     • react-dom                                   │     │             │
   │              │     • @asteby/metacore-runtime-react              │     │             │
   │              │     • @asteby/metacore-auth                       │     │             │
   │              │     • @asteby/metacore-theme                      │     │             │
   │              │     • @asteby/metacore-ui                         │     │             │
   │              │     • @asteby/metacore-sdk                        │     │             │
   │              │     • @asteby/metacore-app-providers              │     │             │
   │              └───────────────────────────────────────────────────┴─────┘             │
   └─────────────────────────────────────────────────────────────────────────────────────┘
```

Two consumption surfaces, same bridge:

1. **`./plugin` (headless)** — the addon contributes routes, slots, actions and
   modals through `api.registry`. The host renders them inside its chrome.
2. **`./pages/<slug>` (full-page)** — the addon default-exports a React
   component the host mounts under `/addons/<key>/<slug>` without chrome. The
   component still receives the same `AddonAPI` and can call every shell
   service through hooks. See [`full-page-federation.md`](./full-page-federation).

Both shapes ride the same bridge — the contract below is identical.

## Lifecycle

### Load

```
host                                         addon (federated remote)
────                                         ────────────────────────
1. resolves manifest for installed addon
2. <AddonLoader scope url module api/>
   ├─ loadScript("…/remoteEntry.js")        ◀── exposes window[scope]
   ├─ __webpack_init_sharing__("default")
   ├─ container.init(shareScopes.default)
   └─ container.get(module)                  ◀── factory()
3. mod.register(api)                         ──▶ api.registry.register*
4. setStatus('ready'); onReady()
```

Mechanics live in [`packages/runtime-react/src/addon-loader.tsx`](../packages/runtime-react/src/addon-loader.tsx).
The host instantiates **one** `Registry` (from `@asteby/metacore-sdk`) per
shell session and hands the same scoped reference to every addon's
`register(api)`. Contributions are global to the shell — the registry is the
shell's source of truth for addon UI.

### Mount

Once `register(api)` returns, the shell:

- merges the addon's `manifest.navigation` into the sidebar via
  `mergeNavigation()` in `packages/runtime-react/src/navigation-builder.tsx`.
- wires the addon's `registry.registerRoute(...)` entries into the router.
- renders `registry.registerSlot(name, ...)` contributions wherever it has a
  `<Slot name="…" />` (see [`slot.tsx`](../packages/runtime-react/src/slot.tsx)).
- exposes `registry.registerModal(slug, ...)` to `<ActionModalDispatcher>` so
  manifest-declared `actions[model][].modal` references resolve.

The addon can also call `useDeclareAddonLayout('immersive')` from any
descendant component to flip the host shell into chromeless full-viewport
mode. The shell-side switch is implemented in
[`packages/starter-core/src/components/AddonRoute.tsx`](../packages/starter-core/src/components/AddonRoute.tsx).

### Hot-swap

When the kernel announces a new manifest version, the host receives an
`ADDON_MANIFEST_CHANGED` message over the WebSocket. The hot-swap subscriber
in `packages/runtime-react/src/manifest-hotswap-subscriber.ts` invalidates the
metadata cache and bumps the addon's `version` key. `<AddonRoute version>` on
the shell side re-keys the subtree — React unmounts the addon, the federation
container cache is cleared via `clearFederationContainer()`, and the next
mount fetches `remoteEntry.js?v=<hash8>` from disk. Any state held by the
addon's previous closures is intentionally destroyed.

### Unmount

The shell calls `plugin.dispose?()` (when implemented) before unmounting the
addon's subtree. Anything the addon registered (routes, slots, modals) stays
in the registry for the rest of the session — `dispose()` is for releasing
external resources (timers, sockets opened outside the shell's bus, etc.), not
for unwinding registry contributions. To replace a registered route/slot, the
host re-loads with a new `version`.

## APIs available

Every key is reached either via the `AddonAPI` object passed to `register()`,
or via a React hook resolved against the shell's provider tree (only works
because React is `singleton: true` in the federation config — see
[Golden rules](#golden-rules)).

| API | Where it lives | How the addon reaches it |
|---|---|---|
| Addon manifest + settings | `AddonAPI.manifest`, `AddonAPI.settings` | argument to `register(api)` |
| Marketplace client (webhooks, install metadata) | `AddonAPI.client` | argument to `register(api)` |
| Registry mutators (routes, slots, modals, actions) | `AddonAPI.registry` | argument to `register(api)` |
| Kernel version | `AddonAPI.kernelVersion` | argument to `register(api)` |
| Telemetry / logger | `AddonAPI.telemetry`, `AddonAPI.log` | argument to `register(api)` |
| Current user (auth) | `@asteby/metacore-auth` → `useAuth()`, `useAuthStore()` | hook |
| Access token | `useAuthStore.getState().auth.accessToken` | store |
| Tenant / org | `useAuthStore().auth.user.organization_id`, `.organization_name` | store |
| Org config (locale, fiscal, currency) | `@asteby/metacore-app-providers` → `useOrgConfig()` | hook |
| Platform branding (logo, primary, accent) | `@asteby/metacore-app-providers` → `usePlatformConfig()` | hook |
| HTTP client (auth headers, branch, language) | `@asteby/metacore-runtime-react` → `useApi()` | hook |
| Current branch | `@asteby/metacore-runtime-react` → `useCurrentBranch()` | hook |
| Theme (light/dark, tokens) | `@asteby/metacore-theme` → `useTheme()` | hook |
| i18n / locale | `@asteby/metacore-i18n` → `useLocale()`, `useTranslation()` (re-exported from i18next) | hook |
| Direction (LTR/RTL) | `@asteby/metacore-i18n` → `useDirection()` | hook |
| Notifications (toast / app badge) | `sonner` `toast()` (singleton mounted by the shell's `<Toaster/>`) | direct import (shared via shell's bundle) |
| Inbox notifications | `@asteby/metacore-notifications` → `useNotifications()` | hook |
| WebSocket bus | `@asteby/metacore-websocket` → `useWebSocket()`, `useWebSocketMessage(type, handler)` | hook |
| Navigation merge | `@asteby/metacore-runtime-react` → `mergeNavigation()`; addon contributes via `manifest.navigation` | declarative |
| Layout switch (chrome/immersive) | `@asteby/metacore-runtime-react` → `useDeclareAddonLayout('immersive')` | hook |
| Dynamic UI (tables, forms, CRUD pages) | `@asteby/metacore-runtime-react` → `<DynamicTable/>`, `<DynamicForm/>`, `<DynamicCRUDPage/>` | components |
| UI primitives (Dialog, Button, DataTable) | `@asteby/metacore-ui/*` subpaths | components |
| Capability gate | `@asteby/metacore-runtime-react` → `<CapabilityGate/>`, `useCapabilities()` | hook / component |

### Auth

The shell mounts `<AuthProvider>` from `@asteby/metacore-auth` and exposes
both a React context (`useAuth()`) and a zustand store (`useAuthStore`). The
store carries the strongly-typed `AuthUser` (id, email, role, plus
organization/subscription/locale fields) and the access token. Because the
auth package is a federation singleton, the addon's `useAuth()` hook resolves
the shell's provider — there is no second auth instance.

### Tenant

The current organization is denormalized onto `AuthUser`
(`organization_id`, `organization_name`, `organization_logo`,
`plan_slug`, `subscription_status`, `currency_code`, `timezone`). Mutable
per-tenant runtime configuration that should NOT live on the user (fiscal
identifiers, address formats, fiscal calendar) flows through
`<OrgConfigProvider>` and `useOrgConfig()` — see the `org config` memory note
referenced from the SDK docs.

### Transport

The shell builds **one** axios instance via
`createApiClient({ baseURL, getToken, getLanguage, getBranchId, onUnauthorized })`
from `packages/auth/src/api-client.ts`. The interceptor automatically attaches
`Authorization: Bearer <token>`, `Accept-Language` and `X-Branch-ID`, strips
`Content-Type` for `FormData` uploads, and routes 401 responses to the
shell's `onUnauthorized` (which clears auth state and navigates to sign-in).

The same instance is then injected into `<ApiProvider client={api}>` and
consumed by addons via `useApi()`. Addons must **not** import axios on their
own — every request goes through the shell client so headers, refresh logic
and base URL stay consistent.

### Theme

`useTheme()` from `@asteby/metacore-theme` returns the current theme
(`light` / `dark` / `system`), the resolved value, and `setTheme()`. Brand
colours (primary, accent, sidebar) are derived from
`<PlatformConfigProvider>` and materialised as CSS custom properties on
`<html>` (in `oklch()` space, see `platform-config-provider.tsx`). Addons
read tokens via the same CSS variables — no JS-side colour list to import.

### i18n

The shell mounts an `i18next` instance built by `createI18n()` from
`@asteby/metacore-i18n`. Addons publish their own translation bundle to the
Hub (`/v1/addons/<key>/i18n/<lang>.json`); the SDK fetches and caches it via
`useAddonI18n(addonKey)`. Switching the host language triggers a refetch.

### Notifications

Two surfaces:

- **Toasts** — `sonner`'s `toast()` API. The shell mounts `<Toaster/>` once
  (`MetacoreAppShell` does this by default). Because `sonner` is shipped by
  the shell's bundle, addons calling `toast.success(...)` hit the shell's
  queue, not a private one.
- **Inbox** — `<NotificationsDropdown apiClient apiBasePath/>` from
  `@asteby/metacore-notifications`. The addon doesn't render this — the shell
  does. The package exposes `useNotifications()` / `useAppBadge()` if an
  addon needs to read unread counts.

### WebSocket subscriber

The shell mounts `<WebSocketProvider url getToken/>` once. Addons subscribe
to typed messages via:

```tsx
import { useWebSocketMessage } from '@asteby/metacore-websocket'

useWebSocketMessage('order.created', (msg) => {
  // msg.payload: { id, total, ... }
})
```

`useWebSocketMessage` returns nothing — it just registers a handler for the
lifetime of the component. The provider handles reconnect, exponential
backoff, heartbeat and token refresh; addons never speak to the raw socket.

Manifest hot-swap events ride this same bus (see
`manifest-hotswap-subscriber.ts`); addons that want to react to other
addons' lifecycle subscribe to the same message types.

### Navigation

Declarative through `manifest.navigation[]`. The shell merges every addon's
contribution into its base sidebar via `mergeNavigation()`. Addons that need
a programmatic entry (e.g. a deep-link to a sub-route created at runtime) can
also call `api.registry.registerRoute({ path, component })` and let the
shell's navigation provider attach it.

There is **no** imperative "open this page" call on the bridge today. Addons
that want to navigate from inside their own React tree use the shell's
router via `useNavigate()` from `@tanstack/react-router` — the router
instance is shared because the host's router context is part of the React
tree and React is a federation singleton. See [Gaps detectados](#gaps-detectados).

## Golden rules

These are non-negotiable for any addon that wants to load cleanly in the
shell.

### 1. The addon does NOT bundle React or the SDK

Every shell-shared package is declared with `singleton: true` in the addon's
Module Federation config. The addon imports `react`, `@asteby/metacore-sdk`,
`@asteby/metacore-auth`, etc., but at runtime those imports resolve to the
**shell's** copies. Without this, the addon ends up with its own React → the
canonical `Invalid hook call` plus broken contexts (`useApi()`, `useAuth()`,
`useTheme()` all return `undefined`).

The canonical list lives in `metacoreFederationShared()` from
`@asteby/metacore-starter-config/vite`:

```ts
// addon vite.config.ts
import { federation } from '@module-federation/vite'
import { metacoreFederationShared } from '@asteby/metacore-starter-config/vite'

export default defineConfig({
  plugins: [
    federation(
      metacoreFederationShared({
        host: 'metacore_tickets',                 // containerName(manifest)
        exposes: { './plugin': './src/plugin.tsx' },
      }),
    ),
  ],
})
```

The mandatory singletons are:

- `react`
- `react-dom`
- `@asteby/metacore-runtime-react`
- `@asteby/metacore-theme`
- `@asteby/metacore-app-providers`
- `@asteby/metacore-auth`
- `@asteby/metacore-ui`
- `@asteby/metacore-sdk`

Each is declared with `{ singleton: true, requiredVersion: false }`. The
`requiredVersion: false` is intentional — Module Federation does NOT enforce
exact match at runtime, and the host wins the share scope race. Addons that
linger on older shell versions still load. Addons that want stricter version
gating pass `overrides`. Detailed reasoning per package lives in
[`docs/audits/2026-05-04-mf-shared-deps.md`](./audits/2026-05-04-mf-shared-deps.md);
the canonical addon/host wiring is in [`docs/federation.md`](./federation) —
hand-rolling the `shared:` block against the plugin's public types is
deprecated.

### 2. The addon receives every shell service through hooks, never imports

For example, an addon must NEVER do this:

```ts
// ❌ wrong
import axios from 'axios'
const myClient = axios.create({ baseURL: '/api' })
```

Because that instance has no token, no language, no branch, no 401 handler.

Instead:

```tsx
// ✅ right
import { useApi } from '@asteby/metacore-runtime-react'

function MyPanel() {
  const api = useApi()                  // shell's wired axios
  // …
}
```

The same applies to `useAuth()`, `useTheme()`, `useLocale()`,
`useWebSocket()`, `useNotifications()`, `usePlatformConfig()`,
`useOrgConfig()`, `useCurrentBranch()`.

### 3. The addon ships only its own code

Anything reachable through the bridge MUST NOT be a runtime dep of the addon
package. The addon `package.json` should declare every singleton as
`peerDependencies`, not `dependencies`. Bundle size for a non-trivial addon
should land in the 30–80 KB range — anything larger usually means React or
the SDK leaked into the bundle.

### 4. Tailwind v4: declare `@source` for SDK packages

Tailwind v4 only emits utility classes it finds while scanning the configured
content globs. SDK packages live under `node_modules/` and are skipped by
default, so classes like `bg-primary` or `data-[state=open]` from
`DynamicTable` / `<Toaster/>` / shell layout are silently pruned in
production.

The addon's main stylesheet must include:

```css
/* src/styles/app.css */
@import 'tailwindcss';
@import '@asteby/metacore-theme/tokens.css';

@source "../../node_modules/@asteby/metacore-ui/dist/**/*.{js,mjs}";
@source "../../node_modules/@asteby/metacore-runtime-react/dist/**/*.{js,mjs}";
@source "../../node_modules/@asteby/metacore-auth/dist/**/*.{js,mjs}";
@source "../../node_modules/@asteby/metacore-app-providers/dist/**/*.{js,mjs}";
@source "../../node_modules/@asteby/metacore-notifications/dist/**/*.{js,mjs}";
```

Adjust the relative path to the addon's repo layout. One `@source` line per
SDK package the addon renders. Without these, the addon looks unstyled in
production even though dev mode (with Vite's on-demand class detection) shows
nothing wrong.

### 5. Vite: pre-bundle SDK packages with `metacoreOptimizeDeps`

When the addon is linked locally via `file:` / `workspace:` (development),
Vite does NOT pre-bundle linked deps by default. The SDK packages' `dist/*.js`
reach the browser with bare specifiers (`@asteby/metacore-ui/...`) and the
browser throws `Failed to resolve module specifier`.

Force pre-bundling via the canonical config:

```ts
// addon vite.config.ts
import { defineMetacoreConfig } from '@asteby/metacore-starter-config/vite'

export default defineMetacoreConfig({
  router: true,
  // metacoreOptimizeDeps applied automatically
})
```

If the addon writes its own Vite config:

```ts
import { metacoreOptimizeDeps } from '@asteby/metacore-starter-config/vite'

export default defineConfig({
  optimizeDeps: metacoreOptimizeDeps,
})
```

`metacoreOptimizeDeps` ships the canonical `include` list — every public
`@asteby/metacore-*` package and every subpath entry (`/primitives`, `/lib`,
`/data-table`, `/dialogs`, `/layout`, `/hooks`, `/icons`, `/command-menu`).

### 6. One `Registry`, one shell

The host instantiates exactly one `Registry` (from `@asteby/metacore-sdk`)
per session and hands the same reference to every `register(api)`. Addons
that try to instantiate their own `new Registry()` end up with a private
contribution table the shell never reads.

## Minimal example

A complete addon that renders **"Hello tenant {name}"** under
`/addons/hello/dashboard` and contributes one sidebar entry.

### `manifest.json`

```jsonc
{
  "apiVersion": "asteby.com/v3",
  "kind": "Addon",
  "metadata": {
    "key": "hello",
    "name": "Hello Tenant",
    "version": "1.0.0",
    "category": "demo"
  },
  "compatibility": {
    "requires": [{ "key": "kernel", "version": ">=3.0.0 <4.0.0" }]
  },

  "frontend": {
    "entry":     "/api/metacore/addons/hello/frontend/remoteEntry.js",
    "format":    "federation",
    "expose":    "./plugin",
    "container": "metacore_hello"
  },

  "contributions": {
    "navigation": [{
      "title": "sidebar.hello",
      "icon": "Hand",
      "url": "/addons/hello/dashboard"
    }]
  }
}
```

### `vite.config.ts`

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import { federation } from '@module-federation/vite'
import { metacoreFederationShared, metacoreOptimizeDeps }
  from '@asteby/metacore-starter-config/vite'

export default defineConfig({
  plugins: [
    react(),
    federation(
      metacoreFederationShared({
        host: 'metacore_hello',
        exposes: { './plugin': './src/plugin.tsx' },
      }),
    ),
  ],
  optimizeDeps: metacoreOptimizeDeps,
  build: { target: 'esnext', modulePreload: false, cssCodeSplit: false },
})
```

### `package.json` (excerpt)

```jsonc
{
  "name": "metacore-addon-hello",
  "version": "1.0.0",
  "type": "module",
  "peerDependencies": {
    "react": "^19",
    "react-dom": "^19",
    "@asteby/metacore-runtime-react": "*",
    "@asteby/metacore-auth": "*",
    "@asteby/metacore-app-providers": "*",
    "@asteby/metacore-sdk": "*",
    "@asteby/metacore-ui": "*",
    "@asteby/metacore-theme": "*"
  }
}
```

### `src/styles/app.css`

```css
@import 'tailwindcss';
@import '@asteby/metacore-theme/tokens.css';

@source "../../node_modules/@asteby/metacore-ui/dist/**/*.{js,mjs}";
@source "../../node_modules/@asteby/metacore-runtime-react/dist/**/*.{js,mjs}";
@source "../../node_modules/@asteby/metacore-auth/dist/**/*.{js,mjs}";
@source "../../node_modules/@asteby/metacore-app-providers/dist/**/*.{js,mjs}";
```

### `src/plugin.tsx`

```tsx
import { definePlugin } from '@asteby/metacore-sdk'
import { useAuthStore } from '@asteby/metacore-auth'
import { useOrgConfig } from '@asteby/metacore-app-providers'
import { Card } from '@asteby/metacore-ui/primitives'
import './styles/app.css'

function HelloDashboard() {
  const user = useAuthStore((s) => s.auth.user)
  const org = useOrgConfig()

  return (
    <main className="p-8">
      <Card className="p-6">
        <h1 className="text-2xl font-semibold text-foreground">
          Hello tenant {user?.organization_name ?? 'Unknown'}
        </h1>
        <p className="text-sm text-muted-foreground mt-2">
          Signed in as {user?.email} · currency {org.currency_code ?? '—'}
        </p>
      </Card>
    </main>
  )
}

export default definePlugin({
  key: 'hello',
  register(api) {
    api.log.info('registering hello addon', { kernel: api.kernelVersion })
    api.registry.registerRoute({
      path: '/addons/hello/dashboard',
      component: HelloDashboard,
    })
  },
})
```

Three things to notice:

1. The addon imports `useAuthStore` and `useOrgConfig` directly. At build
   time these resolve to its own `node_modules`; at runtime Module Federation
   redirects them to the shell's singletons.
2. There is no `<AuthProvider>` or `<OrgConfigProvider>` in the addon —
   those live in the shell and wrap the federation loader.
3. The route component is contributed once via `api.registry.registerRoute`.
   The host renders it inside its own router and chrome.

## Versioning

The bridge surface is **everything in this document**. It is versioned by
the union of the SDK packages it spans:

| Package | Current major |
|---|---|
| `@asteby/metacore-sdk` | `2.x` |
| `@asteby/metacore-app-providers` | `6.x` |
| `@asteby/metacore-runtime-react` | `4.x` |
| `@asteby/metacore-auth` | `2.x` |
| `@asteby/metacore-theme` | `2.x` |
| `@asteby/metacore-ui` | `1.x` |
| `@asteby/metacore-i18n` | `1.x` |
| `@asteby/metacore-notifications` | `1.x` |
| `@asteby/metacore-websocket` | `1.x` |
| `@asteby/metacore-starter-config` | `1.x` |

**Breaking-change policy** for the bridge:

- **Adding** a service to `AddonAPI` or a new shell-side hook is **minor**.
  Existing addons keep loading.
- **Renaming or removing** a field on `AddonAPI`, removing a hook, or
  changing the signature of an existing one is **major** on the package that
  owns it, AND requires a `Bridge vN` bump in the kernel
  (`AddonAPI.kernelVersion`).
- **Changing the MF singleton list** is **major** on
  `@asteby/metacore-starter-config`. Addons must republish with the new
  config; old addons keep working until the shell's kernel-version gate
  refuses them.
- Hot-swap re-keys (see [Lifecycle](#lifecycle)) are NOT a breaking change.

The addon advertises its bridge contract by pinning peer ranges in
`peerDependencies`. The host enforces compatibility through the
`manifest.kernel` semver range — the kernel rejects manifests whose declared
range excludes the running shell.

## Gaps detectados

Areas where the bridge is implicit or inconsistent today. These are
documented here as known gaps; implementation is **out of scope** for this
doc and should land as separate RFCs / feature PRs.

1. **No imperative navigation API on `AddonAPI`.** Addons currently navigate
   via `useNavigate()` from `@tanstack/react-router`, which works only
   because the router instance leaks through React context. There is no
   guarantee a shell uses TanStack Router; a non-TanStack host breaks every
   addon that imports it. Proposal: surface `api.navigation.push(path)` /
   `api.navigation.replace(path)` so addons stay router-agnostic.

2. **No modal stack on `AddonAPI`.** Modal contributions go through
   `registry.registerModal(slug, …)` but there is no way for the addon to
   **imperatively open** a modal owned by the host (e.g. a confirm dialog,
   the host's command palette). Today addons either render `<Dialog/>`
   themselves (lives inside the addon's subtree and can be clipped by
   chrome) or import internal modal stores from the host (fragile, host-
   specific). Proposal: `api.dialogs.confirm({ title, body })`,
   `api.dialogs.open(slug, payload)` backed by a host-owned modal stack.

3. **Toast queue is implicit.** `sonner.toast(...)` works only because the
   shell happens to have mounted `<Toaster/>` and `sonner` rides as a
   non-singleton dep through the shell bundle. There is no contract that
   guarantees a host wires Sonner. Proposal: expose
   `api.notifications.toast({ kind, title, description })` and let the host
   pick the implementation (Sonner today, custom tomorrow).

4. **No imperative WebSocket publish/broadcast on `AddonAPI`.**
   `useWebSocket().send()` lets an addon push frames, but inter-addon
   eventing (one addon emits, another subscribes) is undocumented and
   relies on agreeing on `message.type` strings. Proposal: bless
   `api.events.publish(type, payload)` / `api.events.subscribe(type, fn)`
   as the canonical inter-addon bus, layered on the websocket.

5. **No capability check on the bridge.** `useCapabilities()` exists but is
   reached only through the React hook surface. An addon checking
   capabilities inside `register(api)` (before any component renders) has
   nothing to call. Proposal: `api.capabilities.has(kind, target)` mirroring
   the hook.

6. **Branch context optional.** `useCurrentBranch()` returns `{ id:
   undefined }` when no `<BranchProvider>` is mounted. Multi-branch addons
   silently load with `null` branch and fall back to the org default,
   which is rarely what the user wants. Proposal: make
   `BranchProvider` mandatory for multi-branch addons via a manifest flag
   that the shell can validate at install time.

7. **No theme tokens API.** Addons read CSS variables (`--primary`,
   `--accent`) — fine for styling, useless for canvas/SVG/chart libraries
   that need numeric values. `@asteby/metacore-theme` exports
   `colorTokens` / `chartTokens` but those are static — they don't reflect
   the runtime `PlatformConfigProvider` overrides. Proposal: a
   `useResolvedThemeTokens()` hook that returns the live oklch values.

8. **`registry.registerSlot` priority semantics differ from `slotRegistry`.**
   `@asteby/metacore-sdk`'s `Registry.registerSlot` sorts ascending (lower
   priority first); `slotRegistry` in `runtime-react/src/slot.tsx` sorts
   descending (higher priority first). The shell uses both. Pick one;
   document it on `SlotContribution.priority`.

9. **No version negotiation handshake.** `AddonAPI.kernelVersion` is
   informative but the addon can't refuse to register based on it without
   throwing. Proposal: addons return `false` from `register()` to signal
   incompatibility, which the host surfaces as an install error rather than
   a runtime crash.

## See also

- [`addon-publishing.md`](./addon-publishing) — how to publish an addon to the Hub.
- [`addon-cookbook.md`](./addon-cookbook) — pattern-by-pattern recipes for the `./plugin` shape.
- [`full-page-federation.md`](./full-page-federation) — `./pages/<slug>` chromeless route convention.
- [`manifest-spec.md`](./manifest-spec) — manifest fields the bridge reads from.
- [`capabilities.md`](./capabilities) — capability gates enforced before bridge access.
- [`audits/2026-05-04-mf-shared-deps.md`](./audits/2026-05-04-mf-shared-deps.md) — per-package singleton rationale.
