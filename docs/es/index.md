---
layout: home
title: Home

hero:
  name: "Metacore"
  text: "Addons declarativos.\nUI sin pegamento."
  tagline: "Construí un addon CRUD, obtené una app multi-tenant funcional — sin escribir el cableado."
  image:
    src: /logo.svg
    alt: Metacore
  actions:
    - theme: brand
      text: Empezar
      link: /es/getting-started/
    - theme: alt
      text: Novedades de v3
      link: /es/v3
    - theme: alt
      text: Arquitectura
      link: /es/architecture
    - theme: alt
      text: GitHub
      link: https://github.com/asteby

features:
  - title: Manifest, no boilerplate
    details: Declará tablas, columnas, capabilities y acciones en un solo archivo JSON. Obtené migraciones, endpoints REST, metadata y una UI tipada gratis.
    icon: 📜
  - title: Seguridad capability-first
    details: Los permisos son parte del contrato del addon. El kernel los aplica en cada llamada CRUD, la UI restringe componentes automáticamente.
    icon: 🔒
  - title: Sandbox WASM
    details: Los addons corren aislados en wazero. Se acabó vendorear código Go no confiable dentro de tu binario.
    icon: 🦀
  - title: Hot install
    details: Soltá un bundle firmado, el instalador migra el schema, monta los handlers, registra la metadata de UI. Sin reinicio.
    icon: ⚡
  - title: Tiempo real por defecto
    details: Un hub WebSocket es parte del runtime. Empujá cambios CRUD y eventos custom a los clientes con una sola llamada.
    icon: 📡
  - title: Dos repos, una plataforma
    details: El kernel corre el runtime en Go. El SDK declara el contrato en TypeScript. El portal en el que estás los conecta.
    icon: 🧱
---

## Qué es Metacore?

Metacore es un runtime + SDK para construir aplicaciones de negocio modulares y multi-tenant a partir de pequeños addons declarativos. El **kernel** es una librería Go que embebés en tu app: posee el schema de la base de datos, la superficie REST, los permisos, el lifecycle y un hub WebSocket. El **SDK** es un set de packages npm: te deja describir un addon — sus modelos, capabilities y UI — en un solo `manifest.json` (el **Module Contract v3**), y renderiza el resultado como una experiencia React tipada dentro de cualquier host.

Juntos, convierten un manifest en una app CRUD funcional. Cualquier host que construyas sobre los mismos primitivos — un panel de operador, un portal de cliente, un admin embebido — la levanta automáticamente.

## El pitch en cuatro líneas

::: code-group

```json [manifest.json]
{
  "apiVersion": "asteby.com/v3",
  "kind": "Addon",
  "metadata": { "key": "tickets", "name": "Tickets", "version": "0.1.0" },
  "capabilities": [
    { "kind": "db:read",  "target": "addon_tickets.*" },
    { "kind": "db:write", "target": "addon_tickets.*" }
  ],
  "models": [{
    "key": "Ticket",
    "table": "tickets",
    "columns": [
      { "name": "id",       "type": "uuid", "primary_key": true, "default": "gen_random_uuid()" },
      { "name": "title",    "type": "text", "not_null": true },
      { "name": "status",   "type": "text", "default": "'open'" },
      { "name": "assignee", "type": "text" }
    ]
  }]
}
```

```bash [endpoints]
# Montados por el kernel, no se necesita código de handler.
GET    /api/dynamic/tickets
GET    /api/dynamic/tickets/:id
POST   /api/dynamic/tickets
PUT    /api/dynamic/tickets/:id
DELETE /api/dynamic/tickets/:id
GET    /api/metadata/table/tickets
```

```tsx [ui.tsx]
import { DynamicTable } from '@asteby/metacore-runtime-react'

// Lee la misma metadata, obtiene list + paginate + sort + filter.
export default function Tickets() {
  return <DynamicTable model="tickets" />
}
```

:::

Ese es todo el loop. Agregá una columna, la tabla se actualiza. Agregá una capability, el middleware de permisos la aplica. Publicá un bundle, el instalador lo carga en caliente.

## Elegí el punto de entrada correcto

<a class="role-card" href="/metacore/es/getting-started/build-an-addon">
<strong>Estoy construyendo un addon →</strong>
Vos escribís un manifest, el SDK hace el resto. Publicá un `.mcbundle` en cualquier host corriendo el kernel.
</a>

<a class="role-card" href="/metacore/es/getting-started/embed-the-runtime">
<strong>Estoy embebiendo el runtime en mi app Go →</strong>
Soltá el kernel en un server Fiber, obtené CRUD dinámico, permisos y WebSockets out of the box.
</a>

<a class="role-card" href="/metacore/es/getting-started/build-a-host">
<strong>Estoy construyendo un host →</strong>
Un frontend Vite + React sobre un backend Go que monta el kernel. El SDK provee cada primitivo.
</a>

### O saltá directo a la documentación profunda

<a class="role-card" href="/metacore/es/sdk/">
<strong>Referencia del SDK →</strong>
Los packages npm publicados, el spec del manifest, UI dinámica, el cookbook, capabilities, publicación.
</a>

<a class="role-card" href="/metacore/es/kernel/">
<strong>Referencia del Kernel →</strong>
Embeber el runtime, el framework de CRUD dinámico, la API HTTP, permisos y setup para contribuidores.
</a>

## Qué está abierto

Los dos repositorios de Metacore son públicos y Apache-2.0:

| Repo | Qué es |
|---|---|
| [`asteby/metacore-kernel`](https://github.com/asteby/metacore-kernel) | El runtime Go. Sandbox WASM, CRUD dinámico, permisos, lifecycle, WebSockets. |
| [`asteby/metacore-sdk`](https://github.com/asteby/metacore-sdk) | El SDK TypeScript y la CLI. Schema del manifest, runtime React, scaffolder de addons. |
| [`asteby/metacore`](https://github.com/asteby/metacore) | Este portal. Solo documentación. |

El kernel y el SDK cada uno trae su propia documentación profunda — este sitio te dirige a la correcta y explica la plataforma de punta a punta.
