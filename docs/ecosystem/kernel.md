# Kernel

[`asteby/metacore-kernel`](https://github.com/asteby/metacore-kernel) is the Go runtime that powers every Metacore host. It's a library, not a service: you embed it in your binary, mount its routes, and you have a complete addon runtime.

## What it does

| Subsystem | Responsibility |
|---|---|
| **Dynamic store** | Generic CRUD over any table declared in any installed addon's manifest. List / get / create / update / delete with pagination, sort, filter, tenancy. |
| **Security enforcer** | Capability-level gating. Every request is checked against the addon's `capabilities[]`. Shadow + enforce modes. |
| **Permission service** | User-level gating. Resolves the caller's effective permissions and enforces them per route. |
| **Installer** | Transactional install / upgrade / uninstall. Manifest diff → DDL plan → migration → hook → metadata update. |
| **WASM sandbox** | Executes addon code in [wazero](https://wazero.io/). Capability-scoped ABI; no host memory or filesystem access. |
| **WebSocket hub** | Real-time fanout, tenant- and channel-scoped. Used by the SDK for live CRUD updates. |
| **Audit pipe** | Structured stream of capability checks, permission checks, CRUD ops. Routed to a host-provided sink. |
| **Host helpers** | `host.App` / `host.Host` wrap config, DI, routing, graceful shutdown for a typical host backend. |

## Stack

- **Go 1.25+** (the WASM runtime needs `CGO_ENABLED=1` — `pg_query` for SQL gating)
- **Fiber** as the HTTP router the kernel mounts onto
- **GORM** over **PostgreSQL** (the runtime's SQL gating is Postgres-specific)
- **wazero** for the WASM sandbox
- **OpenTelemetry / Prometheus** — traces, metrics (`/api/metrics`), logs
- **Zero external services** at runtime — no Redis, no message broker; the kernel ships its own primitives

## Embedding in a few lines

```go
import (
    "github.com/asteby/metacore-kernel/host"
    "github.com/gofiber/fiber/v2"
)

app := host.NewApp(host.AppConfig{
    DB:            db,                       // *gorm.DB
    JWTSecret:     []byte(jwtSecret),
    RunMigrations: true,
})
defer app.Stop()

fiberApp := fiber.New()
app.Mount(fiberApp.Group("/api"))           // dynamic CRUD, metadata, options, metrics
fiberApp.Listen(":3000")
```

That's a complete addon-hosting backend. See [Embed the runtime](/getting-started/embed-the-runtime) for the full walkthrough.

## Where the deep documentation lives

The kernel ships its own VitePress docs site with:

- The full embedding API
- Every config option
- Each subsystem internal (store, enforcer, permission service, installer, sandbox, hub)
- The security model
- The audit format
- Migration & upgrade internals

[Kernel docs ↗](https://asteby.github.io/metacore-kernel/)

## Repository

- **GitHub:** [github.com/asteby/metacore-kernel](https://github.com/asteby/metacore-kernel)
- **License:** Apache-2.0
- **Releases:** Tag-based; binaries via GoReleaser; module index updates pkg.go.dev automatically

## Related

- [Architecture](/architecture) — where the kernel fits.
- [SDK](/ecosystem/sdk) — the client side of the kernel's API.
- [Embed the runtime](/getting-started/embed-the-runtime) — quickstart.
