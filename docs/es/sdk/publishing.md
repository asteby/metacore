# Publicación de packages `@asteby/metacore-*`

Guía end-to-end para publicar packages desde este monorepo y propagar updates a apps consumidoras. El pipeline está completamente automatizado con [Changesets](https://github.com/changesets/changesets) + un solo workflow de GitHub Actions.

## Tabla de contenidos

- [TL;DR](#tldr)
- [Prerequisitos](#prerequisitos)
- [El workflow de release](#el-workflow-de-release)
- [Escribir un changeset](#escribir-un-changeset)
- [Pre-releases (next / beta / rc)](#pre-releases-next--beta--rc)
- [Packages linkeados e ignorados](#packages-linkeados-e-ignorados)
- [Troubleshooting](#troubleshooting)
- [Referencias](#referencias)

## TL;DR

1. Cambiá código en `packages/*`.
2. Corré `pnpm changeset` y elegí el bump (patch / minor / major) por package afectado.
3. Commiteá el `.changeset/*.md` generado junto con tu código en un PR.
4. Cuando tu PR mergea a `main`, el workflow **Release npm packages** abre (o actualiza) un PR `chore(release): version packages`.
5. Mergear ese PR "Version Packages" bumpea versiones, regenera changelogs, y dispara `changeset publish` a npm bajo el scope `@asteby`.
6. Los bots de Renovate en apps host consumidoras toman las nuevas versiones y abren PRs. Bumps de patch / minor auto-mergean; los majors esperan review humano.

## Prerequisitos

- **Repo secret `NPM_TOKEN`** en `asteby/metacore-sdk` — un [Granular Access Token](https://docs.npmjs.com/about-access-tokens) con permiso de publish en el scope `@asteby` y la opción **"Bypass 2FA"** habilitada. Generalo en <https://www.npmjs.com/settings/asteby/tokens>.
- **Permisos del repo:** el workflow declara `contents: write`, `pull-requests: write`, e `id-token: write`. Asegurate de que "Allow GitHub Actions to create and approve pull requests" esté habilitado en repo Settings → Actions → General.
- **pnpm 10+** localmente (matchea CI). El campo `packageManager` raíz es la autoridad.
- **Node.js 20+** localmente.

## El workflow de release

Archivo: [`.github/workflows/release-npm.yml`](../.github/workflows/release-npm.yml).

Corre en cada push a `main`:

- Si el push **contiene** archivos `.changeset/*.md` aún no versionados, [`changesets/action@v1`](https://github.com/changesets/action) abre o actualiza un solo PR titulado `chore(release): version packages` cuyo diff bumpea las versiones de `package.json` y mueve los changesets al `CHANGELOG.md`.
- Si el push **es** ese PR siendo mergeado (así no quedan changesets), la action corre `pnpm exec changeset publish`, que ejecuta `turbo run build --filter=./packages/*` seguido de `changeset publish`, pusheando a npm cualquier package cuya versión bumpeó.

La action lee [`.changeset/config.json`](../.changeset/config.json) para scope, access (`public`), packages linkeados, y branch base.

## Escribir un changeset

```bash
pnpm changeset
```

Elegí:

- **Qué packages cambiaron.** Espacio para togglear, enter para confirmar.
- **Nivel de bump.**
  - `patch` — bug fix, docs, refactor interno sin cambio de API.
  - `minor` — nueva feature compatible hacia atrás.
  - `major` — breaking change. Dispara review humano del lado consumidor vía Renovate.
- **Resumen.** Va directo al CHANGELOG. Escribilo para humanos, no para historial git. Voz imperativa ("add", "fix", "remove"), una línea, idealmente menos de 80 chars.

Commiteá el `.changeset/*.md` generado en el mismo PR que tu código. Los reviewers miran ambos: el cambio y el bump.

## Pre-releases (next / beta / rc)

Usá el modo `pre` cuando querés publicar desde `main` sin pasar a stable:

```bash
pnpm changeset pre enter next
pnpm changeset        # escribí el changeset como siempre
# ...mergeá PRs a main, cada uno publica como ej. 0.3.0-next.0, 0.3.0-next.1
pnpm changeset pre exit
```

Mientras estés en modo pre, el workflow de release publica con el dist-tag `next`, así `pnpm add @asteby/metacore-ui@next` opta por entrar. Salí del modo pre antes del PR de release stable.

Para un canal aislado (ej. `beta`), usá `pnpm changeset pre enter beta`.

## Packages linkeados e ignorados

`.changeset/config.json` configura dos constraints importantes:

- `linked: [["@asteby/metacore-ui", "@asteby/metacore-theme"]]` — UI y theme **deben** versionarse juntos. Comparten un contrato de design; bumpear uno solo rompe a los consumidores.
- `ignore: ["@asteby/metacore-starter-core", "create-metacore-app"]` — estos packages son privados / internos y excluidos del flujo de publicación. Sus changesets igual se generan pero nunca disparan publicaciones a npm.

No edites estos sin entender el efecto downstream en consumidores.

## Troubleshooting

- **El PR "Version Packages" nunca se abre.** No hay archivos `.changeset/*.md` sin versionar en `main`. Corré `pnpm changeset` y pusheá.
- **El step de publish falla con 401 / 403.** `NPM_TOKEN` falta, expiró, o le faltan derechos de publish en `@asteby`. Regeneralo como Granular Access Token con "Bypass 2FA" habilitado y actualizá el repo secret.
- **El publish tiene éxito para algunos packages pero saltea otros.** Chequeá el flag `"private": true` del package y que el array `ignore` de `.changeset/config.json` no lo liste.
- **Packages linkeados desincronizados.** `@asteby/metacore-ui` y `@asteby/metacore-theme` deben bumpear juntos. El array `linked` lo enforce — no lo saques sin entender el efecto downstream en consumidores.
- **`pnpm install` falla en CI con `ERR_PNPM_LOCKFILE_BROKEN`.** El lockfile se regenera vía `--frozen-lockfile=false`. Si persiste, borrá `pnpm-lock.yaml` localmente, reinstalá, commiteá.
- **El PR de Version Packages tiene conflictos de merge con `pnpm-lock.yaml`.** Cerralo. El próximo push a `main` regenera uno limpio.
- **La app consumidora no recibió un PR de Renovate.** Confirmá que el `renovate.json` del consumidor matchea [`renovate-consumer-template.json`](./renovate-consumer-template.json) y que Renovate está instalado en el repo consumidor (`github.com/apps/renovate`).

## Referencias

- Docs de Changesets: <https://github.com/changesets/changesets>
- changesets/action: <https://github.com/changesets/action>
- Template de Renovate para consumidores: [`renovate-consumer-template.json`](./renovate-consumer-template.json)
- Guía de integración para consumidores: [`consumer-guide.md`](./consumer-guide)
