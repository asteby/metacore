# Publishing

Every addon that runs in production goes through the same real pipeline:

```
  build tarball  →  sign (ed25519)  →  metacore publish  →  scan  →  review  →  catalog
```

This document describes the **actual** flow implemented by
`hub/backend/cmd/metacore/publish.go` (the CLI) and
`hub/backend/internal/api/publish.go` + `hub/backend/internal/scanner`
(the server side) — not a hypothetical one. If this doc and the code ever
disagree, trust the code.

## 1. Register a developer identity + keypair

```bash
metacore keys init
# writes an ed25519 keypair under your metacore config dir
metacore keys show
# prints the public key to hand to a hub admin
```

Register the public key with the hub (an admin adds you as a developer);
you receive a `developer_id` (UUID). Auth for the publish request itself is
**either**:

- `Authorization: Bearer <JWT>` — log in through the hub developer portal,
  pass the token via `--token` or `METACORE_TOKEN`; **or**
- `X-Developer-Key: <shared key>` — the legacy path (`--developer-key` /
  `METACORE_DEVELOPER_KEY`), ask a hub admin for `MARKETPLACE_DEV_KEY`.

## 2. Publish

```bash
cd my-addon/        # directory with manifest.json at its root
metacore publish \
  --hub https://hub.asteby.com \
  --developer-id "$METACORE_DEVELOPER_ID" \
  --token "$METACORE_TOKEN" \
  --key ~/.metacore/keys/dev.pem
```

`metacore publish` (see `hub/backend/cmd/metacore/publish.go`) does five
things, in order:

1. **Load** the addon from disk (manifest + any migrations/frontend/backend
   payloads referenced by it).
2. **Validate** `manifest.Validate(manifest.APIVersion)` — the same v3
   validator the kernel runs, client-side, so a broken manifest fails fast
   instead of round-tripping to the hub.
3. **Pack** into a deterministic `tar.gz` (`kernel/bundle.Write`).
4. **Sign**: `sha256(tarball)`, then `ed25519.Sign(priv, digest)` — the
   signature travels as a **hex-encoded** string, not a detached `.sig`
   file.
5. **POST** `multipart/form-data` to `<hub>/v1/addons`:

   | Part | Content |
   |---|---|
   | `bundle` | the tarball, as a file part |
   | `signature` | hex(ed25519 signature over sha256(bundle)) |
   | `developer_id` | your registered UUID |
   | `Authorization: Bearer <jwt>` **or** `X-Developer-Key: <key>` | header, not a form field |

Use `--dry-run` to pack + sign locally without uploading (useful in CI to
fail fast on a manifest problem before touching the network).

The server enforces a **32 MiB** cap on the whole multipart bundle
(`maxBundleSize` in `publish.go`).

## 3. What happens server-side

`handlePublish` (`hub/backend/internal/api/publish.go`):

1. Verifies the signature against the developer's registered public key(s).
2. Re-parses and re-validates the bundle/manifest server-side (never trust
   the client's validation alone).
3. Runs `scanner.Scan` against any WASM module in the bundle (see below).
4. Sets `review_status`:
   - **`pending_review`** — the default for everyone.
   - **`auto_approved`** — the scanner's fast path flips it here when the
     publish is *provably safe* (passes every automated check with no
     warnings needing a human look).
   - **First-party override**: developers whose UUID is in
     `HUB_FIRST_PARTY_DEVELOPER_IDS` (the platform's own developer
     accounts) are stamped `publisher_tier: "official"` and their
     publishes **skip the review queue entirely — including their very
     first publish** (`isFirstParty` in `router.go`; reviewing your own
     first-party addons is treated as theatre, not a security control).
   Track status at `<hub>/admin/submissions`; nothing appears in the
   public catalog until it reaches `approved`/`auto_approved`.

## 4. The scanner (`hub/backend/internal/scanner`)

Runs synchronously inside the publish request (single-digit ms for a
typical addon) against any `.wasm` module the bundle carries:

- **Magic + version bytes** of the WASM binary are checked.
- **Import allowlist** — every host import the module asks for must be in
  the ABI v1 whitelist (`log`, `env_get`, `http_fetch`/`http_request`,
  `event_emit`, `db_query`, `db_exec`, `connector_get`, `data_mutate`,
  `data_query`, …, per `metacore-kernel/docs/abi/v1.md`). Anything outside
  it — raw WASI filesystem/network syscalls, unknown host modules — is
  **rejected**; it would never run on the kernel anyway.
  - `http_request` and `connector_get` are treated as **real gated ABI
    imports**, not string-matched: if the module imports either, the
    manifest **must** declare the matching capability (`http:fetch` /
    `connector:read` respectively) or the publish is rejected. This is a
    static check on the compiled binary's import section, so a manifest
    that "forgets" the capability cannot slip through by omission.
- **Export check** — requires at least one entry point: every key in
  `manifest.backend.exports`, or a recognised lifecycle export (`_start`,
  `handle_request`). No entry point = dead code = rejected.
- **Size cap**: 10 MiB on the `.wasm` artifact itself (separate from the
  32 MiB whole-bundle cap).
- **Warnings only (never block)**: hardcoded URLs whose host isn't covered
  by a declared `http:fetch` capability; suspicious export density
  (obfuscation smell).
- **Dry-run instantiation** against a NULL host (a `wazero` runtime whose
  `metacore_host` imports all stub-return `0`). A module that panics at
  link time or during an optional `_start` call is rejected — it would
  crash on real traffic too.

The `ScanReport` is persisted (`AddonVersion.scan_report` jsonb) and
rendered in the admin review UI.

## 5. Versioning

Strict semver, checked by the manifest validator (`metadata.version`).
There's no server-enforced bump-size policy beyond that today — treat this
as convention, not an automated gate:

| Change | Bump |
|---|---|
| New action / setting / connector | minor |
| New nullable column, new model | minor |
| Removing a column, renaming a key, breaking a manifest field shape | major |
| Bugfix, no schema/contract change | patch |

Every approved version is retained; installations pin to a specific
version and only move forward when the org admin clicks Update in ops.

## 6. Keys, tokens, secrets

- The **ed25519 keypair** (`metacore keys init`) signs bundles — it's your
  publisher identity, not a bearer credential.
- **`developer_id`** is the UUID a hub admin registers for you (maps your
  pubkey to an account).
- **`METACORE_TOKEN`** (JWT) or **`METACORE_DEVELOPER_KEY`** (legacy shared
  key) authenticates the upload request itself — separate from the
  signature.
- Never put secrets in the manifest. Use `settings[].secret: true` (host
  settings) or `connectors[].credentials[].type: "secret"` (per-org
  credentials) — both are stored encrypted server-side, never round-tripped
  on a GET. See [`manifest-spec.md` §14](./manifest-spec#14-settings)
  and [§8](./manifest-spec#8-connectors).

## See also

- [`manifest-spec.md`](./manifest-spec) — the full v3 manifest field reference.
- [`addon-cookbook.md`](./addon-cookbook) — end-to-end recipes.
- [`wasm-abi.md`](./wasm-abi) — the WASM guest/host contract the scanner enforces against.
- [`capabilities.md`](./capabilities) — the `kind` catalog for `capabilities[]`.
