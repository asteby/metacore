# Hosts

A **host** is a product built on the kernel + SDK that exposes installed addons to users. The kernel runs the addons; the host is everything around them — auth, layout, branding, billing, anything not the addon's job.

Metacore deliberately does not ship a host. Hosts are where your product lives, and they vary by audience, vertical, and intent. This page explains what a host is, what shapes it can take, and what the kernel + SDK give you to build one.

[[toc]]

## The contract

Every host, regardless of shape, has the same three responsibilities:

1. **Embed the kernel.** A Go binary imports `metacore-kernel` and mounts its routes. Everything CRUD-shaped — list, get, create, update, delete, metadata, real-time — comes from the kernel.
2. **Render addon UIs.** A Vite + React frontend imports `@asteby/metacore-runtime-react` and uses `<DynamicTable>`, `<DynamicForm>`, `<DynamicDetail>`, and `<Slot>` to render whatever addons are installed.
3. **Provide identity, layout, and brand.** Auth, navigation shell, theming, and any non-addon screens (login, settings, billing, etc.).

Everything else — the per-addon screens, the schema, the permission checks, the lifecycle — is handled by the kernel and the SDK reading the manifest. A host has no per-addon code.

## Common host shapes

Hosts vary widely by audience and intent. Some patterns recur often enough to be worth naming:

### Operator panel

For internal teams using installed addons day-to-day: lists, forms, dashboards, action buttons. Operators log in, see the addons they have permission to use, click into one, and work with it.

Typical features specific to this shape:

- Identity + SSO integration with the operator's directory
- Standardized sidebar / breadcrumb / search layout
- Bulk operations across addon boundaries
- Saved views, favorites, recents

### Marketplace + admin

For the people responsible for which addons exist and how they're configured. Discovery, install, upgrade, billing, audit, and configuration of addons happen here.

Typical features specific to this shape:

- Bundle browser / search
- Install + upgrade + uninstall flows with diff preview
- Audit log explorer
- Permission management (roles, grants)
- Org / tenant administration
- Billing + entitlement (when applicable)

### Customer-facing portal

For end-users (not operators). Often paired with marketing copy, a more constrained surface area, and tighter branding than an internal panel. Typical for SaaS products that expose addon-driven features to their own customers.

### Embedded admin

A "settings" or "admin" section inside an existing product. The host application already exists; the Metacore-powered area is one more route. Useful when an existing SaaS wants modular CRUD without rewriting itself.

### Per-vertical UX

Healthcare, fintech, logistics, education, and other domains often have strong UX expectations — tabular, conversational, dashboard-heavy, document-centric. A host can be tailored to the vertical's conventions while still delegating every per-addon screen to the SDK.

## What every host gets for free

Independent of shape, the kernel + SDK provide:

- **Dynamic CRUD endpoints.** No handler code per resource.
- **Schema migrations.** Driven by the addon manifest, run by the installer.
- **Permission enforcement.** Capability checks and per-user resource permissions, applied at every call.
- **Lifecycle.** Hot install, upgrade, uninstall — no restart.
- **WASM sandbox.** Untrusted addon code runs isolated.
- **Real-time fanout.** WebSocket hub mounted automatically.
- **Typed UI primitives.** `<DynamicTable>`, `<DynamicForm>`, `<DynamicDetail>`, `<Slot>`, plus 12+ supporting packages (forms, dialogs, navigation, charts, theme, etc.).
- **Audit pipe.** Structured stream of every CRUD op, capability check, and permission decision.

A typical host is **400–800 lines** of code total: layout, navigation, auth screens, plus configuration. Everything else comes from the SDK + the kernel.

## What a host does *not* own

- **The data model.** That's the addon's manifest.
- **The CRUD endpoints.** The kernel mounts them.
- **The CRUD UI.** The SDK renders it.
- **The permission system.** The kernel enforces it.
- **The real-time fanout.** The kernel's hub handles it.

Hosts are deliberately thin. The leverage Metacore provides comes from *not* having to write these.

## Build one

The recipe is in [Build a host](/getting-started/build-a-host). Short version:

1. **Backend.** A Go binary that imports `metacore-kernel` and adds your auth + business endpoints.
2. **Frontend.** A Vite + React app that imports `@asteby/metacore-runtime-react` and renders addon UIs via `<DynamicTable>`, `<DynamicForm>` and `<Slot>`.
3. **Identity.** Your auth choice; inject `kernel.Identity` on every request via middleware.
4. **Brand.** The SDK's theme package exposes design tokens; override them to match your product.

## Related

- [Build a host](/getting-started/build-a-host) — full recipe.
- [Architecture](/architecture) — how hosts fit between the kernel and the surface.
- [Kernel](/ecosystem/kernel) — what hosts embed.
- [SDK](/ecosystem/sdk) — what host frontends consume.
