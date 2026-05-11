# RFCs

Architectural decision records for the metacore ecosystem (kernel, SDK, ops,
link, and any future host application). RFCs capture decisions that span more
than one repo and therefore cannot be tracked in a single repo's CHANGELOG.

## Scope

Use an RFC when a change:

- Touches the kernel public surface (manifest, bridge, runtime/wasm, dynamic).
- Adds or removes a contract shared by host apps and addons (federation,
  capabilities, action triggers).
- Changes how addons are packaged, signed, installed, or rendered.

Single-repo changes that do not affect other repos belong in that repo's
CHANGELOG instead.

## Format

- Filename: `NNNN-kebab-case-title.md`, four-digit sequential prefix.
- Front matter: `Status`, `Date`, `Author`. Status is one of
  `Draft | Accepted | Superseded | Rejected`.
- Body sections in order: Context, Goals / Non-goals, Decisions, Migration,
  Alternatives considered, Open risks, Rollout.
- Keep it under 600 lines. Cite source files by path; do not paraphrase code
  when a `path:line` reference will do.
- Plain prose. No emojis.

## Lifecycle

1. Open the RFC as a PR with `Status: Draft`.
2. Iterate on review.
3. Flip to `Accepted` in the same PR before merging.
4. Subsequent RFCs that supersede an earlier one set the older RFC's status to
   `Superseded` and link the replacement.
