# Manifest

El manifest es un único archivo JSON que describe completamente una unidad de extensibilidad — un addon, un preset vertical, un theme o un connector pack. Es la **fuente de verdad** tanto para el runtime (que lo usa para aprovisionar el schema y montar las rutas) como para la UI (que lo lee para renderizar componentes tipados). Todo lo demás — código Go, componentes React, assets — es opcional.

El formato actual es el **Module Contract v3** (`apiVersion: asteby.com/v3`). El principio detrás: *el manifest es el contrato, el código es un detalle de implementación.* Si una capability, un evento, un schema o un slot de UI no está declarado en el manifest, no existe — el kernel nunca introspecciona el binario del addon para descubrir comportamiento.

[[toc]]

## Por qué un solo archivo

El drift es el costo dominante del tooling de admin: los schemas evolucionan más rápido que los handlers, los handlers más rápido que las UIs, y los tres terminan describiendo productos ligeramente distintos. El manifest colapsa eso en un solo artefacto:

- **Versionado en git.** Los diffs son revisables; los rollbacks son triviales.
- **Validado por máquina.** Un JSON Schema formal (`manifest-v3.schema.json`, Draft 2020-12) rechaza addons ambiguos antes de que se buildeen. El `v3.Validate` del kernel es estricto — los campos fuera del contrato se rechazan.
- **Leído por cada capa.** El kernel, el SDK, la CLI y la UI leen los mismos campos. No hay un segundo contrato que mantener.

Cuando un addon se comporta mal, el manifest es el único lugar donde mirar.

## Kinds

`metadata.kind` selecciona la forma de nivel superior que el kernel instala:

| kind | Qué es |
|---|---|
| `Addon` | Un módulo foundation que aporta modelos, eventos, slots, RBAC y código. |
| `Preset` | Un bundle curado de addons con settings por defecto — un *vertical* que se instala como una sola unidad. Declara `preset.addons[]`; no puede declarar sus propios `models[]`. |
| `Theme` | Una contribución puramente visual (tokens, fuentes, overrides de íconos). Sin código, sin modelos. |
| `ConnectorPack` | Un set de credenciales + templates de capability para APIs de terceros (Stripe, Mercado Pago, …). |

El schema aplica las exclusiones mutuas (un `Preset` no puede declarar modelos, etc.); el kernel rechaza bundles inconsistentes al instalar.

## Layout de nivel superior

```jsonc
{
  "apiVersion": "asteby.com/v3",
  "kind":       "Addon",

  "metadata":        { "key": "...", "version": "...", "i18n": {...}, "countries": [...] },
  "compatibility":   { "requires": [ { "key": "kernel", "version": ">=3.0.0 <4.0.0" } ] },
  "tenancy":         { "isolation": "shared", "rls_column": "organization_id" },
  "capabilities":    [ { "kind": "db:write", "target": "addon_inventory.*" } ],
  "models":          [ { "key": "Product", "table": "products", "columns": [...] } ],
  "contributions":   { "navigation": [...], "slots": [...], "actions": [...], "subscriptions": [...] },
  "extension_points":{ "events": [...], "slot_kinds": [...], "model_extensions_accepted": [...] },
  "lifecycle":       { "install": "Install", "upgrade": [...], "uninstall": "Uninstall" },
  "i18n":            { "default_locale": "es-MX", "bundles": [...] },
  "rbac":            { "roles": [...], "permissions": [...] },
  "settings":        [ { "key": "...", "type": "number", "description": "..." } ],
  "billing":         { "metered_events": [...] },
  "signature":       { "algorithm": "ed25519", "key_id": "...", "value": "...", "signed_at": "..." }
}
```

## Metadata

`metadata` lleva la identidad y los campos de cara al catálogo:

- `key` — identificador estable y único globalmente (`^[a-z][a-z0-9_]{1,63}$`). Define el schema Postgres `addon_<key>` y el namespace de rutas.
- `name`, `version` (semver), `description`, `category`, `author`, `website`, `license`, `icon`, `screenshots`, `features`.
- `i18n` — overrides por locale de los strings del catálogo (name/description), para que el marketplace renderice el addon en `es` o `en`.
- `countries` — códigos de país ISO opcionales que acotan el addon a regiones específicas en el catálogo.

## Models

Un modelo mapea a una tabla de base de datos. El instalador lo lee, genera el DDL y lo ejecuta dentro de una transacción de migración. Los identificadores usan casing con **guión bajo** (SQL).

```json
{
  "key": "Ticket",
  "table": "tickets",
  "label": "tickets.model.ticket",
  "columns": [
    { "name": "id",         "type": "uuid",        "primary_key": true, "default": "gen_random_uuid()" },
    { "name": "organization_id", "type": "uuid",   "not_null": true },
    { "name": "title",      "type": "text",        "not_null": true, "comment": "Resumen corto" },
    { "name": "status",     "type": "text",        "default": "'open'" },
    { "name": "created_at", "type": "timestamptz", "not_null": true, "default": "now()" }
  ],
  "indices": [ { "name": "tickets_org_status_idx", "columns": ["organization_id", "status"] } ],
  "foreign_keys": [
    { "columns": ["assignee_id"], "references": { "model": "core.User", "columns": ["id"] }, "policy": "physical" }
  ]
}
```

Los tipos de columna mapean a Postgres (`uuid`, `text`, `numeric`, `boolean`, `timestamptz`, `jsonb`, …). Cada columna acepta `not_null`, `unique`, `default` (validado contra un whitelist de literales) y `comment`. Las foreign keys llevan un `policy` — `physical` (un FK real) o `logical` (validado por el runtime, sin constraint en la DB).

## Capabilities

Las capabilities son el **contrato del addon con el runtime**. Declaran qué subsistemas va a tocar el addon. El kernel las aplica en cada llamada: un addon que intenta escribir una tabla sobre la que no tiene `db:write` es rechazado, sin importar quién sea el usuario.

```json
"capabilities": [
  { "kind": "db:read",    "target": "addon_tickets.*" },
  { "kind": "db:write",   "target": "addon_tickets.*" },
  { "kind": "event:emit", "target": "tickets.changed" },
  { "kind": "http:fetch", "target": "https://api.example.com/*", "reason": "fetch external data" }
]
```

El set cerrado de kinds es: `db:read`, `db:write`, `http:fetch`, `event:emit`, `event:subscribe`, `fs:read`, `secrets:read`, `cron:register`, `queue:produce`, `queue:consume`, `file-storage:write`, `time:wallclock`. El schema propio del addon (`addon_<key>.*`) siempre es accesible — nunca lo declares. Las lecturas/escrituras cross-schema necesitan un grant explícito (`db:read public.users`, etc.).

Cada capability tiene un `kind`, un `target` y opcionalmente un `reason` (mostrado a los operadores al instalar). La lista completa de kinds y la sintaxis de targets está en el [WASM ABI del kernel](https://asteby.github.io/metacore-kernel/wasm-abi). El kernel corre el enforcer en modo **shadow** (registra violaciones, permite) o **enforce** (bloquea la llamada).

## RBAC: permisos y roles

Donde las capabilities restringen al *addon*, RBAC restringe al *usuario*. v3 declara tanto roles de primera clase como los permisos que agrupan:

```json
"rbac": {
  "permissions": [
    { "key": "tickets.read",  "label": "Leer tickets" },
    { "key": "tickets.write", "label": "Crear / actualizar / borrar tickets" }
  ],
  "roles": [
    { "key": "tickets_agent", "label": "tickets.role.agent",
      "permissions": ["tickets.read", "tickets.write"] }
  ]
}
```

Una llamada tiene que pasar ambos ejes. Aunque el addon tenga `db:write`, el usuario igual necesita el permiso. Ver [Permisos](/es/concepts/permissions) para el modelo completo.

## Contributions

`contributions` es el lado consumidor del acoplamiento entre addons — todo lo que el addon agrega a la superficie del host.

### Actions

CRUD cubre lecturas y escrituras; las acciones cubren todo lo demás — operaciones bulk, integraciones, side effects.

```json
"contributions": {
  "actions": [
    {
      "key": "close_with_reason",
      "label": "tickets.action.close",
      "target_model": "Ticket",
      "confirm": true,
      "fields": [
        { "name": "reason", "type": "text", "required": true }
      ],
      "handler": { "type": "wasm", "function": "CloseWithReason" }
    }
  ]
}
```

Una acción puede manejar su UI de tres formas: un prompt de **`confirm`**, un modal genérico autoconstruido desde **`fields`** declarativos, o un **`modal`** frontend custom (por slug). Los fields soportan los tipos de input habituales más **grupos de line-items** (un grupo repetible declarativo — p. ej. líneas de factura). El kernel monta `POST /api/dynamic/:model/:id/actions/:key`; el runtime renderiza el botón en el scope correcto y el cuerpo de la acción es tu código.

### Navigation, slots y subscriptions

- `navigation[]` — dónde aparece el addon en la nav del host. Un item de nav con un `model` queda cableado al CRUD dinámico sin código frontend.
- `slots[]` — el addon aporta un componente React a un **`slot_kind` publicado** que es propiedad de otro addon (o del host). El host lo renderiza vía `<Slot name="..." />`; el acoplamiento es por slot kind tipado, nunca por path de import.
- `subscriptions[]` — el addon reacciona a un evento publicado con un `handler` (`wasm` / `webhook`), opcionalmente filtrado. Esto reemplaza los mapas free-form de hooks CRUD de v2.

## Extension points

`extension_points` es el lado publicador: lo que *este* addon ofrece para que otros lo extiendan.

- `events[]` — eventos nombrados a los que otros addons pueden suscribirse, cada uno con un `payload_schema`.
- `slot_kinds[]` — superficies de UI tipadas que este addon posee, cada una con un `props_schema`.
- `model_extensions_accepted[]` — los modelos que optan por permitir que otros addons les agreguen columnas.

El kernel rechaza suscripciones a eventos no declarados, contribuciones a slot kinds no declarados y extensiones de modelos que no optaron.

## Tenancy

```json
"tenancy": { "isolation": "shared", "rls_column": "organization_id" }
```

`shared` (el default, correcto para ~95% de los addons) mantiene a todos los tenants en un schema con una `rls_column` y una policy RLS de Postgres que filtra por la org actual. `schema` crea un schema por instalación; `database` está reservado.

## Settings, billing, signature

- `settings[]` — valores configurables por instalación. v3 agrega `description` y un tipo `number` junto a `string`, `select`, `boolean`, etc. `secret: true` mantiene el valor del lado del server.
- `billing.metered_events[]` — metering declarado en el manifest con un `revenue_share`. (El `price` free-form de v2 desapareció; el pricing vive acá y en el marketplace.)
- `signature` — firma ed25519 con `key_id` y `signed_at`, verificada antes de desempaquetar el bundle. Los manifests sin firmar instalan solo en modo dev (`KERNEL_ALLOW_UNSIGNED=1`).

## Compatibilidad con v2

**Escribí v3.** Es el contrato canónico — `apiVersion: asteby.com/v3` es la forma que describe esta página y la superficie donde aterriza cada feature nueva (presets, action modals, line-items, roles RBAC, `metadata.i18n`/`countries`).

Por compatibilidad, el **kernel dual-lee v2**: desde v0.13 el instalador también acepta manifests v2 legacy (sin `apiVersion`, con `key`/`model_definitions`/rango `kernel` planos) y los up-convierte transparentemente a la forma v3 en memoria, así los addons viejos siguen instalando y corriendo mientras el ecosistema migra. El tooling del SDK (CLI, scaffolder, examples) está **migrando para emitir v3**; hasta que eso aterrice puede que todavía veas output v2 en algunos flujos. El kernel **4.x** quita v2 por completo. El mapeo campo por campo está en la [guía de migración v2→v3 del kernel](https://asteby.github.io/metacore-kernel/).

## Qué no está en el manifest

- **Lógica de negocio.** Validadores custom, cuerpos de acciones, integraciones — todo en Go (o Go compilado a WASM), no en JSON.
- **Cableado de federation.** La selección de runtime `frontend`/`backend` vive en el manifest del *bundle* que lee el loader, no en el contrato entre addons.
- **Config por deployment.** Variables de entorno, secrets, feature flags — no son asunto del addon.

## Relacionado

- [CRUD dinámico](/es/concepts/dynamic-crud) — qué hace el runtime con `models[]`.
- [Permisos](/es/concepts/permissions) — modelo capability + RBAC.
- [Lifecycle](/es/concepts/lifecycle) — qué pasa cuando un manifest cambia entre versiones.
