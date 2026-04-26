# Ciclo de vida

Un addon pasa por tres momentos en runtime: **install**, **upgrade**, **uninstall**. El installer del kernel maneja cada uno transaccionalmente — o todo tiene éxito, o el host queda exactamente como estaba. Esta página explica qué corre en cada paso y a qué hooks puede engancharse un addon.

[[toc]]

## Install

Cuando llega un `.mcbundle` (subido vía API, dejado en `BundleDir`, o registrado en código como un addon embedded), el installer corre:

1. **Verificar** — firma del bundle, schema del manifest, formato de versión.
2. **Resolver dependencies** — cada entrada en `manifest.dependencies[]` ya tiene que estar instalada en una versión compatible. Si no, el install se rechaza.
3. **Chequeo de conflictos** — los nombres de tabla, los targets de capability y los IDs de permission no deben colisionar con addons instalados.
4. **Abrir transacción** — cada paso de abajo corre dentro de una sola transacción de DB.
5. **Aplicar DDL** — para cada entrada de `tables[]`, generar `CREATE TABLE` + indexes + foreign keys. Los mapeos de tipos (uuid, timestamp, enum, etc.) son conscientes del dialecto (Postgres / SQLite).
6. **Registrar metadata** — schema de columnas, declaraciones de capability, IDs de permission, rutas de actions.
7. **Correr install hook** — si el addon define `lifecycle.install`, el kernel lo llama (en WASM si el addon trae un módulo WASM, in-process si es un addon embedded).
8. **Montar rutas** — CRUD dinámico, actions, endpoints de slots de frontend.
9. **Cargar WASM** — si está presente, instanciar el módulo en wazero con su set de capabilities.
10. **Commit** — el addon ya está vivo.

Si cualquier paso falla, la transacción rollbackea. El host queda exactamente como estaba; no hay install parcial.

### Install hooks

Opcionales. Se usan para setup único que el DDL solo no puede expresar — sembrar un registro por defecto, registrar un webhook externo, agendar una entrada de cron.

```json
"lifecycle": {
  "install": "./go/install.go"
}
```

El hook recibe el contexto del installer del kernel (handle de DB, KV, secret store, helpers de identity) y devuelve un error para abortar el install.

## Upgrade

Cuando llega una nueva versión de un addon instalado, el installer:

1. **Comparar versiones** — mismo `manifest.id`, `version` mayor. Las versiones más viejas se rechazan por defecto (el downgrade requiere un flag explícito).
2. **Diff de manifests** — a nivel tabla, columna, permission. El diff es la fuente de verdad para qué migrations correr.
3. **Planificar migrations** — las adiciones son seguras (columnas nuevas, indexes nuevos, permissions nuevos); cambios y removals requieren manejo explícito. Algunos están bloqueados directamente (p.ej. cambiar el tipo de una primary key) sin una migration declarada en el manifest.
4. **Abrir transacción.**
5. **Aplicar diff de DDL** — `ADD COLUMN`, `CREATE INDEX`, etc. Consciente del dialecto.
6. **Correr upgrade hook** — si está definido, llamado con la versión previa + la nueva. Se usa para migraciones de datos (p.ej. backfillear una columna nueva desde una vieja).
7. **Actualizar metadata** — nuevo schema de columnas, nuevos IDs de permission, nuevas rutas de action.
8. **Recargar WASM** — el módulo viejo se desmonta, el nuevo se instancia.
9. **Commit.**

Misma garantía de atomicidad: una falla rollbackea el upgrade entero.

### Upgrade hooks

```json
"lifecycle": {
  "upgrade": [
    { "from": "0.1.0", "to": "0.2.0", "hook": "./go/upgrade_0_1_to_0_2.go" }
  ]
}
```

Se pueden encadenar múltiples hooks; el installer los aplica en orden, salteando los que no matchean la versión actual. Cada uno corre en su propio savepoint.

### Lo que está bloqueado sin una migration explícita

- Cambiar el tipo de una columna (excepto ampliarlo, p.ej. `int → bigint`)
- Remover una columna `primaryKey: true`
- Remover una columna referenciada por columnas `ref` de otro addon
- Remover un permission que está actualmente otorgado a usuarios (los datos existen)

Estos se exponen como errores de install con mensajes claros; el autor del addon tiene que declarar una migration que los maneje.

## Uninstall

Revierte el install:

1. **Chequear dependencies** — ningún otro addon instalado puede depender de este. Si alguno depende, el uninstall se rechaza salvo que se setee `--cascade`.
2. **Abrir transacción.**
3. **Correr uninstall hook** — si está definido. Se usa para limpiar recursos externos (deregistrar webhooks, cancelar entradas de cron).
4. **Desmontar WASM** — módulo expulsado, sandbox cerrado.
5. **Desmontar rutas** — CRUD dinámico, actions, slots.
6. **Tirar el schema** — `DROP TABLE` para cada entrada de `tables[]`. Por defecto el kernel **no** tira las tablas; las renombra con un sufijo `_tombstone` y un timestamp, para que un operador pueda restaurar los datos si el uninstall fue un error. Un flag `--purge` las tira directamente.
7. **Remover metadata** — capabilities, permissions, declaraciones de actions.
8. **Commit.**

### Uninstall hooks

```json
"lifecycle": {
  "uninstall": "./go/uninstall.go"
}
```

El hook corre **antes** de cualquier teardown del schema, así que tiene acceso completo a los datos.

## Lo que ven los hosts

La API de installer del host expone el resultado de cada paso — el log de migration, output del hook, árbol de dependencies al momento del install, plan de diff al momento del upgrade. Una UI de admin de host típicamente renderiza esto como un timeline usando `GET /api/installs/:id`.

## Versionado

Las versiones son semver. El kernel no aplica la semántica de semver (es decir, no chequea que un bump de major version sea "realmente" breaking) — eso lo posee el autor del addon. Lo que sí aplica:

- Las versiones son estrictamente monótonas por addon ID
- Las migrations se declaran entre versiones consecutivas
- Las firmas del bundle matchean la versión que reclaman

## Relacionado

- [Manifest](/es/concepts/manifest) — donde se declaran los hooks de lifecycle.
- [Permisos](/es/concepts/permissions) — qué cambia cuando se agregan/remueven permissions durante un upgrade.
- [Kernel docs / installer ↗](https://asteby.github.io/metacore-kernel/) — internals completos del installer.
