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

# Pre-stop helper binding: use a real manifest and a stat/node shim so the
# disposable fixture works on non-root developer hosts. Production requires
# actual root ownership and modes.
ops="$fixture/ops/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
mkdir -p "$ops/node_modules/sqlite3"
mkdir -p "$ops/node_modules/sqlite3/build/Release"
mkdir -p "$ops/server/database"
printf 'helper\n' > "$ops/vps_backup_rehearsal.cjs"
printf 'migrations\n' > "$ops/server/database/migrations.js"
printf 'native-binding\n' > "$ops/node_modules/sqlite3/build/Release/node_sqlite3.node"
printf '{"name":"server"}\n' > "$ops/server/package.json"
printf 'deploy\n' > "$ops/vps_deploy_and_verify.sh"
printf '%s\n' 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' > "$ops/RUNBOOK_GIT_SHA"
chmod 555 "$ops/vps_backup_rehearsal.cjs"
(cd "$ops" && { printf '# RUNBOOK_GIT_SHA=%s\n' 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'; sha256sum vps_backup_rehearsal.cjs vps_deploy_and_verify.sh server/package.json server/database/migrations.js RUNBOOK_GIT_SHA node_modules/sqlite3/build/Release/node_sqlite3.node; } > ops-manifest.sha256)
chmod 444 "$ops/ops-manifest.sha256" "$ops/RUNBOOK_GIT_SHA"
OPS_ROOT="$fixture/ops"
RUNBOOK_DIR="$ops"
EXTERNAL_HELPER="$ops/vps_backup_rehearsal.cjs"
EXTERNAL_MIGRATIONS="$ops/server/database/migrations.js"
RUNBOOK_MANIFEST="$ops/ops-manifest.sha256"
RUNBOOK_ID_FILE="$ops/RUNBOOK_GIT_SHA"
WORKTREE_REPO="$fixture/repo"
RELEASES_DIR="$fixture/releases"
CURRENT_SYMLINK="$fixture/current"
mkdir -p "$WORKTREE_REPO" "$RELEASES_DIR"
SERVICE_STOPPED=0
RECOVERY_ARMED=0
canonical_path() { printf '%s\n' "$1"; }
stat() {
  if [[ "$1" = '-c' && "$2" = '%U:%a' ]]; then
    case "$3" in
      "$ops") printf 'root:755\n';;
      "$ops/vps_backup_rehearsal.cjs") printf 'root:555\n';;
      "$ops/ops-manifest.sha256"|"$ops/RUNBOOK_GIT_SHA") printf 'root:444\n';;
      *) command stat "$@";;
    esac
  else command stat "$@"; fi
}
node() {
  if [[ "${1:-}" = '-p' ]]; then printf '22\n'; fi
  return 0
}
validate_external_helper
rm -f "$ops/vps_backup_rehearsal.cjs"
if (validate_external_helper) >/dev/null 2>&1; then
  echo 'helper-missing falsely passed pre-stop validation' >&2
  exit 1
fi
printf 'tampered-helper\n' > "$ops/vps_backup_rehearsal.cjs"; chmod 555 "$ops/vps_backup_rehearsal.cjs"
if (validate_external_helper) >/dev/null 2>&1; then
  echo 'checksum-mismatch falsely passed pre-stop validation' >&2
  exit 1
fi
chmod u+w "$ops/vps_backup_rehearsal.cjs"
printf 'helper\n' > "$ops/vps_backup_rehearsal.cjs"; chmod 555 "$ops/vps_backup_rehearsal.cjs"
chmod u+w "$ops/ops-manifest.sha256"
(cd "$ops" && { printf '# RUNBOOK_GIT_SHA=%s\n' 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'; sha256sum vps_backup_rehearsal.cjs vps_deploy_and_verify.sh server/package.json server/database/migrations.js RUNBOOK_GIT_SHA node_modules/sqlite3/build/Release/node_sqlite3.node; } > ops-manifest.sha256)
chmod 444 "$ops/ops-manifest.sha256"
chmod 444 "$ops/vps_backup_rehearsal.cjs"
if (validate_external_helper) >/dev/null 2>&1; then
  echo 'non-executable helper falsely passed pre-stop validation' >&2
  exit 1
fi
chmod 555 "$ops/vps_backup_rehearsal.cjs"
node() { return 1; }
if (validate_external_helper) >/dev/null 2>&1; then
  echo 'missing dependency falsely passed pre-stop validation' >&2
  exit 1
fi
node() { return 0; }
RUNBOOK_DIR="$WORKTREE_REPO"
if (validate_external_helper) >/dev/null 2>&1; then
  echo 'repository helper path falsely passed pre-stop validation' >&2
  exit 1
fi

# A malformed helper is rejected before stop; a runtime helper failure after
# stop propagates to the normal rollback path rather than being masked.
RUNBOOK_DIR="$ops"
node() { [[ "${1:-}" = '--check' ]] && return 1; [[ "${1:-}" = '-p' ]] && printf '22\n'; return 0; }
if (validate_external_helper) >/dev/null 2>&1; then
  echo 'helper syntax failure falsely passed pre-stop validation' >&2
  exit 1
fi
node() { return 1; }
backup_dir="$fixture/after-stop-helper-failure"
SERVICE_DB_PATH="$fixture/unused.db"
if run_external_rehearsal >/dev/null 2>&1; then
  echo 'helper runtime failure falsely passed after stop' >&2
  exit 1
fi
node() {
  if [[ "${1:-}" = '-p' ]]; then printf '22\n'; fi
  return 0
}

echo 'VPS_RUNBOOK_EXTERNAL_HELPER_PRESTOP_GATES=PASS'
