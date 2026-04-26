# Referencia de la API CRUD dinámica

Referencia HTTP de cada endpoint que el framework de CRUD dinámico monta. Las
shapes documentadas acá son el contrato del wire — los JSON tags sobre los
tipos Go subyacentes son load-bearing y cualquier cambio es un bump de
versión MAJOR.

Para el walkthrough conceptual ver [`dynamic-system.md`](./dynamic-system).

---

## Tabla de contenidos

- [Convenciones](#convenciones)
- [Autenticación](#autenticación)
- [Envelope de error](#envelope-de-error)
- [Endpoints CRUD](#endpoints-crud)
  - [List](#list)
  - [Get](#get)
  - [Create](#create)
  - [Update](#update)
  - [Delete](#delete)
- [Endpoints de lookup](#endpoints-de-lookup)
  - [Options](#options)
  - [Search](#search)
- [Endpoints de metadata](#endpoints-de-metadata)
  - [Metadata de tabla](#metadata-de-tabla)
  - [Metadata de modal](#metadata-de-modal)
  - [Metadata completa](#metadata-completa)
- [Operadores de filtro](#operadores-de-filtro)
- [Referencia de status codes](#referencia-de-status-codes)

---

## Convenciones

- El base path es lo que el host pase a `app.Mount()`. Los ejemplos abajo
  usan `/api`.
- Los IDs son UUIDs (RFC 4122 v4). Segmentos `:id` que no sean UUID
  devuelven `400`.
- `:model` es la registry key pasada a
  [`App.RegisterModel(key, factory)`](https://github.com/asteby/metacore-kernel/blob/main/host/app.go) — usualmente el
  nombre de tabla en snake-case.
- Toda respuesta exitosa es `{ "success": true, "data": ... }`.
  Las respuestas de list además llevan `meta` (paginación).
- Toda respuesta de error es `{ "success": false, "message": "<reason>" }`.
- Los timestamps son ISO 8601 en UTC. `null` está permitido cuando la
  columna subyacente es nullable.
- Las shapes de respuesta las produce `dynamic.Handler`
  ([`dynamic/handler.go`](https://github.com/asteby/metacore-kernel/blob/main/dynamic/handler.go)) y
  `metadata.Handler` ([`metadata/handler.go`](https://github.com/asteby/metacore-kernel/blob/main/metadata/handler.go)).

## Autenticación

Cada endpoint CRUD y de metadata se sienta detrás del middleware de auth
montado por `host.App`. Mandá el JWT en el header estándar:

```
Authorization: Bearer <jwt>
```

Cuando el resolver no devuelve usuario, los requests son rechazados con `401`:

```json
{ "success": false, "message": "not authenticated" }
```

## Envelope de error

| Status | Cuándo                                          | Mensaje de ejemplo                                     |
| ------ | ----------------------------------------------- | ------------------------------------------------------ |
| 400    | UUID malo, body malformado, falla de validación | `"invalid id"`, `"invalid body"`, `"invalid input: ..."` |
| 401    | Sin JWT o JWT inválido                          | `"not authenticated"`                                  |
| 403    | Permission denied                               | `"permission denied: missing capability \"tickets.create\""` |
| 404    | Modelo no registrado, o fila ausente            | `"model not found in registry"`, `"record not found"`  |
| 422    | Request de metadata con metadata inválida       | `"metadata invalid: ..."`                              |
| 501    | Options/Search llamado sin resolver conectado   | `"options config not available"`                       |
| 500    | Cualquier otra cosa (error de DB, etc.)         | `"dynamic: list: ..."`                                 |

El mapeo de errores vive en
[`dynamic/handler.go:handleError`](https://github.com/asteby/metacore-kernel/blob/main/dynamic/handler.go) y
[`metadata/handler.go:respondServiceError`](https://github.com/asteby/metacore-kernel/blob/main/metadata/handler.go).

## Endpoints CRUD

Las cinco routes las monta `dynamic.Handler.Mount`
([`dynamic/handler.go`](https://github.com/asteby/metacore-kernel/blob/main/dynamic/handler.go)):

```
GET    /dynamic/:model
POST   /dynamic/:model
GET    /dynamic/:model/:id
PUT    /dynamic/:model/:id
DELETE /dynamic/:model/:id
```

### List

Paginado, filtrado, ordenado, con búsqueda full-text.

`GET /api/dynamic/:model`

Parámetros del query string (parseados por
[`query/params.go`](https://github.com/asteby/metacore-kernel/blob/main/query/params.go)):

| Param        | Tipo    | Default | Notas                                                          |
| ------------ | ------- | ------- | -------------------------------------------------------------- |
| `page`       | int ≥1  | `1`     | 1-indexed                                                      |
| `per_page`   | int     | `20`    | Clampeado a `[1, MaxPerPage]` (ver `query.MaxPerPage`)         |
| `sortBy`     | string  | unset   | Debe matchear un `TableMetadata.Columns[].key` — desconocido se descarta |
| `order`      | enum    | `desc`  | `asc` o `desc`                                                 |
| `search`     | string  | unset   | Texto libre; truncado a `MaxSearchTermLength`                  |
| `f_<col>`    | string  | unset   | Filtro — ver [Operadores de filtro](#operadores-de-filtro)     |

```bash
curl -G \
  -H "Authorization: Bearer $JWT" \
  --data-urlencode "page=2" \
  --data-urlencode "per_page=25" \
  --data-urlencode "sortBy=due_at" \
  --data-urlencode "order=asc" \
  --data-urlencode "search=invoice" \
  --data-urlencode "f_status=in:open,pending" \
  https://api.example.com/api/dynamic/tickets
```

Respuesta `200 OK`:

```json
{
  "success": true,
  "data": [
    {
      "id": "9b1c08f1-3c4a-4f9c-bd4e-9d0b3e5a1234",
      "organization_id": "11111111-1111-1111-1111-111111111111",
      "subject": "Invoice #2042 missing PDF",
      "status": "open",
      "priority": "high",
      "body": "Customer reports the PDF link 404s.",
      "due_at": "2026-04-30T17:00:00Z",
      "created_at": "2026-04-26T12:01:09Z",
      "updated_at": "2026-04-26T12:01:09Z"
    }
  ],
  "meta": {
    "total": 137,
    "page": 2,
    "per_page": 25,
    "last_page": 6
  }
}
```

La shape de `meta` es `query.PageMeta`
([`query/builder.go`](https://github.com/asteby/metacore-kernel/blob/main/query/builder.go)) — sus JSON tags son parte de
la API pública.

### Get

`GET /api/dynamic/:model/:id`

```bash
curl -H "Authorization: Bearer $JWT" \
  https://api.example.com/api/dynamic/tickets/9b1c08f1-3c4a-4f9c-bd4e-9d0b3e5a1234
```

Respuesta `200 OK`:

```json
{
  "success": true,
  "data": {
    "id": "9b1c08f1-3c4a-4f9c-bd4e-9d0b3e5a1234",
    "subject": "Invoice #2042 missing PDF",
    "status": "open",
    "priority": "high",
    "body": "Customer reports the PDF link 404s.",
    "due_at": "2026-04-30T17:00:00Z",
    "created_at": "2026-04-26T12:01:09Z",
    "updated_at": "2026-04-26T12:01:09Z"
  }
}
```

`404 Not Found` cuando la fila no existe o queda filtrada por el scope de
tenant (la organización no es dueña de ese id).

### Create

`POST /api/dynamic/:model`

El body es un objeto JSON keyado por nombre de columna. El kernel:

1. Inyecta `organization_id` desde el JWT (cuando el modelo es `org_scoped`).
2. Setea `created_by_id` al usuario autenticado.
3. Corre los hooks `BeforeCreate`.
4. Hace insert vía GORM (`id`, `created_at`, `updated_at` los setea Postgres).
5. Corre los hooks `AfterCreate`.

```bash
curl -X POST \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "subject":  "Invoice #2042 missing PDF",
    "status":   "open",
    "priority": "high",
    "body":     "Customer reports the PDF link 404s."
  }' \
  https://api.example.com/api/dynamic/tickets
```

Respuesta `201 Created`:

```json
{
  "success": true,
  "data": {
    "id": "9b1c08f1-3c4a-4f9c-bd4e-9d0b3e5a1234",
    "organization_id": "11111111-1111-1111-1111-111111111111",
    "subject": "Invoice #2042 missing PDF",
    "status": "open",
    "priority": "high",
    "body": "Customer reports the PDF link 404s.",
    "due_at": null,
    "created_at": "2026-04-26T12:01:09Z",
    "updated_at": "2026-04-26T12:01:09Z"
  }
}
```

Validación: los tipos de columna se coercen vía unmarshalling JSON sobre la
struct de runtime producida por `dynamic.BuildStructType`
([`dynamic/model.go`](https://github.com/asteby/metacore-kernel/blob/main/dynamic/model.go)). Los mismatches de tipo
salen como `400 invalid input`. La validación cross-field es laburo del
addon — registrá un hook en `dynamic.Hooks` ([`dynamic/hooks.go`](https://github.com/asteby/metacore-kernel/blob/main/dynamic/hooks.go)).

### Update

`PUT /api/dynamic/:model/:id`

El comportamiento es **load-merge-save**, no un PATCH parcial:

1. El kernel carga la fila por id (org-scoped).
2. Hace JSON-unmarshal del body del request sobre la struct cargada — las
   keys que no están en el body mantienen su valor previo.
3. Corre los hooks `BeforeUpdate`.
4. `gorm.Save` escribe la fila completa de vuelta (así las columnas omitidas
   retienen su valor existente, no se nulean).
5. Corre los hooks `AfterUpdate`.

```bash
curl -X PUT \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{ "status": "resolved" }' \
  https://api.example.com/api/dynamic/tickets/9b1c08f1-3c4a-4f9c-bd4e-9d0b3e5a1234
```

Respuesta `200 OK`:

```json
{
  "success": true,
  "data": {
    "id": "9b1c08f1-3c4a-4f9c-bd4e-9d0b3e5a1234",
    "subject": "Invoice #2042 missing PDF",
    "status": "resolved",
    "priority": "high",
    "body": "Customer reports the PDF link 404s.",
    "due_at": null,
    "created_at": "2026-04-26T12:01:09Z",
    "updated_at": "2026-04-26T13:42:55Z"
  }
}
```

`404 Not Found` cuando el id es desconocido para esta organización.

### Delete

`DELETE /api/dynamic/:model/:id`

```bash
curl -X DELETE \
  -H "Authorization: Bearer $JWT" \
  https://api.example.com/api/dynamic/tickets/9b1c08f1-3c4a-4f9c-bd4e-9d0b3e5a1234
```

Respuesta `200 OK`:

```json
{ "success": true }
```

Cuando `soft_delete: true` está seteado en la model definition, GORM
actualiza `deleted_at` y la fila desaparece de los siguientes list/get sin
perder datos. Si no, el delete es incondicional (`DELETE FROM ...`).

## Endpoints de lookup

Los endpoints de options y search los monta
`dynamic.Handler.MountOptions` — fuera del prefix `/dynamic`, para
preservar los paths históricos en los que confían los consumers.

```
GET /options/:model
GET /search/:model
```

`host.App.Mount` **no** llama `MountOptions` automáticamente — los hosts
que necesitan endpoints de lookup construyen un `dynamic.Handler`
directamente y se lo enganchan ellos:

```go
dynHandler := dynamic.NewHandler(app.Dynamic, userResolver)
dynHandler.MountOptions(api, authMiddleware)
```

Los dos requieren que el host conecte un resolver en `dynamic.Config`
(`OptionsConfigResolver`, `SearchConfigResolver`) — sin uno, los endpoints
devuelven `501 Not Implemented`. Ver
[`dynamic/service.go`](https://github.com/asteby/metacore-kernel/blob/main/dynamic/service.go).

### Options

Renderiza valores para un campo `<select>`. Lo usa pesado el form generator
del runtime-react.

`GET /api/options/:model?field=<col>[&q=...&filter_value=...&limit=...&offset=...]`

| Param          | Notas                                                       |
| -------------- | ----------------------------------------------------------- |
| `field`        | Requerido. El campo del form cuyas opciones se piden.       |
| `q`            | Opcional, filtro sobre la columna de label (LIKE / ILIKE).  |
| `filter_value` | Opcional, scopeado vía `FieldOptionsConfig.FilterBy`.       |
| `limit`        | Default 50, clampeado a `MaxOptionsLimit` (200).            |
| `offset`       | Default 0.                                                  |

```bash
curl -G \
  -H "Authorization: Bearer $JWT" \
  --data-urlencode "field=assignee_id" \
  --data-urlencode "q=alice" \
  https://api.example.com/api/options/tickets
```

Respuesta `200 OK`:

```json
{
  "success": true,
  "type": "dynamic",
  "data": [
    { "id": "...", "value": "...", "label": "Alice Hopper", "name": "Alice Hopper" }
  ]
}
```

`type` es `"static"` cuando el campo declara una lista hardcodeada y
`"dynamic"` cuando consulta un modelo relacionado. Las options estáticas
nunca tocan la base.

### Search

Búsqueda full-text sobre las columnas listadas en `SearchConfig.SearchIn`.
El resolver además maneja joins de relaciones anidadas (paths con puntos
como `patient.user.name`).

`GET /api/search/:model?q=<text>[&limit=...]`

```bash
curl -G \
  -H "Authorization: Bearer $JWT" \
  --data-urlencode "q=invoice 2042" \
  https://api.example.com/api/search/tickets
```

Respuesta `200 OK`:

```json
{
  "success": true,
  "data": [
    { "id": "...", "value": "...", "label": "Invoice #2042 missing PDF", "name": "Invoice #2042 missing PDF" }
  ]
}
```

La cláusula de match específica del dialecto es configurable: pasá
`Config.SearchMatchClause` para usar unaccent/ILIKE en Postgres. El default
es `<col> LIKE ?` con `%q%`, portable.

## Endpoints de metadata

Montados por `metadata.Handler.Mount` — ver
[`metadata/handler.go`](https://github.com/asteby/metacore-kernel/blob/main/metadata/handler.go). El host los conecta bajo
`/metadata`:

```
GET /metadata/table/:model
GET /metadata/modal/:model
GET /metadata/all
```

Cacheados por `MetadataCacheTTL` (default 5 min). Los hosts llaman
`metaSvc.InvalidateModel(key)` después de que cambia un transformer por
organización.

### Metadata de tabla

`GET /api/metadata/table/:model`

```bash
curl -H "Authorization: Bearer $JWT" \
  https://api.example.com/api/metadata/table/tickets
```

Respuesta `200 OK`:

```json
{
  "success": true,
  "data": {
    "title": "Tickets",
    "columns": [
      {
        "key": "subject",
        "label": "Subject",
        "type": "text",
        "sortable": true,
        "filterable": false
      },
      {
        "key": "status",
        "label": "Status",
        "type": "badge",
        "filterable": true,
        "options": [
          { "value": "open", "label": "Open", "color": "blue" }
        ]
      }
    ],
    "searchColumns": ["subject"],
    "filters": [
      { "key": "status", "label": "Status", "type": "select", "column": "status" }
    ],
    "actions": [
      { "key": "escalate", "name": "escalate", "label": "Escalate", "icon": "AlertTriangle" }
    ],
    "enableCRUDActions": true,
    "perPageOptions": [10, 25, 50],
    "defaultPerPage": 25,
    "searchPlaceholder": "Search tickets..."
  }
}
```

La shape Go es `modelbase.TableMetadata`
([`modelbase/metadata.go`](https://github.com/asteby/metacore-kernel/blob/main/modelbase/metadata.go)). Cada JSON tag es
parte del contrato del wire.

### Metadata de modal

`GET /api/metadata/modal/:model`

```bash
curl -H "Authorization: Bearer $JWT" \
  https://api.example.com/api/metadata/modal/tickets
```

Respuesta `200 OK`:

```json
{
  "success": true,
  "data": {
    "title": "Ticket",
    "createTitle": "Create ticket",
    "editTitle":   "Edit ticket",
    "deleteTitle": "Delete ticket",
    "fields": [
      {
        "key": "subject",
        "label": "Subject",
        "type": "text",
        "required": true,
        "validation": "min:3|max:200",
        "placeholder": "Briefly describe the issue"
      },
      {
        "key": "status",
        "label": "Status",
        "type": "select",
        "required": true,
        "defaultValue": "open",
        "options": [
          { "value": "open",     "label": "Open" },
          { "value": "pending",  "label": "Pending" },
          { "value": "resolved", "label": "Resolved" }
        ]
      },
      {
        "key": "due_at",
        "label": "Due",
        "type": "date"
      }
    ],
    "messages": {
      "createSuccess": "Ticket created",
      "updateSuccess": "Ticket updated",
      "deleteConfirm": "Delete this ticket?"
    }
  }
}
```

La shape Go es `modelbase.ModalMetadata`. Valores de `FieldDef.Type`
consumidos por el form generator del runtime-react: `text`, `textarea`,
`select`, `search`, `number`, `date`, `email`, `url`, `boolean`, `image`.

### Metadata completa

`GET /api/metadata/all`

Devuelve la metadata de tabla+modal de cada modelo registrado en un solo
payload — los frontends la llaman una vez al startup para warmear un cache
local.

```bash
curl -H "Authorization: Bearer $JWT" \
  https://api.example.com/api/metadata/all
```

Respuesta `200 OK`:

```json
{
  "success": true,
  "data": {
    "version": "lqp9i00.0",
    "tables": {
      "tickets":  { "title": "Tickets",  "columns": [/* … */] },
      "products": { "title": "Products", "columns": [/* … */] }
    },
    "modals": {
      "tickets":  { "title": "Ticket",  "fields": [/* … */] },
      "products": { "title": "Product", "fields": [/* … */] }
    }
  }
}
```

`version` es un token monotónico que cambia con cada invalidación de cache —
usalo como ETag.

## Operadores de filtro

El endpoint de list acepta filtros como `f_<col>=<op>:<value>`. El parser
está en [`query/filter.go`](https://github.com/asteby/metacore-kernel/blob/main/query/filter.go). Cuando se omite `<op>:`,
el valor se trata como `eq`.

| Op       | Forma del wire                  | Significado                                      |
| -------- | ------------------------------- | ------------------------------------------------ |
| `eq`     | `f_status=eq:open`              | Igualdad                                         |
| `ilike`  | `f_subject=ilike:invoice%25`    | LIKE case-insensitive (Postgres)                 |
| `in`     | `f_status=in:open,pending`      | Lista IN                                         |
| `gte`    | `f_due_at=gte:2026-04-01`       | `>=`                                             |
| `lte`    | `f_due_at=lte:2026-04-30`       | `<=`                                             |
| `range`  | `f_due_at=range:2026-04-01\|2026-04-30` | `BETWEEN min AND max` (cualquier lado puede estar vacío) |

Los filtros apuntan a columnas en `TableMetadata.Columns[].key`. Las keys
no presentes en metadata se descartan silenciosamente — el query queda en
allow-list antes de tocar GORM.

## Referencia de status codes

| Code | Cuándo                                                            |
| ---- | ----------------------------------------------------------------- |
| 200  | List, Get, Update, Delete, Options, Search, toda la metadata      |
| 201  | Create                                                            |
| 400  | UUID malo; body JSON malformado; campo requerido                  |
| 401  | UserResolver devolvió nil                                         |
| 403  | Permission denied                                                 |
| 404  | Modelo no registrado; record not found; campo de options ausente  |
| 422  | Metadata inválida (error de transformer)                          |
| 501  | Options o Search llamados sin resolver conectado                  |
| 500  | Error de DB / inesperado                                          |

El mapeo está definido en
[`dynamic/handler.go:handleError`](https://github.com/asteby/metacore-kernel/blob/main/dynamic/handler.go) y
[`metadata/handler.go:respondServiceError`](https://github.com/asteby/metacore-kernel/blob/main/metadata/handler.go).

---

Ver también: [`dynamic-system.md`](./dynamic-system),
[`permissions.md`](./permissions),
[`embedding-quickstart.md`](./embedding-quickstart).
