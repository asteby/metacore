# SDK

[`asteby/metacore-sdk`](https://github.com/asteby/metacore-sdk) is the TypeScript half of Metacore: the manifest schema, the bundle format, the React runtime, the CLI, and a set of UI primitives that read kernel metadata and render typed components.

## What it provides

The SDK publishes a set of packages under the `@asteby/metacore-*` scope, plus the addon CLI. They split along a few axes:

### Runtime & rendering

| Package | What it is |
|---|---|
| `@asteby/metacore-runtime-react` | The core: dynamic CRUD rendering — `<DynamicTable>`, `<DynamicForm>`, `<DynamicCRUDPage>`, `<Slot>`, federated addon loader, capability gate, hooks (`useApi`, `useMetadataCache`, `useNavigation`, `useOptions`, `useCapabilities`) |
| `@asteby/metacore-sdk` | Frontend SDK: federated addon loader, slot registry, typed manifest & API client |
| `@asteby/metacore-ui` | UI kit — data-table, layout shell, command menu, shadcn-based primitives |
| `@asteby/metacore-theme` | Design tokens + Tailwind v4 preset (oklch, shadows, fonts, dark mode) |
| `@asteby/metacore-i18n` | i18next factory, base ES/EN bundles, language switcher, RTL provider |
| `@asteby/metacore-lib` | Utilities — date/currency/number formatting, error handling, cookies |

### App shell & integrations

| Package | What it is |
|---|---|
| `@asteby/metacore-app-providers` | `MetacoreAppShell` + transport-agnostic providers (platform-config, layout, search, direction, font) |
| `@asteby/metacore-starter-core` | Shared providers, stores, hooks and context consumed by Vite+React host apps |
| `@asteby/metacore-auth` | Auth kit — store, API client factory, login/signup/forgot pages, TanStack Router guards |
| `@asteby/metacore-websocket` | WebSocket provider — auto-reconnect, typed messages, channel subscriptions |
| `@asteby/metacore-notifications` | Notification dropdown, app badge, WebSocket-driven updates |
| `@asteby/metacore-pwa` | PWA helpers — Vite plugin, install/update prompts, push, offline indicator |
| `@asteby/metacore-webhooks` | Webhooks management UI — list, create, logs, test/replay, signing secrets |
| `@asteby/metacore-billing` | Subscription state, Stripe checkout/portal hooks, billing settings UI |
| `@asteby/metacore-marketplace` | Hub catalog + install/upgrade client, hooks, headless UI for addon discovery |
| `@asteby/metacore-tools` | TypeScript client for the kernel's Tools runtime (LLM-triggered tools) |

### Build & authoring

| Package | What it is |
|---|---|
| `@asteby/create-metacore-app` | `npm create @asteby/metacore-app` — scaffolds a full host from an example (e.g. `fullstack-starter`) |
| `@asteby/metacore-starter-config` | Shared Vite + Tailwind 4 + TanStack Router + ESLint + TS config, incl. `metacoreOptimizeDeps` |

The addon CLI itself is the **Go `metacore` tool** (`go install github.com/asteby/metacore-sdk/cli@latest`) — `init`, `validate`, `build`, `sign`, `publish`. (Exact versions + names track [the SDK docs](https://asteby.github.io/metacore-sdk/) — this is a high-level inventory.)

## What you reach for

A host app frontend depends on the runtime plus the shell:

```bash
pnpm add @asteby/metacore-runtime-react @asteby/metacore-app-providers \
         @asteby/metacore-auth @asteby/metacore-ui @asteby/metacore-theme
```

Or skip the manual wiring entirely and scaffold from the starter — `npm create @asteby/metacore-app my-app -- --example fullstack-starter`.

## Scaffold a host

```bash
npm create @asteby/metacore-app my-app -- --example fullstack-starter
cd my-app
docker compose up --build
```

See [Build a host](/getting-started/build-a-host) for what it wires, and [Build an addon](/getting-started/build-an-addon) for the addon authoring loop.

## Stack

- **TypeScript 5.x**
- **React 18+** (the published packages run on React 19)
- **TanStack Query** + **TanStack Router** + **TanStack Table** under the hood
- **Zod** for runtime schema validation
- **Vite** as the reference build tool for hosts (the core is framework-agnostic)
- **Tailwind v4** — the theme package ships a preset and you declare SDK packages via `@source`

## Where the deep documentation lives

The SDK ships its own VitePress docs site with:

- Full manifest spec (every field, every column type, every validator)
- Every package's API reference (TypeDoc-generated)
- Every component's props
- Every hook's signature
- Recipes (forms, tables, navigation, real-time, custom slots)

[SDK docs ↗](https://asteby.github.io/metacore-sdk/)

## Repository

- **GitHub:** [github.com/asteby/metacore-sdk](https://github.com/asteby/metacore-sdk)
- **License:** Apache-2.0
- **Releases:** Changesets-based; npm publish on merged version PRs; TypeDoc → Pages

## Related

- [Architecture](/architecture) — where the SDK fits.
- [Kernel](/ecosystem/kernel) — the server side of the SDK's API.
- [Build an addon](/getting-started/build-an-addon) — quickstart.
- [Build a host](/getting-started/build-a-host) — using the SDK as a host frontend.
