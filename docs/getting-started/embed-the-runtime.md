# Embed the runtime

The Metacore kernel is a Go library. You import it, hand it a `*gorm.DB`, and mount its routes onto a [Fiber](https://gofiber.io/) router. There's no agent, no daemon, no SaaS — your binary owns the runtime.

This page is the minimal embedding recipe. The deep dive — every config option, every subsystem, the full embedding API — lives in the [Kernel docs](https://asteby.github.io/metacore-kernel/).

[[toc]]

## Prerequisites

- **Go 1.25+**
- **PostgreSQL 14+** — the supported production database. (SQLite is used only in the kernel's own tests; the runtime's SQL gating relies on Postgres.)
- (Optional) **TinyGo 0.31+** if you'll run WASM addons.

## 1. Initialize the module

```bash
mkdir my-host && cd my-host
go mod init github.com/me/my-host
go get github.com/asteby/metacore-kernel@latest
go get github.com/gofiber/fiber/v2 gorm.io/gorm gorm.io/driver/postgres
```

> Building a host that embeds the kernel's WASM runtime needs `CGO_ENABLED=1` (the kernel uses `pg_query` for SQL gating). Alpine Docker images must static-link against musl.

## 2. The minimum viable host

```go
// main.go
package main

import (
    "log"
    "os"

    "github.com/asteby/metacore-kernel/host"
    "github.com/asteby/metacore-kernel/permission"
    "github.com/gofiber/fiber/v2"
    "gorm.io/driver/postgres"
    "gorm.io/gorm"
)

func main() {
    db, err := gorm.Open(postgres.Open(os.Getenv("DATABASE_URL")), &gorm.Config{})
    if err != nil {
        log.Fatalf("db: %v", err)
    }

    // GORM-backed permission store — the production default.
    permStore, err := permission.NewGormStore(db)
    if err != nil {
        log.Fatalf("permission store: %v", err)
    }

    app := host.NewApp(host.AppConfig{
        DB:              db,
        JWTSecret:       []byte(host.MustGetenv("JWT_SECRET")),
        RunMigrations:   true,        // versioned SQL via the migrations runner
        EnableMetrics:   true,        // exposes /api/metrics
        EnableWebhooks:  true,
        PermissionStore: permStore,   // turn on user-level CRUD gates
    })
    defer app.Stop()

    fiberApp := fiber.New()
    api := app.Mount(fiberApp.Group("/api"))

    // Layer your own domain endpoints on top of the kernel's.
    api.Get("/me", func(c *fiber.Ctx) error {
        return c.JSON(fiber.Map{"ok": true})
    })

    log.Fatal(fiberApp.Listen(":3000"))
}
```

That's the whole host. `host.NewApp` gives you a configured kernel — dynamic CRUD, metadata, the WASM runtime, the WebSocket hub, and the installer. `app.Mount(group)` wires all of it onto the Fiber group you pass in and returns it so you can hang your own routes off the same prefix.

## 3. What you just got

After `go run .`, the host exposes (under `/api`):

| Path | What it is |
|---|---|
| `GET  /api/dynamic/:model` | List rows of a model (pagination, sort, filter) |
| `GET  /api/dynamic/:model/:id` | Get one |
| `POST/PUT/DELETE /api/dynamic/:model[/:id]` | Create / update / delete |
| `POST /api/dynamic/:model/:id/actions/:key` | Custom actions |
| `GET  /api/metadata/table/:model` | Per-model column metadata for the UI |
| `GET  /api/metadata/modal/:model` · `/api/metadata/all` | Modal + full metadata |
| `GET  /api/options/:model` · `/api/search/:model` | Select-option lookups + typeahead (opt-in via `MountOptions`) |
| `GET  /api/metrics` | Prometheus metrics (when `EnableMetrics`) |

Every response uses the envelope `{ "success": true, "data": ..., "meta": ... }`; errors are `{ "success": false, "message": "..." }`.

No addon is loaded yet — install one (drop it into the installations directory, or upload the bundle) and the installer takes over: it migrates the schema, registers metadata, and the routes above start serving the new model.

## 4. Register a model / install an addon

For first-party models compiled into the binary, register them so the dynamic service can resolve them:

```go
app.RegisterModel("tickets", func() modelbase.ModelDefiner { return &Ticket{} })
```

For installed addons, point the kernel at the manifest/bundle and the installer creates the addon's schema (`addon_<key>`), applies the DDL, projects its CRUD hooks, and mounts everything — no restart. See [Lifecycle](/concepts/lifecycle).

Then hit it:

```bash
curl http://localhost:3000/api/metadata/table/tickets
curl -X POST http://localhost:3000/api/dynamic/tickets \
  -H 'Content-Type: application/json' \
  -d '{"title":"first ticket","status":"open"}'
curl http://localhost:3000/api/dynamic/tickets
```

## 5. Authenticate

The kernel ships JWT auth (the `JWTSecret` above) and reads the caller's identity off the Fiber context. To resolve your own identity shape, wire an `AuthUserProvider` — the kernel ships adapters for `modelbase`, UUID locals, and JWT — so the permission service knows the user, org and roles on every CRUD call.

```go
app := host.NewApp(host.AppConfig{
    DB:               db,
    AuthUserProvider: myProvider, // resolves user/org/roles from the request
    // ...
})
```

The permission service uses that identity for capability checks, per-user permission checks, and audit logging on every request.

## 6. Going further

- **Custom model resolver.** Hosts that keep their own model index can wire `Config.ModelResolver` — the dynamic service now routes `resolveModel` through it (fixed in the current kernel), so you don't have to double-register in `modelbase`.
- **Per-org currency.** Register `database.RegisterCurrencyDefaultCallback` to populate a model's `CurrencyCode`/`Moneda` at INSERT time from your `OrgCurrencyGetter`, with a geography-agnostic USD fallback.
- **Lifecycle hooks.** Set `EnableLifecycleHooks` to dispatch install/upgrade/CRUD hooks declared in addon manifests.
- **TLS, observability, graceful shutdown** — `host.App` wraps these; see the kernel docs for the config matrix.

Continue in the [Kernel docs →](https://asteby.github.io/metacore-kernel/) for the embedding reference, every config knob, and every subsystem.

## Related

- [Architecture](/architecture) — how the runtime fits between hosts and addons.
- [Lifecycle concept](/concepts/lifecycle) — install / upgrade / uninstall internals.
- [Permissions concept](/concepts/permissions) — what the enforcer does at every CRUD call.
