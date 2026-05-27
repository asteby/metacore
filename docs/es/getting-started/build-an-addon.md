# Construir un addon

Un addon es un módulo autocontenido que agrega modelos, endpoints y UI a una app Metacore. Escribís un manifest, la CLI buildea un bundle, lo instalás en un host corriendo el kernel. El host lo instala en caliente.

Esta página recorre el loop de punta a punta. El detalle profundo — cada campo del manifest, cada flag de la CLI, cada primitivo React — vive en las [docs del SDK](https://asteby.github.io/metacore-sdk/).

::: tip Escribí v3
El contrato canónico es el **Module Contract v3** (`apiVersion: asteby.com/v3`) — eso es lo que escribís. El kernel además **dual-lee v2 legacy** por compatibilidad (el tooling del SDK está migrando a emitir v3), así que los addons viejos siguen funcionando. Ver [Manifest → compatibilidad con v2](/es/concepts/manifest#compatibilidad-con-v2).
:::

[[toc]]

## Prerrequisitos

- **Go 1.25+** (la CLI es un binario Go; TinyGo 0.31+ solo si tu addon trae un backend WASM)
- **Node.js 20+** y **pnpm 10+** si tu addon trae UI React
- Un host corriendo el kernel (local o remoto) donde puedas instalar el bundle. Si no tenés uno, ver [Embeber el runtime](/es/getting-started/embed-the-runtime) para un server standalone chico, o scaffoldeá una app completa con `npm create @asteby/metacore-app`.

## 1. Scaffold

Instalá la CLI de desarrollo y creá un addon nuevo:

```bash
go install github.com/asteby/metacore-sdk/cli@latest
metacore init tickets
cd tickets
```

Obtenés un árbol así:

```
tickets/
├── manifest.json              # el contrato — todo host lo lee
├── migrations/
│   └── 0001_init.sql          # DDL inicial, acotado al schema del addon
└── frontend/
    └── src/
        └── plugin.tsx         # entry de UI federada (opcional)
```

Para un addon CRUD puro podés ignorar `frontend/` — el manifest solo alcanza.

## 2. Definir el manifest

Escribí un **manifest v3** (`apiVersion: asteby.com/v3`):

```json
{
  "apiVersion": "asteby.com/v3",
  "kind": "Addon",
  "metadata": { "key": "tickets", "name": "Tickets", "version": "0.1.0" },
  "compatibility": { "requires": [ { "key": "kernel", "version": ">=3.0.0 <4.0.0" } ] },
  "tenancy": { "isolation": "shared", "rls_column": "organization_id" },
  "capabilities": [
    { "kind": "db:read",    "target": "addon_tickets.*" },
    { "kind": "db:write",   "target": "addon_tickets.*" },
    { "kind": "event:emit", "target": "tickets.changed" }
  ],
  "models": [
    {
      "key": "Ticket",
      "table": "tickets",
      "label": "tickets.model.ticket",
      "columns": [
        { "name": "id",          "type": "uuid", "primary_key": true, "default": "gen_random_uuid()" },
        { "name": "organization_id", "type": "uuid", "not_null": true },
        { "name": "title",       "type": "text", "not_null": true },
        { "name": "description", "type": "text" },
        { "name": "status",      "type": "text", "default": "'open'" },
        { "name": "priority",    "type": "text", "default": "'normal'" }
      ]
    }
  ]
}
```

Algunas cosas para notar:

- **`models[]` es el schema.** El instalador lo lee y corre la migración en el schema aislado del addon (`addon_tickets`). Los identificadores de columna usan casing con guión bajo (SQL); los literales `default` pasan por un whitelist.
- **`capabilities[]` es lo que el addon promete hacer.** El kernel lo aplica: `db:write` sobre `addon_tickets.*` es la única forma en que el addon puede mutar sus tablas.
- **`compatibility.requires[]`** reemplaza el rango plano `kernel` de v2 y también puede pinear addons pares.

::: details Manifest v2 legacy (todavía aceptado)
El kernel dual-lee la forma plana v2 más vieja — `key`/`model_definitions`/`kernel` — y la up-convierte. La vas a ver en addons viejos y, por ahora, en algún output del scaffolder mientras el tooling del SDK termina de migrar a v3:

```json
{
  "key": "tickets",
  "name": "Tickets",
  "version": "0.1.0",
  "kernel": ">=2.0.0 <3.0.0",
  "tenant_isolation": "shared",
  "model_definitions": [
    {
      "table_name": "tickets", "model_key": "tickets", "label": "Tickets",
      "org_scoped": true, "soft_delete": true,
      "columns": [
        { "name": "title",  "type": "string", "size": 255, "required": true },
        { "name": "status", "type": "string", "size": 20, "default": "'open'", "index": true }
      ]
    }
  ],
  "capabilities": [ { "kind": "db:read", "target": "tickets" }, { "kind": "db:write", "target": "tickets" } ]
}
```
:::

El contrato v3 completo vive en las [docs del kernel](https://asteby.github.io/metacore-kernel/); la referencia de campos v2 legacy está en el [spec del manifest del SDK](/es/sdk/manifest-spec).

## 3. Validar y buildear

```bash
metacore validate
# ok: tickets@0.1.0 pasa la validación

metacore build --strict
# built tickets-0.1.0.tar.gz
```

`validate` corre las mismas puertas que corre el marketplace al subir: regex de identificadores, whitelist de literales default, scoping de capabilities, semver. `--strict` rechaza warnings (capabilities sin scope, reasons faltantes). Si tenés código Go, se compila con TinyGo a un módulo WASM y se incluye; si tenés React en `frontend/`, se buildea.

## 4. Instalar en un host

En dev, soltá el addon en la carpeta de installations del host (el kernel instala al arrancar):

```bash
ln -s "$(pwd)" ../my-host/installations/tickets
```

O subí el bundle buildeado al endpoint de install de un host corriendo. De cualquier forma el instalador:

1. Verifica la firma del bundle (sin firmar solo se permite con `KERNEL_ALLOW_UNSIGNED=1`).
2. Parsea el manifest y chequea conflictos (colisiones de schema/tabla, capabilities fuera del namespace del addon).
3. Corre la migración: crea la tabla `tickets`, índices, FKs en `addon_tickets`.
4. Monta las rutas de CRUD dinámico: `GET/POST/PUT/DELETE /api/dynamic/tickets`.
5. Registra la metadata: `GET /api/metadata/table/tickets` ahora devuelve el schema de columnas.
6. Carga el módulo WASM (si hay) y registra cualquier slot frontend.

Sin reinicio. El host queda vivo con el addon nuevo.

## 5. Ver la UI de CRUD

Abrí el frontend del host. El addon aparece en la navegación; al hacer click renderiza un `<DynamicTable>` contra `/api/dynamic/tickets`:

```tsx
import { DynamicTable } from '@asteby/metacore-runtime-react'

<DynamicTable model="tickets" />
```

Conseguís list / paginate / sort / filter / click-en-fila-para-editar / create / delete — todo desde la metadata. Los updates en tiempo real fluyen por WebSocket.

Para una vista custom, bajá al cliente del runtime (`useApi`) y manejá tus propias llamadas con TanStack Query, o extendé la tabla vía la prop `getDynamicColumns`. Ver [CRUD dinámico](/es/concepts/dynamic-crud#la-mitad-frontend).

## Qué sigue

- **Actions custom.** Agregá actions para operaciones que no son CRUD (un botón "cerrar con razón", un import bulk). El runtime monta la ruta y la UI — incluyendo un modal autoconstruido desde `fields` declarativos, un prompt de `confirm`, o un modal custom — y vos escribís el cuerpo.
- **Slots frontend.** Aportá un componente React custom a un slot kind publicado, federado vía el entry frontend del bundle y `registerActionComponent` / `loadFederatedAddon`.
- **Eventos & subscriptions.** Emití eventos (gateado por `event:emit`) y reaccioná a eventos de otros addons.
- **Validadores.** Agregá validadores del lado Go para reglas entre campos (p. ej. los tickets cerrados deben tener una razón).

Seguí en las [docs del SDK →](https://asteby.github.io/metacore-sdk/quickstart) para la guía completa de autoría de addons, cada comando de la CLI y cada referencia de componente.

## Relacionado

- [Concepto de Manifest](/es/concepts/manifest) — el contrato en profundidad, y la transición v2/v3.
- [Concepto de CRUD dinámico](/es/concepts/dynamic-crud) — qué corre del otro lado.
- [Concepto de Permisos](/es/concepts/permissions) — capabilities y grants de usuario.
