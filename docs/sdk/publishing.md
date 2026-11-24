# Publishing `@asteby/metacore-*` packages

End-to-end guide for releasing packages from this monorepo and propagating updates to consumer apps. The pipeline is fully automated with [Changesets](https://github.com/changesets/changesets) + a single GitHub Actions workflow.

> **Estado actual: publicacion hibrida (OIDC primero, staging de respaldo).**
> `release-npm.yml` ejecuta `scripts/publish-staged.mjs`. Para cada paquete no publicado:
>
> 1. Intenta `npm publish <tgz> --access public` **sin token** (el secreto viaja como
>    `NPM_STAGE_TOKEN`, no como `NODE_AUTH_TOKEN`/`NPM_TOKEN`), asi npm solo puede autenticar por OIDC
>    (Trusted Publishing; `id-token: write`, npm 11). Si el paquete tiene publicador confiable, se
>    publica solo, se crea el tag git y se imprime `New tag: <pkg>@<ver>` para que changesets/action
>    cree tags y GitHub Releases.
> 2. Si npm exige staging (`E_STAGE_REQUIRED`, "staging area") o rechaza por politica/autenticacion
>    (E401/E403/E404), cae a `npm stage publish` **con** `NPM_STAGE_TOKEN`; un humano aprueba en
>    npmjs.com -> Staged Packages. Sin tag hasta que se publique de verdad.
> 3. Cualquier otro error es un fallo con el mensaje real de npm (el job queda rojo; los demas
>    paquetes se procesan igual).
>
> El resumen del job (`$GITHUB_STEP_SUMMARY`) lista por paquete: publicado directo / preparado en
> staging (stageId) / ya pendiente / fallo. Es idempotente.
>
> **Para que sea 100% automatico** el dueno ejecuta una vez `bash scripts/npm-trust-all.sh`
> (`npm trust github <pkg> --repo asteby/metacore-sdk --file release-npm.yml --allow-publish --allow-stage-publish -y`
> para los 34 paquetes; `npm trust list <pkg>` verifica). Funciona antes y despues de configurarlo.
> Si se renombra el workflow hay que repetirlo.
>
> *Prioridad de credenciales:* no pude verificar en la documentacion de npm si un token presente
> gana al OIDC, por eso el intento directo corre sin el secreto (solo OIDC) y el token solo se
> entrega al fallback de staging; es seguro en ambos casos.

## Table of contents

- [TL;DR](#tldr)
- [Prerequisites](#prerequisites)
- [The release workflow](#the-release-workflow)
- [Approving staged packages](#approving-staged-packages)
- [Durable alternative: trusted publishing (OIDC)](#durable-alternative-trusted-publishing-oidc)
- [Authoring a changeset](#authoring-a-changeset)
- [Pre-releases (next / beta / rc)](#pre-releases-next--beta--rc)
- [Linked and ignored packages](#linked-and-ignored-packages)
- [Troubleshooting](#troubleshooting)
- [References](#references)

## TL;DR

1. Change code in `packages/*`.
2. Run `pnpm changeset` and pick the bump (patch / minor / major) per affected package.
3. Commit the generated `.changeset/*.md` alongside your code in a PR.
4. When your PR merges to `main`, the **Release npm packages** workflow opens (or updates) a `chore(release): version packages` PR.
5. Merging that "Version Packages" PR bumps versions, regenerates changelogs, and triggers `scripts/publish-staged.mjs`, which **stages** every unpublished package on npm (`npm stage publish`). A maintainer then approves the staged versions with 2FA (see [Approving staged packages](#approving-staged-packages)).
6. Renovate bots in consumer host applications pick up the new versions and open PRs. Patch / minor bumps auto-merge; majors await human review.

## Prerequisites

- **`NPM_TOKEN` repo secret** in `asteby/metacore-sdk` — a [Granular Access Token](https://docs.npmjs.com/about-access-tokens) with publish permission on the `@asteby` scope and the **"Bypass 2FA"** option enabled. Generate it under <https://www.npmjs.com/settings/asteby/tokens>.
- **Repo permissions:** the workflow declares `contents: write`, `pull-requests: write`, and `id-token: write`. Make sure "Allow GitHub Actions to create and approve pull requests" is enabled in repo Settings → Actions → General.
- **pnpm 10+** locally (matches CI). The root `packageManager` field is authoritative.
- **Node.js 20+** locally.

## The release workflow

File: [`.github/workflows/release-npm.yml`](../.github/workflows/release-npm.yml).

It runs on every push to `main`:

- If the push **contains** `.changeset/*.md` files not yet versioned, [`changesets/action@v1`](https://github.com/changesets/action) opens or updates a single PR titled `chore(release): version packages` whose diff bumps `package.json` versions and moves the changesets into `CHANGELOG.md`.
- If the push **is** that PR being merged (so no changesets are left), the action runs `node scripts/publish-staged.mjs` (after the workflow builds all packages). For each public workspace package whose local version is not on npm (same check `changeset publish` uses: `npm view name@version`) it runs `pnpm pack` (resolves `workspace:*` and `publishConfig`) and `npm stage publish <tgz> --access public`, in dependency order. It does not publish by itself.

The action reads [`.changeset/config.json`](../.changeset/config.json) for scope, access (`public`), linked packages, and base branch.

## Approving staged packages

Since npm's 2026 policy ([restricting bypass-2FA tokens](https://github.blog/changelog/2026-07-31-restricting-npm-bypass-2fa-granular-access-tokens), [install-time security / GAT bypass2fa deprecation](https://github.blog/changelog/2026-07-08-npm-install-time-security-and-gat-bypass2fa-deprecation)), a granular token with *Bypass 2FA* can no longer publish directly: it can only **stage** (`E_STAGE_REQUIRED` otherwise; `changeset publish` surfaced it as a misleading `E403 undefined` / `E404`). A human must approve with 2FA:

1. Merge the "Version Packages" PR. When the workflow finishes, open the run's **Summary**: it lists each `name@version` with its `stageId`, those that already had a pending stage (not duplicated) and those that failed with npm's real error message. The job is red if any package failed; the rest are still staged.
2. Approve at <https://www.npmjs.com> → *Staged Packages* (2FA prompt), or `npm stage list <pkg>` / `npm stage approve <stageId>`. Stages may sit in `validating` for a moment first.
3. Re-running the workflow is safe: published versions and versions with a pending stage are skipped.

**Git tags / GitHub Releases:** only versions published directly (OIDC) get a tag and a `New tag:` line. Staged versions get none, because nothing is published until a human approves. After approving, tag manually from `main` (`pnpm exec changeset tag && git push --follow-tags`).

Locally: `pnpm release:stage -- --dry-run` (or `DRY_RUN=1`) lists what would be staged without staging anything.

## Durable alternative: trusted publishing (OIDC)

npm [trusted publishing](https://docs.npmjs.com/trusted-publishers) lets the workflow publish with a short-lived OIDC identity instead of a stored token, with no staging step. The workflow already has `permissions: id-token: write`. Per package (all `@asteby/metacore-*`):

1. npmjs.com → the package → *Settings* → *Trusted publisher* → GitHub Actions: organization/user `asteby`, repository `metacore-sdk`, workflow filename `release-npm.yml` (no environment unless one is added).
2. Brand-new packages must exist first (stage/approve once, or publish the first version by hand); the trusted publisher is configured on an existing package.
3. No hace falta tocar el workflow: el script ya intenta OIDC primero. Con `scripts/npm-trust-all.sh` se configuran los paquetes (usa `--allow-stage-publish` ademas de `--allow-publish`). npm CLI >= 11.5.1 es requisito (el workflow instala npm 11) y la provenance se genera sola.
4. Once every package is configured, delete the `NPM_TOKEN` secret and keep `scripts/publish-staged.mjs` only as a fallback.

## Authoring a changeset

```bash
pnpm changeset
```

Pick:

- **Which packages changed.** Space to toggle, enter to confirm.
- **Bump level.**
  - `patch` — bug fix, docs, internal refactor with no API change.
  - `minor` — new backwards-compatible feature.
  - `major` — breaking change. Triggers consumer-side human review via Renovate.
- **Summary.** Goes straight into the CHANGELOG. Write it for humans, not for git history. Imperative voice ("add", "fix", "remove"), one line, ideally under 80 chars.

Commit the generated `.changeset/*.md` in the same PR as your code. Reviewers eyeball both the change and the bump.

## Pre-releases (next / beta / rc)

Use the `pre` mode when you want to ship from `main` without going stable:

```bash
pnpm changeset pre enter next
pnpm changeset        # author changeset as usual
# ...merge PRs to main, each publishes as e.g. 0.3.0-next.0, 0.3.0-next.1
pnpm changeset pre exit
```

While in pre mode the release workflow publishes with the `next` dist-tag, so `pnpm add @asteby/metacore-ui@next` opts in. Exit pre mode before the stable release PR.

For an isolated channel (e.g., `beta`), use `pnpm changeset pre enter beta`.

## Linked and ignored packages

`.changeset/config.json` configures two important constraints:

- `linked: [["@asteby/metacore-ui", "@asteby/metacore-theme"]]` — UI and theme **must** version together. They share a design contract; bumping one alone breaks consumers.
- `ignore: []` — every public package participates in the publish flow. (Past constraint: `starter-core` and `create-metacore-app` were marked `private` and ignored; both are now public.)

Do not edit these without understanding the downstream effect on consumers.

## Troubleshooting

- **"Version Packages" PR never opens.** No unversioned `.changeset/*.md` files on `main`. Run `pnpm changeset` and push.
- **Publish step shows `E_STAGE_REQUIRED`, or an old run showed `E403 undefined` / `E404`.** The token can only stage. This is now the expected flow; approve in *Staged Packages* (see above).
- **Publish step fails with 401 / 403.** `NPM_TOKEN` missing, expired, or lacks publish rights on `@asteby`. Regenerate as a Granular Access Token with "Bypass 2FA" enabled and update the repo secret.
- **Publish succeeds for some packages but skips others.** Check the package's `"private": true` flag and that `.changeset/config.json` `ignore` array doesn't list it.
- **Linked packages drifted.** `@asteby/metacore-ui` and `@asteby/metacore-theme` must bump together. The `linked` array enforces this — don't remove it without understanding the downstream effect on consumers.
- **`pnpm install` fails in CI with `ERR_PNPM_LOCKFILE_BROKEN`.** The lockfile is regenerated via `--frozen-lockfile=false`. If it persists, delete `pnpm-lock.yaml` locally, reinstall, commit.
- **Version Packages PR has merge conflicts with `pnpm-lock.yaml`.** Close it. The next push to `main` regenerates a clean one.
- **Consumer app didn't get a Renovate PR.** Confirm the consumer's `renovate.json` matches [`renovate-consumer-template.json`](./renovate-consumer-template.json) and that Renovate is installed on the consumer repo (`github.com/apps/renovate`).

## References

- Changesets docs: <https://github.com/changesets/changesets>
- changesets/action: <https://github.com/changesets/action>
- Consumer Renovate template: [`renovate-consumer-template.json`](./renovate-consumer-template.json)
- Consumer integration guide: [`CONSUMER_GUIDE.md`](./consumer-guide)
