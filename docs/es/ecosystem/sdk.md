# SDK

[`asteby/metacore-sdk`](https://github.com/asteby/metacore-sdk) es la mitad TypeScript de Metacore: el schema del manifest, el formato del bundle, el runtime React, la CLI y un set de primitivos de UI que leen metadata del kernel y renderizan componentes tipados.

## Qué provee

El SDK publica un set de packages bajo el scope `@asteby/metacore-*`, más la CLI de addons. Se dividen en algunos ejes:

### Runtime & rendering

| Package | Qué es |
|---|---|
| `@asteby/metacore-runtime-react` | El core: rendering de CRUD dinámico — `<DynamicTable>`, `<DynamicForm>`, `<DynamicCRUDPage>`, `<Slot>`, loader de addons federados, capability gate, hooks (`useApi`, `useMetadataCache`, `useNavigation`, `useOptions`, `useCapabilities`) |
| `@asteby/metacore-sdk` | SDK frontend: loader de addons federados, slot registry, manifest tipado & cliente de API |
| `@asteby/metacore-ui` | UI kit — data-table, layout shell, command menu, primitives basados en shadcn |
| `@asteby/metacore-theme` | Design tokens + preset Tailwind v4 (oklch, sombras, fuentes, dark mode) |
| `@asteby/metacore-i18n` | Factory de i18next, bundles base ES/EN, language switcher, RTL provider |
| `@asteby/metacore-lib` | Utilidades — formato de date/currency/number, manejo de errores, cookies |

### App shell & integraciones

| Package | Qué es |
|---|---|
| `@asteby/metacore-app-providers` | `MetacoreAppShell` + providers transport-agnostic (platform-config, layout, search, direction, font) |
| `@asteby/metacore-starter-core` | Providers, stores, hooks y context compartidos que consumen las apps Vite+React |
| `@asteby/metacore-auth` | Kit de auth — store, factory de cliente de API, páginas login/signup/forgot, guards para TanStack Router |
| `@asteby/metacore-websocket` | Provider WebSocket — auto-reconnect, mensajes tipados, suscripciones a canales |
| `@asteby/metacore-notifications` | Dropdown de notificaciones, badge de app, updates por WebSocket |
| `@asteby/metacore-pwa` | Helpers PWA — plugin Vite, prompts de install/update, push, indicador offline |
| `@asteby/metacore-webhooks` | UI de gestión de webhooks — list, create, logs, test/replay, signing secrets |
| `@asteby/metacore-billing` | Estado de suscripción, hooks de Stripe checkout/portal, UI de billing settings |
| `@asteby/metacore-marketplace` | Cliente de catálogo Hub + install/upgrade, hooks, UI headless para descubrir addons |
| `@asteby/metacore-tools` | Cliente TypeScript para el runtime de Tools del kernel (tools triggereadas por LLM) |

### Build & autoría

| Package | Qué es |
|---|---|
| `@asteby/create-metacore-app` | `npm create @asteby/metacore-app` — scaffoldea un host completo desde un example (p.ej. `fullstack-starter`) |
| `@asteby/metacore-starter-config` | Config compartida Vite + Tailwind 4 + TanStack Router + ESLint + TS, incl. `metacoreOptimizeDeps` |

La CLI de addons en sí es la **herramienta Go `metacore`** (`go install github.com/asteby/metacore-sdk/cli@latest`) — `init`, `validate`, `build`, `sign`, `publish`. (Las versiones y nombres exactos siguen [las docs del SDK](https://asteby.github.io/metacore-sdk/) — esto es un inventario de alto nivel.)

## Qué agarrás

El frontend de una app de host depende del runtime más el shell:

```bash
pnpm add @asteby/metacore-runtime-react @asteby/metacore-app-providers \
         @asteby/metacore-auth @asteby/metacore-ui @asteby/metacore-theme
```

O salteá el cableado manual por completo y scaffoldeá desde el starter — `npm create @asteby/metacore-app my-app -- --example fullstack-starter`.

## Scaffoldear un host

```bash
npm create @asteby/metacore-app my-app -- --example fullstack-starter
cd my-app
docker compose up --build
```

Mirá [Construir un host](/es/getting-started/build-a-host) para ver qué cablea, y [Construir un addon](/es/getting-started/build-an-addon) para el loop de autoría de addons.

## Stack

- **TypeScript 5.x**
- **React 18+** (los packages publicados corren sobre React 19)
- **TanStack Query** + **TanStack Router** + **TanStack Table** por debajo
- **Zod** para validación de schema en runtime
- **Vite** como build tool de referencia para hosts (el core es framework-agnóstico)
- **Tailwind v4** — el package theme trae un preset y declarás los packages del SDK vía `@source`

## Dónde vive la documentación profunda

El SDK publica su propio sitio VitePress de docs con:

- Spec completo del manifest (cada campo, cada tipo de columna, cada validador)
- Referencia API de cada package (generada con TypeDoc)
- Props de cada componente
- Signature de cada hook
- Recetas (formularios, tablas, navegación, tiempo real, slots custom)

[Docs del SDK ↗](https://asteby.github.io/metacore-sdk/)

## Repositorio

- **GitHub:** [github.com/asteby/metacore-sdk](https://github.com/asteby/metacore-sdk)
- **Licencia:** Apache-2.0
- **Releases:** Basados en Changesets; npm publish al mergear PRs de versión; TypeDoc → Pages

## Relacionado

- [Arquitectura](/es/architecture) — dónde encaja el SDK.
- [Kernel](/es/ecosystem/kernel) — el lado server de la API del SDK.
- [Construir un addon](/es/getting-started/build-an-addon) — quickstart.
- [Construir un host](/es/getting-started/build-a-host) — usar el SDK como frontend de host.
