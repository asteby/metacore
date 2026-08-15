<p align="center">
  <img src="/logo.svg" width="120" alt="Metacore" />
</p>

<h1 align="center">Referencia de <code>manifest.json</code> — Module Contract v3</h1>

El manifest es el **único contrato** entre un addon y el kernel/hub de metacore.
Se escribe en JSON, se valida con Go (`metacore-kernel/manifest/v3`), se escanea
en el pipeline de publish del hub (`hub/backend/internal/scanner`) y se refleja
en tipos TS para el SDK.

> **Este documento refleja solo `apiVersion: "asteby.com/v3"`.** v3 es
> **estricto** — `Validate()` rechaza campos top-level desconocidos y formas
> mal armadas. El kernel todavía hace dual-read de manifests v2 legacy (sin
> `apiVersion`) para addons publicados antes de que v3 shippeara, pero
> **escribí cada addon nuevo en v3** — la forma de abajo es la que el kernel
> actual (`metacore-kernel` v0.94.x al momento de escribir esto) realmente
> entiende. La fuente de verdad autoritativa en Go es
> `metacore-kernel/manifest/v3/types.go` (con comentarios extensos — leelo
> directamente cuando este doc y el código alguna vez no coincidan, gana el
> código).
>
> Scaffoldeá con `metacore init <key>` y mirá un addon real, publicado —
> ej. `addons/packages/mercadopago/manifest.json` en el monorepo
> `asteby-hq/addons` — como referencia funcional.

## Tabla de contenidos

- [Forma top-level](#forma-top-level)
- [1. `metadata{}`](#1-metadata)
- [2. `compatibility{}`](#2-compatibility)
- [3. `tenancy{}`](#3-tenancy)
- [4. `capabilities[]`](#4-capabilities)
- [5. `models[]`](#5-models)
  - [5.1 `columns[]`](#51-columns)
  - [5.2 `seed`](#52-seed)
  - [5.3 `formulas[]` y `rollups[]` — el motor de compute](#53-formulas-y-rollups--el-motor-de-compute)
  - [5.4 `sequences[]`](#54-sequences)
  - [5.5 `form_layout` y `Column.section`/`visible_when`](#55-form_layout-y-columnsectionvisible_when)
  - [5.6 Stage machines: `stage_field`/`stages[]`/`transitions[]`/`on_transition[]`](#56-stage-machines-stage_fieldstagestransitionson_transition)
  - [5.7 `relations[]` y sub-tablas embebidas](#57-relations-y-sub-tablas-embebidas)
  - [5.8 `locking` y `constraints[]`](#58-locking-y-constraints)
- [6. `frontend{}` — federación](#6-frontend--federación)
- [7. `contributions{}`](#7-contributions)
  - [7.1 `navigation[]`](#71-navigation)
  - [7.2 `actions[]` — placement, modals federados, wizards](#72-actions--placement-modals-federados-wizards)
  - [7.3 `dashboard[]`](#73-dashboard)
  - [7.4 `documents[]`](#74-documents)
  - [7.5 `notifications[]`](#75-notifications)
- [8. `connectors[]`](#8-connectors)
- [9. `schedules[]` y `webhooks[]`](#9-schedules-y-webhooks)
- [10. `rbac{}` — permisos](#10-rbac--permisos)
- [11. `i18n{}`](#11-i18n)
- [12. `extension_points{}`](#12-extension_points)
- [13. `lifecycle{}`](#13-lifecycle)
- [14. `settings[]`](#14-settings)
- [15. `signature{}`](#15-signature)
- [16. `kind: Preset | Theme | ConnectorPack`](#16-kind-preset--theme--connectorpack)

## Forma top-level

```json
{
  "apiVersion": "asteby.com/v3",
  "kind": "Addon",
  "metadata": { "...": "identidad + copy de marketplace" },
  "compatibility": { "requires": [{ "key": "kernel", "version": ">=3.0.0 <4.0.0" }] },
  "tenancy": { "isolation": "shared", "rls_column": "organization_id" },
  "capabilities": [ "..." ],
  "models": [ "..." ],
  "frontend": { "...": "bundle federado" },
  "contributions": { "...": "navigation, actions, dashboard, documents, notifications" },
  "connectors": [ "..." ],
  "schedules": [ "..." ],
  "webhooks": [ "..." ],
  "extension_points": { "...": "..." },
  "lifecycle": { "...": "..." },
  "i18n": { "...": "..." },
  "rbac": { "...": "..." },
  "settings": [ "..." ],
  "billing": { "...": "..." },
  "signature": { "stamped": "por el hub al publicar" }
}
```

`kind` selecciona la forma del documento: `Addon` (el caso común — todo lo de
abajo), `Preset` (un bundle de addons + defaults, ver [§16](#16-kind-preset--theme--connectorpack)),
`Theme` (design tokens) o `ConnectorPack` (un provider de credenciales
standalone no atado a un addon).

## 1. `metadata{}`

```json
"metadata": {
  "key": "tickets",
  "name": "Tickets",
  "description": "Mesa de ayuda con SLAs y asignación automática.",
  "version": "1.0.0",
  "category": "operations",
  "icon": { "type": "lucide", "slug": "Ticket", "color": "#f59e0b" },
  "author": "Asteby",
  "website": "https://asteby.com",
  "license": "Apache-2.0",
  "readme": "README.md",
  "screenshots": ["screenshots/board.png"],
  "features": ["SLA automático", "Asignación por carga"],
  "countries": ["MX"],
  "i18n": {
    "es": { "name": "Tickets", "description": "..." },
    "en": { "name": "Tickets", "description": "..." }
  }
}
```

| Campo | Requerido | Notas |
|---|---|---|
| `key` | sí | Regex `^[a-z][a-z0-9_]{1,63}$`, único globalmente. Define el schema Postgres `addon_<key>` y el namespace de routes `/m/<key>`. |
| `name`, `version` | sí | `version` es semver estricto. |
| `description`, `category`, `author`, `website`, `license`, `readme`, `screenshots[]`, `features[]` | no | Copy de la card del marketplace. |
| `icon` | no | `{type, slug, color}`. `type`: `"lucide"`, `"brand"` (simple-icons), o `"url"`. |
| `countries` | no | Códigos ISO 3166-1 alpha-2 (ej. `["MX"]`). Vacío = global. Usalo para complementos fiscales region-locked. |
| `i18n` | no | `{name, description, features}` por locale, sobrescribiendo el copy default para el catálogo localizado del hub. Distinto del bloque `i18n{}` top-level (bundles de strings de la UI de la app, [§11](#11-i18n)). |

## 2. `compatibility{}`

```json
"compatibility": { "requires": [{ "key": "kernel", "version": ">=3.0.0 <4.0.0" }] }
```

`requires[]` es una lista de peer-dependency; `key: "kernel"` está reservado
para el rango semver del kernel. `optional: true` + `reason` documentan una
dependencia soft (ej. "UI más rica si `crm-lite` está instalado").

## 3. `tenancy{}`

```json
"tenancy": { "isolation": "shared", "rls_column": "organization_id" }
```

| `isolation` | Comportamiento |
|---|---|
| `"shared"` (default) | Un solo schema `addon_<key>`, columna `organization_id`. El scoping de tenant se enforcea **en la capa de queries de Go**, sin depender de RLS de Postgres como único límite — existen policies de RLS pero cada handler igual filtra por org explícitamente (defensa en profundidad; no asumas que RLS solo alcanza para saltearte un filtro de org). |
| `"schema"` | Un schema por instalación, creado al instalar / dropeado al desinstalar. Usalo para datos regulados. |
| `"database"` | Reservado para uso futuro. |

## 4. `capabilities[]`

Permisos sandboxed que el addon pide, enforced en runtime. Ver
[`capabilities.md`](./capabilities) para el catálogo completo de kinds.

```json
"capabilities": [
  { "kind": "db:read",       "target": "users",           "reason": "Display author names" },
  { "kind": "http:fetch",    "target": "api.mercadopago.com", "reason": "Create payment preferences" },
  { "kind": "connector:read","target": "mercadopago",      "reason": "Read the org's credentials" },
  { "kind": "event:emit",    "target": "ticket.resolved" }
]
```

El schema propio del addon (`addon_<key>.*`) siempre es accesible — nunca lo
declares. Si un handler WASM importa `http_request` o `connector_get`, la
capability `http:fetch` / `connector:read` correspondiente es **obligatoria**:
el scanner del hub detecta estáticamente esos dos imports del host en el
módulo `.wasm` compilado (son imports reales del ABI, gateados, no un grep de
texto) y **rechaza el publish** si falta la capability correspondiente.

## 5. `models[]`

Cada entrada se materializa como `CREATE TABLE addon_<key>.<table>` (o
extiende el schema del host scoped a org cuando el modelo no es local al
schema — ver `table`).

```json
"models": [{
  "key": "Ticket",
  "table": "tickets",
  "label": "tickets.model.label",
  "columns": [
    { "name": "title",  "type": "string", "not_null": true },
    { "name": "status", "type": "string", "default": "open" },
    { "name": "total",  "type": "decimal", "default": 0 }
  ]
}]
```

Declarar un modelo con solo `table` + `columns[]` alcanza para tener
**CRUD completo automáticamente** — list/create/read/update/delete, la UI de
tabla dinámica, el modal de create/edit, gating de permisos — con cero
código frontend o backend escrito a mano. **No** escribas a mano una
action/handler CRUD para un modelo que ya la tiene gratis vía `table`; eso
produce endpoints duplicados espurios. Recurrí a una entrada explícita de
`actions[]` solo para operaciones no-CRUD (transiciones de estado, llamar a
un connector, un wizard custom).

| Campo | Notas |
|---|---|
| `key` | Key lógica del modelo, PascalCase por convención (`Ticket`, `SalesOrder`). Referenciada por `Column.ref`, relations, `target_model` de actions, queries de dashboard. |
| `table` | Nombre de tabla físico/lógico, snake_case. |
| `label` | Label a mostrar — literal o key de i18n. |
| `columns[]` | Ver [§5.1](#51-columns). |
| `indices[]` | `{name, columns[], unique, method}`. |
| `foreign_keys[]` | `{columns[], references:{model, columns[]}, policy: "logical"\|"physical", on_delete}`. |
| `extensions[]` | Adjunta columnas al modelo de **otro addon**: `{target_model, columns[]}`. |
| `relations[]` | Edges inversos 1:N/N:M para el panel de "registros relacionados". Ver [§5.7](#57-relations-y-sub-tablas-embebidas). |
| `seed` | Filas default insertadas (idempotentemente) al instalar. Ver [§5.2](#52-seed). |
| `formulas[]` | Columnas computadas. Ver [§5.3](#53-formulas-y-rollups--el-motor-de-compute). |
| `sequences[]` | Contadores de folio atómicos por org/por branch. Ver [§5.4](#54-sequences). |
| `form_layout` | Agrupación en secciones/wizard para el form nativo de create/edit. Ver [§5.5](#55-form_layout-y-columnsectionvisible_when). |
| `import` | Override del template de import de spreadsheet; omitilo para que el kernel derive uno de las columnas. |
| `locking` | `""` (default) o `"row"`. Ver [§5.8](#58-locking-y-constraints). |
| `stage_field`, `stages[]`, `transitions[]`, `on_transition[]` | Stage machine (pipeline estilo Bitrix). Ver [§5.6](#56-stage-machines-stage_fieldstagestransitionson_transition). |

### 5.1 `columns[]`

```json
{
  "name": "customer_id", "type": "uuid", "label": "Cliente",
  "ref": "Customer",
  "display": "creator", "widget": "dynamic_select",
  "section": "general",
  "visible_when": { "field": "channel", "equals": "b2b" }
}
```

**Plano DDL** (toca la tabla física): `name`, `type`
(`string`|`text`|`uuid`|`int`|`bigint`|`decimal`|`bool`|`timestamp`|`jsonb`),
`primary_key`, `not_null`, `default`, `generated` (una columna Postgres
`GENERATED ALWAYS AS (<expr>) STORED` — incompatible con
`default`/`not_null`; la expresión usa la misma gramática aritmética
restringida que `formulas[].expr`).

**Metadata pura del plano UI** (ignorada por DDL/install, proyectada en la
metadata de tabla/form servida así el SDK renderiza con riqueza sin código
per-app):

| Campo | Propósito |
|---|---|
| `display` | Renderer de celda: `url`, `email`, `phone`, `currency`, `creator`, `status`, `badge`, `tags`, `color`, `code`, `percent`, `image`, `boolean`, `date`. Vacío = inferido de nombre/tipo. |
| `widget` | Input de form: `textarea`, `select`, `dynamic_select`, `email`, `url`, `date`, `number`, `boolean`, `upload`, `image`. Vacío = inferido. |
| `display_config` | Opciones del renderer: `label_field`, `url_field`, `currency`, `decimals`, `base_path`, `new_tab`, `name_field`, `max_length`. |
| `ref` | Convierte la columna en un picker de FK — nombra la key del modelo target. Renderiza un `dynamic_select` buscable que resuelve contra `/api/options/:Ref`. |
| `options` | **O** un array estático `[{value,label,icon?,color?,image?}]` **o** una forma de objeto (picker dependiente): `{source, filter_by, value, label, label_ref, description}` — un `dynamic_select` scoped por un campo hermano (`depends_on`), con el label resuelto de un modelo relacionado. Las dos formas son mutuamente excluyentes en una columna. |
| `options_source` | Nombra una **provider key registrada por el host** (ej. `"registered_models"`) resuelta al momento de servir metadata — un escape hatch para listas de opciones computadas por el host que el kernel mismo no implementa. |
| `depends_on` | Columna hermana cuyo valor provee el filtro cascade para un picker `options` dependiente. |
| `scan` | `true` renderiza un botón de escaneo de barcode con cámara en el field (inputs estilo SKU). |
| `section` | Ata el field a una sección/step de `form_layout` (ver [§5.5](#55-form_layout-y-columnsectionvisible_when)). |
| `visible_when` | `{field, equals}` o `{field, in:[...]}` — esconde el field condicionalmente en el modal de create/edit basado en el valor en vivo de un field hermano. Un field escondido nunca gatea el submit. |
| `readonly` | Valor generado por el sistema (id externo, campo computado): excluido del form de create, read-only en edit, igual renderizado en tablas/detail. |
| `sequence` | Ata a un `Model.sequences[].key`; el kernel estampa el próximo valor de folio en create cuando la columna está vacía. |
| `tooltip`, `description` | Paths de texto secundario para renderizado de celda más rico (ej. mostrar el email del creador debajo de su nombre). |
| `label_image`, `label_icon`, `label_color` (en `ActionField`, no en `Column`) | Ver [§7.2](#72-actions--placement-modals-federados-wizards). |

`default` para el **plano DDL** solo acepta una whitelist: literales
numéricos, strings quoteados sin `'`/`"`/`;`/`\`, los builtins `now()`,
`gen_random_uuid()`, `uuid_generate_v4()`, `current_timestamp`, booleans,
`null`. Cualquier otra cosa es rechazada por `metacore validate` — este es
un gate deliberado anti-SQL-injection, no una limitación para trabajar
alrededor.

Todo identificador provisto por el usuario (`key`, `table`, `name` de
columna) debe matchear `^[a-z][a-z0-9_]{1,63}$`.

### 5.2 `seed`

```json
"seed": {
  "key": "code",
  "rows": [
    { "code": "open", "label": "Abierto" },
    { "code": "closed", "label": "Cerrado" }
  ]
}
```

Datos default declarativos, insertados al instalar. `key` nombra la columna
contra la que el installer matchea para idempotencia — una fila solo se
inserta si ninguna fila existente (scoped a la org que instala) ya tiene ese
valor de key, así que reinstalaciones y upgrades nunca duplican filas.

### 5.3 `formulas[]` y `rollups[]` — el motor de compute

Dos tiers del motor de compute declarativo (existe un tercer tier,
respaldado por WASM, para lógica que una expresión no puede expresar):

- **Tier-2 — `Model.formulas[]`**: una columna computada a partir de *otras
  columnas de la misma fila*, evaluada antes de cada write de
  create/update.
  ```json
  "formulas": [{ "target": "subtotal", "expr": "quantity * unit_price - discount" }]
  ```
  `expr` se parsea con una **whitelist estricta**: identificadores que
  resuelven a columnas reales, números decimales, whitespace, `+ - * /`,
  paréntesis — nada más (sin quotes, semicolons, llamadas a función). Seteá
  `"tier": 3, "handler": "wasm:<export>"` en vez de `expr` cuando el cálculo
  necesita data/lógica que la aritmética no puede expresar (resolución de
  price-list, márgenes escalonados); el kernel invoca el export WASM con la
  fila merged y escribe el valor devuelto.

- **Tier-1 — `Model.relations[].rollups[]`**: una columna del **padre**
  mantenida como un agregado sobre las filas hijas de una relation
  (sum/count/avg/min/max), recomputada en cada create/update/delete de un
  hijo vía un único `UPDATE`.
  ```json
  "relations": [{
    "name": "items", "kind": "one_to_many", "through": "SalesOrderItem",
    "foreign_key": "order_id",
    "rollups": [{ "target": "total", "fn": "sum", "from": "subtotal" }]
  }]
  ```
  Potencia la **fila de totales del footer** auto-generada que la tabla
  dinámica renderiza para cualquier modelo con rollups/formulas — sin
  código de UI por addon. `expr` (una expresión aritmética de la fila hija
  en vez de `from`) usa la misma whitelist estricta que `Formula.expr`.

### 5.4 `sequences[]`

```json
"sequences": [{ "key": "folio", "scope": "branch", "format": "A-{seq:06}" }]
```

Contadores atómicos, tolerantes a huecos, por org (o por branch) — el
primitivo detrás de folios de factura y tickets de orden de servicio. Atá
una columna vía `Column.sequence: "folio"` para auto-estampar el próximo
valor formateado en create, o tirá de uno desde un handler WASM vía el
import del host `sequence_next`.

### 5.5 `form_layout` y `Column.section`/`visible_when`

```json
"form_layout": {
  "mode": "sections",
  "sections": [
    { "key": "general", "title": "form.section.general" },
    { "key": "billing", "title": "form.section.billing",
      "visible_when": { "field": "type", "equals": "invoice" } }
  ]
}
```

`mode: "sections"` renderiza bloques titulados, colapsables en un solo
scroll; `mode: "steps"` renderiza un wizard de steps validado — misma forma
`FormSection`, solo cambia la presentación. Las columnas se suman a una
sección vía `Column.section == FormSection.key`; columnas sin asignar caen
en un bloque implícito "General". `FormSection.visible_when` esconde **todo
el bloque**; `Column.visible_when` esconde **un solo field** — ambos usan el
mismo predicado `{field, equals}`/`{field, in}` contra valores hermanos, al
momento de render del modal de create/edit. Metadata puramente UI: el plano
DDL/write lo ignora todo. Nil = un form plano (comportamiento legacy).

### 5.6 Stage machines: `stage_field`/`stages[]`/`transitions[]`/`on_transition[]`

```json
"stage_field": "status",
"stages": [
  { "key": "open", "label": "Abierto", "color": "slate", "order": 0 },
  { "key": "in_progress", "label": "En progreso", "color": "amber", "order": 1 },
  { "key": "closed", "label": "Cerrado", "color": "green", "order": 2, "is_final": true }
],
"transitions": [
  { "from": "open", "to": "in_progress" },
  { "from": "in_progress", "to": "closed" }
],
"on_transition": [{
  "from": "*", "to": "closed",
  "set": { "closed_at": "now()" },
  "do": "webhook:notify_closed",
  "required": false
}]
```

Declarar `stage_field` + `stages[]` convierte a un modelo en un
**pipeline kanban estilo Bitrix**: el kernel deriva un display `status` para
la columna (color/label/orden — sin necesitar `options` aparte), el sidebar
puede renderizar un board kanban vía `NavItem.view_type: "kanban"` +
`group_by`, y cada `Update` que mueve `stage_field` se valida contra
`transitions[]` (un movimiento no permitido se rechaza con HTTP 422).
`on_transition[]` dispara efectos secundarios estilo Bitrix en un movimiento
válido: `set` estampa fields en la fila misma (viaja en el mismo save,
visible en el evento canónico), `do` dispatchea un handler
(`wasm:`/`webhook:`/`compiled:`); al menos uno de los dos es requerido por
hook. `required: true` hace rollback de toda la transición si falla el
dispatch de `do`.

### 5.7 `relations[]` y sub-tablas embebidas

```json
"relations": [{
  "name": "items", "kind": "one_to_many", "through": "SalesOrderItem",
  "foreign_key": "order_id", "embed": true,
  "rollups": [{ "target": "total", "fn": "sum", "from": "subtotal" }]
}]
```

`relations[]` declara los edges **inversos** de un modelo — los registros
hijos que una página de detalle/modal puede listar debajo de él (los
vehículos de un Customer, las líneas de un documento). `kind:
"one_to_many"` + `through` (key del modelo hijo) + `foreign_key` (columna
del hijo que apunta de vuelta) es la forma común; `kind: "many_to_many"`
joinea a través de un modelo target. `scope` agrega un filtro de equality
estático para hijos **polimórficos** (una tabla `Attachment` compartida por
muchos owners, discriminada por `owner_model`).

`embed: true` es el flag opt-in que convierte una relation en una
**composición renderizada inline como sub-tabla dentro del modal de
create/edit del padre** — usalo para las LÍNEAS de un documento (items de
orden, entradas de journal). Dejalo en `false` (default) para colecciones
grandes, gestionadas independientemente (movimientos de stock, un kardex)
así abrir el registro padre nunca arrastra miles de filas al form; esas
quedan alcanzables desde su propia página de modelo. `readonly: true` hace
que el panel/sub-tabla sea solo-display (sin create/edit/delete de hijos)
— apropiado para un ledger append-only.

### 5.8 `locking` y `constraints[]`

```json
"locking": "row",
"columns": [{
  "name": "quantity", "type": "int",
  "constraints": [{ "expr": "quantity >= 0", "error_key": "stock.negative" }]
}]
```

`Column.constraints[]` son predicados guard que el kernel evalúa **dentro**
de la transacción de create/update, antes del write — el gemelo declarativo
de un CHECK constraint enforced en la capa de aplicación, sin necesitar
handler WASM. `Model.locking: "row"` envuelve todo el `Update` en una
transacción y carga la fila target con `SELECT … FOR UPDATE` antes de
evaluar constraints, lo que es lo que hace que un guard de
increment-then-check (`quantity >= 0` después de un decremento
concurrente) sea libre de race. **Esta garantía de locking es una propiedad
del lado Go, de un solo request** — no se extiende a través de múltiples
llamadas de import del host WASM (ver
[`wasm-abi.md` §14](./wasm-abi#14-data_mutate--writes-declarativos-desde-un-guest)):
un módulo guest que quiere la misma seguridad usa el `inc{}` de
`data_mutate` para un `SET col = col + delta` atómico, no un par
read-then-write.

## 6. `frontend{}` — federación

```json
"frontend": {
  "entry": "https://cdn.example.com/addons/tickets@1.0.0/remoteEntry.js",
  "format": "federation",
  "expose": "./plugin",
  "container": "metacore_tickets",
  "layout": "shell",
  "integrity": "sha384-..."
}
```

| Campo | Significado |
|---|---|
| `entry` | URL (o path relativo) de `remoteEntry.js`. |
| `format` | `"federation"` (recomendado) o `"script"` (global `window` legacy). |
| `expose` | Nombre del módulo de federación importado por default (ej. `./plugin`). Actions/widgets de dashboard que federan referencian **otros** módulos expuestos del mismo bundle por nombre. |
| `container` | Nombre del container global; debe matchear la config de build de Module Federation del addon. Default `metacore_<key>`. |
| `layout` | `"shell"` (renderizado dentro del chrome/sidebar del host) o `"immersive"` (viewport completo, chrome propio — ej. una pantalla de POS). |
| `integrity` | Hash SRI opcional. |

Ver [`federation.md`](./federation) para la config de singletons compartidos
requerida, [`full-page-federation.md`](./full-page-federation) para los
exposes de página completa `./pages/<slug>`, y [`modals.md`](./modals) para
modals de acción federados.

## 7. `contributions{}`

### 7.1 `navigation[]`

```json
"navigation": [{
  "title": "sidebar.tickets", "icon": "Ticket", "target": "sidebar.operations",
  "items": [{
    "title": "sidebar.tickets.board", "url": "/m/tickets", "icon": "Kanban",
    "model": "Ticket", "view_type": "kanban", "group_by": "status",
    "requires": [{ "model": "Ticket", "actions": ["index", "resolve"] }]
  }]
}]
```

- `target`: id de un grupo de sidebar existente al que sumarse; sin match =
  un grupo nuevo.
- `model`: el host sabe que la ruta es CRUD dinámico sobre ese modelo — sin
  código frontend requerido.
- `view_type`: `"table"` (default) o `"kanban"` (renderiza un board
  agrupado por `group_by`, típicamente el `stage_field` del modelo).
- `filter`: filtro estático columna→valor para una entrada de nav (ej. una
  entrada por status).
- `requires[]` / `requires_capabilities[]`: declara la superficie de datos
  real de la pantalla (modelo + acciones, o strings de capability crudos)
  así el host puede expandir un grant grueso `screen.<slug>.access` en los
  checks RBAC concretos `<table>.<action>` que necesitan las llamadas
  `/api/data/*` de la UI federada — preferí la forma estructurada
  `requires[]` para manifests nuevos.

### 7.2 `actions[]` — placement, modals federados, wizards

```json
"contributions": {
  "actions": [{
    "key": "resolve", "label": "Resolver", "target_model": "Ticket",
    "handler": { "type": "wasm", "function": "resolve_ticket" },
    "placement": "row",
    "requires_state": ["open", "in_progress"],
    "confirm": true,
    "fields": [{ "name": "note", "type": "text", "required": true }],
    "idempotency": { "key_field": "request_id" }
  }]
}
```

`placement` decide **dónde aparece el trigger**:

| Valor | Se renderiza como |
|---|---|
| `""`/`"row"` (default) | Acción por fila en la tabla del modelo, ejecuta contra el registro sobre el que estás. |
| `"table"` | Un botón de toolbar a nivel de página, sin contexto de registro. |
| `"create"` | Un botón de toolbar que **reemplaza** el botón genérico de "crear" — para addons que envían una experiencia de create custom (ej. un asiento contable con líneas de débito/crédito). Abre con un registro vacío; el host suprime su affordance de create default. |

La UI de una acción viene de **una de dos superficies mutuamente
reforzantes**:

- **Form declarativo** — `fields[]` (plano) o `steps[]` (un wizard
  multi-step validado, mutuamente exclusivo con `fields[]`). Cada field es
  un `ActionField`: `type`, `widget`, `ref`/`options`/`options_source`
  (mismo vocabulario de picker que una columna), `visible_when`, `scan`,
  `depends_on`, más soporte de line-items (`type: "array"` +
  `item_fields[]`, `lock_rows` para prohibir agregar/quitar filas,
  `total`/`balance` para un footer sumado con indicador
  balanceado/desbalanceado — ej. Σdebit == Σcredit), y fields de upload
  (`accept`, `max_size`, `storage_path`).
- **Modal federado** — `"modal": "custom_slug"` monta un **componente React
  custom que el propio bundle frontend del addon expone**, en lugar de (o
  junto con) el form declarativo, para UI demasiado rica para una lista
  plana de fields (un panel de checkout, un picker rico). Este es el
  gemelo autoreado-por-addon de `Action.placement: "create"` — ver
  [`modals.md`](./modals) para el contrato de federación (direccionamiento
  de slot, props, cómo el host lo monta).

`handler.type`: `"wasm"` (un export WASM), `"webhook"` (HTTP saliente
firmado HMAC), `"compiled"` (una función Go linkeada en el host), o
**`"connector"`** — dispatchea el **connector de otro addon**
(`{connector: "mercadopago", export: "create_preference"}`), dejando que
una acción maneje un connector que no posee sin duplicar el cliente de ese
connector (ej. una acción de CRM que manda un mensaje de WhatsApp a través
de un connector `link` que nunca implementa ella misma).

`requires_state[]` gatea la acción sobre el `stage_field` (o
`status`/`state`) del registro target — el kernel **enforcea** esto al
dispatch, no solo esconde el botón. `idempotency.key_field` hace la acción
replay-safe: el kernel guarda una respuesta keyed por `(org, model, action,
<valor del field del payload>)` y devuelve la misma respuesta en un retry
sin re-dispatchear — requerido para cualquier cosa adyacente a dinero o
timbrado fiscal que una red inestable pueda reintentar.

### 7.3 `dashboard[]`

```json
"dashboard": [
  { "key": "open_tickets", "title": "dash.open_tickets", "kind": "stat",
    "query": { "model": "Ticket", "aggregate": "count", "where": { "status": "open" } },
    "accent": "amber", "size": "sm" },
  { "key": "heatmap", "title": "dash.heatmap", "kind": "custom",
    "expose": "./StockHeatmap", "size": "lg" }
]
```

Dos sabores en el mismo grid: **declarativo** (cualquier `kind` menos
`"custom"` — `stat`|`bar`|`line`|`area`|`pie`|`donut`|`list`|`progress`) —
el host computa el agregado desde `query` con el motor de agregación del
kernel (scoped a org, aware de soft-delete, gateado por permisos) y el SDK
lo pinta con un renderer built-in, cero código por addon; y **federado**
(`kind: "custom"`) — el addon envía su propio widget React vía `expose`
(de su bundle `frontend`), montado en el grid con el mismo chrome de card.
`permission` gatea visibilidad; el default se deriva como `<table>.index`
desde `query.model`.

### 7.4 `documents[]`

```json
"documents": [{
  "key": "remision", "model": "SalesOrder",
  "template": "templates/remision.html", "paper": "ticket80"
}]
```

Ata un template HTML relativo al bundle a un modelo así el host renderiza
un PDF por registro en `GET /api/data/:model/:id/documents/:key.pdf`,
hidratado con `{{record.<col>}}`, `{{org.branding.<field>}}`,
`{{line_items}}`, `{{now}}`. `paper`: `A4`|`letter`|`ticket80` (rollo de
recibo POS de 80mm).

### 7.5 `notifications[]`

Notificaciones tipo campana in-app que el host emite cuando dispara un
evento CRUD canónico que matchea (`<addon>.<Model>.<action>`) — sin WASM
requerido, evaluado del lado host.

## 8. `connectors[]`

```json
"connectors": [{
  "key": "mercadopago", "label": "mercadopago.connector.label", "auth": "token",
  "form_layout": {
    "mode": "steps",
    "sections": [
      { "key": "connection", "title": "mercadopago.connector.section.connection" },
      { "key": "advanced", "title": "mercadopago.connector.section.advanced" }
    ]
  },
  "credentials": [
    { "key": "access_token", "type": "secret", "required": true, "section": "connection" },
    { "key": "webhook_secret", "type": "secret", "section": "advanced" }
  ],
  "test_export": "test_connection"
}]
```

Declara un provider de credenciales de terceros del que depende el addon.
El host junta + encripta `credentials[]` por org (los fields
`type: "secret"` nunca salen del server en GETs); un handler WASM lee una
credencial vía el import del host `connector_get` (gateado por la
capability `connector:read`), y el `secret_ref`
(`"<connector_key>.<credential_key>"`) de un webhook entrante resuelve a
una de estas. `form_layout` agrupa credenciales en secciones o un wizard
multi-step exactamente igual que el `form_layout` de un modelo — útil
cuando un step necesita primero una conexión en vivo (ej. un
`dynamic_select` alimentado por `options_source` gateado por
`visible_when` en el field de un step anterior). `test_export` nombra un
export WASM que el host invoca para un botón de "probar conexión" en la UI
de config — una llamada barata, read-only, que devuelve
`{success, data:{ok, message}}`.

Esto es distinto de un **manifest standalone `kind: "ConnectorPack"`**
([§16](#16-kind-preset--theme--connectorpack)), que publica un provider
reusable no atado a un addon.

## 9. `schedules[]` y `webhooks[]`

```json
"schedules": [{ "key": "sync_issues", "every": "5m", "do": "wasm:sync_issues" }],
"webhooks": [{
  "key": "github_push", "path": "/webhooks/github",
  "verify": "hmac-sha256", "secret_ref": "github.webhook_secret",
  "do": "wasm:handle_push"
}]
```

`schedules[]` son cron jobs declarativos que el scheduler del kernel
dispara por org instalada según `every` (una duration de Go), dispatcheando
`do` — el backstop que reconcilia lo que un webhook entrante se haya
perdido (patrón webhook-primario + cron-reconcile). `webhooks[]` son rutas
entrantes que el host monta bajo el namespace addon+org; `verify`
selecciona el esquema de firma, `secret_ref` resuelve el secret de firma
desde una credencial de connector declarada.

## 10. `rbac{}` — permisos

```json
"rbac": {
  "roles": [{ "key": "ticket_agent", "label": "Agente", "permissions": ["ticket.index", "ticket.resolve"] }],
  "permissions": [{ "key": "ticket.resolve", "label": "Resolver tickets" }]
}
```

Los permisos se **derivan automáticamente del manifest** para las
superficies estándar — cada modelo obtiene
`<table>.index/create/update/delete`, cada acción custom obtiene
`<table>.<action_key>`, cada entrada de nav con `requires[]` expande
`screen.<slug>.access` en las capabilities concretas que necesita.
`rbac.permissions[]` solo sirve para declarar keys de permiso **extra** sin
mapeo automático a modelo/acción (un feature flag grueso); `roles[]`
agrupa keys en un rol nombrado que el admin de la org puede asignar. El
check de permiso corre **rol × módulo × acción**, gateado en Go en cada
write path — los endpoints de options/search (`/api/options/:ref`,
lookups de dynamic-select) son una excepción documentada **sin gate de
permisos**, ya que solo filtran pares value/label usados para pickers, no
registros completos.

## 11. `i18n{}`

```json
"i18n": {
  "default_locale": "es",
  "bundles": [
    { "locale": "es", "path": "locales/es.json" },
    { "locale": "en", "path": "locales/en.json" }
  ]
}
```

Apunta a archivos de locale relativos al bundle, mergeados a la instancia
i18next del host vía el `I18nProvider` del SDK. Cada `label`/`title`/
`description` en cualquier otra parte del manifest puede ser un string
literal o una key resuelta contra este bundle — el mismo mecanismo resuelve
ambos. Esto es distinto de `metadata.i18n` ([§1](#1-metadata)), que solo
localiza la card del catálogo del marketplace.

## 12. `extension_points{}`

```json
"extension_points": {
  "events": [{ "name": "ticket.resolved", "description": "Fired after a ticket moves to closed" }],
  "slot_kinds": [{ "name": "ticket_sidebar_widget", "description": "Renders in the ticket detail sidebar" }],
  "model_extensions_accepted": ["Ticket"]
}
```

Lo que este addon **publica para que otros extiendan**: nombres de evento a
los que otros addons pueden suscribirse, kinds de slot UI a los que otros
addons pueden contribuir vía `contributions.slots[]` (`{slot_kind, entry,
order, permission}`), y cuáles de sus propios modelos aceptan
`Model.extensions[]` de otros addons.

## 13. `lifecycle{}`

```json
"lifecycle": {
  "install": "wasm:on_install",
  "uninstall": "wasm:on_uninstall",
  "upgrade": [{ "from": "<1.2.0", "type": "sql", "function": "migrations/001_add_priority.sql" }]
}
```

`install`/`uninstall`/`enable`/`disable` son referencias a handler
dispatcheadas en esos puntos. `upgrade[]` es una escalera ordenada de pasos
de migración corridos al hacer upgrade desde una versión que matchea
`from`.

## 14. `settings[]`

Valores configurables por instalación, guardados en el registro de
instalación del host.

```json
"settings": [
  { "key": "slack_webhook", "type": "text", "secret": true, "label": "Slack webhook" },
  { "key": "default_locale", "type": "select", "default": "es-MX",
    "options": [{ "value": "es-MX", "label": "Español (México)" }] }
]
```

`secret: true` nunca sale del server en GETs. `options_source` nombra un
export WASM invocado para traer opciones en vivo (ej. la lista de series
de un connector desde la API de terceros) en vez de un `options[]`
estático. `section` ata a un `form_layout` de la misma forma que una
credencial de connector.

## 15. `signature{}`

Estampado por el hub al momento de publish — nunca lo escribas vos.
`{algorithm: "ed25519", key_id, value, signed_at}` sobre el digest sha256
del tarball, verificado por el host al instalar. Ver
[`addon-publishing.md`](./addon-publishing) para el flujo completo de
publish/sign/verify.

## 16. `kind: Preset | Theme | ConnectorPack`

- **`Preset`** — `preset.addons[]`: `{key, version, optional, requires[]}`
  agrupa múltiples addons; `requires[]` cross-referencia otras keys en el
  *mismo* preset y se ordena topológicamente al instalar.
- **`Theme`** — `theme.tokens`, `theme.fonts[]`, `theme.icon_overrides{}`:
  overrides de design-token para branding white-label.
- **`ConnectorPack`** — `connector_pack.providers[]`: providers de
  credenciales standalone (`{key, label, credentials[]}`) no atados a los
  modelos de un addon.

## Ver también

- [`addon-cookbook.md`](./addon-cookbook) — recetas end-to-end: scaffolding, CRUD, actions, WASM, federación, publicación.
- [`addon-publishing.md`](./addon-publishing) — el flujo real de `metacore publish`, firma, review, scanner.
- [`wasm-abi.md`](./wasm-abi) — el contrato guest/host de WASM, incluyendo `data_mutate`/`data_query`.
- [`capabilities.md`](./capabilities) — catálogo completo de `kind` para `capabilities[]`.
- [`federation.md`](./federation), [`full-page-federation.md`](./full-page-federation), [`modals.md`](./modals) — contratos de federación frontend.
- [`dynamic-ui.md`](./dynamic-ui) — cómo el SDK convierte esta metadata en una UI CRUD funcional.
