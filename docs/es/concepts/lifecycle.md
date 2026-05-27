# Ciclo de vida

Un addon pasa por tres momentos en runtime: **install**, **upgrade**, **uninstall**. El installer del kernel maneja cada uno transaccionalmente — o todo tiene éxito, o el host queda exactamente como estaba. Esta página explica qué corre en cada paso y a qué hooks puede engancharse un addon.

[[toc]]

## Install

Cuando llega un `.mcbundle` (subido vía API, dejado en `BundleDir`, o registrado en código como un addon embedded), el installer corre:

1. **Verificar** — firma del bundle (ed25519), validación del manifest (v3 estricto, o v2 up-convertido), formato de versión.
2. **Resolver dependencies** — cada `compatibility.requires[]` debe satisfacerse: `key: "kernel"` contra la versión del host, y cualquier otro `key` contra un addon instalado en un rango semver compatible. Las entradas `optional: true` no fallan el install si faltan.
3. **Chequeo de conflictos** — los nombres de tabla, los targets de capability y las keys de permission no deben colisionar con addons instalados.
4. **Abrir transacción** — cada paso de abajo corre dentro de una sola transacción de DB.
5. **Aplicar DDL** — para cada entrada de `models[]`, generar `CREATE TABLE` + indexes + foreign keys en el schema Postgres del addon (`addon_<key>`). `dynamic.EnsureSchema → Apply` es idempotente.
6. **Registrar metadata** — schema de columnas, declaraciones de capability, permisos/roles RBAC, rutas de actions.
7. **Correr install hook** — si el manifest declara `lifecycle.install` (un nombre de función como `"Install"`), el kernel lo despacha (en WASM si el addon trae un módulo, in-process si es embedded). Un error no-nil aborta.
8. **Proyectar hooks CRUD** — las `contributions.subscriptions[]` se registran en el hook registry.
9. **Montar rutas** — CRUD dinámico, actions, endpoints de slots de frontend.
10. **Commit** — el addon ya está vivo, y el kernel emite un `ManifestChangeEvent` para que los frontends del SDK tiren su cache de metadata sin pollear.

Si cualquier paso falla, la transacción rollbackea. El host queda exactamente como estaba; no hay install parcial.

### Install hooks

Opcionales. Se usan para setup único que el DDL solo no puede expresar — sembrar un registro por defecto, registrar un webhook externo, agendar una entrada de cron.

```json
"lifecycle": {
  "install":   "Install",
  "uninstall": "Uninstall",
  "enable":    "Enable",
  "disable":   "Disable"
}
```

Cada valor es un **nombre de función exportada** que provee el backend WASM (o el Go embedded) del addon — no un path de archivo. El hook recibe el contexto del installer y devuelve un error para abortar el install.

## Upgrade

`Installer.Upgrade(ctx, orgID, newBundle)` maneja la transición (el evento de lifecycle `upgrade` lo dispara el installer, no `Install`):

1. **Verificar** la firma del nuevo bundle y revalidar el manifest. Los errores de guarda (`ErrNotInstalled`, `ErrSameVersionUpgrade`, `ErrCannotDowngrade`) aparecen **antes de cualquier mutación**.
2. **Comparar versiones** — mismo `metadata.key`, `version` mayor. Los downgrades se rechazan.
3. **Despachar `upgrade` (fase `before`)** — el payload lleva `from_version` / `to_version`. Un error no-nil aborta: la fila queda intacta, no corre trabajo de schema.
4. **Aplicar schema** — `EnsureSchema → Apply → CreateTable / SyncSchema` sobre el manifest nuevo. Aditivo: las columnas viejas sobreviven; las migrations ya registradas se saltean.
5. **Re-proyectar hooks CRUD** — las suscripciones viejas se desregistran y se registra la forma nueva.
6. **Persistir el bump de versión** con un merge de settings — los valores ajustados por el usuario ganan; los defaults nuevos del manifest se agregan.
7. **Despachar `upgrade` (fase `after`)** — con un contador `migrations_applied`. Los errores de `after` se loguean y se tragan (el upgrade ya commiteó; el rollback de DDL es inseguro).
8. **Emitir `ManifestChangeEvent`** para que los frontends del SDK tiren su cache de metadata.

### Escalera de upgrade

El manifest declara una escalera de migraciones matcheada por semver. Cada paso matchea la versión *registrada* contra `from`:

```json
"lifecycle": {
  "upgrade": [
    { "from": ">=1.0.0 <1.3.0", "type": "wasm", "function": "MigrateTo_1_3" },
    { "from": ">=1.3.0 <2.0.0", "type": "sql",  "function": "migrations/1_3_to_2_0.sql" }
  ]
}
```

`type: "wasm"` llama a una función exportada por el backend del addon; `type: "sql"` corre un archivo SQL goose-compatible del bundle. (Un `kind: "Preset"` no puede declarar `lifecycle.upgrade[]`.)

### Lo que está bloqueado sin una migration explícita

- Cambiar el tipo de una columna (excepto ampliarlo, p.ej. `integer → bigint`)
- Remover una columna `primary_key: true`
- Remover una columna referenciada por las foreign keys de otro modelo
- Remover un permission que está actualmente otorgado a usuarios (los datos existen)

Estos se exponen como errores de install con mensajes claros; el autor del addon tiene que declarar una migration que los maneje.

## Uninstall

Revierte el install:

1. **Chequear dependencies** — ningún otro addon instalado puede depender de este. Si alguno depende, el uninstall se rechaza salvo que se setee `--cascade`.
2. **Abrir transacción.**
3. **Correr uninstall hook** — si está definido. Se usa para limpiar recursos externos (deregistrar webhooks, cancelar entradas de cron).
4. **Desmontar WASM** — módulo expulsado, sandbox cerrado.
5. **Desmontar rutas** — CRUD dinámico, actions, slots.
6. **Tirar el schema** — `DROP TABLE` para cada entrada de `models[]`. Por defecto el kernel **no** tira las tablas; las renombra con un sufijo `_tombstone` y un timestamp, para que un operador pueda restaurar los datos si el uninstall fue un error. Un flag `--purge` las tira directamente.
7. **Remover metadata** — capabilities, permissions, declaraciones de actions.
8. **Commit.**

### Uninstall hooks

```json
"lifecycle": { "uninstall": "Uninstall" }
```

El hook (un nombre de función exportada) corre **antes** de cualquier teardown del schema, así que tiene acceso completo a los datos.

## Lo que ven los hosts

La API de installer del host expone el resultado de cada paso — el log de migration, output del hook, árbol de dependencies al momento del install. Los installs viven bajo `/api/metacore/installations`; el endpoint de upgrade es `PUT /api/metacore/installations/:key/version` (subida de bundle multipart). Una UI de admin de host típicamente renderiza el historial como un timeline.

## Versionado

Las versiones son semver. El kernel no aplica la semántica de semver (es decir, no chequea que un bump de major version sea "realmente" breaking) — eso lo posee el autor del addon. Lo que sí aplica:

- Las versiones son estrictamente monótonas por `metadata.key` del addon
- Las migrations se declaran entre versiones consecutivas
- Las firmas del bundle matchean la versión que reclaman

## Una nota sobre Presets

Instalar un `kind: "Preset"` es una sola transición que resuelve e instala sus `preset.addons[]` en orden de dependencias, y después aplica los `defaults` (settings) del preset encima. Un preset es la unidad de distribución de un vertical — instalás uno, obtenés un set coherente de addons foundation cableados entre sí.

## Relacionado

- [Manifest](/es/concepts/manifest) — donde se declaran los hooks de lifecycle.
- [Permisos](/es/concepts/permissions) — qué cambia cuando se agregan/remueven permissions durante un upgrade.
- [Kernel docs / installer ↗](https://asteby.github.io/metacore-kernel/) — internals completos del installer.
