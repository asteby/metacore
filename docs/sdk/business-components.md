# Componentes de negocio compartidos

Todo se importa de `@asteby/metacore-runtime-react`. Un arreglo aquí corrige a la vez POS, Cotización, Pedido, Factura, OT, RMA y los addons que los consumen. Los componentes viven en el mismo paquete que `ActionModalDispatcher`, así que un modal federado (ver [modals.md](./modals), sdk#987) los usa sin empaquetarlos: comparte el singleton de `runtime-react` (mismo `ApiProvider`, `PermissionsProvider` y contexto de moneda/zona de la org).

Reglas comunes del contrato:

- Controlados: `value` + `onChange`. Sin estado oculto que el padre no pueda leer.
- Errores por celda con clave `"<índice>.<campo>"`; `serverErrors` acepta el mapa de `mapApiError(err).fields`.
- Permisos con `useCan()`; sin `PermissionsProvider` todo se permite (backend manda).
- Moneda y zona horaria salen de `CurrencyContext` / `TimeZoneContext` (org config); `currency` como prop las sobreescribe. Nunca hay moneda ni identificador fiscal hardcodeados.
- Textos por i18next con `defaultValue` en español.

## Catálogo

| Componente | `value` | Eventos | Permisos |
|---|---|---|---|
| `CustomerPicker` | `CustomerResult \| null` | `onChange` | `<model>.create` (alta rápida) |
| `ProductPicker` | — | `onSelect(product, variant?)` | — |
| `LineItemsEditor` | `LineItem[]` | `onChange`, `onValidate`, `onRequestProduct` | prop `editPermission` |
| `PaymentCapture` | `PaymentTender[]` | `onChange`, `onSubmit(payload)` | prop `submitPermission` |
| `RefundDestination` | `RefundAllocation[]` | `onChange`, `onValidate` | — |
| `InspectionChecklist` | `InspectionPoint[]` (+ `InspectionHeader`) | `onChange`, `onHeaderChange`, `onUpload`, `onValidate`, `onAddToBudget` | — |

`BUSINESS_COMPONENTS` exporta esta tabla como datos.

### CustomerPicker

```tsx
<CustomerPicker
  value={customer}
  onChange={setCustomer}
  search={useCallback((q, signal) => fetchCustomers(q, signal), [])} // nombre, ID fiscal, teléfono, placa, VIN
  validateTaxId={(id) => orgTaxValidator(id)}   // formato fiscal = config de la org
/>
```

Muestra adeudo, crédito y `alerts`. El alta rápida abre `CreateRecordDialog` del modelo (`model`, default `Customer`) y selecciona lo creado.

### ProductPicker

`search` recibe la consulta ya clasificada por `parseProductQuery`: `{kind:'barcode', barcode}`, `{kind:'tire_size', tire:{width,ratio,rim,normalized}}` o `{kind:'text', text}`, para que el backend elija el índice (código, medida, SKU/clave de proveedor). Devuelve `ProductResult[]` (con `variants`, `stock` por almacén y `bundle_items`). Enter con un código de barras de resultado único lo selecciona. `productToLine(product, variant, {warehouseId})` produce el renglón para el editor.

### LineItemsEditor

```tsx
const [lines, setLines] = useState<LineItem[]>(() => parseLineItems(doc.lines))
<LineItemsEditor value={lines} onChange={setLines} columns={['discount','tax','lot','dot']}
  policy={{ stockPolicy: 'block' }} serverErrors={mapped.fields} onRequestProduct={openPicker} />
await api.put(url, { lines: serializeLineItems(lines) })   // única puerta hacia el backend
```

`serializeLineItems` manda números reales (nunca `""`), sin claves de UI, opcionales vacíos omitidos y `position` 1-based; `parseLineItems` es la inversa. `validateLineItems`: sin negativos (salvo `allowNegative`, p. ej. NC), descuento 0-100, política de sobreventa `allow | warn | block`. Tipos de renglón: `item`, `section`, `note`.

### PaymentCapture

`methods` es el catálogo de la org (`{id,label,cash?,requiresReference?,requiresAccount?,maxAmount?,accounts?}`). Reglas: solo el efectivo puede exceder el total (el exceso es `change`); tarjeta/transferencia sobre el total es error; `policy.allowPartial` habilita anticipos/abonos. `onSubmit` recibe `serializePayment(...)` = `{payments, paid, change, remaining}` y solo se dispara si es válido.

### RefundDestination

Destinos `cash | card | wallet | store_credit | credit_note`. `options` filtra y limita (`maxAmount` = lo pagado con tarjeta; `available:false` + `disabledReason` si no hay CFDI). `allowSplit` reparte entre destinos; `validateRefund` exige que la suma cuadre con `total`.

### ReturnWizard

Asistente único «Devolver mercancía» (POS, Pedido, Factura, RMA, OT): renglones y cantidades (tope = vendido − ya devuelto) → condición (vendible → stock; defectuoso → merma o garantía) → recepción → reembolso con `RefundDestination`. Sin `warehouseConnected`, «Recibir» es un paso del propio asistente (corrige PIT-021); con almacén, este confirma fuera. Con `invoiced`, ofrece la NC CFDI y `creditNoteRelation` da la relación SAT: 03 si regresan renglones con producto, 01 si es solo importe (misma regla que el backend). No conoce endpoints: `onSubmit` recibe `serializeReturn(...)` = `{reason, notes?, received, lines[], refund[], credit_note?, totals}`.

## Utilidades transversales

- **Formato** — `formatMoney(1060, {currency:'MXN'})` → `$1,060.00`; `formatDate`/`formatDateTime` en la zona de la org (un `YYYY-MM-DD` es fecha de calendario y no retrocede un día); `createFormatter()` para tickets/PDF fuera de React; `useFormatter()` dentro. Locale por defecto `es-MX`.
- **Errores** — `mapApiError(err, {t, labels, knownFields})` → `{status, fields, form, hasFieldErrors}`. 422 con `errors` → mensaje por campo; 409 duplicado que nombra un campo (`knownFields`) → error de ese campo; el resto va a `form`. Pinta `fields` junto al input y `form` con `<FormErrorBanner>`; el toast solo confirma éxitos.
- **Feedback** — `notify.success` (breve, con «Deshacer» opcional), `<SystemNoticeBanner>` para «Hay novedades» (en flujo, no flota), `ACTION_SAFE_TOASTER_PROPS` para `<Toaster>` (arriba a la derecha, con offset, máx. 3), `<EmptyState title description action>`.

## Integración en el host

- Tailwind v4: el `@source` del host ya debe cubrir `node_modules/@asteby/metacore-runtime-react/dist` (igual que el resto del paquete); los componentes usan solo utilidades estándar más algunos valores arbitrarios de grid.
- Vite: `@asteby/metacore-runtime-react` va en `optimizeDeps` cuando se enlaza localmente, como el resto de paquetes metacore.

### InspectionChecklist

Checklist con semáforo para la recepción del vehículo, la inspección multipunto de la OT, la alineación y la garantía (TAL-4/TAL-5).

```tsx
const [points, setPoints] = useState(() => parseInspectionPoints(rows))
const [header, setHeader] = useState<InspectionHeader>({ damage_notes: '', odometer_km: null, fuel_level: '' })
<InspectionChecklist
  points={points} onChange={setPoints}
  header={header} onHeaderChange={setHeader}          // solo en la recepción: km, combustible, daños
  onUpload={async (file) => ({ url: await uploadToHost(file) })}  // el mismo POST /upload de los campos `upload`
  rules={{ requireAllReviewed: true }}
  onAddToBudget={(pts) => setLines([...lines, ...recommendationsToLines(pts)])}
/>
await api.post(action, { points: serializeInspectionPoints(points) })   // única puerta hacia el backend
```

Cada punto (`makeInspectionPoint`) trae `section`, `name`, `kind` (`check` | `tread` | `measure`), `status` (`pending | ok | attention | urgent`), `value`/`unit`, `notes`, `recommendation` + `quantity` × `unit_price` y `media[]` (fotos y video). La profundidad de dibujo (`tread`) fija el semáforo por `treadThresholds` (default rojo < 1.6 mm, amarillo < 3 mm); verde limpia la recomendación. `summarizeInspection` da conteos, el peor estado y el total recomendado; `recommendationsToLines(points, {approval})` vuelve las recomendaciones renglones del presupuesto (`LineItem`), filtrables por la respuesta del cliente. `readOnly` la muestra sin edición (inspección enviada o cerrada).
