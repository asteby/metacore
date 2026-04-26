# Embeber el runtime

El kernel de Metacore es una librería Go. La importás, la configurás y montás sus rutas en tu server HTTP existente. No hay agente, no hay daemon, no hay SaaS — tu binario posee el runtime.

Esta página es la receta mínima de embedding. El deep dive — cada opción de config, cada subsistema, la API de embedding completa — vive en las [docs del Kernel](https://asteby.github.io/metacore-kernel/).

[[toc]]

## Prerrequisitos

- **Go 1.22+**
- Una base de datos. SQLite para dev local, Postgres para producción. El kernel detecta el driver desde la connection string.
- (Opcional) [TinyGo 0.30+](https://tinygo.org/) si vas a correr addons WASM.

## 1. Inicializá el módulo

```bash
mkdir my-host && cd my-host
go mod init github.com/me/my-host
go get github.com/asteby/metacore-kernel@latest
```

## 2. El host mínimo viable

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

Ese es todo el host. `host.NewApp` te da un kernel configurado, una conexión a base de datos, un runtime WASM, el hub WebSocket y el instalador. `kernel.Router` retorna un `http.Handler` que podés montar en cualquier lado.

## 3. Lo que acabás de obtener

Después de correr `go run .`, el host expone:

| Path | Qué es |
|---|---|
| `GET  /api/addons` | Lista los addons instalados |
| `POST /api/addons` | Instala un `.mcbundle` (multipart upload) |
| `DELETE /api/addons/:id` | Desinstala |
| `GET  /api/addons/:id/_meta/columns` | Metadata de schema por addon |
| `GET/POST/PATCH/DELETE /api/addons/:id/:table` | CRUD dinámico por tabla de addon |
| `POST /api/addons/:id/_actions/:action` | Acciones custom |
| `GET  /api/ws` | Hub WebSocket (autenticado por token) |
| `GET  /health` | Tu route custom |

Todavía no hay ningún addon cargado — soltá un `.mcbundle` en `./bundles/` (o hacele `POST`) y el instalador toma el control.

## 4. Instalá tu primer addon

Desde una shell separada:

```bash
curl -F bundle=@tickets-0.1.0.mcbundle http://localhost:8080/api/addons
```

La respuesta incluye el ID del addon, el log de migración y los nuevos endpoints. Probá uno:

```bash
curl http://localhost:8080/api/addons/tickets/_meta/columns
curl -X POST http://localhost:8080/api/addons/tickets/tickets \
  -H 'Content-Type: application/json' \
  -d '{"title":"first ticket","status":"open"}'
curl http://localhost:8080/api/addons/tickets/tickets
```

Tenés un servicio CRUD funcional. El kernel maneja el schema, las routes, la validación, los permisos y el hub WebSocket. Escribiste 20 líneas de Go.

## 5. Autenticá

El kernel se mantiene afuera de tu elección de auth. Inyectás identidad vía un middleware que setea un `kernel.Identity` en el contexto del request:

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

El servicio de permisos del kernel usa `Identity.Roles` (o grants por usuario en su DB) para decidir si una llamada CRUD está permitida.

## 6. Yendo más lejos

- **Routes custom junto al kernel** — mantené tu app existente, agregá Metacore en un sub-path.
- **Múltiples bases de datos** — separá la base de datos de los addons de tu DB de negocio; el instalador del kernel acepta un DSN dedicado.
- **Addons embebidos** — registrá un addon en código (sin `.mcbundle`) para features first-party. Útil para addons que se publican con el binario del host.
- **Backends de storage custom** — implementá `kernel.Store` para enchufar algo distinto a Postgres / SQLite (ej. una capa de datos existente).
- **TLS, observability, graceful shutdown** — `host.App` envuelve esto, mirá las docs del kernel para la matriz de config.

Continuá en las [docs del Kernel →](https://asteby.github.io/metacore-kernel/) para la referencia de embedding, cada perilla de config y cada subsistema.

## Relacionado

- [Arquitectura](/es/architecture) — cómo encaja el runtime entre hosts y addons.
- [Concepto de lifecycle](/es/concepts/lifecycle) — internals de install / upgrade / uninstall.
- [Concepto de permisos](/es/concepts/permissions) — qué hace el enforcer en cada llamada CRUD.
