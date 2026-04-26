# Ecosystem

Metacore is one platform spread across a small set of public repositories. This page is the map.

[[toc]]

## The big picture

```
                ┌──────────────────────────────────────┐
                │          asteby/metacore             │
                │   ← you are here (the portal)        │
                └─────────────────┬────────────────────┘
                                  │
              ┌───────────────────┴────────────────────┐
              ▼                                        ▼
   ┌───────────────────────┐              ┌───────────────────────┐
   │  asteby/metacore-     │              │  asteby/metacore-     │
   │       kernel          │              │        sdk            │
   │  Go runtime           │              │  TS packages + CLI    │
   │  • dynamic CRUD       │◀────reads────│  • manifest schema    │
   │  • permissions        │              │  • runtime-react      │
   │  • lifecycle          │              │  • 16 npm packages    │
   │  • WASM sandbox       │              │  • metacore-sdk CLI   │
   │  • WebSocket hub      │              │                       │
   └──────────┬────────────┘              └────────────┬──────────┘
              │                                        │
              └────────────────┬───────────────────────┘
                               ▼
              ┌──────────────────────────────────────┐
              │             Hosts                    │
              │  • link  (operator panel)            │
              │  • ops   (marketplace + admin)       │
              │  • your-host  (anything you build)   │
              └──────────────────────────────────────┘
                               ▼
              ┌──────────────────────────────────────┐
              │       Addons (.mcbundle)             │
              │  • first-party (built by Asteby)     │
              │  • third-party (built by anyone)     │
              └──────────────────────────────────────┘
```

## Public repositories

| Repo | What it is | Docs |
|---|---|---|
| [`asteby/metacore`](https://github.com/asteby/metacore) | This portal — the front door | you're on it |
| [`asteby/metacore-kernel`](https://github.com/asteby/metacore-kernel) | The Go runtime | [docs ↗](https://asteby.github.io/metacore-kernel/) |
| [`asteby/metacore-sdk`](https://github.com/asteby/metacore-sdk) | The npm packages and CLI | [docs ↗](https://asteby.github.io/metacore-sdk/) |

All three are Apache-2.0.

## How they relate

- The **portal** explains the platform and routes to the other two.
- The **kernel** is the runtime. It's a Go library you embed; it owns persistence, REST, permissions, lifecycle, sandboxing, real-time.
- The **SDK** is the contract + the surface. It defines what an addon is (manifest schema, bundle format) and provides the React primitives that consume the kernel's metadata.

A working Metacore app is a host binary that imports the kernel, paired with a host frontend that imports the SDK, with one or more `.mcbundle` addons installed.

## Hosts

Hosts are the products built on top of the kernel + SDK. They have their own repositories (private, for now) but use only public APIs:

- **link** — operator panel: how internal teams use installed addons day-to-day.
- **ops** — marketplace + admin: discovery, install, billing, audit.
- **your-host** — anything you build with [Build a host](/getting-started/build-a-host).

See [Hosts](/ecosystem/hosts) for more.

## Versioning

The kernel and the SDK release independently. A host pins both. When a kernel feature requires a specific SDK version (or vice versa), it's noted in release notes; otherwise they evolve at their own pace.

## Where to go next

- [Kernel](/ecosystem/kernel) — what it does, with a link to its dedicated docs site.
- [SDK](/ecosystem/sdk) — what it provides, with a link to its dedicated docs site.
- [Hosts](/ecosystem/hosts) — link, ops, and how to build your own.
