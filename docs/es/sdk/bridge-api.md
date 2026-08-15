<p align="center">
  <img src="/logo.svg" width="120" alt="Metacore" />
</p>

<h1 align="center">Bridge API</h1>

<p align="center">
  <strong>El contrato que un addon federado consume del shell.</strong>
</p>

## Qué es el Bridge

El **Bridge** es el contrato de runtime entre un **shell host** de Metacore
(Ops, Link, cualquier panel interno o de terceros) y un **addon federado**
cargado vía Module Federation. El addon envía solo su propio código;
React, el SDK, auth, theme, i18n, el cliente HTTP, el WebSocket y el
registry vienen del shell a través de dependencias compartidas y un único
objeto `AddonAPI` entregado al entrypoint `register(api)` del addon.

Todo lo que el addon necesita para comportarse como una parte de primera
clase del shell — el usuario actual, el tenant, el cliente de API, los
tokens de theme, el idioma, la cola de toasts, el bus de WebSocket, el
árbol de navegación — se expone **a través de este bridge**. El addon no
importa estas cosas desde el SDK como copias propias; consume las
**instancias singleton del shell**.

```
   ┌─────────────────────────── HOST SHELL (Ops / Link / 3P) ────────────────────────────┐
   │                                                                                     │
   │   <QueryClientProvider>                                                              │
   │     <ApiProvider client={axiosFromCreateApiClient}>      ← packages/auth             │
   │       <PlatformConfigProvider fetcher>                   ← packages/app-providers    │
   │         <OrgConfigProvider fetcher>                                                  │
   │           <ThemeProvider>                                ← packages/theme            │
   │             <I18nextProvider>                            ← packages/i18n             │
   │               <WebSocketProvider url getToken>           ← packages/websocket        │
   │                 <AuthProvider> + useAuthStore            ← packages/auth             │
   │                   <Registry singleton>                   ← packages/sdk              │
   │                     <AddonLoader scope url api={api}>    ← packages/runtime-react    │
   │                       ┊                                                              │
   │                       ┊  loadScript(remoteEntry.js)                                  │
   │                       ┊  __webpack_init_sharing__()                                  │
   │                       ┊  container.get('./plugin')                                   │
   │                       ▼                                                              │
   │              ┌─────────────────────────────────────────────────────────┐             │
   │              │             BUNDLE DE ADDON FEDERADO                    │             │
   │              │                                                         │             │
   │              │   export default definePlugin({                         │             │
   │              │     key: 'tickets',                                     │             │
   │              │     register(api) {  ◀───── AddonAPI del shell ────┐     │             │
   │              │       api.registry.registerRoute(...)             │     │             │
   │              │       api.registry.registerSlot('dashboard',...)  │     │             │
   │              │       api.client.invokeWebhook(...)               │     │             │
   │              │     },                                            │     │             │
   │              │   })                                              │     │             │
   │              │                                                   │     │             │
   │              │   singletons del shell (vía MF `shared`):         │     │             │
   │              │     • react                                       │     │             │
   │              │     • react-dom                                   │     │             │
   │              │     • @asteby/metacore-runtime-react              │     │             │
   │              │     • @asteby/metacore-auth                       │     │             │
   │              │     • @asteby/metacore-theme                      │     │             │
   │              │     • @asteby/metacore-ui                         │     │             │
   │              │     • @asteby/metacore-sdk                        │     │             │
   │              │     • @asteby/metacore-app-providers              │     │             │
   │              └───────────────────────────────────────────────────┴─────┘             │
   └─────────────────────────────────────────────────────────────────────────────────────┘
```

Dos superficies de consumo, mismo bridge:

1. **`./plugin` (headless)** — el addon contribuye rutas, slots, actions y
   modals a través de `api.registry`. El host los renderiza dentro de su
   chrome.
2. **`./pages/<slug>` (página completa)** — el addon exporta por default
   un componente React que el host monta bajo `/addons/<key>/<slug>` sin
   chrome. El componente igual recibe el mismo `AddonAPI` y puede llamar a
   cada servicio del shell a través de hooks. Ver
   [`full-page-federation.md`](./full-page-federation).

Ambas formas viajan sobre el mismo bridge — el contrato de abajo es
idéntico.

## Ciclo de vida

### Carga

```
host                                         addon (remote federado)
────                                         ────────────────────────
1. resuelve el manifest para el addon instalado
2. <AddonLoader scope url module api/>
   ├─ loadScript("…/remoteEntry.js")        ◀── expone window[scope]
   ├─ __webpack_init_sharing__("default")
   ├─ container.init(shareScopes.default)
   └─ container.get(module)                  ◀── factory()
3. mod.register(api)                         ──▶ api.registry.register*
4. setStatus('ready'); onReady()
```

La mecánica vive en
[`packages/runtime-react/src/addon-loader.tsx`](../packages/runtime-react/src/addon-loader.tsx).
El host instancia **un** `Registry` (de `@asteby/metacore-sdk`) por
sesión de shell y entrega la misma referencia scoped a cada `register(api)`
de cada addon. Las contribuciones son globales al shell — el registry es
la fuente de verdad del shell para la UI de addons.

### Montaje

Una vez que `register(api)` retorna, el shell:

- mergea el `manifest.navigation` del addon en el sidebar vía
  `mergeNavigation()` en
  `packages/runtime-react/src/navigation-builder.tsx`.
- cablea las entradas `registry.registerRoute(...)` del addon al router.
- renderiza las contribuciones `registry.registerSlot(name, ...)` donde
  sea que tenga un `<Slot name="…" />` (ver
  [`slot.tsx`](../packages/runtime-react/src/slot.tsx)).
- expone `registry.registerModal(slug, …)` a `<ActionModalDispatcher>` así
  las referencias `actions[model][].modal` declaradas en el manifest
  resuelven.

El addon también puede llamar a `useDeclareAddonLayout('immersive')` desde
cualquier componente descendiente para pasar el shell del host a modo
chromeless full-viewport. El switch del lado shell está implementado en
[`packages/starter-core/src/components/AddonRoute.tsx`](../packages/starter-core/src/components/AddonRoute.tsx).

### Hot-swap

Cuando el kernel anuncia una nueva versión de manifest, el host recibe un
mensaje `ADDON_MANIFEST_CHANGED` por el WebSocket. El subscriber de
hot-swap en `packages/runtime-react/src/manifest-hotswap-subscriber.ts`
invalida el cache de metadata y bumpea la key `version` del addon.
`<AddonRoute version>` del lado shell re-keyea el subtree — React
desmonta el addon, el cache del container de federación se limpia vía
`clearFederationContainer()`, y el siguiente montaje trae
`remoteEntry.js?v=<hash8>` desde disco. Cualquier estado que guardaban
los closures anteriores del addon se destruye intencionalmente.

### Desmontaje

El shell llama a `plugin.dispose?()` (cuando está implementado) antes de
desmontar el subtree del addon. Cualquier cosa que el addon registró
(rutas, slots, modals) se queda en el registry por el resto de la sesión —
`dispose()` es para liberar recursos externos (timers, sockets abiertos
fuera del bus del shell, etc.), no para deshacer contribuciones del
registry. Para reemplazar una ruta/slot registrada, el host recarga con
una `version` nueva.

## APIs disponibles

Cada key se alcanza vía el objeto `AddonAPI` pasado a `register()`, o vía
un hook React resuelto contra el árbol de providers del shell (solo
funciona porque React es `singleton: true` en la config de federación —
ver [Reglas de oro](#reglas-de-oro)).

| API | Dónde vive | Cómo la alcanza el addon |
|---|---|---|
| Manifest + settings del addon | `AddonAPI.manifest`, `AddonAPI.settings` | argumento de `register(api)` |
| Cliente de marketplace (webhooks, metadata de install) | `AddonAPI.client` | argumento de `register(api)` |
| Mutadores del registry (routes, slots, modals, actions) | `AddonAPI.registry` | argumento de `register(api)` |
| Versión del kernel | `AddonAPI.kernelVersion` | argumento de `register(api)` |
| Telemetría / logger | `AddonAPI.telemetry`, `AddonAPI.log` | argumento de `register(api)` |
| Usuario actual (auth) | `@asteby/metacore-auth` → `useAuth()`, `useAuthStore()` | hook |
| Access token | `useAuthStore.getState().auth.accessToken` | store |
| Tenant / org | `useAuthStore().auth.user.organization_id`, `.organization_name` | store |
| Config de org (locale, fiscal, moneda) | `@asteby/metacore-app-providers` → `useOrgConfig()` | hook |
| Branding de plataforma (logo, primary, accent) | `@asteby/metacore-app-providers` → `usePlatformConfig()` | hook |
| Cliente HTTP (headers de auth, branch, idioma) | `@asteby/metacore-runtime-react` → `useApi()` | hook |
| Branch actual | `@asteby/metacore-runtime-react` → `useCurrentBranch()` | hook |
| Theme (light/dark, tokens) | `@asteby/metacore-theme` → `useTheme()` | hook |
| i18n / locale | `@asteby/metacore-i18n` → `useLocale()`, `useTranslation()` (re-exportado de i18next) | hook |
| Dirección (LTR/RTL) | `@asteby/metacore-i18n` → `useDirection()` | hook |
| Notificaciones (toast / badge de app) | `sonner` `toast()` (singleton montado por el `<Toaster/>` del shell) | import directo (compartido vía bundle del shell) |
| Notificaciones de inbox | `@asteby/metacore-notifications` → `useNotifications()` | hook |
| Bus WebSocket | `@asteby/metacore-websocket` → `useWebSocket()`, `useWebSocketMessage(type, handler)` | hook |
| Merge de navegación | `@asteby/metacore-runtime-react` → `mergeNavigation()`; el addon contribuye vía `manifest.navigation` | declarativo |
| Switch de layout (chrome/immersive) | `@asteby/metacore-runtime-react` → `useDeclareAddonLayout('immersive')` | hook |
| UI dinámica (tablas, forms, páginas CRUD) | `@asteby/metacore-runtime-react` → `<DynamicTable/>`, `<DynamicForm/>`, `<DynamicCRUDPage/>` | componentes |
| Primitivos de UI (Dialog, Button, DataTable) | subpaths de `@asteby/metacore-ui/*` | componentes |
| Gate de capability | `@asteby/metacore-runtime-react` → `<CapabilityGate/>`, `useCapabilities()` | hook / componente |

### Auth

El shell monta `<AuthProvider>` de `@asteby/metacore-auth` y expone tanto
un React context (`useAuth()`) como un store zustand (`useAuthStore`). El
store carga el `AuthUser` fuertemente tipado (id, email, rol, más fields
de organization/subscription/locale) y el access token. Como el package
de auth es un singleton de federación, el hook `useAuth()` del addon
resuelve el provider del shell — no hay una segunda instancia de auth.

### Tenant

La organización actual está denormalizada en `AuthUser`
(`organization_id`, `organization_name`, `organization_logo`,
`plan_slug`, `subscription_status`, `currency_code`, `timezone`). La
config de runtime mutable por tenant que NO debería vivir en el usuario
(identificadores fiscales, formatos de dirección, calendario fiscal) fluye
a través de `<OrgConfigProvider>` y `useOrgConfig()` — ver la nota de
memoria de `org config` referenciada desde los docs del SDK.

### Transporte

El shell construye **una** instancia de axios vía
`createApiClient({ baseURL, getToken, getLanguage, getBranchId, onUnauthorized })`
desde `packages/auth/src/api-client.ts`. El interceptor adjunta
automáticamente `Authorization: Bearer <token>`, `Accept-Language` y
`X-Branch-ID`, saca `Content-Type` para uploads `FormData`, y rutea
respuestas 401 al `onUnauthorized` del shell (que limpia el estado de auth
y navega a sign-in).

La misma instancia se inyecta después en `<ApiProvider client={api}>` y la
consumen los addons vía `useApi()`. Los addons NO deben importar axios por
su cuenta — cada request pasa por el cliente del shell así los headers, la
lógica de refresh y la base URL se mantienen consistentes.

### Theme

`useTheme()` de `@asteby/metacore-theme` devuelve el theme actual
(`light` / `dark` / `system`), el valor resuelto, y `setTheme()`. Los
colores de marca (primary, accent, sidebar) se derivan de
`<PlatformConfigProvider>` y se materializan como propiedades custom de
CSS en `<html>` (en espacio `oklch()`, ver `platform-config-provider.tsx`).
Los addons leen tokens vía las mismas variables CSS — sin lista de colores
del lado JS para importar.

### i18n

El shell monta una instancia `i18next` construida por `createI18n()` de
`@asteby/metacore-i18n`. Los addons publican su propio bundle de
traducción al Hub (`/v1/addons/<key>/i18n/<lang>.json`); el SDK lo trae y
cachea vía `useAddonI18n(addonKey)`. Cambiar el idioma del host dispara un
refetch.

### Notificaciones

Dos superficies:

- **Toasts** — la API `toast()` de `sonner`. El shell monta `<Toaster/>`
  una vez (`MetacoreAppShell` lo hace por default). Como `sonner` viene
  con el bundle del shell, los addons que llaman a `toast.success(...)`
  pegan en la cola del shell, no en una privada.
- **Inbox** — `<NotificationsDropdown apiClient apiBasePath/>` de
  `@asteby/metacore-notifications`. El addon no renderiza esto — lo hace
  el shell. El package expone `useNotifications()` / `useAppBadge()` si un
  addon necesita leer counts de no-leídos.

### Subscriber de WebSocket

El shell monta `<WebSocketProvider url getToken/>` una vez. Los addons se
suscriben a mensajes tipados vía:

```tsx
import { useWebSocketMessage } from '@asteby/metacore-websocket'

useWebSocketMessage('order.created', (msg) => {
  // msg.payload: { id, total, ... }
})
```

`useWebSocketMessage` no devuelve nada — solo registra un handler por la
vida del componente. El provider maneja reconnect, exponential backoff,
heartbeat y refresh de token; los addons nunca hablan con el socket raw.

Los eventos de hot-swap del manifest viajan por este mismo bus (ver
`manifest-hotswap-subscriber.ts`); addons que quieran reaccionar al ciclo
de vida de otros addons se suscriben a los mismos tipos de mensaje.

### Navegación

Declarativa a través de `manifest.navigation[]`. El shell mergea la
contribución de cada addon en su sidebar base vía `mergeNavigation()`.
Los addons que necesitan una entrada programática (ej. un deep-link a una
sub-ruta creada en runtime) también pueden llamar a
`api.registry.registerRoute({ path, component })` y dejar que el
provider de navegación del shell la adjunte.

Hoy **no hay** una llamada imperativa "abrí esta página" en el bridge. Los
addons que quieren navegar desde dentro de su propio árbol React usan el
router del shell vía `useNavigate()` de `@tanstack/react-router` — la
instancia del router está compartida porque el context del router del
host es parte del árbol React y React es un singleton de federación. Ver
[Gaps detectados](#gaps-detectados).

## Reglas de oro

Estas son no-negociables para cualquier addon que quiera cargar limpio en
el shell.

### 1. El addon NO bundlea React ni el SDK

Cada package compartido por el shell se declara con `singleton: true` en
la config de Module Federation del addon. El addon importa `react`,
`@asteby/metacore-sdk`, `@asteby/metacore-auth`, etc., pero en runtime
esos imports resuelven a las copias del **shell**. Sin esto, el addon
termina con su propio React → el clásico `Invalid hook call` más contexts
rotos (`useApi()`, `useAuth()`, `useTheme()` devuelven todos `undefined`).

La lista canónica vive en `metacoreFederationShared()` de
`@asteby/metacore-starter-config/vite`:

```ts
// vite.config.ts del addon
import { federation } from '@module-federation/vite'
import { metacoreFederationShared } from '@asteby/metacore-starter-config/vite'

export default defineConfig({
  plugins: [
    federation(
      metacoreFederationShared({
        host: 'metacore_tickets',                 // containerName(manifest)
        exposes: { './plugin': './src/plugin.tsx' },
      }),
    ),
  ],
})
```

Los singletons obligatorios son:

- `react`
- `react-dom`
- `@asteby/metacore-runtime-react`
- `@asteby/metacore-theme`
- `@asteby/metacore-app-providers`
- `@asteby/metacore-auth`
- `@asteby/metacore-ui`
- `@asteby/metacore-sdk`

Cada uno se declara con `{ singleton: true, requiredVersion: false }`. El
`requiredVersion: false` es intencional — Module Federation NO enforcea
match exacto en runtime, y el host gana la carrera del share scope. Los
addons que se quedan atrás en versiones más viejas del shell igual
cargan. Los addons que quieren gating de versión más estricto pasan
`overrides`. El razonamiento detallado por package vive en
[`docs/audits/2026-05-04-mf-shared-deps.md`](./audits/2026-05-04-mf-shared-deps.md);
el cableado canónico addon/host está en [`docs/federation.md`](./federation)
— armar el bloque `shared:` a mano contra los tipos públicos del plugin
está deprecado.

### 2. El addon recibe cada servicio del shell vía hooks, nunca imports

Por ejemplo, un addon nunca debe hacer esto:

```ts
// ❌ mal
import axios from 'axios'
const myClient = axios.create({ baseURL: '/api' })
```

Porque esa instancia no tiene token, ni idioma, ni branch, ni handler de
401.

En su lugar:

```tsx
// ✅ bien
import { useApi } from '@asteby/metacore-runtime-react'

function MyPanel() {
  const api = useApi()                  // axios cableado del shell
  // …
}
```

Lo mismo aplica a `useAuth()`, `useTheme()`, `useLocale()`,
`useWebSocket()`, `useNotifications()`, `usePlatformConfig()`,
`useOrgConfig()`, `useCurrentBranch()`.

### 3. El addon envía solo su propio código

Cualquier cosa alcanzable a través del bridge NO DEBE ser una dep de
runtime del package del addon. El `package.json` del addon debería
declarar cada singleton como `peerDependencies`, no `dependencies`. El
tamaño del bundle para un addon no trivial debería caer en el rango
30–80 KB — cualquier cosa más grande usualmente significa que React o el
SDK se filtraron al bundle.

### 4. Tailwind v4: declará `@source` para los packages del SDK

Tailwind v4 solo emite clases utility que encuentra escaneando los globs
de `content` configurados. Los packages del SDK viven bajo `node_modules/`
y se saltean por default, así que clases como `bg-primary` o
`data-[state=open]` de `DynamicTable` / `<Toaster/>` / layout del shell se
podan silenciosamente en producción.

El stylesheet principal del addon debe incluir:

```css
/* src/styles/app.css */
@import 'tailwindcss';
@import '@asteby/metacore-theme/tokens.css';

@source "../../node_modules/@asteby/metacore-ui/dist/**/*.{js,mjs}";
@source "../../node_modules/@asteby/metacore-runtime-react/dist/**/*.{js,mjs}";
@source "../../node_modules/@asteby/metacore-auth/dist/**/*.{js,mjs}";
@source "../../node_modules/@asteby/metacore-app-providers/dist/**/*.{js,mjs}";
@source "../../node_modules/@asteby/metacore-notifications/dist/**/*.{js,mjs}";
```

Ajustá el path relativo al layout del repo del addon. Una línea `@source`
por cada package del SDK que el addon renderiza. Sin esto, el addon se ve
sin estilo en producción aunque el modo dev (con la detección de clases
on-demand de Vite) no muestre nada mal.

### 5. Vite: pre-bundleá los packages del SDK con `metacoreOptimizeDeps`

Cuando el addon está linkeado localmente vía `file:` / `workspace:`
(desarrollo), Vite NO pre-bundlea deps linkeadas por default. Los
`dist/*.js` de los packages del SDK llegan al browser con bare specifiers
(`@asteby/metacore-ui/...`) y el browser tira
`Failed to resolve module specifier`.

Forzá el pre-bundling vía la config canónica:

```ts
// vite.config.ts del addon
import { defineMetacoreConfig } from '@asteby/metacore-starter-config/vite'

export default defineMetacoreConfig({
  router: true,
  // metacoreOptimizeDeps aplicado automáticamente
})
```

Si el addon escribe su propia config de Vite:

```ts
import { metacoreOptimizeDeps } from '@asteby/metacore-starter-config/vite'

export default defineConfig({
  optimizeDeps: metacoreOptimizeDeps,
})
```

`metacoreOptimizeDeps` trae la lista `include` canónica — cada package
público `@asteby/metacore-*` y cada entry de subpath (`/primitives`,
`/lib`, `/data-table`, `/dialogs`, `/layout`, `/hooks`, `/icons`,
`/command-menu`).

### 6. Un `Registry`, un shell

El host instancia exactamente un `Registry` (de `@asteby/metacore-sdk`)
por sesión y entrega la misma referencia a cada `register(api)`. Los
addons que intentan instanciar su propio `new Registry()` terminan con
una tabla de contribuciones privada que el shell nunca lee.

## Ejemplo mínimo

Un addon completo que renderiza **"Hello tenant {name}"** bajo
`/addons/hello/dashboard` y contribuye una entrada de sidebar.

### `manifest.json`

```jsonc
{
  "apiVersion": "asteby.com/v3",
  "kind": "Addon",
  "metadata": {
    "key": "hello",
    "name": "Hello Tenant",
    "version": "1.0.0",
    "category": "demo"
  },
  "compatibility": {
    "requires": [{ "key": "kernel", "version": ">=3.0.0 <4.0.0" }]
  },

  "frontend": {
    "entry":     "/api/metacore/addons/hello/frontend/remoteEntry.js",
    "format":    "federation",
    "expose":    "./plugin",
    "container": "metacore_hello"
  },

  "contributions": {
    "navigation": [{
      "title": "sidebar.hello",
      "icon": "Hand",
      "url": "/addons/hello/dashboard"
    }]
  }
}
```

### `vite.config.ts`

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import { federation } from '@module-federation/vite'
import { metacoreFederationShared, metacoreOptimizeDeps }
  from '@asteby/metacore-starter-config/vite'

export default defineConfig({
  plugins: [
    react(),
    federation(
      metacoreFederationShared({
        host: 'metacore_hello',
        exposes: { './plugin': './src/plugin.tsx' },
      }),
    ),
  ],
  optimizeDeps: metacoreOptimizeDeps,
  build: { target: 'esnext', modulePreload: false, cssCodeSplit: false },
})
```

### `package.json` (extracto)

```jsonc
{
  "name": "metacore-addon-hello",
  "version": "1.0.0",
  "type": "module",
  "peerDependencies": {
    "react": "^19",
    "react-dom": "^19",
    "@asteby/metacore-runtime-react": "*",
    "@asteby/metacore-auth": "*",
    "@asteby/metacore-app-providers": "*",
    "@asteby/metacore-sdk": "*",
    "@asteby/metacore-ui": "*",
    "@asteby/metacore-theme": "*"
  }
}
```

### `src/styles/app.css`

```css
@import 'tailwindcss';
@import '@asteby/metacore-theme/tokens.css';

@source "../../node_modules/@asteby/metacore-ui/dist/**/*.{js,mjs}";
@source "../../node_modules/@asteby/metacore-runtime-react/dist/**/*.{js,mjs}";
@source "../../node_modules/@asteby/metacore-auth/dist/**/*.{js,mjs}";
@source "../../node_modules/@asteby/metacore-app-providers/dist/**/*.{js,mjs}";
```

### `src/plugin.tsx`

```tsx
import { definePlugin } from '@asteby/metacore-sdk'
import { useAuthStore } from '@asteby/metacore-auth'
import { useOrgConfig } from '@asteby/metacore-app-providers'
import { Card } from '@asteby/metacore-ui/primitives'
import './styles/app.css'

function HelloDashboard() {
  const user = useAuthStore((s) => s.auth.user)
  const org = useOrgConfig()

  return (
    <main className="p-8">
      <Card className="p-6">
        <h1 className="text-2xl font-semibold text-foreground">
          Hello tenant {user?.organization_name ?? 'Unknown'}
        </h1>
        <p className="text-sm text-muted-foreground mt-2">
          Signed in as {user?.email} · currency {org.currency_code ?? '—'}
        </p>
      </Card>
    </main>
  )
}

export default definePlugin({
  key: 'hello',
  register(api) {
    api.log.info('registering hello addon', { kernel: api.kernelVersion })
    api.registry.registerRoute({
      path: '/addons/hello/dashboard',
      component: HelloDashboard,
    })
  },
})
```

Tres cosas para notar:

1. El addon importa `useAuthStore` y `useOrgConfig` directamente. En
   build time resuelven contra su propio `node_modules`; en runtime
   Module Federation los redirige a los singletons del shell.
2. No hay `<AuthProvider>` ni `<OrgConfigProvider>` en el addon — esos
   viven en el shell y envuelven el loader de federación.
3. El componente de ruta se contribuye una vez vía
   `api.registry.registerRoute`. El host lo renderiza dentro de su propio
   router y chrome.

## Versionado

La superficie del bridge es **todo lo de este documento**. Se versiona
por la unión de los packages del SDK que abarca:

| Package | Major actual |
|---|---|
| `@asteby/metacore-sdk` | `2.x` |
| `@asteby/metacore-app-providers` | `6.x` |
| `@asteby/metacore-runtime-react` | `4.x` |
| `@asteby/metacore-auth` | `2.x` |
| `@asteby/metacore-theme` | `2.x` |
| `@asteby/metacore-ui` | `1.x` |
| `@asteby/metacore-i18n` | `1.x` |
| `@asteby/metacore-notifications` | `1.x` |
| `@asteby/metacore-websocket` | `1.x` |
| `@asteby/metacore-starter-config` | `1.x` |

**Política de breaking-change** para el bridge:

- **Agregar** un servicio a `AddonAPI` o un hook nuevo del lado shell es
  **minor**. Los addons existentes siguen cargando.
- **Renombrar o quitar** un field de `AddonAPI`, quitar un hook, o cambiar
  la firma de uno existente es **major** en el package que lo posee, Y
  requiere un bump de `Bridge vN` en el kernel (`AddonAPI.kernelVersion`).
- **Cambiar la lista de singletons de MF** es **major** en
  `@asteby/metacore-starter-config`. Los addons deben republicar con la
  config nueva; los addons viejos siguen funcionando hasta que el gate de
  kernel-version del shell los rechace.
- Los re-keys de hot-swap (ver [Ciclo de vida](#ciclo-de-vida)) NO son un
  breaking change.

El addon anuncia su contrato de bridge pinneando rangos de peer en
`peerDependencies`. El host enforcea compatibilidad a través del rango
semver `manifest.kernel` — el kernel rechaza manifests cuyo rango
declarado excluye al shell corriendo.

## Gaps detectados

Áreas donde el bridge es implícito o inconsistente hoy. Se documentan acá
como gaps conocidos; la implementación está **fuera de scope** de este doc
y debería aterrizar como RFCs / PRs de feature separados.

1. **Sin API de navegación imperativa en `AddonAPI`.** Los addons hoy
   navegan vía `useNavigate()` de `@tanstack/react-router`, lo que
   funciona solo porque la instancia del router se filtra a través del
   React context. No hay garantía de que un shell use TanStack Router; un
   host que no lo use rompe cada addon que lo importa. Propuesta: exponer
   `api.navigation.push(path)` / `api.navigation.replace(path)` así los
   addons se mantienen agnósticos al router.

2. **Sin stack de modal en `AddonAPI`.** Las contribuciones de modal pasan
   por `registry.registerModal(slug, …)` pero no hay forma de que el
   addon **abra imperativamente** un modal propiedad del host (ej. un
   diálogo de confirmación, el command palette del host). Hoy los addons
   o renderizan `<Dialog/>` ellos mismos (vive dentro del subtree del
   addon y puede quedar recortado por el chrome) o importan stores de
   modal internos del host (frágil, específico del host). Propuesta:
   `api.dialogs.confirm({ title, body })`, `api.dialogs.open(slug,
   payload)` respaldados por un stack de modal propiedad del host.

3. **La cola de toast es implícita.** `sonner.toast(...)` funciona solo
   porque el shell casualmente montó `<Toaster/>` y `sonner` viaja como
   una dep no-singleton a través del bundle del shell. No hay un contrato
   que garantice que un host cablea Sonner. Propuesta: exponer
   `api.notifications.toast({ kind, title, description })` y dejar que el
   host elija la implementación (Sonner hoy, custom mañana).

4. **Sin publish/broadcast imperativo de WebSocket en `AddonAPI`.**
   `useWebSocket().send()` deja que un addon empuje frames, pero el
   eventing inter-addon (un addon emite, otro se suscribe) no está
   documentado y depende de acordar strings de `message.type`. Propuesta:
   bendecir `api.events.publish(type, payload)` /
   `api.events.subscribe(type, fn)` como el bus inter-addon canónico,
   apilado sobre el websocket.

5. **Sin check de capability en el bridge.** `useCapabilities()` existe
   pero solo se alcanza a través de la superficie del hook de React. Un
   addon que chequea capabilities dentro de `register(api)` (antes de que
   renderice cualquier componente) no tiene nada que llamar. Propuesta:
   `api.capabilities.has(kind, target)` espejando el hook.

6. **Contexto de branch opcional.** `useCurrentBranch()` devuelve `{ id:
   undefined }` cuando no hay `<BranchProvider>` montado. Los addons
   multi-branch cargan silenciosamente con branch `null` y caen al
   default de la org, que rara vez es lo que el usuario quiere.
   Propuesta: hacer `BranchProvider` obligatorio para addons multi-branch
   vía un flag de manifest que el shell pueda validar al instalar.

7. **Sin API de tokens de theme.** Los addons leen variables CSS
   (`--primary`, `--accent`) — bien para estilizar, inútil para
   librerías de canvas/SVG/chart que necesitan valores numéricos.
   `@asteby/metacore-theme` exporta `colorTokens` / `chartTokens` pero son
   estáticos — no reflejan los overrides en runtime de
   `PlatformConfigProvider`. Propuesta: un hook
   `useResolvedThemeTokens()` que devuelva los valores oklch en vivo.

8. **La semántica de prioridad de `registry.registerSlot` difiere de
   `slotRegistry`.** El `Registry.registerSlot` de `@asteby/metacore-sdk`
   ordena ascendente (menor prioridad primero); `slotRegistry` en
   `runtime-react/src/slot.tsx` ordena descendente (mayor prioridad
   primero). El shell usa ambos. Elegir uno; documentarlo en
   `SlotContribution.priority`.

9. **Sin handshake de negociación de versión.** `AddonAPI.kernelVersion`
   es informativo pero el addon no puede negarse a registrarse basado en
   él sin tirar una excepción. Propuesta: los addons devuelven `false`
   desde `register()` para señalar incompatibilidad, que el host expone
   como un error de instalación en vez de un crash en runtime.

## Ver también

- [`addon-publishing.md`](./addon-publishing) — cómo publicar un addon al Hub.
- [`addon-cookbook.md`](./addon-cookbook) — recetas patrón-por-patrón para la forma `./plugin`.
- [`full-page-federation.md`](./full-page-federation) — convención de ruta chromeless `./pages/<slug>`.
- [`manifest-spec.md`](./manifest-spec) — campos de manifest de los que lee el bridge.
- [`capabilities.md`](./capabilities) — gates de capability enforced antes del acceso al bridge.
- [`audits/2026-05-04-mf-shared-deps.md`](./audits/2026-05-04-mf-shared-deps.md) — razón de cada singleton por package.
