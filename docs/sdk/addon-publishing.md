# Publishing

Every addon that runs in production goes through the same pipeline:

```
  local build  →  sign  →  upload  →  review  →  published
```

This document covers each step.

## 1. Prepare an Ed25519 keypair

```bash
metacore keygen --out dev
# wrote dev.pem (private, 0600) and dev.pub (public)
```

- `dev.pem` is Ed25519 in PKCS#8 PEM. Keep it outside git. Use a password
  manager or a hardware token (`ssh-keygen -t ed25519 -N ''` + a wrapper)
  for production signing identities.
- `dev.pub` is the public key. Register it on
  `<your-hub-url>/developers → API keys`. You may register multiple public
  keys per developer account (dev, CI, release engineer).

The marketplace verifies every upload against the set of registered public
keys. Bundles signed with an unregistered key are rejected before review.

## 2. Build

```bash
metacore build --strict --sign dev.pem
# built mi-addon-1.0.0.tar.gz (2 migrations, 14 frontend files, 1 backend files, target=wasm)
# wrote mi-addon-1.0.0.tar.gz.sig
```

`--strict` fails on warnings. It is mandatory for the review step.

`--sign` chains `metacore sign` after the build, producing
`<bundle>.sig` next to the tarball. You can also sign separately:

```bash
metacore sign --key dev.pem mi-addon-1.0.0.tar.gz
```

The signature is an Ed25519 signature over SHA-256 of the bundle bytes.

## 3. Upload

```bash
curl -X POST https://your-hub.example.com/v1/addons \
  -H "X-Developer-Key: $METACORE_DEV_KEY" \
  -F bundle=@mi-addon-1.0.0.tar.gz \
  -F signature=@mi-addon-1.0.0.tar.gz.sig
```

Response:

```json
{
  "id": "ad_01HK...",
  "status": "pending",
  "addon_key": "mi-addon",
  "version": "1.0.0",
  "uploaded_at": "2026-04-15T12:00:00Z"
}
```

Upload limits: 50 MB per bundle, 200 files in `frontend/`, 25 migrations.

## 4. Review flow

```
pending
   │
   ├──► changes_requested  ── email with actionable diff, you re-upload
   │
   ├──► approved           ── marketplace-signed block added to manifest.signature
   │
   └──► published          ── live at <your-hub-url>/addons/<key>
```

Typical review SLA is 3 business days. Status changes trigger email to the
developer account and appear on `<your-hub-url>/developers/submissions`.

### What the review checks

- Signature verifies against a registered public key.
- `metacore validate` passes (re-run server-side).
- No capability without `reason`.
- No `db:write` on core tables for non-finance/non-operations categories.
- No `http:fetch` target that bypasses the anti-wildcard rule.
- SQL migrations parse, contain no `DROP DATABASE`, `GRANT`, superuser
  functions, or `pg_read_server_files`.
- Frontend SRI integrity matches declared `integrity`.
- Readme + screenshots render.
- License field populated; SPDX identifier preferred.

## 5. Versioning

Strict semver.

| Change | Bump |
|---|---|
| New tool / action / settings field | minor |
| New migration adding a nullable column | minor |
| Removing a column / renaming a key | major |
| Bugfix without schema change | patch |

The marketplace keeps every approved version. Installations pin to a
specific version and pick up upgrades only when the admin clicks *Update*.

Yanking a version (security issue): email `security@asteby.com` or use the
developer dashboard. Installed tenants get an in-product banner.

## 6. What gets rejected

Fast rejections (same-day, automated):

- Wildcards that violate [capabilities.md](./capabilities).
- Missing `capabilities` for a detected outbound call.
- SQL in migrations that looks malicious (`COPY FROM PROGRAM`, etc.).
- Signature mismatch.
- Kernel range incompatible with current production (`>=1.x`).

Slow rejections (human review):

- Misleading `description`, `category`, or screenshots.
- Dependency on a deprecated core model.
- Accessibility violations in the frontend bundle.

## 7. Keys, tokens, and secrets

- `$METACORE_DEV_KEY` is a personal access token issued by the hub. Rotate
  quarterly. It is *not* the Ed25519 key.
- Never put secrets (API tokens, OAuth credentials) in the manifest. Use
  `settings[].secret: true` and let the host inject them via `env_get` at
  runtime.

## 8. Installing a pre-release locally

For staging environments, upload with `?channel=beta`:

```bash
curl -X POST "https://your-hub.example.com/v1/addons?channel=beta" ...
```

Beta bundles are visible only to organizations that opt in from the
developer dashboard — useful for private customers and dogfooding.
