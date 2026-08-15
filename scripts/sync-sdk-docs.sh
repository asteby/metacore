#!/usr/bin/env bash
# Sync docs/sdk/*.md in this repo (metacore, the public VitePress portal)
# from the canonical source docs/*.md in metacore-sdk (public repo).
#
# Filename mapping (source -> mirror) differs for two files that were
# renamed to kebab-case when the mirror was first created:
#   CONSUMER_GUIDE.md -> consumer-guide.md
#   PUBLISHING.md     -> publishing.md
# Every other file keeps its name. docs/sdk/index.md has no source
# equivalent (site-specific landing page) and is never touched here.
#
# Two content transforms are applied on copy, because the mirror renders
# under VitePress' extensionless routing and its own asset path:
#   1. ./assets/metacore.svg -> /logo.svg   (site-wide logo asset)
#   2. (./<doc>.md[#anchor]) -> (./<doc>[#anchor])  for links between
#      mirrored docs, using the same rename map as above.
#
# Usage: scripts/sync-sdk-docs.sh <path-to-metacore-sdk-checkout>

set -euo pipefail

SRC_DIR="${1:?usage: sync-sdk-docs.sh <path-to-metacore-sdk-checkout>}/docs"
DEST_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/docs/sdk"

if [[ ! -d "$SRC_DIR" ]]; then
  echo "source docs dir not found: $SRC_DIR" >&2
  exit 1
fi

# source basename (no .md) -> mirror basename (no .md)
declare -A RENAME=(
  [CONSUMER_GUIDE]=consumer-guide
  [PUBLISHING]=publishing
)

mirror_name() {
  local base="$1"
  echo "${RENAME[$base]:-$base}"
}

# Build the sed program for step 2 once: one s/// per known doc, longest
# source name first isn't needed since we anchor on "(./NAME.md".
link_sed_args=()
for f in "$SRC_DIR"/*.md; do
  base="$(basename "$f" .md)"
  mirror="$(mirror_name "$base")"
  # only rewrite when the on-disk source name and mirror name are the
  # same doc reference used in markdown links, i.e. the *mirror's own*
  # cross-links use the mirror filename already once copied — but
  # source files link to each other using SOURCE basenames, so rewrite
  # (./SOURCE.md -> (./MIRROR
  link_sed_args+=(-e "s#(\\./${base}\\.md#(./${mirror}#g")
done

changed=0
for f in "$SRC_DIR"/*.md; do
  base="$(basename "$f" .md)"
  mirror="$(mirror_name "$base")"
  dest="$DEST_DIR/${mirror}.md"

  tmp="$(mktemp)"
  sed \
    -e 's#\./assets/metacore\.svg#/logo.svg#g' \
    "${link_sed_args[@]}" \
    "$f" > "$tmp"

  if [[ ! -f "$dest" ]] || ! cmp -s "$tmp" "$dest"; then
    mv "$tmp" "$dest"
    echo "updated: docs/sdk/${mirror}.md"
    changed=1
  else
    rm -f "$tmp"
  fi
done

if [[ "$changed" -eq 0 ]]; then
  echo "no changes"
fi

exit 0
