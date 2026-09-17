#!/usr/bin/env bash
# Quick CI / local smoke suite against a running API.
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
K6="$(command -v k6 || true)"
if [[ -z "${K6}" && -x "$ROOT/tmp/k6" ]]; then
  K6="$ROOT/tmp/k6"
fi
if [[ -z "${K6}" ]]; then
  echo "k6 not found. Install via brew, or run: curl script in k6/README.md"
  exit 1
fi

BASE_URL="${BASE_URL:-http://127.0.0.1:4020}"
PROFILE="${PROFILE:-ci}"
export BASE_URL PROFILE

echo "Using $K6  BASE_URL=$BASE_URL  PROFILE=$PROFILE"
failed=0

run_one() {
  local name="$1"
  echo ""
  echo "======== $name ========"
  if ! "$K6" run "k6/${name}.js"; then
    echo "FAILED: $name"
    failed=1
  fi
}

run_one health
run_one public-reads
run_one rate-limit
run_one login
run_one mixed

if [[ "$failed" -ne 0 ]]; then
  echo ""
  echo "Some scenarios failed thresholds (see above)."
  exit 1
fi
echo ""
echo "All scenarios passed."
