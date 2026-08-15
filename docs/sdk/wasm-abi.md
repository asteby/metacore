# WASM ABI (v1.7)

The metacore kernel can run addon backends as sandboxed WebAssembly modules
via [wazero](https://wazero.io). This document is the contract between the
guest (your addon) and the host (the kernel).

> ABI version: **1.7** — shipped, not a proposal. `metacore-kernel/runtime/wasm`
> is the single source of truth; every section below cites the exact file.
> Bundled via `manifest.backend.runtime = "wasm"`.
> Implementation: `kernel/runtime/wasm/abi.go`.

### Version history

| Version | Status   | Changes |
|---------|----------|---------|
| 1.0     | shipped  | initial surface: `log`, `env_get`, `http_fetch`. |
| 1.1     | shipped  | adds `db_query` — scoped read-only SQL (§9). |
| ~1.2–1.4 | shipped | `db_exec` (§10), `connector_get`/`http_request` (capability-gated third-party calls), `event_emit` (§12). |
| 1.5     | shipped  | `data_mutate` (§14) — declarative create/update/delete without raw SQL. |
| 1.6     | shipped  | `data_query` (§15) — declarative equality-filtered lookup. |
| 1.7     | shipped  | `data_batch` (§16) — multi-mutation atomic batch; `sequence_next` (§17) — folio counters. |

**Every host import returns the same `{success, data, meta}` JSON envelope**
— the same convention the kernel's HTTP handlers use for ordinary API
responses, mirrored here for host imports. `meta` always carries at least
`addon`, `orgId` (when set), and an `envelopeVersion` int guests can gate on
if the shape ever grows a breaking change.

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

db_query(sqlPtr i32, sqlLen i32, argsPtr i32, argsLen i32) -> i64   [v1.1]
  -> packed (ptr, len) of a JSON envelope with rows. Scoped to the addon's
     own schema (`SET LOCAL search_path TO addon_<key>, public` per call) and
     gated by `db:read` capabilities for any cross-schema reference. Read-only
     in v1.1 — see § 9 for the full contract.
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
- `db_query` (v1.1) parses the SQL, walks every referenced relation, and
  calls `Capabilities.CanReadModel(<schema>.<table>)` for any reference
  that resolves outside `addon_<key>`. The owning addon's own schema is
  always permitted (implicit `addon_<key>.*`).

If an import is denied, the host returns a packed buffer whose JSON payload
contains `{"error":{"code":"forbidden","message":"..."}}`.

## 9. `db_query` — scoped read-only SQL (v1.1)

`db_query` is the dedicated database import. It is intentionally narrow: a
single read-only statement, scoped to the addon's schema, parameterised, and
capability-checked. Mutating SQL belongs to a separate `db_exec` import that
will land in a future minor version.

### 9.1 Signature

```
db_query(sqlPtr i32, sqlLen i32, argsPtr i32, argsLen i32) -> i64
```

| Param      | Type | Meaning                                                                |
|------------|------|------------------------------------------------------------------------|
| `sqlPtr`   | i32  | Guest pointer to the SQL text.                                         |
| `sqlLen`   | i32  | Length in bytes (UTF-8). Hard cap: 16 KiB.                             |
| `argsPtr`  | i32  | Guest pointer to a JSON array of positional arguments. May be `0`.     |
| `argsLen`  | i32  | Length of the JSON array buffer. `0` if the query has no parameters.   |
| **return** | i64  | Packed `(ptr<<32)\|len` of the response envelope (see § 9.4).          |

A return of `0` is reserved and currently never produced — `db_query` always
allocates an envelope, even for zero-row results.

### 9.2 SQL contract

- **Read-only**: only `SELECT` (and `WITH … SELECT`) is accepted in v1.1.
  Any other top-level statement (`INSERT`, `UPDATE`, `DELETE`, `MERGE`,
  `CREATE`, `DROP`, `ALTER`, `TRUNCATE`, `COPY`, `GRANT`, `SET`, `CALL`,
  `DO`, `LISTEN`, `NOTIFY`, `BEGIN`, `COMMIT`) is rejected with
  `invalid_sql`.
- **Single statement**: the input is parsed into a statement list and must
  contain exactly one node. Trailing `;` is tolerated; multi-statement
  payloads are rejected with `invalid_sql`.
- **Parameters**: positional placeholders use Postgres syntax (`$1`, `$2`,
  …). The arg count must equal the highest placeholder index — otherwise
  `arg_count_mismatch`.
- **No `SET search_path`**: the host issues `SET LOCAL search_path` on
  every call and rejects guest-side overrides at parse time.
- **No `pg_*` / `information_schema`** lookups in v1.1 — these are
  filtered to keep the surface explainable. (Schema introspection has its
  own dedicated import on the roadmap.)

### 9.3 Schema scope & capability check

The host wraps every invocation in a transaction-scoped `SET LOCAL
search_path TO addon_<key>, public`. Bare table names therefore resolve
against the addon's own schema first.

For each parsed relation reference the host computes a fully-qualified
`<schema>.<table>` and decides:

| Reference                         | Outcome                                                                  |
|-----------------------------------|--------------------------------------------------------------------------|
| Bare name resolved into `addon_<key>` | Allowed. Implicit `addon_<key>.*` capability.                        |
| `addon_<key>.<table>` (qualified) | Allowed.                                                                 |
| `public.<table>` or other schema  | Requires `db:read <schema>.<table>` or `db:read <schema>.*`.             |
| `pg_*` / `information_schema.*`   | Always denied (`forbidden`, `reason: "introspection_disabled"`).         |

Cross-tenant scoping (org filters) is **orthogonal** and applied by the
host transparently for any model that carries an `org_id` column — see
`kernel/docs/permissions.md` for the row-level rules.

### 9.4 Response envelope

The response follows the kernel `{success, data, meta}` convention:

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

Errors share the same outer shape:

```json
{
  "success": false,
  "error":   { "code": "forbidden", "message": "addon \"tickets\" lacks db:read \"billing.invoices\"" },
  "meta":    { "schema": "addon_tickets", "durationMs": 1 }
}
```

Defined error codes:

| Code                  | When                                                                |
|-----------------------|---------------------------------------------------------------------|
| `invalid_sql`         | Parse failure, multi-statement, non-`SELECT`, banned construct.     |
| `arg_count_mismatch`  | Highest `$N` placeholder ≠ JSON args length.                        |
| `arg_decode`          | `argsPtr/argsLen` is not valid JSON or contains an unsupported type.|
| `forbidden`           | Capability check failed for one of the referenced relations.        |
| `query_timeout`       | Statement exceeded the per-call DB deadline (default 5 s, see § 9.5).|
| `row_limit_exceeded`  | Result set exceeded the configured row cap (default 10 000).        |
| `db_error`            | Underlying driver/SQL error (message redacted, code preserved).     |

### 9.5 Limits

| Knob                | Default | Configurable via                                  |
|---------------------|---------|---------------------------------------------------|
| Max SQL length      | 16 KiB  | host-side (`runtime/wasm` config).                |
| Max args            | 64      | host-side.                                        |
| Per-call deadline   | 5 s     | bounded by `manifest.backend.timeout_ms` (lower wins). |
| Max rows            | 10 000  | host-side; emits `row_limit_exceeded` past it.    |
| Max response bytes  | 8 MiB   | host-side; mirrors the `http_fetch` cap.          |

### 9.6 Allowed argument types

JSON args are decoded into the driver's native types as follows:

| JSON                      | Postgres parameter type    |
|---------------------------|----------------------------|
| `null`                    | `NULL`                     |
| `true` / `false`          | `bool`                     |
| integer literal           | `int8`                     |
| floating literal          | `float8`                   |
| string                    | `text`                     |
| `{"$bytes": "<base64>"}`  | `bytea`                    |
| `{"$uuid":  "<uuid>"}`    | `uuid`                     |
| `{"$ts":    "<RFC3339>"}` | `timestamptz`              |

Plain JSON arrays/objects are rejected with `arg_decode` — the driver-level
`jsonb` round-trip is intentionally explicit (`{"$jsonb": …}` is reserved
for v1.2 once nested encoding is finalised).

### 9.7 Minimal TinyGo example

```go
//go:wasmimport metacore_host db_query
func hostDBQuery(sqlPtr, sqlLen, argsPtr, argsLen uint32) uint64

func listOpenTickets(assignee string) ([]byte, error) {
	const sql = "SELECT id, title FROM tickets WHERE assignee = $1 AND status = 'open'"
	args := []byte(`["` + assignee + `"]`) // pre-escape for the example

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

The TypeScript SDK ships a thin wrapper (`@asteby/metacore-addon-sdk`):

```ts
const { rows } = await db.query<{ id: number; title: string }>(
  'SELECT id, title FROM tickets WHERE assignee = $1',
  [assignee],
)
```

### 9.8 Manifest declarations

Reading the addon's own schema needs no declaration. Reading anything else
requires explicit capabilities — same as today:

```json
"capabilities": [
  { "kind": "db:read", "target": "users",          "reason": "Show ticket author names" },
  { "kind": "db:read", "target": "addon_billing.*", "reason": "Cross-link invoices" }
]
```

### 9.9 Out of scope for v1.1

`db_exec` shipped since this section was written — see [§10](#10-db_exec--mutating-sql-v12). The remaining items below stayed out of scope as of this writing:

- Streaming cursors. v1.1 buffers the full result set in host memory; large
  reports should pre-aggregate in SQL.
- Prepared-statement caching across invocations. Each call re-prepares.
- Schema introspection (`information_schema`). A dedicated import will
  expose a curated subset.

## 10. `db_exec` — mutating SQL (v1.2)

Mutating twin of `db_query` ([§9](#9-db_query--scoped-read-only-sql-v11)).
Implementation: `kernel/runtime/wasm/dbexec.go`.

- Same request shape as `db_query` (`sql` + positional `args`), gated by
  `db:write` instead of `db:read`. Limits mirror `db_query`: 16 KiB SQL
  text, 64 args, 8 MiB response, 5s deadline.
- `validateMutationOnly` rejects DDL, multi-statement payloads, banned
  keywords, and introspection schemas **at the string layer** before
  parsing.
- `extractMutationRelations` parses the SQL with `libpg_query` and pulls
  every `(schema, table)` referenced out of the AST: the DML target is
  tagged `db:write`, and every read-only source (`UPDATE … FROM`,
  `DELETE … USING`, `MERGE` source, `INSERT … SELECT`, `RETURNING`/`WHERE`
  subqueries, CTE bodies) is tagged `db:read` — **each is checked
  individually** against the addon's declared capabilities, so a write to
  one's own schema that reads a joined column from another addon's table
  still needs that table's `db:read` capability declared.
- **Transaction reuse**: when the invoking action handler already has an
  open `*gorm.DB` transaction, `db_exec` piggy-backs on it (so a WASM
  action and the surrounding Go handler commit/rollback together); with no
  open tx, the import opens its own short-lived one. This is the one host
  import that shares a caller's transaction — `data_mutate`/`data_query`/
  `data_batch` deliberately do not (see [§14](#14-data_mutate--declarative-writes-from-a-guest)).

Prefer `data_mutate` over raw `db_exec` INSERT/UPDATE/DELETE whenever the
target is a simple row create/update/delete — it gets you canonical events,
soft-delete awareness and the reserved-column guard for free. Reach for
`db_exec` when you genuinely need a hand-written mutating statement (a
bulk `UPDATE … WHERE`, a multi-table write in one round trip).

## 12. `event_emit` — publish a canonical/custom event

Implementation: `kernel/runtime/wasm/eventemit.go`.

Publishes an event on the host's event bus so other addons' `Model.on_transition[]`
hooks, webhooks, or subscriptions can react. Response:

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

Declare emitted event names under `extension_points.events[]`
([manifest-spec.md §12](./manifest-spec#12-extension_points)) so other
authors can discover and subscribe to them.

## 14. `data_mutate` — declarative writes from a guest

Implementation: `kernel/runtime/wasm/datamutate.go`. This is the
**recommended way** for a WASM handler to create/update/delete a row —
prefer it over hand-writing `db_exec` SQL whenever the write is a simple
single-row mutation, because it gets you canonical-event publication and
the reserved-column guard automatically.

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

| Field | Meaning |
|---|---|
| `op` | `create` \| `update` \| `delete`. |
| `table` | Logical, unqualified table name. |
| `model` | Canonical model key, stamped onto the resulting `CanonicalEvent.Model`. |
| `id` | Required for `update`/`delete`; optional on `create`. |
| `data` | `create`: column values. `update`: **absolute** SETs. |
| `inc` | `update` only: `SET col = col + delta`, evaluated **atomically in SQL** — the safe way to decrement stock or bump a counter from a guest without a read-then-write race. |
| `returning` | Whether the response includes the written row. |

`organization_id` is **deliberately absent** from the request — tenant
scope always comes from the invocation context, never from the guest (the
same rule as `event_emit`). Reserved columns a guest may never write
directly through `data`/`inc`: `id`, `organization_id`, `created_at`,
`updated_at`, `deleted_at` — all host-stamped. Every table/column name is
checked against `^[a-z_][a-z0-9_]{0,62}$` before it is interpolated into
SQL.

### 14.2 No cross-call transaction, no `FOR UPDATE`

**`data_mutate` always opens its own short-lived transaction** on each
call — it never piggy-backs on an action handler's open transaction (unlike
`db_exec`, [§10](#10-db_exec--mutating-sql-v12)). This is deliberate: the
canonical event published after commit must describe *committed* state;
publishing from inside a caller-owned transaction would emit phantom events
if the surrounding action later rolled back.

The practical consequence: **there is no guest-visible cross-call locking
primitive**. A guest cannot open a transaction, `SELECT … FOR UPDATE`, do
some WASM-side logic, then commit — each host import call is its own
atomic unit. Concurrency safety for an increment-then-check pattern (stock
never negative under concurrent decrements) is achieved **two ways, neither
of them guest-side**:

1. Use `inc{}` for the delta itself — it's a single atomic `SET col = col + delta`
   in SQL, race-free by construction.
2. Pair it with `Model.locking: "row"` + a `Column.constraints[]` guard
   (`"expr": "quantity >= 0"`) declared in the manifest
   ([manifest-spec.md §5.8](./manifest-spec#58-locking-and-constraints))
   — the kernel's Go write path (not the WASM guest) wraps the update in
   `SELECT … FOR UPDATE` and evaluates the constraint before committing.

If your handler's invariant needs more than one row touched atomically,
reach for [`data_batch`](#16-data_batch--atomic-multi-mutation-batch-v17)
(one transaction, many mutations) rather than trying to simulate a
cross-call lock from the guest.

### 14.3–14.5 Envelope, limits, table resolution

Response shape: `{success, data:{id, model, action, before?, after?}, meta}`
— same `{success, data, meta}` convention as every other import. Limits:
64 KiB request (higher than `db_query`'s SQL cap because the payload carries
column data), 8 MiB response, 5s deadline. Table resolution goes through the
host-injected `TableResolver` (the same resolution the embedding host's
dynamic CRUD runtime uses — in ops, unqualified names resolve to `public.*`)
— **not** the addon-schema search path `db_exec` uses, so writing through
`data_mutate` lands in the live table the UI actually reads, not a shadow
`addon_<key>.*` copy.

## 15. `data_query` — declarative equality-filtered lookup

Implementation: `kernel/runtime/wasm/dataquery_records.go`. The read-only
sibling of `data_mutate`, for a guest that needs to look up rows by simple
equality filters without writing raw SQL (and without the broader surface
`db_query` exposes).

```json
{ "table": "customers", "where": { "email": "a@b.com" }, "limit": 20 }
```

`where` is **equality-only** — no operators, no `LIKE`, no ranges (reach for
`db_query` if you need that). `organization_id` and `deleted_at` are
blocked from `where` — the host injects the tenant filter itself and
appends `deleted_at IS NULL` automatically when the table is soft-
deletable, so a guest only ever sees live, org-scoped rows. `limit`
defaults to 50, hard-capped at 200 — deliberately far below `db_query`'s
row cap, because this is a lookup primitive (resolve an FK, check a
uniqueness precondition), not an export/report pipe. Same 64 KiB
request / 8 MiB response / 5s deadline as `data_mutate`, and the same
`TableResolver` (not the addon-schema search path). No events are
published — it's a pure read.

## 16. `data_batch` — atomic multi-mutation batch (v1.7)

Implementation: `kernel/runtime/wasm/databatch.go`. Runs an **ordered list**
of `data_mutate`-shaped mutations inside **one** org-scoped transaction —
use it when a handler's invariant spans more than one row (e.g. debit one
account and credit another, or decrement a parent's rollup-backing child
alongside creating a ledger entry) and needs all-or-nothing semantics that
a sequence of individual `data_mutate` calls cannot give you.

```json
{ "mutations": [
  { "op": "update", "table": "accounts", "id": "...", "inc": { "balance": -100 } },
  { "op": "update", "table": "accounts", "id": "...", "inc": { "balance":  100 } }
] }
```

Same 64 KiB request cap as `data_mutate` (the ABI's frozen request
ceiling), plus an independent cap of **100 mutations per batch** so a
pathological all-tiny-rows payload can't open an unbounded transaction.
8 MiB response, 10s deadline (longer than a single `data_mutate` call since
it covers the whole batch). Response `data.results[]` mirrors the request
order, each entry carrying `{id, model, action, before?, after?}`.

## 17. `sequence_next` — atomic folio counter

Implementation: `kernel/runtime/wasm/sequencenext.go`. Issues the next
formatted value for a `Model.sequences[]` counter
([manifest-spec.md §5.4](./manifest-spec#54-sequences)) from inside a
guest handler — the WASM twin of `Column.sequence` auto-stamping on create,
for cases where the folio is needed mid-handler rather than at row-create
time.

```json
{ "model": "Invoice", "key": "folio" }
```

```json
{ "success": true, "data": { "value": "A-000042" }, "meta": { "envelopeVersion": 1, "..." } }
```

Backed by the embedder-injected sequence backend (`Host.WithSequenceNext`);
the increment is atomic (`UPDATE … RETURNING`) so concurrent guest calls
never collide on the same folio.

## See also

- [`manifest-spec.md`](./manifest-spec) — the full v3 manifest field reference, including `backend{}` and `Model.locking`/`constraints[]`.
- [`addon-cookbook.md`](./addon-cookbook) — end-to-end addon recipes.
- [`capabilities.md`](./capabilities) — the full `kind` catalog gating every host import above.
