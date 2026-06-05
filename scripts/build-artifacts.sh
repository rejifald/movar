#!/usr/bin/env bash
#
# Build distributable extension artifacts for every browser target and drop
# versioned, browser-named zips in the repo root.
#
# Run from anywhere — it resolves the repo root itself:
#   pnpm build:artifacts            # or: bash scripts/build-artifacts.sh
#
# Produces in the repo root (version read from apps/extension/package.json):
#   movar-extension-<version>-chrome.zip     (also used for Edge Add-ons)
#   movar-extension-<version>-firefox.zip
#   movar-extension-<version>-safari.zip     (unpacked web-extension, archival)
#   movar-extension-<version>-safari-app.dmg (native macOS app, ad-hoc signed — macOS + Xcode only)
#   movar-extension-<version>-sources.zip    (AMO reviewer source bundle)
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

# Native macOS app (the Safari Xcode wrapper). Needs Xcode, so it only runs on
# macOS — elsewhere the script still produces every browser zip and skips this.
step "Building the native macOS app (Safari)"
if command -v xcodebuild >/dev/null 2>&1; then
  pnpm --filter @movar/extension build:safari:app
  app="$out/safari/Movar.app"
  [ -d "$app" ] || fail "build:safari:app did not produce $app"
  dest="$root/movar-extension-$version-safari-app.dmg"
  rm -f "$dest"
  # A compressed .dmg — the format macOS apps ship in, matching the notarized
  # release DMG from the release-safari CI job. This local build is ad-hoc
  # signed (dev-only), so the .dmg just mirrors the shipped artifact's format.
  hdiutil create -volname "Movar" -srcfolder "$app" -ov -format UDZO "$dest" >/dev/null
  ok "$(basename "$dest")  ($(du -h "$dest" | cut -f1 | tr -d ' '))"
else
  printf '    (no xcodebuild — skipped native macOS app; build it on macOS with Xcode)\n'
fi

printf '\n\033[32m●\033[0m Artifacts ready in %s\n' "$root"
