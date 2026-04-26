# Internal setup — local development for SDK contributors

This document is for **contributors to the SDK itself**. If you only consume `@asteby/metacore-*` packages from another app, see [`consumer-guide.md`](./consumer-guide) instead.

## Table of contents

- [Prerequisites](#prerequisites)
- [Clone and install](#clone-and-install)
- [Repository layout](#repository-layout)
- [Common workflows](#common-workflows)
- [Linking against a consumer app](#linking-against-a-consumer-app)
- [GOPRIVATE setup](#goprivate-setup)
- [CI secrets](#ci-secrets)

## Prerequisites

- **Node.js 20+** and **pnpm 10+** (the root `packageManager` field is authoritative; `corepack enable` will install the matching pnpm).
- **Go 1.22+** for the CLI (`cli/`) and Go helpers (`pkg/`).
- **TinyGo 0.31+** only if you rebuild the WASM examples.
- **GitHub PAT** with `repo` (read) scope if you also work against private kernel modules — see [GOPRIVATE setup](#goprivate-setup).

## Clone and install

```bash
git clone https://github.com/asteby/metacore-sdk.git
cd metacore-sdk

# Go side — CLI, pkg/ helpers, examples/
go mod download
go test ./...

# npm side — packages/* monorepo
corepack enable
pnpm install
pnpm -r build
pnpm -r test
```

## Repository layout

```
metacore-sdk/
├── cli/          # Go CLI — init, validate, build, sign, compile-wasm
├── pkg/          # Go SDK helpers — manifest types, signing, host context
├── packages/     # pnpm workspace — @asteby/metacore-* npm packages
├── examples/     # reference addons (built in CI to catch regressions)
├── templates/    # scaffold templates embedded by the CLI
├── docs/         # public documentation
└── .changeset/   # version + changelog state (see PUBLISHING.md)
```

## Common workflows

```bash
# Build everything
pnpm -r build

# Build a single package and watch
pnpm --filter @asteby/metacore-ui dev

# Type-check
pnpm typecheck

# Lint
pnpm lint

# Test
pnpm test

# Generate TypeScript types from Go (tygo)
pnpm codegen

# Author a changeset (any PR that touches packages/* needs one)
pnpm changeset
```

For Go:

```bash
go test ./...
go build -o bin/metacore ./cli
./bin/metacore help
```

## Linking against a consumer app

When iterating on a package in tandem with a consumer (Ops, Link, an internal panel), use a `file:` reference from the consumer to this repo. See [`consumer-guide.md` § Mixed npm + `file:` pattern](./consumer-guide#4-mixed-npm--file-pattern-for-local-development).

Build the package whenever you change it — pnpm symlinks the `dist/`, so the consumer picks up the new bundle on its next dev-server restart (or HMR for ESM):

```bash
pnpm --filter @asteby/metacore-runtime-react build
```

## GOPRIVATE setup

If your work touches modules that depend on private repos (the kernel, hub-server), configure Go to fetch them through your PAT:

```bash
export GOPRIVATE=github.com/asteby/metacore-kernel,github.com/asteby/hub-server

cat >> ~/.netrc <<EOF
machine github.com
  login <your_github_user>
  password <PAT_with_repo_read>
EOF
chmod 600 ~/.netrc
```

The PAT must have `repo` (read) scope for the private repositories.

## CI secrets

The following secrets are configured at the GitHub organization level for CI to clone private modules and publish:

- `METACORE_READ_TOKEN` — PAT with read access to private repos.
- `NPM_TOKEN` — npm publish token for `@asteby` scope (Granular Access Token with "Bypass 2FA" enabled — see [`publishing.md`](./publishing)).
- `GHCR_TOKEN` — token with `write:packages` scope for ghcr.io.
