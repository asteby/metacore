---
title: Librerías del SDK
---

# El suite del SDK de Metacore

Un set cohesivo de packages TypeScript bajo el scope `@asteby/metacore-*` — cada uno renderizando la misma metadata del kernel en una experiencia tipada, en tiempo real y multi-tenant. Elegí el runtime, sumá el shell, agregá las superficies que necesites. Las versiones de abajo son los releases publicados actuales.

::: tip Un comando para empezar
`npm create @asteby/metacore-app my-app -- --example fullstack-starter` cablea todo el suite por vos. El desglose de abajo es para cuando quieras agarrar un package directamente.
:::

[[toc]]

## Runtime & rendering

El core que convierte `/api/metadata/table/:model` + `/api/dynamic/:model` en UI.

| Package | Ver. | Qué hace |
|---|---|---|
| `@asteby/metacore-runtime-react` | <Badge type="tip" text="11.0.0" /> | Runtime React — renderiza contribuciones de addons dinámicamente (`<DynamicTable>`, `<DynamicForm>`, `<DynamicCRUDPage>`, `<Slot>`, hooks). |
| `@asteby/metacore-sdk` | <Badge type="tip" text="2.6.0" /> | SDK frontend — loader de addons federados, slot registry, manifest tipado & cliente de API. |
| `@asteby/metacore-lib` | <Badge type="tip" text="0.4.0" /> | Utilidades — formato de date/currency/number, manejo de errores, cookies. |

```bash
pnpm add @asteby/metacore-runtime-react @asteby/metacore-sdk
```

```tsx
import { DynamicCRUDPage } from '@asteby/metacore-runtime-react'

export const ModelPage = ({ model }: { model: string }) => <DynamicCRUDPage model={model} />
```

## UI, theme & i18n

El look y las palabras.

| Package | Ver. | Qué hace |
|---|---|---|
| `@asteby/metacore-ui` | <Badge type="tip" text="2.0.1" /> | UI kit — data-table, layout shell, command menu, primitives basados en shadcn. |
| `@asteby/metacore-theme` | <Badge type="tip" text="2.0.0" /> | Design tokens + preset Tailwind 4 (oklch, sombras, fuentes, dark mode). |
| `@asteby/metacore-i18n` | <Badge type="tip" text="6.0.0" /> | Factory de i18next, bundles base ES/EN, language switcher, RTL provider. |

```css
/* Declará los packages del SDK como sources de Tailwind para que sus clases sobrevivan al purge */
@import "tailwindcss";
@source "../node_modules/@asteby/metacore-ui";
```

## App shell & providers

Bootstrapeá una app en un componente.

| Package | Ver. | Qué hace |
|---|---|---|
| `@asteby/metacore-app-providers` | <Badge type="tip" text="7.0.2" /> | `MetacoreAppShell` + providers transport-agnostic (platform-config, layout, search, direction, font). |
| `@asteby/metacore-starter-core` | <Badge type="tip" text="11.0.0" /> | Providers, stores, hooks y context compartidos que consumen las apps Vite+React. |

```tsx
import { MetacoreAppShell } from '@asteby/metacore-app-providers'

<MetacoreAppShell api={api} queryClient={queryClient}>
  <RouterProvider router={router} />
</MetacoreAppShell>
```

## Auth

| Package | Ver. | Qué hace |
|---|---|---|
| `@asteby/metacore-auth` | <Badge type="tip" text="7.1.0" /> | Kit de auth — store Zustand, factory de cliente de API, páginas login/signup/forgot, guards para TanStack Router. |

```tsx
import { createApiClient } from '@asteby/metacore-auth/api-client'
import { useAuthStore } from '@asteby/metacore-auth/store'

export const api = createApiClient({
  baseURL: '/api',
  getToken: () => useAuthStore.getState().auth.accessToken,
})
```

## Realtime, webhooks & notificaciones

| Package | Ver. | Qué hace |
|---|---|---|
| `@asteby/metacore-websocket` | <Badge type="tip" text="0.4.0" /> | Provider WebSocket — auto-reconnect, mensajes tipados, suscripciones a canales. |
| `@asteby/metacore-notifications` | <Badge type="tip" text="7.0.0" /> | Dropdown de notificaciones, badge de app, updates en tiempo real por WebSocket. |
| `@asteby/metacore-webhooks` | <Badge type="tip" text="6.0.0" /> | UI de gestión de webhooks — list, create, logs, test/replay, signing secrets. |

```bash
pnpm add @asteby/metacore-websocket @asteby/metacore-notifications
```

## PWA, billing & marketplace

| Package | Ver. | Qué hace |
|---|---|---|
| `@asteby/metacore-pwa` | <Badge type="tip" text="0.3.1" /> | Helpers PWA — wrapper de plugin Vite, prompts de install/update, push, indicador offline. |
| `@asteby/metacore-billing` | <Badge type="tip" text="0.2.0" /> | Estado de suscripción, hooks de Stripe checkout/portal, y la UI `BillingSettings`. |
| `@asteby/metacore-marketplace` | <Badge type="tip" text="0.1.0" /> | Cliente de catálogo Hub + install/upgrade, hooks React, UI headless para descubrir addons. |

```tsx
import { MarketplaceClient } from '@asteby/metacore-marketplace'
```

## Tooling, CLI & starter

| Package | Ver. | Qué hace |
|---|---|---|
| `@asteby/metacore-tools` | <Badge type="tip" text="4.0.0" /> | Cliente TypeScript para el runtime de Tools del kernel (tools triggereadas por LLM). |
| `@asteby/metacore-starter-config` | <Badge type="tip" text="2.2.1" /> | Config compartida Vite + Tailwind 4 + TanStack Router + ESLint + TS (incl. `metacoreOptimizeDeps`). |
| `@asteby/metacore-starter-monaco` | <Badge type="tip" text="0.2.0" /> | Wrapper opt-in del editor Monaco — mantiene el bundle de ~2 MB fuera de apps que no embeben un editor. |
| `@asteby/create-metacore-app` | <Badge type="tip" text="0.5.1" /> | `npm create @asteby/metacore-app` — scaffoldea un host completo desde un example. |
| `@asteby/create-metacore-addon` | <Badge type="tip" text="0.1.0" /> | Scaffoldea un proyecto de addon nuevo. |

La CLI de build de addons es la **herramienta Go `metacore`**:

```bash
go install github.com/asteby/metacore-sdk/cli@latest
metacore init my-addon   # después: validate · build · sign · publish
```

## Primitivos de federation

Cuando un addon trae UI bespoke, el host la carga en runtime — sin rebuild. Los entry points reales:

```tsx
import {
  loadFederatedAddon,        // carga un remote federado en runtime
  registerActionComponent,   // registra un modal/componente custom para una action
  getActionComponent,        // resuelve un componente de action registrado
} from '@asteby/metacore-runtime-react'
```

::: info Las versiones se mueven rápido
Renovate mantiene cada dependencia `@asteby/metacore-*` en el último patch/minor automáticamente — las versiones de arriba son una foto puntual. Las [docs del SDK](https://asteby.github.io/metacore-sdk/) siguen los números vivos y la API completa.
:::

## Dónde seguir

- [Presentamos v3](/es/v3) — el contrato que renderizan estos packages.
- [Construir un host](/es/getting-started/build-a-host) — cableá el suite en una app.
- [Docs del SDK ↗](https://asteby.github.io/metacore-sdk/) — cada package, cada export.
