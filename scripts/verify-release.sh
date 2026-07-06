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

step "1/9 validate (typecheck + lint + test + publint)"
pnpm validate
ok "validate clean"

step "2/9 build chrome zip"
pnpm --filter @movar/extension zip
chrome_zip=$(ls -t apps/extension/.output/*-chrome.zip 2>/dev/null | head -n 1)
[ -n "$chrome_zip" ] || fail "no chrome zip produced under apps/extension/.output/"
ok "produced $chrome_zip"

step "3/9 build firefox zip"
pnpm --filter @movar/extension zip:firefox
firefox_zip=$(ls -t apps/extension/.output/*-firefox.zip 2>/dev/null | head -n 1)
[ -n "$firefox_zip" ] || fail "no firefox zip produced under apps/extension/.output/"
ok "produced $firefox_zip"

step "4/9 inspect zip contents"
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

# addons-linter is Mozilla's official linter — it's what AMO runs on
# every upload. Catching its findings locally means zero "instant
# rejection" surprises on submission. We track `@latest` deliberately so
# the local check stays in sync with AMO's server-side rules; the trade-off
# is that a future web-ext major could introduce new strict checks that
# fail CI without a code change here. When that happens, either fix the
# new finding or pin to the last known-good major.
#
# We fail on any finding (error/warning/notice) that isn't on the
# allowlist below. Two reasons we don't just use the linter's exit code
# or its `--warnings-as-errors` flag:
#   - The exit code only reflects errors. The Movar 1.0.0 submission was
#     rejected for findings that came back as notices/warnings locally.
#   - AMO's web validator and the local addons-linter disagree on severity
#     for some codes (MISSING_DATA_COLLECTION_PERMISSIONS was a notice
#     here, an error there). Treating every severity uniformly closes
#     that drift.
# The allowlist is keyed on `<CODE>|<file-glob>` pairs. Anything matched
# is reported as "acknowledged" so we don't lose visibility, but doesn't
# fail the step. Keep this list short — every entry is a known-but-tolerated
# finding we've explicitly decided not to fix.
#
# `addons_linter_acknowledged` applies to BOTH builds — the acknowledged paths
# (`chunks/globals-*.js`, `content-scripts/content.js`) exist in chrome-mv3 and
# firefox-mv3 alike.
addons_linter_acknowledged=(
  # React 19 bundles property writers like `case 'innerHTML': … e.innerHTML = n`
  # for `dangerouslySetInnerHTML` support; the value is never user input
  # in our code. Lands in the shared `chunks/globals-*.js` for every build.
  "UNSAFE_VAR_ASSIGNMENT|chunks/globals-*.js"
  # The content script lazy-loads dynamic capabilities via
  # `import(browser.runtime.getURL('features/...js' | 'models/...js'))` — dynamic
  # imports of our own web-accessible chunks, never user input. addons-linter
  # flags any non-literal `import()` argument as UNSAFE_VAR_ASSIGNMENT; the URL is
  # extension-owned.
  "UNSAFE_VAR_ASSIGNMENT|content-scripts/content.js"
)

# Chrome-ONLY acknowledgements. addons-linter is Mozilla's ruleset; these three
# findings are Firefox-manifest requirements that legitimately do not apply to
# the chrome-mv3 artifact (the one shipped to CWS + Edge). They MUST NOT be
# acknowledged for the firefox build — there, their presence is a real defect —
# so they live in a build-scoped list, not the shared one above:
#   - BACKGROUND_SERVICE_WORKER_NOFALLBACK: Chrome MV3 uses
#     `background.service_worker`; the Firefox `background.scripts` fallback is
#     intentionally absent from the chrome manifest (WXT emits the firefox
#     fallback only for the firefox target).
#   - ADDON_ID_REQUIRED: the Firefox add-on id lives in
#     `browser_specific_settings.gecko.id`, emitted for the firefox build only
#     (see wxt.config.ts); Chrome derives its id from the CWS listing, not the
#     manifest.
#   - MISSING_DATA_COLLECTION_PERMISSIONS: `data_collection_permissions` is a
#     Firefox-only AMO requirement, emitted for the firefox build only.
addons_linter_acknowledged_chrome=(
  "BACKGROUND_SERVICE_WORKER_NOFALLBACK|manifest.json"
  "ADDON_ID_REQUIRED|manifest.json"
  "MISSING_DATA_COLLECTION_PERMISSIONS|manifest.json"
)

# Lint one built extension directory with addons-linter and apply our own gate.
# Args: <build-dir> <label> [extra-acknowledged-entry ...]. addons-linter is
# Mozilla's ruleset, but most findings are browser-agnostic, so running it on the
# chrome build is still a strong sanity gate — the chrome zip is the exact
# artifact shipped to BOTH the Chrome Web Store and Edge Add-ons (release-chrome
# / release-edge), and was never linted before. Pass build-scoped acknowledgements
# (e.g. the chrome-only Firefox-manifest findings) as trailing args.
lint_build() {
  local dir="$1"
  local label="$2"
  shift 2
  local acknowledged_rules=("${addons_linter_acknowledged[@]}" "$@")
  local linter_json
  linter_json=$(mktemp)
  # web-ext lint exits non-zero on errors; we want the JSON regardless of
  # exit code so we can apply our own gate.
  npx --yes web-ext@latest lint \
    --source-dir="$dir" \
    --output=json --pretty > "$linter_json" 2>/dev/null || true

  if ! jq empty "$linter_json" 2>/dev/null; then
    cat "$linter_json"
    rm -f "$linter_json"
    fail "addons-linter did not produce valid JSON for $label (run \`pnpm exec web-ext lint --source-dir=$dir\` for the human-readable output)"
  fi

  # Flatten errors/warnings/notices into one TSV stream: severity \t code \t file \t message
  local all_findings
  all_findings=$(jq -r '
    [
      (.errors // []   | map(. + {severity: "error"})),
      (.warnings // [] | map(. + {severity: "warning"})),
      (.notices // []  | map(. + {severity: "notice"}))
    ] | add // []
    | .[] | [.severity, .code, (.file // ""), .message] | @tsv
  ' "$linter_json")
  rm -f "$linter_json"

  local acknowledged=()
  local unacknowledged=()
  if [ -n "$all_findings" ]; then
    while IFS=$'\t' read -r severity code file message; do
      local matched=0
      local rule rule_code rule_glob
      for rule in "${acknowledged_rules[@]}"; do
        rule_code="${rule%%|*}"
        rule_glob="${rule#*|}"
        # shellcheck disable=SC2053  # intentional glob match on the RHS
        if [ "$code" = "$rule_code" ] && [[ "$file" == $rule_glob ]]; then
          matched=1
          break
        fi
      done
      if [ "$matched" = 1 ]; then
        acknowledged+=("$severity $code @ $file")
      else
        unacknowledged+=("$severity $code @ ${file:-<manifest>} — $message")
      fi
    done <<<"$all_findings"
  fi

  if [ "${#unacknowledged[@]}" -gt 0 ]; then
    printf "    unacknowledged addons-linter findings (%s):\n" "$label"
    local f
    for f in "${unacknowledged[@]}"; do
      printf "      • %s\n" "$f"
    done
    printf "\n    If a finding is genuinely safe to ship, add a \`<CODE>|<file-glob>\`\n"
    printf "    entry to addons_linter_acknowledged in scripts/verify-release.sh\n"
    printf "    with a comment explaining why.\n"
    fail "addons-linter found ${#unacknowledged[@]} unacknowledged finding(s) in $label — the store will likely reject the upload"
  fi

  if [ "${#acknowledged[@]}" -gt 0 ]; then
    ok "$label addons-linter clean (${#acknowledged[@]} acknowledged finding(s) suppressed)"
    local f
    for f in "${acknowledged[@]}"; do
      printf "      · %s\n" "$f"
    done
  else
    ok "$label addons-linter clean"
  fi
}

# Rebuild one target and compare per-file content hashes against the existing
# build. A non-reproducible build trips AMO's source-code review (reviewers
# rebuild from SOURCE.md, get a different artifact, fail the review); the same
# determinism matters for the chrome artifact shipped to CWS + Edge.
# Args: <build-script> <build-dir> <label>.
verify_reproducible() {
  local build_script="$1"
  local dir="$2"
  local label="$3"
  local first_hashes second_hashes
  first_hashes=$(cd "$dir" && find . -type f -print0 | sort -z | xargs -0 shasum -a 256)
  pnpm --filter @movar/extension "$build_script" > /dev/null
  second_hashes=$(cd "$dir" && find . -type f -print0 | sort -z | xargs -0 shasum -a 256)
  if [ "$first_hashes" != "$second_hashes" ]; then
    printf "    file-hash diff between consecutive %s builds:\n" "$label"
    diff <(echo "$first_hashes") <(echo "$second_hashes") || true
    fail "$label build is non-reproducible — store source-code review will fail"
  fi
  ok "$label build is byte-for-byte reproducible"
}

step "5/9 addons-linter — chrome (Mozilla AMO ruleset)"
lint_build "apps/extension/.output/chrome-mv3" "chrome zip" "${addons_linter_acknowledged_chrome[@]}"

step "6/9 addons-linter — firefox (Mozilla AMO ruleset)"
lint_build "apps/extension/.output/firefox-mv3" "firefox zip"

step "7/9 reproducibility — chrome (rebuild, compare file hashes)"
verify_reproducible "build:chrome" "apps/extension/.output/chrome-mv3" "chrome"

step "8/9 reproducibility — firefox (rebuild, compare file hashes)"
verify_reproducible "build:firefox" "apps/extension/.output/firefox-mv3" "firefox"

# Manifest permissions and the justifications drafted in
# deployment-checklist.md must agree exactly. If they drift, the
# wrong copy ends up in the AMO/Chrome submission form's per-permission
# justification fields.
step "9/9 permission/justification drift"
manifest_perms=$(jq -r '(.permissions // []) + (.host_permissions // []) + (.optional_host_permissions // []) | .[]' \
  apps/extension/.output/firefox-mv3/manifest.json | sort)
checklist_perms=$(awk '
  /^## Permission justifications/ { in_section = 1; next }
  /^## / && in_section { in_section = 0 }
  in_section && /^- \*\*`/ {
    match($0, /`[^`]+`/)
    if (RSTART > 0) print substr($0, RSTART + 1, RLENGTH - 2)
  }
' deployment-checklist.md | sort)

if [ "$manifest_perms" != "$checklist_perms" ]; then
  printf "    manifest permissions:\n%s\n\n" "$manifest_perms" | sed 's/^/      /'
  printf "    deployment-checklist.md §Permission justifications:\n%s\n\n" "$checklist_perms" | sed 's/^/      /'
  printf "    diff (manifest < / checklist >):\n"
  diff <(echo "$manifest_perms") <(echo "$checklist_perms") || true
  fail "permissions in the manifest don't match the justifications in deployment-checklist.md"
fi
ok "manifest permissions match deployment-checklist.md §Permission justifications"

printf "\n\033[32m●\033[0m All automated checks passed.\n"
printf "  Next: manual smoke test per deployment-checklist.md §Pre-submission verification.\n"
