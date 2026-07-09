#!/usr/bin/env bash
#
# prepare-safari-build.sh — build + sync the gitignored Xcode resources, then
# (optionally) archive + export the macOS + iOS apps for a manual App Store
# submission, with the correct version baked in.
#
# Movar.xcodeproj references two gitignored resource trees that are EMPTY on a
# fresh checkout, so Xcode can't archive until they're built and synced:
#   • Safari web-extension output → apps/extension/safari/Movar/Shared (Extension)/Resources/
#   • host-app bundle             → apps/extension/safari/Movar/Shared (App)/Resources/
#
# WHY THE VERSION MUST BE PASSED: the release bumps apps/extension/package.json
# (the web-ext manifest), but the native app's MARKETING_VERSION /
# CURRENT_PROJECT_VERSION are NOT committed-bumped — CI injects them at archive
# time from package.json. A plain Xcode archive would therefore ship the stale
# committed values (1.2.0 / build 1). This script injects them the same way CI
# does, reading the version from package.json.
#
# Usage:
#   ./scripts/prepare-safari-build.sh                 # prep only → archive in Xcode.app yourself
#   APPLE_TEAM_ID=XXXXXXXXXX ./scripts/prepare-safari-build.sh   # prep + CLI archive + export
#   ./scripts/prepare-safari-build.sh XXXXXXXXXX      # same, team id as arg
#
# Env overrides: BUILD_NUMBER (default: current epoch), OUT (default: ~/Desktop/Movar-Safari-<version>)
#
# Signing uses your Apple ID in Xcode ▸ Settings ▸ Accounts (via
# -allowProvisioningUpdates) — NOT the App Store Connect API key that the CI
# release-safari job uses (that key 401'd; this path sidesteps it entirely).
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")/.." && pwd)"
cd "$repo_root"
proj="apps/extension/safari/Movar"
TEAM="${APPLE_TEAM_ID:-${1:-}}"
echo "▸ repo: $repo_root"

# ── Node 22 (repo .nvmrc) ────────────────────────────────────────────────────
if [ -s "${NVM_DIR:-$HOME/.nvm}/nvm.sh" ]; then
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  # shellcheck disable=SC1091
  . "$NVM_DIR/nvm.sh"
  nvm use >/dev/null 2>&1 || nvm install
fi
echo "▸ node $(node -v)  ($(command -v node))"
[ "$(node -p 'process.versions.node.split(".")[0]')" = "22" ] \
  || echo "  ⚠ expected Node 22 (.nvmrc) — continuing with $(node -v)"

# ── pnpm via corepack ────────────────────────────────────────────────────────
corepack enable >/dev/null 2>&1 || true

# ── 1 · dependencies ─────────────────────────────────────────────────────────
echo "▸ [1/3] pnpm install…"
pnpm install --frozen-lockfile

# ── 2 · Safari web extension → Shared (Extension)/Resources ──────────────────
echo "▸ [2/3] build + sync the Safari web extension…"
pnpm --filter @movar/extension build:safari

# ── 3 · host app → Shared (App)/Resources ────────────────────────────────────
echo "▸ [3/3] build + sync the host app…"
pnpm --filter @movar/safari-host-app build

# ── sanity: the Xcode-referenced resources now exist ─────────────────────────
app_res="$proj/Shared (App)/Resources"
ext_res="$proj/Shared (Extension)/Resources"
fail=0
if [ -f "$app_res/host-app.js" ] && [ -f "$app_res/host-app.css" ]; then
  echo "  ✓ host app  → $app_res"
else
  echo "  ✗ MISSING host-app.js/css under $app_res"; fail=1
fi
if [ -d "$ext_res" ] && [ -n "$(ls -A "$ext_res" 2>/dev/null)" ]; then
  echo "  ✓ extension → $ext_res ($(find "$ext_res" -type f | wc -l | tr -d ' ') files)"
else
  echo "  ✗ MISSING/empty $ext_res"; fail=1
fi
[ "$fail" = 0 ] || { echo "✗ resource sync incomplete — see errors above"; exit 1; }

# Version to stamp (single source of truth = package.json, exactly like CI).
VERSION="$(node -p "require('./apps/extension/package.json').version")"
# CFBundleVersion must exceed the last build uploaded for this VERSION. Epoch is
# monotonic and comfortably larger than any prior github.run_number build#.
BUILD_NUMBER="${BUILD_NUMBER:-$(date +%s)}"

# ── No team id → stop after prep; you archive in Xcode.app yourself ──────────
if [ -z "$TEAM" ]; then
  cat <<EOF

✅ Resources synced. Version to stamp: ${VERSION} (build ${BUILD_NUMBER}).

No APPLE_TEAM_ID given, so archive in Xcode.app (uses your Apple ID signing):

  open "$proj/Movar.xcodeproj"

  For BOTH "Movar (iOS)" and "Movar (macOS)":
    • Target ▸ General ▸ Identity → set Version ${VERSION}, Build ${BUILD_NUMBER}
      (the committed values are the stale 1.2.0 / 1 — you MUST change them)
    • Destination → "Any iOS Device (arm64)" / "Any Mac"
    • Product ▸ Archive → Organizer ▸ Distribute App ▸ App Store Connect ▸ Upload

Or re-run with your Team ID to archive + export from the CLI:
  APPLE_TEAM_ID=XXXXXXXXXX $0
EOF
  exit 0
fi

# ── CLI archive + export (version baked in) ──────────────────────────────────
PROJECT="$proj/Movar.xcodeproj"
OUT="${OUT:-$HOME/Desktop/Movar-Safari-$VERSION}"
mkdir -p "$OUT"
echo
echo "▸ archiving Movar ${VERSION} (build ${BUILD_NUMBER}), team ${TEAM}"
echo "  output → $OUT"
[ ${#TEAM} -eq 10 ] || echo "  ⚠ Team ID is usually 10 chars — got '${TEAM}'"
echo "  signing: automatic via your Apple ID in Xcode ▸ Settings ▸ Accounts"

# Local signing: let Xcode resolve/create distribution profiles from the account
# logged into Xcode. No -authenticationKey* (that's the CI App Store Connect key).
AUTH=( -allowProvisioningUpdates )
VERS=( MARKETING_VERSION="$VERSION" CURRENT_PROJECT_VERSION="$BUILD_NUMBER" DEVELOPMENT_TEAM="$TEAM" )

# archive (fatal — nothing downstream works without it)
for pf in "iOS:generic/platform=iOS" "macOS:generic/platform=macOS"; do
  tag="${pf%%:*}"; dest="${pf#*:}"
  echo "▸ archive Movar (${tag})…"
  xcodebuild -project "$PROJECT" -scheme "Movar (${tag})" -configuration Release \
    -destination "$dest" -archivePath "$OUT/Movar-${tag}.xcarchive" \
    "${VERS[@]}" "${AUTH[@]}" archive
done

# App Store export → .ipa / .pkg for Transporter. Best-effort: if export-time
# signing needs interactive resolution, the .xcarchive still uploads via Organizer.
export_ok=1
for tag in iOS macOS; do
  echo "▸ export App Store package (${tag})…"
  if xcodebuild -exportArchive -archivePath "$OUT/Movar-${tag}.xcarchive" \
       -exportPath "$OUT/appstore-${tag}" \
       -exportOptionsPlist apps/extension/safari/exportOptions/app-store.plist "${AUTH[@]}"; then
    echo "  ✓ $OUT/appstore-${tag}"
  else
    echo "  ⚠ export failed for ${tag} — use the Organizer fallback below"; export_ok=0
  fi
done

cat <<EOF

✅ Archived Movar ${VERSION} (build ${BUILD_NUMBER}) → $OUT

Upload to App Store Connect (your Apple ID — the CI 401 does not apply):

  A) Transporter.app — drag the exported package(s):
       $OUT/appstore-ios/*.ipa
       $OUT/appstore-mac/*.pkg
  B) Xcode Organizer — open an archive, then Distribute App ▸ App Store Connect:
       open "$OUT/Movar-iOS.xcarchive"
       open "$OUT/Movar-macOS.xcarchive"
EOF
[ "$export_ok" = 1 ] || echo "(export didn't produce packages — use option B)"
echo "$OUT is throwaway build output; delete it when done."
