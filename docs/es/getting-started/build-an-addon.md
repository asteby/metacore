# Construir un addon

Un addon es un módulo autocontenido que agrega tablas, endpoints y UI a una app con Metacore. Escribís un manifest, el SDK construye un `.mcbundle`, lo publicás (o lo copiás al directorio de bundles del host). El host lo instala en caliente.

Esta página recorre el loop de punta a punta. El deep dive — cada campo del manifest, cada flag de la CLI, cada primitivo React — vive en las [docs del SDK](https://asteby.github.io/metacore-sdk/).

[[toc]]

## Prerrequisitos

- **Node.js 20+** y **pnpm 10+**
- Un host corriendo el kernel (local o remoto) donde puedas instalar el bundle. Si no tenés uno, mirá [Embeber el runtime](/es/getting-started/embed-the-runtime) para un server standalone de 60 líneas.

## 1. Scaffold

```bash
pnpm dlx @asteby/metacore-cli init tickets --template=basic
cd tickets
```

Obtenés un árbol así:

```
tickets/
├── manifest.json          # the source of truth
├── package.json           # only if the addon ships React UI
├── src/
│   └── index.ts           # optional frontend slot
├── go/                    # optional Go logic (compiled to WASM)
│   └── main.go
└── README.md
```

Para un addon CRUD puro podés borrar `go/` y `src/` — solo con el manifest alcanza.

## 2. Definí el manifest

```json
{
  "id": "tickets",
  "name": "Tickets",
  "version": "0.1.0",
  "displayName": "Support Tickets",
  "tables": [
    {
      "name": "tickets",
      "displayName": "Tickets",
      "columns": [
        { "name": "id",         "type": "uuid",   "primaryKey": true },
        { "name": "title",      "type": "string", "required": true,  "label": "Title" },
        { "name": "body",       "type": "text",   "label": "Description" },
        { "name": "status",     "type": "enum",   "values": ["open", "in_progress", "closed"], "default": "open" },
        { "name": "priority",   "type": "enum",   "values": ["low", "med", "high"],            "default": "med" },
        { "name": "assignee",   "type": "string", "label": "Assignee" },
        { "name": "created_at", "type": "timestamp", "default": "now()" }
      ]
    }
  ],
  "capabilities": [
    { "kind": "db:read",  "target": "tickets" },
    { "kind": "db:write", "target": "tickets" },
    { "kind": "event:emit", "target": "tickets.changed" }
  ],
  "permissions": [
    { "id": "tickets.view",   "label": "View tickets" },
    { "id": "tickets.create", "label": "Create tickets" },
    { "id": "tickets.edit",   "label": "Edit tickets" },
    { "id": "tickets.delete", "label": "Delete tickets" }
  ]
}
```

Algunas cosas para notar:

- **`tables[]` es el schema.** El instalador del kernel lee esto y corre la migración.
- **`capabilities[]` es lo que el addon promete hacer.** El kernel lo aplica: un `db:write` sobre `tickets` es la única forma en que el addon puede mutar la tabla.
- **`permissions[]` es lo que se le puede otorgar a los usuarios.** Los hosts restringen la UI según estos IDs.

El spec completo del manifest — cada tipo de columna, cada validador, cada forma de acción — está en [`asteby.github.io/metacore-sdk/manifest-spec`](https://asteby.github.io/metacore-sdk/manifest-spec).

## 3. Construí el bundle

```bash
pnpm metacore-sdk build
```

Esto produce `dist/tickets-0.1.0.mcbundle`. El bundle es un tarball con el manifest, cualquier WASM compilado, cualquier asset de frontend buildeado y una firma del manifest.

Para un addon CRUD puro, ese es todo el build. Si tenés código Go en `go/`, la CLI lo compila con `tinygo` a un módulo WASM y lo incluye. Si tenés React en `src/`, se bundlea con el slot loader del SDK.

## 4. Instalá en un host

Si estás corriendo el kernel localmente:

```bash
pnpm metacore-sdk install dist/tickets-0.1.0.mcbundle --host=http://localhost:8080
```

El instalador del host:

1. Verifica la firma del bundle.
2. Carga el manifest y chequea conflictos (colisiones de nombres de tabla, capability requests fuera del namespace del addon).
3. Corre la migración: crea la tabla `tickets`, índices, FKs.
4. Monta las routes de CRUD dinámico: `GET/POST/PATCH/DELETE /api/addons/tickets/tickets`.
5. Registra la metadata: `GET /api/addons/tickets/_meta/columns` ahora retorna el schema de columnas.
6. Carga el módulo WASM (si hay) y cualquier slot de frontend.

Sin reinicio. El host está en vivo con el nuevo addon.

## 5. Vé la UI CRUD

Abrí el frontend del host. El addon aparece en la navegación; al clickearlo renderiza un `<DynamicTable>` contra `/api/addons/tickets/tickets`:

```tsx
import { DynamicTable } from '@asteby/metacore-runtime-react'

<DynamicTable addon="tickets" table="tickets" />
```

Obtenés list / paginate / sort / filter / row-click-to-edit / create / delete — todo desde la metadata. Los updates en tiempo real fluyen sobre WebSocket.

Si querés una vista custom, montá tu propio componente:

```tsx
import { useDynamicQuery } from '@asteby/metacore-runtime-react'

const { rows, isLoading } = useDynamicQuery({
  addon: 'tickets',
  table: 'tickets',
  filter: { status: 'open' },
  sort: [{ col: 'priority', dir: 'desc' }],
})
```

El hook maneja paginación, invalidación en tiempo real y chequeos de permisos; vos hacés el render.

## Qué sigue

- **Acciones custom.** Agregá `manifest.actions[]` para operaciones no-CRUD (un botón "cerrar con razón", un import masivo). El runtime monta la route y la UI; vos escribís el cuerpo.
- **Slots de frontend.** Reemplazá la vista de detalle por defecto con un componente React custom, registrado vía `manifest.frontend.slots`.
- **Validadores.** Agregá validadores Go para reglas cross-field (ej. los tickets cerrados deben tener una razón).
- **Emisión en tiempo real.** Empujá updates a los clientes con `kernel.WS.Emit("tickets.changed", payload)`.

Continuá en las [docs del SDK →](https://asteby.github.io/metacore-sdk/quickstart) para la guía completa de autoría de addons, cada comando de la CLI y cada referencia de componente.

## Relacionado

- [Concepto de manifest](/es/concepts/manifest) — el contrato en profundidad.
- [Concepto de CRUD dinámico](/es/concepts/dynamic-crud) — qué corre del otro lado.
- [Concepto de permisos](/es/concepts/permissions) — capabilities y grants de usuario.
