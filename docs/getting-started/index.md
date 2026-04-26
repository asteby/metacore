# Pick your path

Metacore is two pieces that meet in the middle. Where you start depends on what you're building.

[[toc]]

## Three roles, three quickstarts

<a class="role-card" href="/metacore/getting-started/build-an-addon">
<strong>Build an addon →</strong>
You're shipping a feature — tickets, inventory, content blocks, whatever. You write a <code>manifest.json</code>, optionally some Go for custom logic, and the SDK builds and signs a <code>.mcbundle</code>. Drop it on any host running the kernel.
</a>

<a class="role-card" href="/metacore/getting-started/embed-the-runtime">
<strong>Embed the runtime →</strong>
You have a Go service and want to add modular CRUD without writing the plumbing. Import the kernel as a library, mount its routes under a path, you're done.
</a>

<a class="role-card" href="/metacore/getting-started/build-a-host">
<strong>Build a host →</strong>
You want a product like link or ops — a frontend that picks up any installed addon and renders it. Vite + React + the SDK on top, kernel on the bottom.
</a>

## Not sure?

Match your problem to a path:

| You want to... | Start here |
|---|---|
| Add a new resource (with CRUD UI) to an existing Metacore-powered app | [Build an addon](/getting-started/build-an-addon) |
| Add modular CRUD to a Go backend that doesn't have it yet | [Embed the runtime](/getting-started/embed-the-runtime) |
| Build the operator surface, the marketplace surface, or anything that hosts addons | [Build a host](/getting-started/build-a-host) |
| Just understand the platform | Read [Architecture](/architecture), then come back |
| Evaluate vs Retool / Refine / Directus | Read [Why Metacore](/why) |

## What every path needs

- **Node.js 20+** and **pnpm 10+** for the SDK and any host frontend.
- **Go 1.22+** for the kernel and any host backend.
- **A database.** Postgres for production, SQLite is fine for local development. The kernel handles both.
- **No SaaS account.** Metacore runs entirely on your infrastructure.

## Where the deep docs live

This portal stops where the per-tool docs begin. For everything detailed — every manifest field, every React component, every kernel subsystem — the link points you to the right repo's documentation site:

- [SDK docs](https://asteby.github.io/metacore-sdk/) — manifest spec, every package, every component.
- [Kernel docs](https://asteby.github.io/metacore-kernel/) — embedding API, subsystem internals, security model.
