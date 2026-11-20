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

## Límites actuales

- Headers por petición (p. ej. `X-Correlation-ID` de POS `runWithCorrelation`) no se
  pueden fijar desde el addon: el host debe ofrecerlo (siguiente iteración).
- Sin `Content-Type` manual: el transporte del host fija el boundary multipart.
- Offline/`getApiBase()` (POS, kiosk): el host decide la base y la cola offline.
