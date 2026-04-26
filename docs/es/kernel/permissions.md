# Permisos

Authorization basada en capabilities — para **usuarios** en el borde HTTP y
para **addons** en cada llamada privilegiada al kernel. Este documento cubre
ambos sistemas, cuándo se disparan y cómo conectarlos.

Para el framework de CRUD dinámico que consume estos gates, ver
[`dynamic-system.md`](./dynamic-system).

---

## Tabla de contenidos

- [Dos sistemas, un principio](#dos-sistemas-un-principio)
- [Capabilities a nivel usuario](#capabilities-a-nivel-usuario)
  - [Shape de capability](#shape-de-capability)
  - [Servicio](#servicio)
  - [Stores](#stores)
  - [Roles y super-roles](#roles-y-super-roles)
  - [Middleware de gate de Fiber](#middleware-de-gate-de-fiber)
- [Capabilities a nivel addon](#capabilities-a-nivel-addon)
  - [Declarar en el manifest](#declarar-en-el-manifest)
  - [Policy compilada](#policy-compilada)
  - [Modos del enforcer](#modos-del-enforcer)
  - [Walkthrough de un check](#walkthrough-de-un-check)
- [Buenas prácticas](#buenas-prácticas)
- [Ver también](#ver-también)

---

## Dos sistemas, un principio

| Sistema                | Sujeto       | Pregunta que responde                                       | Vive en |
| ---------------------- | ------------ | ----------------------------------------------------------- | -------- |
| `permission.Service`   | Usuario autenticado (HTTP) | ¿Puede este usuario hacer la acción X sobre el recurso Y? | [`permission/`](https://github.com/asteby/metacore-kernel/blob/main/permission/) |
| `security.Enforcer`    | Addon instalado            | ¿Puede este addon hacer DB-write / HTTP-fetch / emit?    | [`security/`](https://github.com/asteby/metacore-kernel/blob/main/security/)     |

Son independientes. Un request puede pasar el gate de usuario, el gate de
addon, o ambos. El handler de CRUD corre el gate de usuario por request;
el gate de addon se dispara dentro de los host imports del kernel cuando
un addon intenta una llamada privilegiada.

El principio de diseño compartido: **least privilege, grants declarativos,
enforcement en runtime, violaciones audit-friendly**.

## Capabilities a nivel usuario

### Shape de capability

Una capability es un string en formato `<resource>.<action>`. El constructor
trimea whitespace y baja a minúsculas el segmento del resource para que las
diferencias de casing entre código Go y filas de DB nunca importen.

```go
permission.Cap("Tickets", "Create")  // → permission.Capability("tickets.Create")
permission.Cap("invoices", "approve") // → permission.Capability("invoices.approve")
```

El wildcard `"*"` está reservado: cualquier role o usuario que tenga `*`
matchea cada check. Ver [`permission/capability.go`](https://github.com/asteby/metacore-kernel/blob/main/permission/capability.go).

El servicio de CRUD dinámico sintetiza la capability para cada request:

| HTTP                                | Capability chequeada |
| ----------------------------------- | -------------------- |
| `GET    /api/dynamic/<model>`       | `<model>.read`       |
| `GET    /api/dynamic/<model>/:id`   | `<model>.read`       |
| `POST   /api/dynamic/<model>`       | `<model>.create`     |
| `PUT    /api/dynamic/<model>/:id`   | `<model>.update`     |
| `DELETE /api/dynamic/<model>/:id`   | `<model>.delete`     |

La síntesis está en
[`dynamic/service.go:checkPerm`](https://github.com/asteby/metacore-kernel/blob/main/dynamic/service.go).

Verbos de acción comunes declarados como constantes — las apps son libres
de inventar más:

| Constante        | String   |
| ---------------- | -------- |
| `CapCreate`      | `create` |
| `CapRead`        | `read`   |
| `CapUpdate`      | `update` |
| `CapDelete`      | `delete` |
| `CapList`        | `list`   |
| `CapExport`      | `export` |
| `CapImport`      | `import` |

### Servicio

`permission.Service` ([`permission/service.go`](https://github.com/asteby/metacore-kernel/blob/main/permission/service.go))
es el motor de check agnóstico al framework. Tres shapes de llamada:

```go
err := svc.Check(ctx, user, permission.Cap("tickets", "create"))
err := svc.CheckAny(ctx, user, capA, capB)   // ≥1 of caps
err := svc.CheckAll(ctx, user, capA, capB)   // every cap
```

Las tres devuelven `nil` en éxito y `permission.ErrPermissionDenied`
(envuelto) en falla. `ErrNoUser` se devuelve cuando `user` es `nil`.

El servicio compone:

- un `PermissionStore` (donde viven los grants),
- un `capCache` keyado por user id con TTL `Config.CacheTTL`
  (default 5 min, `-1` lo deshabilita),
- un set de super-roles que bypassean cada check.

Resolución de capability — `GetUserCapabilities(ctx, user)` — combina:

1. Grants de role del store, deduplicados.
2. Grants por usuario del store, aditivos.

El resultado se cachea por usuario. `InvalidateUser(uid)` e
`InvalidateAll()` limpian el cache después de un cambio de grant.

### Stores

`permission.PermissionStore` es el contrato estable:

```go
type PermissionStore interface {
    GetRolePermissions(ctx context.Context, role Role) ([]Capability, error)
    GetUserPermissions(ctx context.Context, userID uuid.UUID) ([]Capability, error)
}
```

Vienen dos implementaciones en [`permission/store.go`](https://github.com/asteby/metacore-kernel/blob/main/permission/store.go):

| Store           | Usar cuando                                       | Persistencia                              |
| --------------- | ------------------------------------------------- | ----------------------------------------- |
| `InMemoryStore` | Tests, o apps con una policy de role estática     | Ninguna (declarada al boot)               |
| `GormStore`     | Default de producción                             | `permission_role_grants`, `permission_user_grants` |

`GormStore` expone helpers idempotentes para bootstrap:

```go
store, err := permission.NewGormStore(db)
_ = store.GrantRole(ctx, permission.RoleAdmin, permission.Cap("tickets", "create"))
_ = store.GrantRole(ctx, permission.RoleAdmin, permission.Cap("tickets", "update"))
_ = store.GrantUser(ctx, alice.ID, permission.Cap("tickets", "delete"))
```

Apps con requerimientos custom (cache de Redis, grants scopeados a branch,
motores de policy de addon) implementan `PermissionStore` ellas mismas.

### Roles y super-roles

Los roles son strings tipados ([`permission/roles.go`](https://github.com/asteby/metacore-kernel/blob/main/permission/roles.go)).
El kernel publica tres nombres canónicos — las apps pueden agregar los suyos
libremente:

| Constante    | String  |
| ------------ | ------- |
| `RoleOwner`  | `owner` |
| `RoleAdmin`  | `admin` |
| `RoleAgent`  | `agent` |

`DefaultSuperRoles()` devuelve `[]Role{RoleOwner}` — los owners bypassean
cada check (se devuelve una sola capability `Wildcard` sintética para
ellos). Override con `Config.SuperRoles`:

```go
svc := permission.New(permission.Config{
    Store:      store,
    SuperRoles: []permission.Role{permission.RoleOwner, permission.RoleAdmin},
})
```

### Middleware de gate de Fiber

Enchufá un check de capability en cualquier punto del árbol de routes
([`permission/middleware.go`](https://github.com/asteby/metacore-kernel/blob/main/permission/middleware.go)):

```go
api.Post("/tickets/:id/escalate",
    permSvc.Gate(userLookup, permission.Cap("tickets", "escalate")),
    ticketHandler.Escalate)
```

`Gate` es el shortcut de capability única. `GateWith` acepta un
`GateConfig` para llamadas multi-cap y responders de error customizados:

```go
api.Post("/billing/refund",
    permSvc.GateWith(userLookup, permission.GateConfig{
        Mode: permission.ModeAny,        // OR semantics
        OnDenied: func(c *fiber.Ctx, err error) error {
            return c.Status(403).JSON(fiber.Map{"error": "billing access required"})
        },
    },
    permission.Cap("billing", "refund"),
    permission.Cap("billing", "admin"),
    ),
    billingHandler.Refund,
)
```

`UserLookup` es `func(*fiber.Ctx) modelbase.AuthUser`. Devolver nil produce
`401`. Fallar el check de cap produce `403`.

Para el CRUD dinámico específicamente, el gate está integrado
automáticamente: mientras `host.AppConfig.PermissionStore` no sea nil, cada
request CRUD llama `Service.Check` antes de tocar la base de datos.

## Capabilities a nivel addon

### Declarar en el manifest

Los addons publican un bloque `capabilities[]` en `manifest.json`. Cada
entrada tiene un `kind`, un `target`, y un `reason` opcional. El
marketplace le pide aprobación al admin antes de la instalación.

```json
{
  "key": "tickets",
  "capabilities": [
    { "kind": "db:read",         "target": "addon_tickets.*",     "reason": "Read own tickets" },
    { "kind": "db:write",        "target": "addon_tickets.*",     "reason": "Create and edit tickets" },
    { "kind": "http:fetch",      "target": "api.stripe.com",      "reason": "Refund payments" },
    { "kind": "event:emit",      "target": "ticket.created",      "reason": "Notify other addons" },
    { "kind": "event:subscribe", "target": "invoice.stamped",     "reason": "Auto-link invoices" }
  ]
}
```

Los valores de `kind` soportados son exhaustivos — el enforcer rechaza
cualquier otro:

| Kind               | Shape del target                          | Aplicado dónde                                |
| ------------------ | ----------------------------------------- | --------------------------------------------- |
| `db:read`          | Glob de modelo: `orders`, `addon_tickets.*` | Host imports en paths de read               |
| `db:write`         | Glob de modelo (igual a `db:read`)        | Host imports en create/update/delete          |
| `http:fetch`       | Host con al menos un punto, `*.` opcional | HTTP saliente desde adentro del sandbox WASM  |
| `event:emit`       | Nombre de evento o `prefix.*`             | `events.Bus.Publish`                          |
| `event:subscribe`  | Nombre de evento o `prefix.*`             | `events.Bus.Subscribe`                        |

El contrato está en [`manifest/manifest.go`](https://github.com/asteby/metacore-kernel/blob/main/manifest/manifest.go) (tipo
`Capability`) y el enforcement en
[`security/context.go`](https://github.com/asteby/metacore-kernel/blob/main/security/context.go) (tipo `Capabilities`).

### Policy compilada

Al momento del install las entradas del manifest se compilan en una policy
`security.Capabilities`:

```go
caps := security.Compile(addonKey, manifest.Capabilities)
```

Siempre se agregan dos grants implícitos:

- `db:read addon_<key>.*` — cada addon puede leer su propio schema.
- `db:write addon_<key>.*` — cada addon puede escribir su propio schema.

Los targets de `http:fetch` se validan para ser **dominios registrables**:
`*` solo, `*.com`, wildcards sobrantes y otros patterns peligrosos se
descartan silenciosamente. Los guards de SSRF rechazan loopback, rangos
RFC1918 (`10.*`, `172.16-31.*`, `192.168.*`) y endpoints de metadata cloud
(`169.254.169.254`, `metadata.google.internal`) sin importar el target
declarado.

### Modos del enforcer

`security.Enforcer` ([`security/enforcer.go`](https://github.com/asteby/metacore-kernel/blob/main/security/enforcer.go))
envuelve la policy compilada y la aplica en cada llamada privilegiada. El
modo es atómico y switcheable en runtime:

| Modo          | Comportamiento                                            |
| ------------- | --------------------------------------------------------- |
| `ModeShadow`  | Loggea violación, devuelve `nil`. Default durante rollout. |
| `ModeEnforce` | Loggea Y devuelve el error de la violación. El caller mapea a 403. |

Los operadores switchean vía la env var `METACORE_ENFORCE`:

```bash
# Shadow (default)
unset METACORE_ENFORCE

# Enforce
export METACORE_ENFORCE=1
```

`security.ModeFromEnv()` devuelve `ModeEnforce` cuando el valor es
`1`, `true`, `TRUE`, `yes` o `YES`. Cualquier otra cosa es shadow.

```go
enf := security.NewEnforcer(func(addonKey string) *security.Capabilities {
    return policyByAddon[addonKey]
})
// Optional metric hook
enf.OnViolation = func(addonKey, kind, target, caller string, err error) {
    metrics.CapabilityViolation.WithLabelValues(addonKey, kind).Inc()
}
```

Cada violación loggea una línea estructurada:

```
metacore.capability.violation mode=enforce addon=tickets kind=http:fetch \
  target=api.stripe.com caller=runtime/wasm/host.go:142 err=addon "tickets" lacks http:fetch "api.stripe.com"
```

### Walkthrough de un check

Un addon `tickets` ejecuta `db:write` sobre `addon_tickets.tickets`:

1. El host llama `enforcer.CheckCapability("tickets", "db:write", "addon_tickets.tickets")`.
2. El enforcer busca la policy compilada vía
   `LookupCapabilities("tickets")`.
3. Dispatch por kind → `caps.CanWriteModel("addon_tickets.tickets")`.
4. `matchAny(c.dbWrite, "addon_tickets.tickets")` — matchea el grant
   implícito `addon_tickets.*` → devuelve `nil`.
5. El kernel procede con el DB write.

Si en cambio el addon hubiera intentado `db:write addon_other.*`:

1. `matchAny(c.dbWrite, "addon_other.x")` devuelve false.
2. El enforcer loggea la violación.
3. En `ModeShadow`: devuelve `nil`, la llamada procede (audit-only). Tickean
   las métricas.
4. En `ModeEnforce`: devuelve el error, el host import falla, el addon ve
   un return value de "operation denied".

## Buenas prácticas

- **Empezá en shadow.** Publicá cada release nuevo con `ModeShadow` durante
  una ventana de rollout. Inspeccioná los logs de violación antes de
  switchear.
- **Conectá `OnViolation` a métricas.** Un counter de Prometheus labelado
  por `addon` + `kind` muestra la superficie real-traffic del sistema de
  caps — invaluable cuando estás escribiendo un addon nuevo.
- **Declará targets específicos.** Preferí `addon_tickets.tickets` sobre
  `addon_tickets.*` cuando el addon realmente solo escribe una tabla; la
  superficie del marketplace queda más chica.
- **`http:fetch` necesita un dominio registrable.** `*.example.com` está
  bien, `*.com` se rechaza. El enforcer es paranoico por diseño.
- **Roles least-privilege.** Otorgá `<resource>.read` ampliamente y
  `<resource>.delete` de manera angosta. Usá el store de override por
  usuario para las excepciones raras.
- **Invalidación de cache.** Llamá `permission.Service.InvalidateUser(uid)`
  después de cualquier cambio de role para ese usuario; `InvalidateAll()`
  después de un cambio de mapping role→capability.
- **Los owners son super por default.** Si tu negocio necesita que `admin`
  también bypassee, pasá `Config.SuperRoles = []Role{RoleOwner, RoleAdmin}` —
  **no** otorgues una capability `*` en el store (los super-roles
  cortocircuitan antes del lookup del store, lo que es más rápido y más
  seguro).
- **Usá las caps de addon como seguridad de transporte.** Una declaración
  `http:fetch` no es una pista de UX, es lo único que se interpone entre un
  bundle malicioso y los datos de tus clientes. Tratá la aprobación del
  marketplace como un gate de seguridad.

## Ver también

- [`dynamic-system.md`](./dynamic-system) — cómo se dispara el gate de usuario por request CRUD.
- [`dynamic-api.md`](./dynamic-api) — shape de la respuesta `403`.
- [`consumer-guide.md`](./consumer-guide), sección *Modelo de capabilities y modos de seguridad*.
- [`embedding-quickstart.md`](./embedding-quickstart) — conectar el store desde main.go.
- [`../manifest/manifest.go`](https://github.com/asteby/metacore-kernel/blob/main/manifest/manifest.go) — definiciones de tipos del manifest.
- [`../permission/service.go`](https://github.com/asteby/metacore-kernel/blob/main/permission/service.go), [`../security/enforcer.go`](https://github.com/asteby/metacore-kernel/blob/main/security/enforcer.go) — implementaciones.
