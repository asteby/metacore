# Migrar el cliente HTTP de un addon federado a `useHostApiClient`

Cada addon copiaba `lib/api.ts` (fetch + `localStorage["auth_token"]` + `X-Branch-ID`)
y a veces `lib/dialog-client.ts`. Ahora el host inyecta el cliente: el addon no lee
`localStorage`, no conoce el token ni el `baseURL`.

## Lado host (una vez)

```tsx
import { createHostApi, HostApiProvider } from '@asteby/metacore-runtime-react'

const hostApi = createHostApi(opsAxios) // auth, X-Branch-ID, Accept-Language, 401/refresh viven en opsAxios
// Páginas: <AddonPageHost api={hostApi} …>.  Modales/pickers fuera de una página:
<HostApiProvider api={hostApi}>{modal}</HostApiProvider>
```

## Lado addon

Se borra de `lib/api.ts`: `API_BASE`, `ACCESS_TOKEN_KEY`, `ACTIVE_BRANCH_KEY`,
`authHeaders()`, `ApiError`, `isAbortError`, `parse()`, `qs()` y los métodos fetch.
Se borra `dialog-client.ts` completo.

```ts
// antes
import { api, ApiError, isAbortError } from '../lib/api'
const env = await api.get<Order[]>('/data/orders', { q }, signal)   // KernelEnvelope
const rows = env.data ?? []
const url = await api.uploadFile(file, 'workshop/checklist')
const pdf = await api.getBlob(`/data/orders/${id}/documents/ticket.pdf`)
await api.del(`/data/orders/${id}`)

// después
import { useHostApiClient } from '@asteby/metacore-runtime-react'
import { ApiError, isAbortError, getApiErrorMessage } from '@asteby/metacore-lib/envelope'
const api = useHostApiClient()
const rows = await api.get<Order[]>('/data/orders', { params: { q }, signal })  // ya desenvuelto
const { items, total } = await api.list<Order>('/data/orders', { params: { q } })
const { url } = await api.upload<{ url: string }>('/upload', file, { folder: 'workshop/checklist' })
const pdf = await api.blob(`/data/orders/${id}/documents/ticket.pdf`)
await api.delete(`/data/orders/${id}`)
```

Notas:

- Rutas sin el prefijo `/api`: lo pone el host.
- `ApiError` (`status`, `code`, `details`) es el de `@asteby/metacore-lib/envelope`;
  `success:false` también lanza. Un 401 llega como `ApiError.status === 401`
  (el host ya habrá intentado refrescar / redirigir).
- Cancelación: pasar `signal`; filtrar con `isAbortError(err)`.
- `dialogClient` para `DynamicSelectField` & co.: `<ApiProvider client={api.axiosLike()}>`
  (mantiene `{ data: envelope }`).
- Fuera de React (módulos, stores): recibir el cliente por parámetro o crearlo con
  `createHostApiClient(useHostApi())` dentro de un hook; no hay singleton ni fallback a
  `localStorage`. Sin host, `useHostApi()` lanza un error explicativo.

## Cabeceras por petición

Para `X-Correlation-ID` y similares: `headers` por llamada y/o `defaultHeaders` al crear
el cliente (la por-llamada gana).

```ts
const api = useHostApiClient({ defaultHeaders: { 'X-Client': 'pos' } })
await api.post('/data/sales', body, { headers: { 'X-Correlation-ID': cid } })
// o fuera del hook: createHostApiClient(hostApi, { defaultHeaders })
```

Las añade el host a las suyas, pero descarta (sin distinguir mayúsculas) las que
posee: `Authorization`, `Proxy-Authorization`, `Cookie`, `X-Organization-ID`, `X-Org-ID`,
`X-Branch-ID`, `Accept-Language`, `Host`, `Content-Length`, `Content-Type`,
`Transfer-Encoding`, `Origin`, `Referer`, `X-Forwarded-Host/Proto/For/Port`, `Forwarded`,
`X-Real-IP`, `X-Storefront-Domain`, `X-API-Key`, `X-HTTP-Method-Override` y todo `Proxy-*`
(lista en `PROTECTED_HOST_HEADERS`). Nombres
inválidos o valores con saltos de línea también se descartan. Un remote puede añadir
cabeceras, nunca sustituir las del host.

Honestidad: esto es higiene de contrato, NO una barrera de seguridad. El remote corre en
el mismo realm que el host (puede llamar a `fetch`/axios directamente); la defensa real
es lo que el backend valida (auth, permisos, tenant), nunca estas cabeceras. Un GET con
`headers` por llamada no entra en el lote de `batchGets` (va como GET propio).

## Timeout por llamada

El transporte del host tiene su propio timeout (ops: 60 s). Para operaciones lentas
(cobro multi-pago, devolución, importar CFDI) sube el límite en esa llamada:

```ts
await api.post('/data/payments/collect_multi', body, { timeout: 180_000 })
const api = useHostApiClient({ defaultTimeout: 30_000 })   // para todas; la llamada gana
```

- Debe ser un número finito >= 0; cualquier otro valor se ignora (rige el del host).
- El host lo topa con `createHostApi(client, { maxTimeoutMs })` (por defecto 600000 = 10 min):
  un valor mayor, o `0`, se convierte en ese tope. `maxTimeoutMs: 0` declara "sin tope" y
  entonces `timeout: 0` = sin límite. Así un remote no deja peticiones colgadas.
- Un timeout rechaza el cliente PERO el servidor puede haber aplicado la operación: no
  reintentes cobros/devoluciones/importaciones sin comprobar el estado (o usa idempotencia).
- Tampoco entra en un lote de `batchGets`.

## Lecturas frescas y capa offline

En ops, `installSyncHttp` (`frontend/src/lib/sync`) cuelga de la instancia axios del host:
(a) ante un fallo de RED (sin respuesta) en un GET `/data|/metadata`, sirve la copia local
(cabecera `x-ops-from-cache`), (b) en un GET con éxito superpone las escrituras encoladas
(`overlayQueued`), (c) offline encola escrituras. Un addon NO lo nota: una lectura de
montos pendientes puede ser una copia vieja. Para lecturas críticas de dinero:

```ts
const inv = await api.get(`/data/invoices/${id}`, { freshness: 'network' })
```

`freshness: 'network'` fija `metacoreFreshness: 'network'` en la config axios del host y
excluye la llamada del lote. Solo lo cumple un host cuyo interceptor lo lea: en ops falta
que `onNetworkError` (`sync/http-core.ts`) relance el error si `config.metacoreFreshness
=== 'network'` en lugar de servir del caché (y, si se quiere, que `onReadSuccess` no
superponga la cola). Hasta entonces la opción se ignora y el comportamiento es el de arriba.
Recomendación: en cobros/devoluciones leer saldos con `freshness: 'network'` y, si la
lectura falla, no dejar continuar la operación.

## Límites actuales

- Sin `Content-Type` manual: el transporte del host fija el boundary multipart.
- Offline/`getApiBase()` (POS, kiosk): el host decide la base y la cola offline.
