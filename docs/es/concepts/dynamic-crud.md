# CRUD dinámico

El kernel convierte `manifest.tables[]` en una capa REST + UI funcional sin código por tabla. Esta página explica cómo, desde ambos lados — qué hace el runtime en el backend, y qué hace el SDK en el frontend.

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

Para cada addon, el kernel monta un set fijo de rutas:

```
GET    /api/addons/:id/_meta/columns
GET    /api/addons/:id/_meta/columns/:table

GET    /api/addons/:id/:table?page=&size=&sort=&filter=
GET    /api/addons/:id/:table/:rowId
POST   /api/addons/:id/:table
PATCH  /api/addons/:id/:table/:rowId
DELETE /api/addons/:id/:table/:rowId

POST   /api/addons/:id/_actions/:actionId
```

Hay un solo set de código de handler en el kernel, sin importar cuántos addons o tablas existan.

### Qué hace una llamada de listado

Un `GET /api/addons/tickets/tickets?page=2&size=20&sort=created_at:desc&filter=status:open`:

1. **Auth.** El middleware del host ya seteó `kernel.Identity` en el contexto.
2. **Resolución.** El router parsea `addon=tickets`, `table=tickets`.
3. **Chequeo de capability.** ¿El addon `tickets` tiene `db:read` sobre `tickets`? Si no, 403.
4. **Chequeo de permission.** ¿El usuario tiene `tickets.view`? Si no, 403.
5. **Scope de tenancy.** El store filtra por `org_id = ctx.OrgID` automáticamente (multi-tenant por defecto).
6. **Build de query.** Filter y sort se validan contra el schema de columnas del manifest; columnas desconocidas se rechazan.
7. **Ejecución.** Una sola sentencia SQL contra la base de datos del addon.
8. **Serialización.** Filas + cursor de paginación + total count, JSON.
9. **Audit (opcional).** La llamada se loguea vía el hook de audit del kernel.

Los pasos 3 y 4 son las puertas que hacen a Metacore seguro por defecto. Los pasos 5 y 6 son la razón por la que no escribís `WHERE org_id = ? AND ...` en tus handlers.

### Qué hace una escritura

`POST /api/addons/tickets/tickets` con `{"title":"...", "status":"open"}`:

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

Las tablas del addon son tablas físicas en la base de datos del host. Cada tabla tiene namespace por addon ID a nivel schema o nombre de tabla (configurable). Las migraciones corren dentro de una transacción; los installs fallidos se rollbackean atómicamente.

## La mitad frontend

### `<DynamicTable>` desde el manifest

```tsx
<DynamicTable addon="tickets" table="tickets" />
```

Lo que hace el componente:

1. Llama a `GET /api/addons/tickets/_meta/columns/tickets` una vez, lo cachea.
2. Construye una config de columnas desde la metadata: label del header, tipo de cell, sortability, filterability.
3. Llama a `GET /api/addons/tickets/tickets` con el estado actual de page/sort/filter.
4. Renderiza la tabla.
5. Se suscribe a `tickets.changed` en el hub WebSocket; invalida la query en cada evento.

Conseguís paginación, sorting, filtros multi-columna, click-en-fila-para-editar, botón de crear, confirmación de delete y updates en tiempo real. Nada de eso es código por tabla.

### Personalizar sin escapar

`<DynamicTable>` acepta overrides:

```tsx
<DynamicTable
  addon="tickets"
  table="tickets"
  columns={{
    status:  { renderCell: (v) => <Badge tone={v}>{v}</Badge> },
    title:   { width: '40%' },
  }}
  onRowClick={(row) => navigate(`/tickets/${row.id}`)}
  toolbar={<MyExtraButtons />}
/>
```

Cuando los overrides no alcanzan, bajá a la capa de hooks:

```tsx
import { useDynamicQuery, useDynamicMutation } from '@asteby/metacore-runtime-react'

const { rows, isLoading, page, setPage } = useDynamicQuery({
  addon: 'tickets',
  table: 'tickets',
  filter: { status: 'open' },
  sort:   [{ col: 'priority', dir: 'desc' }],
})

const update = useDynamicMutation({ addon: 'tickets', table: 'tickets', op: 'update' })
```

Los hooks manejan paginación, invalidación en tiempo real, updates optimistas y gating por permission; vos te encargás del rendering.

### Forms

`<DynamicForm>` es la contraparte de create/edit:

```tsx
<DynamicForm addon="tickets" table="tickets" rowId={id} />
```

Lee la misma metadata, construye un form desde `columns[]`, corre los mismos validadores del lado del cliente y envía al endpoint CRUD del kernel. Los inputs personalizados son pluggables por tipo (p.ej. un editor de rich-text para columnas `text`).

## Dónde termina el CRUD dinámico

Algunos casos están deliberadamente fuera de scope:

- **Joins entre addons.** El store dinámico lee una tabla a la vez. Los joins se denormalizan en el manifest o se implementan como una action personalizada.
- **Agregaciones.** Reportes y dashboards los define el addon, no se autogeneran.
- **Layouts a medida.** Cuando la UI dirigida por metadata pelea con el diseño, montá un slot personalizado en su lugar.

Estos son los límites correctos — el CRUD dinámico es una solución del 80%; el 20% restante es donde los addons se ganan el sueldo.

## Relacionado

- [Manifest](/es/concepts/manifest) — el schema que lee el CRUD dinámico.
- [Permisos](/es/concepts/permissions) — las puertas en cada llamada de CRUD.
- [SDK docs / DynamicTable ↗](https://asteby.github.io/metacore-sdk/) — cada prop, cada hook.
- [Kernel docs / dynamic store ↗](https://asteby.github.io/metacore-kernel/) — los internals del backend.
