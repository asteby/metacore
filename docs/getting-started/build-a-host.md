# Build a host

A **host** is a product that sits on top of the kernel and exposes installed addons to users. The two reference hosts are **link** (the operator panel) and **ops** (the marketplace and admin). You can build your own — a customer-facing portal, an internal tool, an embedded admin — using the same primitives.

This page is a recipe. The deep references for each layer live in the SDK and kernel docs.

[[toc]]

## What you're building

```
┌────────────────────────────────────────┐
│  your-host frontend                    │
│  Vite + React + @asteby/metacore-*     │
│  (auth UI, layout, your branding)      │
├────────────────────────────────────────┤
│  your-host backend                     │
│  Go binary embedding the kernel        │
│  (auth, billing, integrations)         │
├────────────────────────────────────────┤
│  metacore-kernel (library)             │
└────────────────────────────────────────┘
                  │
                  ▼
        installed addons (.mcbundle)
```

The host owns identity, layout, navigation shell, and any non-addon screens. The kernel owns runtime, persistence, permissions. Addons own features.

## Prerequisites

- **Node.js 20+** and **pnpm 10+** (frontend)
- **Go 1.22+** (backend)
- A database (Postgres for production)

## 1. Backend — embed the kernel

Start with the [embed-the-runtime](/getting-started/embed-the-runtime) recipe. A host backend is the same thing plus your auth middleware, your business endpoints, and any first-party addons compiled in.

```go
app, _ := host.NewApp(host.Config{
    DatabaseURL: os.Getenv("DATABASE_URL"),
    BundleDir:   "./bundles",
    Listen:      ":8080",
})

app.HTTP.Use(yourAuthMiddleware)              // sets kernel.Identity on ctx
app.HTTP.Mount("/api/auth", authRoutes(...))  // your own routes
app.Mount("/api", kernel.Router(app.Kernel))  // kernel under /api
app.Run()
```

For first-party features, register an embedded addon in code so it ships with the binary instead of as a `.mcbundle`:

```go
app.Kernel.RegisterAddon(builtins.Notifications())
```

## 2. Frontend — Vite + React + SDK

```bash
pnpm create vite my-host -- --template react-ts
cd my-host
pnpm add @asteby/metacore-runtime-react @asteby/metacore-runtime-core \
        @tanstack/react-query react-router-dom
```

Wire the runtime in `main.tsx`:

```tsx
import { MetacoreProvider } from '@asteby/metacore-runtime-react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import App from './App'

const queryClient = new QueryClient()

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={queryClient}>
    <MetacoreProvider config={{
      apiBase: '/api',
      wsUrl:   '/api/ws',
      auth:    { tokenProvider: () => sessionStorage.getItem('jwt') },
    }}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </MetacoreProvider>
  </QueryClientProvider>
)
```

The provider gives every descendant access to:

- **`useDynamicQuery`** / **`useDynamicMutation`** — the CRUD hooks.
- **`useAddons`** — list installed addons + their metadata.
- **`useCapabilities`** — what the current user can do.
- **`<DynamicTable>`** / **`<DynamicForm>`** / **`<DynamicDetail>`** — the typed UI primitives.
- **`<Slot>`** — render addon-provided React components.

## 3. The addon shell

Most hosts have a layout like this:

```tsx
import { useAddons } from '@asteby/metacore-runtime-react'
import { Routes, Route, NavLink } from 'react-router-dom'
import { AddonView } from './AddonView'

export default function App() {
  const { addons } = useAddons()

  return (
    <div className="layout">
      <nav>
        {addons.map(a => (
          <NavLink key={a.id} to={`/addons/${a.id}`}>{a.displayName}</NavLink>
        ))}
      </nav>
      <main>
        <Routes>
          <Route path="/addons/:addonId/*" element={<AddonView />} />
        </Routes>
      </main>
    </div>
  )
}
```

`<AddonView>` composes the addon's UI from its registered slots — most have a default `index` slot rendering a `<DynamicTable>` for the addon's primary table:

```tsx
import { useParams } from 'react-router-dom'
import { Slot, DynamicTable } from '@asteby/metacore-runtime-react'

export function AddonView() {
  const { addonId } = useParams()
  return (
    <Slot name={`${addonId}.index`} fallback={
      <DynamicTable addon={addonId!} table="default" />
    } />
  )
}
```

## 4. Tailwind, CSS, branding

The SDK ships its own design tokens (compatible with Tailwind v4). When using Tailwind, declare the SDK as a source so its utility classes survive purging:

```css
/* main.css */
@import "tailwindcss";
@source "../node_modules/@asteby/metacore-runtime-react";
```

This is one of the most-skipped steps; without it, addon UIs render with broken styles.

## 5. Auth + identity

The kernel stays neutral on auth. A host typically:

1. Hosts its own `/login` (email + password, OAuth, SSO — your call).
2. Issues a JWT or session.
3. Sends it on every request via the SDK's `tokenProvider`.
4. Verifies it in the backend middleware and sets `kernel.Identity` on the request context.

The kernel uses that identity for every CRUD call: capability checks, per-user permission checks, audit logging.

## 6. Production checklist

- HTTPS / TLS termination in front of the Go binary
- A real database (Postgres) with backups
- Bundle signing keys managed via your secret store
- Observability — the kernel exports OpenTelemetry traces out of the box
- Health checks (`/health`) and readiness probes
- Bundle directory mounted from persistent storage

## Reference hosts

| Host | Repo | What it does |
|---|---|---|
| **link** | private | Operator panel — how internal teams use installed addons |
| **ops** | private | Marketplace + admin — discovery, install, billing, audit |

Both are pure SDK consumers with their own auth + layout. Neither has any per-addon code.

## Related

- [Embed the runtime](/getting-started/embed-the-runtime) — backend half in detail.
- [Build an addon](/getting-started/build-an-addon) — what your host will run.
- [Hosts](/ecosystem/hosts) — the official hosts and their role.
- [SDK docs ↗](https://asteby.github.io/metacore-sdk/) — every component, every hook.
