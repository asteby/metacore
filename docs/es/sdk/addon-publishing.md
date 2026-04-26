# Publicación

Cada addon que corre en producción pasa por el mismo pipeline:

```
  build local  →  firma  →  upload  →  review  →  publicado
```

Este documento cubre cada paso.

## 1. Preparar un par de claves Ed25519

```bash
metacore keygen --out dev
# wrote dev.pem (private, 0600) and dev.pub (public)
```

- `dev.pem` es Ed25519 en PKCS#8 PEM. Mantenelo fuera de git. Usá un
  password manager o un token de hardware (`ssh-keygen -t ed25519 -N ''` + un wrapper)
  para identidades de firma de producción.
- `dev.pub` es la clave pública. Registrala en
  `<your-hub-url>/developers → API keys`. Podés registrar múltiples claves públicas
  por cuenta de developer (dev, CI, release engineer).

El marketplace verifica cada upload contra el conjunto de claves públicas registradas.
Bundles firmados con una clave no registrada son rechazados antes del review.

## 2. Build

```bash
metacore build --strict --sign dev.pem
# built mi-addon-1.0.0.tar.gz (2 migrations, 14 frontend files, 1 backend files, target=wasm)
# wrote mi-addon-1.0.0.tar.gz.sig
```

`--strict` falla en warnings. Es obligatorio para el step de review.

`--sign` encadena `metacore sign` después del build, produciendo
`<bundle>.sig` al lado del tarball. También podés firmar por separado:

```bash
metacore sign --key dev.pem mi-addon-1.0.0.tar.gz
```

La firma es una firma Ed25519 sobre SHA-256 de los bytes del bundle.

## 3. Upload

```bash
curl -X POST https://your-hub.example.com/v1/addons \
  -H "X-Developer-Key: $METACORE_DEV_KEY" \
  -F bundle=@mi-addon-1.0.0.tar.gz \
  -F signature=@mi-addon-1.0.0.tar.gz.sig
```

Respuesta:

```json
{
  "id": "ad_01HK...",
  "status": "pending",
  "addon_key": "mi-addon",
  "version": "1.0.0",
  "uploaded_at": "2026-04-15T12:00:00Z"
}
```

Límites de upload: 50 MB por bundle, 200 archivos en `frontend/`, 25 migraciones.

## 4. Flujo de review

```
pending
   │
   ├──► changes_requested  ── email con diff accionable, vos resubís
   │
   ├──► approved           ── bloque firmado por marketplace agregado a manifest.signature
   │
   └──► published          ── live en <your-hub-url>/addons/<key>
```

El SLA típico de review es 3 días hábiles. Los cambios de status disparan email a la
cuenta de developer y aparecen en `<your-hub-url>/developers/submissions`.

### Qué chequea el review

- La firma verifica contra una clave pública registrada.
- `metacore validate` pasa (re-corrido server-side).
- Sin capability sin `reason`.
- Sin `db:write` sobre tablas core para categorías que no sean finance/operations.
- Sin target `http:fetch` que evada la regla anti-wildcard.
- Las migraciones SQL parsean, no contienen `DROP DATABASE`, `GRANT`, funciones
  de superuser, ni `pg_read_server_files`.
- La integridad SRI del frontend matchea el `integrity` declarado.
- El readme + screenshots renderizan.
- El field license está populado; identificador SPDX preferido.

## 5. Versionado

Semver estricto.

| Cambio | Bump |
|---|---|
| Nueva tool / acción / field de settings | minor |
| Nueva migración agregando una columna nullable | minor |
| Sacar una columna / renombrar una key | major |
| Bugfix sin cambio de schema | patch |

El marketplace mantiene cada versión aprobada. Las instalaciones se pinean a una
versión específica y toman upgrades solo cuando el admin clickea *Update*.

Yankear una versión (issue de seguridad): mandá email a `security@asteby.com` o usá el
dashboard de developer. Los tenants instalados reciben un banner in-product.

## 6. Qué se rechaza

Rechazos rápidos (mismo día, automatizados):

- Wildcards que violan [capabilities.md](./capabilities).
- Falta `capabilities` para una llamada saliente detectada.
- SQL en migraciones que parece malicioso (`COPY FROM PROGRAM`, etc.).
- Mismatch de firma.
- Rango de kernel incompatible con producción actual (`>=1.x`).

Rechazos lentos (review humano):

- `description`, `category`, o screenshots engañosos.
- Dependencia en un modelo core deprecado.
- Violaciones de accesibilidad en el bundle de frontend.

## 7. Claves, tokens, y secretos

- `$METACORE_DEV_KEY` es un personal access token emitido por el hub. Rotalo
  trimestralmente. *No* es la clave Ed25519.
- Nunca pongas secretos (tokens de API, credenciales OAuth) en el manifest. Usá
  `settings[].secret: true` y dejá que el host los inyecte vía `env_get` en
  runtime.

## 8. Instalar una pre-release localmente

Para entornos de staging, subí con `?channel=beta`:

```bash
curl -X POST "https://your-hub.example.com/v1/addons?channel=beta" ...
```

Los bundles beta son visibles solo para organizaciones que opten en desde el
dashboard de developer — útil para clientes privados y dogfooding.
