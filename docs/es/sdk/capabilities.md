<p align="center">
  <img src="/logo.svg" width="120" alt="Metacore" />
</p>

<h1 align="center">Capabilities</h1>

Las capabilities son el sandbox declarativo de un addon. Cada operación
privilegiada que el addon intenta — SELECT en una tabla foránea, HTTP saliente,
publicación al event bus — se chequea contra una policy `Capabilities` compilada.

Implementación: [`kernel/security/context.go`](https://github.com/asteby/metacore-kernel/blob/main/security/context.go).
Validación: [`kernel/manifest/validate.go`](https://github.com/asteby/metacore-kernel/blob/main/manifest/validate.go).
Para el modelo de enforcement del lado kernel ver [Permisos del kernel](/es/kernel/permissions).

## Tabla de contenidos

- [1. Forma](#1-forma)
- [2. El schema propio del addon es implícito](#2-el-schema-propio-del-addon-es-implícito)
- [3. Kinds](#3-kinds)
- [4. Declarando capabilities](#4-declarando-capabilities)
- [5. Enforcement en runtime](#5-enforcement-en-runtime)
- [6. Expectativas de review](#6-expectativas-de-review)
- [7. UI gating](#7-ui-gating)

## 1. Forma

Declarado en el manifest:

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

| Field | Requerido | Notas |
|---|---|---|
| `kind` | sí | Una de `db:read`, `db:write`, `http:fetch`, `event:emit`, `event:subscribe`. Debe contener un separador `:`. |
| `target` | sí | Pattern específico al kind (ver abajo). |
| `reason` | recomendado | Mostrado en el prompt de instalación. Addons con razones vacías fallan los gates `--strict`. |

## 2. El schema propio del addon es implícito

`addon_<key>.*` es siempre legible y escribible por el addon dueño. No
lo declares — el runtime lo agrega durante `Compile`.

## 3. Kinds

### `db:read` / `db:write`

| Ejemplo de target | Matchea |
|---|---|
| `"users"` | Tabla core `users` (read only a menos que también esté declarada bajo `db:write`). |
| `"addon_billing.*"` | Todas las tablas en el schema de otro addon (requiere que ese addon esté instalado). |
| `"orders"` / `"order_items"` | Múltiples targets permitidos. |

Reglas:

- `*` pelado es **rechazado** tanto para `db:read` como para `db:write`. Tenés que
  enumerar modelos o schemas.
- Wildcard `<schema>.*` se acepta.
- El runtime niega lecturas cross-tenant incluso cuando la capability las
  permitiría de otro modo — el org scoping es ortogonal.

### `http:fetch`

Controla HTTP saliente. El target es un host-glob, opcionalmente con un puerto.

| Target válido | Matchea |
|---|---|
| `"api.stripe.com"` | Host exacto. |
| `"*.slack.com"` | Cualquier subdominio único de slack.com (más el apex). |
| `"api.example.com:8443"` | Host exacto + puerto. |

**Reglas anti-wildcard** (`isValidHTTPHostPattern`):

| Target | ¿Aceptado? | Por qué |
|---|---|---|
| `"*"` | rechazado | Otorga acceso a todo, incluyendo metadata servers. |
| `"*.*"` | rechazado | Mismo; sintácticamente matchea cualquier host. |
| `"*.com"` | rechazado | Wildcard solo de TLD. Debe incluir un dominio registrable. |
| `"example"` | rechazado | Sin punto, no es dominio. |
| `"*.example.com"` | aceptado | Wildcard de label más a la izquierda sobre un dominio concreto. |
| `"host.*.example.com"` | rechazado | Solo se permiten wildcards de label más a la izquierda. |

**Guard SSRF** (`isBlockedEgressHost`) rechaza estos hosts sin importar
ninguna declaración de capability:

- Loopback: `localhost`, `127.0.0.1`, `::1`, `0.0.0.0`
- Rangos privados RFC1918: `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`
- Metadata cloud: `169.254.169.254`, `metadata.google.internal`, `metadata`
- Host vacío / schemes no `http(s)`

Defensa en profundidad: el guard corre después del check de capability, así que un addon
que accidentalmente liste `*.internal` igual no puede llegar a IMDS.

### `event:emit` / `event:subscribe`

| Ejemplo de target | Matchea |
|---|---|
| `"ticket.created"` | Topic exacto. |
| `"ticket.*"` | Cualquier topic bajo `ticket.`. |
| `"*"` | Todos los topics (permitido para eventos; no para DB/HTTP). |

## 4. Declarando capabilities

Mantené la lista mínima. Al instalar, el host muestra el `reason` de cada capability
junto al kind/target; admins que ven un `db:read users` o
`http:fetch *.example.com` sin explicar tienden a rechazar la instalación.

Checklist:

1. ¿El addon consulta alguna tabla fuera de `addon_<key>.*`? → declará `db:read`.
2. ¿El addon muta alguna tabla fuera de `addon_<key>.*`? → declará `db:write`.
3. ¿El addon hace llamadas HTTP salientes? → declará `http:fetch` por host.
4. ¿El addon publica al event bus? → declará `event:emit` por topic.
5. ¿El addon se suscribe? → declará `event:subscribe`.

## 5. Enforcement en runtime

Cada llamada privilegiada pasa por una de:

```go
caps.CanReadModel("orders")            // -> nil | error
caps.CanWriteModel("addon_tickets.comments")
caps.CanFetch("https://api.stripe.com/v1/charges")
caps.CanEmit("sale.created")
caps.CanSubscribe("invoice.stamped")
```

Las llamadas negadas devuelven un error tipado que la capa de superficie surfacea como una
respuesta tipo 403 al addon (webhooks HTTP) o como un envelope `forbidden`
(imports WASM).

## 6. Expectativas de review

El proceso de review del marketplace flaggea:

- Capabilities sin `reason`.
- Targets `http:fetch` que evaden estrechamente el guard anti-wildcard (ej.
  TLDs nuevos registrados por el publisher).
- `db:write` sobre tablas core (`users`, `organizations`, `billing_*`) a menos
  que la categoría del addon explícitamente lo requiera.

## 7. UI gating

El kernel es la fuente de verdad, pero el SDK incluye un componente `<CapabilityGate>`
para esconder affordances sobre los que el usuario no puede actuar:

```tsx
import { CapabilityGate, CapabilityProvider } from '@asteby/metacore-runtime-react'

<CapabilityProvider capabilities={user.capabilities}>
  <CapabilityGate require="db:write addon_tickets.tickets">
    <Button onClick={createTicket}>New ticket</Button>
  </CapabilityGate>
</CapabilityProvider>
```

El gate es **puramente cosmético** — nunca confíes en él para seguridad. El host
siempre debe validar la misma capability server-side. Ver
[`dynamic-ui.md`](./dynamic-ui.md#capability-gates) para la superficie de props
completa.

## Ver también

- [`manifest-spec.md`](./manifest-spec.md#7-capabilities) — declarando `capabilities[]` en el manifest.
- [`dynamic-ui.md`](./dynamic-ui) — `<CapabilityGate>` y gating en runtime.
- [`addon-publishing.md`](./addon-publishing) — cómo capabilities sin scope afectan el review del marketplace.
