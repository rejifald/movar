#!/usr/bin/env bash
#
# Regression test for the Edge release poll-loop success gate (issue #113).
#
# This targets the GATE LOGIC of the "Submit to Edge Add-ons" step in
# .github/workflows/release.yml — NOT the live Edge Add-ons API. It replicates
# the exact poll-loop + explicit-success-flag shape from that step, driving it
# with a stubbed status source, and asserts:
#
#   1. all InProgress (exhaustion)  -> non-zero exit, publish NOT reached
#   2. Succeeded mid-loop           -> zero exit,    publish reached (ok=1)
#   3. Failed / other status        -> non-zero exit at the `*)` case
#
# The point: `set -euo pipefail` treats a normally-completing `for` loop as
# success, so the gate must track success explicitly or loop exhaustion falls
# through to the publish call. Keep this test green when editing that step.
#
# Run: bash scripts/edge-poll-gate.test.sh   (also `pnpm test:edge-poll`)
set -uo pipefail

# `run_gate <iterations> <status1> <status2> ...`
#   Mirrors the workflow loop: reads scripted statuses (one per iteration; the
#   last one repeats if the loop runs longer), tracks `ok`, hard-fails if the
#   loop exhausts without Succeeded, and only then "publishes". Echoes
#   `PUBLISHED` to stdout iff the publish call is reached. Exits non-zero on any
#   failure path, exactly like the real step under `pipefail`.
run_gate() {
  local iterations="$1"
  shift
  local -a statuses=("$@")
  (
    set -euo pipefail
    local ok=0
    local status=""
    local i
    for i in $(seq 1 "$iterations"); do
      # Pick the scripted status for this iteration; repeat the last entry once
      # exhausted (models "still InProgress" without listing 60 entries).
      local idx=$((i - 1))
      if [ "$idx" -lt "${#statuses[@]}" ]; then
        status="${statuses[$idx]}"
      else
        status="${statuses[$((${#statuses[@]} - 1))]}"
      fi
      case "$status" in
        InProgress) : ;; # would `sleep 10` in the workflow; no-op here
        Succeeded) ok=1; break ;;
        *) echo "::error::Edge package validation failed: $status" >&2; exit 1 ;;
      esac
    done
    [ "$ok" = "1" ] || { echo "::error::validation did not reach Succeeded ($i attempts) — last: $status" >&2; exit 1; }
    echo "PUBLISHED"
  )
}

fail=0
assert() {
  local label="$1" expected_exit="$2" expected_published="$3" actual_exit="$4" actual_out="$5"
  local published="no"
  [[ "$actual_out" == *PUBLISHED* ]] && published="yes"
  if [ "$actual_exit" != "$expected_exit" ] || [ "$published" != "$expected_published" ]; then
    printf '  ✗ %s — expected exit=%s published=%s, got exit=%s published=%s\n' \
      "$label" "$expected_exit" "$expected_published" "$actual_exit" "$published" >&2
    fail=1
  else
    printf '  ✓ %s (exit=%s, published=%s)\n' "$label" "$actual_exit" "$published"
  fi
}

echo "==> Edge poll-loop success-gate regression (issue #113)"

# 1. Exhaustion: 60 iterations, always InProgress → must fail, publish NOT reached.
out=$(run_gate 60 InProgress); rc=$?
assert "exhaustion (all InProgress) fails before publish" 1 no "$rc" "$out"

# 2. Success mid-loop: InProgress a few times, then Succeeded → exit 0, publish reached.
out=$(run_gate 60 InProgress InProgress Succeeded); rc=$?
assert "Succeeded mid-loop publishes" 0 yes "$rc" "$out"

# 3. Failure status: a non-InProgress/non-Succeeded status → fail at the `*)` case.
out=$(run_gate 60 InProgress Failed); rc=$?
assert "Failed status fails before publish" 1 no "$rc" "$out"

if [ "$fail" != 0 ]; then
  echo "✗ edge-poll-gate regression FAILED" >&2
  exit 1
fi
echo "✓ edge-poll-gate regression passed"
