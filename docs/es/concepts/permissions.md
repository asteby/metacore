# Permisos

Metacore tiene dos sistemas paralelos de permisos que funcionan juntos: **capabilities** (lo que un addon puede hacer) y **permissions** (lo que un usuario puede hacer). Cada llamada tiene que satisfacer ambos. Esta página explica el modelo y los puntos de enforcement.

[[toc]]

## Dos capas, una decisión

```
       ┌─────────────────────────────────────┐
       │          incoming request            │
       └────────────────────┬────────────────┘
                            ▼
            ┌───────────────────────────────┐
            │  1. capability check           │
            │     (does the addon have      │
            │      permission to do this?)  │
            │     enforced by:              │
            │     security.Enforcer         │
            └────────────┬──────────────────┘
                         ▼ allowed
            ┌───────────────────────────────┐
            │  2. permission check           │
            │     (is this user allowed     │
            │      to take this action?)    │
            │     enforced by:              │
            │     permission.Service         │
            └────────────┬──────────────────┘
                         ▼ allowed
                  handler runs
```

Ambos chequeos corren en cada llamada de CRUD, cada llamada de action, cada subscribe de WebSocket. Una request se permite solo si ambos pasan.

## Capabilities — el contrato del addon

Una capability es algo que un addon promete hacer, declarado en `manifest.capabilities[]`:

```json
"capabilities": [
  { "kind": "db:read",    "target": "tickets" },
  { "kind": "db:write",   "target": "tickets" },
  { "kind": "event:emit", "target": "tickets.changed" },
  { "kind": "http:fetch", "target": "https://api.example.com/*", "reason": "external sync" }
]
```

Los kinds de capability incluyen:

| Kind | Targets | Qué cubre |
|---|---|---|
| `db:read` | nombre de tabla | Lectura de una tabla |
| `db:write` | nombre de tabla | Inserts, updates, deletes |
| `event:emit` | nombre de evento | Publicar en el hub WebSocket |
| `event:subscribe` | nombre de evento | Suscribirse en el hub WebSocket |
| `http:fetch` | patrón de URL | HTTP saliente desde código en sandbox WASM |
| `secret:read` | nombre de secret | Leer un secret administrado por el host |
| `kv:rw` | namespace | Read/write del KV store del kernel |

La lista completa está en [SDK docs / capabilities](https://asteby.github.io/metacore-sdk/manifest-spec#capabilities).

### Por qué existen las capabilities

Sin ellas, un addon podría hacer cualquier cosa que el proceso del host pueda — leer cualquier tabla, llamar a cualquier API externa, exfiltrar cualquier secret. Las capabilities hacen explícita y revisable la superficie del addon. Un operador mirando un manifest ve exactamente lo que el addon puede tocar, y el kernel lo aplica en cada llamada.

### Modos de enforcement

El kernel ejecuta el security enforcer en uno de dos modos, configurable por host:

- **Shadow.** Las violaciones de capability se loguean como warnings pero la llamada procede. Útil en desarrollo para descubrir declaraciones faltantes sin romper flujos.
- **Enforce.** Las violaciones de capability devuelven 403. Se usa en producción.

El modo es parte de la config del host; el addon no sabe cuál está activo.

### Cómo se ven los targets

Los targets se matchean literalmente para la mayoría de los kinds. Para `http:fetch`, soportan glob patterns (`https://api.example.com/*`); para `db:read` y `db:write`, el target siempre es un nombre de tabla totalmente calificado dentro del namespace del addon.

Un addon no puede declarar una capability contra una tabla que no le pertenece. El installer rechaza los manifests que lo intentan.

## Permissions — el contrato del usuario

Un permission es algo que se le puede otorgar a un usuario, declarado en `manifest.permissions[]`:

```json
"permissions": [
  { "id": "tickets.view",   "label": "View tickets" },
  { "id": "tickets.create", "label": "Create tickets" },
  { "id": "tickets.edit",   "label": "Edit tickets" },
  { "id": "tickets.delete", "label": "Delete tickets" },
  { "id": "tickets.export", "label": "Export tickets" }
]
```

Los IDs de permission son **opacos para el kernel** — son strings definidos por el addon. El kernel solo guarda los grants y los chequea.

### Cómo obtienen los usuarios sus permissions

Eso es responsabilidad del host. Un host típico tiene:

- **Roles** — bundles nombrados de permissions (`viewer`, `operator`, `admin`).
- **Grants por usuario** — grants directos fuera de cualquier rol.
- **Defaults por org** — lo que cada usuario en una org recibe por defecto.

El kernel expone una API para administrar esto (`/api/permissions/...`); cómo se ve la UI de admin del host es decisión del host.

### Cómo mapean los permissions a CRUD

El runtime mapea IDs de permission a operaciones CRUD por convención o declaración explícita en el manifest:

| Operación | Permission por defecto | Override |
|---|---|---|
| `GET .../:table` | `:table.view` | manifest |
| `GET .../:table/:id` | `:table.view` | manifest |
| `POST .../:table` | `:table.create` | manifest |
| `PATCH .../:table/:id` | `:table.edit` | manifest |
| `DELETE .../:table/:id` | `:table.delete` | manifest |

Para las actions, el manifest declara el permission requerido explícitamente:

```json
{ "id": "close-with-reason", "permission": "tickets.edit", ... }
```

### Gating de UI

El SDK lee los permissions efectivos del usuario y gatea componentes automáticamente:

```tsx
import { useCapabilities } from '@asteby/metacore-runtime-react'

const can = useCapabilities()
if (!can('tickets.create')) return <ReadOnlyView />
```

Los componentes built-in — `<DynamicTable>`, `<DynamicForm>`, botones de action — ya chequean los permissions correctos y se ocultan / deshabilitan solos. Solo necesitás chequeos explícitos para UI personalizada.

## Tenancy

Ambas capas operan dentro del scope del tenant del usuario. El kernel autofiltra cada query de CRUD dinámico por `org_id`; los datos cross-tenant no son alcanzables desde una request normal, ni siquiera con el permission correcto. El acceso cross-tenant requiere una capability `superuser` explícita que el kernel trae deshabilitada.

## Audit

Cada chequeo de capability y cada chequeo de permission produce un evento de audit (allowed o denied), enrutado a través del hook de audit del kernel. Los hosts conectan su propio sink — típicamente un log estructurado o una tabla de audit dedicada.

## Relacionado

- [Manifest](/es/concepts/manifest) — donde se declaran ambas capas.
- [CRUD dinámico](/es/concepts/dynamic-crud) — donde se aplican.
- [Kernel docs / security ↗](https://asteby.github.io/metacore-kernel/) — internals del Enforcer.
- [SDK docs / capabilities ↗](https://asteby.github.io/metacore-sdk/) — referencia completa de capabilities.
