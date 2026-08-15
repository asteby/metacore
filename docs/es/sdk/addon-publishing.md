# Publicación

Cada addon que corre en producción pasa por el mismo pipeline real:

```
  build tarball  →  firma (ed25519)  →  metacore publish  →  scan  →  review  →  catálogo
```

Este documento describe el flujo **real** implementado por
`hub/backend/cmd/metacore/publish.go` (el CLI) y
`hub/backend/internal/api/publish.go` + `hub/backend/internal/scanner`
(el lado servidor) — no uno hipotético. Si este doc y el código alguna vez
no coinciden, confiá en el código.

## 1. Registrar una identidad de developer + keypair

```bash
metacore keys init
# escribe un keypair ed25519 bajo tu directorio de config de metacore
metacore keys show
# imprime la public key para entregarle a un admin del hub
```

Registrá la public key con el hub (un admin te agrega como developer);
recibís un `developer_id` (UUID). La auth para el request de publish en sí es
**una de estas dos**:

- `Authorization: Bearer <JWT>` — logueate a través del portal de developer
  del hub, pasá el token vía `--token` o `METACORE_TOKEN`; **o**
- `X-Developer-Key: <shared key>` — el path legacy (`--developer-key` /
  `METACORE_DEVELOPER_KEY`), pedile a un admin del hub `MARKETPLACE_DEV_KEY`.

## 2. Publicar

```bash
cd my-addon/        # directorio con manifest.json en su raíz
metacore publish \
  --hub https://hub.asteby.com \
  --developer-id "$METACORE_DEVELOPER_ID" \
  --token "$METACORE_TOKEN" \
  --key ~/.metacore/keys/dev.pem
```

`metacore publish` (ver `hub/backend/cmd/metacore/publish.go`) hace cinco
cosas, en orden:

1. **Carga** el addon desde disco (manifest + cualquier payload de
   migrations/frontend/backend referenciado por él).
2. **Valida** con `manifest.Validate(manifest.APIVersion)` — el mismo
   validador v3 que corre el kernel, del lado cliente, así un manifest roto
   falla rápido en vez de ir y volver al hub.
3. **Empaqueta** en un `tar.gz` determinístico (`kernel/bundle.Write`).
4. **Firma**: `sha256(tarball)`, después `ed25519.Sign(priv, digest)` — la
   firma viaja como un string **hex-encoded**, no como un archivo `.sig`
   separado.
5. **POST** `multipart/form-data` a `<hub>/v1/addons`:

   | Parte | Contenido |
   |---|---|
   | `bundle` | el tarball, como file part |
   | `signature` | hex(firma ed25519 sobre sha256(bundle)) |
   | `developer_id` | tu UUID registrado |
   | `Authorization: Bearer <jwt>` **o** `X-Developer-Key: <key>` | header, no un form field |

Usá `--dry-run` para empaquetar + firmar localmente sin subir (útil en CI
para fallar rápido ante un problema de manifest antes de tocar la red).

El servidor enforcea un cap de **32 MiB** sobre todo el bundle multipart
(`maxBundleSize` en `publish.go`).

## 3. Qué pasa del lado servidor

`handlePublish` (`hub/backend/internal/api/publish.go`):

1. Verifica la firma contra la(s) public key(s) registrada(s) del developer.
2. Re-parsea y re-valida el bundle/manifest del lado servidor (nunca confía
   solo en la validación del cliente).
3. Corre `scanner.Scan` contra cualquier módulo WASM en el bundle (ver
   abajo).
4. Setea `review_status`:
   - **`pending_review`** — el default para todos.
   - **`auto_approved`** — el fast path del scanner lo cambia acá cuando el
     publish es *demostrablemente seguro* (pasa cada check automatizado sin
     warnings que necesiten una mirada humana).
   - **Override first-party**: developers cuyo UUID está en
     `HUB_FIRST_PARTY_DEVELOPER_IDS` (las cuentas de developer propias de
     la plataforma) quedan estampados `publisher_tier: "official"` y sus
     publishes **se saltean la cola de review por completo — incluyendo su
     primer publish** (`isFirstParty` en `router.go`; revisar tus propios
     addons first-party se trata como teatro, no como un control de
     seguridad).
   Trackeá el status en `<hub>/admin/submissions`; nada aparece en el
   catálogo público hasta llegar a `approved`/`auto_approved`.

## 4. El scanner (`hub/backend/internal/scanner`)

Corre sincrónicamente dentro del request de publish (milisegundos de un
solo dígito para un addon típico) contra cualquier módulo `.wasm` que traiga
el bundle:

- **Magic + version bytes** del binario WASM se chequean.
- **Import allowlist** — cada import de host que el módulo pide tiene que
  estar en la whitelist del ABI v1 (`log`, `env_get`,
  `http_fetch`/`http_request`, `event_emit`, `db_query`, `db_exec`,
  `connector_get`, `data_mutate`, `data_query`, …, según
  `metacore-kernel/docs/abi/v1.md`). Cualquier cosa fuera de eso — syscalls
  raw de filesystem/network WASI, módulos de host desconocidos — es
  **rechazada**; de todas formas nunca correría en el kernel.
  - `http_request` y `connector_get` se tratan como **imports reales del
    ABI, gateados**, no como string-match: si el módulo importa cualquiera
    de los dos, el manifest **tiene que** declarar la capability
    correspondiente (`http:fetch` / `connector:read` respectivamente) o el
    publish se rechaza. Este es un check estático sobre la sección de
    imports del binario compilado, así que un manifest que "se olvida" la
    capability no puede colarse por omisión.
- **Export check** — requiere al menos un entry point: cada key en
  `manifest.backend.exports`, o un export de lifecycle reconocido
  (`_start`, `handle_request`). Sin entry point = código muerto = rechazado.
- **Cap de tamaño**: 10 MiB sobre el artefacto `.wasm` en sí (separado del
  cap de 32 MiB de todo el bundle).
- **Solo warnings (nunca bloquean)**: URLs hardcodeadas cuyo host no está
  cubierto por una capability `http:fetch` declarada; densidad sospechosa
  de exports (olor a ofuscación).
- **Instanciación dry-run** contra un host NULL (un runtime `wazero` cuyos
  imports `metacore_host` devuelven todos `0` como stub). Un módulo que
  panickea al momento de link o durante una llamada opcional a `_start` es
  rechazado — también crashearía con tráfico real.

El `ScanReport` se persiste (`AddonVersion.scan_report` jsonb) y se
renderiza en la UI de review de admin.

## 5. Versionado

Semver estricto, chequeado por el validador del manifest
(`metadata.version`). No hay una policy de tamaño de bump enforced por el
servidor más allá de eso hoy — tratá esto como convención, no como un gate
automatizado:

| Cambio | Bump |
|---|---|
| Nueva action / setting / connector | minor |
| Nueva columna nullable, nuevo modelo | minor |
| Sacar una columna, renombrar una key, romper la forma de un field del manifest | major |
| Bugfix, sin cambio de schema/contrato | patch |

Cada versión aprobada se retiene; las instalaciones pinnean a una versión
específica y solo avanzan cuando el admin de la org clickea Update en ops.

## 6. Keys, tokens, secrets

- El **keypair ed25519** (`metacore keys init`) firma bundles — es tu
  identidad de publisher, no una credencial bearer.
- **`developer_id`** es el UUID que un admin del hub registra para vos
  (mapea tu pubkey a una cuenta).
- **`METACORE_TOKEN`** (JWT) o **`METACORE_DEVELOPER_KEY`** (shared key
  legacy) autentica el request de upload en sí — separado de la firma.
- Nunca pongas secrets en el manifest. Usá `settings[].secret: true`
  (settings del host) o `connectors[].credentials[].type: "secret"`
  (credenciales por org) — ambos se guardan encriptados del lado servidor,
  nunca vuelven en un GET. Ver
  [`manifest-spec.md` §14](./manifest-spec#14-settings) y
  [§8](./manifest-spec#8-connectors).

## Ver también

- [`manifest-spec.md`](./manifest-spec) — la referencia completa de campos del manifest v3.
- [`addon-cookbook.md`](./addon-cookbook) — recetas end-to-end.
- [`wasm-abi.md`](./wasm-abi) — el contrato guest/host de WASM contra el que enforcea el scanner.
- [`capabilities.md`](./capabilities) — el catálogo de `kind` para `capabilities[]`.
