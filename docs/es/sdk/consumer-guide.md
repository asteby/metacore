# Guía del consumidor — integrando `@asteby/metacore-*`

Guía para apps que consumen el Metacore SDK — aplicaciones host como paneles de operador, superficies de marketplace + admin, portales de cliente, herramientas internas, o cualquier otro frontend Vite + React. Cubre instalación, el patrón de desarrollo mixto npm/`file:`, setup de Vite + Tailwind 4, deploy, y cómo recibir updates automáticas vía Renovate.

## Tabla de contenidos

- [1. Instalar packages](#1-instalar-packages)
- [2. Montar providers](#2-montar-providers)
- [3. Usar los building blocks](#3-usar-los-building-blocks)
- [3.1. Configurar `<DynamicTable>` en tu app](#31-configurar-dynamictable-en-tu-app)
- [4. Patrón mixto npm + `file:` para desarrollo local](#4-patrón-mixto-npm--file-para-desarrollo-local)
- [5. Vite — `metacoreOptimizeDeps`](#5-vite--metacoreoptimizedeps)
- [6. Tailwind 4 — directivas `@source`](#6-tailwind-4--directivas-source)
- [7. Deploy](#7-deploy)
- [8. Template de Renovate](#8-template-de-renovate)
- [9. Upgrades manuales](#9-upgrades-manuales)

## 1. Instalar packages

Todos los packages de Metacore están publicados bajo el scope npm `@asteby`. Instalá solo lo que necesitás — están diseñados para ser componibles, no todo-o-nada.

```bash
pnpm add \
  @asteby/metacore-theme \
  @asteby/metacore-ui \
  @asteby/metacore-auth \
  @asteby/metacore-runtime-react \
  @asteby/metacore-i18n \
  @asteby/metacore-websocket \
  @asteby/metacore-notifications

pnpm add -D @asteby/metacore-starter-config
```

Las peer dependencies (`react`, `react-dom`, librerías TanStack, Tailwind 4) ya deberían estar en tu app. Los packages las declaran como peers para que no tengas instancias de React duplicadas.

| Package | Propósito |
| --- | --- |
| `@asteby/metacore-theme` | Design tokens, variables CSS, preset Tailwind 4. |
| `@asteby/metacore-ui` | Componentes headless + estilizados (DataTable, layout shell, command menu, diálogos). |
| `@asteby/metacore-auth` | `AuthProvider`, `AuthGuard`, hooks de session, páginas de sign-in/up. |
| `@asteby/metacore-runtime-react` | Stack de provider raíz, gates de capabilities, loader federado de addons. |
| `@asteby/metacore-i18n` | Factory i18next, bundles base ES/EN, language switcher, RTL. |
| `@asteby/metacore-websocket` | Provider WebSocket con auto-reconexión y mensajes tipados. |
| `@asteby/metacore-notifications` | Dropdown de notificaciones + badge de app cableados a WebSocket. |
| `@asteby/metacore-starter-config` | Presets de Vite, TS, Tailwind, ESLint usados por cada host. |

## 2. Montar providers

Envolvé tu app una vez en la raíz. El árbol exacto depende de qué packages adoptes; este es el orden canónico para un stack completo:

```tsx
// src/main.tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from '@tanstack/react-router'
import { I18nextProvider } from 'react-i18next'
import { DirectionProvider } from '@asteby/metacore-i18n'
import { AuthProvider } from '@asteby/metacore-auth'
import { WebSocketProvider } from '@asteby/metacore-websocket'

import { router } from './router'
import { i18n } from './i18n'
import './styles/app.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nextProvider i18n={i18n}>
      <DirectionProvider language={i18n.language}>
        <AuthProvider>
          <WebSocketProvider url={import.meta.env.VITE_WS_URL} getToken={getToken}>
            <RouterProvider router={router} />
          </WebSocketProvider>
        </AuthProvider>
      </DirectionProvider>
    </I18nextProvider>
  </StrictMode>,
)
```

El orden importa: i18n más afuera (para que la UI de auth tome traducciones), auth después (para que las queries y el WebSocket vean la session), router más adentro (para que los providers no se re-monten al navegar).

## 3. Usar los building blocks

```tsx
import { DataTable, type ColumnDef } from '@asteby/metacore-ui'

type User = { id: string; name: string; email: string }

const columns: ColumnDef<User>[] = [
  { accessorKey: 'name', header: 'Name' },
  { accessorKey: 'email', header: 'Email' },
]

export function UsersPage({ data }: { data: User[] }) {
  return (
    <DataTable columns={columns} data={data} pagination selection />
  )
}
```

Ver el README de cada package para la superficie completa — [`packages/ui`](https://github.com/asteby/metacore-sdk/tree/main/packages/ui), [`packages/auth`](https://github.com/asteby/metacore-sdk/tree/main/packages/auth), [`packages/runtime-react`](https://github.com/asteby/metacore-sdk/tree/main/packages/runtime-react), y demás.

## 3.1. Configurar `<DynamicTable>` en tu app

`<DynamicTable model="..." />` es la pieza central del runtime: un componente renderiza una superficie CRUD completa desde metadata servida por el kernel. Tres providers tienen que estar montados antes de que funcione.

```tsx
// src/main.tsx — extensión del árbol de arriba
import { ApiProvider, CapabilityProvider } from '@asteby/metacore-runtime-react'
import { api } from './lib/api'                  // tu instancia de axios

createRoot(document.getElementById('root')!).render(
  <I18nextProvider i18n={i18n}>
    <DirectionProvider language={i18n.language}>
      <AuthProvider>
        <ApiProvider client={api}>
          <CapabilityProvider capabilities={session.capabilities}>
            <WebSocketProvider url={import.meta.env.VITE_WS_URL} getToken={getToken}>
              <RouterProvider router={router} />
            </WebSocketProvider>
          </CapabilityProvider>
        </ApiProvider>
      </AuthProvider>
    </DirectionProvider>
  </I18nextProvider>,
)
```

Después montá la tabla en cualquier route:

```tsx
// src/routes/tickets.tsx
import { DynamicTable } from '@asteby/metacore-runtime-react'

export function TicketsPage() {
  return <DynamicTable model="tickets" />
}
```

Si la instancia `i18n` no tiene las keys `datatable.*` y `common.*` que el runtime usa, los headers y labels de paginación renderizan como keys raw. Copiá la lista de keys desde [`packages/ui/README.md`](https://github.com/asteby/metacore-sdk/tree/main/packages/ui#i18n) a tus bundles o pre-traducí los labels de columna en una factory `getDynamicColumns` custom.

Para un deep dive sobre cada prop, cell renderers custom, gating de capabilities, dispatchers de acción y el cache de metadata, ver [`dynamic-ui.md`](./dynamic-ui).

## 4. Patrón mixto npm + `file:` para desarrollo local

La mayoría de las apps consumidoras instalan packages de Metacore desde npm y dejan que Renovate los mantenga sincronizados. Algunos packages — típicamente los que están bajo iteración activa — se consumen vía referencias `file:` contra un clon hermano de `metacore-sdk` para que los cambios se propaguen sin un round-trip de publicación:

```jsonc
// package.json
{
  "dependencies": {
    "@asteby/metacore-theme": "^0.3.0",
    "@asteby/metacore-ui": "^0.6.0",
    "@asteby/metacore-auth": "^4.0.0",

    "@asteby/metacore-runtime-react": "file:../metacore-sdk/packages/runtime-react",
    "@asteby/metacore-tools": "file:../metacore-sdk/packages/tools"
  }
}
```

Cuando usás `file:`:

- El `dist/` del package del que dependés tiene que estar **buildeado localmente** — está gitignored. Corré `pnpm --filter @asteby/metacore-runtime-react build` adentro de `metacore-sdk` antes de instalar.
- pnpm symlinkea la dependencia, así que un rebuild en `metacore-sdk` se refleja inmediatamente en el consumidor.
- Siempre apuntá a un path de clon hermano (`../metacore-sdk/...`) — los paths relativos son estables entre máquinas si cada contributor organiza su workspace de la misma manera.

Volvé un package a un rango semver de npm apenas aterrize una release. Las refs `file:` largas derivan y causan fallas de CI tipo "anda en mi máquina".

## 5. Vite — `metacoreOptimizeDeps`

El pre-bundler de dependencias de Vite no crawlea packages `file:` por defecto, lo que produce chunks viejos e instancias inconsistentes de React cuando los packages del SDK se re-exportan unos a otros. `@asteby/metacore-starter-config` (>= 0.3.0) incluye un helper que cablea esto correctamente:

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import tailwindcss from '@tailwindcss/vite'
import { metacoreOptimizeDeps } from '@asteby/metacore-starter-config/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  optimizeDeps: metacoreOptimizeDeps(),
  resolve: {
    alias: { '@': new URL('./src', import.meta.url).pathname },
  },
})
```

`metacoreOptimizeDeps()` devuelve un objeto Vite `OptimizeDepsOptions` que incluye cada package `@asteby/metacore-*` y fuerza React a una sola instancia. Si también usás `defineMetacoreConfig()` del mismo package, esto se aplica por vos.

## 6. Tailwind 4 — directivas `@source`

Tailwind 4 escanea el glob `content` de tu app para decidir qué utilities llegan al bundle. Como los packages del SDK viven bajo `node_modules/`, sus clases son omitidas por defecto y tu build silenciosamente pierde estilos (lo más visible: `DataTable`, command menu, layout shell). Declará los packages del SDK como sources adicionales en tu stylesheet principal:

```css
/* src/styles/app.css */
@import '@asteby/metacore-theme/index.css';

@source "../../node_modules/@asteby/metacore-ui/dist/**/*.{js,mjs}";
@source "../../node_modules/@asteby/metacore-runtime-react/dist/**/*.{js,mjs}";
@source "../../node_modules/@asteby/metacore-auth/dist/**/*.{js,mjs}";
@source "../../node_modules/@asteby/metacore-notifications/dist/**/*.{js,mjs}";
@source "../../node_modules/@asteby/metacore-webhooks/dist/**/*.{js,mjs}";
```

Ajustá el path relativo para que coincida con el layout de tu repo. Agregá una línea `@source` por cada package del SDK cuyos componentes renderizás. Sin esto, clases como `bg-primary` o `data-[state=open]` de los componentes del SDK se podan y tu UI se ve sin estilo en producción.

## 7. Deploy

Si solo usás packages publicados en npm, tu build es un `pnpm install && pnpm build` vanilla.

Si tu app usa cualquier referencia `file:`, los packages del SDK tienen que ser buildeados **antes** de que corra el bundler del consumidor. Dos patrones:

**Monorepo Turbo (recomendado).** Agregá `metacore-sdk` a tu workspace y dejá que Turbo resuelva el orden de build:

```jsonc
// turbo.json (root)
{
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**"]
    }
  }
}
```

```bash
turbo build --filter=my-app
```

Turbo buildea primero los packages upstream del SDK, después la app.

**Clon externo.** Si el SDK es un clon hermano (no miembro del workspace), buildeá los packages relevantes en tu CI antes de instalar la app:

```yaml
- run: pnpm --filter @asteby/metacore-runtime-react... -C ../metacore-sdk build
- run: pnpm install --frozen-lockfile=false
- run: pnpm build
```

Un workflow de GitHub Actions de un repo host que buildea el SDK antes de instalar la app es una referencia funcional para este patrón.

## 8. Template de Renovate

Una vez que Metacore publica una nueva versión, tu app debería tomarla sin que nadie abra un issue. Dropeá [`renovate-consumer-template.json`](./renovate-consumer-template.json) en la raíz de tu repo consumidor como `renovate.json`:

```bash
curl -o renovate.json \
  https://raw.githubusercontent.com/asteby/metacore-sdk/main/docs/renovate-consumer-template.json
```

Después commiteá. Asegurate de que la [Renovate GitHub App](https://github.com/apps/renovate) esté instalada en tu repo.

Lo que esto te da:

- **Bumps de patch / minor** de cualquier package `@asteby/metacore-*`: Renovate abre un PR y lo auto-mergea cuando CI está verde (`automerge: true` + `platformAutomerge: true`). Aterriza minutos después de la publicación.
- **Bumps mayores**: Renovate abre un PR y le asigna el reviewer que elijas (cambiá `@tech-lead` en el template). Revisá, corré la app, mergeá manualmente.
- **Schedule `at any time`**: las updates de Metacore fluyen continuamente — sin batching de lunes.

Podés extender el template con reglas específicas de la app. Mantené las reglas de `@asteby/metacore-*` intactas para que la propagación se mantenga predecible entre todas las apps consumidoras.

## 9. Upgrades manuales

Si necesitás una versión específica antes de que Renovate la tome:

```bash
pnpm up "@asteby/metacore-*@latest"
```

O para un canal pre-release:

```bash
pnpm up "@asteby/metacore-*@next"
```

Ver [`publishing.md`](./publishing) para la semántica de canales.
