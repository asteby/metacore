<p align="center">
  <img src="/logo.svg" width="120" alt="Metacore SDK" />
</p>

<h1 align="center">Metacore SDK</h1>

<p align="center"><em>El framework declarativo de addons — manifests, UI dinámica y un runtime tipado para construir hosts React modulares.</em></p>

El **Metacore SDK** es un monorepo TypeScript publicado como packages npm `@asteby/metacore-*`. Declarás un addon en un `manifest.json`, y el SDK provee todo lo necesario para renderizarlo dentro de una app host: un loader federado, un `<DynamicTable>` manejado por metadata, un kit de auth, un bundle de i18n, una librería de UI, themes, plomería WebSocket en tiempo real, y un scaffolder que cablea todo junto.

## Links rápidos

- [Inicio rápido](./quickstart) — tu primer addon en 5 minutos.
- [UI dinámica](./dynamic-ui) — todos los componentes del runtime, con sus props.
- [Recetario](./addon-cookbook) — recetas para patrones comunes.
- [Especificación del manifest](./manifest-spec) — cada campo de `manifest.json`.
- [Capabilities](./capabilities) — el sandbox declarativo.
- [Guía del consumidor](./consumer-guide) — integrar el SDK en una app host.
- [Publicación](./publishing) — flujo de release npm para los packages del SDK.
- [WASM ABI](./wasm-abi) — cuando necesitás lógica server-side con TinyGo.

## Packages

El SDK incluye **16 packages** bajo el scope `@asteby`. La mayoría de las apps consumen `runtime-react`, `ui`, `auth`, `theme` y `starter-config`; el resto es opcional.

| Package | Qué hace |
|---|---|
| [`@asteby/metacore-sdk`](https://github.com/asteby/metacore-sdk/tree/main/packages/sdk) | Loader federado de addons, registro de slots, manifest tipado y cliente de API. |
| [`@asteby/metacore-runtime-react`](https://github.com/asteby/metacore-sdk/tree/main/packages/runtime-react) | Runtime React — `<DynamicTable>`, `<DynamicModal>`, gates de capabilities, dispatcher de acciones. |
| [`@asteby/metacore-ui`](https://github.com/asteby/metacore-sdk/tree/main/packages/ui) | Kit de UI — data-table, layout shell, command-menu, hooks y primitivos shadcn. |
| [`@asteby/metacore-auth`](https://github.com/asteby/metacore-sdk/tree/main/packages/auth) | Kit de auth — store Zustand, factory de cliente API, páginas de login/signup/forgot, route guards. |
| [`@asteby/metacore-theme`](https://github.com/asteby/metacore-sdk/tree/main/packages/theme) | Design tokens y preset Tailwind 4 (oklch, sombras, fonts, dark mode). |
| [`@asteby/metacore-i18n`](https://github.com/asteby/metacore-sdk/tree/main/packages/i18n) | Factory i18next, bundles base ES/EN, language switcher, provider RTL. |
| [`@asteby/metacore-lib`](https://github.com/asteby/metacore-sdk/tree/main/packages/lib) | Utilidades — formateo de fecha/moneda/número, manejo de errores, cookies. |
| [`@asteby/metacore-app-providers`](https://github.com/asteby/metacore-sdk/tree/main/packages/app-providers) | Providers reutilizables (dirección, font, layout, búsqueda). |
| [`@asteby/metacore-starter-core`](https://github.com/asteby/metacore-sdk/tree/main/packages/starter-core) | Providers, stores, hooks y context compartidos consumidos por cada app Vite+React. |
| [`@asteby/metacore-starter-config`](https://github.com/asteby/metacore-sdk/tree/main/packages/starter-config) | Configs compartidas de build/lint (Vite + React + Tailwind 4 + TanStack Router + ESLint + TS). |
| [`@asteby/metacore-websocket`](https://github.com/asteby/metacore-sdk/tree/main/packages/websocket) | Provider WebSocket — auto-reconexión, mensajes tipados, suscripción a canales. |
| [`@asteby/metacore-notifications`](https://github.com/asteby/metacore-sdk/tree/main/packages/notifications) | Dropdown de notificaciones, badge de app, updates en tiempo real vía WebSocket. |
| [`@asteby/metacore-webhooks`](https://github.com/asteby/metacore-sdk/tree/main/packages/webhooks) | UI de gestión de webhooks — listar, crear, logs, test/replay, secretos de firma. |
| [`@asteby/metacore-pwa`](https://github.com/asteby/metacore-sdk/tree/main/packages/pwa) | Helpers PWA — wrapper de plugin Vite, prompts de install/update, push notifications, indicador offline. |
| [`@asteby/metacore-tools`](https://github.com/asteby/metacore-sdk/tree/main/packages/tools) | Cliente TypeScript para el runtime de Tools del kernel — ejecución, registro, validación client-side. |
| [`create-metacore-app`](https://github.com/asteby/metacore-sdk/tree/main/packages/create-metacore-app) | Scaffolder. `npx create-metacore-app my-app`. |

## Repositorio

El código fuente, issues y releases viven en [`asteby/metacore-sdk`](https://github.com/asteby/metacore-sdk). El SDK es Apache-2.0.

## Combiná con el kernel

El SDK habla el contrato de metadata servido por el [Metacore Kernel](/es/kernel/). Un repo declara el contrato, el otro lo enforce — ambos se publican de forma independiente.
