<p align="center">
  <img src="/logo.svg" width="120" alt="Metacore" />
</p>

<h1 align="center">Federated pages</h1>

<p align="center">
  <strong>Embedded (inside the host chrome) and full-screen pages served by an addon's federated remote: <code>frontend.pages[]</code>, <code>definePage</code>, host hooks, isolation and budgets.</strong>
</p>

> **Declarative first.** A page is level D/E of the UI spectrum. Before writing
> one, check that a declarative view (`view_type` map, timeline, calendar,
> chart, split) or a detail panel cannot express the screen — those cost
> **0 KB** of addon JavaScript. See [`declarative-views.md`](./declarative-views).

| Level | What | Addon JS | Manifest |
|---|---|---|---|
| A | Declarative view | 0 | `NavItem.view_type` + `view` |
| B | Detail panel | 0 | `models[].detail.panels[]` |
| C | Custom panel | that piece | panel `kind: custom` + `expose` |
| **D** | **Embedded page** | one route, ≤ 150 KB gzip | `frontend.pages[]`, `layout: shell` |
| **E** | **Full-screen page** | the app | `frontend.pages[]`, `layout: immersive` |

The kernel contract (validation, host capabilities, lite manifest) lives in
the kernel's `docs/ui-pages-and-views.md`; the types used below
(`FrontendPage`, …) are generated from it (`pnpm codegen`).

## Manifest

```jsonc
"frontend": {
  "entry": "/api/metacore/addons/shipping/frontend/remoteEntry.js",
  "format": "federation",                 // required with pages[]
  "container": "metacore_shipping",
  "expose": "./register",                 // headless: actions, slots, modals
  "layout": "shell",                      // default layout of the pages
  "load": "route",
  "sdk": "^3.15.0",                       // stamped by `metacore build`
  "integrity": "sha384-…",                // stamped by `metacore build`
  "pages": [{
    "key": "control_tower",
    "path": "control-tower",              // /a/shipping/control-tower(/*)
    "expose": "./pages/control-tower",
    "layout": "shell",                    // shell = embedded | immersive = full screen
    "title": "shipping.pages.control_tower",
    "icon": "Map",
    "permission": "shipping.shipment.read",
    "requires": [{ "model": "Shipment", "actions": ["index"] }],
    "shares": ["@asteby/metacore-maps"],  // closed set, see federation.md
    "budget_kb": 120,                     // gzip, shares excluded; ≤ 150
    "breadcrumbs": [{ "title": "shipping.nav.group" }]
  }]
}
```

A nav entry links to the page with `"url": "addon://shipping/control-tower"`.
The host resolves the mount point **before** downloading the remote:

| Effective layout | URL | Chrome |
|---|---|---|
| `shell` (page, else `frontend.layout`, else `shell`) | `/a/<addon>/<path>/*` | sidebar, header, breadcrumbs |
| `immersive` | `/addons/<addon>/<path>/*` | none (POS, kiosk, KDS) |

`resolveAddonUrl(url, manifest.frontend)` (SDK) implements it: longest page
path wins, the deep-link remainder and query are kept; without a matching page
the addon's `frontend.layout` decides (`shell` → embedded, otherwise the legacy
full-screen URL).

## Remote: writing a page

```tsx
// frontend/src/pages/control-tower.tsx — exposed as "./pages/control-tower"
import { definePage } from '@asteby/metacore-sdk/page'
import {
  useAddonNavigate, useAddonSearchParams, useBreadcrumbs,
  useHostApi, useHostContext, usePageChrome,
} from '@asteby/metacore-runtime-react'

export default definePage(function ControlTower({ basePath, params, page }) {
  const api = useHostApi()                       // authenticated, no token exposed
  const { org, user, locale, branch } = useHostContext()
  const navigate = useAddonNavigate()            // relative to basePath
  const [search, setSearch] = useAddonSearchParams()
  usePageChrome({ title: 'Torre de envíos', focus: true,
    actions: [{ key: 'refresh', label: 'Actualizar', icon: 'RefreshCw', onSelect: refetch }] })
  useBreadcrumbs([{ title: 'Envíos', url: '/m/Shipment' }])
  // params['*'] is the deep link below basePath ("shipments/42")
  …
})
```

`AddonPageProps` = `{ host: AddonHostContext, basePath, params, page }`. The
expose's default export must be a component; `definePage` types and tags it.
No `register()` is needed for pages — the manifest is the registry.

| Hook | Gives the page |
|---|---|
| `useHostApi()` | `HostApi`: `get/post/put/patch/delete` (bodies only; `{ responseType: 'blob' }` returns a `Blob`), `q(path)` batched through `/q`, `capability(key, input)` |
| `useHostContext()` | `org {id,name,currency,timezone,taxLabel}`, `user`, `branch`, `locale`, `installedAddons`, `realtime` |
| `useAddonNavigate()` | `navigate('shipments/42')` → `<base>/shipments/42`; `./x`, `../x` relative; never escapes the base; `navigate(-1)` |
| `useAddonLocation()` / `useAddonSearchParams()` | path below the base and the query, through the host router |
| `useBreadcrumbs(crumbs)` | trail shown before the title; cleared on unmount |
| `usePageChrome({ title, subtitle, actions, focus })` | header title and buttons rendered by the host; `focus` asks the host to collapse its sidebar |

**Security rules.** The page never reads `localStorage`, cookies or the host
stores for credentials, and never uses `window.location` to navigate.
`HostApi` resolves to response bodies only and rejects with `HostApiError`
(`status`, `code`, `message`, server body) — never the transport error, whose
config carries the `Authorization` header. The addon's own backend is reached
through `contributions.api` routes on the host gateway (ops: `/gw/<path>`).

**Documents and downloads.** To print or save a PDF (ticket, invoice, CSV
export) ask for a blob; the host attaches the credentials, the page only gets
the bytes:

```ts
const pdf = await api.get<Blob>(`/data/WarehouseOrder/${id}/documents/picking_ticket.pdf`, { responseType: 'blob' })
const url = URL.createObjectURL(pdf)           // open in an iframe / window.print(), or <a download>
// ...later: URL.revokeObjectURL(url)
```

`responseType` is accepted by `get`, `post`, `put`, `patch` and `delete`. A
failed request still rejects with `HostApiError` (`code`/`message` are read
from the server's JSON error body); a successful response that is not binary
also rejects. In tests, `createMockHostApi({ get: { '/doc.pdf': new Blob([...]) } })`.

**Dependencies.** React, the router, react-query, i18n and the UI kit are host
singletons. Maps and charts can only come as lazy host shares listed in
`pages[].shares`; anything else is bundled into the page and counts against
`budget_kb`.

## Host: mounting a page

```tsx
import { pageMountPath, resolveAddonUrl } from '@asteby/metacore-sdk'
import {
  AddonPageLoader, createHostApi, createPageChromeStore, usePageChromeState,
} from '@asteby/metacore-runtime-react'

const hostApi = useMemo(() => createHostApi(axiosInstance), [])
const chrome = useMemo(createPageChromeStore, [])

<AddonPageLoader
  scope={frontend.container}
  url={withVersionParam(frontend.entry, manifestHash)}
  integrity={frontend.integrity}          // SRI verified before import
  addonKey={key}
  page={page}                             // FrontendPage from the manifest
  basePath={pageMountPath(key, page, frontend.layout)}
  host={hostContext}
  api={hostApi}
  location={{ pathname, search }}         // from the host router
  navigate={(to, o) => router.navigate({ to, replace: o?.replace })}
  chrome={chrome}                          // header: usePageChromeState(chrome)
  onError={(err, info) => reportFrontendIncident(err, info)}
/>
```

The loader downloads the page's expose through the Module Federation runtime,
times out after 10 s, paints a fixed-size skeleton meanwhile, and renders the
page inside:

- **`FederatedErrorBoundary`** — a crashing page shows a contained card with
  "Reintentar"; the shell and other addons keep working. Load failures
  (network, missing default export, integrity) use the same card, and retry
  re-runs the load. `AddonLoader` wraps its children in the same boundary
  (`onRenderError`).
- **`AddonPageHost`** — provides the hooks above.
- a container with `contain: layout paint; isolation: isolate` so the page
  cannot paint over the host chrome.

The host must not mount a page the viewer cannot open (`permission`,
`requires`): that 403 belongs to the shell, not to the remote.

### Integrity (SRI)

`frontend.integrity` (`sha384-…` of `remoteEntry.js`, stamped by `metacore
build`) is verified on the Module Federation path too
(`ensureRemoteIntegrity`): the loader injects `<link rel="modulepreload"
integrity crossorigin>` for the exact entry URL, so the browser checks the
hash and keeps the verified module for the runtime's `import()`. A mismatch
raises `RemoteIntegrityError` and is never retried; a network failure is. The
entry's chunks are content-hashed and covered by the hub signature.

## Build and packaging

```ts
// frontend/vite.config.ts
const manifest = '../manifest.json'
const exposes = { './register': './src/register.tsx', './pages/control-tower': './src/pages/control-tower.tsx' }
plugins: [
  federation({ ...metacoreFederationShared({ host: 'metacore_shipping', exposes, manifest }), dts: false }),
  metacorePageBudgetPlugin({ manifest, exposes, singletons: METACORE_FEDERATION_SINGLETONS }),
  metacoreFederationBudgetPlugin(),
]
```

- `metacoreFederationShared({ manifest })` fails when a page has no expose and
  declares its shares lazily.
- `metacorePageBudgetPlugin` fails the build over `budget_kb` and writes
  `dist/metacore-pages.json`.
- `metacore build` refuses to pack a page missing from that report or over
  budget, then stamps `frontend.sdk` (the SDK range the frontend was built
  against) and `frontend.integrity`, and re-validates the manifest.

## Scaffolding and tests

```bash
npx create-metacore-addon my-addon --template embedded-page
npx create-metacore-addon add view --type split --model Item my-addon   # declarative, 0 JS
```

```tsx
import { createMockHostApi, renderWithHost } from '@asteby/metacore-runtime-react/testing'
const api = createMockHostApi({ get: { '/gw/my_addon/summary': { cards: [] } } })
const { chrome, navigate } = renderWithHost(<Board {...props} />, { api, basePath: '/a/my_addon/board' })
```

## Migrating from the previous convention

The old `./pages/<slug>` regex on `frontend.expose` (one expose per manifest,
`FullPageProps`) was never implemented by the host and is replaced by
`frontend.pages[]` + `AddonPageProps`. `registerRoute` keeps working while
`pages[]` is empty; move each screen to a page entry and drop the route from
`register()`.
