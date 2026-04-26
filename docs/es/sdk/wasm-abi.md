# WASM ABI (v1)

El kernel de metacore puede correr backends de addons como módulos WebAssembly
sandboxed vía [wazero](https://wazero.io). Este documento es el contrato entre el
guest (tu addon) y el host (el kernel).

> Versión de ABI: **1**. Bundleado vía `manifest.backend.runtime = "wasm"`.
> Implementación: `kernel/runtime/wasm/abi.go`.

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
- Sin acceso DB raw desde WASM — en su lugar declará `db:read` / `db:write` y
  llamá a la superficie dedicada de import de base de datos (roadmap, ABI v2).

Si un import es negado, el host devuelve un buffer packeado cuyo payload JSON
contiene `{"error":{"code":"forbidden","message":"..."}}`.
