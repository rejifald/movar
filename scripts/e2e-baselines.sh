#!/usr/bin/env bash
#
# Regenerate the e2e visual baselines (`*-linux.png`) inside the pinned
# Playwright container, so the committed PNGs are byte-identical to what
# CI's `e2e-offline` job compares against — it runs in the SAME image.
#
# Why Docker: Playwright screenshots are platform-specific. Chromium's text
# anti-aliasing differs across OSes (and across font stacks on the same OS),
# so a baseline generated on a contributor's macOS/Windows host bakes that
# host's rendering into the PNG and fails on CI's Linux. The repo commits a
# single Linux baseline set; running the update inside
# `mcr.microsoft.com/playwright:<ver>` pins the OS + fonts + Chromium build
# to exactly CI's, so "green locally" means "green on CI".
#
# Usage:
#   pnpm e2e:baselines                    # regenerate every offline baseline
#   pnpm e2e:baselines -- --grep popup    # scope to one surface / spec
#   pnpm e2e:baselines:marketing          # regenerate the marketing-site set
#
# Both entry points run this same script inside the same pinned image; the
# `:marketing` one sets `E2E_BASELINE_TARGET` to the marketing config's Nx
# update target (which serves the built Astro site via `astro preview`). Each
# target's `dependsOn` builds what the suite needs first — extension + host-app
# + diagnostics harness for the offline suite, the marketing site for marketing.
#
# Requires Docker. This is the only supported way to refresh baselines —
# there is no CI job that does it for you. Do NOT run
# `pnpm --filter @movar/e2e test:update` directly on your host: it writes a
# baseline stamped with your OS's rendering, which CI does not use.
set -euo pipefail

# Keep in lockstep with `@playwright/test` in pnpm-lock.yaml AND the
# `container:` image in .github/workflows/ci.yml — all three must name the
# same Playwright release or local baselines drift from what CI compares
# against. (Hardening TODO: pin by @sha256 digest to match the repo's
# SHA-pinned `uses:` policy; a floating tag can be re-published.)
readonly PW_IMAGE="mcr.microsoft.com/playwright:v1.60.0-noble"

# CI's `e2e-offline` job runs on `ubuntu-latest` — linux/amd64. Chromium's
# text anti-aliasing differs by CPU architecture, so baselines MUST be
# generated for amd64 or they diverge from what CI compares against. Pin the
# platform explicitly: `mcr.microsoft.com/playwright` is a multi-arch image,
# so on an Apple Silicon (arm64) host Docker would otherwise run the arm64
# variant NATIVELY and silently write arm64 baselines that fail CI across the
# board. `linux/amd64` runs emulated there (needs Docker's Rosetta/qemu) but
# matches CI byte-for-byte. On a native-amd64 host it's a no-op.
readonly PW_PLATFORM="linux/amd64"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly REPO_ROOT

# Which Nx `*:update` target runs inside the container. Defaults to the offline
# suite; `pnpm e2e:baselines:marketing` sets E2E_BASELINE_TARGET to the marketing
# config's update target (which builds the site + serves it via `astro preview`).
readonly NX_TARGET="${E2E_BASELINE_TARGET:-e2e:test:update}"

if ! command -v docker >/dev/null 2>&1; then
  echo "error: docker is required to regenerate baselines deterministically." >&2
  echo "       install Docker Desktop (or a compatible engine) and retry." >&2
  exit 1
fi

echo "==> Regenerating Linux visual baselines in ${PW_IMAGE}"
echo "    nx target: ${NX_TARGET}"
echo "    forwarding to playwright: ${*:-<all baselines>}"

# A named volume persists the pnpm store across runs so a re-regen is fast.
# The repo is bind-mounted read-write so the freshly written `*-linux.png`
# files land straight back in the work tree. The Chromium build is baked
# into the pinned image — the same one CI's e2e-offline job runs — so there
# is no `playwright install` step and local output cannot diverge from CI's.
# `pnpm install` inside the container writes Linux-native binaries into the
# bind-mounted node_modules; we restore the host's afterward. The
# e2e:test:update Nx target carries `--update-snapshots=all`, which rewrites
# every baseline (including sub-tolerance diffs a bare `--update-snapshots`
# would skip).
docker run --rm \
  --platform "${PW_PLATFORM}" \
  -v "${REPO_ROOT}:/work" \
  -v movar-pnpm-store:/pnpm-store \
  -w /work \
  -e CI=1 \
  -e NX_DAEMON=false \
  -e COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
  "${PW_IMAGE}" \
  bash -euo pipefail -c '
    target="$1"; shift
    corepack enable
    pnpm install --frozen-lockfile --store-dir /pnpm-store
    xvfb-run -a pnpm nx run "$target" -- "$@"
  ' movar-e2e-baselines "${NX_TARGET}" "$@"

# The container left amd64-Linux node_modules in the bind-mounted tree.
# Restore this host's native binaries so a later `pnpm test`/build here
# doesn't choke on foreign artifacts. `CI=1` auto-confirms pnpm's
# modules-dir purge — required when the host arch differs from the
# container's (e.g. an Apple Silicon host, where pnpm must replace the amd64
# binaries and would otherwise block on a no-TTY confirmation prompt). On a
# native-amd64 Linux host this is a cheap no-op.
echo "==> Restoring host node_modules (native binaries)"
if ! (cd "${REPO_ROOT}" && CI=1 pnpm install --frozen-lockfile); then
  echo "warning: could not restore host node_modules automatically." >&2
  echo "         run 'pnpm install' yourself. On a native-Linux host the" >&2
  echo "         container writes root-owned files; if so, first run:" >&2
  echo "         sudo chown -R \"\$(id -u):\$(id -g)\" node_modules" >&2
fi

echo "==> Done. Review the regenerated baselines:"
echo "    git status --short 'apps/e2e/src/**/*.visual.spec.ts-snapshots/'"
