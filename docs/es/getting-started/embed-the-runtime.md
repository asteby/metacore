# Embeber el runtime

El kernel de Metacore es una librería Go. La importás, le pasás un `*gorm.DB`, y montás sus rutas en un router [Fiber](https://gofiber.io/). No hay agente, no hay daemon, no hay SaaS — tu binario posee el runtime.

Esta página es la receta mínima de embedding. El detalle profundo — cada opción de config, cada subsistema, la API de embedding completa — vive en las [docs del Kernel](https://asteby.github.io/metacore-kernel/).

[[toc]]

## Prerrequisitos

- **Go 1.25+**
- **PostgreSQL 14+** — la base de datos soportada en producción. (SQLite se usa solo en los tests del propio kernel; el gating de SQL del runtime depende de Postgres.)
- (Opcional) **TinyGo 0.31+** si vas a correr addons WASM.

## 1. Inicializar el módulo

```bash
mkdir my-host && cd my-host
go mod init github.com/me/my-host
go get github.com/asteby/metacore-kernel@latest
go get github.com/gofiber/fiber/v2 gorm.io/gorm gorm.io/driver/postgres
```

> Buildear un host que embeba el runtime WASM del kernel necesita `CGO_ENABLED=1` (el kernel usa `pg_query` para el gating de SQL). Las imágenes Docker Alpine deben static-linkear contra musl.

## 2. El host mínimo viable

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

    // Permission store sobre GORM — el default de producción.
    permStore, err := permission.NewGormStore(db)
    if err != nil {
        log.Fatalf("permission store: %v", err)
    }

    app := host.NewApp(host.AppConfig{
        DB:              db,
        JWTSecret:       []byte(host.MustGetenv("JWT_SECRET")),
        RunMigrations:   true,        // SQL versionado vía el migrations runner
        EnableMetrics:   true,        // expone /api/metrics
        EnableWebhooks:  true,
        PermissionStore: permStore,   // activa las puertas CRUD a nivel usuario
    })
    defer app.Stop()

    fiberApp := fiber.New()
    api := app.Mount(fiberApp.Group("/api"))

    // Apilá tus propios endpoints de dominio encima de los del kernel.
    api.Get("/me", func(c *fiber.Ctx) error {
        return c.JSON(fiber.Map{"ok": true})
    })

    log.Fatal(fiberApp.Listen(":3000"))
}
```

Ese es todo el host. `host.NewApp` te da un kernel configurado — CRUD dinámico, metadata, el runtime WASM, el hub WebSocket y el instalador. `app.Mount(group)` cablea todo eso sobre el group de Fiber que le pasás y lo devuelve para que cuelgues tus propias rutas del mismo prefijo.

## 3. Lo que acabás de obtener

Después de `go run .`, el host expone (bajo `/api`):

| Path | Qué es |
|---|---|
| `GET  /api/dynamic/:model` | Listar filas de un modelo (paginación, sort, filter) |
| `GET  /api/dynamic/:model/:id` | Obtener una |
| `POST/PUT/DELETE /api/dynamic/:model[/:id]` | Crear / actualizar / borrar |
| `POST /api/dynamic/:model/:id/actions/:key` | Actions custom |
| `GET  /api/metadata/table/:model` | Metadata de columnas por modelo para la UI |
| `GET  /api/metadata/modal/:model` · `/api/metadata/all` | Metadata de modal + completa |
| `GET  /api/options/:model` · `/api/search/:model` | Lookups de opciones de select + typeahead (opt-in vía `MountOptions`) |
| `GET  /api/metrics` | Métricas Prometheus (cuando `EnableMetrics`) |

Toda respuesta usa el envelope `{ "success": true, "data": ..., "meta": ... }`; los errores son `{ "success": false, "message": "..." }`.

Todavía no hay ningún addon cargado — instalá uno (soltalo en el directorio de installations, o subí el bundle) y el instalador toma el control: migra el schema, registra la metadata, y las rutas de arriba empiezan a servir el modelo nuevo.

## 4. Registrar un modelo / instalar un addon

Para modelos first-party compilados en el binario, registralos para que el servicio dinámico pueda resolverlos:

```go
app.RegisterModel("tickets", func() modelbase.ModelDefiner { return &Ticket{} })
```

Para addons instalados, apuntá el kernel al manifest/bundle y el instalador crea el schema del addon (`addon_<key>`), aplica el DDL, proyecta sus hooks CRUD y monta todo — sin reinicio. Ver [Lifecycle](/es/concepts/lifecycle).

Después pegale:

```bash
curl http://localhost:3000/api/metadata/table/tickets
curl -X POST http://localhost:3000/api/dynamic/tickets \
  -H 'Content-Type: application/json' \
  -d '{"title":"first ticket","status":"open"}'
curl http://localhost:3000/api/dynamic/tickets
```

## 5. Autenticar

El kernel trae auth JWT (el `JWTSecret` de arriba) y lee la identidad del caller desde el contexto de Fiber. Para resolver tu propia forma de identidad, cableá un `AuthUserProvider` — el kernel trae adaptadores para `modelbase`, UUID locals y JWT — así el servicio de permisos conoce el usuario, la org y los roles en cada llamada CRUD.

```go
app := host.NewApp(host.AppConfig{
    DB:               db,
    AuthUserProvider: myProvider, // resuelve user/org/roles desde el request
    // ...
})
```

El servicio de permisos usa esa identidad para los chequeos de capability, los chequeos de permiso por usuario y el audit logging en cada request.

## 6. Yendo más allá

- **Resolver de modelo custom.** Los hosts que mantienen su propio índice de modelos pueden cablear `Config.ModelResolver` — el servicio dinámico ahora rutea `resolveModel` a través de él (corregido en el kernel actual), así no tenés que doble-registrar en `modelbase`.
- **Moneda por org.** Registrá `database.RegisterCurrencyDefaultCallback` para poblar el `CurrencyCode`/`Moneda` de un modelo al INSERT desde tu `OrgCurrencyGetter`, con un fallback USD agnóstico de geografía.
- **Lifecycle hooks.** Seteá `EnableLifecycleHooks` para despachar los hooks de install/upgrade/CRUD declarados en los manifests de los addons.
- **TLS, observabilidad, graceful shutdown** — `host.App` los envuelve; ver las docs del kernel para la matriz de config.

Seguí en las [docs del Kernel →](https://asteby.github.io/metacore-kernel/) para la referencia de embedding, cada perilla de config y cada subsistema.

## Relacionado

- [Arquitectura](/es/architecture) — cómo encaja el runtime entre hosts y addons.
- [Concepto de Lifecycle](/es/concepts/lifecycle) — internals de install / upgrade / uninstall.
- [Concepto de Permisos](/es/concepts/permissions) — qué hace el enforcer en cada llamada CRUD.
