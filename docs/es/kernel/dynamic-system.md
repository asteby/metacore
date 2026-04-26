<p align="center">
  <img src="/logo.svg" width="120" alt="Metacore Kernel" />
</p>

<h1 align="center">Framework de CRUD dinámico</h1>

<p align="center">
  <em>De <code>manifest.json</code> a una UI CRUD funcional con cero líneas de código de glue.</em>
</p>

---

## Tabla de contenidos

- [La promesa](#la-promesa)
- [Modelo mental](#modelo-mental)
- [Walkthrough de punta a punta](#walkthrough-de-punta-a-punta)
  - [1. Declarar el modelo](#1-declarar-el-modelo)
  - [2. Instalar el addon](#2-instalar-el-addon)
  - [3. Endpoints expuestos automáticamente](#3-endpoints-expuestos-automáticamente)
  - [4. Metadata para la UI](#4-metadata-para-la-ui)
  - [5. Renderizado en frontend](#5-renderizado-en-frontend)
- [Aislamiento de schema y RLS](#aislamiento-de-schema-y-rls)
- [Gates de permisos](#gates-de-permisos)
- [Updates en tiempo real](#updates-en-tiempo-real)
- [Lo que NO es automático](#lo-que-no-es-automático)
- [Ver también](#ver-también)

---

## La promesa

Cuando un addon publica un bloque `model_definitions[]` en su `manifest.json`,
el kernel hace todo el trabajo de substrate detrás de la página CRUD resultante:

| Vos declarás en el manifest             | El kernel produce                                                  |
| --------------------------------------- | ------------------------------------------------------------------ |
| `model_definitions[].table_name`        | `CREATE TABLE addon_<key>.<table>` en el schema aislado del addon  |
| `model_definitions[].columns[]`         | Columnas de Postgres con tipos, defaults, indexes, unique constraints |
| `org_scoped: true`                      | Columna `organization_id` + policy de Row-Level Security           |
| `soft_delete: true`                     | Columna `deleted_at`                                               |
| (modelo registrado vía `RegisterModel`) | Routes Fiber `GET/POST/PUT/DELETE /dynamic/<model>`                |
| Hint UI `model_definitions[].table`     | `GET /metadata/table/<model>` (TableMetadata)                      |
| Hint UI `model_definitions[].modal`     | `GET /metadata/modal/<model>` (ModalMetadata)                      |
| `capabilities[].kind`                   | Gate por request vía `permission.Service`                          |

Los frontends que consumen `@asteby/metacore-runtime-react` renderizan la
tabla, el modal de create/edit y los pickers de option a partir de esas
respuestas de metadata. Sin React custom, sin handlers por modelo, sin
migraciones de glue.

## Modelo mental

```
manifest.json                          Kernel                              HTTP
─────────────                          ──────                              ────
                                                                         GET  /metadata/table/:model
model_definitions[]  ──┐               ┌─► metadata.Service ─────────►   GET  /metadata/modal/:model
                       │               │                                  GET  /metadata/all
                       ▼               │
                   installer.Install   │                                  GET    /dynamic/:model
                       │               │                                  POST   /dynamic/:model
                       ├──► dynamic.CreateTable (DDL)                     GET    /dynamic/:model/:id
                       ├──► dynamic.SyncSchema  (ALTER ADD COLUMN)        PUT    /dynamic/:model/:id
                       └──► modelbase.Register (model factory)            DELETE /dynamic/:model/:id
                                       │
                                       ├─► dynamic.Service ─────────────► (handler.Mount)
                                       │                                  GET /options/:model
                                       │                                  GET /search/:model
capabilities[]      ──► permission.Service ◄──── per-request gate
                        security.Enforcer  ◄──── addon-side guard
```

El framework es **declarativo en el límite** (manifest, capabilities,
metadata) y **reflectivo por dentro** — `dynamic.BuildStructType` sintetiza
una struct compatible con GORM a partir de la lista de columnas en runtime,
así un upgrade del kernel que agrega un nuevo tipo de columna ilumina cada
addon existente sin rebuildear binarios de addon.

## Walkthrough de punta a punta

Vamos a seguir un addon hipotético `tickets`. Cada snippet que sigue es un
artefacto literal del flujo de install — no es pseudo-código.

### 1. Declarar el modelo

```json
{
  "key": "tickets",
  "name": "Tickets",
  "version": "0.1.0",
  "kernel": ">=0.2.0",
  "tenant_isolation": "shared",

  "model_definitions": [
    {
      "table_name": "tickets",
      "model_key":  "tickets",
      "label":      "Tickets",
      "org_scoped": true,
      "soft_delete": true,
      "columns": [
        { "name": "subject",  "type": "string",  "size": 200, "required": true, "index": true },
        { "name": "status",   "type": "string",  "size": 24,  "required": true, "default": "'open'" },
        { "name": "priority", "type": "string",  "size": 12,  "default": "'normal'" },
        { "name": "body",     "type": "text" },
        { "name": "due_at",   "type": "timestamp" }
      ],
      "table": {
        "title": "Tickets",
        "searchColumns": ["subject"],
        "columns": [
          { "key": "subject",  "label": "Subject",  "type": "text",   "sortable": true },
          { "key": "status",   "label": "Status",   "type": "badge",  "filterable": true },
          { "key": "priority", "label": "Priority", "type": "badge",  "filterable": true },
          { "key": "due_at",   "label": "Due",      "type": "date",   "sortable": true }
        ],
        "enableCRUDActions": true
      },
      "modal": {
        "title": "Ticket",
        "fields": [
          { "key": "subject",  "label": "Subject",  "type": "text",     "required": true },
          { "key": "status",   "label": "Status",   "type": "select",
            "options": [
              { "value": "open",     "label": "Open" },
              { "value": "pending",  "label": "Pending" },
              { "value": "resolved", "label": "Resolved" }
            ]
          },
          { "key": "priority", "label": "Priority", "type": "select",
            "options": [
              { "value": "low",    "label": "Low" },
              { "value": "normal", "label": "Normal" },
              { "value": "high",   "label": "High" }
            ]
          },
          { "key": "body",   "label": "Body",  "type": "textarea" },
          { "key": "due_at", "label": "Due",   "type": "date" }
        ]
      }
    }
  ],

  "capabilities": [
    { "kind": "db:read",  "target": "addon_tickets.*", "reason": "Read own tickets" },
    { "kind": "db:write", "target": "addon_tickets.*", "reason": "Create and edit tickets" }
  ]
}
```

El schema completo está en [`manifest/manifest.go`](https://github.com/asteby/metacore-kernel/blob/main/manifest/manifest.go).
Los tipos de columna permitidos son: `string` (varchar con `size`), `text`, `uuid`,
`int` / `integer`, `bigint`, `decimal` / `numeric` / `float` / `double`,
`bool` / `boolean`, `timestamp` / `datetime`, `date`, `jsonb` / `json`. Ver
[`dynamic/model.go`](https://github.com/asteby/metacore-kernel/blob/main/dynamic/model.go) para el mapeo canónico.

### 2. Instalar el addon

Una aplicación host llama al installer con un bundle parseado:

```go
inst, secret, err := h.Installer.Install(orgID, bundle)
```

`installer.Install` ([`installer/installer.go`](https://github.com/asteby/metacore-kernel/blob/main/installer/installer.go))
corre, en orden:

1. `bundle.Manifest.Validate(kernelVersion)` — chequeo de compatibilidad semver.
2. `dynamic.EnsureSchema` — `CREATE SCHEMA IF NOT EXISTS addon_tickets`.
3. `dynamic.Apply` — corre cada migración SQL versionada incluida en el
   bundle, en una transacción, con locking por checksum.
4. Por cada `ModelDefinition`:
   - `dynamic.CreateTable` — `CREATE TABLE IF NOT EXISTS addon_tickets.tickets
     (...)`. Cuando el manifest declara `tenant_isolation: shared` y la
     definición es `org_scoped`, el kernel además habilita Row-Level
     Security de Postgres con una policy clavada en `current_setting('app.current_org')`.
   - `dynamic.SyncSchema` — `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` para
     cualquier columna que el manifest declare pero que falte en la tabla
     existente (solo aditivo; renames y drops requieren migraciones explícitas).
5. Hooks de ciclo de vida: `OnInstall` y luego `OnEnable`.
6. Persiste una fila `metacore_installations` con un secret HMAC fresco
   por instalación (devuelto al caller, hasheado en DB).

**No hay CLI `metacore migrate`**. La migración corre como side effect de
instalar el addon, y es totalmente idempotente — re-correr el mismo install
es un no-op.

### 3. Endpoints expuestos automáticamente

Una vez que el host llama `app.RegisterModel("tickets", factory)` y monta el
`host.App` ([`host/app.go`](https://github.com/asteby/metacore-kernel/blob/main/host/app.go)), cada request abajo queda
conectado sin más código:

| Método | Path                          | Comportamiento                                                  |
| ------ | ----------------------------- | --------------------------------------------------------------- |
| GET    | `/api/dynamic/tickets`        | List paginado (`?page`, `?per_page`, `?sortBy`, `?order`, `?search`, `?f_<col>`) |
| POST   | `/api/dynamic/tickets`        | Create. El body es un objeto JSON keyado por nombre de columna  |
| GET    | `/api/dynamic/tickets/:id`    | Get one. 404 cuando falta o queda filtrado por org scope        |
| PUT    | `/api/dynamic/tickets/:id`    | Update. Body JSON parcial — solo se escriben las keys presentes |
| DELETE | `/api/dynamic/tickets/:id`    | Soft delete cuando `soft_delete: true`, hard delete si no       |
| GET    | `/api/options/tickets`        | Renderiza opciones de `<select>` (`?field=<col>`) — necesita `OptionsConfigResolver` y un llamado explícito a `MountOptions` |
| GET    | `/api/search/tickets`         | Búsqueda full-text (`?q=`) — necesita `SearchConfigResolver` y un llamado explícito a `MountOptions` |

Toda respuesta exitosa viene envuelta:

```json
{ "success": true, "data": ..., "meta": { /* list only */ } }
```

Errores:

```json
{ "success": false, "message": "permission denied" }
```

La referencia completa de request/response, incluyendo ejemplos curl, está
en [`dynamic-api.md`](./dynamic-api).

### 4. Metadata para la UI

Los endpoints de metadata alimentan la vista de tabla y el formulario modal.
Nunca tocan las tablas de datos del addon — describen la **shape** de la UI.

```bash
curl -H "Authorization: Bearer $JWT" \
  https://api.example.com/api/metadata/table/tickets
```

```json
{
  "success": true,
  "data": {
    "title": "Tickets",
    "columns": [
      { "key": "subject",  "label": "Subject",  "type": "text",  "sortable": true },
      { "key": "status",   "label": "Status",   "type": "badge", "filterable": true },
      { "key": "priority", "label": "Priority", "type": "badge", "filterable": true },
      { "key": "due_at",   "label": "Due",      "type": "date",  "sortable": true }
    ],
    "searchColumns": ["subject"],
    "enableCRUDActions": true
  }
}
```

```bash
curl -H "Authorization: Bearer $JWT" \
  https://api.example.com/api/metadata/modal/tickets
```

```json
{
  "success": true,
  "data": {
    "title": "Ticket",
    "fields": [
      { "key": "subject",  "label": "Subject",  "type": "text",     "required": true },
      { "key": "status",   "label": "Status",   "type": "select",
        "options": [
          { "value": "open",     "label": "Open" },
          { "value": "pending",  "label": "Pending" },
          { "value": "resolved", "label": "Resolved" }
        ]
      },
      { "key": "priority", "label": "Priority", "type": "select",   "options": [/* … */] },
      { "key": "body",     "label": "Body",     "type": "textarea" },
      { "key": "due_at",   "label": "Due",      "type": "date" }
    ]
  }
}
```

Las shapes Go exactas de `TableMetadata`, `ModalMetadata`, `ColumnDef` y
`FieldDef` viven en [`modelbase/metadata.go`](https://github.com/asteby/metacore-kernel/blob/main/modelbase/metadata.go) — son
parte de la API pública del kernel y cualquier cambio en un JSON tag es un
bump de versión MAJOR.

El servicio de metadata cachea ambas respuestas por `MetadataCacheTTL`
(default 5 min). Los hosts llaman `metaSvc.InvalidateModel("tickets")`
después de que un admin edite el overlay por organización.

### 5. Renderizado en frontend

Un host corriendo `@asteby/metacore-runtime-react` monta una página genérica:

```tsx
import { DynamicTable } from "@asteby/metacore-runtime-react";

export default function TicketsPage() {
  return <DynamicTable model="tickets" />;
}
```

El componente:

1. Hace `GET /metadata/table/tickets` para conocer las columnas, filtros y
   policy de sort.
2. Hace `GET /metadata/modal/tickets` una vez cuando el usuario abre "New".
3. Dispara `GET /dynamic/tickets?page=1&per_page=25&sortBy=due_at&order=asc`
   en el mount y en cada cambio de filter/sort.
4. Al hacer submit del formulario de create, `POST /dynamic/tickets`. En el
   edit de fila, `PUT /dynamic/tickets/:id`. En delete, `DELETE /dynamic/tickets/:id`.

De punta a punta: **cero código de frontend por modelo** para el caso del
80 %. Mirá la [Guía del consumidor](/es/sdk/consumer-guide) del SDK para
renderizado avanzado (cells custom, row actions, edición inline).

## Aislamiento de schema y RLS

Cada addon es dueño de un schema privado en Postgres. La nomenclatura sigue
[`dynamic/isolation.go`](https://github.com/asteby/metacore-kernel/blob/main/dynamic/isolation.go):

| `tenant_isolation` del manifest | Layout de schema                            | Acceso cross-org   |
| ------------------------------- | ------------------------------------------- | ------------------ |
| `shared` (default)              | `addon_<key>`                               | Policed por RLS    |
| `schema-per-tenant`             | `addon_<key>_<8 hex chars de orgID>`        | Imposible          |
| `database-per-tenant`           | reservado                                   | n/a                |

**Aislamiento shared** es el default y la opción correcta para la mayoría
de los addons. El kernel:

- agrega `organization_id uuid NOT NULL` a cada tabla `org_scoped`;
- crea un index sobre `organization_id`;
- habilita `ROW LEVEL SECURITY` en la tabla;
- instala una policy que filtra cada `SELECT/UPDATE/DELETE` por
  `organization_id = current_setting('app.current_org')::uuid`.

Los hosts DEBEN llamar `dynamic.SetRequestOrg(db, orgID)` (o el equivalente
`SET LOCAL app.current_org = '<uuid>'`) dentro de cada transacción de request
que toque una tabla shared del addon — si no, la policy filtra todo y el
request devuelve una lista vacía. El patrón recomendado es un middleware de
Fiber que envuelve cada request en una transacción con la GUC seteada.

**Schema-per-tenant** cambia el guard de runtime por un límite duro:
schemas disjuntos significan que ningún leak cross-org es siquiera
representable en SQL. Usalo para datos regulados (clínicos, fiscales) donde
la historia de auditoría es "dos organizaciones no pueden compartir una
fila por construcción".

## Gates de permisos

El kernel publica **dos sistemas de permisos cooperativos**:

1. **`permission.Service`** ([`permission/service.go`](https://github.com/asteby/metacore-kernel/blob/main/permission/service.go))
   — gatea cada request CRUD dinámico con una capability por usuario y por
   acción. Se dispara automáticamente desde `dynamic.Service` cuando el host
   conecta un `PermissionStore`.
2. **`security.Enforcer`** ([`security/enforcer.go`](https://github.com/asteby/metacore-kernel/blob/main/security/enforcer.go))
   — gatea cada acción privilegiada que un *addon* intenta (db read, http
   fetch, event emit). Independiente del sistema a nivel usuario.

### Gate a nivel usuario (el guard CRUD por request)

Cuando el host conecta `host.AppConfig.PermissionStore`, cada request CRUD
corre `permission.Service.Check(ctx, user, Cap(model, action))` antes de
hablarle a la base de datos. La shape de capability es `<resource>.<action>`:

| HTTP                                | Capability chequeada |
| ----------------------------------- | -------------------- |
| `GET    /api/dynamic/tickets`       | `tickets.read`       |
| `GET    /api/dynamic/tickets/:id`   | `tickets.read`       |
| `POST   /api/dynamic/tickets`       | `tickets.create`     |
| `PUT    /api/dynamic/tickets/:id`   | `tickets.update`     |
| `DELETE /api/dynamic/tickets/:id`   | `tickets.delete`     |

Un check fallido devuelve `403 Forbidden`:

```json
{
  "success": false,
  "message": "permission denied: missing capability \"tickets.create\""
}
```

`RoleOwner` está en `DefaultSuperRoles()` y bypassea cada check (se devuelve
una sola capability `*` sintética para el usuario). Los hosts que quieren
que `admin` también bypassee setean `Config.SuperRoles` explícitamente.

Los grants de capability los maneja un `PermissionStore`:

- `permission.InMemoryStore` — para tests y apps que siembran roles al boot.
- `permission.GormStore` — default de producción; persiste en
  `permission_role_grants` y `permission_user_grants`. Incluye helpers
  `GrantRole`, `GrantUser`, `RevokeRole`, `RevokeUser`.

Montar un gate de Fiber manualmente (para routes no-CRUD):

```go
api.Post("/tickets/:id/escalate",
    permSvc.Gate(userLookup, permission.Cap("tickets", "escalate")),
    ticketHandler.Escalate)
```

`Gate` (cap único) y `GateWith` (multi-cap con `ModeAll`/`ModeAny`) están
en [`permission/middleware.go`](https://github.com/asteby/metacore-kernel/blob/main/permission/middleware.go).

### Gate a nivel addon (enforcement de capabilities)

`security.Enforcer` valida que un addon se mantenga dentro de las
capabilities que declaró en su manifest. Al enforcer se lo consulta desde
adentro de los host imports del kernel (DB read, HTTP fetch, event publish)
antes de que la operación privilegiada corra:

```go
if err := enforcer.CheckCapability("tickets", "db:write", "addon_tickets.tickets"); err != nil {
    return err
}
```

El modo es global, atómico y switcheable en runtime:

| Modo          | Comportamiento                                   |
| ------------- | ------------------------------------------------ |
| `ModeShadow`  | Loggea violaciones, nunca bloquea. Default.      |
| `ModeEnforce` | Loggea Y devuelve un error. El caller mapea a 403. |

Los operadores switchean vía `METACORE_ENFORCE=1` (ver
[`security/enforcer.go`](https://github.com/asteby/metacore-kernel/blob/main/security/enforcer.go) `ModeFromEnv`). Cada
violación además llama `Enforcer.OnViolation` si está seteado — conectalo a
un counter de Prometheus para tener un feed de auditoría.

La referencia completa está en [`permissions.md`](./permissions).

## Updates en tiempo real

La capa de CRUD dinámico **no** broadcastea automáticamente cambios a los
clientes WebSocket. El kernel publica un hub
([`ws/hub.go`](https://github.com/asteby/metacore-kernel/blob/main/ws/hub.go)) y el handler de CRUD del host es libre
de llamarlo, pero el contrato es: **los handlers de mutación hacen el fan-out
ellos mismos**.

Patrón recomendado — wrappear el servicio dinámico desde el host:

```go
// In the host app: wrap Create/Update/Delete to broadcast.
type ticketsRealtime struct {
    dyn *dynamic.Service
    hub *ws.Hub
}

func (r *ticketsRealtime) Create(ctx context.Context, user modelbase.AuthUser, in map[string]any) (map[string]any, error) {
    out, err := r.dyn.Create(ctx, "tickets", user, in)
    if err != nil {
        return nil, err
    }
    // Look up the recipients however your domain dictates.
    recipients := orgUserIDs(ctx, user.GetOrganizationID())
    r.hub.SendToUsers(recipients, ws.Message{
        Type:    "TICKET_CREATED",
        Payload: out,
    })
    return out, nil
}
```

`Hub.SendToUsers` es fire-and-forget y no bloqueante. Persistir
notificaciones se delega a `Hub.OnNotification`; conectalo si tu app
necesita storage durable.

Para fan-out cross-process (deploy multi-replica), usá el bus de eventos de
addons ([`events/`](https://github.com/asteby/metacore-kernel/blob/main/events/)) y hacé que cada réplica se subscriba a
su propio forwarder — el hub in-process es per-process por diseño.

## Lo que NO es automático

El framework dinámico traza una línea deliberada. Lo siguiente
explícitamente **no** se genera por vos y tiene que implementarse en código
de addon o por el host:

| Concern                                         | Dónde ponerlo                                                    |
| ----------------------------------------------- | ---------------------------------------------------------------- |
| Validación custom (cross-field, async)          | `dynamic.Hooks.BeforeCreate` / `BeforeUpdate` — ver [`dynamic/hooks.go`](https://github.com/asteby/metacore-kernel/blob/main/dynamic/hooks.go) |
| Joins, columnas calculadas, denormalización     | O bien una vista SQL expuesta como un modelo separado, o un handler Fiber custom |
| Row actions custom ("escalate", "mark paid")    | Endpoint definido por el addon + `manifest.Actions[]` para el botón de UI |
| Authorization más allá de `<resource>.<action>` | Wrappear el servicio o implementar un `PermissionStore` custom   |
| Broadcast WebSocket cross-replica               | Responsabilidad del host — fan-out vía `Hub.SendToUsers` por réplica |
| Encriptación / redacción a nivel campo          | `metadata.TableTransformer` para ocultar; hook de addon para encriptar |
| Migraciones de schema más allá de ADD COLUMN    | Archivos SQL versionados en el bundle (los corre `dynamic.Apply`) |
| File uploads / blob storage                     | Fuera de scope para la capa dinámica — manejalo en endpoints del addon |

Todo lo que **sí** es automático cabe en un solo principio: puede derivarse
del manifest sin correr código de addon. Cualquier cosa que requiera una
decisión que el manifest no puede codificar va en código de addon, donde
mantenés control total.

## Ver también

- [`dynamic-api.md`](./dynamic-api) — referencia completa de la API HTTP con ejemplos curl.
- [`permissions.md`](./permissions) — modelo de capabilities, modos, implementaciones de store.
- [`embedding-quickstart.md`](./embedding-quickstart) — tu primer host con el kernel embebido.
- [`consumer-guide.md`](./consumer-guide) — guía extensa de embedding.
- [`../ARCHITECTURE.md`](https://github.com/asteby/metacore-kernel/blob/main/ARCHITECTURE.md) — las cuatro leyes del kernel.
