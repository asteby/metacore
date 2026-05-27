# Glosario

Definiciones cortas de cada término que recurre en los docs. Los links van a la página que explica el concepto en profundidad.

[[toc]]

## A

**Addon.** Un módulo autocontenido (`kind: "Addon"`) que agrega modelos, endpoints, actions y UI a un host. Definido por un [manifest](/es/concepts/manifest) y empaquetado como un [bundle](#b).

**Action.** Una operación no-CRUD declarada en `contributions.actions[]`. El runtime monta una ruta y renderiza un botón — con un [confirm](#a), un modal autoconstruido desde `fields` declarativos, o un modal custom. Ver el [concepto de manifest](/es/concepts/manifest#actions).

**Action modal.** La UI que una action presenta para sus inputs: un prompt de `confirm`, un modal genérico construido desde `fields`, o un `modal` frontend custom por slug. Los fields pueden incluir [grupos de line-items](#l) repetibles.

**apiVersion.** El campo de nivel superior que selecciona la versión del contrato del manifest. `asteby.com/v3` es el Module Contract actual; un `apiVersion` ausente se lee como v2 legacy (el kernel dual-lee ambos).

**Audit.** Log estructurado de cada chequeo de capability, chequeo de permission y operación de CRUD. Enrutado a través del hook de audit del kernel hacia un sink definido por el host.

## B

**Bundle.** Un archivo `.mcbundle` — un tarball firmado que contiene el manifest, módulo WASM opcional, assets de frontend opcionales y la firma del manifest. La unidad de distribución e instalación.

## C

**Capability.** Un subsistema que el addon promete usar, declarado en `capabilities[]`. Aplicado por el security enforcer del kernel en cada llamada. Ver [Permisos](/es/concepts/permissions#capabilities--el-contrato-del-addon).

**CLI.** La herramienta Go `metacore` (`go install github.com/asteby/metacore-sdk/cli@latest`). Hace scaffolding (`init`), validate, builds, firma y publica addons.

**ConnectorPack.** Un `kind` de manifest que trae credenciales + templates de capability para una API de terceros (Stripe, Mercado Pago, …). Sin modelos ni código propio.

**Contributions.** El lado consumidor del acoplamiento entre addons — `contributions.{navigation,slots,actions,subscriptions,tools}`. Lo que un addon agrega a la superficie del host.

## D

**Dynamic CRUD.** El store + handler genérico del kernel que sirve list / get / create / update / delete (más filtros por relación, group-by y agregaciones) para cualquier modelo declarado en el manifest de cualquier addon instalado. Paginación, sort, filter y tenancy vienen incluidos. Ver la [página de concepto](/es/concepts/dynamic-crud).

**`<DynamicTable>` / `<DynamicCRUDPage>`.** Componentes del SDK que leen la metadata del kernel (`/api/metadata/table/:model`) y renderizan una tabla CRUD completa — y, para `DynamicCRUDPage`, los diálogos de create/edit/view y las actions. El espejo frontend del CRUD dinámico.

## E

**Embedded addon.** Un addon (o modelo) registrado en código — p.ej. `app.RegisterModel(...)` — en lugar de instalado como un bundle. Se usa para features de primera parte que vienen con el binario del host.

**Enforcer.** `security.Enforcer`, el subsistema del kernel que chequea capabilities. Corre en modo shadow o enforce.

**Event.** Un mensaje publicado en el event bus in-process / hub WebSocket. Los eventos publicados se declaran en `extension_points.events[]` (con un payload schema) y se gatean por las capabilities `event:emit` / `event:subscribe`.

**Extension point.** El lado publicador del acoplamiento entre addons — `extension_points.{events,slot_kinds,model_extensions_accepted}`. Lo que un addon ofrece para que otros lo extiendan.

## H

**Host.** Un producto que embebe el kernel y expone los addons instalados a los usuarios. Tiene un backend (Go) y un frontend (Vite + React + SDK). Los hosts pueden tomar muchas formas — paneles de operador, portales orientados al cliente, superficies de marketplace + admin, settings embebidos dentro de un producto existente. Ver [Hosts](/es/ecosystem/hosts).

**Host.App / host.Host.** Tipos helper en el kernel que envuelven config, DI, routing y lifecycle para un backend de host típico.

## I

**Installer.** El subsistema del kernel que maneja install / upgrade / uninstall transaccionalmente. Ver [Ciclo de vida](/es/concepts/lifecycle).

**Identity.** `kernel.Identity`, el contexto de usuario por request — user ID, org ID, roles, más cualquier claim específico del host. Lo setea el middleware de auth del host, lo lee el permission service del kernel.

## K

**Kernel.** El runtime Go — `asteby/metacore-kernel`. Posee persistencia, REST, permissions, lifecycle, el sandbox WASM, el hub WebSocket. Ver [Kernel](/es/ecosystem/kernel).

**Kind.** `metadata.kind` — la forma de nivel superior que el kernel instala: `Addon`, `Preset`, `Theme` o `ConnectorPack`.

## L

**Line items.** Un grupo repetible de fields declarado en una action (p.ej. líneas de factura, ítems de pedido). Un input de array declarativo que el runtime renderiza como filas add/remove en el action modal.

## M

**Manifest.** `manifest.json`, la fuente de verdad para una unidad de extensibilidad. El formato actual es el [Module Contract v3](#m). Declara modelos, capabilities, RBAC, contributions, extension points, lifecycle. Ver la [página de concepto](/es/concepts/manifest).

**Migration.** Un cambio de schema aplicado durante install o upgrade. Generado por el kernel desde el manifest; complementado por la escalera `lifecycle.upgrade[]` del manifest para transformaciones de datos.

**Model.** Una entrada de `models[]` — `key`, `table`, columnas, índices, foreign keys. La representación en runtime alimenta tanto el dynamic store como los componentes del SDK.

**Module Contract.** La especificación formal del manifest. **v3** (`apiVersion: asteby.com/v3`) es el contrato actual y estricto; el kernel dual-lee v2 legacy durante la línea 3.x.

## P

**Permission.** Una key otorgable a usuarios declarada en `rbac.permissions[]`, p.ej. `tickets.write`. Agrupada en [roles](#r). Aplicado por el permission service del kernel. Distinto de una [capability](#c) — las capabilities son sobre el addon, los permissions son sobre el usuario. Ver [Permisos](/es/concepts/permissions).

**`permission.Service`.** El subsistema del kernel que resuelve los permissions efectivos de un usuario y los aplica en cada request.

**Preset.** Un `kind` de manifest que agrupa addons foundation (`preset.addons[]`) con settings por defecto y los instala como una unidad — la unidad de distribución de un vertical.

## R

**RBAC.** El bloque `rbac` — `roles[]` de primera clase más los `permissions[]` que agrupan.

**Role.** Un bundle nombrado de permisos declarado en `rbac.roles[]`. Nuevo en v3.

## S

**Sandbox.** El runtime WebAssembly basado en wazero que ejecuta el código del addon. Tiene acceso solo a la ABI del kernel declarada por las capabilities del addon; sin memoria del host, sin filesystem del host.

**SDK.** `asteby/metacore-sdk` — los packages npm y la CLI Go que declaran addons y renderizan UI. Ver [SDK](/es/ecosystem/sdk).

**Slot.** Un punto donde un addon aporta un componente React a la UI del host, vía `contributions.slots[]` contra un [slot kind](#s) publicado. El host lo renderiza con `<Slot name="..." />`.

**Slot kind.** Una superficie de extensión de UI tipada que un addon publica en `extension_points.slot_kinds[]`, con un props schema. Los consumidores aportan slots contra ella — acoplamiento por nombre, nunca por import.

## T

**Tenancy.** Scoping multi-tenant declarado en `tenancy` — `shared` (un schema + RLS de Postgres sobre `rls_column`, el default) o `schema` (un schema por instalación). El CRUD dinámico autofiltra por la organización del identity actual.

**Theme.** Un `kind` de manifest que trae una contribución puramente visual — design tokens, fuentes, overrides de íconos. Sin modelos, sin código.

**Tool.** La contraparte triggereada por LLM de una action, declarada en `contributions.tools[]` con un input schema. Los hosts conversacionales las registran en su registry de tools del agente.

## W

**WASM ABI.** El conjunto de funciones del host expuestas al código del addon corriendo en el sandbox. Gateado por capabilities; un addon solo puede llamar a las funciones que matchean sus capabilities declaradas. Congelado como v1.0 — ver el [WASM ABI del kernel](https://asteby.github.io/metacore-kernel/wasm-abi).

**WebSocket hub.** El fanout en tiempo real del kernel. Tenants y canales son first-class; los addons emiten, y `@asteby/metacore-websocket` / los hooks del runtime suscriben para que `<DynamicTable>` invalide al cambiar.

## Ver también

- [Manifest](/es/concepts/manifest) · [CRUD dinámico](/es/concepts/dynamic-crud) · [Permisos](/es/concepts/permissions) · [Ciclo de vida](/es/concepts/lifecycle)
- [Arquitectura](/es/architecture) para ver cómo encajan estas piezas.
