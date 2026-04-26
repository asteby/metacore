# Hosts

A **host** is a product built on the kernel + SDK that exposes installed addons to users. The kernel runs the addons; the host is everything around them — auth, layout, branding, billing, anything not the addon's job.

[[toc]]

## Official hosts

### link — the operator panel

**link** is how internal teams use installed addons. It's the day-to-day surface: lists, forms, dashboards, action buttons. Operators log in, see the addons they have permission to use, click into one, and work with it.

Why it exists: the same operator workflow recurs across every internal tool. Building a fresh React app for each is wasted work. **link** is one app that adapts to whatever addons are installed, with a layout, a navigation, and an identity model that work across all of them.

What's specific to link:
- Identity + SSO integration with the operator's directory
- A standardized sidebar / breadcrumb / search layout
- Bulk operations across addon boundaries (e.g. find rows touching multiple addons)
- Saved views, favorites, recents

What's not specific: every CRUD screen, every form, every action. Those come from the SDK reading the kernel's metadata.

### ops — the marketplace + admin

**ops** is the catalog and the management surface. Discovery, install, upgrade, billing, audit, configuration of addons happens here. Where **link** is for end-users of addons, **ops** is for the people responsible for which addons exist on a host and how they're configured.

What's specific to ops:
- Bundle browser / search
- Install + upgrade + uninstall flows with diff preview
- Audit log explorer
- Permission management (roles, grants)
- Org / tenant administration
- Billing + entitlement (when applicable)

What's not specific: same as link — the per-addon screens are SDK-rendered.

## What hosts have in common

Both **link** and **ops** are pure SDK consumers. Neither has any per-addon code. They differ in layout, navigation, and the host-specific screens; everything else comes from the SDK reading the kernel's metadata.

That's the central design bet: **the host is a layout + auth + brand**, the SDK is the runtime, the addon is the feature. New addons require zero changes to either host.

## Build your own host

You don't have to use **link** or **ops**. The SDK is public; the kernel is public; you can build a host of your own. Reasons to:

- **Customer-facing portal.** End-users (not operators) need a different layout, often with marketing copy and a more constrained surface area than link.
- **Embedded admin in an existing product.** You already have a SaaS, and you want a "settings" / "admin" section that picks up addons without per-section code.
- **Per-vertical UX.** Healthcare, fintech, logistics — domains with strong UX expectations may want a layout tailored to the field.

The recipe is in [Build a host](/getting-started/build-a-host). Short version:

1. **Backend.** A Go binary that imports `metacore-kernel` and adds your auth + business endpoints.
2. **Frontend.** A Vite + React app that imports `@asteby/metacore-runtime-react` and renders addon UIs via `<DynamicTable>`, `<DynamicForm>` and `<Slot>`.
3. **Identity.** Your auth choice; inject `kernel.Identity` on every request via middleware.
4. **Brand.** The SDK's theme package exposes design tokens; override them to match your product.

A typical custom host is **400–800 lines** total: layout, navigation, auth screens, plus configuration. Everything else is the SDK + the kernel.

## What a host does *not* own

- **The data model.** That's the addon's manifest.
- **The CRUD endpoints.** The kernel mounts them.
- **The CRUD UI.** The SDK renders it.
- **The permission system.** The kernel enforces it.
- **The real-time fanout.** The kernel's hub handles it.

Hosts are deliberately thin. The leverage Metacore provides comes from *not* having to write these.

## Related

- [Build a host](/getting-started/build-a-host) — full recipe.
- [Architecture](/architecture) — how hosts fit between the kernel and the surface.
- [Kernel](/ecosystem/kernel) — what hosts embed.
- [SDK](/ecosystem/sdk) — what host frontends consume.
