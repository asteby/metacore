# SDK

[`asteby/metacore-sdk`](https://github.com/asteby/metacore-sdk) is the TypeScript half of Metacore: the manifest schema, the bundle format, the React runtime, the CLI, and a set of UI primitives that read kernel metadata and render typed components.

## What it provides

The SDK ships **16 npm packages** under the `@asteby/metacore-*` scope. They split along three axes:

### Contracts

| Package | What it is |
|---|---|
| `@asteby/metacore-manifest` | The manifest schema (Zod), validators, types |
| `@asteby/metacore-bundle` | Bundle format, signing, verification |
| `@asteby/metacore-types` | Shared TypeScript types used across the runtime and the CLI |

### Runtime (browser)

| Package | What it is |
|---|---|
| `@asteby/metacore-runtime-core` | Framework-agnostic client: HTTP, WebSocket, query layer |
| `@asteby/metacore-runtime-react` | React bindings: provider, hooks, `<DynamicTable>`, `<DynamicForm>` and friends |
| `@asteby/metacore-forms` | Form primitives + the dynamic form renderer |
| `@asteby/metacore-tables` | Table primitives + the dynamic table renderer |
| `@asteby/metacore-dialogs` | Modal / drawer primitives wired to action / confirm flows |
| `@asteby/metacore-navigation` | Sidebar / breadcrumb / route helpers driven by addon metadata |
| `@asteby/metacore-charts` | Chart primitives consuming dynamic-CRUD aggregations |
| `@asteby/metacore-icons` | Icon set used by the rest of the SDK |
| `@asteby/metacore-theme` | Design tokens, dark mode, Tailwind v4 source export |
| `@asteby/metacore-i18n` | Translation helpers; addons declare strings, the runtime resolves them |
| `@asteby/metacore-realtime` | WebSocket subscription helpers, used by the React hooks |

### Authoring

| Package | What it is |
|---|---|
| `@asteby/metacore-cli` | The `metacore-sdk` command — scaffold, build, sign, publish addons |
| `@asteby/metacore-test-utils` | Test harnesses for addons (mock kernel, fixture data) |

(Exact package count + names track [the SDK docs](https://asteby.github.io/metacore-sdk/) — this table is a high-level inventory.)

## What you reach for

For most app builders, only two packages are direct dependencies:

```bash
pnpm add @asteby/metacore-runtime-react @asteby/metacore-runtime-core
```

Everything else is a transitive dep, reached through the runtime's exports.

## CLI quickstart

```bash
pnpm dlx @asteby/metacore-cli init my-addon --template=basic
pnpm metacore-sdk build
pnpm metacore-sdk install ./dist/my-addon-0.1.0.mcbundle --host=http://localhost:8080
```

See [Build an addon](/getting-started/build-an-addon) for the full walkthrough.

## Stack

- **TypeScript 5.5+**
- **React 18+**
- **Zod** for runtime schema validation
- **TanStack Query** under the hood for data fetching
- **Vite** as the reference build tool for hosts (the SDK itself is framework-agnostic at the core layer)
- **Tailwind v4** compatible — the theme package exports `@source` directives

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
