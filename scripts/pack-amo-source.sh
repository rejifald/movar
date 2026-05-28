#!/usr/bin/env bash
#
# Pack a Firefox AMO source bundle from the current commit.
#
# AMO requires a source archive that lets a reviewer reproduce the
# uploaded .xpi/.zip on a clean machine. This script:
#
#   1. Verifies the working tree is clean (so the archive matches the
#      commit that produced the AMO artifact).
#   2. Uses `git archive HEAD` to snapshot tracked files only — no
#      node_modules, no .output/, no .DS_Store, no untracked junk.
#   3. Verifies the archive contains the files an AMO reviewer needs:
#      SOURCE.md at the root, the lockfile, the workspace config, and
#      the extension package itself.
#   4. Verifies the archive is under the AMO 200 MB ceiling.
#
# Output:
#   apps/extension/.output/movarextension-<version>-amo-source.zip
#
# Run from the repo root or via `pnpm pack:amo-source`.
#
# Exit codes:
#   0 — archive produced and verified
#   1 — precondition failed (dirty tree, missing tool, …)
#   2 — archive failed verification (missing file, too large, …)
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
  exit "${2:-1}"
}

# 1. Preconditions ------------------------------------------------------

step "1/5 preconditions"

command -v git >/dev/null || fail "git not found on PATH"
command -v unzip >/dev/null || fail "unzip not found on PATH (needed for verification)"

if [ -n "$(git status --porcelain)" ]; then
  git status --short
  fail "working tree has uncommitted changes — commit or stash first so the archive matches the built artifact"
fi
ok "working tree clean"

head_sha=$(git rev-parse --short HEAD)
ok "snapshotting commit $head_sha"

# 2. Version stamp ------------------------------------------------------

step "2/5 read extension version"

# Read the version straight out of apps/extension/package.json without
# pulling in jq (one fewer install instruction for AMO reviewers if they
# ever want to re-run this script).
version=$(node -p "require('./apps/extension/package.json').version")
[ -n "$version" ] || fail "could not read version from apps/extension/package.json"
ok "extension version $version"

# 3. Produce the archive ------------------------------------------------

step "3/5 git archive HEAD"

out_dir="apps/extension/.output"
out_name="movarextension-${version}-amo-source.zip"
out_path="${out_dir}/${out_name}"

mkdir -p "$out_dir"
rm -f "$out_path"

# `git archive` only includes tracked files at HEAD — no node_modules,
# no build outputs, no .DS_Store. Deterministic given the commit.
git archive --format=zip --output="$out_path" HEAD
ok "wrote $out_path"

# 4. Verify the archive -------------------------------------------------

step "4/5 verify archive contents"

# `unzip -Z1` prints only the filenames inside the archive, one per
# line — no header (which would otherwise contain the archive's own
# path, triggering false positives on patterns like `\.output/`).
contents=$(unzip -Z1 "$out_path")

# Hard requirements — things a reviewer literally cannot build without.
require() {
  local pattern="$1"
  local label="$2"
  if ! echo "$contents" | grep -qE "$pattern"; then
    fail "archive is missing $label (pattern: $pattern)" 2
  fi
  ok "contains $label"
}

require '(^| )SOURCE\.md$'                'SOURCE.md (reviewer README)'
require '(^| )package\.json$'             'root package.json'
require '(^| )pnpm-lock\.yaml$'           'pnpm-lock.yaml (build determinism)'
require '(^| )pnpm-workspace\.yaml$'      'pnpm-workspace.yaml'
require 'apps/extension/package\.json'    'apps/extension/package.json'
require 'apps/extension/wxt\.config\.ts'  'apps/extension/wxt.config.ts (manifest source)'

# Every workspace package declared at HEAD must show up in the archive —
# otherwise `pnpm install` will fail with "workspace package not found".
# Derived from HEAD rather than hardcoded so the script keeps working as
# packages are added or removed.
while IFS= read -r pkg_json; do
  [ -z "$pkg_json" ] && continue
  require "(^| )${pkg_json}$" "workspace package: $pkg_json"
done < <(git ls-files 'packages/*/package.json' 'tooling/*/package.json' 'apps/*/package.json')

# Forbid anything that would either bloat the archive or expose junk.
# `git archive HEAD` cannot include any of these — checking is defensive
# against future weirdness (export-subst attributes, custom drivers, etc).
forbid() {
  local pattern="$1"
  local label="$2"
  if echo "$contents" | grep -qE "$pattern"; then
    fail "archive contains $label (pattern: $pattern) — this should be impossible from git archive HEAD" 2
  fi
}

forbid 'node_modules/' 'node_modules/'
forbid '\.output/'     'build output (.output/)'
forbid '\.DS_Store'    '.DS_Store'
forbid '\.env(\.|$)'   '.env file'

ok "no node_modules, no build output, no editor junk"

# 5. Size check ---------------------------------------------------------

step "5/5 enforce AMO 200 MB ceiling"

# AMO's documented hard limit is 200 MB. We warn at 100 MB so a future
# accidental commit of a large binary trips this before AMO rejects the
# upload.
size_bytes=$(wc -c < "$out_path" | tr -d ' ')
size_mb=$(( size_bytes / 1024 / 1024 ))
size_human=$(du -h "$out_path" | cut -f1)

if [ "$size_bytes" -ge $((200 * 1024 * 1024)) ]; then
  fail "archive is ${size_human} — over AMO's 200 MB limit" 2
fi
if [ "$size_mb" -ge 100 ]; then
  printf "    \033[33m!\033[0m archive is ${size_human} — under the 200 MB limit but unusually large; check for accidentally tracked binaries\n"
else
  ok "archive is ${size_human} (well under 200 MB)"
fi

# Summary ---------------------------------------------------------------

printf "\n\033[32m●\033[0m AMO source bundle ready.\n"
printf "  File:   %s\n" "$out_path"
printf "  Commit: %s\n" "$head_sha"
printf "  Size:   %s\n" "$size_human"
printf "  Upload at: https://addons.mozilla.org/developers/addon/movar/versions/submit/\n"
