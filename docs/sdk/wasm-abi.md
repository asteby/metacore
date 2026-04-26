# WASM ABI (v1)

The metacore kernel can run addon backends as sandboxed WebAssembly modules
via [wazero](https://wazero.io). This document is the contract between the
guest (your addon) and the host (the kernel).

> ABI version: **1**. Bundled via `manifest.backend.runtime = "wasm"`.
> Implementation: `kernel/runtime/wasm/abi.go`.

## 1. Declaration

```json
"backend": {
  "runtime": "wasm",
  "entry": "backend/backend.wasm",
  "exports": ["resolve_ticket", "ping"],
  "memory_limit_mb": 64,
  "timeout_ms": 10000
}
```

Only symbols listed in `exports` can be dispatched by the host. Limits
default to 64 MiB and 10 s.

## 2. Required guest exports

Every WASM module MUST export:

### `memory`

The module's linear memory (default name `memory`). The host reads and
writes buffers through it.

### `alloc(size: i32) -> i32`

A bump (or pool) allocator the host calls to reserve `size` bytes in guest
memory before copying the request payload in. Return value is the guest
pointer. Must succeed for any size up to the configured memory limit.

### `<action_key>(ptr: i32, len: i32) -> i64`

One per entry in `exports`. `(ptr, len)` is the request body (JSON, by
convention). The return value is a **packed (ptr, len)** response:

```
result_i64 = (uint64(ptr) << 32) | uint64(len)
```

A return of `0` means "empty success". To signal an error, the guest writes
a JSON envelope of the form `{"error": "..."}` and the host-side surface
layer interprets it. Exceeding `timeout_ms` aborts the instance.

## 3. Host imports (module `metacore_host`)

The host module exposes these functions; all pointer arguments are i32 and
reference guest memory:

```
log(msgPtr i32, msgLen i32)
  -> void. Writes a structured log line tagged with the addon key.

env_get(keyPtr i32, keyLen i32) -> i64
  -> packed (ptr, len) in guest memory of the setting value, or 0 if missing.
     Backed by the installation's `settings` map; secrets are allowed.

http_fetch(urlPtr, urlLen, methPtr, methLen, bodyPtr, bodyLen i32) -> i64
  -> packed (ptr, len) of the response body. Subject to the addon's
     `http:fetch` capabilities and the egress SSRF guard (see capabilities.md).
```

The host allocates response buffers inside guest memory via `alloc`, writes
into them, and returns the packed pointer. The guest is responsible for
reading before triggering another allocation.

## 4. Minimal TinyGo example

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

## 5. Building

### With TinyGo directly

```bash
tinygo build -target=wasi -opt=z -no-debug -o backend/backend.wasm ./backend/
```

Flags explained:

- `-target=wasi` — enables WASI stdlib shims needed for `encoding/json`.
- `-opt=z` — optimize for size. Typical backends end up 100-400 KiB.
- `-no-debug` — drops DWARF sections; the host does not need them.

### With the CLI wrapper

```bash
metacore compile-wasm .
```

Equivalent to the command above, but with the correct flags and output path
derived from `manifest.backend.entry`.

## 6. Memory & reentrancy rules

- Each invocation runs in a **fresh module instance**. Globals do not
  persist between calls.
- The guest allocator may be a single-shot bump allocator; the host
  tolerates that since each call gets a new instance.
- Callbacks into host imports are synchronous. The host serializes
  invocations per installation.

## 7. Error surface

Return packed pointer to a JSON object. The recommended shape is:

```json
{ "error": { "code": "not_found", "message": "ticket 42 missing" } }
```

The host forwards this verbatim to the caller (webhook response, action
result, tool invocation). Panics and abort traps are reported as
`{"code": "runtime_error"}`.

## 8. Capability enforcement

Host imports check the addon's compiled capabilities before execution:

- `http_fetch` calls `Capabilities.CanFetch(url)`.
- No raw DB access from WASM — instead declare `db:read` / `db:write` and
  call the dedicated database import surface (roadmap, v2 ABI).

If an import is denied, the host returns a packed buffer whose JSON payload
contains `{"error":{"code":"forbidden","message":"..."}}`.
