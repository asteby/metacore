# Configuración de desarrollo

Esta guía es para **contribuidores** de `metacore-kernel`. Si estás
embebiendo el kernel en una aplicación, leé
[`consumer-guide.md`](./consumer-guide) en su lugar.

---

## Tabla de contenidos

1. [Prerrequisitos](#1-prerrequisitos)
2. [Clone y bootstrap](#2-clone-y-bootstrap)
3. [Layout del repo](#3-layout-del-repo)
4. [Tests, vet, race detector](#4-tests-vet-race-detector)
5. [Trabajar con el SDK localmente](#5-trabajar-con-el-sdk-localmente)
6. [Branches y flujo de contribución](#6-branches-y-flujo-de-contribución)
7. [Estilo y guardrails arquitectónicos](#7-estilo-y-guardrails-arquitectónicos)
8. [Debug del runtime de WASM](#8-debug-del-runtime-de-wasm)
9. [Trabajar en el framework de CRUD dinámico](#9-trabajar-en-el-framework-de-crud-dinámico)
10. [Releasing](#10-releasing)

---

> ¿Embebiendo el kernel en un host? Querés
> [`consumer-guide.md`](./consumer-guide) y
> [`embedding-quickstart.md`](./embedding-quickstart). ¿Trabajando en el
> framework de CRUD dinámico? Leé [`dynamic-system.md`](./dynamic-system)
> primero — los fixtures, tests de handler y helpers de migración en
> `dynamic/*_test.go`, `metadata/*_test.go` e `installer/*_test.go`
> asumen los contratos documentados ahí.

## 1. Prerrequisitos

| Tool       | Versión                          |
| ---------- | -------------------------------- |
| Go         | 1.25+ (matchea `go.mod` y CI)    |
| Git        | 2.30+                            |
| GitHub CLI | recomendado para PRs y releases  |
| Make       | opcional                         |

El kernel depende de `wazero` (runtime WASM puro Go — sin cgo), `Fiber v2`,
`GORM`, `gofiber/websocket`, `prometheus/client_golang`, y `goose` para
migraciones versionadas. No hay tools de build nativas requeridas.

## 2. Clone y bootstrap

```bash
go env -w GOPRIVATE="github.com/asteby/*"
git config --global url."git@github.com:".insteadOf "https://github.com/"

mkdir -p ~/projects && cd ~/projects
git clone git@github.com:asteby/metacore-kernel.git
git clone git@github.com:asteby/metacore-sdk.git
cd metacore-kernel
go mod download
```

Los dos repos tienen que vivir como hermanos — el `go.mod` del kernel
arrastra `replace github.com/asteby/metacore-sdk => ../metacore-sdk` así
los cambios del SDK se levantan sin publicar un tag.

Verificá la toolchain:

```bash
go version          # expect 1.25.x
go vet ./...
go test ./...
```

## 3. Layout del repo

```
metacore-kernel/
├── auth/              JWT, login/refresh handlers, Fiber middleware
├── bridge/            Adapters: kernel actions/tools/webhooks ↔ host integrations
├── bundle/            Addon bundle I/O (`bundle.tgz` reader/writer)
├── docs/              Developer-facing documentation (this directory)
├── dynamic/           Generic CRUD over registered models
├── eventlog/          Org-scoped persisted event log with cursor pagination
├── events/            In-process pub/sub bus for addons
├── flow/              Workflow primitives reused by addons
├── host/              `App` and `Host` facades
├── httpx/             HTTP helpers shared across handlers
├── installer/         Install/enable/disable/uninstall flow
├── lifecycle/         Addon contract, registry, interceptors
├── log/               Builder-style logger (legacy; use obs/ for new code)
├── manifest/          Declarative addon manifest schema
├── metadata/          TableMetadata/ModalMetadata registry, cache, handler
├── metrics/           Prometheus integration
├── migrations/        Goose-based versioned migration runner
├── modelbase/         Stable interfaces and base structs
├── navigation/        Sidebar merger
├── notifications/     Delivery queue + workers + ChannelHandler
├── obs/               Structured slog logger with request-id propagation
├── permission/        Role + capability checks
├── push/              Web Push (VAPID)
├── query/             Filter/sort/paginate query builder
├── runtime/wasm/      wazero-based WASM runtime
├── security/          Enforcer, Capabilities, HMAC, secretbox, nonce
├── strings/           Shared string helpers
├── tool/              Addon tool runtime + dispatcher + registry
├── webhooks/          Outbound HMAC-signed webhooks with retry
├── ws/                WebSocket hub
├── ARCHITECTURE.md    The four laws of the kernel — read before adding a package
├── CHANGELOG.md       Release history
└── README.md          Top-level overview
```

Cada package es dueño de sus tests (`*_test.go`), un `doc.go` cuando es
útil, y una sola responsabilidad coherente (ver `ARCHITECTURE.md`, *Law 0*).

## 4. Tests, vet, race detector

CI corre los mismos comandos que deberías correr localmente antes de abrir
un PR (`.github/workflows/ci.yml`):

```bash
go vet ./...
go test -race -coverprofile=coverage.out ./...
```

Patterns de subset útiles:

```bash
# A single package, verbose
go test -race -v ./runtime/wasm/...

# Watch a single test
go test -race -run TestEnforcer_Shadow ./security/...

# Coverage HTML
go tool cover -html=coverage.out
```

El race detector es **obligatorio** — el kernel hostea goroutines de larga
duración (hub WS, dispatcher de webhooks, workers de notificaciones) y la
mayoría de las regresiones aparecen solo bajo `-race`.

## 5. Trabajar con el SDK localmente

En el día a día el kernel resuelve el SDK desde `../metacore-sdk` vía la
directiva replace en `go.mod`. Para previsualizar el build que los
consumers van a pullear realmente:

```bash
go mod edit -dropreplace github.com/asteby/metacore-sdk
go mod tidy
go test ./...
```

Re-agregá el replace antes de retomar trabajo local:

```bash
go mod edit -replace github.com/asteby/metacore-sdk=../metacore-sdk
go mod tidy
```

Nunca hagas commit de un `go.mod` sin la directiva replace en una branch
feature — el script de release la dropea como parte del tagging.

## 6. Branches y flujo de contribución

- Hacé branch desde `main`. Usá un prefix descriptivo:
  `feat/`, `fix/`, `refactor/`, `docs/`, `chore/`.
- Conventional Commits están enforced para la generación del changelog. Los
  markers `feat:` / `fix:` / `BREAKING CHANGE:` manejan la decisión de
  SemVer al momento del release (ver [`release.md`](./release)).
- Un cambio coherente por PR. Los cambios de API pública necesitan un
  comentario `// Deprecated:` correspondiente si reemplazan symbols
  existentes.
- Abrí el PR, dejá que el CI esté green, pedí review, squash-merge.

## 7. Estilo y guardrails arquitectónicos

El statement completo está en [`ARCHITECTURE.md`](https://github.com/asteby/metacore-kernel/blob/main/ARCHITECTURE.md). Los
cuatro puntos a internalizar antes de contribuir:

1. **Estabilidad por interfaces, no por structs.** Cada contrato público
   vive detrás de una interfaz (`AuthUser`, `AuthOrg`, `ModelDefiner`, …).
   Las apps extienden por composición; el kernel evoluciona sin romperlas.
2. **Defaults opinados, escape hatches pluggables.** Los constructores
   toman un `Config`; los overrides de behavior son métodos `With*`, nunca
   forks.
3. **Los servicios son obligatorios, los handlers son opcionales.** Un
   `service.go` nunca debe importar `github.com/gofiber/fiber/v2`. Los
   handlers son wrappers Fiber finos sobre los servicios.
4. **Qué pertenece al kernel.** Substrate que cada web app necesita en el
   día uno. La infra reusable opcional va al SDK; el código específico de
   producto va a la app. Ante la duda, dejala afuera por default.

Reglas adicionales de dependencias:

- `modelbase/` no importa nada más allá de `gorm.io/gorm`,
  `github.com/google/uuid`, `golang.org/x/crypto/bcrypt`. Sin Fiber, sin
  HTTP, sin SDK.
- `obs/` importa solo la standard library. Es el package más upstream.
- Ningún package del kernel puede importar
  `github.com/asteby/metacore-sdk/pkg/*` salvo que la dependencia sea sobre
  un tipo público estable (manifest, schema de bundle).

## 8. Debug del runtime de WASM

El runtime de WASM vive en `runtime/wasm/`. Un puñado de patterns que
rinden cuando estás diagnosticando fallas de addon:

- **Reproducí en `wasm_test.go`.** El package incluye un fixture que
  compila un módulo Go-to-WASM chiquito y lo corre por toda la ABI; copiá
  ese test y agregá el escenario que falla.
- **Inspeccioná los host imports.** `capabilities.go` registra cada host
  import. Si el addon tira `imported function not found` al instanciar,
  el nombre del symbol falta en `registerHostModule`.
- **Chequeá el modo del enforcer.** Localmente el default es `ModeShadow`;
  prendé `ModeEnforce` (`METACORE_ENFORCE=1`) cuando estés persiguiendo
  bugs de capability así aparecen como errores en lugar de warnings.
- **Memoria y timeouts.** Los defaults son 64 MiB / 10 s por invocación,
  con un techo global de 256 MiB en la config del runtime. Override por
  addon vía `manifest.BackendSpec`.

## 9. Trabajar en el framework de CRUD dinámico

La mayoría de los cambios de kernel que afectan apps consumer aterrizan en
`dynamic/`, `metadata/`, `permission/`, `installer/`, o `manifest/`. Algunos
patterns que rinden cuando estás iterando ahí:

- **Fixture de punta a punta por package.** `dynamic/service_test.go`
  construye una DB SQLite en memoria, registra un modelo fake, y ejercita
  Create / Get / List / Update / Delete. Copiá ese fixture para agregar un
  test de regresión para un nuevo code path; no levantes Postgres salvo
  que estés testeando RLS o un feature solo de Postgres.
- **Los tests de handler usan `app.Test()`.** `metadata/handler_test.go`
  muestra el pattern: construí una app Fiber, montá el handler, mandá
  requests estilo `httptest`, asertá el envelope JSON. Mantené los tests
  de handler tan finos como sea posible — los tests a nivel servicio
  cubren correctness, los de handler cubren status codes y el envelope del
  wire.
- **Los fixtures de manifest viven en los tests.** `manifest/validate_test.go`
  e `installer/dualwrite_test.go` declaran manifests inline. No hay un
  directorio de fixtures separado; si necesitás uno complejo, agregalo al
  lado del test que lo usa.
- **Los cambios que afectan schema tocan tres lugares.** Agregar un tipo
  de columna a `dynamic/model.go:columnGoType` también requiere
  `dynamic/schema.go:pgColumnType` y una entrada correspondiente en
  [`dynamic-system.md`](./dynamic-system) en *Tipos de columna permitidos*.
  Renombrar o sacar un tipo de columna es un bump MAJOR porque los
  manifests de addon que están en producción dependen de él.
- **Las shapes de respuesta públicas son contratos del wire.** Los JSON
  tags sobre `modelbase.TableMetadata`, `modelbase.ModalMetadata`, el
  envelope de `dynamic.Handler` (`{success, data, meta}`) y `query.PageMeta`
  son estables entre versiones minor. Agregar un campo está bien; sacar o
  renombrar uno es un MAJOR.

## 10. Releasing

El proceso de release — selección de versión, publicación de tag,
GoReleaser, dispatch a consumers, retract — está documentado de punta a
punta en [`release.md`](./release). En corto: `git push origin vX.Y.Z`
corre el workflow de release, que corre la suite de tests, indexa el proxy,
publica un GitHub Release y notifica a cada repo consumer.
