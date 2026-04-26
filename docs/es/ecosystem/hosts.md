# Hosts

Un **host** es un producto construido sobre el kernel + SDK que expone los addons instalados a los usuarios. El kernel corre los addons; el host es todo lo que los rodea — auth, layout, branding, billing, cualquier cosa que no sea trabajo del addon.

Metacore deliberadamente no publica un host. Los hosts son donde vive tu producto, y varían por audiencia, vertical e intención. Esta página explica qué es un host, qué formas puede tomar y qué te dan el kernel + SDK para construir uno.

[[toc]]

## El contrato

Cada host, sin importar su forma, tiene las mismas tres responsabilidades:

1. **Embeber el kernel.** Un binario Go importa `metacore-kernel` y monta sus rutas. Todo lo que tiene forma de CRUD — list, get, create, update, delete, metadata, tiempo real — viene del kernel.
2. **Renderizar UIs de addons.** Un frontend Vite + React importa `@asteby/metacore-runtime-react` y usa `<DynamicTable>`, `<DynamicForm>`, `<DynamicDetail>` y `<Slot>` para renderizar cualquier addon que esté instalado.
3. **Proveer identidad, layout y marca.** Auth, shell de navegación, theming y cualquier pantalla que no sea de addon (login, settings, billing, etc.).

Todo lo demás — las pantallas por addon, el schema, los chequeos de permisos, el lifecycle — lo manejan el kernel y el SDK leyendo el manifest. Un host no tiene código por addon.

## Formas comunes de host

Los hosts varían mucho por audiencia e intención. Algunos patrones se repiten lo suficiente como para nombrarlos:

### Panel de operador

Para equipos internos usando los addons instalados día a día: listas, formularios, dashboards, botones de acción. Los operadores se loguean, ven los addons que tienen permiso de usar, hacen click en uno y trabajan con él.

Features típicos específicos a esta forma:

- Integración de identidad + SSO con el directorio del operador
- Layout estandarizado de sidebar / breadcrumb / búsqueda
- Operaciones masivas a través de límites de addon
- Vistas guardadas, favoritos, recientes

### Marketplace + admin

Para las personas responsables de qué addons existen y cómo están configurados. Discovery, install, upgrade, billing, audit y configuración de addons pasan acá.

Features típicos específicos a esta forma:

- Browser / búsqueda de bundles
- Flujos de install + upgrade + uninstall con preview de diff
- Explorador de log de auditoría
- Manejo de permisos (roles, grants)
- Administración de org / tenant
- Billing + entitlement (cuando aplique)

### Portal cara al cliente

Para end-users (no operadores). Frecuentemente emparejado con copy de marketing, una superficie más restringida y branding más ajustado que un panel interno. Típico para productos SaaS que exponen features manejados por addons a sus propios clientes.

### Admin embebido

Una sección "settings" o "admin" dentro de un producto existente. La aplicación host ya existe; el área con Metacore es una route más. Útil cuando una SaaS existente quiere CRUD modular sin reescribirse.

### UX por vertical

Healthcare, fintech, logística, educación y otros dominios frecuentemente tienen expectativas de UX fuertes — tabular, conversacional, dashboard-heavy, document-centric. Un host puede adaptarse a las convenciones del vertical y al mismo tiempo delegar cada pantalla por addon al SDK.

## Lo que cada host obtiene gratis

Independientemente de la forma, el kernel + SDK proveen:

- **Endpoints CRUD dinámicos.** Sin código de handler por recurso.
- **Migraciones de schema.** Manejadas por el manifest del addon, ejecutadas por el instalador.
- **Aplicación de permisos.** Chequeos de capability y permisos por usuario sobre recursos, aplicados en cada llamada.
- **Lifecycle.** Hot install, upgrade, uninstall — sin reinicio.
- **Sandbox WASM.** El código de addon no confiable corre aislado.
- **Fanout en tiempo real.** Hub WebSocket montado automáticamente.
- **Primitivos de UI tipados.** `<DynamicTable>`, `<DynamicForm>`, `<DynamicDetail>`, `<Slot>`, más 12+ packages de soporte (forms, dialogs, navigation, charts, theme, etc.).
- **Pipe de auditoría.** Stream estructurado de cada op CRUD, chequeo de capability y decisión de permiso.

Un host típico tiene **400–800 líneas** de código en total: layout, navegación, pantallas de auth, más configuración. Todo lo demás viene del SDK + el kernel.

## Lo que un host *no* posee

- **El modelo de datos.** Eso es el manifest del addon.
- **Los endpoints CRUD.** El kernel los monta.
- **La UI CRUD.** El SDK la renderiza.
- **El sistema de permisos.** El kernel lo aplica.
- **El fanout en tiempo real.** El hub del kernel lo maneja.

Los hosts son deliberadamente delgados. El leverage que provee Metacore viene de *no* tener que escribir esto.

## Construí uno

La receta está en [Construir un host](/es/getting-started/build-a-host). Versión corta:

1. **Backend.** Un binario Go que importa `metacore-kernel` y agrega tus endpoints de auth + negocio.
2. **Frontend.** Una app Vite + React que importa `@asteby/metacore-runtime-react` y renderiza UIs de addons vía `<DynamicTable>`, `<DynamicForm>` y `<Slot>`.
3. **Identidad.** Tu elección de auth; inyectá `kernel.Identity` en cada request vía middleware.
4. **Marca.** El package theme del SDK expone design tokens; sobreescribilos para matchear tu producto.

## Relacionado

- [Construir un host](/es/getting-started/build-a-host) — receta completa.
- [Arquitectura](/es/architecture) — cómo encajan los hosts entre el kernel y la superficie.
- [Kernel](/es/ecosystem/kernel) — lo que los hosts embeben.
- [SDK](/es/ecosystem/sdk) — lo que consumen los frontends de host.
