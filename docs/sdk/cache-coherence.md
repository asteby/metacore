# Coherencia de cachés en el cliente

El backend (metacore-kernel `cachecoherence`, ver `docs/CACHE-COHERENCE.md` del
kernel y de OPS) mantiene una **época** que se mueve cada vez que cambia algo de
lo que se deriva la UI: un addon instalado, actualizado, habilitado,
deshabilitado o desinstalado, o un reinicio del servidor. La anuncia de dos
maneras:

- `X-Cache-Epoch` en cada respuesta de la API;
- un mensaje WebSocket `CACHE_EPOCH_CHANGED` `{epoch, reason, seq, orgId?, addonKey?}`.

Una pestaña abierta durante el cambio conserva el mundo anterior (traducciones,
manifests, navegación, permisos, metadatos, listas de opciones) hasta recargar.
El SDK lo detecta una vez y revalida todo.

## Piezas

| Paquete | Qué hace |
|---|---|
| `@asteby/metacore-sdk` | núcleo: `observeCacheEpoch`, `onCacheEpochChange`, `wireCacheEpochPush`, `attachCacheEpoch(axios)`, `isStaleStateError`, `withStaleRetry`. `MarketplaceClient` reporta la época, pide los GET con `cache: "no-cache"` y reintenta una vez ante un plan desfasado. `MetacoreProvider` revalida manifests y navegación al cambiar la época. Hook `useCacheEpochPush(ws)`. |
| `@asteby/metacore-runtime-react` | `ApiProvider` reporta la época de cada respuesta y reintenta una vez ante estado desfasado. `useCacheEpochSync({queryClient})` vacía metadatos, el lote de lecturas (con metadatos e i18n) y las opciones, e invalida react-query. `invalidateAddonQueries(qc, key)`. |
| `@asteby/metacore-marketplace` | el fetcher reporta la época y reintenta; instalar / actualizar / desinstalar llaman `invalidateAddon(qc, key)`: marketplace + toda query que mencione el addon + raíces de shell (navigation, manifests, permissions, metadata, i18n...). |
| `@asteby/metacore-i18n` | `invalidateAddonI18n(key?)`; los bundles de addon (memoria + localStorage) se descartan y se vuelven a pedir al cambiar la época. |

## Protocolo entre paquetes

Los paquetes que no dependen del núcleo (marketplace, i18n, runtime-react) se
comunican con él por dos eventos de `window`, sin importarlo:

```
"metacore:cache-epoch-observed"  { detail: { epoch } }                      informar un token
"metacore:cache-epoch-changed"   { detail: { epoch, previous, source } }    la época se movió
```

El estado vive en `globalThis[Symbol.for("metacore.cache-epoch")]`, así que
copias duplicadas del módulo comparten línea base.

Reglas: el primer token es la línea base y no dispara nada; los tokens vacíos o
ausentes se ignoran (un proxy que quita la cabecera no es un cambio); el mensaje
WS es una orden directa de refrescar (su token es el de la acción, no el de la
vista de la organización) y reajusta la línea base para no refrescar dos veces.

## Cableado en un host

```tsx
const queryClient = useQueryClient()
const ws = useWebSocket()

attachCacheEpoch(axiosInstance)          // sdk: reporta la época + reintento ante estado desfasado
                                         //   (ApiProvider ya lo hace para su cliente)
useCacheEpochPush(ws)                    // sdk: mensaje CACHE_EPOCH_CHANGED
useCacheEpochSync({ queryClient })       // runtime-react: qué vaciar cuando cambia
```

## Reintento por estado desfasado

`isStaleStateError` reconoce SQLSTATE 0A000 («cached plan must not change result
type») y 26000 («prepared statement … does not exist») en errores lanzados,
errores de axios (`response.data.error.message`), `MarketplaceError` y cadenas.
Esos fallos ocurren antes de ejecutar la sentencia y el servidor ya descartó su
estado, por eso **un** reintento es seguro y suficiente. Nunca se reintenta dos
veces (marca `__metacoreStaleRetried`) ni otros errores.
