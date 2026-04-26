# Proceso de release

`metacore-kernel` se distribuye como un **módulo Go**, no como binario. No
hay artefactos ejecutables; los releases existen como tags Git indexados por
`proxy.golang.org`, con GitHub Releases proveyendo un changelog
categorizado encima.

Este documento es la fuente única de verdad para cortar un release y para
recuperarse de uno embarrado.

---

## Tabla de contenidos

1. [Elegir la versión (SemVer)](#1-elegir-la-versión-semver)
2. [Cortar y publicar el tag](#2-cortar-y-publicar-el-tag)
3. [Lo que corre automáticamente](#3-lo-que-corre-automáticamente)
4. [Verificar el release](#4-verificar-el-release)
5. [Consumir desde una app host](#5-consumir-desde-una-app-host)
6. [Renovate en repos consumer](#6-renovate-en-repos-consumer)
7. [Pre-releases](#7-pre-releases)
8. [Rollback / retract](#8-rollback--retract)
9. [Troubleshooting](#9-troubleshooting)
10. [Referencias](#10-referencias)

---

## 1. Elegir la versión (SemVer)

El kernel sigue [SemVer 2.0](https://semver.org/) estrictamente porque el
grafo de módulos Go lo requiere.

| Bump  | Disparado por                                                     |
| ----- | ----------------------------------------------------------------- |
| Patch | Commits `fix:`, refactors internos, optimizaciones, doc-only      |
| Minor | Commits `feat:`, nuevos symbols exportados, deprecations marcadas con `// Deprecated:` |
| Major | `feat!:` / cuerpo `BREAKING CHANGE:`, exports removidos/renombrados, cambios de interfaz |

Los bumps major requieren el sufijo de module-path `/v2` (o superior):
`github.com/asteby/metacore-kernel/v2`. Planificá la migración del import
path en los consumers con anticipación — Renovate no puede reescribir el
sufijo por sí mismo.

Mientras el kernel está en `v0.x`, los bumps minor pueden técnicamente
incluir cambios breaking. Igual los marcamos como tales en el changelog
para que los consumers puedan distinguirlos.

### Cómo decidir

```bash
# What landed since the last tag?
git log $(git describe --tags --abbrev=0)..HEAD --oneline
```

- Cualquier línea `feat!:` / `BREAKING CHANGE:`  → major.
- Cualquier línea `feat:`                        → minor.
- Solo `fix:` / `chore:` / `docs:` / `test:`     → patch.

El primer mensaje de commit que introduce un cambio breaking gana, sin
importar cuántos fixes vayan al lado.

## 2. Cortar y publicar el tag

```bash
# From a clean main branch:
git checkout main
git pull --ff-only
git status                          # must be clean
go test -race ./...                 # match CI

# Annotated tag — required for GoReleaser to pick up the message:
git tag -a v0.2.0 -m "Release v0.2.0"
git push origin v0.2.0
```

Para pushear todos los tags pendientes de una:

```bash
git push --tags
```

## 3. Lo que corre automáticamente

`.github/workflows/release.yml` se triggerea con cada tag `v*` y corre:

1. **Checkout + Go 1.25** con cache de módulo.
2. **Tests con race detector** (`go test -race ./...`). Una falla aborta
   el release.
3. **Ping al Go proxy** — `curl https://proxy.golang.org/.../@v/<tag>.info`
   para forzar el indexado inmediato. Sin esto, `go get` puede reportar
   `unknown revision` durante varios minutos.
4. **GoReleaser** (`release --clean`) crea el GitHub Release con:
   - Changelog categorizado (features / fixes / other).
   - Source archive (`.tar.gz`).
   - Checksums.
   - `prerelease: true` automático cuando el tag arrastra un sufijo SemVer
     (`-alpha`, `-beta`, `-rc`).
5. **Dispatch a consumers** — `POST /repos/{owner}/{repo}/dispatches` a
   cada repo consumer host con `event_type=metacore-kernel-released`. Cada
   consumer puede subscribirse vía `on: repository_dispatch` para correr
   Renovate inmediatamente.

El token de dispatch (`CROSSREPO_DISPATCH_TOKEN`) necesita scope `repo` en
cada organización consumer. El step usa `continue-on-error: true` así un
dispatch fallido nunca bloquea el release en sí.

## 4. Verificar el release

```bash
# 1. GitHub Release exists
gh release view v0.2.0 --repo asteby/metacore-kernel

# 2. Go proxy indexed the tag
curl -s https://proxy.golang.org/github.com/asteby/metacore-kernel/@v/list
curl -s https://proxy.golang.org/github.com/asteby/metacore-kernel/@v/v0.2.0.info | jq

# 3. pkg.go.dev (5–30 minutes after release)
open https://pkg.go.dev/github.com/asteby/metacore-kernel@v0.2.0
```

## 5. Consumir desde una app host

En cualquier repo host consumer:

```bash
go env -w GOPRIVATE="github.com/asteby/*"   # one time per machine
go get github.com/asteby/metacore-kernel@v0.2.0
go mod tidy
```

Renovate, configurado según [`consumer-guide.md`](./consumer-guide#9-template-de-renovate),
abre el PR automáticamente al próximo tick del schedule — o
inmediatamente cuando llega el evento `repository_dispatch`.

## 6. Renovate en repos consumer

Cada consumer publica un `renovate.json` derivado de
[`docs/consumer-renovate-template.json`](./consumer-renovate-template.json).
Política default:

- **patch + minor** → auto-merge (`platformAutomerge` de GitHub).
- **major** → PR abierto con labels `breaking` y `review-required`.

El auto-merge procede solo cuando el CI del consumer está green. Una suite
de tests fallida deja el PR abierto para intervención humana.

## 7. Pre-releases

Los pre-releases dejan a los consumers ejercitar cambios entrantes antes
de un tag estable.

```bash
git tag -a v0.3.0-alpha.1 -m "Pre-release v0.3.0-alpha.1"
git push origin v0.3.0-alpha.1
```

GoReleaser flaggea el GitHub Release como `prerelease: true`
automáticamente. Renovate ignora prereleases por default — para optar a
un consumer al testeo de uno, corré
`go get github.com/asteby/metacore-kernel@v0.3.0-alpha.1` manualmente en ese
repo.

## 8. Rollback / retract

Los módulos Go son **inmutables** — una vez que una versión está en
`proxy.golang.org`, queda ahí para siempre. Para marcar un release como
defectuoso, usá `retract` en `go.mod`:

```bash
# 1. Add a retract directive with a rationale comment.
go mod edit -retract=v0.2.0
```

`go.mod` resultante:

```go
module github.com/asteby/metacore-kernel

go 1.25

retract (
    v0.2.0 // leaked credentials in logs; use v0.2.1+
)
```

Pasos:

1. Aterrizá la directiva retract (y el fix real) en `main`.
2. Taggeá una versión patch nueva que incluya las dos (`v0.2.1`).
3. Pusheá el tag — el workflow de release la indexa y dispatcha consumers.
4. Los consumers que corran `go get -u` van a ver un warning y resolver a
   la próxima versión no-retracted.

Para retractar un rango contiguo:

```go
retract [v0.2.0, v0.2.4]
```

## 9. Troubleshooting

| Síntoma                                   | Causa probable                        | Fix                                                                  |
| ----------------------------------------- | ------------------------------------- | -------------------------------------------------------------------- |
| `go get` reporta `unknown revision`       | Proxy todavía no indexó               | `GOPROXY=direct go get …` o esperar 5 minutos                        |
| El workflow de release falla en tests     | Race condition reciente               | Fixealo en `main`, re-taggeá con la próxima versión patch            |
| `pkg.go.dev` no muestra la nueva versión  | Lag de index                          | Abrí `https://pkg.go.dev/github.com/asteby/metacore-kernel@vX.Y.Z` para forzar el fetch |
| El step de dispatch a consumer falla      | Al token le falta scope               | Regenerá `CROSSREPO_DISPATCH_TOKEN` con `repo`                       |
| El consumer nunca recibe un PR de Renovate | Renovate deshabilitado o `GOPRIVATE` mal configurado | Inspeccioná `renovate.json` y `hostRules.token`             |

## 10. Referencias

- [SemVer 2.0](https://semver.org/)
- [Go module reference — `retract`](https://go.dev/ref/mod#go-mod-file-retract)
- [GoReleaser for libraries](https://goreleaser.com/customization/builds/#skipping-builds)
- [Renovate `gomod` manager](https://docs.renovatebot.com/modules/manager/gomod/)
- [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/)
