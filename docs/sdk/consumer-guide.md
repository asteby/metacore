# Consumer Guide — integrating `@asteby/metacore-*`

Guide for apps that consume the Metacore SDK (Ops, Link, internal panels, third-party hosts). It covers installation, the mixed npm/`file:` development pattern, Vite + Tailwind 4 setup, deployment, and getting automatic updates via Renovate.

## Table of contents

- [1. Install packages](#1-install-packages)
- [2. Mount providers](#2-mount-providers)
- [3. Use the building blocks](#3-use-the-building-blocks)
- [3.1. Setting up `<DynamicTable>` in your app](#31-setting-up-dynamictable-in-your-app)
- [4. Mixed npm + `file:` pattern for local development](#4-mixed-npm--file-pattern-for-local-development)
- [5. Vite — `metacoreOptimizeDeps`](#5-vite--metacoreoptimizedeps)
- [6. Tailwind 4 — `@source` directives](#6-tailwind-4--source-directives)
- [7. Deploy](#7-deploy)
- [8. Renovate template](#8-renovate-template)
- [9. Manual upgrades](#9-manual-upgrades)

## 1. Install packages

All Metacore packages are published under the `@asteby` npm scope. Install only what you need — they are designed to be composable, not all-or-nothing.

```bash
pnpm add \
  @asteby/metacore-theme \
  @asteby/metacore-ui \
  @asteby/metacore-auth \
  @asteby/metacore-runtime-react \
  @asteby/metacore-i18n \
  @asteby/metacore-websocket \
  @asteby/metacore-notifications

pnpm add -D @asteby/metacore-starter-config
```

Peer dependencies (`react`, `react-dom`, TanStack libraries, Tailwind 4) should already be in your app. Packages declare them as peers so you do not get duplicated React instances.

| Package | Purpose |
| --- | --- |
| `@asteby/metacore-theme` | Design tokens, CSS variables, Tailwind 4 preset. |
| `@asteby/metacore-ui` | Headless + styled components (DataTable, layout shell, command menu, dialogs). |
| `@asteby/metacore-auth` | `AuthProvider`, `AuthGuard`, session hooks, sign-in/up pages. |
| `@asteby/metacore-runtime-react` | Root provider stack, capability gates, federated addon loader. |
| `@asteby/metacore-i18n` | i18next factory, base ES/EN bundles, language switcher, RTL. |
| `@asteby/metacore-websocket` | WebSocket provider with auto-reconnect and typed messages. |
| `@asteby/metacore-notifications` | Notifications dropdown + app badge wired to WebSocket. |
| `@asteby/metacore-starter-config` | Vite, TS, Tailwind, ESLint presets used by every host. |

## 2. Mount providers

Wrap your app once at the root. The exact tree depends on which packages you adopt; this is the canonical order for a full stack:

```tsx
// src/main.tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from '@tanstack/react-router'
import { I18nextProvider } from 'react-i18next'
import { DirectionProvider } from '@asteby/metacore-i18n'
import { AuthProvider } from '@asteby/metacore-auth'
import { WebSocketProvider } from '@asteby/metacore-websocket'

import { router } from './router'
import { i18n } from './i18n'
import './styles/app.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nextProvider i18n={i18n}>
      <DirectionProvider language={i18n.language}>
        <AuthProvider>
          <WebSocketProvider url={import.meta.env.VITE_WS_URL} getToken={getToken}>
            <RouterProvider router={router} />
          </WebSocketProvider>
        </AuthProvider>
      </DirectionProvider>
    </I18nextProvider>
  </StrictMode>,
)
```

Order matters: i18n outermost (so auth UI picks up translations), auth next (so queries and the WebSocket see the session), router innermost (so providers do not re-mount on navigation).

## 3. Use the building blocks

```tsx
import { DataTable, type ColumnDef } from '@asteby/metacore-ui'

type User = { id: string; name: string; email: string }

const columns: ColumnDef<User>[] = [
  { accessorKey: 'name', header: 'Name' },
  { accessorKey: 'email', header: 'Email' },
]

export function UsersPage({ data }: { data: User[] }) {
  return (
    <DataTable columns={columns} data={data} pagination selection />
  )
}
```

See each package's README for the full surface — [`packages/ui`](https://github.com/asteby/metacore-sdk/tree/main/packages/ui), [`packages/auth`](https://github.com/asteby/metacore-sdk/tree/main/packages/auth), [`packages/runtime-react`](https://github.com/asteby/metacore-sdk/tree/main/packages/runtime-react), and so on.

## 3.1. Setting up `<DynamicTable>` in your app

`<DynamicTable model="..." />` is the centerpiece of the runtime: one component renders a full CRUD surface from kernel-served metadata. Three providers must be mounted before it works.

```tsx
// src/main.tsx — extension of the tree above
import { ApiProvider, CapabilityProvider } from '@asteby/metacore-runtime-react'
import { api } from './lib/api'                  // your axios instance

createRoot(document.getElementById('root')!).render(
  <I18nextProvider i18n={i18n}>
    <DirectionProvider language={i18n.language}>
      <AuthProvider>
        <ApiProvider client={api}>
          <CapabilityProvider capabilities={session.capabilities}>
            <WebSocketProvider url={import.meta.env.VITE_WS_URL} getToken={getToken}>
              <RouterProvider router={router} />
            </WebSocketProvider>
          </CapabilityProvider>
        </ApiProvider>
      </AuthProvider>
    </DirectionProvider>
  </I18nextProvider>,
)
```

Then mount the table on any route:

```tsx
// src/routes/tickets.tsx
import { DynamicTable } from '@asteby/metacore-runtime-react'

export function TicketsPage() {
  return <DynamicTable model="tickets" />
}
```

If the `i18n` instance is missing the `datatable.*` and `common.*` keys the runtime uses, headers and pagination labels render as raw keys. Either copy the key list from [`packages/ui/README.md`](https://github.com/asteby/metacore-sdk/tree/main/packages/ui#i18n) into your bundles or pre-translate column labels in a custom `getDynamicColumns` factory.

For a deep dive on every prop, custom cell renderers, capability gating, action dispatchers and the metadata cache, see [`dynamic-ui.md`](./dynamic-ui).

## 4. Mixed npm + `file:` pattern for local development

Most consumer apps install Metacore packages from npm and let Renovate keep them in sync. A few packages — typically the ones under active iteration — are consumed via `file:` references against a sibling `metacore-sdk` clone so changes propagate without a publish round-trip:

```jsonc
// package.json
{
  "dependencies": {
    "@asteby/metacore-theme": "^0.3.0",
    "@asteby/metacore-ui": "^0.6.0",
    "@asteby/metacore-auth": "^4.0.0",

    "@asteby/metacore-runtime-react": "file:../metacore-sdk/packages/runtime-react",
    "@asteby/metacore-tools": "file:../metacore-sdk/packages/tools"
  }
}
```

When using `file:`:

- The depended-on package's `dist/` must be **built locally** — it is gitignored. Run `pnpm --filter @asteby/metacore-runtime-react build` inside `metacore-sdk` before installing.
- pnpm symlinks the dependency, so a rebuild in `metacore-sdk` is reflected immediately in the consumer.
- Always pin a sibling clone path (`../metacore-sdk/...`) — relative paths are stable across machines if every contributor lays out their workspace the same way.

Move a package back to npm semver range as soon as a release lands. Long-lived `file:` refs drift and cause "works on my machine" CI failures.

## 5. Vite — `metacoreOptimizeDeps`

Vite's dependency pre-bundler does not crawl `file:` packages by default, which produces stale chunks and inconsistent React instances when SDK packages re-export each other. `@asteby/metacore-starter-config` (>= 0.3.0) ships a helper that wires this up correctly:

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import tailwindcss from '@tailwindcss/vite'
import { metacoreOptimizeDeps } from '@asteby/metacore-starter-config/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  optimizeDeps: metacoreOptimizeDeps(),
  resolve: {
    alias: { '@': new URL('./src', import.meta.url).pathname },
  },
})
```

`metacoreOptimizeDeps()` returns a Vite `OptimizeDepsOptions` object that includes every `@asteby/metacore-*` package and forces React to a single instance. If you also use `defineMetacoreConfig()` from the same package, this is applied for you.

## 6. Tailwind 4 — `@source` directives

Tailwind 4 scans your app's `content` glob to decide which utilities ship to the bundle. Because the SDK packages live under `node_modules/`, their classes are skipped by default and your build silently misses styles (most visibly: `DataTable`, command menu, layout shell). Declare the SDK packages as additional sources in your main stylesheet:

```css
/* src/styles/app.css */
@import '@asteby/metacore-theme/index.css';

@source "../../node_modules/@asteby/metacore-ui/dist/**/*.{js,mjs}";
@source "../../node_modules/@asteby/metacore-runtime-react/dist/**/*.{js,mjs}";
@source "../../node_modules/@asteby/metacore-auth/dist/**/*.{js,mjs}";
@source "../../node_modules/@asteby/metacore-notifications/dist/**/*.{js,mjs}";
@source "../../node_modules/@asteby/metacore-webhooks/dist/**/*.{js,mjs}";
```

Adjust the relative path to match your repo layout. Add a `@source` line for every SDK package whose components you render. Without this, classes like `bg-primary` or `data-[state=open]` from SDK components are pruned and your UI looks unstyled in production.

## 7. Deploy

If you use only npm-published packages, your build is a vanilla `pnpm install && pnpm build`.

If your app uses any `file:` references, the SDK packages must be built **before** the consumer's bundler runs. Two patterns:

**Turbo monorepo (recommended).** Add `metacore-sdk` to your workspace and let Turbo resolve build order:

```jsonc
// turbo.json (root)
{
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**"]
    }
  }
}
```

```bash
turbo build --filter=my-app
```

Turbo builds the upstream SDK packages first, then the app.

**External clone.** If the SDK is a sibling clone (not a workspace member), build the relevant packages in your CI before installing the app:

```yaml
- run: pnpm --filter @asteby/metacore-runtime-react... -C ../metacore-sdk build
- run: pnpm install --frozen-lockfile=false
- run: pnpm build
```

The Asteby `link` repo's GitHub Actions workflow is a working reference for this pattern.

## 8. Renovate template

Once Metacore publishes a new version, your app should pick it up without anyone filing an issue. Drop [`renovate-consumer-template.json`](./renovate-consumer-template.json) at the root of your consumer repo as `renovate.json`:

```bash
curl -o renovate.json \
  https://raw.githubusercontent.com/asteby/metacore-sdk/main/docs/renovate-consumer-template.json
```

Then commit it. Make sure the [Renovate GitHub App](https://github.com/apps/renovate) is installed on your repo.

What this gives you:

- **Patch / minor bumps** of any `@asteby/metacore-*` package: Renovate opens a PR and auto-merges once CI is green (`automerge: true` + `platformAutomerge: true`). Lands within minutes of publish.
- **Major bumps**: Renovate opens a PR and assigns your reviewer of choice (change `@tech-lead` in the template). Review, run the app, merge manually.
- **Schedule `at any time`**: Metacore updates flow continuously — no Monday batching.

You can extend the template with app-specific rules. Keep the `@asteby/metacore-*` rules intact so propagation stays predictable across all consumer apps.

## 9. Manual upgrades

If you need a specific version before Renovate picks it up:

```bash
pnpm up "@asteby/metacore-*@latest"
```

Or for a pre-release channel:

```bash
pnpm up "@asteby/metacore-*@next"
```

See [`publishing.md`](./publishing) for channel semantics.
