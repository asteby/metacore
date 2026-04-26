<p align="center">
  <img src="/logo.svg" width="120" alt="Metacore" />
</p>

<h1 align="center">UI dinámica</h1>

<p align="center">
  <strong>Metadata adentro. CRUD afuera. Sin código de pegamento.</strong>
</p>

El runtime del frontend de Metacore convierte un documento de metadata servido por el kernel en una superficie CRUD completa — tabla, filtros, paginación, modal de edit, acciones custom, botones gateados por capabilities, i18n. Vos declarás el modelo en `manifest.json`; el kernel materializa la base de datos, los endpoints de metadata y los gates de permisos; el SDK renderiza todo desde un solo componente.

Este documento cubre el lado React: qué componentes existen, qué props aceptan, cómo fluye la data, y cómo extender o reemplazar cualquier parte.

## Tabla de contenidos

- [Arquitectura](#arquitectura)
- [`<DynamicTable>`](#dynamictable)
- [`<DynamicForm>`](#dynamicform)
- [`<DynamicRecordDialog>`](#dynamicrecorddialog)
- [`<ActionModalDispatcher>`](#actionmodaldispatcher)
- [`getDynamicColumns` y la factory de columnas](#getdynamiccolumns-y-la-factory-de-columnas)
- [Gates de capabilities](#gates-de-capabilities)
- [Slots](#slots)
- [Merge de navegación](#merge-de-navegación)
- [i18n](#i18n)
- [Cache de metadata](#cache-de-metadata)
- [Patrones de personalización](#patrones-de-personalización)
- [Performance](#performance)
- [Lo que no podés hacer (todavía)](#lo-que-no-podés-hacer-todavía)

## Arquitectura

```
   manifest.json                kernel                       runtime-react
   ─────────────                ──────                       ─────────────
   model_definitions[] ──▶  AutoMigrate  ──▶  /metadata/table/<model>
   actions[]                                  /data/<model>
   capabilities[]                             /data/<model>/<id>
                                              /data/<model>/<id>/action/<key>
                                              /options/<endpoint>

                                                            │
                                                            ▼
                                            ┌────────────────────────────┐
                                            │  <DynamicTable model="…"/> │
                                            │   <DynamicForm/>           │
                                            │   <DynamicRecordDialog/>   │
                                            │   <ActionModalDispatcher/> │
                                            └────────────────────────────┘
                                                            │
                                                            ▼
                                                  CRUD UI rendered
```

El contrato entre kernel y SDK es un documento JSON: `TableMetadata` para tablas (columnas, filtros, acciones, capabilities, defaults de paginación) y `ModalMetadata` para el diálogo de edit/create. Ambos se cachean del lado cliente vía [`useMetadataCache`](#cache-de-metadata).

El runtime nunca asume un cliente HTTP, design system o flujo de auth específico. Los hosts inyectan estos a través de providers:

| Provider | Origen | Propósito |
|---|---|---|
| `<ApiProvider client={axios}>` | `@asteby/metacore-runtime-react` | Cliente compatible con axios usado para cada request. |
| `<BranchProvider branch={…}>` | `@asteby/metacore-runtime-react` | Contexto opcional de branch de tenant. Cambiar de branch resetea el estado de la tabla. |
| `<CapabilityProvider capabilities={…}>` | `@asteby/metacore-runtime-react` | Maneja `<CapabilityGate>` y acciones gateadas por capability. |
| `<I18nextProvider i18n={…}>` | `react-i18next` | Todo el copy visible al usuario resuelve a través de `useTranslation()`. |
| `<OptionsContext.Provider>` | `@asteby/metacore-runtime-react` | Interno — `<DynamicTable>` lo populariza con opciones de select pre-cargadas. |

## `<DynamicTable>`

El único componente que convierte el nombre de un modelo en una tabla CRUD completa.

```tsx
import { DynamicTable } from '@asteby/metacore-runtime-react'

export function TicketsPage() {
  return <DynamicTable model="tickets" />
}
```

Lo que obtenés:

- Tabla ordenable, paginada y filtrable, manejada por la metadata devuelta por `GET /metadata/table/<model>`.
- Sincronización del estado con la URL (`?page=`, `?sortBy=`, `?f_status=open`) — vistas marcables.
- Data server-side vía `GET /data/<model>` con los mismos params de filter/sort/paginación.
- Acciones built-in de `view`, `edit`, `delete` cuando la metadata las declara.
- Acciones custom (`actions[]` en el manifest) ruteadas a `<ActionModalDispatcher>`.
- Selección bulk + delete bulk con UI de progreso.
- Diálogos de Export e Import cuando `metadata.canExport` / `metadata.canImport`.
- Estados skeleton, vacío, toasts de error.

### Props

| Prop | Tipo | Default | Notas |
|---|---|---|---|
| `model` | `string` | — | Key del modelo. Usada en `/metadata/table/<model>` y `/data/<model>`. |
| `endpoint` | `string` | `/data/<model>` | Override del endpoint de data. Útil para recursos anidados. |
| `enableUrlSync` | `boolean` | `true` | Refleja el estado de filter/sort/page en `?query=…`. Poné `false` para tablas embebidas. |
| `hiddenColumns` | `string[]` | `[]` | Keys de columnas a ocultar. Las columnas ocultas igual cargan — usalo para vistas contextuales, no para gating de permisos (eso es trabajo del kernel). |
| `onAction` | `(action, row) => void \| Promise<void>` | — | Llamado para cualquier acción emitida por el dropdown de fila. Si se omite, las built-in `view`/`edit`/`delete` se manejan internamente. |
| `refreshTrigger` | `any` | — | Cambiá este valor (counter, timestamp) para forzar un refetch desde un parent. |
| `defaultFilters` | `Record<string, any>` | — | Filtros aplicados incondicionalmente y excluidos de la sincronización con URL. Útiles para scopear una tabla a un registro padre (ej. `{ ticket_id: '…' }`). |
| `extraColumns` | `ColumnDef<any>[]` | `[]` | Columnas TanStack extras agregadas antes de la columna de acciones. |
| `getDynamicColumns` | `GetDynamicColumns` | `defaultGetDynamicColumns` | Factory que convierte la metadata en column defs de TanStack. Ver [abajo](#getdynamiccolumns-y-la-factory-de-columnas). |

### Forma esperada de respuesta

`GET /metadata/table/<model>` devuelve `TableMetadata`:

```ts
interface TableMetadata {
  title: string
  endpoint: string
  columns: ColumnDefinition[]      // ver abajo
  actions: ActionDefinition[]
  filters?: FilterDefinition[]
  perPageOptions: number[]
  defaultPerPage: number
  searchPlaceholder: string
  enableCRUDActions: boolean
  hasActions: boolean
  canExport?: boolean
  canImport?: boolean
  canCreate?: boolean
}
```

`GET /data/<model>` devuelve el envelope canónico `ApiResponse<T[]>`:

```ts
interface ApiResponse<T> {
  success: boolean
  data: T
  meta?: { current_page; from; last_page; per_page; to; total }
  message?: string
}
```

### Referencia rápida

```tsx
// Vista de lista marcable en /tickets
<DynamicTable model="tickets" />

// Embebido dentro de la página de detalle de un ticket — sin URL sync, prefiltrado por padre.
<DynamicTable
  model="ticket_comments"
  enableUrlSync={false}
  defaultFilters={{ ticket_id: ticket.id }}
/>

// Handler de acción custom — el caller decide qué hacer para keys no built-in.
<DynamicTable
  model="invoices"
  onAction={async (action, row) => {
    if (action === 'send_pdf') await sendInvoicePdf(row.id)
  }}
/>
```

## `<DynamicForm>`

Un renderer de formulario standalone que consume `ActionFieldDef[]` — la misma forma usada por las acciones del manifest y la metadata de modal. Usalo para formularios puntuales que no estén atados a un diálogo de registro.

```tsx
import { DynamicForm } from '@asteby/metacore-runtime-react'

const fields = [
  { key: 'note', label: 'Note', type: 'textarea', required: true },
  { key: 'send_email', label: 'Send confirmation', type: 'boolean', defaultValue: true },
]

<DynamicForm
  fields={fields}
  initialValues={{ note: '' }}
  onSubmit={async (values) => api.post('/notes', values)}
  submitLabel="Send"
/>
```

### Props

| Prop | Tipo | Default | Notas |
|---|---|---|---|
| `fields` | `ActionFieldDef[]` | — | Requerido. Cada field renderiza un input según `type`. |
| `initialValues` | `Record<string, any>` | — | Pre-popula los inputs. Cae al `defaultValue` de cada field, después a un valor vacío apropiado al tipo. |
| `onSubmit` | `(values) => void \| Promise<void>` | — | Llamado después de un check sincrónico de campos requeridos. |
| `onCancel` | `() => void` | — | Cuando se provee, renderiza un botón Cancel a la izquierda de Submit. |
| `submitLabel` | `string` | `'Guardar'` | Label del botón submit. Pasalo por `t()` si necesitás localizarlo. |
| `cancelLabel` | `string` | `'Cancelar'` | Label del botón cancel. |
| `disabled` | `boolean` | `false` | Deshabilita ambos botones. |

### Forma de `ActionFieldDef`

```ts
interface ActionFieldDef {
  key: string
  label: string
  type: 'text' | 'textarea' | 'select' | 'number' | 'date' | 'boolean'
      | 'email' | 'url' | string
  required?: boolean
  options?: { value: string; label: string }[]
  defaultValue?: any
  placeholder?: string
  searchEndpoint?: string
}
```

`type` cae a un input de texto plano cuando el valor no se reconoce. `email` y `url` mejoran el `<input type=…>` subyacente para validación nativa pero ninguna lógica extra corre en el SDK — la validación server-side sigue siendo la autoridad.

## `<DynamicRecordDialog>`

El modal de create / edit / view abierto desde el dropdown de fila. Lee `GET /metadata/modal/<model>` (cacheado) y `GET /data/<model>/<id>` para edit/view.

```tsx
import { DynamicRecordDialog } from '@asteby/metacore-runtime-react'

const [dialog, setDialog] = useState({ open: false, mode: 'create' as const, recordId: null })

<DynamicRecordDialog
  open={dialog.open}
  onOpenChange={(open) => setDialog((s) => ({ ...s, open }))}
  mode={dialog.mode}            // 'create' | 'edit' | 'view'
  model="tickets"
  recordId={dialog.recordId}    // null para create
  onSaved={() => refetchTable()}
/>
```

`<DynamicTable>` lo renderiza por vos en `view`/`edit`. Solo lo montás directamente cuando cableás un botón "Crear…" fuera de una tabla (ej. en el header de la página).

| Prop | Tipo | Notas |
|---|---|---|
| `open` | `boolean` | Controlado. |
| `onOpenChange` | `(open: boolean) => void` | Llamado por el botón cerrar / click afuera. |
| `mode` | `'view' \| 'edit' \| 'create'` | Maneja título, label de submit y estado readonly de los fields. |
| `model` | `string` | Misma key de modelo que `<DynamicTable>`. |
| `recordId` | `string \| null` | Requerido para `view` / `edit`. |
| `endpoint` | `string` | Override de `/data/<model>`. |
| `onSaved` | `() => void` | Llamado en create/edit exitoso para que los callers refetchen. |

El diálogo usa estado local estilo `react-hook-form` nativo (sin dependencia de store externo). Los tipos de field vienen de la metadata de modal servida por el kernel: `text`, `textarea`, `select`, `search` (relation picker), `number`, `date`, `email`, `url`, `boolean`, `image`. Los fields foreign-key con `searchEndpoint` se popularizan vía `/options/<endpoint>` on demand.

## `<ActionModalDispatcher>`

Rutea una acción custom declarada en `manifest.actions[]` al modal correcto:

1. **Componente custom registrado.** Si el registry de acciones del SDK tiene un componente para `<model>::<action.key>`, se usa. Los hosts los registran vía:
   ```ts
   import { actionRegistry } from '@asteby/metacore-sdk'
   actionRegistry.register('tickets', 'reassign', ReassignDialog)
   ```
2. **`action.fields[].length > 0`.** Renderiza un modal genérico con inputs estilo `<DynamicForm>`.
3. **`action.confirm === true`.** Renderiza una confirmación `AlertDialog`.
4. **Ninguna de las anteriores.** Devuelve `null` — se espera que el caller ejecute inmediatamente.

`<DynamicTable>` lo cablea por vos. Solo lo renderizás directamente cuando implementás acciones fuera de una tabla.

```tsx
<ActionModalDispatcher
  open={open}
  onOpenChange={setOpen}
  action={{
    key: 'resolve',
    label: 'Resolve',
    icon: 'CheckCircle2',
    confirm: true,
    confirmMessage: 'Mark this ticket as resolved?',
  }}
  model="tickets"
  record={ticket}
  onSuccess={() => refetch()}
/>
```

El dispatcher hace POST a `POST /data/<model>/me/<id>/action/<key>` (o `<endpoint>/<id>/action/<key>` si overrideás el endpoint).

## `getDynamicColumns` y la factory de columnas

`<DynamicTable>` acepta una prop `getDynamicColumns` — una función pura que convierte la metadata en `ColumnDef[]` de TanStack. La implementación por defecto maneja cada estilo de celda emitido por el kernel: badge (opciones estáticas + cargadas por endpoint), avatar, phone, date, boolean, badges de relación, galería de medios, imagen, más un fallback de texto genérico.

### Contrato de backend: `col.key`

La factory lee cada columna desde el field `key`. El backend es la fuente de verdad para ese nombre:

```ts
metadata.columns.forEach((col) => {
  // col.key — identificador primario (usado como accessorKey Y id)
  // col.label — header label
  // col.type — maneja el cell renderer
  // ...
})
```

Implementaciones de host viejas esperaban `col.name` y producían filas vacías cuando el kernel cambió a `col.key`. El SDK está en `col.key` desde `runtime-react@4.0.1`; asegurate de que tus versiones de kernel y host coincidan.

### Usar la factory

Para la mayoría de los hosts el default alcanza:

```tsx
<DynamicTable model="tickets" />
```

Si necesitás pasar helpers de URL (resolución de avatar, base path de CDN), usá `makeDefaultGetDynamicColumns`:

```tsx
import { DynamicTable, makeDefaultGetDynamicColumns } from '@asteby/metacore-runtime-react'

const getDynamicColumns = makeDefaultGetDynamicColumns({
  apiBaseUrl: import.meta.env.VITE_API_URL.replace('/api', ''),
  getImageUrl: (path) => path.startsWith('http') ? path : `${CDN}/${path}`,
})

<DynamicTable model="users" getDynamicColumns={getDynamicColumns} />
```

### Reemplazarla

Pasá una factory totalmente custom cuando tu design system diverge significativamente de shadcn/Radix:

```tsx
const myColumns: GetDynamicColumns = (metadata, onAction, t, lang, filterConfigs) =>
  metadata.columns.map((col) => ({
    accessorKey: col.key,
    id: col.key,
    header: col.label,
    cell: ({ row }) => <MyBrandedCell value={row.original[col.key]} type={col.type} />,
  }))

<DynamicTable model="orders" getDynamicColumns={myColumns} />
```

La factory se llama en cada render; memoizá externamente si es pesada (la mayoría no lo son).

### Tipos de celda

| `col.type` / `col.cellStyle` | Renderer |
|---|---|
| `text`, default | `<span>` truncado con atributo title. |
| `date` | Ícono de calendario + fecha formateada por locale (`date-fns`, ES/EN). |
| `boolean` | Badges "Sí" / "No" (traducir a nivel host). |
| `phone` | String plano (el formateo es responsabilidad del host). |
| `avatar`, `search` | Avatar + nombre + descripción opcional. Resuelve vía `apiBaseUrl` + `basePath`. |
| `image` | Thumbnail con fallback de ocultar en error. |
| `media-gallery` | Avatares apilados, indicador +N más allá de 3. |
| `relation-badge-list` | Envuelve `displayField`/`iconField` de cada registro relacionado. |
| `cellStyle === 'badge'` | Lookup estático de `options[]`; cae a badge outline. |
| `cellStyle === 'badge'` + `useOptions` + `searchEndpoint` | Opciones pre-cargadas por endpoint vía `OptionsContext`. |

## Gates de capabilities

Envolvé cualquier UI que quieras esconder detrás de un permiso:

```tsx
import { CapabilityGate, CapabilityProvider } from '@asteby/metacore-runtime-react'

// En la raíz, una vez.
<CapabilityProvider capabilities={user.capabilities}>
  {children}
</CapabilityProvider>

// En cualquier sitio de uso.
<CapabilityGate require="db:write addon_tickets.tickets">
  <Button onClick={createTicket}>New ticket</Button>
</CapabilityGate>

<CapabilityGate all={['cap.a', 'cap.b']} fallback={<UpgradeBanner />}>
  <PremiumWidget />
</CapabilityGate>

<CapabilityGate any={['db:read users', 'db:read members']}>
  <Assignee />
</CapabilityGate>
```

| Prop | Notas |
|---|---|
| `require` | Una sola capability que debe estar presente. |
| `all` | Todas las capabilities listadas deben estar presentes. |
| `any` | Al menos una debe estar presente. |
| `invert` | Renderiza children cuando la capability está **ausente**. |
| `fallback` | Element mostrado cuando el gate niega. Default `null`. |

Los strings de capabilities son de forma libre — el formato canónico es `<kind> <target>` (ej. `db:read addon_tickets.*`) pero los hosts pueden usar cualquier convención de naming. El gate es puramente una conveniencia de UI: el kernel sigue enforciando capabilities server-side. Ver [`capabilities.md`](./capabilities).

## Slots

Puntos de extensión nombrados que el host renderiza y a los que los addons contribuyen:

```tsx
import { Slot, slotRegistry } from '@asteby/metacore-runtime-react'

// Adentro de la función register() de un addon:
slotRegistry.register('dashboard.widgets', RevenueWidget, { priority: 10, source: 'billing' })

// En el host:
<Slot name="dashboard.widgets" props={{ orgId }} fallback={<EmptyDashboard />} />
```

El registry está respaldado por un render-store (`useSyncExternalStore`); las contribuciones aparecen y desaparecen instantáneamente cuando un addon se registra/desregistra. `priority` más alta renderiza primero.

Ids de slot comunes: `dashboard.widgets`, `app.command-palette`, `record.<model>.header`, `record.<model>.footer`. No hay un enum forzado — los ids de slot son una convención entre el host y los addons.

## Merge de navegación

`mergeNavigation` (y el hook `useNavigation`) mergea el sidebar base del host con `manifest.navigation` de cada addon cargado, deduplicando por `key` y respetando `priority`.

```tsx
import { useNavigation } from '@asteby/metacore-runtime-react'

const items = useNavigation(baseSidebar, [
  { source: 'tickets', items: ticketsManifest.navigation },
  { source: 'billing', items: billingManifest.navigation },
])

return <AppSidebar navGroups={items} />
```

`NavItem` soporta `requires` (capability), `priority` (peso de orden), y `children` anidados.

## i18n

Las traducciones de addon declaradas en `manifest.i18n` se pliegan dentro de la instancia i18next del host vía `<I18nProvider>`:

```tsx
import { I18nProvider } from '@asteby/metacore-runtime-react'

<I18nProvider
  i18n={i18n}
  contributions={[
    { source: 'tickets', resources: ticketsManifest.i18n },
    { source: 'billing', resources: billingManifest.i18n },
  ]}
>
  {children}
</I18nProvider>
```

Cada addon contribuye un namespace igual a su key `source`. Los componentes dentro del runtime usan el namespace default más sets `common.*` y `datatable.*` que se espera que el host provea — ver el README de `@asteby/metacore-ui` para la lista completa de keys.

Los headers de columna se renderizan como `{col.label}` directamente desde la metadata. Los hosts pueden preprocesar la metadata antes de pasarla a un `getDynamicColumns` custom si quieren traducir los labels a través de `t(col.label)`.

## Cache de metadata

`useMetadataCache` es un store Zustand que persiste la metadata de tabla y modal entre montajes y entre recargas completas de página (LocalStorage, namespace `metacore-metadata-cache`).

```ts
import { useMetadataCache } from '@asteby/metacore-runtime-react'

const { prefetchAll, getMetadata, hasMetadata } = useMetadataCache()

// Una vez al startup de la app — populariza el cache desde un solo round trip.
useEffect(() => { prefetchAll(api) }, [api])
```

`prefetchAll(api)` llama a `GET /metadata/all` (devolviendo `{ tables, modals, version }`). Cuando la `version` del servidor difiere de la cacheada, todo el cache se invalida — perfecto para invalidar caches de cliente después de un upgrade del kernel.

`<DynamicTable>` lee del cache antes de hacer un request de red. Visitas repetidas al mismo modelo renderizan instantáneamente.

## Patrones de personalización

### Cell renderers custom

Reemplazá `getDynamicColumns` y branchá sobre `col.type` / `col.cellStyle`. Ver [la sección de la factory](#getdynamiccolumns-y-la-factory-de-columnas).

### Handlers de acción custom

Dos capas:

1. Declarativa — declará `actions[]` en el manifest con `confirm`, `fields[]` y dejá que `<ActionModalDispatcher>` renderice el modal.
2. Imperativa — registrá un componente de modal totalmente custom:
   ```ts
   import { actionRegistry } from '@asteby/metacore-sdk'
   actionRegistry.register('invoices', 'send_email', SendEmailDialog)
   ```
   El dispatcher va a tomar tu componente cuando el key de acción coincida.

### Cablear un botón "Crear" fuera de la tabla

```tsx
const [createOpen, setCreateOpen] = useState(false)

<Button onClick={() => setCreateOpen(true)}>New ticket</Button>
<DynamicRecordDialog
  open={createOpen}
  onOpenChange={setCreateOpen}
  mode="create"
  model="tickets"
  onSaved={() => queryClient.invalidateQueries({ queryKey: ['tickets'] })}
/>
```

### Ocultar columnas condicionalmente

```tsx
<DynamicTable
  model="invoices"
  hiddenColumns={user.role === 'viewer' ? ['total', 'tax'] : []}
/>
```

Para ocultamiento manejado por permisos, preferí filtrado del lado kernel — el endpoint de metadata puede omitir columnas que el caller no puede leer, lo que es más robusto que ocultar client-side.

### UI diferente para create vs edit

`mode` es una prop regular en `<DynamicRecordDialog>`. Pasá `'create'` o `'edit'`; el diálogo lee la misma metadata pero usa `createTitle` / `editTitle` y limpia valores para create.

Para flujos de creación radicalmente distintos, branchá en el call site y renderizá un componente diferente para `mode === 'create'`.

## Performance

| Tema | Lo que hace el runtime |
|---|---|
| Round-trips de metadata | Cacheados en LocalStorage vía `useMetadataCache`. `prefetchAll()` trae cada modelo en una sola llamada al startup. |
| Paginación | Server-side. El runtime manda `page=` y `per_page=` y respeta el `meta.total` de la respuesta. |
| Sorting / filtering | Server-side. Los params de URL son `sortBy=`, `order=`, `f_<col>=`. |
| Prefetch de opciones de select | Un fetch agrupado por `searchEndpoint` único en el mount; resultados sostenidos en `OptionsContext`. |
| Re-renders | `getDynamicColumns` se invoca dentro de un `useMemo`. Configs de filter y visibilidad de columnas viven en estado de componente. |
| Virtualización | No incluida. Para páginas muy grandes (>200 filas) envolvé tus cell renderers de `getDynamicColumns` custom en `React.memo` y considerá cambiar a un `defaultPerPage` más chico. |

## Lo que no podés hacer (todavía)

El runtime es opinionado. Estos son gaps intencionales; tratalos como lugares donde deberías bajar a un componente custom.

- **Joins multi-tabla.** `<DynamicTable>` es un modelo por mount. Para master-detail, renderizá dos tablas y linkealas con `defaultFilters`.
- **Edición inline.** Las celdas son read-only. Las ediciones pasan por el diálogo de registro.
- **RPC custom.** Las acciones son POSTs a `/data/<model>/.../action/<key>`. Otras formas (long-poll, SSE, websocket-only) necesitan sus propios componentes.
- **Búsqueda cross-modelo.** La búsqueda global del toolbar es por modelo. Para búsqueda app-wide usá `@asteby/metacore-ui/command-menu`.
- **Updates optimistas.** Las mutaciones siempre refetchean. Si necesitás escrituras optimistas al cache, envolvé la mutación vos mismo fuera del runtime.
- **Renderizado sin schema.** El runtime requiere un documento `TableMetadata`. Data sin forma necesita un componente diferente.

Cuando un host necesita más, el patrón recomendado es componer: envolvé `<DynamicTable>` para las partes que encajan y bajá a primitivos de `@asteby/metacore-ui` para el resto.

## Relacionado

- [`quickstart.md`](./quickstart) — tu primer addon en 5 minutos.
- [`manifest-spec.md`](./manifest-spec) — la fuente de cada field `col.*` y `actions[]`.
- [`addon-cookbook.md`](./addon-cookbook) — recetas para escenarios comunes.
- [`capabilities.md`](./capabilities) — declarando permisos con scope.
- [`consumer-guide.md`](./consumer-guide) — integrar el SDK en una app host.
