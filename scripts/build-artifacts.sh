#!/usr/bin/env bash
#
# Build distributable extension artifacts for every browser target and drop
# versioned, browser-named zips in the repo root.
#
# Run from anywhere — it resolves the repo root itself:
#   pnpm build:artifacts            # or: bash scripts/build-artifacts.sh
#
# Produces in the repo root (version read from apps/extension/package.json):
#   movar-extension-<version>-chrome.zip    (also used for Edge Add-ons)
#   movar-extension-<version>-firefox.zip
#   movar-extension-<version>-safari.zip
#   movar-extension-<version>-sources.zip   (AMO reviewer source bundle)
#
# Builds the CURRENT working tree. For the exact published artifact, run this
# on a clean checkout of the release commit. It does NOT run typecheck / lint /
# test — use `pnpm verify:release` for the full pre-submission gate.
#
# Exit codes: 0 — all browser zips produced; 1 — a build/zip step failed or an
# expected zip was missing.
set -euo pipefail

cd "$(dirname "$0")/.."
root="$PWD"
out="apps/extension/.output"
version="$(node -p "require('./apps/extension/package.json').version")"

step() { printf '\n==> %s\n' "$1"; }
ok() { printf '    \033[32m✓\033[0m %s\n' "$1"; }
fail() {
  printf '    \033[31m✗\033[0m %s\n' "$1"
  exit 1
}

step "Building chrome + firefox + safari zips for v$version"
pnpm --filter @movar/extension zip          # chrome (+ AMO sources bundle)
pnpm --filter @movar/extension zip:firefox  # firefox (+ AMO sources bundle)
pnpm --filter @movar/extension zip:safari   # safari (archival)

step "Collecting versioned artifacts into the repo root"
# Copy the freshest <kind> zip out of .output to a clean, root-level name.
# `$2 = optional` downgrades a missing zip from a hard failure to a skip.
collect() {
  local kind="$1" req="${2:-required}" src dest
  src="$(ls -t "$out"/*-"$kind".zip 2>/dev/null | head -n1)"
  if [ -z "$src" ]; then
    [ "$req" = optional ] && {
      printf '    (no %s zip — skipped)\n' "$kind"
      return 0
    }
    fail "no $kind zip found under $out (did the build step run?)"
  fi
  dest="$root/movar-extension-$version-$kind.zip"
  cp -f "$src" "$dest"
  ok "$(basename "$dest")  ($(du -h "$dest" | cut -f1 | tr -d ' '))"
}
collect chrome
collect firefox
collect safari
collect sources optional

printf '\n\033[32m●\033[0m Artifacts ready in %s\n' "$root"
