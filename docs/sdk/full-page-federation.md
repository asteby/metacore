<p align="center">
  <img src="/logo.svg" width="120" alt="Metacore" />
</p>

<h1 align="center">Full-page federation</h1>

<p align="center">
  <strong>Take over the viewport. No shell, no sidebar, no header — your route owns the screen.</strong>
</p>

The default federation contract (`expose: "./plugin"`) loads an addon **headlessly**: it imports the module, calls `register(api)`, and lets the addon contribute slots, actions, navigation entries and modals into the host's chrome. The host stays in charge of what the user sees.

For some surfaces that contract is the wrong shape. A point-of-sale terminal, a kitchen display, a kiosk, a fullscreen dashboard, a customer-facing signage screen — all of these need the **entire viewport**. The host's sidebar, header and chrome are noise.

This document describes the **full-page federation** convention: a manifest pattern that signals to the host "render this exposed module as a chromeless route at a well-known URL".

## Table of contents

- [When to use it](#when-to-use-it)
- [Manifest convention](#manifest-convention)
- [Route mapping](#route-mapping)
- [Module contract](#module-contract)
- [Host responsibilities](#host-responsibilities)
- [Multiple pages per addon](#multiple-pages-per-addon)
- [Worked example: POS](#worked-example-pos)
- [Interaction with `navigation[]`](#interaction-with-navigation)
- [See also](#see-also)

## When to use it

| Use this | Use the standard `./plugin` |
|---|---|
| Cashier register / POS terminal | A new column type rendered inside `<DynamicTable>` |
| Kitchen display, signage, kiosk | A custom action modal |
| Fullscreen analytics or live ops board | A widget injected into `dashboard.widgets` |
| Embedded third-party app that renders its own shell | A link in the sidebar |
| Anything that should hide the host chrome on small or shared screens | Anything that should compose with the host chrome |

If you are unsure, default to `./plugin`. Full-page federation is a deliberate carve-out — it bypasses the host shell, so capability gates, branch switcher, breadcrumbs and global search **do not** appear unless your page renders them itself.

## Manifest convention

The signal is the **shape of `frontend.expose`**. Anything starting with `./pages/` is treated as a full-page module:

```json
"frontend": {
  "entry":     "/api/metacore/addons/pos/frontend/remoteEntry.js",
  "format":    "federation",
  "expose":    "./pages/register",
  "container": "metacore_pos",
  "integrity": "sha384-..."
}
```

Rules:

- The exposed module path **must** match the regex `^\./pages/[a-z][a-z0-9_-]{0,63}$`.
- The segment after `./pages/` is the **route slug**. It becomes part of the URL — see [Route mapping](#route-mapping) below.
- The slug regex matches the manifest key regex (`^[a-z][a-z0-9_-]{0,63}$`) so the URL is always safe and predictable.
- A manifest with a `./pages/...` expose **must not** also declare slot / nav contributions through a `register(api)` export. Pick one shape per addon. If you need both, see [Multiple pages per addon](#multiple-pages-per-addon).

Anything else (`./plugin`, `./register`, `./widgets/foo`) keeps the existing headless contract — the host calls `register(api)` and renders nothing of its own from the addon module.

## Route mapping

The host mounts a full-page module at:

```
/addons/<key>/<route>
```

Where `<key>` is `manifest.key` and `<route>` is the slug after `./pages/`.

| `manifest.key` | `frontend.expose` | URL |
|---|---|---|
| `pos` | `./pages/register` | `/addons/pos/register` |
| `pos` | `./pages/kitchen` | `/addons/pos/kitchen` |
| `signage` | `./pages/screen` | `/addons/signage/screen` |
| `kiosk` | `./pages/check-in` | `/addons/kiosk/check-in` |

The host strips its layout above this route — no `<AppShell>`, no sidebar, no header. The page is rendered inside a transparent `100vw × 100vh` container with the host's providers (`<ApiProvider>`, `<I18nextProvider>`, `<CapabilityProvider>`, `<BranchProvider>`) still in scope.

This is **not** the same namespace as `/m/<key>` (which hosts the model-driven CRUD routes built from `navigation[]`). Full-page routes intentionally live under `/addons/` to make the bypass-the-chrome semantics visible in the URL bar.

## Module contract

The exposed module **default-exports** a React component:

```tsx
// frontend/src/pages/register.tsx
import type { FullPageProps } from '@asteby/metacore-sdk'

export default function RegisterPage(props: FullPageProps) {
  // props.api          — same AddonAPI as register(api) gets
  // props.params       — params parsed from sub-routes (see below)
  // props.exit()       — host helper to navigate back to /m/<key> or /
  return <main className="h-screen w-screen">…</main>
}
```

The component:

- Owns the entire viewport. Apply your own background, fonts, scaling.
- Is mounted **inside** the host's React tree, so hooks like `useTranslation()`, `useApi()` and `useCapabilities()` work without setup.
- Receives an `AddonAPI` via props for parity with the `register(api)` contract — use it to call host services (slot dispatch, capability checks, action invocation, event publish).
- May render its own router (e.g. `react-router`) for sub-routes; the host treats `/addons/<key>/<route>/*` as belonging to the page.

The host imports the module via the normal federation flow (see [`federation.ts`](../packages/sdk/src/federation.ts)) and renders `<Component {...props} />`. SRI hash, container naming and cache rules are unchanged from the standard contract.

## Host responsibilities

A host that supports full-page federation **must**:

1. **Resolve manifests** for installed addons whose `frontend.expose` matches `^\./pages/`. Compute the route slug and register it under `/addons/<key>/<route>`.
2. **Mount outside the app shell.** The route must not be wrapped in the chrome that other authenticated routes use. A typical implementation is a sibling `<Route>` to `<AppShell>` in the router tree.
3. **Apply auth + capability gates upstream.** The chrome being absent does not mean the route is public — the host still resolves the session, scopes the addon to the current organization, and can refuse to mount the page if a declared `capabilities[]` is denied.
4. **Inject the standard providers.** `<ApiProvider>`, `<I18nextProvider>`, `<CapabilityProvider>`, `<BranchProvider>` and the metadata cache must be in scope inside the page, so addon components can use the SDK as usual.
5. **Forward unknown sub-paths.** `/addons/<key>/<route>/foo/bar` must reach the page so it can do client-side routing.
6. **Ignore `./pages/*` in `register(api)` paths.** A manifest with a `./pages/<route>` expose is full-page only; the host should not attempt to call `register()` on it.

## Multiple pages per addon

A single manifest exposes **one** module via `frontend.expose`. To ship more than one full-page surface from the same addon, declare them as **separate manifest entries published as siblings** (one per page). They share the same federation bundle (same `entry`, same `container`); only `expose` differs.

```jsonc
// manifest.json — addon "pos.register"
{
  "key": "pos_register",
  "frontend": {
    "entry":   "/api/metacore/addons/pos/frontend/remoteEntry.js",
    "format":  "federation",
    "expose":  "./pages/register",
    "container": "metacore_pos"
  }
}
```

```jsonc
// manifest.json — addon "pos.kitchen"
{
  "key": "pos_kitchen",
  "frontend": {
    "entry":   "/api/metacore/addons/pos/frontend/remoteEntry.js",
    "format":  "federation",
    "expose":  "./pages/kitchen",
    "container": "metacore_pos"
  }
}
```

This keeps the `key → URL` mapping 1:1 and avoids special-casing arrays in the manifest validator. If a future revision of `APIVersion` introduces a `frontend.pages: { route: module }` map, this convention is the migration target.

## Worked example: POS

A point-of-sale addon with two full-screen surfaces — the **register** (cashier-facing) and the **kitchen display** (line cook-facing).

### Bundle layout

```
pos/
├── manifest.json
├── frontend/
│   ├── package.json
│   ├── vite.config.ts
│   └── src/
│       ├── pages/
│       │   ├── register.tsx       ← default export: <RegisterPage />
│       │   └── kitchen.tsx        ← default export: <KitchenPage />
│       └── shared/
│           └── orders.ts
└── backend/
    └── backend.wasm
```

### `vite.config.ts`

```ts
import { defineConfig } from 'vite'
import { federation } from '@module-federation/vite'
import {
  metacoreFederationShared,
  metacoreOptimizeDeps,
} from '@asteby/metacore-starter-config/vite'

export default defineConfig({
  plugins: [
    federation(
      metacoreFederationShared({
        host: 'metacore_pos',                                // == manifest.frontend.container
        exposes: {
          './pages/register': './src/pages/register.tsx',
          './pages/kitchen':  './src/pages/kitchen.tsx',
        },
        extras: ['react-i18next'],                           // optional: extra singletons beyond the canonical seven
      }),
    ),
  ],
  optimizeDeps: metacoreOptimizeDeps,
  build: { target: 'esnext', modulePreload: false, cssCodeSplit: false },
})
```

A single bundle, two exposed modules, one `remoteEntry.js`. The `shared`
config is delegated to `metacoreFederationShared()` so every SDK singleton
(React, the registry, theme, auth, app-providers, UI) is declared in one
place — see [`docs/federation.md`](./federation).

### `manifest.json` (register)

```jsonc
{
  "apiVersion": "asteby.com/v3",
  "kind": "Addon",
  "metadata": {
    "key": "pos_register",
    "name": "POS — Register",
    "version": "1.0.0",
    "category": "operations"
  },
  "compatibility": {
    "requires": [{ "key": "kernel", "version": ">=3.0.0 <4.0.0" }]
  },
  "tenancy": { "isolation": "shared", "rls_column": "organization_id" },

  "models": [
    {
      "key": "Ticket",
      "table": "tickets",
      "label": "Tickets",
      "columns": [
        { "name": "id",              "type": "uuid",        "primary_key": true, "default": "gen_random_uuid()" },
        { "name": "organization_id", "type": "uuid",        "not_null": true },
        { "name": "number",          "type": "integer",     "not_null": true },
        { "name": "state",           "type": "text",        "default": "open" },
        { "name": "total",           "type": "numeric",     "default": 0 },
        { "name": "opened_at",       "type": "timestamptz", "default": "now()" },
        { "name": "deleted_at",      "type": "timestamptz" }
      ],
      "indices": [
        { "name": "tickets_number_idx", "columns": ["number"] }
      ]
    }
  ],

  "capabilities": [
    { "kind": "db:read",  "target": "addon_pos_register.tickets" },
    { "kind": "db:write", "target": "addon_pos_register.tickets" },
    { "kind": "event:emit", "target": "pos.ticket_opened" },
    { "kind": "event:emit", "target": "pos.ticket_paid" }
  ],

  "extension_points": {
    "events": [
      { "name": "pos.ticket_opened" },
      { "name": "pos.ticket_paid" }
    ]
  },

  "frontend": {
    "entry":     "/api/metacore/addons/pos_register/frontend/remoteEntry.js",
    "format":    "federation",
    "expose":    "./pages/register",
    "container": "metacore_pos"
  }
}
```

A second manifest with `key: "pos_kitchen"` and `expose: "./pages/kitchen"` ships the kitchen display, sharing the same `container`.

### `frontend/src/pages/register.tsx`

```tsx
import { useEffect, useState } from 'react'
import { useApi, useCapabilities } from '@asteby/metacore-runtime-react'
import type { FullPageProps } from '@asteby/metacore-sdk'

export default function RegisterPage({ api, exit }: FullPageProps) {
  const http = useApi()
  const { has } = useCapabilities()
  const [tickets, setTickets] = useState<Ticket[]>([])

  useEffect(() => {
    http.get('/data/pos_register/tickets?state=open').then(r => setTickets(r.data.data))
  }, [])

  async function pay(id: string) {
    if (!has('db:write', 'addon_pos_register.tickets')) return
    await http.post(`/data/pos_register/tickets/${id}/action/pay`)
    api.event.publish('pos.ticket.paid', { id })
    setTickets(prev => prev.filter(t => t.id !== id))
  }

  return (
    <main className="h-screen w-screen bg-zinc-950 text-zinc-100 grid grid-cols-[2fr_1fr]">
      <TicketGrid tickets={tickets} onPay={pay} />
      <Sidebar onClose={exit} />
    </main>
  )
}
```

### What the user sees

- Open `https://app.example.com/addons/pos_register/register` → fullscreen cashier UI, no host header, no sidebar.
- Tap an "Open kitchen view" button on a separate iPad → loads `https://app.example.com/addons/pos_kitchen/kitchen` → fullscreen kitchen display, same federation bundle.
- Both pages still talk to the kernel via `useApi()`, still respect capability gates, still emit events the rest of the host can subscribe to.

## Interaction with `navigation[]`

A full-page addon can still declare a `navigation[]` entry — the entry should point at `/addons/<key>/<route>` so the host's sidebar (when visible elsewhere) can deep-link into the fullscreen surface:

```json
"navigation": [{
  "title": "sidebar.pos.register",
  "icon": "Cash",
  "items": [{
    "title": "sidebar.pos.register.open",
    "url":   "/addons/pos_register/register",
    "icon":  "Monitor"
  }]
}]
```

When the user clicks it, the host navigates to the chromeless route — same effect as visiting the URL directly.

## See also

- [`manifest-spec.md`](./manifest-spec#10-frontend) — the full `frontend{}` field reference.
- [`addon-cookbook.md`](./addon-cookbook#how-do-i-bundle-a-frontend-extension-with-my-addon) — the standard `./plugin` contract this convention layers onto.
- [`packages/sdk/src/federation.ts`](../packages/sdk/src/federation.ts) — the federation loader; full-page modules import through the same path.
- [`capabilities.md`](./capabilities) — capability gates still apply inside full-page routes; the chrome being absent does not relax permissions.
