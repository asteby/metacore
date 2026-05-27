# Build a host

A **host** is a product that sits on top of the kernel and exposes installed addons to users. Common shapes include an operator panel, a marketplace + admin surface, a customer-facing portal, an internal tool, or an embedded admin section inside an existing product. You build whichever fits your product — they all use the same primitives.

This page is a recipe. The fastest path is to start from the official starter and adjust; the deep references for each layer live in the SDK and kernel docs.

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
        installed addons
```

The host owns identity, layout, navigation shell, and any non-addon screens. The kernel owns runtime, persistence, permissions. Addons own features.

## Start from the official starter

The fastest way to a working host is the fullstack starter — `~50 LOC of Go` over `host.NewApp()` plus a React shell wired to the SDK:

```sh
npm create @asteby/metacore-app my-app -- --example fullstack-starter
cd my-app
docker compose up --build
```

This clones the `fullstack-starter` example, pins the latest published `@asteby/metacore-*` versions, and brings up `pgvector/pgvector:pg17` + the Go backend + the Vite frontend. Open http://localhost:5173 and sign in with the seeded admin. The rest of this page explains what that starter wires so you can reproduce it by hand or adapt it.

## Prerequisites

- **Node.js 20+** and **pnpm 10+** (frontend)
- **Go 1.25+** (backend)
- **PostgreSQL** (production)

## 1. Backend — embed the kernel

A host backend is the [embed-the-runtime](/getting-started/embed-the-runtime) recipe plus your auth and business endpoints. `host.NewApp(host.AppConfig{...})` returns the configured kernel; `app.Mount(fiberApp.Group("/api"))` wires every kernel route under `/api` and returns the group so you can hang your own routes off it. First-party models are registered in code with `app.RegisterModel(...)`; installed addons arrive as bundles.

## 2. Frontend — the SDK app shell

The starter's `main.tsx` bootstraps every provider with one component, `MetacoreAppShell` from `@asteby/metacore-app-providers` (QueryClient, the API client, PWA prompts, toaster, and metadata-cache invalidation), over a TanStack Router:

```tsx
import ReactDOM from 'react-dom/client'
import { RouterProvider } from '@tanstack/react-router'
import { MetacoreAppShell } from '@asteby/metacore-app-providers'
import { router, queryClient } from './router'
import { api } from './lib/api'
import './lib/i18n'
import './styles/index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <MetacoreAppShell api={api} queryClient={queryClient}>
    <RouterProvider router={router} />
  </MetacoreAppShell>,
)
```

The API client comes from the auth package — it sends the token and the active language so the kernel can localise metadata:

```tsx
// lib/api.ts
import { createApiClient } from '@asteby/metacore-auth/api-client'
import { useAuthStore } from '@asteby/metacore-auth/store'
import i18n from './i18n'

export const api = createApiClient({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:7200/api',
  getToken: () => useAuthStore.getState().auth.accessToken,
  getLanguage: () => i18n.language,
  onUnauthorized: () => useAuthStore.getState().auth.reset(),
})
```

The packages a typical host pulls in: `@asteby/metacore-runtime-react` (dynamic CRUD), `@asteby/metacore-auth`, `@asteby/metacore-app-providers`, `@asteby/metacore-ui` (layout shell, command menu, data-table primitives), `@asteby/metacore-theme`, `@asteby/metacore-i18n`, `@asteby/metacore-websocket`, `@asteby/metacore-notifications`, and optionally `@asteby/metacore-pwa`, `@asteby/metacore-billing`, `@asteby/metacore-marketplace`, `@asteby/metacore-webhooks`.

## 3. The dynamic page

Every model is a one-liner. The starter has a single dynamic route, `/_authenticated/m/$model`, that renders the kernel-driven CRUD page for whatever model is in the URL:

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { DynamicCRUDPage } from '@asteby/metacore-runtime-react'

export const Route = createFileRoute('/_authenticated/m/$model/')({
  component: () => <DynamicCRUDPage model={Route.useParams().model} />,
})
```

`DynamicCRUDPage` is the table + create/edit/view dialogs + actions, all driven by `/api/metadata/table/:model` and `/api/dynamic/:model`. The sidebar is built from the addon manifests' navigation contributions — `useNavigation` resolves the nav tree, gated per user. To contribute addon-provided React, render `<Slot name="..." />`.

## 4. Tailwind, CSS, branding

The SDK ships design tokens via `@asteby/metacore-theme` (Tailwind v4 preset, oklch tokens, dark mode). When consuming the SDK packages, declare them as Tailwind sources so their utility classes survive purging — otherwise addon UIs render unstyled:

```css
/* styles/index.css */
@import "tailwindcss";
@source "../node_modules/@asteby/metacore-runtime-react";
@source "../node_modules/@asteby/metacore-ui";
```

This is one of the most-skipped steps. The starter's `@asteby/metacore-starter-config` ships the shared Vite/Tailwind/TS config — including `metacoreOptimizeDeps`, which Vite needs to pre-bundle linked `@asteby/metacore-*` packages.

## 5. Auth + identity

The kernel stays neutral on auth. A host typically:

1. Hosts its own sign-in (`@asteby/metacore-auth` ships login/signup/forgot pages and guards for TanStack Router).
2. Issues a JWT or session.
3. Sends it on every request via the API client's `getToken`.
4. Verifies it in the backend; the kernel's `AuthUserProvider` resolves user/org/roles for every CRUD call.

## 6. Production checklist

- HTTPS / TLS termination in front of the Go binary
- A real database (Postgres) with backups
- Bundle signing keys managed via your secret store
- Observability — the kernel exposes `/api/metrics`
- Health checks and readiness probes
- Build the frontend with the right `VITE_API_URL` for the target (the appliance/relative-API gotcha bites here)

## Common host shapes

| Shape | What it does |
|---|---|
| **Operator panel** | How internal teams use installed addons day-to-day — lists, forms, dashboards, action buttons. |
| **Marketplace + admin** | Discovery, install, upgrade, billing, audit, configuration of addons. |
| **Customer-facing portal** | End-user surface, often with marketing copy and a more constrained layout than an operator panel. |
| **Embedded admin** | A "settings" or "admin" section in an existing SaaS that picks up addons without per-section code. |
| **Per-vertical UX** | A layout tailored to a domain — healthcare, fintech, logistics, etc. |

Whichever shape you build, the host is a pure SDK consumer with its own auth + layout. It has no per-addon code.

## Related

- [Embed the runtime](/getting-started/embed-the-runtime) — backend half in detail.
- [Build an addon](/getting-started/build-an-addon) — what your host will run.
- [Hosts](/ecosystem/hosts) — host shapes and patterns.
- [SDK docs ↗](https://asteby.github.io/metacore-sdk/) — every component, every hook.
