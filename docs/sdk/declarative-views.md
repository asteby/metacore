<p align="center">
  <img src="/logo.svg" width="120" alt="Metacore" />
</p>

<h1 align="center">Declarative views and detail panels</h1>

<p align="center">
  <strong>Map, timeline, calendar, chart and split views — and the panels of a record's detail — rendered by the SDK from the manifest. Zero JavaScript per addon.</strong>
</p>

The grammar (`NavView`, `MapView`, `TimelineView`, `CalendarView`,
`ChartView`, `SplitView`, `ModelDetail`, `DetailPanel`) belongs to the kernel
(`docs/ui-pages-and-views.md`) and reaches the SDK through `pnpm codegen`.
This page covers the renderers.

## Manifest

```jsonc
{ "title": "shipping.nav.map", "model": "Shipment", "view_type": "map",
  "view": { "map": { "point": { "lat": "dest_lat", "lng": "dest_lng" },
                     "cluster": true, "color_by": "status",
                     "popup": ["tracking_number", "carrier", "status"], "fit": "data" } } }
```

Generate entries instead of writing them by hand:

```bash
npx create-metacore-addon add view --type map --model Shipment
npx create-metacore-addon add view --type chart --model Shipment --group-by carrier
npx create-metacore-addon add view --type split --model Shipment --columns tracking_number,carrier,status
```

`add view` infers missing fields from the model's columns, rejects unknown
columns and writes only JSON; its outputs are validated by the kernel in CI.

## Rendering

`DynamicView` (the generic `/m/<model>` surface) routes by `view_type`
(`resolveViewKind`): `kanban` → `DynamicKanban`; `map`, `timeline`,
`calendar`, `chart`, `split` → `DeclarativeView` **when the table metadata
carries the `view` block**; otherwise the table, exactly like before. The host
serves `view` (and `detail`) with `/metadata/table/<model>` for the requested
view type (kernel `Manifest.NavView(model, viewType)`); the lite manifest only
carries `view_type`.

```tsx
<DeclarativeView viewType="timeline" view={meta.view} model="ShipmentEvent"
  metadata={meta} data={dataSource} onOpenRecord={openRecord} locale="es-MX" />

<DetailPanels model="Shipment" panels={meta.detail?.panels} record={row}
  metadata={meta} data={dataSource} can={can} translate={t} />
```

| Type | Renderer | Data |
|---|---|---|
| `chart` | dashboard widgets (bar/line/area/pie/donut), same cards and formats | `data.chart({ model, query })` |
| `timeline` | ordered list, status badge, optional groups, "Cargar más" | rows sorted by `date_field` desc |
| `calendar` | month grid (Monday first), multi-day entries, keyboard reachable | one request per month: `f_<start_field>=RANGE:<first>,<last>` |
| `split` | `DynamicTable` restricted to `split.columns` + the selected record's panels | list + `data.record(model, id)` |
| `map` | **contract + accessible fallback**: the feature list with "Abrir en mapa" links | rows with coordinates |

Detail panels: `stats` (formatted values, never computed), `relation` (first
`limit` children), `timeline` (relation children **or** a capability query:
`record.<col>` / `const:<literal>` input, `items` path), `chart` (scoped to a
relation), `map` (record point + route stops). `custom` panels (level C) have
no built-in renderer: the host registers one that mounts the addon's expose.

Every renderer is its own lazy chunk: an addon that only declares a timeline
never downloads chart, calendar or map code, and none of them is in the
host's first paint (`index-static-graph` test). Each view and panel is
isolated by a `FederatedErrorBoundary`; skeletons have fixed heights.

## Registry

```ts
registerViewRenderer('map', () => import('@asteby/metacore-maps/view'))     // replaces the fallback
registerPanelRenderer('map', () => import('@asteby/metacore-maps/panel'))
registerPanelRenderer('custom', () => import('./host-custom-panel'))         // level C
preloadViewRenderer('calendar')                                               // hover on a nav entry
```

The map contract (`toMapFeatures`, `rowCoordinates`, `toRoutePoints`,
`MapFeatureList`) is exported from `@asteby/metacore-runtime-react/views/map`
so the maps package reads the manifest exactly like the fallback.

## Data source

Renderers read through a `ViewDataSource` the host injects (default
`createApiViewDataSource(api)`):

| Method | Default endpoint |
|---|---|
| `list(model, params)` | `GET /data/<model>` (kernel list syntax: `f_<col>`, `sortBy`, `order`, `per_page`) |
| `record(model, id)` | `GET /data/<model>/<id>` |
| `chart({ model, query, relation?, recordId?, panelKey? })` | `POST /views/chart` |
| `capability(key, input)` | `POST /capabilities/query` |

The host answers `chart` only for queries the installed manifests declare
(the same rule as dashboard widgets) and runs `capability` with the viewer's
permissions and a short cache. Renderers never compute business values: ETAs,
totals and statuses are displayed as served.
