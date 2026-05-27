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
  { "kind": "db:read",    "target": "addon_tickets.*" },
  { "kind": "db:write",   "target": "addon_tickets.*" },
  { "kind": "event:emit", "target": "tickets.changed" },
  { "kind": "http:fetch", "target": "https://api.example.com/*", "reason": "external sync" }
]
```

El set cerrado de kinds de capability es:

| Kind | Targets | Qué cubre |
|---|---|---|
| `db:read` | glob schema/tabla | Lectura de una tabla |
| `db:write` | glob schema/tabla | Inserts, updates, deletes |
| `event:emit` | nombre de evento | Publicar en el event bus in-process / hub WebSocket |
| `event:subscribe` | nombre de evento | Suscribirse a un evento publicado |
| `http:fetch` | prefijo de URL | HTTP saliente desde código en sandbox WASM |
| `secrets:read` | glob de secret | Leer un secret administrado por el host |
| `fs:read` | glob de path | Leer archivos read-only del bundle |
| `cron:register` | expresión cron | Registrar un sweep programado |
| `queue:produce` / `queue:consume` | nombre de cola | Producir / consumir en una cola |
| `file-storage:write` | glob de path | Escribir a file storage (exports, adjuntos) |
| `time:wallclock` | — | Leer el reloj de pared del host |

El schema propio del addon (`addon_<key>.*`) siempre es accesible — nunca lo declares. La lista completa y la sintaxis de targets están en el [WASM ABI del kernel](https://asteby.github.io/metacore-kernel/wasm-abi).

### Por qué existen las capabilities

Sin ellas, un addon podría hacer cualquier cosa que el proceso del host pueda — leer cualquier tabla, llamar a cualquier API externa, exfiltrar cualquier secret. Las capabilities hacen explícita y revisable la superficie del addon. Un operador mirando un manifest ve exactamente lo que el addon puede tocar, y el kernel lo aplica en cada llamada.

### Modos de enforcement

El kernel ejecuta el security enforcer en uno de dos modos, configurable por host:

- **Shadow.** Las violaciones de capability se loguean como warnings pero la llamada procede. Útil en desarrollo para descubrir declaraciones faltantes sin romper flujos.
- **Enforce.** Las violaciones de capability devuelven 403. Se usa en producción.

El modo es parte de la config del host; el addon no sabe cuál está activo.

### Cómo se ven los targets

La sintaxis del target depende del kind: `http:fetch` matchea un prefijo de URL, `cron:register` una expresión cron, `event:*` un nombre de evento, y `db:read`/`db:write` un glob `schema.tabla` (p. ej. `addon_tickets.*`). El schema propio del addon es implícito; el acceso cross-schema necesita un grant explícito (`db:read public.users`) y el installer rechaza los manifests que se extralimitan.

## Permisos y roles — el contrato del usuario

v3 declara el lado de cara al usuario bajo `rbac`: **roles** de primera clase más los **permisos** que agrupan.

```json
"rbac": {
  "permissions": [
    { "key": "tickets.read",   "label": "Ver tickets" },
    { "key": "tickets.write",  "label": "Crear / editar / borrar tickets" },
    { "key": "tickets.export", "label": "Exportar tickets" }
  ],
  "roles": [
    { "key": "tickets_agent",   "label": "tickets.role.agent",
      "permissions": ["tickets.read", "tickets.write"] },
    { "key": "tickets_viewer",  "label": "tickets.role.viewer",
      "permissions": ["tickets.read"] }
  ]
}
```

Las keys de permiso son **opacas para el kernel** — son strings definidos por el addon. El kernel guarda los grants, resuelve el set efectivo del usuario y los chequea. (El dual-read del kernel 3.x mapea un array v2 legacy `permissions[]` a `rbac.permissions[]`; los roles son nuevos en v3.)

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
| `GET /api/dynamic/:model` | `:model.read` | manifest |
| `GET /api/dynamic/:model/:id` | `:model.read` | manifest |
| `POST /api/dynamic/:model` | `:model.write` | manifest |
| `PUT /api/dynamic/:model/:id` | `:model.write` | manifest |
| `DELETE /api/dynamic/:model/:id` | `:model.write` | manifest |

Para las actions, el manifest declara el permission requerido explícitamente:

```json
{ "key": "close_with_reason", "permission": "tickets.write", "...": "..." }
```

### Gating de UI

El SDK lee los permissions efectivos del usuario y gatea componentes automáticamente:

```tsx
import { useCapabilities, CapabilityGate } from '@asteby/metacore-runtime-react'

// Forma con hook — devuelve { has, all, any }.
const can = useCapabilities()
if (!can.has('tickets.write')) return <ReadOnlyView />

// Forma declarativa.
<CapabilityGate require="tickets.write" fallback={<ReadOnlyView />}>
  <CreateButton />
</CapabilityGate>
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
