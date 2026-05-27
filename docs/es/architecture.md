# Arquitectura

Metacore son cuatro capas apiladas una sobre la otra. Cada capa tiene un trabajo y un contrato limpio con la capa de arriba. La mayoría de los equipos solo se va a preocupar por dos a la vez — el host en el que están embebiendo y el addon que están construyendo. El resto es lo que lo hace funcionar de punta a punta.

[[toc]]

## Las cuatro capas

```
┌──────────────────────────────────────────────────────────┐
│  Hosts (your application)                   the surface  │
│   └─ React + Vite + @asteby/metacore-runtime-react       │
├──────────────────────────────────────────────────────────┤
│  Host backends (Go)                          the embed   │
│   └─ host.App + host.Host                                │
├──────────────────────────────────────────────────────────┤
│  metacore-kernel                             the runtime │
│   └─ dynamic CRUD · permissions · ws · wasm · lifecycle  │
├──────────────────────────────────────────────────────────┤
│  metacore-sdk + addons                       the contract│
│   └─ manifest.json (v3) · runtime-react · CLI · packages │
└──────────────────────────────────────────────────────────┘
```

### 1. El contrato — `metacore-sdk` + addons

La capa de abajo es **qué es un addon**. El SDK define:

- El **schema del manifest** — la forma de `manifest.json`, la fuente de verdad del addon. El contrato actual es el **Module Contract v3** (`apiVersion: asteby.com/v3`): `metadata`, `capabilities`, `models`, `contributions`, `extension_points`, `tenancy`, `rbac`, `settings`, `lifecycle`. También cubre unidades que no son addons — `kind: Preset` (un bundle vertical de addons), `Theme` y `ConnectorPack`.
- El **formato del bundle** — `.mcbundle`, un tarball firmado con el manifest, módulo WASM opcional, assets y código frontend.
- El **runtime de frontend** — `@asteby/metacore-runtime-react` más packages hermanos (auth, theme, ui, i18n, app-providers, websocket, notifications, billing, marketplace, …) que leen la misma metadata que expone el kernel y renderizan UI tipada sin código a medida.
- La **CLI** — la herramienta Go `metacore` (`go install github.com/asteby/metacore-sdk/cli@latest`) hace scaffold, validate, build, firma y publica addons.

Un addon es solo un directorio con un manifest, código Go opcional (compilado a WASM) y código React opcional que se registra como un slot. Es la única capa que la mayoría de los constructores de apps va a tocar.

### 2. El runtime — `metacore-kernel`

El kernel es una librería Go que embebés en un server [Fiber](https://gofiber.io/). Posee:

- **CRUD dinámico.** Un store genérico lee `models[]` del manifest y sirve list / get / create / update / delete sobre REST. Paginación, sort, filter, filtros por relación, group-by y agregaciones vienen gratis.
- **Permisos.** Dos capas: chequeos de capability (¿el addon tiene `db:write` en esta tabla?) y permisos por usuario sobre recursos (¿este usuario tiene `tickets.create`?). Ambos aplicados en cada llamada.
- **Lifecycle.** Install, upgrade, uninstall — migraciones de schema, ejecución de hooks, registro de metadata. Hot, sin reinicio.
- **Sandbox WASM.** Los addons que corren código lo hacen dentro de [wazero](https://wazero.io/). El kernel expone un ABI chico y auditado; el addon no puede ver la memoria ni el filesystem del host.
- **WebSockets.** Un hub en tiempo real se monta automáticamente. Los addons emiten eventos; los clientes se suscriben por tenant + canal.

El kernel expone su propia superficie como API Go y como rutas HTTP. Los hosts eligen cuánto montar.

### 3. El embed — backends de host

Un **backend de host** es un binario Go que importa el kernel y agrega lo que sea específico de ese producto: auth, billing, integraciones, endpoints de dominio custom. El kernel provee helpers `host.App` y `host.Host` que manejan el boilerplate (config, DI, routing, graceful shutdown).

El kernel se monta sobre un router [Fiber](https://gofiber.io/) — `app.Mount(fiberApp.Group("/api"))` enchufa las routes de CRUD dinámico, metadata, options y métricas bajo cualquier prefijo, junto a tus routes existentes. Un `main.go` típico tiene menos de 60 líneas.

### 4. La superficie — frontends de host

Un **frontend de host** es una app Vite + React que usa `@asteby/metacore-runtime-react` para renderizar UIs de addons. El runtime trae la metadata desde el kernel, monta los componentes correctos y expone hooks para todo lo demás: queries, mutaciones, tiempo real, navegación, composición de slots.

Un host puede tomar muchas formas: un panel interno de operador, un portal cara al cliente, una superficie de marketplace y admin, un área de configuración embebida dentro de un producto existente, una UX vertical específica. Todos consumen el mismo SDK; ninguno tiene lógica custom para un addon individual.

## Flujo de datos: declarar → CRUD UI

Un usuario abre la página de Tickets en un frontend de host. Esto es lo que pasa:

```
manifest.json                      ┌──────────────────┐
  models: Ticket                   │  installer       │
  capabilities: db:rw              │  applies DDL,    │
        │                          │  registers meta  │
        ▼                          └────────┬─────────┘
  installed bundle ────────────────────────▶│
                                            ▼
   ┌────────────────────────────────────────────────┐
   │  kernel                                        │
   │  GET  /api/metadata/table/tickets        ──────┼──▶ schema
   │  GET  /api/dynamic/tickets?page=1&...     ─────┼──▶ rows
   │  enforces: capability + user permission         │
   └────────┬───────────────────────────────────────┘
            │
            ▼
   ┌──────────────────────┐
   │  host frontend       │
   │  <DynamicTable>      │
   │   reads meta + rows  │
   │   renders columns,   │
   │   pagination, sort   │
   └──────────────────────┘
```

Vale la pena marcar algunas cosas:

1. **No hay código por tabla.** Ni `TicketsController`, ni `TicketsListPage`. El runtime compone ambos desde la metadata.
2. **Cada llamada está permisionada.** El kernel chequea tanto la capability del addon (declarada en el manifest) como el permiso del usuario sobre el recurso (otorgado en runtime). Un addon mal configurado no puede escapar de su propio contrato.
3. **El tiempo real es implícito.** El mismo store que maneja las escrituras empuja eventos de cambio a través del hub WebSocket; el componente de tabla del SDK se suscribe por defecto.

## Una acción custom

CRUD cubre el 80%. El 20% restante — operaciones de dominio, integraciones, side effects — viene a través de `contributions.actions[]`:

```json
{
  "contributions": {
    "actions": [
      {
        "key": "close_with_reason",
        "label": "Close ticket",
        "target_model": "Ticket",
        "confirm": true,
        "fields": [
          { "name": "reason", "type": "text", "required": true }
        ],
        "handler": { "type": "wasm", "function": "CloseWithReason" }
      }
    ]
  }
}
```

El kernel monta `POST /api/dynamic/tickets/:id/actions/close_with_reason`. El runtime renderiza un botón en cada fila del `<DynamicTable>` y — como la acción declara `fields` — un modal autogenerado para los inputs (una acción también puede apuntar a un `modal` custom o a un simple prompt de `confirm`, y los inputs pueden incluir grupos repetibles de line-items). El cuerpo de la acción es tuyo — código Go dentro del addon (compilado a WASM, o registrado directamente si es un addon embebido).

El patrón se repite: declarás la forma, enchufás el comportamiento, el resto es automático.

## Pipeline de release cross-repo

```
asteby/metacore-sdk                    asteby/metacore-kernel
  ├─ changesets PR                       ├─ feature PR
  ├─ Version Packages PR                 ├─ tag vX.Y.Z
  ├─ npm publish (todos los packages)    ├─ GoReleaser → GitHub Release
  └─ TypeDoc → Pages                     └─ pkg.go.dev refresh
                                                │
   ┌────────────────────────────────────────────┴────────┐
   ▼                                                     ▼
 host frontends                                   host backends
 install via pnpm,                                go get -u,
 pickup new SDK in Vite                           rebuild binary
```

Los dos repos cortan releases independientemente. El SDK es el ruidoso (churn de frontend); el kernel es el conservador (contrato del runtime). Las versiones se coordinan cuando un release del SDK requiere un feature del kernel, pero no tienen que salir juntos.

## A dónde ir después

- [Manifest](/es/concepts/manifest) — el contrato en profundidad.
- [CRUD Dinámico](/es/concepts/dynamic-crud) — el loop request/response.
- [Permisos](/es/concepts/permissions) — modelo de capability + por usuario.
- [Lifecycle](/es/concepts/lifecycle) — install, upgrade, uninstall.
- [Docs del Kernel ↗](https://asteby.github.io/metacore-kernel/) — subsistemas internos y APIs.
- [Docs del SDK ↗](https://asteby.github.io/metacore-sdk/) — cada package y cada componente.
