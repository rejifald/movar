#!/usr/bin/env bash
#
# Pre-submission verification suite.
#
# Run from the repo root before submitting Movar to any extension store.
# Performs every check that doesn't need a browser. Fails fast on the
# first error — the store reviewers will too.
#
# Exit codes:
#   0 — all checks passed; safe to upload the produced zips
#   1 — at least one check failed; details in the output above
#
# Manual smoke testing in Chrome and Firefox is NOT covered here and
# must be done by hand once this script is green. See:
#   apps/extension/store-assets/README.md
#   deployment-checklist.md
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

step "1/4 validate (typecheck + lint + test + publint)"
pnpm validate
ok "validate clean"

step "2/4 build chrome zip"
pnpm --filter @movar/extension zip
chrome_zip=$(ls -t apps/extension/.output/*-chrome.zip 2>/dev/null | head -n 1)
[ -n "$chrome_zip" ] || fail "no chrome zip produced under apps/extension/.output/"
ok "produced $chrome_zip"

step "3/4 build firefox zip"
pnpm --filter @movar/extension zip:firefox
firefox_zip=$(ls -t apps/extension/.output/*-firefox.zip 2>/dev/null | head -n 1)
[ -n "$firefox_zip" ] || fail "no firefox zip produced under apps/extension/.output/"
ok "produced $firefox_zip"

step "4/4 inspect zip contents"
inspect_zip() {
  local zip="$1"
  local label="$2"
  printf "    inspecting %s\n" "$label"
  local contents
  contents=$(unzip -l "$zip")

  local leaks=()
  echo "$contents" | grep -qE '\.map$' && leaks+=("sourcemap (.map)")
  echo "$contents" | grep -qE '(^|/)\.env(\.|$)' && leaks+=(".env file")
  echo "$contents" | grep -q '\.DS_Store' && leaks+=(".DS_Store")
  echo "$contents" | grep -q 'node_modules/' && leaks+=("node_modules/")

  if [ "${#leaks[@]}" -gt 0 ]; then
    for leak in "${leaks[@]}"; do
      printf "    \033[31m✗\033[0m %s contains %s\n" "$label" "$leak"
    done
    exit 1
  fi
  ok "$label clean (no sourcemaps, .env, .DS_Store, or node_modules)"
}

inspect_zip "$chrome_zip" "chrome zip"
inspect_zip "$firefox_zip" "firefox zip"

printf "\n\033[32m●\033[0m All automated checks passed.\n"
printf "  Next: manual smoke test per deployment-checklist.md §Pre-submission verification.\n"
