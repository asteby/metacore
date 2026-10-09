# WASM guest cold-start guide

**Audience:** addon authors shipping a `backend.runtime = "wasm"` module.  
**Goal:** first invoke and host boot stay fast when dozens of addons are installed — without changing the ABI.

Companion contracts: [`wasm-abi.md`](./wasm-abi), [`addon-publishing.md`](./addon-publishing) (scanner), ops SLO **S6** (cold invoke).

---

## Why this matters

On a busy ops host the kernel:

1. **Compiles** each `.wasm` once per distinct byte payload (`CompileModule`), then **skips** recompile when the sha256 matches (healer / re-hydrate).
2. **Instantiates** a reactor per installation (`_initialize`, then stays alive).
3. **Invokes** exported handlers on demand (actions + event subscriptions).

Anything heavy in steps 1–2 taxes **every org on that process** at boot or heal. Anything heavy on the first call after instantiate taxes **that user's action**. Keep both paths thin.

---

## 1. Build a reactor, not a command

| Build | Exports | Host behaviour |
|-------|---------|----------------|
| Default wasip1 **command** | `_start` → often `proc_exit` | Module closes; later `alloc` / handlers fail (`module is closed`). |
| **Reactor** (`GOOS=wasip1` + `-buildmode=c-shared`) | `_initialize` | Module stays alive across host calls. **Required.** |

Canonical Go build:

```bash
GOWORK=off GOOS=wasip1 GOARCH=wasm \
  go build -buildmode=c-shared -trimpath -o backend.wasm .
```

TinyGo / other toolchains: produce the same reactor semantics (no one-shot `_start` that exits). The host starts with `WithStartFunctions("_initialize", "_start")` — whichever the module exports — but a command that exits is still a dead guest.

`main()` may exist for the toolchain; with `c-shared` it is **not** your business logic entrypoint.

---

## 2. Minimal export surface

**Required by ABI**

- `memory`
- `alloc(size) -> ptr`
- One export per declared handler / `manifest.backend.exports` entry (or v3 wasm handlers)

**Do not**

- Export dozens of unused symbols “just in case” (scanner warns on suspicious density).
- Put domain work behind a fake lifecycle export the host never calls on the hot path.
- Rely on `_start` for setup that must survive — use `_initialize` only for **tiny** runtime init the toolchain needs.

List only what actions / subscriptions actually invoke. Dead exports still inflate the binary and confuse the publish export check.

---

## 3. Keep `_initialize` / package `init` empty of I/O

`_initialize` (and Go `init()` / package-level `var` that allocate large buffers) runs at **every** instantiate — boot, heal, and first miss of the instance cache.

**Allowed (cheap):** bump arena setup, small constant tables, nil maps.

**Forbidden on cold path:**

- Outbound HTTP / `http_request` / `connector_get`
- `db_*` / `data_mutate` / `data_query` / `data_batch`
- Large JSON parse of embedded fixtures
- Sleeps, retries, “warm the cache” loops

Do that work **inside the handler** that needs it, gated by the payload, with host timeouts (`timeout_ms`) as the backstop.

---

## 4. Handlers: allocate little, return fast

- Prefer `data_mutate` / `data_query` over multi-round-trip raw SQL when possible (fewer guest↔host hops).
- Avoid retaining large slices in package globals across invokes — instances are long-lived reactors; leaks become RSS.
- Never panic out of a handler; return an error envelope (`{"error":…}` / `{success:false,…}` per your addon convention).
- Cap work with manifest `timeout_ms` (default 10s) — treat timeouts as product bugs, not “retry forever”.

---

## 5. Size and compile cost

| Lever | Guidance |
|-------|----------|
| Artifact size | Hub publish caps `.wasm` at **10 MiB**; stay far under for cold compile. |
| Dependencies | Trim unused stdlib / crypto if the handler does not need them. |
| Rebuild identity | Unchanged bytes → kernel **skips** `CompileModule` (sha256). Avoid “touch” rebuilds that only change timestamps inside the binary when you can `-trimpath` + reproducible flags. |
| Heal / boot | Ops delays the integration healer so Listen/TTI are not competing with a thundering herd of compiles — still do your part with small modules. |

---

## 6. Checklist (PR / CI)

Copy into addon PR templates:

- [ ] Built with reactor flags (`-buildmode=c-shared` or equivalent).
- [ ] `main` / `_initialize` do **no** host I/O.
- [ ] `exports` (or v3 handlers) match only real entrypoints.
- [ ] No WASI filesystem/network imports outside the ABI whitelist (publish scanner rejects them).
- [ ] Cold path measured: first invoke after load for the critical action (stamp, stock, payment) within org SLO — aim **P95 ≤ 250 ms** cold / **≤ 80 ms** warm where the host already has the module.

Local smoke: `metacore` / hub publish dry-run scan (see [`addon-publishing.md`](./addon-publishing) § WASM scan) — link-time panic or `_start` that exits fails the dry-run instantiate.

---

## 7. Anti-patterns (seen in the wild)

1. **Command build** → intermittent “module closed” after heal.  
2. **Eager prefetch in `init`** → boot storms when 40 addons install.  
3. **Giant embedded templates in the wasm** → slow compile + memory. Prefer host settings / DB.  
4. **Subscription handler that does full table scans** → dead-letters under load; show up in ops activity as `delivery_dead`. Fix the query, don’t raise retries alone.

---

## See also

- [`wasm-abi.md`](./wasm-abi) — full guest/host contract.  
- [`tutorials/first-addon.md`](./tutorials/first-addon.md) — reactor build narrative and `build.sh`.  
- [`addon-cookbook.md`](./addon-cookbook) — “WASM instead of webhook”.  
- [`addon-publishing.md`](./addon-publishing) — static export / import scan + dry-run instantiate.
