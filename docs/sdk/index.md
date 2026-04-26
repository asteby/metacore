<p align="center">
  <img src="/logo.svg" width="120" alt="Metacore SDK" />
</p>

<h1 align="center">Metacore SDK</h1>

<p align="center"><em>The declarative addon framework — manifests, dynamic UI, and a typed runtime for building modular React hosts.</em></p>

The **Metacore SDK** is a TypeScript monorepo published as `@asteby/metacore-*` npm packages. You declare an addon in a `manifest.json`, and the SDK provides everything needed to render it inside a host app: a federated loader, a metadata-driven `<DynamicTable>`, an auth kit, an i18n bundle, a UI library, themes, real-time WebSocket plumbing, and a scaffolder that wires it all together.

## Quick links

- [Quickstart](./quickstart) — your first addon in 5 minutes.
- [Dynamic UI](./dynamic-ui) — every component the runtime ships, with props.
- [Cookbook](./addon-cookbook) — recipes for common patterns.
- [Manifest Spec](./manifest-spec) — every field of `manifest.json`.
- [Capabilities](./capabilities) — the declarative sandbox.
- [Consumer Guide](./consumer-guide) — wiring the SDK into a host app.
- [Publishing](./publishing) — npm release flow for the SDK packages.
- [WASM ABI](./wasm-abi) — when you need server-side logic with TinyGo.

## Packages

The SDK ships **16 packages** under the `@asteby` scope. Most apps consume `runtime-react`, `ui`, `auth`, `theme`, and `starter-config`; the rest are opt-in.

| Package | What it does |
|---|---|
| [`@asteby/metacore-sdk`](https://github.com/asteby/metacore-sdk/tree/main/packages/sdk) | Federated addon loader, slot registry, typed manifest and API client. |
| [`@asteby/metacore-runtime-react`](https://github.com/asteby/metacore-sdk/tree/main/packages/runtime-react) | React runtime — `<DynamicTable>`, `<DynamicModal>`, capability gates, action dispatcher. |
| [`@asteby/metacore-ui`](https://github.com/asteby/metacore-sdk/tree/main/packages/ui) | UI kit — data-table, layout shell, command-menu, hooks and shadcn primitives. |
| [`@asteby/metacore-auth`](https://github.com/asteby/metacore-sdk/tree/main/packages/auth) | Auth kit — Zustand store, API client factory, login/signup/forgot pages, route guards. |
| [`@asteby/metacore-theme`](https://github.com/asteby/metacore-sdk/tree/main/packages/theme) | Design tokens and Tailwind 4 preset (oklch, shadows, fonts, dark mode). |
| [`@asteby/metacore-i18n`](https://github.com/asteby/metacore-sdk/tree/main/packages/i18n) | i18next factory, base ES/EN bundles, language switcher, RTL provider. |
| [`@asteby/metacore-lib`](https://github.com/asteby/metacore-sdk/tree/main/packages/lib) | Utilities — date/currency/number formatting, error handling, cookies. |
| [`@asteby/metacore-app-providers`](https://github.com/asteby/metacore-sdk/tree/main/packages/app-providers) | Reusable providers (direction, font, layout, search). |
| [`@asteby/metacore-starter-core`](https://github.com/asteby/metacore-sdk/tree/main/packages/starter-core) | Shared providers, stores, hooks and context consumed by every Vite+React app. |
| [`@asteby/metacore-starter-config`](https://github.com/asteby/metacore-sdk/tree/main/packages/starter-config) | Shared build/lint configs (Vite + React + Tailwind 4 + TanStack Router + ESLint + TS). |
| [`@asteby/metacore-websocket`](https://github.com/asteby/metacore-sdk/tree/main/packages/websocket) | WebSocket provider — auto-reconnect, typed messages, channel subscriptions. |
| [`@asteby/metacore-notifications`](https://github.com/asteby/metacore-sdk/tree/main/packages/notifications) | Notifications dropdown, app badge, WebSocket-driven real-time updates. |
| [`@asteby/metacore-webhooks`](https://github.com/asteby/metacore-sdk/tree/main/packages/webhooks) | Webhooks management UI — list, create, logs, test/replay, signing secrets. |
| [`@asteby/metacore-pwa`](https://github.com/asteby/metacore-sdk/tree/main/packages/pwa) | PWA helpers — vite plugin wrapper, install/update prompts, push notifications, offline indicator. |
| [`@asteby/metacore-tools`](https://github.com/asteby/metacore-sdk/tree/main/packages/tools) | TypeScript client for the kernel Tools runtime — execution, registration, client-side validation. |
| [`create-metacore-app`](https://github.com/asteby/metacore-sdk/tree/main/packages/create-metacore-app) | Scaffolder. `npx create-metacore-app my-app`. |

## Repository

Source, issues and releases live at [`asteby/metacore-sdk`](https://github.com/asteby/metacore-sdk). The SDK is Apache-2.0.

## Pair with the kernel

The SDK speaks the metadata contract served by the [Metacore Kernel](/kernel/). One repo declares the contract, the other enforces it — both ship independently.
