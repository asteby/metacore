# Guía del consumidor

Esta guía es para ingenieros que integran `metacore-kernel` en un backend Go.
Asume que estás construyendo una aplicación host — un panel de operador, un
marketplace + superficie de admin, un portal del cliente, una sección de
admin embebida, o cualquier otro servicio Go que quiera embeber el kernel.
Los autores de addons frontend deberían leer la documentación del
[`metacore-sdk`](https://github.com/asteby/metacore-sdk) en su lugar — este
kernel solo ejecuta lo que el SDK produce.

---

## Tabla de contenidos

1. [Instalar el módulo](#1-instalar-el-módulo)
2. [Acceso a módulos privados](#2-acceso-a-módulos-privados)
3. [Quickstart — `host.App`](#3-quickstart--hostapp)
4. [Agregar el plano de addons — `host.Host`](#4-agregar-el-plano-de-addons--hosthost)
5. [Storage y migraciones](#5-storage-y-migraciones)
6. [Modelo de capabilities y modos de seguridad](#6-modelo-de-capabilities-y-modos-de-seguridad)
7. [Hub de WebSocket](#7-hub-de-websocket)
8. [Updates en tiempo real](#8-updates-en-tiempo-real)
9. [Template de Renovate](#9-template-de-renovate)
10. [Política de SemVer](#10-política-de-semver)
11. [Flujo de release de punta a punta](#11-flujo-de-release-de-punta-a-punta)
12. [FAQ](#12-faq)

> ¿Buscás un walkthrough de una sola página? Probá
> [`embedding-quickstart.md`](./embedding-quickstart). ¿Buscás la spec del
> framework de CRUD dinámico? Mirá [`dynamic-system.md`](./dynamic-system).
> Para detalles de permisos, [`permissions.md`](./permissions).

---

## 1. Instalar el módulo

```bash
go get github.com/asteby/metacore-kernel@latest
go mod tidy
```

Pineá un tag específico en producción:

```bash
go get github.com/asteby/metacore-kernel@v0.2.0
```

Una vez que el módulo está en tu `go.mod`:

```go
require github.com/asteby/metacore-kernel v0.2.0
```

Para desarrollo local contra un kernel en progreso, dropeá una directiva
`replace` en el `go.mod` de tu app:

```go
replace github.com/asteby/metacore-kernel => ../metacore-kernel
```

Corré `go mod edit -dropreplace github.com/asteby/metacore-kernel` y `go mod
tidy` antes de hacer commit, así los builds de producción resuelven a una
versión taggeada.

## 2. Acceso a módulos privados

El kernel de Metacore es público — no se necesita configuración especial
para `go get github.com/asteby/metacore-kernel`. Esta sección solo aplica
si tu aplicación host también depende de módulos Go privados tuyos.

### Entorno

```bash
go env -w GOPRIVATE="github.com/your-org/*"
go env -w GOSUMDB=off                            # private modules skip sumdb
```

Equivalente per-shell:

```bash
export GOPRIVATE="github.com/your-org/*"
export GOSUMDB=off
```

### SSH (developers)

```bash
git config --global url."git@github.com:".insteadOf "https://github.com/"
```

Requiere una SSH key registrada en GitHub
(`ssh-keygen -t ed25519 -C "you@example.com"` y agregá el `.pub` en
[github.com/settings/keys](https://github.com/settings/keys)).

### Token (CI / headless)

```bash
cat > ~/.netrc <<EOF
machine github.com
  login x-access-token
  password ${GITHUB_TOKEN}
EOF
chmod 600 ~/.netrc
```

En GitHub Actions de los repos consumer que necesiten traer módulos
privados tuyos, generá un token fine-grained con acceso de lectura a esos
repositorios y bindealo antes de `go mod download`:

```yaml
- name: Configure netrc
  run: |
    cat > ~/.netrc <<EOF
    machine github.com
      login x-access-token
      password ${{ secrets.PRIVATE_MODULES_READ_TOKEN }}
    EOF
    chmod 600 ~/.netrc
```

## 3. Quickstart — `host.App`

`host.App` es el entry point recomendado. Conecta `auth + metadata + CRUD
dinámico + hub de WebSocket` y, cuando está habilitado, `permission`,
`push`, `webhooks` y métricas de Prometheus. El embedder mínimo tiene dos
pantallas de largo:

```go
package main

import (
    "log"
    "os"

    "github.com/gofiber/fiber/v2"
    "gorm.io/driver/postgres"
    "gorm.io/gorm"

    "github.com/asteby/metacore-kernel/host"
    "github.com/asteby/metacore-kernel/modelbase"
)

type Product struct {
    modelbase.BaseUUIDModel
    Name  string  `gorm:"size:120;not null" json:"name"`
    Price float64 `json:"price"`
}

// modelbase.ModelDefiner is the contract dynamic / metadata use to introspect
// a model. It has three methods — TableName, DefineTable, DefineModal.
func (Product) TableName() string { return "products" }

func (Product) DefineTable() modelbase.TableMetadata {
    return modelbase.TableMetadata{
        Title: "Products",
        Columns: []modelbase.ColumnDef{
            {Key: "name",  Label: "Name",  Type: "text",   Sortable: true},
            {Key: "price", Label: "Price", Type: "number", Sortable: true},
        },
        SearchColumns:     []string{"name"},
        EnableCRUDActions: true,
    }
}

func (Product) DefineModal() modelbase.ModalMetadata {
    return modelbase.ModalMetadata{
        Title: "Product",
        Fields: []modelbase.FieldDef{
            {Key: "name",  Label: "Name",  Type: "text",   Required: true},
            {Key: "price", Label: "Price", Type: "number"},
        },
    }
}

func main() {
    db, err := gorm.Open(postgres.Open(os.Getenv("DATABASE_URL")), &gorm.Config{})
    if err != nil {
        log.Fatalf("db: %v", err)
    }

    app := host.NewApp(host.AppConfig{
        DB:             db,
        JWTSecret:      []byte(os.Getenv("JWT_SECRET")),
        RunMigrations:  true,
        EnableMetrics:  true,
        EnableWebhooks: true,
    }).RegisterModel("products", func() modelbase.ModelDefiner {
        return &Product{}
    })
    defer app.Stop()

    fiberApp := fiber.New()

    // app.Mount returns the authenticated sub-router so apps can append
    // their own domain routes on top of the kernel-provided ones.
    api := app.Mount(fiberApp.Group("/api"))
    api.Get("/me", func(c *fiber.Ctx) error { /* … */ return nil })

    log.Fatal(fiberApp.Listen(":3000"))
}
```

`App.RegisterModel(key, factory)` ([`host/app.go`](https://github.com/asteby/metacore-kernel/blob/main/host/app.go)) conecta
una factory en el registry del kernel. La factory DEBE devolver una
instancia fresca y zero-valued en cada llamada — `dynamic.Service`
instancia una por request y la muta. El valor devuelto DEBE satisfacer
`modelbase.ModelDefiner`:

```go
type ModelDefiner interface {
    TableName() string
    DefineTable() TableMetadata
    DefineModal() ModalMetadata
}
```

`TableName` selecciona la tabla de la base de datos (debe matchear la tabla
que el kernel creó — ver [`dynamic-system.md`](./dynamic-system) para
addons declarativos cuyas tablas las produce el installer). `DefineTable`
y `DefineModal` manejan los endpoints de metadata y, por extensión, la UI
de runtime-react. Cualquier cambio en los JSON tags sobre `TableMetadata` /
`ModalMetadata` es un bump de versión MAJOR — son parte del contrato del
wire.

Lo que recibís gratis:

| Mount point                | Origen        | Notas                                                  |
| -------------------------- | ------------- | ------------------------------------------------------ |
| `POST /api/auth/login`     | `auth/`       | Emisión de JWT, verificación de password               |
| `POST /api/auth/refresh`   | `auth/`       | Rotación de access token                               |
| `GET  /api/metadata/:name` | `metadata/`   | `TableMetadata` / `ModalMetadata` cacheada             |
| CRUD `GET/POST/PUT/DELETE` | `dynamic/`    | Genérico sobre cada modelo registrado                  |
| `GET  /api/push/*`         | `push/`       | Web Push (cuando `EnablePush=true`)                    |
| `GET  /api/webhooks/*`     | `webhooks/`   | Cuando `EnableWebhooks=true`                           |
| `GET  /api/ws?token=…`     | `ws/`         | Upgrade de WebSocket                                   |
| `GET  /metrics`            | `metrics/`    | Exposición de Prometheus (`EnableMetrics=true`)        |

## 4. Agregar el plano de addons — `host.Host`

Si tu app debería hostear addons WASM federados (install/enable/disable,
hooks de ciclo de vida, merge de navegación), construí un `host.Host` al
lado del `host.App`. Los dos comparten el mismo `*gorm.DB`.

```go
import (
    "github.com/asteby/metacore-kernel/host"
    "github.com/asteby/metacore-kernel/lifecycle"
)

h, err := host.New(host.Config{
    DB:            db,
    KernelVersion: "0.2.0",
    Services: map[string]any{
        "eventbus": bus,
        "fiscal":   fiscalSvc,
    },
})
if err != nil {
    log.Fatal(err)
}

// Compiled-in addons (Go code linked into the host binary)
h.RegisterCompiled("billing", &billing.Addon{})

// Run every addon's Boot() hook with the shared services.
if err := h.Boot(); err != nil {
    log.Fatal(err)
}

// Render the merged sidebar for an organization.
groups, err := h.Navigation(orgID, coreGroups)
```

Tipos de addon:

- **Compilado** — código Go linkeado en el host. Highest trust, invocación
  más rápida; registrado vía `RegisterCompiled`.
- **Declarativo** — solo manifest. Behavior conectado vía webhooks e
  interceptors registrados en `Boot()`.
- **WASM federado** — `bundle.tgz` producido por `metacore-sdk`,
  instalado vía `installer.Installer`. El kernel verifica la firma del
  manifest, materializa cualquier asset de frontend bajo `FrontendBasePath`,
  y le pasa el módulo WASM a `runtime/wasm.Host` para ejecución bajo el
  enforcer de capabilities.

## 5. Storage y migraciones

El kernel publica **migraciones SQL versionadas** para sus propias tablas
(`auth`, `webhooks`, `push`, `installer`, `eventlog`, `notifications`).

```go
host.NewApp(host.AppConfig{
    DB:            db,
    JWTSecret:     secret,
    RunMigrations: true, // recommended for production
})
```

`RunMigrations: true` invoca `migrations.Runner` (basado en Goose, trackea
estado en `goose_db_version`). Setearlo a `false` cae en `AutoMigrate` de
GORM para el mismo set de tablas — conveniente localmente, pero inseguro
entre upgrades del kernel. Tratá AutoMigrate como un path solo para
desarrollo.

PostgreSQL es el driver soportado en producción. El kernel además testea
contra SQLite (`gorm.io/driver/sqlite`) para escenarios embebidos; el
kilometraje en features específicos del dialecto puede variar.

## 6. Modelo de capabilities y modos de seguridad

Cada operación que un addon emite y que toca el host (DB read, event
publish, llamada HTTP saliente) pasa por `security.Enforcer`. El enforcer
tiene dos modos:

- `ModeShadow` — loggea violaciones, nunca bloquea. Default durante rollout.
- `ModeEnforce` — devuelve un error en violaciones.

Los operadores switchean el modo en runtime vía la variable de entorno
`METACORE_ENFORCE` (`1`, `true`, `yes` habilitan enforce). Sin redeploy.

```go
enf := security.NewEnforcer(security.ModeFromEnv())
```

Las capabilities se declaran por addon en su manifest y se resuelven a un
set `Capabilities` compilado al momento del install. Ejemplos:

| Capability         | Otorgada a                                        |
| ------------------ | ------------------------------------------------- |
| `event:emit`       | Addons que necesitan publicar en el bus in-process |
| `event:subscribe`  | Addons que consumen eventos (wildcard soportado)  |
| `db:read`          | Acceso de read vía el servicio de CRUD dinámico   |
| `http:fetch`       | HTTP saliente desde adentro del sandbox WASM      |

Las violaciones se reportan vía el logger estructurado del kernel; en modo
shadow aparecen como `level=warn category=enforcer mode=shadow` así los
operadores pueden auditar uso antes de switchear a enforce.

La lista completa de capabilities y el formato de la sección del manifest
que las declara vive en la documentación del SDK (`docs/manifest.md`).

El kernel también publica un sistema de capabilities **a nivel usuario**
(`permission.Service`) que gatea cada request CRUD dinámico con
capabilities `<resource>.<action>`. Conectá
`host.AppConfig.PermissionStore` para encenderlo. Ver
[`permissions.md`](./permissions) para el modelo completo (stores,
super-roles, middleware de gate de Fiber, gates de addon vs usuario).

## 7. Hub de WebSocket

El hub se monta automáticamente desde `host.App.Mount` en `/api/ws`. El
auth es JWT-based, tomado del query string `?token=` al momento del upgrade:

```
wss://api.example.com/api/ws?token=<jwt>
```

Mandá mensajes desde tu código de dominio:

```go
app.WSHub.SendToUsers(userIDs, ws.Message{
    Type:    ws.MsgNotification,
    Payload: payload,
})
```

`MessageType` es un string plano; declará tus propias constantes en código
de app sin forkear el package. El hub no persiste nada — conectá el hook
opcional `OnNotification` si tu app necesita storage durable.

## 8. Updates en tiempo real

La capa de CRUD dinámico **no** broadcastea cambios de fila automáticamente.
El kernel publica el hub; el host decide quién recibe un mensaje. El
patrón recomendado es wrappear el servicio dinámico para que cada mutación
publique un mensaje tipado a los usuarios afectados:

```go
import (
    "context"

    "github.com/asteby/metacore-kernel/dynamic"
    "github.com/asteby/metacore-kernel/modelbase"
    "github.com/asteby/metacore-kernel/ws"
    "github.com/google/uuid"
)

const MsgTicketCreated ws.MessageType = "TICKET_CREATED"

type ticketRealtime struct {
    dyn  *dynamic.Service
    hub  *ws.Hub
    orgUserIDs func(context.Context, uuid.UUID) []uuid.UUID
}

func (t *ticketRealtime) Create(ctx context.Context, user modelbase.AuthUser, in map[string]any) (map[string]any, error) {
    out, err := t.dyn.Create(ctx, "tickets", user, in)
    if err != nil {
        return nil, err
    }
    t.hub.SendToUsers(
        t.orgUserIDs(ctx, user.GetOrganizationID()),
        ws.Message{Type: MsgTicketCreated, Payload: out},
    )
    return out, nil
}
```

`Hub.SendToUsers` ([`ws/hub.go`](https://github.com/asteby/metacore-kernel/blob/main/ws/hub.go)) es fire-and-forget,
no bloqueante y per-process. Para deploys multi-replica, hacé fan-out vía
el bus de eventos del addon ([`events/`](https://github.com/asteby/metacore-kernel/blob/main/events/)) y hacé que cada
réplica se subscriba a un forwarder que re-publique a su hub local — el hub
es una primitiva process-local a propósito.

Para hooks per-modelo, registrá en un `dynamic.HookRegistry` y pasalo a
`dynamic.Config.Hooks` (el registry está keyado por nombre de modelo):

```go
hooks := dynamic.NewHookRegistry()
hooks.RegisterAfterCreate("tickets", func(ctx context.Context, hc dynamic.HookContext, record any) error {
    hub.SendToUsers(
        orgUserIDs(ctx, hc.User.GetOrganizationID()),
        ws.Message{Type: MsgTicketCreated, Payload: record},
    )
    return nil
})
```

Ver [`dynamic-system.md`](./dynamic-system), sección *Updates en tiempo real*,
para el rationale y los trade-offs.

## 9. Template de Renovate

Copiá [`docs/consumer-renovate-template.json`](./consumer-renovate-template.json)
al root de tu repo consumer como `renovate.json`. El template codifica la
política que el ecosistema acordó:

```json
{
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "extends": ["config:recommended", ":semanticCommits"],
  "schedule": ["before 6am on monday"],
  "packageRules": [
    {
      "matchManagers": ["gomod"],
      "matchPackagePatterns": ["^github.com/asteby/metacore-kernel"],
      "matchUpdateTypes": ["patch", "minor"],
      "automerge": true,
      "platformAutomerge": true,
      "groupName": "metacore-kernel"
    },
    {
      "matchManagers": ["gomod"],
      "matchPackagePatterns": ["^github.com/asteby/metacore-kernel"],
      "matchUpdateTypes": ["major"],
      "automerge": false,
      "labels": ["breaking", "review-required"]
    }
  ]
}
```

Prerrequisitos en el repo consumer:

1. **Renovate GitHub App** instalado con acceso al repo.
2. **Allow auto-merge** en Settings → General (habilita `platformAutomerge`).
3. **Branch protection** sobre `main` requiriendo CI green antes del merge.
4. Un token con `repo:read` sobre `asteby/metacore-kernel`, expuesto a
   Renovate vía `hostRules` (Renovate Cloud) o `secrets.RENOVATE_GITHUB_TOKEN`
   (self-hosted).

### Dispatch on-demand

El workflow de release del kernel dispara `repository_dispatch` con
`event_type=metacore-kernel-released` a cada consumer cuando se publica un
tag. Agregá lo siguiente a los repos consumer para triggerear Renovate
inmediatamente en lugar de esperar al próximo tick del cron:

```yaml
# .github/workflows/renovate-trigger.yml
name: Renovate on kernel release
on:
  repository_dispatch:
    types: [metacore-kernel-released]
jobs:
  trigger:
    runs-on: ubuntu-latest
    steps:
      - uses: renovatebot/github-action@v40
        with:
          token: ${{ secrets.RENOVATE_TOKEN }}
          configurationFile: renovate.json
```

## 10. Política de SemVer

El kernel sigue [SemVer 2.0](https://semver.org/) estrictamente. Cuando
Renovate abre un PR de bump, leé el delta de versión:

| Bump                           | Significado                                             | Acción default     |
| ------------------------------ | ------------------------------------------------------- | ------------------ |
| `vX.Y.Z` → `vX.Y.(Z+1)`        | Patch — solo bug fixes                                  | Auto-merge con CI green |
| `vX.Y.Z` → `vX.(Y+1).0`        | Minor — nuevos symbols, backward-compatible             | Auto-merge si tu CI ejercita las routes del kernel |
| `vX.Y.Z` → `v(X+1).0.0`        | Major — cambios breaking de API; cambia el import path (`/v2`) | Review manual requerido |

Lo que nunca hacemos: cambiar silenciosamente el significado de un symbol
exportado dentro del mismo major. Agregar un método a una interfaz, sacar un
campo de una struct pública, o cambiar la firma de una función es siempre un
bump major (ver `ARCHITECTURE.md`, *Semver discipline*).

### Señales de riesgo en un PR de Renovate

- **CI falla en el consumer** — no mergees; abrí un issue upstream.
- **El changelog menciona schema change** — verificá que tu migration runner
  esté configurado (`RunMigrations: true`).
- **Minor pre-1.0 (`v0.5` → `v0.6`)** — tratalo como potencialmente breaking
  aunque técnicamente sea minor; los releases `v0.x` retienen el derecho a
  romper.

## 11. Flujo de release de punta a punta

```
[Kernel] git tag vX.Y.Z && git push --tags
       │
       ▼
[Kernel] Release workflow: tests → proxy ping → GoReleaser → dispatch
       │
       ▼
[Consumer] repository_dispatch received → Renovate runs
       │
       ▼
[Consumer] PR "chore(deps): update github.com/asteby/metacore-kernel to vX.Y.Z"
       │
       ▼
[Consumer] CI green → Renovate auto-merge → main updated
       │
       ▼
[Consumer] Deploy pipeline (out of scope for this repo)
```

La latencia de punta a punta es típicamente de 5 a 15 minutos desde
`git push --tags` al `main` de cada consumer.

## 12. FAQ

**¿Puedo bypassear el Go proxy?**
Sí. `GOPROXY=direct go get github.com/asteby/metacore-kernel@<branch-or-sha>`
lo trae directo de GitHub. Útil para testear trabajo sin tag.

**¿Cómo pineo a un commit específico?**
`go get github.com/asteby/metacore-kernel@<sha>` resuelve a una pseudo-version
(`v0.0.0-YYYYMMDDhhmmss-<sha12>`) — está bien para branches de desarrollo,
no usarla en releases de producción.

**¿Puedo forkear el kernel?**
Forkear rompe Renovate para tu consumer (dejás de recibir bumps upstream)
y forkea tu modelo de seguridad. Abrí un issue o un PR upstream en su lugar.

**¿Dónde está documentada la ABI de WASM?**
La fuente única de verdad vive en el SDK en `docs/wasm-abi.md`. La
implementación es `runtime/wasm/abi.go` en este repo.

**Mi handler importa `fiber`. ¿El kernel está bloqueado al framework?**
Los servicios (tipos `*.Service`) son agnósticos al framework y aceptan
`context.Context`. Los handlers (`*.Handler`) son específicos a Fiber por
convención. Si cambiás de transport (gRPC, Echo, Lambda), consumí los
servicios directamente y escribí tu propio handler — ver
`ARCHITECTURE.md`, *Law 3*.
