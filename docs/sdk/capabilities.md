<p align="center">
  <img src="/logo.svg" width="120" alt="Metacore" />
</p>

<h1 align="center">Capabilities</h1>

Capabilities are the declarative sandbox of an addon. Every privileged
operation the addon attempts — SELECT on a foreign table, outbound HTTP,
event bus publish — is checked against a compiled `Capabilities` policy.

Implementation: [`kernel/security/context.go`](https://github.com/asteby/metacore-kernel/blob/main/security/context.go).
Validation: [`kernel/manifest/validate.go`](https://github.com/asteby/metacore-kernel/blob/main/manifest/validate.go).
For the kernel-side enforcement model see [Kernel Permissions](/kernel/permissions).

## Table of contents

- [1. Shape](#1-shape)
- [2. The addon's own schema is implicit](#2-the-addons-own-schema-is-implicit)
- [3. Kinds](#3-kinds)
- [4. Declaring capabilities](#4-declaring-capabilities)
- [5. Runtime enforcement](#5-runtime-enforcement)
- [6. Review expectations](#6-review-expectations)
- [7. UI gating](#7-ui-gating)

## 1. Shape

Declared in the manifest:

```json
"capabilities": [
  { "kind": "db:read",         "target": "users", "reason": "Display author names" },
  { "kind": "db:write",        "target": "addon_tickets.*" },
  { "kind": "http:fetch",      "target": "api.stripe.com", "reason": "Process payments" },
  { "kind": "http:fetch",      "target": "*.slack.com" },
  { "kind": "event:emit",      "target": "sale.created" },
  { "kind": "event:subscribe", "target": "invoice.stamped" }
]
```

| Field | Required | Notes |
|---|---|---|
| `kind` | yes | One of `db:read`, `db:write`, `http:fetch`, `event:emit`, `event:subscribe`. Must contain a `:` separator. |
| `target` | yes | Kind-specific pattern (see below). |
| `reason` | recommended | Shown on the install prompt. Addons with empty reasons fail `--strict` gates. |

## 2. The addon's own schema is implicit

`addon_<key>.*` is always readable and writable by the owning addon. Do not
declare it — the runtime appends it during `Compile`.

## 3. Kinds

### `db:read` / `db:write`

| Target example | Matches |
|---|---|
| `"users"` | Core `users` table (read only unless also declared under `db:write`). |
| `"addon_billing.*"` | All tables in another addon's schema (requires that addon to be installed). |
| `"orders"` / `"order_items"` | Multiple targets allowed. |

Rules:

- Bare `*` is **rejected** for both `db:read` and `db:write`. You must
  enumerate models or schemas.
- Wildcard `<schema>.*` is accepted.
- The runtime denies cross-tenant reads even when the capability would
  otherwise allow them — org scoping is orthogonal.

### `http:fetch`

Controls outbound HTTP. Target is a host-glob, optionally with a port.

| Valid target | Matches |
|---|---|
| `"api.stripe.com"` | Exact host. |
| `"*.slack.com"` | Any single subdomain of slack.com (plus the apex). |
| `"api.example.com:8443"` | Exact host + port. |

**Anti-wildcard rules** (`isValidHTTPHostPattern`):

| Target | Accepted? | Why |
|---|---|---|
| `"*"` | rejected | Grants access to everything, including metadata servers. |
| `"*.*"` | rejected | Same; syntactically matches any host. |
| `"*.com"` | rejected | TLD-only wildcard. Must include a registrable domain. |
| `"example"` | rejected | No dot, not a domain. |
| `"*.example.com"` | accepted | Leftmost-label wildcard above a concrete domain. |
| `"host.*.example.com"` | rejected | Only leftmost-label wildcards allowed. |

**SSRF guard** (`isBlockedEgressHost`) rejects these hosts regardless of
any capability declaration:

- Loopback: `localhost`, `127.0.0.1`, `::1`, `0.0.0.0`
- RFC1918 private ranges: `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`
- Cloud metadata: `169.254.169.254`, `metadata.google.internal`, `metadata`
- Empty host / non-`http(s)` schemes

Defense in depth: the guard runs after the capability check, so an addon
that accidentally lists `*.internal` still cannot reach IMDS.

### `event:emit` / `event:subscribe`

| Target example | Matches |
|---|---|
| `"ticket.created"` | Exact topic. |
| `"ticket.*"` | Any topic under `ticket.`. |
| `"*"` | All topics (allowed for events; not for DB/HTTP). |

## 4. Declaring capabilities

Keep the list minimal. On install, the host displays each capability's
`reason` next to the kind/target; admins who see an unexplained
`db:read users` or `http:fetch *.example.com` tend to reject the install.

Checklist:

1. Does the addon query any table outside `addon_<key>.*`? → declare `db:read`.
2. Does the addon mutate any table outside `addon_<key>.*`? → declare `db:write`.
3. Does the addon make outbound HTTP calls? → declare `http:fetch` per host.
4. Does the addon publish to the event bus? → declare `event:emit` per topic.
5. Does the addon subscribe? → declare `event:subscribe`.

## 5. Runtime enforcement

Every privileged call goes through one of:

```go
caps.CanReadModel("orders")            // -> nil | error
caps.CanWriteModel("addon_tickets.comments")
caps.CanFetch("https://api.stripe.com/v1/charges")
caps.CanEmit("sale.created")
caps.CanSubscribe("invoice.stamped")
```

Denied calls return a typed error that the surface layer surfaces as a
403-like response to the addon (HTTP webhooks) or as a `forbidden` envelope
(WASM imports).

## 6. Review expectations

The marketplace review process flags:

- Capabilities without `reason`.
- `http:fetch` targets that narrowly evade the anti-wildcard guard (e.g.
  brand-new TLDs registered by the publisher).
- `db:write` on core tables (`users`, `organizations`, `billing_*`) unless
  the addon category explicitly requires it.

## 7. UI gating

The kernel is the source of truth, but the SDK ships a `<CapabilityGate>`
component for hiding affordances the user can't act on:

```tsx
import { CapabilityGate, CapabilityProvider } from '@asteby/metacore-runtime-react'

<CapabilityProvider capabilities={user.capabilities}>
  <CapabilityGate require="db:write addon_tickets.tickets">
    <Button onClick={createTicket}>New ticket</Button>
  </CapabilityGate>
</CapabilityProvider>
```

The gate is **purely cosmetic** — never rely on it for security. The host
must always validate the same capability server-side. See
[`dynamic-ui.md`](./dynamic-ui.md#capability-gates) for the full prop
surface.

## See also

- [`manifest-spec.md`](./manifest-spec.md#7-capabilities) — declaring `capabilities[]` in the manifest.
- [`dynamic-ui.md`](./dynamic-ui) — `<CapabilityGate>` and runtime gating.
- [`addon-publishing.md`](./addon-publishing) — how unscoped capabilities affect the marketplace review.
