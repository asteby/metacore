# Manifest

El manifest es un único archivo JSON que describe completamente un addon. Es la **fuente de verdad** tanto para el runtime (que lo usa para aprovisionar el schema y montar las rutas) como para la UI (que lo lee para renderizar componentes tipados). Todo lo demás en un addon — código Go, componentes React, assets — es opcional.

[[toc]]

## Por qué un solo archivo

El drift es el costo dominante del tooling de admin: los schemas evolucionan más rápido que los handlers, los handlers más rápido que las UIs, y los tres terminan describiendo productos ligeramente distintos. El manifest colapsa eso en un solo artefacto:

- **Versionado en git.** Los diffs son revisables; los rollbacks son triviales.
- **Validado por máquina.** Un schema formal rechaza addons ambiguos antes de que se buildeen.
- **Leído por cada capa.** El kernel, el SDK, la CLI y la UI leen los mismos campos. No hay un segundo contrato que mantener.

Cuando un addon se comporta mal, el manifest es el único lugar donde mirar.

## Campos de nivel superior

| Campo | Propósito |
|---|---|
| `id` | Identificador estable. Se usa en rutas (`/api/addons/:id/...`) y en storage. Debe ser único dentro de un host. |
| `name`, `displayName`, `version` | Metadata para humanos. La versión es semver y controla las migraciones de upgrade. |
| `tables[]` | Schema. El installer lo traduce a DDL. Ver más abajo. |
| `capabilities[]` | Lo que el addon promete hacer. Lo aplica el `security.Enforcer` del kernel. |
| `permissions[]` | Lo que se les puede otorgar a los usuarios. Lo aplica `permission.Service`. |
| `actions[]` | Operaciones personalizadas (no-CRUD). El runtime monta una ruta por acción; el cuerpo lo escribís vos. |
| `events[]` | Canales en tiempo real que el addon emite / suscribe. Expuestos vía el hub WebSocket. |
| `frontend.slots` | Puntos de extensión de UI con nombre. El runtime los renderiza vía `<Slot>`. |
| `frontend.navigation` | Dónde aparece el addon en la nav del host (sidebar, header, etc.). |
| `dependencies[]` | Otros addons que este necesita. El installer los resuelve. |
| `lifecycle` | Hooks para `install`, `upgrade`, `uninstall`. Opcional. |

## Tables

Una entrada en tables mapea a una tabla de base de datos. El installer del kernel la lee, genera el DDL y lo ejecuta dentro de una transacción de migración.

```json
{
  "name": "tickets",
  "displayName": "Tickets",
  "columns": [
    { "name": "id",         "type": "uuid",      "primaryKey": true },
    { "name": "title",      "type": "string",    "required": true, "max": 200 },
    { "name": "status",     "type": "enum",      "values": ["open","closed"], "default": "open" },
    { "name": "assignee",   "type": "string",    "label": "Assigned to" },
    { "name": "created_at", "type": "timestamp", "default": "now()" }
  ],
  "indexes": [
    { "columns": ["status"] },
    { "columns": ["assignee", "created_at"] }
  ]
}
```

Los tipos de columna incluyen `string`, `text`, `int`, `float`, `double`, `bool`, `uuid`, `timestamp`, `date`, `enum`, `json`, `ref`. Cada tipo tiene su propio set de validadores; el runtime los aplica en cada escritura.

## Capabilities

Las capabilities son el **contrato del addon con el runtime**. Declaran qué subsistemas va a tocar el addon. El kernel las aplica en cada llamada: un addon que intenta escribir una tabla sobre la que no tiene `db:write` es rechazado, sin importar quién sea el usuario.

```json
"capabilities": [
  { "kind": "db:read",    "target": "tickets" },
  { "kind": "db:write",   "target": "tickets" },
  { "kind": "event:emit", "target": "tickets.changed" },
  { "kind": "http:fetch", "target": "https://api.example.com/*", "reason": "fetch external data" }
]
```

Cada capability tiene un `kind`, un `target` y opcionalmente una `reason` (que se le muestra a los operadores durante la instalación). La lista completa de kinds está en [SDK docs / capabilities](https://asteby.github.io/metacore-sdk/manifest-spec#capabilities).

El kernel ejecuta el enforcer en dos modos:

- **Shadow** — registra las violaciones en logs pero las permite. Se usa en desarrollo.
- **Enforce** — bloquea la llamada. Se usa en producción.

## Permissions vs capabilities

Estas dos cosas son fáciles de confundir:

| | Capability | Permission |
|---|---|---|
| **Quién la tiene** | El addon (declarada en el manifest) | El usuario (otorgada en runtime) |
| **Qué controla** | Qué subsistemas puede tocar el addon | Qué acciones puede tomar un usuario |
| **Dónde se aplica** | Security enforcer del kernel | Permission service del kernel |
| **Ejemplo** | `db:write` sobre `tickets` | `tickets.delete` para el usuario u_42 |

Una llamada tiene que pasar ambos chequeos. Aunque el addon tenga `db:write`, el usuario igual necesita el permission. Ver [concepto de Permisos](/es/concepts/permissions) para el modelo completo.

## Actions

CRUD cubre lecturas y escrituras; las actions cubren todo lo demás — operaciones masivas, integraciones, side effects, cualquier cosa que no sea una mutación de fila.

```json
{
  "actions": [
    {
      "id": "close-with-reason",
      "label": "Close ticket",
      "target": "tickets",
      "scope": "row",
      "permission": "tickets.edit",
      "input": [
        { "name": "reason", "type": "string", "required": true }
      ]
    },
    {
      "id": "import-csv",
      "label": "Import",
      "target": "tickets",
      "scope": "table",
      "permission": "tickets.create",
      "input": [
        { "name": "file", "type": "file", "accept": "text/csv" }
      ]
    }
  ]
}
```

El kernel monta `POST /api/addons/:id/_actions/:action.id`. El runtime renderiza un botón (con un diálogo si hay input) en el scope correcto — por fila o por tabla. El cuerpo de la acción es tu código: una función Go en el addon, llamada con los inputs parseados y los servicios del kernel.

## Frontend slots

Los slots permiten que un addon contribuya componentes React personalizados a la UI de un host sin que el host conozca al addon de antemano. Un uso típico es sobrescribir la vista de detalle por defecto:

```json
"frontend": {
  "slots": [
    { "name": "tickets.detail", "component": "./src/TicketDetail.tsx" }
  ]
}
```

El host renderiza `<Slot name="tickets.detail" />`; si el addon está instalado y provee ese slot, su componente aparece. Si no, el slot cae en su default.

## Lo que no está en el manifest

- **Lógica de negocio.** Validadores personalizados, cuerpos de actions, integraciones — todo en Go (o Go compilado a WASM) dentro del addon, no en JSON.
- **Layouts de UI personalizados.** Más allá de los slots, el frontend del host es libre de renderizar lo que quiera por encima de los hooks del SDK.
- **Config por deployment.** Variables de entorno, secrets, feature flags — no son asunto del addon.

## Referencia completa

Esta página es la visión conceptual. La spec completa del manifest — cada campo, cada tipo, cada validador — está en los SDK docs:

[SDK docs / manifest spec →](https://asteby.github.io/metacore-sdk/manifest-spec)

## Relacionado

- [CRUD dinámico](/es/concepts/dynamic-crud) — qué hace el runtime con `tables[]`.
- [Permisos](/es/concepts/permissions) — modelo de capability + por usuario.
- [Ciclo de vida](/es/concepts/lifecycle) — qué pasa cuando un manifest cambia entre versiones.
