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

Metacore is a runtime + SDK for building modular, multi-tenant business applications out of small declarative addons. The **kernel** is a Go library you embed in your app: it owns the database schema, the REST surface, permissions, lifecycle, and a WebSocket hub. The **SDK** is a set of npm packages and a CLI: it lets you describe an addon — its tables, capabilities and UI — in a single `manifest.json`, and renders the result as a typed React experience inside any host.

Together, they turn a manifest into a working CRUD app. Hosts like [link](https://github.com/asteby) (the operator panel) and [ops](https://github.com/asteby) (the marketplace) pick that up automatically — and so does any app you build on the same primitives.

## The four-line pitch

::: code-group

```json [manifest.json]
{
  "id": "tickets",
  "name": "Tickets",
  "version": "0.1.0",
  "tables": [{
    "name": "tickets",
    "columns": [
      { "name": "id",       "type": "uuid", "primaryKey": true },
      { "name": "title",    "type": "string", "required": true },
      { "name": "status",   "type": "enum",   "values": ["open","closed"] },
      { "name": "assignee", "type": "string" }
    ]
  }],
  "capabilities": [
    { "kind": "db:read",  "target": "tickets" },
    { "kind": "db:write", "target": "tickets" }
  ]
}
```

```bash [endpoints]
# Mounted by the kernel, no handler code needed.
GET    /api/addons/tickets/tickets
GET    /api/addons/tickets/tickets/:id
POST   /api/addons/tickets/tickets
PATCH  /api/addons/tickets/tickets/:id
DELETE /api/addons/tickets/tickets/:id
GET    /api/addons/tickets/_meta/columns
```

```tsx [ui.tsx]
import { DynamicTable } from '@asteby/metacore-runtime-react'

// Reads the same metadata, gets list + paginate + sort + filter.
export default function Tickets() {
  return <DynamicTable addon="tickets" table="tickets" />
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
Drop the kernel into a Gin/Chi server, get dynamic CRUD, permissions and WebSockets out of the box.
</a>

<a class="role-card" href="/metacore/getting-started/build-a-host">
<strong>I'm building a host like link or ops →</strong>
A Vite + React frontend over a Go backend that mounts the kernel. The SDK provides every primitive.
</a>

## What's open

Both Metacore repositories are public and Apache-2.0:

| Repo | What it is |
|---|---|
| [`asteby/metacore-kernel`](https://github.com/asteby/metacore-kernel) | The Go runtime. WASM sandbox, dynamic CRUD, permissions, lifecycle, WebSockets. |
| [`asteby/metacore-sdk`](https://github.com/asteby/metacore-sdk) | The TypeScript SDK and CLI. Manifest schema, React runtime, addon scaffolder. |
| [`asteby/metacore`](https://github.com/asteby/metacore) | This portal. Documentation only. |

The kernel and SDK each ship their own deep documentation — this site routes you to the right one and explains the platform end-to-end.
