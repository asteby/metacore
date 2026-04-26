# Why Metacore

Most internal tools get built twice: once as a hand-rolled admin (REST handlers, a list page, an edit form, role checks scattered across the codebase) and again, six months later, after the schema has drifted and three people have copied the same paginated list.

Metacore replaces that loop with a single declarative artifact — the **manifest** — and a runtime that consumes it. The kernel handles persistence, validation, permissions, and real-time sync; the SDK renders the UI from the same schema. You add a column, the form gets a field. You add a capability, every layer enforces it.

This page is about what that buys you, what it costs, and where it does not fit.

## What you don't have to write

| Concern | Without Metacore | With Metacore |
|---|---|---|
| Schema migrations | Hand-written `up`/`down` files, kept in sync with code | Derived from `manifest.tables[]`, run by the installer |
| REST handlers | One per resource × five verbs (list, get, create, update, delete) | Mounted automatically from the manifest |
| OpenAPI / metadata | Maintained separately, drifts | Served from `_meta/columns`, always matches the schema |
| List / edit / create / delete UI | Custom forms, custom tables, repeated 20× | `<DynamicTable>` + `<DynamicForm>` reads the same metadata |
| Pagination, sorting, filtering | Re-implemented per page | Built into the runtime |
| Validation | Duplicated client + server | Declared once in the manifest, enforced both sides |
| Permission middleware | Scattered `if user.has(role)` checks | Capability-driven, enforced by the kernel |
| Audit logs | Add lines to every handler | Emitted by the runtime |
| Real-time sync | Custom WebSocket plumbing | Built-in hub, one method to push |
| Multi-tenancy | Manual `WHERE org_id = ?` everywhere | Enforced by the dynamic CRUD layer |

The pattern is consistent: anything that can be read off the manifest, the runtime owns. You only write code where you genuinely need to.

## What you keep

Metacore is opinionated about plumbing, not about behavior. You still own:

- **Custom validators.** Manifest-declared rules cover length, type, regex, required-ness; anything beyond that is a Go validator you register on the addon.
- **Custom actions.** Buttons that aren't CRUD live in `manifest.actions[]`. The runtime wires the route and the UI; the body is yours.
- **Domain logic.** Pricing, scheduling, AI calls, side effects, integrations — your code, plain Go inside the addon.
- **Escape hatches.** When metadata isn't enough, fall back to direct handler registration on the kernel. The SDK doesn't sit between you and the database; it just removes the wiring.
- **The runtime itself.** The kernel is a library you embed, not a SaaS. It runs on your infrastructure, in your binary.

## Who's it for

- **Internal tools.** ERP-like apps, CRMs, ticketing, content moderation, data review. Anywhere a CRUD-shaped problem keeps showing up.
- **Admin panels.** Side panels for an existing product, where you want consistency and zero per-table boilerplate.
- **Multi-tenant SaaS.** The runtime treats organizations as a first-class scope; addons inherit the boundary.
- **Workflow / automation surfaces.** Manifest actions + WebSocket events compose into orchestration UIs without ad-hoc wiring.

## Who's it not for

- **Pure consumer apps with bespoke UX.** If every screen has a unique layout that fights metadata, you'll spend more time defeating the runtime than using it.
- **Pure data pipelines.** Metacore is request/response + UI. For batch ETL, use a job runner; the manifest doesn't help there.
- **One-off scripts.** Spinning up a kernel for a 200-line tool is overkill; reach for it when the same shape recurs.

## How does it compare?

| Tool | What it is | Where Metacore differs |
|---|---|---|
| **Retool** | SaaS-hosted internal-tool builder, drag-and-drop UI | Open-source library you embed; declarative manifest in version control; runs on your infra |
| **Refine** | React framework for admin panels with pluggable data providers | Adds a runtime: schema, permissions and migrations are defined and enforced server-side, not just rendered client-side |
| **Forest Admin** | SaaS admin layer over your existing DB | Manifest-first instead of DB-introspection; addons are versioned and hot-swappable; sandboxed WASM execution |
| **Strapi** | Headless CMS with a content-type builder | Aimed at modular business apps, not content; addons compose, capability model is first-class |
| **Directus** | DB-introspection admin + REST/GraphQL | Schema lives in the addon manifest, not the DB; multi-addon composition; WASM sandbox for untrusted code |
| **tRPC / Hono / Gin** | RPC / HTTP frameworks | Orthogonal — Metacore uses one of these underneath. It adds the declarative schema + UI layer on top |

The short version: **Metacore is the only one with a versioned, sandboxed, hot-installable addon contract that drives both the backend and the UI from the same manifest.** Every other tool nails one or two of those, not all.

## Anti-features

A few things Metacore deliberately doesn't do:

- **No GUI builder.** Manifests are JSON in your repo; there's no drag-and-drop. This is on purpose — it keeps the source of truth reviewable and diffable.
- **No DB introspection.** The manifest defines the schema; the schema doesn't define the manifest. Reverse-engineering from a database produces lossy contracts.
- **No magic at runtime.** The kernel only does what the manifest says. If something is off, the manifest is wrong; there's nowhere else to look.

## Next

- [Architecture](/architecture) — how the four layers fit together.
- [Pick your path](/getting-started/) — quickstart based on your role.
- [Manifest concept](/concepts/manifest) — the contract in detail.
