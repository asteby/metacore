# Construir un host

Un **host** es un producto que se sienta arriba del kernel y expone los addons instalados a los usuarios. Las formas comunes incluyen un panel de operador, una superficie de marketplace + admin, un portal cara al cliente, una herramienta interna o una sección de admin embebida dentro de un producto existente. Construís lo que encaje con tu producto — todos usan los mismos primitivos.

Esta página es una receta. El camino más rápido es arrancar desde el starter oficial y ajustar; las referencias profundas para cada capa viven en las docs del SDK y del kernel.

[[toc]]

## Qué estás construyendo

```
┌────────────────────────────────────────┐
│  frontend de tu host                   │
│  Vite + React + @asteby/metacore-*     │
│  (UI de auth, layout, tu branding)     │
├────────────────────────────────────────┤
│  backend de tu host                    │
│  Binario Go que embebe el kernel       │
│  (auth, billing, integraciones)        │
├────────────────────────────────────────┤
│  metacore-kernel (librería)            │
└────────────────────────────────────────┘
                  │
                  ▼
        addons instalados
```

El host posee la identidad, el layout, el shell de navegación y cualquier pantalla que no sea de un addon. El kernel posee runtime, persistencia, permisos. Los addons poseen las features.

## Arrancá desde el starter oficial

La forma más rápida de llegar a un host funcional es el fullstack starter — `~50 LOC de Go` sobre `host.NewApp()` más un shell React cableado al SDK:

```sh
npm create @asteby/metacore-app my-app -- --example fullstack-starter
cd my-app
docker compose up --build
```

Esto clona el example `fullstack-starter`, pinea las últimas versiones publicadas de `@asteby/metacore-*` y levanta `pgvector/pgvector:pg17` + el backend Go + el frontend Vite. Abrí http://localhost:5173 y logueate con el admin sembrado. El resto de esta página explica qué cablea ese starter para que lo reproduzcas a mano o lo adaptes.

## Prerrequisitos

- **Node.js 20+** y **pnpm 10+** (frontend)
- **Go 1.25+** (backend)
- **PostgreSQL** (producción)

## 1. Backend — embeber el kernel

Un backend de host es la receta de [embeber el runtime](/es/getting-started/embed-the-runtime) más tus endpoints de auth y de negocio. `host.NewApp(host.AppConfig{...})` devuelve el kernel configurado; `app.Mount(fiberApp.Group("/api"))` cablea cada ruta del kernel bajo `/api` y devuelve el group para que cuelgues tus propias rutas. Los modelos first-party se registran en código con `app.RegisterModel(...)`; los addons instalados llegan como bundles.

## 2. Frontend — el app shell del SDK

El `main.tsx` del starter bootstrapea cada provider con un solo componente, `MetacoreAppShell` de `@asteby/metacore-app-providers` (QueryClient, el cliente de API, prompts PWA, toaster e invalidación del metadata-cache), sobre un TanStack Router:

```tsx
import ReactDOM from 'react-dom/client'
import { RouterProvider } from '@tanstack/react-router'
import { MetacoreAppShell } from '@asteby/metacore-app-providers'
import { router, queryClient } from './router'
import { api } from './lib/api'
import './lib/i18n'
import './styles/index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <MetacoreAppShell api={api} queryClient={queryClient}>
    <RouterProvider router={router} />
  </MetacoreAppShell>,
)
```

El cliente de API viene del package de auth — manda el token y el idioma activo para que el kernel pueda localizar la metadata:

```tsx
// lib/api.ts
import { createApiClient } from '@asteby/metacore-auth/api-client'
import { useAuthStore } from '@asteby/metacore-auth/store'
import i18n from './i18n'

export const api = createApiClient({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:7200/api',
  getToken: () => useAuthStore.getState().auth.accessToken,
  getLanguage: () => i18n.language,
  onUnauthorized: () => useAuthStore.getState().auth.reset(),
})
```

Los packages que un host típico usa: `@asteby/metacore-runtime-react` (CRUD dinámico), `@asteby/metacore-auth`, `@asteby/metacore-app-providers`, `@asteby/metacore-ui` (layout shell, command menu, primitives de data-table), `@asteby/metacore-theme`, `@asteby/metacore-i18n`, `@asteby/metacore-websocket`, `@asteby/metacore-notifications`, y opcionalmente `@asteby/metacore-pwa`, `@asteby/metacore-billing`, `@asteby/metacore-marketplace`, `@asteby/metacore-webhooks`.

## 3. La página dinámica

Cada modelo es un one-liner. El starter tiene una sola ruta dinámica, `/_authenticated/m/$model`, que renderiza la página CRUD dirigida por el kernel para el modelo que esté en la URL:

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { DynamicCRUDPage } from '@asteby/metacore-runtime-react'

export const Route = createFileRoute('/_authenticated/m/$model/')({
  component: () => <DynamicCRUDPage model={Route.useParams().model} />,
})
```

`DynamicCRUDPage` es la tabla + diálogos de create/edit/view + actions, todo dirigido por `/api/metadata/table/:model` y `/api/dynamic/:model`. El sidebar se construye desde las contribuciones de navegación de los manifests de los addons — `useNavigation` resuelve el árbol de nav, gateado por usuario. Para aportar React provisto por un addon, renderizá `<Slot name="..." />`.

## 4. Tailwind, CSS, branding

El SDK trae design tokens vía `@asteby/metacore-theme` (preset Tailwind v4, tokens oklch, dark mode). Al consumir los packages del SDK, declaralos como sources de Tailwind para que sus clases utilitarias sobrevivan al purge — si no, las UIs de los addons renderizan sin estilos:

```css
/* styles/index.css */
@import "tailwindcss";
@source "../node_modules/@asteby/metacore-runtime-react";
@source "../node_modules/@asteby/metacore-ui";
```

Este es uno de los pasos más salteados. El `@asteby/metacore-starter-config` del starter trae la config compartida de Vite/Tailwind/TS — incluyendo `metacoreOptimizeDeps`, que Vite necesita para pre-bundlear los packages `@asteby/metacore-*` linkeados.

## 5. Auth + identidad

El kernel se mantiene neutral sobre auth. Un host típico:

1. Hostea su propio sign-in (`@asteby/metacore-auth` trae páginas de login/signup/forgot y guards para TanStack Router).
2. Emite un JWT o sesión.
3. Lo manda en cada request vía el `getToken` del cliente de API.
4. Lo verifica en el backend; el `AuthUserProvider` del kernel resuelve user/org/roles para cada llamada CRUD.

## 6. Checklist de producción

- Terminación HTTPS / TLS frente al binario Go
- Una base de datos real (Postgres) con backups
- Claves de firma de bundles administradas vía tu secret store
- Observabilidad — el kernel expone `/api/metrics`
- Health checks y readiness probes
- Buildeá el frontend con el `VITE_API_URL` correcto para el target (el gotcha de la API relativa/appliance pega acá)

## Formas comunes de host

| Forma | Qué hace |
|---|---|
| **Panel de operador** | Cómo los equipos internos usan los addons instalados día a día — listas, forms, dashboards, botones de action. |
| **Marketplace + admin** | Descubrimiento, install, upgrade, billing, audit, configuración de addons. |
| **Portal cara al cliente** | Superficie de usuario final, a menudo con copy de marketing y un layout más acotado que un panel de operador. |
| **Admin embebido** | Una sección de "settings" o "admin" en un SaaS existente que levanta addons sin código por sección. |
| **UX por vertical** | Un layout a medida de un dominio — salud, fintech, logística, etc. |

Cualquiera sea la forma que construyas, el host es un consumidor puro del SDK con su propia auth + layout. No tiene código por addon.

## Relacionado

- [Embeber el runtime](/es/getting-started/embed-the-runtime) — la mitad backend en detalle.
- [Construir un addon](/es/getting-started/build-an-addon) — lo que tu host va a correr.
- [Hosts](/es/ecosystem/hosts) — formas y patrones de host.
- [Docs del SDK ↗](https://asteby.github.io/metacore-sdk/) — cada componente, cada hook.
