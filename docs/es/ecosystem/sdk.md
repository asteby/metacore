# SDK

[`asteby/metacore-sdk`](https://github.com/asteby/metacore-sdk) es la mitad TypeScript de Metacore: el schema del manifest, el formato del bundle, el runtime React, la CLI y un set de primitivos de UI que leen metadata del kernel y renderizan componentes tipados.

## Qué provee

El SDK publica **16 packages npm** bajo el scope `@asteby/metacore-*`. Se dividen en tres ejes:

### Contratos

| Package | Qué es |
|---|---|
| `@asteby/metacore-manifest` | El schema del manifest (Zod), validadores, tipos |
| `@asteby/metacore-bundle` | Formato del bundle, firma, verificación |
| `@asteby/metacore-types` | Tipos TypeScript compartidos usados a través del runtime y la CLI |

### Runtime (browser)

| Package | Qué es |
|---|---|
| `@asteby/metacore-runtime-core` | Cliente framework-agnóstico: HTTP, WebSocket, capa de query |
| `@asteby/metacore-runtime-react` | Bindings React: provider, hooks, `<DynamicTable>`, `<DynamicForm>` y compañía |
| `@asteby/metacore-forms` | Primitivos de form + el renderizador dinámico de formularios |
| `@asteby/metacore-tables` | Primitivos de tabla + el renderizador dinámico de tablas |
| `@asteby/metacore-dialogs` | Primitivos de modal / drawer cableados a flujos de acción / confirmación |
| `@asteby/metacore-navigation` | Helpers de sidebar / breadcrumb / route manejados por metadata de addons |
| `@asteby/metacore-charts` | Primitivos de chart que consumen agregaciones de CRUD dinámico |
| `@asteby/metacore-icons` | Set de iconos usado por el resto del SDK |
| `@asteby/metacore-theme` | Design tokens, dark mode, source export para Tailwind v4 |
| `@asteby/metacore-i18n` | Helpers de traducción; los addons declaran strings, el runtime los resuelve |
| `@asteby/metacore-realtime` | Helpers de suscripción WebSocket, usados por los hooks React |

### Autoría

| Package | Qué es |
|---|---|
| `@asteby/metacore-cli` | El comando `metacore-sdk` — scaffold, build, sign, publish addons |
| `@asteby/metacore-test-utils` | Test harnesses para addons (mock kernel, fixture data) |

(El conteo y los nombres exactos de packages siguen [las docs del SDK](https://asteby.github.io/metacore-sdk/) — esta tabla es un inventario de alto nivel.)

## Qué agarrás

Para la mayoría de los constructores de apps, solo dos packages son dependencias directas:

```bash
pnpm add @asteby/metacore-runtime-react @asteby/metacore-runtime-core
```

Todo lo demás es una dep transitiva, alcanzada vía los exports del runtime.

## Quickstart de la CLI

```bash
pnpm dlx @asteby/metacore-cli init my-addon --template=basic
pnpm metacore-sdk build
pnpm metacore-sdk install ./dist/my-addon-0.1.0.mcbundle --host=http://localhost:8080
```

Mirá [Construir un addon](/es/getting-started/build-an-addon) para el walkthrough completo.

## Stack

- **TypeScript 5.5+**
- **React 18+**
- **Zod** para validación de schema en runtime
- **TanStack Query** por debajo para data fetching
- **Vite** como build tool de referencia para hosts (el SDK mismo es framework-agnóstico en la capa core)
- Compatible con **Tailwind v4** — el package theme exporta directivas `@source`

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
