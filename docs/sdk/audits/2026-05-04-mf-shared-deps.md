# Audit — Module Federation `shared` deps (host + addons)

- **Fecha:** 2026-05-04
- **Repo:** `metacore-sdk`
- **Scope:** `packages/starter-config`, `packages/sdk` (host) y `examples/integrations/*/frontend/vite.config.ts` (addons) como muestra del lado remoto.
- **Objetivo:** documentar la configuración actual de `shared` en Module Federation y proponer la lista de singletons obligatorios para que el host y los addons compartan instancias en runtime.

---

## 1. Estado actual

### 1.1 `packages/starter-config` — host side

`starter-config/vite-preset.ts` (`defineMetacoreConfig`) **no declara nada de Module Federation**. El preset hoy se ocupa de:

- React SWC + Tailwind 4 + TanStack Router (opcional) + PWA (opcional).
- `optimizeDeps.include` para todos los `@asteby/metacore-*` (memoria del feedback `optimize_deps_metacore`).

No hay un `metacoreFederationShared`, no se invoca `@originjs/vite-plugin-federation`, y `defineMetacoreConfig` jamás emite un `host` o `remotes:` block. Las apps host (link/ops/starter) cargan los addons exclusivamente via `loadFederatedAddon` en runtime.

### 1.2 `packages/sdk/src/federation.ts` — runtime loader

`loadFederatedAddon(spec, addonKey)` hace tres cosas (`packages/sdk/src/federation.ts:73-89`):

1. Inyecta el `<script src=spec.entry crossorigin integrity=spec.integrity>`.
2. Mergea share scope con:
   ```ts
   window.__METACORE_SHARE_SCOPE__ ??= {};
   await container.init(window.__METACORE_SHARE_SCOPE__);
   ```
3. Resuelve el módulo expuesto (`./plugin` por defecto) y devuelve el `default`.

**Hallazgo crítico:** `__METACORE_SHARE_SCOPE__` se inicializa **vacío**. El host no registra ningún módulo en él, así que cuando el addon hace `container.init({})` y declara `react: { singleton: true }`, no encuentra una versión host y termina **bundleando su propia copia**. El flag `singleton: true` que declaran los addons hoy es ceremonial: el contrato no se cumple porque no hay nada del lado host que poblar el scope.

Consecuencia observable: cualquier hook o contexto compartido (Theme, Auth, Query, Router) que cruza el border host↔addon dispara "Invalid hook call" o "context default value" porque hay dos React + dos providers.

### 1.3 Addons — remoto

Los seis vite configs auditados (`examples/integrations/{tickets,orders,catalog,schedules,fiscal_mexico}/frontend/vite.config.ts` y `examples/tickets-addon/frontend/vite.config.ts`) son idénticos en su declaración `shared`:

```ts
federation({
  name: "metacore_<key>",
  filename: "remoteEntry.js",
  exposes: { "./plugin": "./src/plugin.tsx" },
  shared: {
    react:                  { singleton: true, requiredVersion: false },
    "react-dom":            { singleton: true, requiredVersion: false },
    "@asteby/metacore-sdk": { singleton: true, requiredVersion: false },
  },
}),
```

Es decir, **3 paquetes** declarados shared, todos con `requiredVersion: false` (cualquier rango pasa) y `singleton: true`.

**Faltan en la declaración del addon** (vs. la lista pedida por la tarea):

- `@asteby/metacore-runtime-react`
- `@asteby/metacore-theme`
- `@asteby/metacore-auth`
- `@asteby/metacore-ui`

### 1.4 Por qué los faltantes importan

| Paquete                          | Versión actual | Estado contextual                                    | Riesgo de duplicar instancias |
|----------------------------------|----------------|------------------------------------------------------|-------------------------------|
| `react`                          | 19.2.x (peer)  | declarado shared                                     | bug clásico "Invalid hook call" |
| `react-dom`                      | 19.2.x (peer)  | declarado shared                                     | renderers concurrentes; portales rotos |
| `@asteby/metacore-sdk`           | 2.3.0          | declarado shared                                     | dos `Registry` ⇒ slots fantasma |
| `@asteby/metacore-runtime-react` | 8.0.0          | **expone Providers/Contexts** (ApiContext, OptionsContext, I18nProvider, ActionModalDispatcher, CapabilityGate) | el addon que use `useApi()`, `useOptions()` o el dispatcher dentro del árbol del host falla — distinto context |
| `@asteby/metacore-theme`         | 2.0.0          | `provider.tsx` exporta `ThemeProvider` + `useTheme` | dark/light mode desincronizado addon vs host |
| `@asteby/metacore-auth`          | 7.0.0          | `provider.tsx` + `store` (Zustand) + axios client    | sesión duplicada; el addon ve usuario null aunque host esté logueado |
| `@asteby/metacore-ui`            | 2.0.0          | radix primitives, command-menu, data-table, hooks    | Radix usa un único `DismissableLayerContext`; duplicarlo rompe Dialog/Popover/Toast cross-tree |

`runtime-react`, `theme`, `auth` y `ui` son todos **context providers o stores singleton-by-design**. Si el addon usa cualquiera de estos hooks, hoy **funciona por accidente** sólo cuando los providers se duplican dentro del subtree del addon (lo que vacía las suscripciones cross-host) o si el addon evita esos hooks. No hay garantía estructural.

---

## 2. Propuesta — singletons obligatorios

### 2.1 Lista mínima

Toda app federada (host + remote) DEBE declarar los siguientes paquetes como `singleton: true`:

| # | Paquete                          | Razón principal                                 | `requiredVersion` |
|---|----------------------------------|-------------------------------------------------|-------------------|
| 1 | `react`                          | hook dispatcher en module-scope                 | `false` (host gana) |
| 2 | `react-dom`                      | reconciler único; portales y SSR boundaries     | `false` |
| 3 | `@asteby/metacore-runtime-react` | ApiContext, OptionsContext, I18nProvider        | `false` |
| 4 | `@asteby/metacore-theme`         | ThemeProvider + useTheme + tokens               | `false` |
| 5 | `@asteby/metacore-auth`          | AuthProvider + Zustand store + axios client     | `false` |
| 6 | `@asteby/metacore-ui`            | Radix context layers; Toaster (sonner) único    | `false` |
| 7 | `@asteby/metacore-sdk`           | `Registry`/`ActionRegistry` singleton           | `false` |

`requiredVersion: false` se mantiene mientras el ecosistema esté pre-1.0 en términos de contrato federado: el host siempre gana. Cuando cada package estabilice su breaking surface por separado, pasamos a `^X` por paquete.

### 2.2 Recomendados (segunda fase)

Estos no son context providers pero sí "stateful singletons" que conviene compartir tan pronto algún addon los importe directamente:

- `@tanstack/react-query` — `QueryClient` se inyecta vía Provider; si el addon importa `useQuery` desde su propia copia, las cachés se aíslan.
- `@tanstack/react-router` — context del router (rara vez en addon; bandera por si el addon expone deep-links).
- `zustand` — varios `create()` en `auth`/`runtime-react`. Compartir el módulo evita stores duplicados con la misma key.
- `i18next` + `react-i18next` — instancia de i18n unificada; misma motivación que React-Query.
- `sonner` — `<Toaster />` es global, evitar dos.

No las marcaríamos `singleton:true` obligatorio en v1; sí las dejaríamos en la helper como **opt-in named group** (`metacoreFederationShared({ extras: ['query','router','i18n'] })`).

### 2.3 Subpath pinning

`@asteby/metacore-ui` tiene 12 subpath exports (`./primitives`, `./data-table`, `./layout`, `./hooks`, `./icons`, etc.). `@originjs/vite-plugin-federation` resuelve `shared` por package name; subpaths son accesibles automáticamente si el package raíz está marcado shared. **No hace falta** declarar `@asteby/metacore-ui/primitives` por separado, pero sí hay que verificar que el addon importe siempre desde el barrel (`@asteby/metacore-ui` o un subpath), no desde `@asteby/metacore-ui/dist/...`. Documentar en el cookbook.

---

## 3. Plan de cambio

### 3.1 Helper en `starter-config`

Agregar a `packages/starter-config/vite-preset.ts` (y exportar también desde `./vite`):

```ts
import type { ModuleFederationOptions } from '@originjs/vite-plugin-federation/types';

export const METACORE_SHARED_SINGLETONS = [
  'react',
  'react-dom',
  '@asteby/metacore-runtime-react',
  '@asteby/metacore-theme',
  '@asteby/metacore-auth',
  '@asteby/metacore-ui',
  '@asteby/metacore-sdk',
] as const;

export interface MetacoreFederationSharedOptions {
  /** Add packages on top of the mandatory list. */
  extras?: string[];
  /** Override per-package config (e.g. force requiredVersion). */
  overrides?: Record<string, { singleton?: boolean; requiredVersion?: string | false }>;
}

export function metacoreFederationShared(
  opts: MetacoreFederationSharedOptions = {}
): NonNullable<ModuleFederationOptions['shared']> {
  const base = Object.fromEntries(
    METACORE_SHARED_SINGLETONS.map((name) => [name, { singleton: true, requiredVersion: false as const }])
  );
  for (const e of opts.extras ?? []) base[e] ??= { singleton: true, requiredVersion: false };
  return { ...base, ...(opts.overrides ?? {}) };
}
```

Apps host y addons consumen así:

```ts
// addon vite.config.ts
federation({ name: 'metacore_tickets', filename: 'remoteEntry.js',
  exposes: { './plugin': './src/plugin.tsx' },
  shared: metacoreFederationShared(),
})

// host vite.config.ts (vía defineMetacoreConfig)
export default defineMetacoreConfig({
  router: true,
  federation: { remotes: {} }, // host registra share scope vacío + populate
})
```

### 3.2 Host: poblar `__METACORE_SHARE_SCOPE__`

Dos caminos:

**A — usar `@originjs/vite-plugin-federation` también en el host** con `remotes: {}` (no consume nada estático) y la misma `shared`. El plugin inyecta el bootstrap que registra cada singleton en el scope antes de que el SDK haga `container.init`. Esta es la opción "estándar" y la que se acopla mejor al ecosistema Vite-federation.

**B — bootstrap manual** desde el SDK: agregar a `packages/sdk/src/federation.ts` un `registerHostShares()` que recibe `{ react: () => import('react'), ... }` y rellena `window.__METACORE_SHARE_SCOPE__` antes del primer `container.init`. Más invasivo (cada app host tiene que listar imports), pero evita meter al host en el plugin de federation.

Recomendación: **opción A**. Menos código en el SDK, más alineado con la doc de `@originjs/vite-plugin-federation`. `defineMetacoreConfig` aceptaría una opción `federation: true | { extras, overrides }` y armaría el plugin internamente.

### 3.3 Migración de los addons existentes

Los seis vite configs auditados se pueden migrar 1:1 reemplazando el bloque inline `shared:` por `shared: metacoreFederationShared()`. Dejarlo como changeset `minor` en `@asteby/metacore-starter-config` (helper nuevo, no breaking) y `patch` en cada addon-template.

### 3.4 Validación

- Test unitario en `starter-config`: `metacoreFederationShared()` retorna las 7 keys obligatorias con `singleton: true`.
- Test e2e en `examples/integrations/tickets`: cargar el addon en una app host real, verificar que `window.__METACORE_SHARE_SCOPE__.react.default` apunta al mismo módulo que `host.react`.
- Smoke en CI: `pnpm -r build` debe seguir verde después de migrar al menos un addon de ejemplo.

---

## 4. Anexo — referencias de código

- `packages/starter-config/vite-preset.ts:32-52` — `metacoreOptimizeDepsInclude`, no incluye nada de federation hoy.
- `packages/starter-config/vite-preset.ts:88-157` — `defineMetacoreConfig`, sin opción `federation`.
- `packages/sdk/src/federation.ts:73-89` — share scope inicializado vacío, addon-side declarations no se enforzan.
- `packages/sdk/src/federation.ts:116-128` — `containerName()` deriva `metacore_<key>` (referencia, no se modifica).
- `packages/runtime-react/package.json:25-40` — peer deps que cruzan el border host↔addon.
- `packages/auth/src/provider.tsx`, `packages/theme/src/provider.tsx` — providers cuyo singleton hoy no está garantizado.
- `examples/integrations/tickets/frontend/vite.config.ts:11-20` — declaración `shared` actual.
- `examples/integrations/orders/frontend/vite.config.ts:11-20` — idéntica.
- `examples/integrations/catalog/frontend/vite.config.ts:11-20` — idéntica.
- `examples/integrations/schedules/frontend/vite.config.ts:11-20` — idéntica.
- `examples/integrations/fiscal_mexico/frontend/vite.config.ts:11-20` — idéntica (con comentario sobre matching `manifest.frontend.container`).
- `examples/tickets-addon/frontend/vite.config.ts:36-40` — idéntica + comentario explicando `requiredVersion: false`.

---

## 5. Resumen ejecutivo

- Hoy el host **no participa** del Module Federation share scope. La `singleton: true` de los addons es declarativa pero no efectiva: cada addon termina embebiendo su propia copia de `react`, `react-dom` y `@asteby/metacore-sdk`.
- Los addons sólo declaran 3 paquetes shared. Faltan **`runtime-react`, `theme`, `auth`, `ui`** — los cuatro tienen contextos React que no toleran duplicación.
- Propongo:
  1. `metacoreFederationShared()` helper en `starter-config` con la lista canónica de **7 singletons obligatorios**.
  2. `defineMetacoreConfig({ federation: true })` que enchufa `@originjs/vite-plugin-federation` también en el host para poblar `__METACORE_SHARE_SCOPE__`.
  3. Migrar los seis addon-examples (1:1, sin breaking) y dejarlo como `minor` de `starter-config`.
- Trabajo de seguimiento: extras opt-in (`react-query`, `i18next`, `zustand`, `sonner`, `react-router`) y un test e2e que verifique singletons reales en `__METACORE_SHARE_SCOPE__`.
