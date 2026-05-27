# Kernel

[`asteby/metacore-kernel`](https://github.com/asteby/metacore-kernel) es el runtime Go que potencia cada host de Metacore. Es una librería, no un servicio: la embebés en tu binario, montás sus rutas y tenés un runtime de addons completo.

## Qué hace

| Subsistema | Responsabilidad |
|---|---|
| **Store dinámico** | CRUD genérico sobre cualquier tabla declarada en el manifest de cualquier addon instalado. List / get / create / update / delete con paginación, sort, filter, tenancy. |
| **Enforcer de seguridad** | Gating a nivel capability. Cada request se chequea contra `capabilities[]` del addon. Modos shadow + enforce. |
| **Servicio de permisos** | Gating a nivel usuario. Resuelve los permisos efectivos del caller y los aplica por route. |
| **Instalador** | Install / upgrade / uninstall transaccional. Diff de manifest → plan DDL → migración → hook → update de metadata. |
| **Sandbox WASM** | Ejecuta código de addon en [wazero](https://wazero.io/). ABI con scope de capability; sin acceso a memoria ni filesystem del host. |
| **Hub WebSocket** | Fanout en tiempo real, con scope por tenant y canal. Usado por el SDK para updates CRUD en vivo. |
| **Pipe de auditoría** | Stream estructurado de chequeos de capability, chequeos de permisos, ops CRUD. Routeado a un sink provisto por el host. |
| **Helpers de host** | `host.App` / `host.Host` envuelven config, DI, routing, graceful shutdown para un backend de host típico. |

## Stack

- **Go 1.25+** (el runtime WASM necesita `CGO_ENABLED=1` — `pg_query` para el gating de SQL)
- **Fiber** como el router HTTP sobre el que el kernel se monta
- **GORM** sobre **PostgreSQL** (el gating de SQL del runtime es específico de Postgres)
- **wazero** para el sandbox WASM
- **OpenTelemetry / Prometheus** — traces, métricas (`/api/metrics`), logs
- **Cero servicios externos** en runtime — sin Redis, sin message broker; el kernel publica sus propios primitivos

## Embedding en pocas líneas

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
app.Mount(fiberApp.Group("/api"))           // CRUD dinámico, metadata, options, métricas
fiberApp.Listen(":3000")
```

Ese es un backend completo de hosting de addons. Mirá [Embeber el runtime](/es/getting-started/embed-the-runtime) para el walkthrough completo.

## Dónde vive la documentación profunda

El kernel publica su propio sitio VitePress de docs con:

- La API de embedding completa
- Cada opción de config
- Cada subsistema interno (store, enforcer, servicio de permisos, instalador, sandbox, hub)
- El modelo de seguridad
- El formato de auditoría
- Internals de migración y upgrade

[Docs del Kernel ↗](https://asteby.github.io/metacore-kernel/)

## Repositorio

- **GitHub:** [github.com/asteby/metacore-kernel](https://github.com/asteby/metacore-kernel)
- **Licencia:** Apache-2.0
- **Releases:** Basados en tags; binarios vía GoReleaser; el module index actualiza pkg.go.dev automáticamente

## Relacionado

- [Arquitectura](/es/architecture) — dónde encaja el kernel.
- [SDK](/es/ecosystem/sdk) — el lado cliente de la API del kernel.
- [Embeber el runtime](/es/getting-started/embed-the-runtime) — quickstart.
