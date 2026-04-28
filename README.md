# Metacore

The front door to the Metacore platform — an open-source runtime + SDK for declarative, multi-tenant addons.

This repo holds the source for the portal site at **https://asteby.github.io/metacore/**. It is documentation only; the actual code lives in:

- [`asteby/metacore-kernel`](https://github.com/asteby/metacore-kernel) — the Go runtime that executes addons (WASM sandbox, dynamic CRUD, permissions, lifecycle, websockets).
- [`asteby/metacore-sdk`](https://github.com/asteby/metacore-sdk) — the npm packages and CLI used to declare addons and render their UI.
- [`metacore-sdk/examples/fullstack-starter`](https://github.com/asteby/metacore-sdk/tree/main/examples/fullstack-starter) — the official fullstack starter (Go + React) that wires kernel and SDK together. Spin up your own product with `npm create @asteby/metacore-app my-app -- --example fullstack-starter`.

## Repo layout

```
docs/
├── .vitepress/         VitePress config + custom theme
├── public/             Static assets (logo, etc.)
├── index.md            Home
├── why.md              Why Metacore
├── architecture.md     Four-layer architecture
├── getting-started/    Role-based entry points
├── concepts/           Manifest, CRUD, permissions, lifecycle, glossary
└── ecosystem/          Kernel, SDK, hosts
```

## Local development

```bash
pnpm install
pnpm dev           # http://localhost:5173
pnpm build         # static site to docs/.vitepress/dist
pnpm preview       # serve the production build
```

## Deploy

Pushes to `main` trigger `.github/workflows/deploy.yml`, which builds the site and publishes it to GitHub Pages.

## Contributing

Edits to any page are welcome — every page links directly to its source on GitHub via the "Edit this page" footer link. For larger contributions open a PR.

## License

Apache-2.0.
