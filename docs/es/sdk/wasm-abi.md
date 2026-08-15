# WASM ABI (v1.7)

El kernel de metacore puede correr backends de addons como módulos WebAssembly
sandboxed vía [wazero](https://wazero.io). Este documento es el contrato entre el
guest (tu addon) y el host (el kernel).

> Versión de ABI: **1.7** — shipeada, no una propuesta. `metacore-kernel/runtime/wasm`
> es la única fuente de verdad; cada sección de abajo cita el archivo exacto.
> Bundleado vía `manifest.backend.runtime = "wasm"`.
> Implementación: `kernel/runtime/wasm/abi.go`.

### Historial de versiones

| Versión | Estado   | Cambios |
|---------|----------|---------|
| 1.0     | shipeada  | superficie inicial: `log`, `env_get`, `http_fetch`. |
| 1.1     | shipeada  | agrega `db_query` — SQL read-only scoped (§9). |
| ~1.2–1.4 | shipeada | `db_exec` (§10), `connector_get`/`http_request` (llamadas a terceros gateadas por capability), `event_emit` (§12). |
| 1.5     | shipeada  | `data_mutate` (§14) — create/update/delete declarativo sin SQL raw. |
| 1.6     | shipeada  | `data_query` (§15) — lookup declarativo filtrado por equality. |
| 1.7     | shipeada  | `data_batch` (§16) — batch atómico multi-mutación; `sequence_next` (§17) — contadores de folio. |

**Cada import del host devuelve el mismo envelope JSON `{success, data, meta}`**
— la misma convención que los handlers HTTP del kernel usan para respuestas de
API ordinarias, replicada acá para imports del host. `meta` siempre trae al
menos `addon`, `orgId` (cuando está seteado), y un int `envelopeVersion` sobre
el que los guests pueden gatear si la forma alguna vez tiene un breaking change.

## 1. Declaración

```json
"backend": {
  "runtime": "wasm",
  "entry": "backend/backend.wasm",
  "exports": ["resolve_ticket", "ping"],
  "memory_limit_mb": 64,
  "timeout_ms": 10000
}
```

Solo símbolos listados en `exports` pueden ser despachados por el host. Los límites
defaultean a 64 MiB y 10 s.

## 2. Exports requeridos del guest

Cada módulo WASM DEBE exportar:

### `memory`

La memoria lineal del módulo (nombre default `memory`). El host lee y
escribe buffers a través de ella.

### `alloc(size: i32) -> i32`

Un allocator de bump (o pool) que el host llama para reservar `size` bytes en la memoria
del guest antes de copiar el payload del request adentro. El valor de retorno es el puntero
del guest. Debe tener éxito para cualquier tamaño hasta el límite de memoria configurado.

### `<action_key>(ptr: i32, len: i32) -> i64`

Uno por entrada en `exports`. `(ptr, len)` es el body del request (JSON, por
convención). El valor de retorno es una respuesta **(ptr, len) packeada**:

```
result_i64 = (uint64(ptr) << 32) | uint64(len)
```

Un retorno de `0` significa "éxito vacío". Para señalar un error, el guest escribe
un envelope JSON de la forma `{"error": "..."}` y la capa de surface del host
lo interpreta. Exceder `timeout_ms` aborta la instancia.

## 3. Imports del host (módulo `metacore_host`)

El módulo del host expone estas funciones; todos los argumentos puntero son i32 y
referencian memoria del guest:

```
log(msgPtr i32, msgLen i32)
  -> void. Escribe una línea de log estructurada taggeada con la key del addon.

env_get(keyPtr i32, keyLen i32) -> i64
  -> packed (ptr, len) en memoria del guest del valor del setting, o 0 si falta.
     Respaldado por el map `settings` de la instalación; secrets están permitidos.

http_fetch(urlPtr, urlLen, methPtr, methLen, bodyPtr, bodyLen i32) -> i64
  -> packed (ptr, len) del body de la respuesta. Sujeto a las capabilities
     `http:fetch` del addon y al guard SSRF de egress (ver capabilities.md).

db_query(sqlPtr i32, sqlLen i32, argsPtr i32, argsLen i32) -> i64   [v1.1]
  -> packed (ptr, len) de un envelope JSON con rows. Scoped al schema propio
     del addon (`SET LOCAL search_path TO addon_<key>, public` por llamada) y
     gateado por capabilities `db:read` para cualquier referencia cross-schema.
     Read-only en v1.1 — ver § 9 para el contrato completo.
```

El host alloca buffers de respuesta dentro de la memoria del guest vía `alloc`, escribe
en ellos, y devuelve el puntero packeado. El guest es responsable de
leer antes de disparar otro alloc.

## 4. Ejemplo mínimo TinyGo

```go
// backend/main.go — stub que recibe payload y devuelve eco.
package main

import (
	"encoding/json"
	"unsafe"
)

//go:wasmimport metacore_host log
func hostLog(ptr, length uint32)

// alloc es el bump allocator que el host llama antes de escribir el payload.
//
//go:export alloc
func alloc(size uint32) uint32 {
	buf := make([]byte, size)
	return uint32(uintptr(unsafe.Pointer(&buf[0])))
}

// ping recibe (ptr, len) y devuelve un i64 packeado (ptr<<32)|len.
//
//go:export ping
func ping(ptr, length uint32) uint64 {
	in := unsafe.Slice((*byte)(unsafe.Pointer(uintptr(ptr))), length)
	var req struct{ Message string `json:"message"` }
	_ = json.Unmarshal(in, &req)

	msg := []byte("hello from wasm: " + req.Message)
	hostLog(uint32(uintptr(unsafe.Pointer(&msg[0]))), uint32(len(msg)))

	resp, _ := json.Marshal(map[string]string{"reply": "pong", "echo": req.Message})
	p := uint32(uintptr(unsafe.Pointer(&resp[0])))
	return (uint64(p) << 32) | uint64(len(resp))
}

func main() {} // requerido por tinygo
```

## 5. Build

### Con TinyGo directo

```bash
tinygo build -target=wasi -opt=z -no-debug -o backend/backend.wasm ./backend/
```

Flags explicados:

- `-target=wasi` — habilita los shims de stdlib WASI necesarios para `encoding/json`.
- `-opt=z` — optimiza por tamaño. Backends típicos terminan en 100-400 KiB.
- `-no-debug` — dropea secciones DWARF; el host no las necesita.

### Con el wrapper del CLI

```bash
metacore compile-wasm .
```

Equivalente al comando de arriba, pero con los flags correctos y el path de output
derivado de `manifest.backend.entry`.

## 6. Reglas de memoria y reentrancia

- Cada invocación corre en una **instancia fresca de módulo**. Las globales no
  persisten entre llamadas.
- El allocator del guest puede ser un bump allocator de un solo tiro; el host
  tolera eso ya que cada llamada recibe una nueva instancia.
- Los callbacks a imports del host son sincrónicos. El host serializa
  invocaciones por instalación.

## 7. Superficie de error

Devolvé un puntero packeado a un objeto JSON. La forma recomendada es:

```json
{ "error": { "code": "not_found", "message": "ticket 42 missing" } }
```

El host forwardea esto verbatim al caller (respuesta de webhook, resultado de
acción, invocación de tool). Pánicos y trap aborts son reportados como
`{"code": "runtime_error"}`.

## 8. Enforcement de capabilities

Los imports del host chequean las capabilities compiladas del addon antes de ejecutar:

- `http_fetch` llama a `Capabilities.CanFetch(url)`.
- `db_query` (v1.1) parsea el SQL, recorre cada relación referenciada, y
  llama a `Capabilities.CanReadModel(<schema>.<table>)` para cualquier referencia
  que resuelva fuera de `addon_<key>`. El schema propio del addon dueño siempre
  está permitido (capability implícita `addon_<key>.*`).

Si un import es negado, el host devuelve un buffer packeado cuyo payload JSON
contiene `{"error":{"code":"forbidden","message":"..."}}`.

## 9. `db_query` — SQL read-only scoped (v1.1)

`db_query` es el import de base de datos dedicado. Es intencionalmente angosto: un
único statement read-only, scoped al schema del addon, parametrizado, y
checkeado por capability. El SQL mutante pertenece a un import `db_exec` separado
(§10).

### 9.1 Firma

```
db_query(sqlPtr i32, sqlLen i32, argsPtr i32, argsLen i32) -> i64
```

| Param      | Tipo | Significado                                                             |
|------------|------|--------------------------------------------------------------------------|
| `sqlPtr`   | i32  | Puntero del guest al texto SQL.                                          |
| `sqlLen`   | i32  | Largo en bytes (UTF-8). Cap duro: 16 KiB.                                 |
| `argsPtr`  | i32  | Puntero del guest a un array JSON de argumentos posicionales. Puede ser `0`. |
| `argsLen`  | i32  | Largo del buffer del array JSON. `0` si la query no tiene parámetros.     |
| **return** | i64  | `(ptr<<32)\|len` packeado del envelope de respuesta (ver § 9.4).          |

Un retorno de `0` está reservado y actualmente nunca se produce — `db_query`
siempre aloca un envelope, incluso para resultados de cero filas.

### 9.2 Contrato SQL

- **Read-only**: solo `SELECT` (y `WITH … SELECT`) se acepta en v1.1.
  Cualquier otro statement top-level (`INSERT`, `UPDATE`, `DELETE`, `MERGE`,
  `CREATE`, `DROP`, `ALTER`, `TRUNCATE`, `COPY`, `GRANT`, `SET`, `CALL`,
  `DO`, `LISTEN`, `NOTIFY`, `BEGIN`, `COMMIT`) es rechazado con
  `invalid_sql`.
- **Statement único**: el input se parsea en una lista de statements y debe
  contener exactamente un nodo. `;` al final se tolera; payloads multi-statement
  son rechazados con `invalid_sql`.
- **Parámetros**: los placeholders posicionales usan sintaxis Postgres (`$1`, `$2`,
  …). El count de args debe igualar el índice de placeholder más alto — si no,
  `arg_count_mismatch`.
- **Sin `SET search_path`**: el host emite `SET LOCAL search_path` en
  cada llamada y rechaza overrides del lado guest en tiempo de parseo.
- **Sin lookups a `pg_*` / `information_schema`** en v1.1 — se filtran para
  mantener la superficie explicable. (La introspección de schema tiene su
  propio import dedicado en el roadmap.)

### 9.3 Scope de schema y check de capability

El host envuelve cada invocación en un `SET LOCAL search_path TO addon_<key>,
public` scoped a la transacción. Los nombres de tabla pelados por lo tanto
resuelven contra el schema propio del addon primero.

Para cada referencia de relación parseada, el host computa un `<schema>.<table>`
totalmente calificado y decide:

| Referencia                         | Resultado                                                                |
|-------------------------------------|---------------------------------------------------------------------------|
| Nombre pelado resuelto a `addon_<key>` | Permitido. Capability implícita `addon_<key>.*`.                       |
| `addon_<key>.<table>` (calificado)  | Permitido.                                                                 |
| `public.<table>` u otro schema      | Requiere `db:read <schema>.<table>` o `db:read <schema>.*`.               |
| `pg_*` / `information_schema.*`     | Siempre denegado (`forbidden`, `reason: "introspection_disabled"`).       |

El scoping cross-tenant (filtros de org) es **ortogonal** y aplicado por el
host de forma transparente para cualquier modelo que tenga una columna `org_id` — ver
`kernel/docs/permissions.md` para las reglas row-level.

### 9.4 Envelope de respuesta

La respuesta sigue la convención `{success, data, meta}` del kernel:

```json
{
  "success": true,
  "data": {
    "rows":    [ { "id": 1, "title": "..." }, … ],
    "rowCount": 42,
    "columns": [
      { "name": "id",    "type": "int8" },
      { "name": "title", "type": "text" }
    ]
  },
  "meta": {
    "schema":     "addon_tickets",
    "durationMs": 7,
    "truncated":  false
  }
}
```

Los errores comparten la misma forma externa:

```json
{
  "success": false,
  "error":   { "code": "forbidden", "message": "addon \"tickets\" lacks db:read \"billing.invoices\"" },
  "meta":    { "schema": "addon_tickets", "durationMs": 1 }
}
```

Códigos de error definidos:

| Code                  | Cuándo                                                              |
|-----------------------|-----------------------------------------------------------------------|
| `invalid_sql`         | Fallo de parseo, multi-statement, no-`SELECT`, construct prohibido.   |
| `arg_count_mismatch`  | Placeholder `$N` más alto ≠ largo de args JSON.                       |
| `arg_decode`          | `argsPtr/argsLen` no es JSON válido o contiene un tipo no soportado.  |
| `forbidden`           | El check de capability falló para una de las relaciones referenciadas.|
| `query_timeout`       | El statement excedió el deadline de DB por llamada (default 5 s, ver § 9.5). |
| `row_limit_exceeded`  | El result set excedió el cap de filas configurado (default 10 000).  |
| `db_error`            | Error del driver/SQL subyacente (mensaje redacted, código preservado).|

### 9.5 Límites

| Knob                | Default | Configurable vía                                    |
|----------------------|---------|-------------------------------------------------------|
| Largo SQL máximo    | 16 KiB  | lado host (config de `runtime/wasm`).                 |
| Args máximos         | 64      | lado host.                                             |
| Deadline por llamada | 5 s     | acotado por `manifest.backend.timeout_ms` (gana el menor). |
| Filas máximas        | 10 000  | lado host; emite `row_limit_exceeded` al pasarlo.      |
| Bytes de respuesta máx | 8 MiB | lado host; espeja el cap de `http_fetch`.              |

### 9.6 Tipos de argumento permitidos

Los args JSON se decodean a los tipos nativos del driver así:

| JSON                      | Tipo de parámetro Postgres  |
|---------------------------|-------------------------------|
| `null`                    | `NULL`                        |
| `true` / `false`          | `bool`                         |
| literal entero            | `int8`                         |
| literal flotante          | `float8`                       |
| string                    | `text`                          |
| `{"$bytes": "<base64>"}`  | `bytea`                         |
| `{"$uuid":  "<uuid>"}`    | `uuid`                          |
| `{"$ts":    "<RFC3339>"}` | `timestamptz`                   |

Arrays/objetos JSON planos son rechazados con `arg_decode` — el round-trip
`jsonb` a nivel driver es intencionalmente explícito (`{"$jsonb": …}` está
reservado para cuando el encoding anidado esté finalizado).

### 9.7 Ejemplo mínimo TinyGo

```go
//go:wasmimport metacore_host db_query
func hostDBQuery(sqlPtr, sqlLen, argsPtr, argsLen uint32) uint64

func listOpenTickets(assignee string) ([]byte, error) {
	const sql = "SELECT id, title FROM tickets WHERE assignee = $1 AND status = 'open'"
	args := []byte(`["` + assignee + `"]`) // pre-escapado para el ejemplo

	sp := uint32(uintptr(unsafe.Pointer(unsafe.StringData(sql))))
	ap := uint32(uintptr(unsafe.Pointer(&args[0])))
	res := hostDBQuery(sp, uint32(len(sql)), ap, uint32(len(args)))
	if res == 0 {
		return nil, errors.New("empty response")
	}
	ptr := uint32(res >> 32)
	n   := uint32(res)
	return unsafe.Slice((*byte)(unsafe.Pointer(uintptr(ptr))), n), nil
}
```

El SDK de TypeScript incluye un wrapper delgado (`@asteby/metacore-addon-sdk`):

```ts
const { rows } = await db.query<{ id: number; title: string }>(
  'SELECT id, title FROM tickets WHERE assignee = $1',
  [assignee],
)
```

### 9.8 Declaraciones en el manifest

Leer el schema propio del addon no necesita declaración. Leer cualquier otra cosa
requiere capabilities explícitas — igual que hoy:

```json
"capabilities": [
  { "kind": "db:read", "target": "users",          "reason": "Show ticket author names" },
  { "kind": "db:read", "target": "addon_billing.*", "reason": "Cross-link invoices" }
]
```

### 9.9 Fuera de scope para v1.1

`db_exec` shipeó desde que se escribió esta sección — ver [§10](#10-db_exec--sql-mutante-v12). Los ítems que quedan abajo siguen fuera de scope al momento de escribir esto:

- Cursores en streaming. v1.1 buffea el result set completo en memoria del host;
  los reportes grandes deberían pre-agregar en SQL.
- Caching de prepared statements entre invocaciones. Cada llamada re-prepara.
- Introspección de schema (`information_schema`). Un import dedicado va a
  exponer un subset curado.

## 10. `db_exec` — SQL mutante (v1.2)

Gemelo mutante de `db_query` ([§9](#9-db_query--sql-read-only-scoped-v11)).
Implementación: `kernel/runtime/wasm/dbexec.go`.

- Misma forma de request que `db_query` (`sql` + `args` posicionales), gateado por
  `db:write` en vez de `db:read`. Los límites espejan a `db_query`: 16 KiB de texto
  SQL, 64 args, 8 MiB de respuesta, deadline de 5s.
- `validateMutationOnly` rechaza DDL, payloads multi-statement, keywords
  prohibidas, y schemas de introspección **en la capa de string** antes de
  parsear.
- `extractMutationRelations` parsea el SQL con `libpg_query` y extrae
  cada `(schema, table)` referenciada del AST: el target del DML se
  taggea `db:write`, y cada fuente read-only (`UPDATE … FROM`,
  `DELETE … USING`, source de `MERGE`, `INSERT … SELECT`, subqueries de
  `RETURNING`/`WHERE`, cuerpos de CTE) se taggea `db:read` — **cada una se
  chequea individualmente** contra las capabilities declaradas del addon, así
  que un write al schema propio que lee una columna joineada de la tabla de
  otro addon igual necesita esa capability `db:read` de esa tabla declarada.
- **Reuso de transacción**: cuando el action handler que invoca ya tiene una
  transacción `*gorm.DB` abierta, `db_exec` se monta sobre ella (así que una
  acción WASM y el handler Go que la rodea commitean/rollbackean juntos); sin
  una tx abierta, el import abre la suya propia de vida corta. Este es el
  único import del host que comparte la transacción de un caller —
  `data_mutate`/`data_query`/`data_batch` deliberadamente no lo hacen (ver
  [§14](#14-data_mutate--writes-declarativos-desde-un-guest)).

Preferí `data_mutate` sobre INSERT/UPDATE/DELETE raw de `db_exec` siempre que
el target sea un create/update/delete de fila simple — te da eventos
canónicos, awareness de soft-delete y el guard de columnas reservadas gratis.
Recurrí a `db_exec` cuando genuinamente necesitás un statement mutante
escrito a mano (un `UPDATE … WHERE` bulk, un write multi-tabla en un solo
round trip).

## 12. `event_emit` — publicar un evento canónico/custom

Implementación: `kernel/runtime/wasm/eventemit.go`.

Publica un evento en el event bus del host para que los hooks
`Model.on_transition[]` de otros addons, webhooks, o subscriptions puedan
reaccionar. Respuesta:

```json
{
  "success": true,
  "data": { "event": "<addon>.<model>.<action>", "subscribers": 3 },
  "meta": {
    "addon": "tickets", "orgId": "...",
    "emittedAt": "2026-08-15T12:00:00.000000000Z",
    "durationMs": 2, "envelopeVersion": 1
  }
}
```

Declará los nombres de evento emitidos bajo `extension_points.events[]`
([manifest-spec.md §12](./manifest-spec#12-extension_points)) para que otros
autores puedan descubrirlos y suscribirse.

## 14. `data_mutate` — writes declarativos desde un guest

Implementación: `kernel/runtime/wasm/datamutate.go`. Esta es la **forma
recomendada** para que un handler WASM cree/actualice/borre una fila —
preferila sobre escribir SQL de `db_exec` a mano siempre que el write sea una
mutación simple de una sola fila, porque te da publicación de evento canónico
y el guard de columnas reservadas automáticamente.

### 14.1 Request

```json
{
  "op": "update",
  "table": "tickets",
  "model": "Ticket",
  "id": "9d1e...",
  "data": { "status": "resolved" },
  "inc": { "reopen_count": 1 },
  "returning": true
}
```

| Campo | Significado |
|---|---|
| `op` | `create` \| `update` \| `delete`. |
| `table` | Nombre de tabla lógico, no calificado. |
| `model` | Key canónica del modelo, estampada en `CanonicalEvent.Model` del resultado. |
| `id` | Requerido para `update`/`delete`; opcional en `create`. |
| `data` | `create`: valores de columna. `update`: SETs **absolutos**. |
| `inc` | Solo `update`: `SET col = col + delta`, evaluado **atómicamente en SQL** — la forma segura de decrementar stock o subir un contador desde un guest sin una race de read-then-write. |
| `returning` | Si la respuesta incluye la fila escrita. |

`organization_id` está **deliberadamente ausente** del request — el scope de
tenant siempre viene del contexto de invocación, nunca del guest (la misma
regla que `event_emit`). Columnas reservadas que un guest nunca puede
escribir directamente vía `data`/`inc`: `id`, `organization_id`,
`created_at`, `updated_at`, `deleted_at` — todas estampadas por el host. Cada
nombre de tabla/columna se chequea contra `^[a-z_][a-z0-9_]{0,62}$` antes de
interpolarse en SQL.

### 14.2 Sin transacción cross-call, sin `FOR UPDATE`

**`data_mutate` siempre abre su propia transacción de vida corta** en cada
llamada — nunca se monta sobre la transacción abierta de un action handler
(a diferencia de `db_exec`, [§10](#10-db_exec--sql-mutante-v12)). Esto es
deliberado: el evento canónico publicado después del commit tiene que
describir estado *committed*; publicar desde dentro de una transacción
propiedad del caller emitiría eventos fantasma si la acción que la rodea
después hace rollback.

La consecuencia práctica: **no hay primitivo de locking cross-call visible
para el guest**. Un guest no puede abrir una transacción, hacer
`SELECT … FOR UPDATE`, correr lógica del lado WASM, y después commitear —
cada llamada a un import del host es su propia unidad atómica. La seguridad
de concurrencia para un patrón increment-then-check (stock nunca negativo
bajo decrementos concurrentes) se logra **de dos formas, ninguna del lado
guest**:

1. Usar `inc{}` para el delta en sí — es un único `SET col = col + delta`
   atómico en SQL, libre de race por construcción.
2. Combinarlo con `Model.locking: "row"` + un guard `Column.constraints[]`
   (`"expr": "quantity >= 0"`) declarado en el manifest
   ([manifest-spec.md §5.8](./manifest-spec#58-locking-y-constraints))
   — el write path Go del kernel (no el guest WASM) envuelve el update en
   `SELECT … FOR UPDATE` y evalúa el constraint antes de commitear.

Si el invariante de tu handler necesita tocar más de una fila atómicamente,
recurrí a [`data_batch`](#16-data_batch--batch-atómico-multi-mutación-v17)
(una transacción, muchas mutaciones) en vez de intentar simular un lock
cross-call desde el guest.

### 14.3–14.5 Envelope, límites, resolución de tabla

Forma de respuesta: `{success, data:{id, model, action, before?, after?}, meta}`
— la misma convención `{success, data, meta}` que cualquier otro import.
Límites: 64 KiB de request (más alto que el cap de SQL de `db_query` porque
el payload carga datos de columna), 8 MiB de respuesta, deadline de 5s. La
resolución de tabla pasa por el `TableResolver` inyectado por el host (la
misma resolución que usa el runtime dinámico de CRUD del host embebedor —
en ops, los nombres no calificados resuelven a `public.*`) — **no** el
search path de schema de addon que usa `db_exec`, así que escribir a través
de `data_mutate` aterriza en la tabla viva que la UI realmente lee, no en
una copia sombra `addon_<key>.*`.

## 15. `data_query` — lookup declarativo filtrado por equality

Implementación: `kernel/runtime/wasm/dataquery_records.go`. El hermano
read-only de `data_mutate`, para un guest que necesita buscar filas por
filtros de equality simples sin escribir SQL raw (y sin la superficie más
amplia que expone `db_query`).

```json
{ "table": "customers", "where": { "email": "a@b.com" }, "limit": 20 }
```

`where` es **solo-equality** — sin operadores, sin `LIKE`, sin rangos
(recurrí a `db_query` si necesitás eso). `organization_id` y `deleted_at`
están bloqueados en `where` — el host inyecta el filtro de tenant él mismo
y agrega `deleted_at IS NULL` automáticamente cuando la tabla es
soft-deletable, así que un guest solo ve filas vivas, scoped a org. `limit`
defaultea a 50, con cap duro en 200 — deliberadamente muy por debajo del cap
de filas de `db_query`, porque este es un primitivo de lookup (resolver una
FK, chequear una precondición de unicidad), no un pipe de export/reporte.
Mismo cap de 64 KiB de request / 8 MiB de respuesta / deadline de 5s que
`data_mutate`, y el mismo `TableResolver` (no el search path de schema de
addon). No se publican eventos — es un read puro.

## 16. `data_batch` — batch atómico multi-mutación (v1.7)

Implementación: `kernel/runtime/wasm/databatch.go`. Corre una **lista
ordenada** de mutaciones con forma de `data_mutate` dentro de **una**
transacción scoped a org — usalo cuando el invariante de un handler abarca
más de una fila (ej. debitar una cuenta y acreditar otra, o decrementar el
child que respalda un rollup del padre junto con crear una entrada de
ledger) y necesita semántica de todo-o-nada que una secuencia de llamadas
individuales de `data_mutate` no te puede dar.

```json
{ "mutations": [
  { "op": "update", "table": "accounts", "id": "...", "inc": { "balance": -100 } },
  { "op": "update", "table": "accounts", "id": "...", "inc": { "balance":  100 } }
] }
```

Mismo cap de 64 KiB de request que `data_mutate` (el techo congelado del
request del ABI), más un cap independiente de **100 mutaciones por batch**
para que un payload patológico de puras filas chiquitas no pueda abrir una
transacción ilimitada. 8 MiB de respuesta, deadline de 10s (más largo que
una llamada individual de `data_mutate` ya que cubre todo el batch). La
respuesta `data.results[]` espeja el orden del request, cada entrada
llevando `{id, model, action, before?, after?}`.

## 17. `sequence_next` — contador de folio atómico

Implementación: `kernel/runtime/wasm/sequencenext.go`. Emite el próximo
valor formateado para un contador `Model.sequences[]`
([manifest-spec.md §5.4](./manifest-spec#54-sequences)) desde dentro de un
handler guest — el gemelo WASM del auto-estampado de `Column.sequence` en
create, para casos donde el folio se necesita mid-handler en vez de al
momento de crear la fila.

```json
{ "model": "Invoice", "key": "folio" }
```

```json
{ "success": true, "data": { "value": "A-000042" }, "meta": { "envelopeVersion": 1, "..." } }
```

Respaldado por el backend de sequence inyectado por el embedder
(`Host.WithSequenceNext`); el incremento es atómico (`UPDATE … RETURNING`)
así que llamadas concurrentes de guests nunca colisionan sobre el mismo
folio.

## Ver también

- [`manifest-spec.md`](./manifest-spec) — la referencia completa de campos del manifest v3, incluyendo `backend{}` y `Model.locking`/`constraints[]`.
- [`addon-cookbook.md`](./addon-cookbook) — recetas de addons end-to-end.
- [`capabilities.md`](./capabilities) — el catálogo completo de `kind` que gatea cada import del host de arriba.
