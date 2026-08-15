<p align="center">
  <img src="/logo.svg" width="120" alt="Metacore" />
</p>

<h1 align="center">Federación</h1>

<p align="center">
  <strong>Cómo los addons de metacore declaran Module Federation para que React, el SDK y los providers del host se mantengan como instancias únicas en runtime.</strong>
</p>

> **TL;DR.** Usá [`metacoreFederationShared()`](#metacorefederationshared--el-helper-canónico)
> de `@asteby/metacore-starter-config/vite`. Es la única API que documenta
> el SDK y la única garantizada de typechequear entre upgrades del plugin
> de federación subyacente — **`@module-federation/vite`**, el build
> actual (revisiones más viejas de este doc referenciaban
> `@originjs/vite-plugin-federation`; el ecosistema migró de ahí).

## Por qué la federación necesita canonicalización

Un addon de metacore envía solo su propio código. React, react-query,
i18next, el SDK, el store de auth, el theme provider, los primitivos de UI
y el registry de addons vienen todos del shell del host en runtime, a
través del scope compartido de Module Federation. Sin cada uno de estos
singletons obligatorios declarados en **ambos** extremos, el addon termina
con un React duplicado (el clásico `Invalid hook call`), un `QueryClient`
duplicado (`No QueryClient set` desde dentro de `app-providers`), contexts
rotos (`useAuth()`, `useTheme()`, `useApi()` devuelven todos `undefined`),
o un `Registry` privado que el shell nunca lee — ver el
[audit de shared-deps](./audits/2026-05-04-mf-shared-deps.md) para la
versión larga.

La lista de singletons es un blanco móvil — creció release tras release a
medida que `app-providers`, `react-query` y el stack de i18n se sumaron al
scope compartido. Hardcodear la lista en el `vite.config.ts` de cada addon
hace imposible que el SDK evolucione sin romper cada addon — que es lo que
[`metacoreFederationShared()`](#metacorefederationshared--el-helper-canónico)
existe para arreglar.

## `metacoreFederationShared()` — el helper canónico

Exportado desde `@asteby/metacore-starter-config/vite`. Devuelve un objeto
de config listo para pasarle directo a `@module-federation/vite`, con
**cada singleton que el SDK requiere** pre-declarado.

### Addon (remote federado)

```ts
// vite.config.ts del addon
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import { federation } from '@module-federation/vite'
import {
  metacoreFederationShared,
  metacoreOptimizeDeps,
} from '@asteby/metacore-starter-config/vite'

export default defineConfig({
  plugins: [
    react(),
    federation(
      metacoreFederationShared({
        host: 'metacore_tickets',                       // == containerName(manifest)
        exposes: { './plugin': './src/plugin.tsx' },
      }),
    ),
  ],
  optimizeDeps: metacoreOptimizeDeps,
  build: { target: 'esnext', modulePreload: false, cssCodeSplit: false },
})
```

### Host (shell que consume addons)

```ts
// vite.config.ts del host
import { defineConfig } from 'vite'
import { federation } from '@module-federation/vite'
import { metacoreFederationShared } from '@asteby/metacore-starter-config/vite'

export default defineConfig({
  plugins: [
    federation(
      metacoreFederationShared({
        host: 'metacore_ops',
        apps: {
          metacore_tickets: 'https://addons.example.com/tickets/remoteEntry.js',
          metacore_orders:  'https://addons.example.com/orders/remoteEntry.js',
        },
      }),
    ),
  ],
})
```

Los hosts pasan `apps` (mapa de remotes) en vez de `exposes`; los addons
hacen lo opuesto. Ambos extremos comparten la misma lista de singletons y
la misma llamada al plugin.

La referencia completa de opciones (incluyendo `extras`, `overrides` y
`filename`) vive en
[`packages/starter-config/README.md`](../packages/starter-config/README.md#module-federation-singletons-metacorefederationshared).

## ⚠️ No armes a mano un bloque `shared:` contra el tipo raw del plugin

El tipo de TypeScript propio del plugin de federación para una entrada
`shared` se desfasó a través de versiones de formas que no siempre
matchean lo que el runtime realmente honra. Autorear a mano un bloque
`shared:` contra ese tipo raw es lo que rompió addons en el pasado (un
field `singleton` que el tipo exportado del plugin ya no declaraba, aunque
el runtime igual lo leía en build time).

El fix es una de estas dos:

1. **Usar `metacoreFederationShared()`** (recomendado). Devuelve un valor
   tipado contra `MetacoreFederationShareConfig`
   (`packages/starter-config/vite-preset.ts`) — el tipo estable propio del
   SDK, aislado del drift del tipo del plugin upstream.
2. **Declarar un tipo local de share config** que espeje
   `MetacoreFederationShareConfig` (`singleton?`, `requiredVersion?`,
   `shareScope?`, `packagePath?`, `generate?`) si tenés una razón
   estructural para no usar el helper. Esto es lo que el helper hace
   internamente.

## La lista de singletons (actualmente once)

`metacoreFederationShared()` declara los siguientes packages como
`{ singleton: true }` (`METACORE_FEDERATION_SINGLETONS` en
`packages/starter-config/vite-preset.ts` — la constante exportada es la
única fuente de verdad; esta lista debe matchearla exactamente):

- `react`
- `react-dom`
- `react/jsx-runtime`
- `react-i18next`
- `i18next`
- `@tanstack/react-query`
- `@asteby/metacore-ui`
- `@asteby/metacore-runtime-react`
- `@asteby/metacore-sdk`
- `@asteby/metacore-app-providers`
- `@asteby/metacore-theme`
- `@asteby/metacore-auth`

**`@tanstack/react-query` es obligatorio.** Carga un React context (el
`QueryClient`); el host renderiza `<QueryClientProvider>` y el
`@asteby/metacore-app-providers` compartido llama a
`useQueryClient`/`useQuery` adentro de él (providers de org-config,
platform-config). Si te lo salteás en el share, el provider del host y el
consumer del addon pueden resolver **copias distintas** de react-query —
distinto context — crasheando con `"No QueryClient set, use
QueryClientProvider to set one"` tirado desde el chunk loadShare de
app-providers. Es intermitente porque depende de qué container gana la
negociación de share / orden de carga de chunks, lo que hace fácil
perdérselo en dev local y que solo aparezca en producción.

**Gotcha de build-time**: `@module-federation/vite` tiene que **resolver**
cada bare specifier compartido en build time — cada package de la lista de
arriba tiene que ser una (dev)dependency instalada de quien sea que esté
buildeando (host o addon), incluso los que el propio código del addon
nunca importa directamente (`i18next`/`react-i18next` son un miss común).

La lista crece a medida que `app-providers` y afines evolucionan — no la
armes a mano en el `vite.config.ts` de un addon; siempre pasá por el
helper así un bump al package de shared-config se propaga sin tocar cada
addon.

## Pre-bundling de packages del SDK localmente

Cuando el addon está linkeado vía `file:` / `workspace:` (desarrollo),
Vite **no** pre-bundlea deps linkeadas por default. Los packages del SDK
llegan al browser con bare specifiers y el browser tira
`Failed to resolve module specifier`. Usá `metacoreOptimizeDeps` de
`@asteby/metacore-starter-config/vite` para forzar el pre-bundling — ver
[el README de starter-config](../packages/starter-config/README.md#pre-bundling-linked-sdk-packages).

## Ver también

- [`packages/starter-config/README.md`](../packages/starter-config/README.md#module-federation-singletons-metacorefederationshared) — referencia completa de opciones del helper.
- [`bridge-api.md`](./bridge-api#golden-rules) — reglas de oro que cada addon federado debe obedecer.
- [`full-page-federation.md`](./full-page-federation) — exposes `./pages/<slug>` que toman el viewport completo; misma config compartida.
- [`docs/audits/2026-05-04-mf-shared-deps.md`](./audits/2026-05-04-mf-shared-deps.md) — razón de diseño de la lista de singletons.
