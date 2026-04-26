# Embed the runtime

The Metacore kernel is a Go library. You import it, configure it, and mount its routes onto your existing HTTP server. There's no agent, no daemon, no SaaS — your binary owns the runtime.

This page is the minimal embedding recipe. The deep dive — every config option, every subsystem, the full embedding API — lives in the [Kernel docs](https://asteby.github.io/metacore-kernel/).

[[toc]]

## Prerequisites

- **Go 1.22+**
- A database. SQLite for local dev, Postgres for production. The kernel detects the driver from the connection string.
- (Optional) [TinyGo 0.30+](https://tinygo.org/) if you'll run WASM addons.

## 1. Initialize the module

```bash
mkdir my-host && cd my-host
go mod init github.com/me/my-host
go get github.com/asteby/metacore-kernel@latest
```

## 2. The minimum viable host

```go
// main.go
package main

import (
    "log"
    "net/http"

    "github.com/asteby/metacore-kernel/host"
    "github.com/asteby/metacore-kernel/kernel"
)

func main() {
    app, err := host.NewApp(host.Config{
        DatabaseURL: "postgres://user:pass@localhost/mydb?sslmode=disable",
        BundleDir:   "./bundles",
        Listen:      ":8080",
    })
    if err != nil {
        log.Fatal(err)
    }
    defer app.Close()

    // Mount kernel routes under /api.
    app.Mount("/api", kernel.Router(app.Kernel))

    // Your own routes alongside.
    app.HTTP.Handle("/health", http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
        w.Write([]byte("ok"))
    }))

    log.Fatal(app.Run())
}
```

That's the whole host. `host.NewApp` gives you a configured kernel, a database connection, a WASM runtime, the WebSocket hub, and the installer. `kernel.Router` returns an `http.Handler` you can mount anywhere.

## 3. What you just got

After running `go run .`, the host exposes:

| Path | What it is |
|---|---|
| `GET  /api/addons` | List installed addons |
| `POST /api/addons` | Install a `.mcbundle` (multipart upload) |
| `DELETE /api/addons/:id` | Uninstall |
| `GET  /api/addons/:id/_meta/columns` | Per-addon schema metadata |
| `GET/POST/PATCH/DELETE /api/addons/:id/:table` | Dynamic CRUD per addon table |
| `POST /api/addons/:id/_actions/:action` | Custom actions |
| `GET  /api/ws` | WebSocket hub (token-authenticated) |
| `GET  /health` | Your custom route |

No addon is loaded yet — drop a `.mcbundle` into `./bundles/` (or `POST` it) and the installer takes over.

## 4. Install your first addon

From a separate shell:

```bash
curl -F bundle=@tickets-0.1.0.mcbundle http://localhost:8080/api/addons
```

Response includes the addon ID, the migration log, and the new endpoints. Hit one:

```bash
curl http://localhost:8080/api/addons/tickets/_meta/columns
curl -X POST http://localhost:8080/api/addons/tickets/tickets \
  -H 'Content-Type: application/json' \
  -d '{"title":"first ticket","status":"open"}'
curl http://localhost:8080/api/addons/tickets/tickets
```

You have a working CRUD service. The kernel manages the schema, the routes, the validation, the permissions, and the WebSocket hub. You wrote 20 lines of Go.

## 5. Authenticate

The kernel stays out of your auth choice. You inject identity via a middleware that sets a `kernel.Identity` on the request context:

```go
app.HTTP.Use(func(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        // Resolve from JWT, session, mTLS — your call.
        id := kernel.Identity{
            UserID: "u_42",
            OrgID:  "org_acme",
            Roles:  []string{"operator"},
        }
        ctx := kernel.WithIdentity(r.Context(), id)
        next.ServeHTTP(w, r.WithContext(ctx))
    })
})
```

The kernel's permission service uses `Identity.Roles` (or per-user grants in its DB) to decide whether a CRUD call is allowed.

## 6. Going further

- **Custom routes alongside the kernel** — keep your existing app, add Metacore on a sub-path.
- **Multiple databases** — separate the addon database from your business DB; the kernel's installer accepts a dedicated DSN.
- **Embedded addons** — register an addon in code (no `.mcbundle`) for first-party features. Useful for addons that ship with the host binary.
- **Custom storage backends** — implement `kernel.Store` to plug in something other than Postgres / SQLite (e.g. an existing data layer).
- **TLS, observability, graceful shutdown** — `host.App` wraps these, see the kernel docs for the config matrix.

Continue in the [Kernel docs →](https://asteby.github.io/metacore-kernel/) for the embedding reference, every config knob, and every subsystem.

## Related

- [Architecture](/architecture) — how the runtime fits between hosts and addons.
- [Lifecycle concept](/concepts/lifecycle) — install / upgrade / uninstall internals.
- [Permissions concept](/concepts/permissions) — what the enforcer does at every CRUD call.
