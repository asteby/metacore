# Por qué Metacore

La mayoría de las herramientas internas se construyen dos veces: una como un admin hecho a mano (handlers REST, una página de listado, un formulario de edición, chequeos de roles dispersos por todo el codebase) y de nuevo, seis meses después, cuando el schema ya divergió y tres personas copiaron la misma lista paginada.

Metacore reemplaza ese loop con un único artefacto declarativo — el **manifest** — y un runtime que lo consume. El kernel maneja persistencia, validación, permisos y sincronización en tiempo real; el SDK renderiza la UI desde el mismo schema. Agregás una columna, el formulario gana un campo. Agregás una capability, todas las capas la aplican.

Esta página trata sobre qué te compra eso, cuánto cuesta y dónde no encaja.

## Qué no tenés que escribir

| Tema | Sin Metacore | Con Metacore |
|---|---|---|
| Migraciones de schema | Archivos `up`/`down` escritos a mano, mantenidos en sync con el código | Derivadas de `manifest.tables[]`, ejecutadas por el instalador |
| Handlers REST | Uno por recurso × cinco verbos (list, get, create, update, delete) | Montados automáticamente desde el manifest |
| OpenAPI / metadata | Mantenida aparte, diverge | Servida desde `_meta/columns`, siempre coincide con el schema |
| UI de list / edit / create / delete | Formularios custom, tablas custom, repetidos 20× | `<DynamicTable>` + `<DynamicForm>` lee la misma metadata |
| Paginación, ordenamiento, filtrado | Re-implementado por página | Built-in en el runtime |
| Validación | Duplicada en cliente + server | Declarada una vez en el manifest, aplicada en ambos lados |
| Middleware de permisos | Chequeos `if user.has(role)` dispersos | Capability-driven, aplicado por el kernel |
| Logs de auditoría | Agregar líneas en cada handler | Emitidos por el runtime |
| Sincronización en tiempo real | Plumbing WebSocket custom | Hub built-in, un método para empujar |
| Multi-tenancy | `WHERE org_id = ?` manual en todos lados | Aplicado por la capa de CRUD dinámico |

El patrón es consistente: cualquier cosa que pueda leerse del manifest, el runtime la posee. Solo escribís código donde realmente lo necesitás.

## Qué te queda

Metacore tiene opiniones sobre el plumbing, no sobre el comportamiento. Vos seguís siendo dueño de:

- **Validadores custom.** Las reglas declaradas en el manifest cubren largo, tipo, regex, requerido; cualquier cosa más allá es un validador Go que registrás en el addon.
- **Acciones custom.** Los botones que no son CRUD viven en `manifest.actions[]`. El runtime cablea la route y la UI; el cuerpo es tuyo.
- **Lógica de dominio.** Pricing, scheduling, llamadas a IA, side effects, integraciones — tu código, Go plano dentro del addon.
- **Escape hatches.** Cuando la metadata no alcanza, caés a registración directa de handlers en el kernel. El SDK no se mete entre vos y la base de datos; solo elimina el cableado.
- **El runtime mismo.** El kernel es una librería que embebés, no un SaaS. Corre en tu infraestructura, dentro de tu binario.

## Para quién es

- **Herramientas internas.** Apps tipo ERP, CRMs, ticketing, moderación de contenido, revisión de datos. Cualquier lugar donde un problema con forma de CRUD aparece una y otra vez.
- **Paneles de admin.** Side panels para un producto existente, donde querés consistencia y cero boilerplate por tabla.
- **SaaS multi-tenant.** El runtime trata a las organizaciones como un scope de primera clase; los addons heredan el límite.
- **Superficies de workflow / automatización.** Las acciones del manifest + eventos WebSocket componen UIs de orquestación sin cableado ad-hoc.

## Para quién no es

- **Apps puramente consumer con UX a medida.** Si cada pantalla tiene un layout único que pelea contra la metadata, vas a pasar más tiempo derrotando al runtime que usándolo.
- **Pipelines de datos puros.** Metacore es request/response + UI. Para batch ETL, usá un job runner; el manifest no ayuda ahí.
- **Scripts one-off.** Levantar un kernel para una herramienta de 200 líneas es overkill; agarralo cuando la misma forma se repite.

## Cómo se compara?

| Herramienta | Qué es | Dónde difiere Metacore |
|---|---|---|
| **Retool** | Builder de herramientas internas hosteado como SaaS, UI drag-and-drop | Librería open-source que embebés; manifest declarativo en version control; corre en tu infra |
| **Refine** | Framework React para paneles de admin con data providers pluggables | Agrega un runtime: schema, permisos y migraciones se definen y aplican server-side, no solo se renderizan client-side |
| **Forest Admin** | Capa de admin SaaS sobre tu base de datos existente | Manifest-first en lugar de introspección de DB; los addons son versionados y hot-swappables; ejecución WASM aislada |
| **Strapi** | CMS headless con un builder de content types | Apuntado a apps de negocio modulares, no a contenido; los addons componen, el modelo de capabilities es de primera clase |
| **Directus** | Admin de introspección de DB + REST/GraphQL | El schema vive en el manifest del addon, no en la DB; composición multi-addon; sandbox WASM para código no confiable |
| **tRPC / Hono / Gin** | Frameworks RPC / HTTP | Ortogonal — Metacore usa uno de estos por debajo. Agrega la capa declarativa de schema + UI por encima |

La versión corta: **Metacore es el único con un contrato de addon versionado, aislado y hot-installable que maneja tanto el backend como la UI desde el mismo manifest.** Cualquier otra herramienta clava una o dos de esas, no todas.

## Anti-features

Algunas cosas que Metacore deliberadamente no hace:

- **Sin builder GUI.** Los manifests son JSON en tu repo; no hay drag-and-drop. Es a propósito — mantiene la fuente de verdad revisable y diffable.
- **Sin introspección de DB.** El manifest define el schema; el schema no define el manifest. Hacer reverse-engineering desde una base de datos produce contratos con pérdida.
- **Sin magia en runtime.** El kernel solo hace lo que dice el manifest. Si algo está mal, el manifest está mal; no hay otro lado dónde mirar.

## Siguiente

- [Arquitectura](/es/architecture) — cómo encajan las cuatro capas.
- [Elegí tu camino](/es/getting-started/) — quickstart según tu rol.
- [Concepto de manifest](/es/concepts/manifest) — el contrato en detalle.
