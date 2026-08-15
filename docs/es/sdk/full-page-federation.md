<p align="center">
  <img src="/logo.svg" width="120" alt="Metacore" />
</p>

<h1 align="center">Federación de página completa</h1>

<p align="center">
  <strong>Tomá el viewport completo. Sin shell, sin sidebar, sin header — tu ruta es dueña de la pantalla.</strong>
</p>

El contrato de federación default (`expose: "./plugin"`) carga un addon de
forma **headless**: importa el módulo, llama a `register(api)`, y deja que
el addon contribuya slots, actions, entradas de navegación y modals al
chrome del host. El host se queda a cargo de lo que ve el usuario.

Para algunas superficies ese contrato tiene la forma equivocada. Una
terminal de punto de venta, un display de cocina, un kiosko, un dashboard
fullscreen, una pantalla de signage de cara al cliente — todos estos
necesitan el **viewport completo**. El sidebar, header y chrome del host
son ruido.

Este documento describe la convención de **federación de página
completa**: un patrón de manifest que le señala al host "renderizá este
módulo expuesto como una ruta sin chrome en una URL conocida".

## Tabla de contenidos

- [Cuándo usarla](#cuándo-usarla)
- [Convención del manifest](#convención-del-manifest)
- [Mapeo de rutas](#mapeo-de-rutas)
- [Contrato del módulo](#contrato-del-módulo)
- [Responsabilidades del host](#responsabilidades-del-host)
- [Múltiples páginas por addon](#múltiples-páginas-por-addon)
- [Ejemplo trabajado: POS](#ejemplo-trabajado-pos)
- [Interacción con `navigation[]`](#interacción-con-navigation)
- [Ver también](#ver-también)

## Cuándo usarla

| Usá esto | Usá el `./plugin` estándar |
|---|---|
| Caja registradora / terminal POS | Un tipo de columna nuevo renderizado dentro de `<DynamicTable>` |
| Display de cocina, signage, kiosko | Un modal de acción custom |
| Dashboard fullscreen de analytics o operaciones en vivo | Un widget inyectado en `dashboard.widgets` |
| App de terceros embebida que renderiza su propio shell | Un link en el sidebar |
| Cualquier cosa que deba esconder el chrome del host en pantallas chicas o compartidas | Cualquier cosa que deba componer con el chrome del host |

Si no estás seguro, defaulteá a `./plugin`. La federación de página
completa es un carve-out deliberado — bypassea el shell del host, así que
los gates de capability, el selector de branch, los breadcrumbs y la
búsqueda global **no** aparecen a menos que tu página los renderice ella
misma.

## Convención del manifest

La señal es la **forma de `frontend.expose`**. Cualquier cosa que empiece
con `./pages/` se trata como un módulo de página completa:

```json
"frontend": {
  "entry":     "/api/metacore/addons/pos/frontend/remoteEntry.js",
  "format":    "federation",
  "expose":    "./pages/register",
  "container": "metacore_pos",
  "integrity": "sha384-..."
}
```

Reglas:

- El path del módulo expuesto **debe** matchear el regex `^\./pages/[a-z][a-z0-9_-]{0,63}$`.
- El segmento después de `./pages/` es el **slug de ruta**. Se convierte en
  parte de la URL — ver [Mapeo de rutas](#mapeo-de-rutas) abajo.
- El regex del slug matchea el regex de key del manifest
  (`^[a-z][a-z0-9_-]{0,63}$`) así la URL siempre es segura y predecible.
- Un manifest con un expose `./pages/...` **no debe** declarar también
  contribuciones de slot / nav a través de un export `register(api)`.
  Elegí una forma por addon. Si necesitás ambas, ver
  [Múltiples páginas por addon](#múltiples-páginas-por-addon).

Cualquier otra cosa (`./plugin`, `./register`, `./widgets/foo`) mantiene el
contrato headless existente — el host llama a `register(api)` y no
renderiza nada propio desde el módulo del addon.

## Mapeo de rutas

El host monta un módulo de página completa en:

```
/addons/<key>/<route>
```

Donde `<key>` es `manifest.key` y `<route>` es el slug después de
`./pages/`.

| `manifest.key` | `frontend.expose` | URL |
|---|---|---|
| `pos` | `./pages/register` | `/addons/pos/register` |
| `pos` | `./pages/kitchen` | `/addons/pos/kitchen` |
| `signage` | `./pages/screen` | `/addons/signage/screen` |
| `kiosk` | `./pages/check-in` | `/addons/kiosk/check-in` |

El host quita su layout por encima de esta ruta — sin `<AppShell>`, sin
sidebar, sin header. La página se renderiza dentro de un container
transparente `100vw × 100vh` con los providers del host
(`<ApiProvider>`, `<I18nextProvider>`, `<CapabilityProvider>`,
`<BranchProvider>`) igual en scope.

Este **no** es el mismo namespace que `/m/<key>` (que aloja las rutas CRUD
model-driven construidas desde `navigation[]`). Las rutas de página
completa viven intencionalmente bajo `/addons/` para hacer visible en la
barra de URL la semántica de bypass del chrome.

## Contrato del módulo

El módulo expuesto **exporta por default** un componente React:

```tsx
// frontend/src/pages/register.tsx
import type { FullPageProps } from '@asteby/metacore-sdk'

export default function RegisterPage(props: FullPageProps) {
  // props.api          — el mismo AddonAPI que recibe register(api)
  // props.params       — params parseados de sub-rutas (ver abajo)
  // props.exit()       — helper del host para navegar de vuelta a /m/<key> o /
  return <main className="h-screen w-screen">…</main>
}
```

El componente:

- Es dueño del viewport completo. Aplicá tu propio background, fonts,
  scaling.
- Se monta **dentro** del árbol React del host, así que hooks como
  `useTranslation()`, `useApi()` y `useCapabilities()` funcionan sin setup.
- Recibe un `AddonAPI` vía props, en paridad con el contrato
  `register(api)` — usalo para llamar a servicios del host (dispatch de
  slot, checks de capability, invocación de acción, publish de evento).
- Puede renderizar su propio router (ej. `react-router`) para sub-rutas; el
  host trata `/addons/<key>/<route>/*` como perteneciente a la página.

El host importa el módulo vía el flujo de federación normal (ver
[`federation.ts`](../packages/sdk/src/federation.ts)) y renderiza
`<Component {...props} />`. El hash SRI, el naming de container y las
reglas de cache no cambian respecto al contrato estándar.

## Responsabilidades del host

Un host que soporta federación de página completa **debe**:

1. **Resolver manifests** de addons instalados cuyo `frontend.expose`
   matchee `^\./pages/`. Computar el slug de ruta y registrarlo bajo
   `/addons/<key>/<route>`.
2. **Montar fuera del app shell.** La ruta no debe estar envuelta en el
   chrome que usan otras rutas autenticadas. Una implementación típica es
   un `<Route>` hermano de `<AppShell>` en el árbol del router.
3. **Aplicar auth + gates de capability upstream.** Que el chrome esté
   ausente no significa que la ruta sea pública — el host igual resuelve
   la sesión, scopea el addon a la organización actual, y puede negarse a
   montar la página si una `capabilities[]` declarada se niega.
4. **Inyectar los providers estándar.** `<ApiProvider>`,
   `<I18nextProvider>`, `<CapabilityProvider>`, `<BranchProvider>` y el
   cache de metadata deben estar en scope dentro de la página, así los
   componentes del addon pueden usar el SDK como de costumbre.
5. **Forwardear sub-paths desconocidos.** `/addons/<key>/<route>/foo/bar`
   debe llegar a la página así puede hacer ruteo del lado cliente.
6. **Ignorar `./pages/*` en paths de `register(api)`.** Un manifest con un
   expose `./pages/<route>` es solo-página-completa; el host no debería
   intentar llamar a `register()` sobre él.

## Múltiples páginas por addon

Un solo manifest expone **un** módulo vía `frontend.expose`. Para enviar
más de una superficie de página completa desde el mismo addon, declaralas
como **entradas de manifest separadas, publicadas como hermanas** (una por
página). Comparten el mismo bundle de federación (mismo `entry`, mismo
`container`); solo difiere `expose`.

```jsonc
// manifest.json — addon "pos.register"
{
  "key": "pos_register",
  "frontend": {
    "entry":   "/api/metacore/addons/pos/frontend/remoteEntry.js",
    "format":  "federation",
    "expose":  "./pages/register",
    "container": "metacore_pos"
  }
}
```

```jsonc
// manifest.json — addon "pos.kitchen"
{
  "key": "pos_kitchen",
  "frontend": {
    "entry":   "/api/metacore/addons/pos/frontend/remoteEntry.js",
    "format":  "federation",
    "expose":  "./pages/kitchen",
    "container": "metacore_pos"
  }
}
```

Esto mantiene el mapeo `key → URL` 1:1 y evita casos especiales para
arrays en el validador del manifest. Si una revisión futura de
`APIVersion` introduce un map `frontend.pages: { route: module }`, esta
convención es el target de migración.

## Ejemplo trabajado: POS

Un addon de punto de venta con dos superficies fullscreen — la
**caja** (de cara al cajero) y el **display de cocina** (de cara al
cocinero de línea).

### Layout del bundle

```
pos/
├── manifest.json
├── frontend/
│   ├── package.json
│   ├── vite.config.ts
│   └── src/
│       ├── pages/
│       │   ├── register.tsx       ← default export: <RegisterPage />
│       │   └── kitchen.tsx        ← default export: <KitchenPage />
│       └── shared/
│           └── orders.ts
└── backend/
    └── backend.wasm
```

### `vite.config.ts`

```ts
import { defineConfig } from 'vite'
import { federation } from '@module-federation/vite'
import {
  metacoreFederationShared,
  metacoreOptimizeDeps,
} from '@asteby/metacore-starter-config/vite'

export default defineConfig({
  plugins: [
    federation(
      metacoreFederationShared({
        host: 'metacore_pos',                                // == manifest.frontend.container
        exposes: {
          './pages/register': './src/pages/register.tsx',
          './pages/kitchen':  './src/pages/kitchen.tsx',
        },
        extras: ['react-i18next'],                           // opcional: singletons extra más allá de los siete canónicos
      }),
    ),
  ],
  optimizeDeps: metacoreOptimizeDeps,
  build: { target: 'esnext', modulePreload: false, cssCodeSplit: false },
})
```

Un solo bundle, dos módulos expuestos, un `remoteEntry.js`. La config
`shared` se delega a `metacoreFederationShared()` así cada singleton del
SDK (React, el registry, theme, auth, app-providers, UI) se declara en un
solo lugar — ver [`docs/federation.md`](./federation).

### `manifest.json` (register)

```jsonc
{
  "apiVersion": "asteby.com/v3",
  "kind": "Addon",
  "metadata": {
    "key": "pos_register",
    "name": "POS — Register",
    "version": "1.0.0",
    "category": "operations"
  },
  "compatibility": {
    "requires": [{ "key": "kernel", "version": ">=3.0.0 <4.0.0" }]
  },
  "tenancy": { "isolation": "shared", "rls_column": "organization_id" },

  "models": [
    {
      "key": "Ticket",
      "table": "tickets",
      "label": "Tickets",
      "columns": [
        { "name": "id",              "type": "uuid",        "primary_key": true, "default": "gen_random_uuid()" },
        { "name": "organization_id", "type": "uuid",        "not_null": true },
        { "name": "number",          "type": "integer",     "not_null": true },
        { "name": "state",           "type": "text",        "default": "open" },
        { "name": "total",           "type": "numeric",     "default": 0 },
        { "name": "opened_at",       "type": "timestamptz", "default": "now()" },
        { "name": "deleted_at",      "type": "timestamptz" }
      ],
      "indices": [
        { "name": "tickets_number_idx", "columns": ["number"] }
      ]
    }
  ],

  "capabilities": [
    { "kind": "db:read",  "target": "addon_pos_register.tickets" },
    { "kind": "db:write", "target": "addon_pos_register.tickets" },
    { "kind": "event:emit", "target": "pos.ticket_opened" },
    { "kind": "event:emit", "target": "pos.ticket_paid" }
  ],

  "extension_points": {
    "events": [
      { "name": "pos.ticket_opened" },
      { "name": "pos.ticket_paid" }
    ]
  },

  "frontend": {
    "entry":     "/api/metacore/addons/pos_register/frontend/remoteEntry.js",
    "format":    "federation",
    "expose":    "./pages/register",
    "container": "metacore_pos"
  }
}
```

Un segundo manifest con `key: "pos_kitchen"` y `expose: "./pages/kitchen"`
envía el display de cocina, compartiendo el mismo `container`.

### `frontend/src/pages/register.tsx`

```tsx
import { useEffect, useState } from 'react'
import { useApi, useCapabilities } from '@asteby/metacore-runtime-react'
import type { FullPageProps } from '@asteby/metacore-sdk'

export default function RegisterPage({ api, exit }: FullPageProps) {
  const http = useApi()
  const { has } = useCapabilities()
  const [tickets, setTickets] = useState<Ticket[]>([])

  useEffect(() => {
    http.get('/data/pos_register/tickets?state=open').then(r => setTickets(r.data.data))
  }, [])

  async function pay(id: string) {
    if (!has('db:write', 'addon_pos_register.tickets')) return
    await http.post(`/data/pos_register/tickets/${id}/action/pay`)
    api.event.publish('pos.ticket.paid', { id })
    setTickets(prev => prev.filter(t => t.id !== id))
  }

  return (
    <main className="h-screen w-screen bg-zinc-950 text-zinc-100 grid grid-cols-[2fr_1fr]">
      <TicketGrid tickets={tickets} onPay={pay} />
      <Sidebar onClose={exit} />
    </main>
  )
}
```

### Lo que ve el usuario

- Abre `https://app.example.com/addons/pos_register/register` → UI de
  cajero fullscreen, sin header del host, sin sidebar.
- Toca un botón "Abrir vista de cocina" en un iPad separado → carga
  `https://app.example.com/addons/pos_kitchen/kitchen` → display de cocina
  fullscreen, mismo bundle de federación.
- Ambas páginas siguen hablando con el kernel vía `useApi()`, siguen
  respetando gates de capability, siguen emitiendo eventos a los que el
  resto del host puede suscribirse.

## Interacción con `navigation[]`

Un addon de página completa puede igual declarar una entrada
`navigation[]` — la entrada debería apuntar a `/addons/<key>/<route>` así
el sidebar del host (cuando es visible en otro lado) puede deep-linkear a
la superficie fullscreen:

```json
"navigation": [{
  "title": "sidebar.pos.register",
  "icon": "Cash",
  "items": [{
    "title": "sidebar.pos.register.open",
    "url":   "/addons/pos_register/register",
    "icon":  "Monitor"
  }]
}]
```

Cuando el usuario lo clickea, el host navega a la ruta sin chrome — mismo
efecto que visitar la URL directamente.

## Ver también

- [`manifest-spec.md`](./manifest-spec#6-frontend--federación) — la referencia completa del campo `frontend{}`.
- [`addon-cookbook.md`](./addon-cookbook#cómo-empaqueto-una-extensión-frontend-con-mi-addon) — el contrato `./plugin` estándar sobre el que se apila esta convención.
- [`packages/sdk/src/federation.ts`](../packages/sdk/src/federation.ts) — el loader de federación; los módulos de página completa importan por el mismo path.
- [`capabilities.md`](./capabilities) — los gates de capability siguen aplicando dentro de rutas de página completa; que el chrome esté ausente no relaja los permisos.
