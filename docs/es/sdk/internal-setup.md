# Configuración interna — desarrollo local para contributors al SDK

Este documento es para **contributors al SDK en sí**. Si solo consumís packages `@asteby/metacore-*` desde otra app, ver [`consumer-guide.md`](./consumer-guide) en su lugar.

## Tabla de contenidos

- [Prerequisitos](#prerequisitos)
- [Clonar e instalar](#clonar-e-instalar)
- [Layout del repositorio](#layout-del-repositorio)
- [Workflows comunes](#workflows-comunes)
- [Linkear contra una app consumidora](#linkear-contra-una-app-consumidora)
- [Configuración GOPRIVATE](#configuración-goprivate)
- [Secrets de CI](#secrets-de-ci)

## Prerequisitos

- **Node.js 20+** y **pnpm 10+** (el campo `packageManager` raíz es la autoridad; `corepack enable` va a instalar el pnpm correspondiente).
- **Go 1.22+** para el CLI (`cli/`) y helpers Go (`pkg/`).
- **TinyGo 0.31+** solo si rebuildeás los ejemplos WASM.
- **GitHub PAT** con scope `repo` (read) si también trabajás contra módulos privados del kernel — ver [Configuración GOPRIVATE](#configuración-goprivate).

## Clonar e instalar

```bash
git clone https://github.com/asteby/metacore-sdk.git
cd metacore-sdk

# Lado Go — CLI, helpers pkg/, examples/
go mod download
go test ./...

# Lado npm — monorepo packages/*
corepack enable
pnpm install
pnpm -r build
pnpm -r test
```

## Layout del repositorio

```
metacore-sdk/
├── cli/          # CLI Go — init, validate, build, sign, compile-wasm
├── pkg/          # Helpers SDK Go — tipos de manifest, signing, host context
├── packages/     # Workspace pnpm — packages npm @asteby/metacore-*
├── examples/     # Addons de referencia (buildeados en CI para detectar regresiones)
├── templates/    # Templates de scaffold embebidos por el CLI
├── docs/         # Documentación pública
└── .changeset/   # Estado de versión + changelog (ver PUBLISHING.md)
```

## Workflows comunes

```bash
# Buildear todo
pnpm -r build

# Buildear un solo package y observar cambios
pnpm --filter @asteby/metacore-ui dev

# Type-check
pnpm typecheck

# Lint
pnpm lint

# Test
pnpm test

# Generar tipos TypeScript desde Go (tygo)
pnpm codegen

# Escribir un changeset (cualquier PR que toque packages/* necesita uno)
pnpm changeset
```

Para Go:

```bash
go test ./...
go build -o bin/metacore ./cli
./bin/metacore help
```

## Linkear contra una app consumidora

Cuando iterás sobre un package en tándem con una app host consumidora, usá una referencia `file:` desde el consumidor a este repo. Ver [`consumer-guide.md` § Patrón mixto npm + `file:`](./consumer-guide#4-patrón-mixto-npm--file-para-desarrollo-local).

Buildeá el package cada vez que lo cambiás — pnpm symlinkea el `dist/`, así que el consumidor toma el nuevo bundle en su próximo restart de dev-server (o HMR para ESM):

```bash
pnpm --filter @asteby/metacore-runtime-react build
```

## Configuración GOPRIVATE

Si tu trabajo toca módulos que dependen de repos privados (el kernel, hub-server), configurá Go para traerlos a través de tu PAT:

```bash
export GOPRIVATE=github.com/asteby/metacore-kernel,github.com/asteby/hub-server

cat >> ~/.netrc <<EOF
machine github.com
  login <your_github_user>
  password <PAT_with_repo_read>
EOF
chmod 600 ~/.netrc
```

El PAT debe tener scope `repo` (read) para los repositorios privados.

## Secrets de CI

Los siguientes secrets están configurados a nivel de organización GitHub para que CI clone módulos privados y publique:

- `METACORE_READ_TOKEN` — PAT con acceso de read a repos privados.
- `NPM_TOKEN` — token de publish npm para el scope `@asteby` (Granular Access Token con "Bypass 2FA" habilitado — ver [`publishing.md`](./publishing)).
- `GHCR_TOKEN` — token con scope `write:packages` para ghcr.io.
