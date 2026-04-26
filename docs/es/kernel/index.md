<p align="center">
  <img src="/logo.svg" width="120" alt="Metacore Kernel" />
</p>

<h1 align="center">Metacore Kernel</h1>

<p align="center"><em>El runtime de Metacore — WASM seguro, CRUD dinámico y un modelo de permisos declarativo en una sola librería de Go.</em></p>

El **Metacore Kernel** es la librería Go que embebés en tu app. Es dueño del schema de la base de datos, la superficie de CRUD dinámico, los gates de permisos, el ciclo de vida de los addons, el hub de WebSocket, el endpoint de métricas, el sandbox de WASM y el instalador de manifest. Vos aportás un router de Fiber y un handle de Postgres; el kernel monta todo lo demás y lo mantiene consistente entre reloads.

## Links rápidos

- [Inicio rápido de embedding](./embedding-quickstart) — tu primer host con el kernel embebido.
- [Sistema dinámico](./dynamic-system) — cómo un manifest se vuelve un módulo CRUD funcional.
- [API dinámica](./dynamic-api) — referencia completa de la API HTTP con ejemplos curl.
- [Permisos](./permissions) — modelo de capabilities, modos, implementaciones de store.
- [Guía del consumidor](./consumer-guide) — guía extensa de embedding.
- [Configuración de desarrollo](./dev-setup) — cómo contribuir al kernel mismo.
- [Release](./release) — cómo se cortan las versiones del kernel.

## Subsistemas

| Subsistema | Responsabilidad |
|---|---|
| `runtime/wasm` | Sandbox de WASM basado en wazero; instancias de módulo por addon con imports limitados por capability. |
| `ws` | Hub de WebSocket — fan-out por usuario, organización, canal; contrato de auto-reconexión con el provider del SDK. |
| `security` | Política compilada `Capabilities`; guard SSRF de egress; enforcer a nivel addon. |
| `installer` | Hot-loadea `.mcbundle`s — corre migraciones, registra metadata, monta handlers, firma. |
| `lifecycle` | Transiciones de install / enable / disable / upgrade / uninstall para addons. |
| `host` | `host.Host` y `host.App` — la superficie pública contra la que componen las apps que embeben. |
| `events` | Bus pub/sub de eventos sobre el que emiten los addons; in-process hoy, pluggable. |
| `eventlog` | Log de auditoría append-only de operaciones CRUD, decisiones de permisos y eventos de ciclo de vida de addons. |
| `navigation` | Sidebar / árbol de routes construido a partir de manifests; respeta los gates de capability por usuario. |
| `metadata` | Schemas materializados de tabla/modal/options servidos a los clientes `<DynamicTable>`. |
| `manifest` | Parser y validador de `manifest.json`; tipos canónicos compartidos con el SDK. |
| `dynamic` | Servicio + handler genérico de CRUD — list, get, create, update, delete sobre cualquier modelo registrado. |
| `permission` | Servicio de roles/capabilities a nivel usuario + middleware de Fiber. |
| `notifications` | Cola de notificaciones por usuario, fan-out hacia `ws` y almacenamiento durable. |
| `webhooks` | Webhooks salientes firmados con HMAC — list, create, deliver, retry, test/replay. |
| `query` | Parser de filter / sort / paginate compartido por `dynamic` y los handlers del host. |

## Repo

El código fuente, issues y releases viven en [`asteby/metacore-kernel`](https://github.com/asteby/metacore-kernel). El kernel es Apache-2.0.

## Combinalo con el SDK

El kernel expone el contrato de metadata, permisos y CRUD que el [Metacore SDK](/es/sdk/) consume desde el lado React. Los dos se publican de forma independiente — la versión del kernel `vX.Y.Z` y la versión del SDK `vA.B.C` son compatibles siempre que coincidan en las shapes JSON documentadas en [API dinámica](./dynamic-api).
