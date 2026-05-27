# CRUD dinámico

El kernel convierte `manifest.models[]` en una capa REST + UI funcional sin código por tabla. Esta página explica cómo, desde ambos lados — qué hace el runtime en el backend, y qué hace el SDK en el frontend.

[[toc]]

## Por qué merece una página de concepto

CRUD es un problema resuelto a nivel de request-handler — pero resolverlo una vez por tabla se vuelve tedioso rápido. **CRUD dinámico** significa:

1. El runtime lee la metadata al arranque (o después de cada install).
2. Monta un store + handler genérico que sabe servir cualquier tabla que la metadata describa.
3. El frontend lee la misma metadata y renderiza forms / tablas que matchean.
4. Agregar una columna no requiere código en ninguno de los dos lados.

Este es el leverage central que provee Metacore. Cualquier otra pieza — actions, slots, lifecycle — extiende este loop.

## La mitad backend

### Qué se monta

El kernel monta un set fijo de rutas **centradas en el modelo** (el host las cablea bajo un prefijo — típicamente `/api`):

```
GET    /api/metadata/table/:model
GET    /api/metadata/modal/:model
GET    /api/metadata/all

GET    /api/dynamic/:model?page=&size=&sort=&filter=
GET    /api/dynamic/:model/:id
POST   /api/dynamic/:model
PUT    /api/dynamic/:model/:id
DELETE /api/dynamic/:model/:id

POST   /api/dynamic/:model/:id/actions/:key
GET    /api/options/:model        # lookups de opciones de select (el host opta vía MountOptions)
GET    /api/search/:model         # búsqueda typeahead
```

Hay un solo set de código de handler en el kernel, sin importar cuántos addons o modelos existan.

### Qué hace una llamada de listado

Un `GET /api/dynamic/tickets?page=2&size=20&sort=created_at:desc&filter=status:open`:

1. **Auth.** El middleware del host ya seteó la identidad del request en el contexto.
2. **Resolución.** El router parsea `model=tickets`.
3. **Chequeo de capability.** ¿El addon `tickets` tiene `db:read` sobre `tickets`? Si no, 403.
4. **Chequeo de permission.** ¿El usuario tiene `tickets.view`? Si no, 403.
5. **Scope de tenancy.** El store filtra por `org_id = ctx.OrgID` automáticamente (multi-tenant por defecto).
6. **Build de query.** Filter y sort se validan contra el schema de columnas del manifest; columnas desconocidas se rechazan.
7. **Ejecución.** Una sola sentencia SQL contra la base de datos del addon.
8. **Serialización.** Toda respuesta del kernel usa el envelope `{ "success": true, "data": ..., "meta": ... }` — las filas en `data`, paginación + total count en `meta`. Los errores son `{ "success": false, "message": "<razón>" }`. Los consumers TS leen `.data` para el payload.
9. **Audit (opcional).** La llamada se loguea vía el hook de audit del kernel.

Los pasos 3 y 4 son las puertas que hacen a Metacore seguro por defecto. Los pasos 5 y 6 son la razón por la que no escribís `WHERE org_id = ? AND ...` en tus handlers.

### Qué hace una escritura

`POST /api/dynamic/tickets` con `{"title":"...", "status":"open"}`:

1. Auth + resolución como arriba.
2. **Chequeo de capability.** ¿`db:write` sobre `tickets`?
3. **Chequeo de permission.** ¿`tickets.create`?
4. **Validación.** El payload se chequea contra el schema de columnas del manifest: tipos, required, max length, valores enum, regex.
5. **Validadores personalizados.** Cualquier validador del lado Go registrado en el addon corre.
6. **Insert.** Dentro de una transacción; los campos de tenancy se autopopulan.
7. **Emisión de evento.** El runtime publica `tickets.changed` en el hub WebSocket.
8. **Respuesta.** La fila creada, incluyendo campos generados por el server.

Updates y deletes siguen la misma forma con los chequeos específicos del verbo correspondiente.

### Dónde viven los datos

Las tablas del addon son tablas físicas en la base de datos del host, con namespace en el schema del addon (`addon_<key>`). Las migraciones corren dentro de una transacción; los installs fallidos se rollbackean atómicamente.

## La mitad frontend

### `<DynamicTable>` desde el manifest

```tsx
import { DynamicTable } from '@asteby/metacore-runtime-react'

<DynamicTable model="tickets" />
```

Lo que hace el componente:

1. Llama a `GET /api/metadata/table/tickets` una vez, lo cachea (`useMetadataCache`).
2. Construye una config de columnas desde la metadata: label del header, estilo de cell, sortability, filterability. El `getDynamicColumns` por defecto maneja cada estilo de cell que emite el kernel — badge, avatar, teléfono, fecha, booleano, badges de relación, galería de medios, imagen, más un fallback de texto.
3. Llama a `GET /api/dynamic/tickets` con el estado actual de page/sort/filter.
4. Renderiza la tabla — paginación, sorting, filtros multi-columna, acciones de fila, diálogos de create/edit/delete.
5. Se suscribe a los eventos de cambio del modelo en el hub WebSocket; invalida la query en cada evento.

Nada de eso es código por modelo.

### Personalizar sin escapar

`<DynamicTable>` acepta una prop `getDynamicColumns` — una función pura que convierte la metadata en `ColumnDef[]` de TanStack — para que extiendas o sobrescribas el rendering de cells por defecto:

```tsx
import { DynamicTable, makeDefaultGetDynamicColumns } from '@asteby/metacore-runtime-react'

<DynamicTable
  model="tickets"
  getDynamicColumns={makeDefaultGetDynamicColumns({
    overrides: { status: (col) => ({ ...col, cell: StatusBadge }) },
  })}
/>
```

Cuando necesitás acceso crudo, el runtime expone `useApi` (el cliente tipado sobre el envelope del kernel), `useOptions` / `useOptionsResolver` (lookups de select) y `useMetadataCache`; manejás tus propias llamadas con TanStack Query y te encargás del rendering.

### Forms

`<DynamicForm>` es la contraparte de create/edit:

```tsx
import { DynamicForm } from '@asteby/metacore-runtime-react'

<DynamicForm model="tickets" rowId={id} />
```

Lee la misma metadata, construye un form desde las columnas del modelo, corre los mismos validadores del lado del cliente y envía al endpoint CRUD del kernel. Los inputs personalizados son pluggables por tipo, y podés registrar validadores extra vía `registerValidator`.

## Dónde termina el CRUD dinámico

La capa de query ya hace más que list/get plano. Soporta **filtros por relación**, **`group_by`**, **agregaciones** y **preloads** de relaciones — suficiente para respaldar dashboards y vistas agrupadas sin handlers a medida. Algunos casos quedan deliberadamente fuera de scope:

- **Joins arbitrarios entre addons.** El store dinámico lee un modelo y sus relaciones declaradas; un join ad-hoc entre addons no relacionados es una action personalizada.
- **Reportes totalmente a medida.** Cuando un reporte necesita matemática de dominio más allá de lo que expresa la API de agregaciones, escribilo como action o endpoint del host.
- **Layouts a medida.** Cuando la UI dirigida por metadata pelea con el diseño, aportá un slot personalizado en su lugar.

Estos son los límites correctos — el CRUD dinámico es una solución del 80%; el 20% restante es donde los addons se ganan el sueldo.

## Relacionado

- [Manifest](/es/concepts/manifest) — el schema que lee el CRUD dinámico.
- [Permisos](/es/concepts/permissions) — las puertas en cada llamada de CRUD.
- [SDK docs / DynamicTable ↗](https://asteby.github.io/metacore-sdk/) — cada prop, cada hook.
- [Kernel docs / dynamic store ↗](https://asteby.github.io/metacore-kernel/) — los internals del backend.
