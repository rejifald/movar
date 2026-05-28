#!/usr/bin/env bash
#
# Produce distribution-ready zips for every store target.
#
# Runs the WXT build + zip step for each browser and reports what landed.
# Does NOT run typecheck / lint / test / publint — for that, use
# `pnpm verify:release` (which calls this script as its build step).
#
# Outputs land under `apps/extension/.output/`:
#   movarextension-<version>-chrome.zip   → Chrome Web Store + Edge Add-ons
#   movarextension-<version>-firefox.zip  → Firefox AMO
#   movarextension-<version>-sources.zip  → AMO reviewer source bundle
#
# Exit codes:
#   0 — both zips produced
#   1 — a build or zip step failed, or expected output is missing
set -euo pipefail

cd "$(dirname "$0")/.."

step() {
  printf "\n==> %s\n" "$1"
}

ok() {
  printf "    \033[32m✓\033[0m %s\n" "$1"
}

fail() {
  printf "    \033[31m✗\033[0m %s\n" "$1"
  exit 1
}

step "1/2 chrome (also used for Edge Add-ons)"
pnpm --filter @movar/extension zip
chrome_zip=$(ls -t apps/extension/.output/*-chrome.zip 2>/dev/null | head -n 1)
[ -n "$chrome_zip" ] || fail "no chrome zip produced under apps/extension/.output/"
ok "produced $chrome_zip"

step "2/2 firefox (+ sources zip for AMO reviewer)"
pnpm --filter @movar/extension zip:firefox
firefox_zip=$(ls -t apps/extension/.output/*-firefox.zip 2>/dev/null | head -n 1)
sources_zip=$(ls -t apps/extension/.output/*-sources.zip 2>/dev/null | head -n 1)
[ -n "$firefox_zip" ] || fail "no firefox zip produced under apps/extension/.output/"
[ -n "$sources_zip" ] || fail "no sources zip produced under apps/extension/.output/"
ok "produced $firefox_zip"
ok "produced $sources_zip"

printf "\n\033[32m●\033[0m Distribution zips ready under apps/extension/.output/\n"
printf "  Next: \`pnpm verify:release\` if you haven't already, then upload per docs/release-credentials.md\n"
