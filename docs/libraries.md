---
title: SDK Libraries
---

# The Metacore SDK suite

A cohesive set of TypeScript packages under the `@asteby/metacore-*` scope — every one rendering the same kernel metadata into a typed, real-time, multi-tenant experience. Pick the runtime, drop in the shell, add the surfaces you need. Versions below are the current published releases.

::: tip One command to start
`npm create @asteby/metacore-app my-app -- --example fullstack-starter` wires the whole suite for you. The breakdown below is for when you want to reach for a package directly.
:::

[[toc]]

## Runtime & rendering

The core that turns `/api/metadata/table/:model` + `/api/dynamic/:model` into UI.

| Package | Ver. | What it does |
|---|---|---|
| `@asteby/metacore-runtime-react` | <Badge type="tip" text="11.0.0" /> | React runtime — renders addon contributions dynamically (`<DynamicTable>`, `<DynamicForm>`, `<DynamicCRUDPage>`, `<Slot>`, hooks). |
| `@asteby/metacore-sdk` | <Badge type="tip" text="2.6.0" /> | Frontend SDK — federated addon loader, slot registry, typed manifest & API client. |
| `@asteby/metacore-lib` | <Badge type="tip" text="0.4.0" /> | Utilities — date/currency/number formatting, error handling, cookies. |

```bash
pnpm add @asteby/metacore-runtime-react @asteby/metacore-sdk
```

```tsx
import { DynamicCRUDPage } from '@asteby/metacore-runtime-react'

export const ModelPage = ({ model }: { model: string }) => <DynamicCRUDPage model={model} />
```

## UI, theme & i18n

The look and the words.

| Package | Ver. | What it does |
|---|---|---|
| `@asteby/metacore-ui` | <Badge type="tip" text="2.0.1" /> | UI kit — data-table, layout shell, command menu, shadcn-based primitives. |
| `@asteby/metacore-theme` | <Badge type="tip" text="2.0.0" /> | Design tokens + Tailwind 4 preset (oklch, shadows, fonts, dark mode). |
| `@asteby/metacore-i18n` | <Badge type="tip" text="6.0.0" /> | i18next factory, base ES/EN bundles, language switcher, RTL provider. |

```css
/* Declare SDK packages as Tailwind sources so their classes survive purging */
@import "tailwindcss";
@source "../node_modules/@asteby/metacore-ui";
```

## App shell & providers

Bootstrap an app in one component.

| Package | Ver. | What it does |
|---|---|---|
| `@asteby/metacore-app-providers` | <Badge type="tip" text="7.0.2" /> | `MetacoreAppShell` + transport-agnostic providers (platform-config, layout, search, direction, font). |
| `@asteby/metacore-starter-core` | <Badge type="tip" text="11.0.0" /> | Shared providers, stores, hooks and context consumed by Vite+React host apps. |

```tsx
import { MetacoreAppShell } from '@asteby/metacore-app-providers'

<MetacoreAppShell api={api} queryClient={queryClient}>
  <RouterProvider router={router} />
</MetacoreAppShell>
```

## Auth

| Package | Ver. | What it does |
|---|---|---|
| `@asteby/metacore-auth` | <Badge type="tip" text="7.1.0" /> | Auth kit — Zustand store, API client factory, login/signup/forgot pages, guards for TanStack Router. |

```tsx
import { createApiClient } from '@asteby/metacore-auth/api-client'
import { useAuthStore } from '@asteby/metacore-auth/store'

export const api = createApiClient({
  baseURL: '/api',
  getToken: () => useAuthStore.getState().auth.accessToken,
})
```

## Realtime, webhooks & notifications

| Package | Ver. | What it does |
|---|---|---|
| `@asteby/metacore-websocket` | <Badge type="tip" text="0.4.0" /> | WebSocket provider — auto-reconnect, typed messages, channel subscriptions. |
| `@asteby/metacore-notifications` | <Badge type="tip" text="7.0.0" /> | Notification dropdown, app badge, WebSocket-driven real-time updates. |
| `@asteby/metacore-webhooks` | <Badge type="tip" text="6.0.0" /> | Webhooks management UI — list, create, logs, test/replay, signing secrets. |

```bash
pnpm add @asteby/metacore-websocket @asteby/metacore-notifications
```

## PWA, billing & marketplace

| Package | Ver. | What it does |
|---|---|---|
| `@asteby/metacore-pwa` | <Badge type="tip" text="0.3.1" /> | PWA helpers — Vite plugin wrapper, install/update prompts, push notifications, offline indicator. |
| `@asteby/metacore-billing` | <Badge type="tip" text="0.2.0" /> | Subscription state, Stripe checkout/portal hooks, and the `BillingSettings` UI. |
| `@asteby/metacore-marketplace` | <Badge type="tip" text="0.1.0" /> | Hub catalog + install/upgrade client, React hooks, headless UI for addon discovery. |

```tsx
import { MarketplaceClient } from '@asteby/metacore-marketplace'
```

## Tooling, CLI & starter

| Package | Ver. | What it does |
|---|---|---|
| `@asteby/metacore-tools` | <Badge type="tip" text="4.0.0" /> | TypeScript client for the kernel's Tools runtime (LLM-triggered tools). |
| `@asteby/metacore-starter-config` | <Badge type="tip" text="2.2.1" /> | Shared Vite + Tailwind 4 + TanStack Router + ESLint + TS config (incl. `metacoreOptimizeDeps`). |
| `@asteby/metacore-starter-monaco` | <Badge type="tip" text="0.2.0" /> | Opt-in Monaco editor wrapper — keeps the ~2 MB bundle out of apps that don't embed an editor. |
| `@asteby/create-metacore-app` | <Badge type="tip" text="0.5.1" /> | `npm create @asteby/metacore-app` — scaffolds a full host from an example. |
| `@asteby/create-metacore-addon` | <Badge type="tip" text="0.1.0" /> | Scaffolds a new addon project. |

The addon build CLI is the **Go `metacore` tool**:

```bash
go install github.com/asteby/metacore-sdk/cli@latest
metacore init my-addon   # then: validate · build · sign · publish
```

## Federation primitives

When an addon ships bespoke UI, the host loads it at runtime — no rebuild. The real entry points:

```tsx
import {
  loadFederatedAddon,        // load a federated remote at runtime
  registerActionComponent,   // register a custom modal/component for an action
  getActionComponent,        // resolve a registered action component
} from '@asteby/metacore-runtime-react'
```

::: info Versions move fast
Renovate keeps every `@asteby/metacore-*` dependency on the latest patch/minor automatically — the versions above are a point-in-time snapshot. The [SDK docs](https://asteby.github.io/metacore-sdk/) track the live numbers and full API.
:::

## Where to go next

- [Announcing v3](/v3) — the contract these packages render.
- [Build a host](/getting-started/build-a-host) — wire the suite into an app.
- [SDK docs ↗](https://asteby.github.io/metacore-sdk/) — every package, every export.
