# Glosario

Definiciones cortas de cada término que recurre en los docs. Los links van a la página que explica el concepto en profundidad.

[[toc]]

## A

**Addon.** Un módulo autocontenido que agrega tablas, endpoints, actions y UI a un host. Definido por un [manifest](/es/concepts/manifest) y empaquetado como un [bundle](#b).

**Action.** Una operación no-CRUD declarada en `manifest.actions[]`. El runtime monta una ruta y renderiza un botón (con un diálogo para input); el addon provee el cuerpo. Ver el [concepto de manifest](/es/concepts/manifest#actions).

**Audit.** Log estructurado de cada chequeo de capability, chequeo de permission y operación de CRUD. Enrutado a través del hook de audit del kernel hacia un sink definido por el host.

## B

**Bundle.** Un archivo `.mcbundle` — un tarball firmado que contiene el manifest, módulo WASM opcional, assets de frontend opcionales y la firma del manifest. La unidad de distribución e instalación.

## C

**Capability.** Un subsistema que el addon promete usar, declarado en `manifest.capabilities[]`. Aplicado por el security enforcer del kernel en cada llamada. Ver [Permisos](/es/concepts/permissions#capabilities--el-contrato-del-addon).

**CLI.** `metacore-sdk`, la herramienta de línea de comandos. Hace scaffolding, builds, firma y publica addons.

## D

**Dynamic CRUD.** El store + handler genérico del kernel que sirve list / get / create / update / delete para cualquier tabla declarada en el manifest de cualquier addon instalado. Paginación, sort, filter y tenancy vienen incluidos. Ver la [página de concepto](/es/concepts/dynamic-crud).

**`<DynamicTable>`.** Componente del SDK que lee la metadata de columnas del kernel y renderiza una tabla CRUD con todas las features. El espejo frontend del CRUD dinámico.

## E

**Embedded addon.** Un addon registrado en código con `kernel.RegisterAddon()` en lugar de instalado como un `.mcbundle`. Se usa para features de primera parte que vienen con el binario del host.

**Enforcer.** `security.Enforcer`, el subsistema del kernel que chequea capabilities. Corre en modo shadow o enforce.

**Event.** Un mensaje en tiempo real publicado en el hub WebSocket. Declarado en `manifest.events[]` y gateado por las capabilities `event:emit` / `event:subscribe`.

## H

**Host.** Un producto que embebe el kernel y expone los addons instalados a los usuarios. Tiene un backend (Go) y un frontend (Vite + React + SDK). Los hosts pueden tomar muchas formas — paneles de operador, portales orientados al cliente, superficies de marketplace + admin, settings embebidos dentro de un producto existente. Ver [Hosts](/es/ecosystem/hosts).

**Host.App / host.Host.** Tipos helper en el kernel que envuelven config, DI, routing y lifecycle para un backend de host típico.

## I

**Installer.** El subsistema del kernel que maneja install / upgrade / uninstall transaccionalmente. Ver [Ciclo de vida](/es/concepts/lifecycle).

**Identity.** `kernel.Identity`, el contexto de usuario por request — user ID, org ID, roles, más cualquier claim específico del host. Lo setea el middleware de auth del host, lo lee el permission service del kernel.

## K

**Kernel.** El runtime Go — `asteby/metacore-kernel`. Posee persistencia, REST, permissions, lifecycle, el sandbox WASM, el hub WebSocket. Ver [Kernel](/es/ecosystem/kernel).

## M

**Manifest.** `manifest.json`, la fuente de verdad para un addon. Declara schema, capabilities, permissions, actions, slots, hooks de lifecycle. Ver la [página de concepto](/es/concepts/manifest).

**Migration.** Un cambio de schema aplicado durante install o upgrade. Generado por el kernel desde el diff del manifest; complementado por hooks de upgrade declarados por el addon para transformaciones de datos.

**Model definition.** La representación en runtime de una entrada de `tables[]` — metadata de columnas, validadores, indexes. Usada tanto por el dynamic store como por los componentes del SDK.

## P

**Permission.** Un identificador otorgable a usuarios declarado en `manifest.permissions[]`, p.ej. `tickets.create`. Aplicado por el permission service del kernel. Distinto de una [capability](#c) — las capabilities son sobre el addon, los permissions son sobre el usuario. Ver [Permisos](/es/concepts/permissions).

**`permission.Service`.** El subsistema del kernel que resuelve los permissions efectivos de un usuario y los aplica en cada request.

## S

**Sandbox.** El runtime WebAssembly basado en wazero que ejecuta el código del addon. Tiene acceso solo a la ABI del kernel declarada por las capabilities del addon; sin memoria del host, sin filesystem del host.

**SDK.** `asteby/metacore-sdk` — los packages npm y la CLI que declaran addons y renderizan UI. Ver [SDK](/es/ecosystem/sdk).

**Slot.** Un punto de extensión de UI con nombre en un host. Los addons contribuyen componentes para los slots vía `manifest.frontend.slots`; el host los renderiza con `<Slot name="..." />`.

## T

**Tenancy.** Scoping multi-tenant por `org_id`. Built-in en el CRUD dinámico; cada query se autofiltra por la organización del identity actual.

## W

**WASM ABI.** El conjunto de funciones del host expuestas al código del addon corriendo en el sandbox. Gateado por capabilities; un addon solo puede llamar a las funciones que matchean sus capabilities declaradas.

**WebSocket hub.** El fanout en tiempo real del kernel. Tenants y canales son first-class; los addons emiten, los clientes suscriben vía `useDynamicQuery` y compañía.

## Ver también

- [Manifest](/es/concepts/manifest) · [CRUD dinámico](/es/concepts/dynamic-crud) · [Permisos](/es/concepts/permissions) · [Ciclo de vida](/es/concepts/lifecycle)
- [Arquitectura](/es/architecture) para ver cómo encajan estas piezas.
