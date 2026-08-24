#!/usr/bin/env bash
# State-aware rollback regression: real disposable symlink/revision state and
# mocked health/systemd only. It never invokes a real service.
set -euo pipefail

runbook="$(cd "$(dirname "$0")/.." && pwd)/scripts/vps_deploy_and_verify.sh"
first_command="$(grep -n '^mkdir -p ' "$runbook" | head -n1 | cut -d: -f1)"
source <(sed -n "1,$((first_command - 1))p" "$runbook")

fixture="$(mktemp -d)"
trap 'rm -rf "$fixture"' EXIT
BASE_DIR="$fixture"
CURRENT_SYMLINK="$fixture/current"
BASELINE_RELEASE_DIR="$fixture/baseline"
BASELINE_SHA='1111111111111111111111111111111111111111'
PUBLIC_DOMAIN='https://fixture.invalid'
SERVICE='fixture-service'
mkdir -p "$BASELINE_RELEASE_DIR" "$fixture/target"
printf '%s\n' "$BASELINE_SHA" > "$BASELINE_RELEASE_DIR/REVISION"
printf '%s\n' '2222222222222222222222222222222222222222' > "$fixture/target/REVISION"
ln -s "$fixture/target" "$CURRENT_SYMLINK"

sudo() { "$@"; }
systemctl() { return 0; }
sleep() { :; }
curl() {
  local revision
  revision="$(tr -d '\r\n' < "$CURRENT_SYMLINK/REVISION")"
  printf '{"status":"OK","database":"CONNECTED","revision":"%s"}' "$revision"
}
# State-changing fixture implementation; the production runbook retains its
# atomic ln+mv implementation, which is not portable to Git Bash on Windows.
atomic_symlink_switch() {
  rm -rf "$CURRENT_SYMLINK"
  ln -s "$1" "$CURRENT_SYMLINK"
}
canonical_path() {
  if [[ "$(tr -d '\r\n' < "$CURRENT_SYMLINK/REVISION")" = "$BASELINE_SHA" ]]; then
    printf '%s\n' "$BASELINE_RELEASE_DIR"
  else
    printf '%s\n' "$fixture/target"
  fi
}

SERVICE_STOPPED=1
RECOVERY_ARMED=1
if ! rollback_code_only >/dev/null; then
  echo 'expected stateful rollback success' >&2
  exit 1
fi
[[ "$(canonical_path "$CURRENT_SYMLINK")" = "$BASELINE_RELEASE_DIR" ]]

ln -snf "$fixture/target" "$CURRENT_SYMLINK"
atomic_symlink_switch() { return 1; }
SERVICE_STOPPED=1
RECOVERY_ARMED=1
if rollback_code_only >/dev/null 2>&1; then
  echo 'rollback falsely reported PASS after symlink failure' >&2
  exit 1
fi

atomic_symlink_switch() {
  rm -rf "$CURRENT_SYMLINK"
  ln -s "$1" "$CURRENT_SYMLINK"
}
rm -rf "$CURRENT_SYMLINK"
ln -s "$fixture/target" "$CURRENT_SYMLINK"
curl() { printf '{"status":"OK","database":"DISCONNECTED","revision":"%s"}' "$BASELINE_SHA"; }
SERVICE_STOPPED=1
RECOVERY_ARMED=1
if rollback_code_only >/dev/null 2>&1; then
  echo 'rollback falsely reported PASS after unhealthy baseline health' >&2
  exit 1
fi

echo 'VPS_RUNBOOK_STATEFUL_BASELINE_ROLLBACK=PASS'
