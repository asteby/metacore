# Elegí tu camino

Metacore son dos piezas que se encuentran en el medio. Por dónde empezás depende de qué estás construyendo.

[[toc]]

## Tres roles, tres quickstarts

<a class="role-card" href="/metacore/es/getting-started/build-an-addon">
<strong>Construir un addon →</strong>
Estás publicando un feature — tickets, inventario, bloques de contenido, lo que sea. Escribís un <code>manifest.json</code>, opcionalmente algo de Go para lógica custom, y el SDK construye y firma un <code>.mcbundle</code>. Soltalo en cualquier host corriendo el kernel.
</a>

<a class="role-card" href="/metacore/es/getting-started/embed-the-runtime">
<strong>Embeber el runtime →</strong>
Tenés un servicio Go y querés agregar CRUD modular sin escribir el plumbing. Importá el kernel como librería, montá sus rutas bajo un path, listo.
</a>

<a class="role-card" href="/metacore/es/getting-started/build-a-host">
<strong>Construir un host →</strong>
Querés una aplicación host — un frontend que levanta cualquier addon instalado y lo renderiza. Vite + React + el SDK arriba, kernel abajo.
</a>

## No estás seguro?

Matcheá tu problema con un camino:

| Querés... | Empezá acá |
|---|---|
| Agregar un nuevo recurso (con UI CRUD) a una app existente con Metacore | [Construir un addon](/es/getting-started/build-an-addon) |
| Agregar CRUD modular a un backend Go que todavía no lo tiene | [Embeber el runtime](/es/getting-started/embed-the-runtime) |
| Construir la superficie de operador, de marketplace, o cualquier cosa que hostee addons | [Construir un host](/es/getting-started/build-a-host) |
| Solo entender la plataforma | Leé [Arquitectura](/es/architecture) y volvé |
| Evaluar vs Retool / Refine / Directus | Leé [Por qué Metacore](/es/why) |

## Lo que cada camino necesita

- **Node.js 20+** y **pnpm 10+** para el SDK y cualquier frontend de host.
- **Go 1.22+** para el kernel y cualquier backend de host.
- **Una base de datos.** Postgres para producción, SQLite está bien para desarrollo local. El kernel maneja ambos.
- **Sin cuenta SaaS.** Metacore corre enteramente en tu infraestructura.

## Dónde viven las docs profundas

Este portal termina donde empiezan las docs por herramienta. Para todo lo detallado — cada campo del manifest, cada componente React, cada subsistema del kernel — el link te apunta al sitio de documentación del repo correcto:

- [Docs del SDK](https://asteby.github.io/metacore-sdk/) — spec del manifest, cada package, cada componente.
- [Docs del Kernel](https://asteby.github.io/metacore-kernel/) — API de embedding, internals de subsistemas, modelo de seguridad.
