---
layout: home
title: Home

hero:
  name: "Metacore"
  text: "Declarative addons.\nZero-glue UI."
  tagline: "Build a CRUD addon, get a working multi-tenant app — without writing the wiring."
  image:
    src: /logo.svg
    alt: Metacore
  actions:
    - theme: brand
      text: Get Started
      link: /getting-started/
    - theme: alt
      text: What's new in v3
      link: /v3
    - theme: alt
      text: Architecture
      link: /architecture
    - theme: alt
      text: GitHub
      link: https://github.com/asteby

features:
  - title: Manifest, not boilerplate
    details: Declare tables, columns, capabilities and actions in one JSON file. Get migrations, REST endpoints, metadata and a typed UI for free.
    icon: 📜
  - title: Capability-first security
    details: Permissions are part of the addon contract. The kernel enforces them at every CRUD call, the UI gates components automatically.
    icon: 🔒
  - title: WASM sandbox
    details: Addons run isolated in wazero. No more vendoring untrusted Go into your binary.
    icon: 🦀
  - title: Hot install
    details: Drop a signed bundle, the installer migrates the schema, mounts the handlers, registers UI metadata. No restart required.
    icon: ⚡
  - title: Real-time by default
    details: A WebSocket hub is part of the runtime. Push CRUD changes and custom events to clients with a single method call.
    icon: 📡
  - title: Two repos, one platform
    details: The kernel runs the runtime in Go. The SDK declares the contract in TypeScript. The portal you're on connects them.
    icon: 🧱
---

## What's Metacore?

Metacore is a runtime + SDK for building modular, multi-tenant business applications out of small declarative addons. The **kernel** is a Go library you embed in your app: it owns the database schema, the REST surface, permissions, lifecycle, and a WebSocket hub. The **SDK** is a set of npm packages: it lets you describe an addon — its models, capabilities and UI — in a single `manifest.json` (the **Module Contract v3**), and renders the result as a typed React experience inside any host.

Together, they turn a manifest into a working CRUD app. Any host you build on the same primitives — an operator panel, a customer portal, an embedded admin — picks that up automatically.

## The four-line pitch

::: code-group

```json [manifest.json]
{
  "apiVersion": "asteby.com/v3",
  "kind": "Addon",
  "metadata": { "key": "tickets", "name": "Tickets", "version": "0.1.0" },
  "capabilities": [
    { "kind": "db:read",  "target": "addon_tickets.*" },
    { "kind": "db:write", "target": "addon_tickets.*" }
  ],
  "models": [{
    "key": "Ticket",
    "table": "tickets",
    "columns": [
      { "name": "id",       "type": "uuid", "primary_key": true, "default": "gen_random_uuid()" },
      { "name": "title",    "type": "text", "not_null": true },
      { "name": "status",   "type": "text", "default": "'open'" },
      { "name": "assignee", "type": "text" }
    ]
  }]
}
```

```bash [endpoints]
# Mounted by the kernel, no handler code needed.
GET    /api/dynamic/tickets
GET    /api/dynamic/tickets/:id
POST   /api/dynamic/tickets
PUT    /api/dynamic/tickets/:id
DELETE /api/dynamic/tickets/:id
GET    /api/metadata/table/tickets
```

```tsx [ui.tsx]
import { DynamicTable } from '@asteby/metacore-runtime-react'

// Reads the same metadata, gets list + paginate + sort + filter.
export default function Tickets() {
  return <DynamicTable model="tickets" />
}
```

:::

That's the whole loop. Add a column, the table updates. Add a capability, the permission middleware enforces it. Ship a bundle, the installer hot-loads it.

## Get the right entry point

<a class="role-card" href="/metacore/getting-started/build-an-addon">
<strong>I'm building an addon →</strong>
You write a manifest, the SDK does the rest. Ship a `.mcbundle` to any host running the kernel.
</a>

<a class="role-card" href="/metacore/getting-started/embed-the-runtime">
<strong>I'm embedding the runtime in my Go app →</strong>
Drop the kernel into a Fiber server, get dynamic CRUD, permissions and WebSockets out of the box.
</a>

<a class="role-card" href="/metacore/getting-started/build-a-host">
<strong>I'm building a host →</strong>
A Vite + React frontend over a Go backend that mounts the kernel. The SDK provides every primitive.
</a>

### Or jump straight into the deep docs

<a class="role-card" href="/metacore/sdk/">
<strong>SDK reference →</strong>
The published npm packages, the manifest spec, dynamic UI, the cookbook, capabilities, publishing.
</a>

<a class="role-card" href="/metacore/kernel/">
<strong>Kernel reference →</strong>
Embedding the runtime, the dynamic CRUD framework, the HTTP API, permissions, and contributor setup.
</a>

## What's open

Both Metacore repositories are public and Apache-2.0:

| Repo | What it is |
|---|---|
| [`asteby/metacore-kernel`](https://github.com/asteby/metacore-kernel) | The Go runtime. WASM sandbox, dynamic CRUD, permissions, lifecycle, WebSockets. |
| [`asteby/metacore-sdk`](https://github.com/asteby/metacore-sdk) | The TypeScript SDK and CLI. Manifest schema, React runtime, addon scaffolder. |
| [`asteby/metacore`](https://github.com/asteby/metacore) | This portal. Documentation only. |

The kernel and SDK each ship their own deep documentation — this site routes you to the right one and explains the platform end-to-end.
