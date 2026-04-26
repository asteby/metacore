<p align="center">
  <img src="/logo.svg" width="120" alt="Metacore Kernel" />
</p>

<h1 align="center">Inicio rápido de embedding</h1>

<p align="center"><em>Tu primer host con el kernel embebido — en 10 minutos.</em></p>

---

## Tabla de contenidos

- [Objetivo](#objetivo)
- [Prerrequisitos](#prerrequisitos)
- [1. Nuevo módulo Go](#1-nuevo-módulo-go)
- [2. Conectar main.go](#2-conectar-maingo)
- [3. Storage y migraciones](#3-storage-y-migraciones)
- [4. Levantar el plano de addons](#4-levantar-el-plano-de-addons)
- [5. Instalar tu primer addon](#5-instalar-tu-primer-addon)
- [6. Verificar los endpoints de CRUD dinámico](#6-verificar-los-endpoints-de-crud-dinámico)
- [7. Combinar con un frontend](#7-combinar-con-un-frontend)
- [Próximos pasos](#próximos-pasos)

---

## Objetivo

Levantar un servidor HTTP basado en Fiber que:

- expone `auth + metadata + CRUD dinámico + hub de WebSocket` (vía `host.App`),
- corre el plano de ciclo de vida de addons (vía `host.Host`),
- acepta un bundle de addon de ejemplo y convierte sus `model_definitions[]`
  en endpoints CRUD vivos,
- aplica capabilities de usuario y capabilities de addon.

Si solo querés la capa de CRUD dinámico sin el plano de addons, salteá la
sección 4.

## Prerrequisitos

| Tool      | Versión          |
| --------- | ---------------- |
| Go        | 1.25+            |
| Postgres  | 14+              |
| Acceso a GitHub | `GOPRIVATE="github.com/asteby/*"` configurado (ver [`consumer-guide.md`](consumer-guide#2-acceso-a-módulos-privados)) |

```bash
go env -w GOPRIVATE="github.com/asteby/*"
git config --global url."git@github.com:".insteadOf "https://github.com/"
```

## 1. Nuevo módulo Go

```bash
mkdir my-host && cd my-host
go mod init example.com/my-host
go get github.com/asteby/metacore-kernel@latest
go get github.com/gofiber/fiber/v2 gorm.io/gorm gorm.io/driver/postgres github.com/google/uuid
```

## 2. Conectar main.go

```go
package main

import (
    "log"
    "os"

    "github.com/gofiber/fiber/v2"
    "gorm.io/driver/postgres"
    "gorm.io/gorm"

    "github.com/asteby/metacore-kernel/host"
    "github.com/asteby/metacore-kernel/permission"
)

func main() {
    db, err := gorm.Open(
        postgres.Open(os.Getenv("DATABASE_URL")),
        &gorm.Config{},
    )
    if err != nil {
        log.Fatalf("db: %v", err)
    }

    // GORM-backed permission store. Production default.
    permStore, err := permission.NewGormStore(db)
    if err != nil {
        log.Fatalf("permission store: %v", err)
    }

    app := host.NewApp(host.AppConfig{
        DB:              db,
        JWTSecret:       []byte(host.MustGetenv("JWT_SECRET")),
        RunMigrations:   true,            // versioned SQL via migrations.Runner
        EnableMetrics:   true,            // exposes /api/metrics
        EnableWebhooks:  true,
        PermissionStore: permStore,       // turn on user-level CRUD gates
    })
    defer app.Stop()

    fiberApp := fiber.New()
    api := app.Mount(fiberApp.Group("/api"))

    // Layer your own domain endpoints on top of the kernel's.
    api.Get("/me", whoAmI)

    log.Fatal(fiberApp.Listen(":3000"))
}

func whoAmI(c *fiber.Ctx) error {
    return c.JSON(fiber.Map{"ok": true})
}
```

Lo que esto te da gratis, sin escribir ni un solo handler:

| Mount point                               | Origen        |
| ----------------------------------------- | ------------- |
| `POST /api/auth/login`                    | [`auth/`](https://github.com/asteby/metacore-kernel/blob/main/auth/)         |
| `POST /api/auth/refresh`                  | [`auth/`](https://github.com/asteby/metacore-kernel/blob/main/auth/)         |
| `GET  /api/metadata/table/:model`         | [`metadata/`](https://github.com/asteby/metacore-kernel/blob/main/metadata/) |
| `GET  /api/metadata/modal/:model`         | [`metadata/`](https://github.com/asteby/metacore-kernel/blob/main/metadata/) |
| `GET  /api/metadata/all`                  | [`metadata/`](https://github.com/asteby/metacore-kernel/blob/main/metadata/) |
| `GET/POST/PUT/DELETE /api/dynamic/:model` | [`dynamic/`](https://github.com/asteby/metacore-kernel/blob/main/dynamic/) (auto-montado) |
| `GET  /api/options/:model`                | [`dynamic/`](https://github.com/asteby/metacore-kernel/blob/main/dynamic/) (el host llama `MountOptions` para habilitarlo) |
| `GET  /api/search/:model`                 | [`dynamic/`](https://github.com/asteby/metacore-kernel/blob/main/dynamic/) (el host llama `MountOptions` para habilitarlo) |
| `GET  /api/webhooks/*`                    | [`webhooks/`](https://github.com/asteby/metacore-kernel/blob/main/webhooks/) |
| `GET  /api/ws?token=…`                    | [`ws/`](https://github.com/asteby/metacore-kernel/blob/main/ws/)             |
| `GET  /api/metrics`                       | [`metrics/`](https://github.com/asteby/metacore-kernel/blob/main/metrics/) (montado en el mismo router pasado a `Mount`) |

La lista completa de routes y los knobs de configuración están en
[`host/app.go`](https://github.com/asteby/metacore-kernel/blob/main/host/app.go).

## 3. Storage y migraciones

`RunMigrations: true` invoca el runner basado en Goose
([`migrations/runner.go`](https://github.com/asteby/metacore-kernel/blob/main/migrations/)) en cada boot — idempotente,
estado trackeado en la tabla `goose_db_version`. Este es el path
recomendado para producción.

Setearlo a `false` cae en `AutoMigrate` de GORM para las tablas propias del
kernel — está bien localmente, inseguro entre upgrades del kernel.

PostgreSQL es el driver soportado en producción; SQLite se usa solo en tests.

## 4. Levantar el plano de addons

Si tu host debería aceptar bundles de addons (install / enable / disable /
uninstall, hooks de ciclo de vida, merge de navegación, schema dinámico),
construí un `host.Host` al lado del `host.App`. Comparten el mismo `*gorm.DB`.

```go
import "github.com/asteby/metacore-kernel/host"

h, err := host.New(host.Config{
    DB:            db,
    KernelVersion: "0.2.0",
    Services: map[string]any{
        // Anything addon Boot() hooks need.
        // "eventbus": eventBus,
    },
})
if err != nil {
    log.Fatalf("host.New: %v", err)
}

if err := h.Boot(); err != nil {
    log.Fatalf("Boot: %v", err)
}
```

`host.Host` ([`host/host.go`](https://github.com/asteby/metacore-kernel/blob/main/host/host.go)) es dueño del `Installer`,
`Lifecycles` e `Interceptors`. Los addons compilados in-process se registran
antes de `Boot`:

```go
h.RegisterCompiled("billing", &billing.Addon{})
```

## 5. Instalar tu primer addon

Leé un bundle `tickets.tgz` (producido por `metacore build`) desde disco y
pasáselo al installer:

```go
import (
    "os"

    "github.com/asteby/metacore-kernel/bundle"
    "github.com/google/uuid"
)

f, err := os.Open("/var/addons/tickets.tgz")
if err != nil {
    log.Fatalf("open bundle: %v", err)
}
defer f.Close()

b, err := bundle.Read(f, 64<<20) // 64 MiB max decompressed
if err != nil {
    log.Fatalf("read bundle: %v", err)
}

orgID := uuid.MustParse("11111111-1111-1111-1111-111111111111")
inst, secret, err := h.Installer.Install(orgID, b)
if err != nil {
    log.Fatalf("install: %v", err)
}
log.Printf("installed %s@%s id=%s (secret len=%d)", inst.AddonKey, inst.Version, inst.ID, len(secret))
```

`Installer.Install` ([`installer/installer.go`](https://github.com/asteby/metacore-kernel/blob/main/installer/installer.go)):

1. Valida el manifest contra la `KernelVersion` corriendo.
2. Crea el schema Postgres del addon (`addon_tickets`).
3. Aplica cualquier migración SQL versionada incluida en el bundle.
4. Para cada entrada `model_definitions[]`: `CREATE TABLE IF NOT EXISTS` y
   `ADD COLUMN IF NOT EXISTS` (sync aditivo).
5. Dispara el ciclo de vida `OnInstall` y luego `OnEnable`.
6. Persiste la fila `metacore_installations` con un secret HMAC fresco
   por instalación (devuelto al caller, hasheado en reposo).

No hay un comando `metacore migrate` separado — instalar **es** el trigger
de migración. Re-correr el install sobre el mismo bundle es seguro.

Para los modelos que el host necesita direccionar por short key desde URLs
de CRUD, registrá la factory después de instalar:

```go
import (
    "github.com/asteby/metacore-kernel/modelbase"
)

app.RegisterModel("tickets", func() modelbase.ModelDefiner {
    // Return a fresh instance that satisfies modelbase.ModelDefiner.
    // Compiled-in models implement the interface directly; for purely
    // declarative addons, hosts typically synthesize an instance from
    // the manifest (dynamic.BuildStructType + a small ModelDefiner shim).
    return &tickets.Ticket{}
})
```

Mirá [`dynamic-system.md`](./dynamic-system) para el walkthrough completo del
installer y cómo el registry alimenta la capa de CRUD dinámico.

## 6. Verificar los endpoints de CRUD dinámico

```bash
# Authenticate (replace with your auth flow).
JWT="$(curl -s -X POST -H 'Content-Type: application/json' \
  -d '{"email":"alice@example.com","password":"secret"}' \
  http://localhost:3000/api/auth/login | jq -r .data.token)"

# Probe metadata.
curl -s -H "Authorization: Bearer $JWT" \
  http://localhost:3000/api/metadata/table/tickets | jq

# Create.
curl -s -X POST -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" \
  -d '{"subject":"Test","status":"open","priority":"normal"}' \
  http://localhost:3000/api/dynamic/tickets | jq

# List.
curl -s -H "Authorization: Bearer $JWT" \
  "http://localhost:3000/api/dynamic/tickets?per_page=10&sortBy=created_at&order=desc" | jq
```

Respuesta esperada de list:

```json
{
  "success": true,
  "data": [ /* tickets */ ],
  "meta":  { "total": 1, "page": 1, "per_page": 10, "last_page": 1 }
}
```

La referencia completa de request/response está en [`dynamic-api.md`](./dynamic-api).

Si recibís `{"success": false, "message": "permission denied: ..."}`, al
usuario le falta la capability relevante — sembrá un grant de role:

```go
_ = permStore.GrantRole(ctx, permission.RoleAdmin, permission.Cap("tickets", "create"))
_ = permStore.GrantRole(ctx, permission.RoleAdmin, permission.Cap("tickets", "read"))
_ = permStore.GrantRole(ctx, permission.RoleAdmin, permission.Cap("tickets", "update"))
_ = permStore.GrantRole(ctx, permission.RoleAdmin, permission.Cap("tickets", "delete"))
```

Mirá [`permissions.md`](./permissions) para el modelo completo de capabilities.

## 7. Combinar con un frontend

Los frontends que corren `@asteby/metacore-runtime-react` consumen los
endpoints de metadata + CRUD sin código por modelo:

```tsx
import { DynamicTable } from "@asteby/metacore-runtime-react";

export default function TicketsPage() {
  return <DynamicTable model="tickets" />;
}
```

Conectá el runtime a la base URL de tu host y al JWT — la
[Guía del consumidor](/es/sdk/consumer-guide) del SDK cubre la integración
con React de punta a punta. El contrato entre este kernel y el SDK es la
shape JSON de `TableMetadata`, `ModalMetadata`, el envelope de respuesta de
CRUD dinámico y el formato de mensajes de WebSocket — todo estable entre
versiones minor.

## Próximos pasos

- [`dynamic-system.md`](./dynamic-system) — qué pasa realmente cuando un
  addon publica `model_definitions[]`.
- [`dynamic-api.md`](./dynamic-api) — cada endpoint, cada parámetro.
- [`permissions.md`](./permissions) — gates de usuario, gates de addon, modos.
- [`consumer-guide.md`](./consumer-guide) — guía extensa de embedding.
- [`dev-setup.md`](./dev-setup) — cómo contribuir al kernel mismo.
