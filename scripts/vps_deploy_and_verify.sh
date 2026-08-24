#!/bin/bash
# Immutable release runbook. Cutover requires canonical SQLite snapshot,
# copied-artifact rehearsal, and runtime-contract checks.
set -Eeuo pipefail

TARGET_BRANCH="main"
PUBLIC_DOMAIN="https://omniseller.theglobalserviceteam.site"
BASE_DIR="/home/etsy"
WORKTREE_REPO="${BASE_DIR}/omniseller"
RELEASES_DIR="${BASE_DIR}/omniseller-releases"
CURRENT_SYMLINK="${BASE_DIR}/omniseller-current"
STATE_DIR="${BASE_DIR}/omniseller-state"
BACKUP_DIR="${STATE_DIR}/backups"
OPS_ROOT="${BASE_DIR}/omniseller-ops"
RUNBOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
EXTERNAL_HELPER="${RUNBOOK_DIR}/vps_backup_rehearsal.cjs"
EXTERNAL_MIGRATIONS="${RUNBOOK_DIR}/server/database/migrations.js"
RUNBOOK_MANIFEST="${RUNBOOK_DIR}/ops-manifest.sha256"
RUNBOOK_ID_FILE="${RUNBOOK_DIR}/RUNBOOK_GIT_SHA"
SERVICE="omniseller-web"
TARGET_SHA="${1:-}"
BASELINE_SHA=""
BASELINE_RELEASE_DIR=""
TARGET_RELEASE_DIR=""
SERVICE_DB_PATH=""
SERVICE_IMPORTS_DIR=""
SERVICE_DOTENV_PATH=""
DATABASE_MIGRATION_STATUS="NOT_CHECKED"
COMPATIBILITY_STATUS="NOT_CHECKED"
SERVICE_STOPPED=0
RECOVERY_ARMED=0

die() {
  echo "ERROR: $*" >&2
  if [[ "${RECOVERY_ARMED:-0}" = 1 ]] && { [[ "${SERVICE_STOPPED:-0}" = 1 ]] || ! sudo systemctl is-active --quiet "$SERVICE"; }; then
    if ! rollback_code_only; then
      echo "CRITICAL: rollback failed; manual intervention required." >&2
      exit 2
    fi
  fi
  exit 1
}
absolute_external_path() {
  local value="$1" label="$2"
  [[ "$value" = /* ]] || die "${label} must be absolute"
  case "$value" in "$WORKTREE_REPO"/*|"$RELEASES_DIR"/*) die "${label} must be outside repository/releases";; esac
}
validate_external_helper() {
  local declared_sha actual_dir
  actual_dir="$(canonical_path "$RUNBOOK_DIR")"
  [[ "$actual_dir" = "$OPS_ROOT"/* ]] || die "runbook must execute from root-owned OPS_ROOT"
  absolute_external_path "$actual_dir" RUNBOOK_DIR
  [[ -f "$EXTERNAL_HELPER" && -r "$EXTERNAL_HELPER" && -x "$EXTERNAL_HELPER" ]] || die "external helper missing or not readable/executable"
  [[ -f "$EXTERNAL_MIGRATIONS" && -r "$EXTERNAL_MIGRATIONS" ]] || die "external migrations module missing or unreadable"
  [[ -f "$RUNBOOK_MANIFEST" && -r "$RUNBOOK_MANIFEST" ]] || die "external helper manifest missing or unreadable"
  [[ -f "$RUNBOOK_ID_FILE" && -r "$RUNBOOK_ID_FILE" ]] || die "runbook identity file missing or unreadable"
  declared_sha="$(tr -d '\r\n' < "$RUNBOOK_ID_FILE")"
  [[ "$declared_sha" =~ ^[0-9a-f]{40}$ ]] || die "runbook identity is not a full SHA"
  [[ "$(stat -c '%U:%a' "$actual_dir")" = "root:755" ]] || die "OPS_ROOT runbook directory must be root-owned mode 0755"
  [[ "$(stat -c '%U:%a' "$EXTERNAL_HELPER")" = "root:555" ]] || die "external helper must be root-owned mode 0555"
  [[ "$(stat -c '%U:%a' "$RUNBOOK_MANIFEST")" = "root:444" ]] || die "external manifest must be root-owned mode 0444"
  [[ "$(stat -c '%U:%a' "$RUNBOOK_ID_FILE")" = "root:444" ]] || die "runbook identity file must be root-owned mode 0444"
  (cd "$actual_dir" && sha256sum -c "$(basename "$RUNBOOK_MANIFEST")") || die "external helper manifest checksum failed"
  grep -Fqx "# RUNBOOK_GIT_SHA=${declared_sha}" "$RUNBOOK_MANIFEST" || die "manifest is not bound to runbook identity"
  export PATH="/home/etsy/.nvm/versions/node/v22.23.2/bin:$PATH"
  [[ "$(node -p "process.versions.node.split('.')[0]")" = 22 ]] || die "Node 22 required for external helper"
  NODE_PATH="${actual_dir}/node_modules" node --check "$EXTERNAL_HELPER" >/dev/null || die "external helper syntax check failed"
  NODE_PATH="${actual_dir}/node_modules" node --check "$EXTERNAL_MIGRATIONS" >/dev/null || die "external migrations syntax check failed"
  NODE_PATH="${actual_dir}/node_modules" node -e "require.resolve('sqlite3')" >/dev/null || die "external helper sqlite3 dependency unavailable"
  NODE_PATH="${actual_dir}/node_modules" node -e "require('sqlite3')" >/dev/null || die "external helper sqlite3 native binding unavailable"
}
run_external_rehearsal() {
  NODE_PATH="${RUNBOOK_DIR}/node_modules" MIGRATIONS_MODULE="$EXTERNAL_MIGRATIONS" node "$EXTERNAL_HELPER" \
    "$SERVICE_DB_PATH" "$backup_dir/app.db" "$backup_dir/rehearsal.db" "$backup_dir/rehearsal-report.json"
}
verify_migration_compatibility_evidence() {
  local evidence runbook_sha db_path_sha
  evidence="${MIGRATION_COMPATIBILITY_EVIDENCE:-}"
  [[ -n "$evidence" && "$evidence" = /* && "$evidence" = "$STATE_DIR"/* ]] || die "root-owned migration compatibility evidence under STATE_DIR is required"
  absolute_external_path "$evidence" MIGRATION_COMPATIBILITY_EVIDENCE
  [[ -f "$evidence" && -r "$evidence" ]] || die "migration compatibility evidence missing or unreadable"
  [[ "$(stat -c '%U:%a' "$evidence")" = "root:444" ]] || die "migration compatibility evidence must be root-owned mode 0444"
  runbook_sha="$(tr -d '\r\n' < "$RUNBOOK_ID_FILE")"
  db_path_sha="$(printf %s "$SERVICE_DB_PATH" | sha256sum | awk '{print $1}')"
  BASELINE_SHA="$BASELINE_SHA" TARGET_SHA="$TARGET_SHA" RUNBOOK_SHA="$runbook_sha" DB_PATH_SHA="$db_path_sha" EVIDENCE="$evidence" node -e '
    const fs=require("fs"); const r=JSON.parse(fs.readFileSync(process.env.EVIDENCE,"utf8"));
    const required=[
      r.result==="PASS", r.sourceReadOnly===true,
      r.targetMigrationStatus==="NO_SCHEMA_OR_MIGRATION_CHANGE",
      r.authorityDigestMatch===true, r.schemaDigestMatch===true,
      r.baselineSchemaCompatibility==="PASS", r.disposableCleanup===true,
      r.migration007==="PRESENT", r.migration008==="PRESENT",
      r.productTruthCardColumn==="PRESENT", r.sourceIntegrity==="ok",
      r.baselineSha===process.env.BASELINE_SHA, r.targetSha===process.env.TARGET_SHA,
      r.runbookSha===process.env.RUNBOOK_SHA, r.sourceDbPathSha256===process.env.DB_PATH_SHA
    ]; if (!required.every(Boolean)) process.exit(1);' || die "migration compatibility evidence does not bind this baseline/target/runbook/runtime DB"
  NODE_PATH="${RUNBOOK_DIR}/node_modules" DB="$SERVICE_DB_PATH" node -e '
    const s=require("sqlite3").verbose(); const d=new s.Database(process.env.DB,s.OPEN_READONLY,e=>{if(e)throw e;
      d.get("PRAGMA integrity_check",(e,i)=>{if(e||!i||i.integrity_check!=="ok")process.exit(1);
        d.all("SELECT id FROM schema_migrations WHERE id IN (?,?) ORDER BY id",["007_listing_product_truth_attestation","008_listing_product_truth_card"],(e,rows)=>{if(e||rows.length!==2)process.exit(1);
          d.all("PRAGMA table_info(listings)",(e,cols)=>{if(e||!cols.some(c=>c.name==="product_truth_card"))process.exit(1);d.close(e=>process.exit(e?1:0));});});});});' || die "live migration/schema recheck failed"
}
service_env_value() {
  local pid="$1" key="$2"
  tr '\0' '\n' < "/proc/${pid}/environ" | sed -n "s/^${key}=//p" | head -n1
}
credential_fingerprint() {
  local comparison_key="$1" credential="$2"
  HMAC_COMPARISON_KEY="$comparison_key" MCP_CREDENTIAL="$credential" node -e \
    "const c=require('crypto');process.stdout.write(c.createHmac('sha256',process.env.HMAC_COMPARISON_KEY).update(process.env.MCP_CREDENTIAL).digest('hex'))"
}
runtime_contract() {
  local destination="$1" pid db imports dotenv ytrends ytuong master ytrends_fingerprint ytuong_fingerprint
  pid="$(systemctl show -p MainPID --value "$SERVICE")"
  [[ "$pid" =~ ^[1-9][0-9]*$ ]] || die "service has no running MainPID"
  db="$(service_env_value "$pid" OMNI_DB_PATH)"
  imports="$(service_env_value "$pid" OMNI_IMPORTS_DIR)"
  dotenv="$(service_env_value "$pid" DOTENV_PATH)"
  [[ -n "$db" && -n "$imports" && -n "$dotenv" ]] || die "service runtime paths missing"
  absolute_external_path "$db" OMNI_DB_PATH
  absolute_external_path "$imports" OMNI_IMPORTS_DIR
  absolute_external_path "$dotenv" DOTENV_PATH
  [[ -f "$db" && -d "$imports" && -f "$dotenv" ]] || die "service runtime state unavailable"
  SERVICE_DB_PATH="$db"; SERVICE_IMPORTS_DIR="$imports"; SERVICE_DOTENV_PATH="$dotenv"
  ytrends="$(service_env_value "$pid" YTRENDS_API_TOKEN)"
  ytuong="$(service_env_value "$pid" YTUONG_API_TOKEN)"
  master="$(service_env_value "$pid" OMNI_MASTER_KEY)"
  [[ -n "$master" ]] || die "OMNI_MASTER_KEY missing; cannot attest MCP credential identity"
  ytrends_fingerprint="$(credential_fingerprint "$master" "$ytrends")"
  ytuong_fingerprint="$(credential_fingerprint "$master" "$ytuong")"
  umask 077
  {
    printf 'OMNI_DB_PATH_SHA256=%s\n' "$(printf %s "$db" | sha256sum | awk '{print $1}')"
    printf 'OMNI_IMPORTS_DIR_SHA256=%s\n' "$(printf %s "$imports" | sha256sum | awk '{print $1}')"
    printf 'DOTENV_PATH_SHA256=%s\n' "$(printf %s "$dotenv" | sha256sum | awk '{print $1}')"
    printf 'MCP_CREDENTIAL_FINGERPRINT=HMAC-SHA256(OMNI_MASTER_KEY)\n'
    printf 'YTRENDS_API_TOKEN=%s\n' "$( [[ -n "$ytrends" ]] && echo SET || echo UNSET )"
    printf 'YTRENDS_API_TOKEN_HMAC_SHA256=%s\n' "$ytrends_fingerprint"
    printf 'YTUONG_API_TOKEN=%s\n' "$( [[ -n "$ytuong" ]] && echo SET || echo UNSET )"
    printf 'YTUONG_API_TOKEN_HMAC_SHA256=%s\n' "$ytuong_fingerprint"
  } > "$destination"
}
atomic_symlink_switch() {
  local target_dir="$1" tmp="${BASE_DIR}/omniseller-current-tmp"
  ln -snf "$target_dir" "$tmp"
  mv -Tf "$tmp" "$CURRENT_SYMLINK"
}
canonical_path() { readlink -f "$1"; }
health_matches_revision() {
  local expected_sha="$1" response
  for _ in 1 2 3 4 5; do
    response="$(curl -fsS "http://127.0.0.1:${PORT:-3001}/api/health" || true)"
    if TARGET_SHA="$expected_sha" node -e "const j=JSON.parse(process.argv[1]);if(j.status!=='OK'||j.database!=='CONNECTED'||j.revision!==process.env.TARGET_SHA)process.exit(1)" "$response" 2>/dev/null; then
      response="$(curl -fsS "$PUBLIC_DOMAIN/api/health" || true)"
      if TARGET_SHA="$expected_sha" node -e "const j=JSON.parse(process.argv[1]);if(j.status!=='OK'||j.database!=='CONNECTED'||j.revision!==process.env.TARGET_SHA)process.exit(1)" "$response" 2>/dev/null; then
        return 0
      fi
    fi
    sleep 2
  done
  return 1
}
rollback_code_only() {
  local rollback_failed=0
  echo "FAIL-CLOSED: code rollback; database restore is NOT PERFORMED."
  if ! sudo systemctl stop "$SERVICE"; then rollback_failed=1; fi
  if ! atomic_symlink_switch "$BASELINE_RELEASE_DIR"; then rollback_failed=1; fi
  if [[ "$(canonical_path "$CURRENT_SYMLINK")" != "$BASELINE_RELEASE_DIR" ]]; then rollback_failed=1; fi
  if [[ ! -f "$BASELINE_RELEASE_DIR/REVISION" ]] || [[ "$(tr -d '\r\n' < "$BASELINE_RELEASE_DIR/REVISION")" != "$BASELINE_SHA" ]]; then rollback_failed=1; fi
  if ! sudo systemctl restart "$SERVICE"; then rollback_failed=1; fi
  sleep 3
  if ! sudo systemctl is-active --quiet "$SERVICE"; then rollback_failed=1; fi
  if ! health_matches_revision "$BASELINE_SHA"; then rollback_failed=1; fi
  if [[ "$rollback_failed" != 0 ]]; then
    echo "CODE_ROLLBACK_STATUS=FAIL" >&2
    echo "DATABASE_RESTORE_STATUS=NOT_PERFORMED" >&2
    return 1
  fi
  SERVICE_STOPPED=0
  RECOVERY_ARMED=0
  echo "CODE_ROLLBACK_STATUS=PASS"
  echo "DATABASE_MIGRATION_STATUS=${DATABASE_MIGRATION_STATUS}"
  echo "DATABASE_RESTORE_STATUS=NOT_PERFORMED"
  echo "BASELINE_COMPATIBILITY_STATUS=${COMPATIBILITY_STATUS}"
}
rollback_or_abort() {
  if ! rollback_code_only; then
    echo "CRITICAL: rollback failed; manual intervention required." >&2
    exit 2
  fi
}
failure_trap() {
  local status="$?"
  trap - ERR
  if [[ "$RECOVERY_ARMED" = 1 ]] && { [[ "$SERVICE_STOPPED" = 1 ]] || ! sudo systemctl is-active --quiet "$SERVICE"; }; then
    if ! rollback_code_only; then
      echo "CRITICAL: rollback failed; manual intervention required." >&2
      exit 2
    fi
  fi
  exit "$status"
}

mkdir -p "$RELEASES_DIR" "$BACKUP_DIR"
[[ -d "$WORKTREE_REPO/.git" ]] || die "repository worktree missing"
[[ -f "$CURRENT_SYMLINK/REVISION" ]] || die "active release revision missing"
BASELINE_SHA="$(tr -d '\r\n' < "$CURRENT_SYMLINK/REVISION")"
[[ ${#BASELINE_SHA} -eq 40 ]] || die "baseline SHA invalid"
BASELINE_RELEASE_DIR="$RELEASES_DIR/$BASELINE_SHA"
[[ -f "$BASELINE_RELEASE_DIR/MANIFEST.json" ]] || die "baseline immutable release missing"

# This is a pre-stop gate. The helper and its Node 22 sqlite dependency are
# installed in OPS_ROOT, never copied into the immutable target release.
validate_external_helper

runtime_contract "${STATE_DIR}/runtime-contract.before"
[[ -z "${OMNI_DB_PATH:-}" || "$OMNI_DB_PATH" = "$SERVICE_DB_PATH" ]] || die "shell DB path differs from systemd DB path"

git -C "$WORKTREE_REPO" fetch origin "$TARGET_BRANCH:refs/remotes/origin/$TARGET_BRANCH"
TARGET_SHA="${TARGET_SHA:-$(git -C "$WORKTREE_REPO" rev-parse "origin/$TARGET_BRANCH")}"
[[ ${#TARGET_SHA} -eq 40 ]] || die "target SHA invalid"
git -C "$WORKTREE_REPO" cat-file -e "${TARGET_SHA}^{commit}"
TARGET_RELEASE_DIR="$RELEASES_DIR/$TARGET_SHA"

if [[ ! -f "$TARGET_RELEASE_DIR/MANIFEST.json" ]]; then
  mkdir -p "$TARGET_RELEASE_DIR"
  git -C "$WORKTREE_REPO" archive "$TARGET_SHA" | tar -x -C "$TARGET_RELEASE_DIR"
  printf '%s\n' "$TARGET_SHA" > "$TARGET_RELEASE_DIR/REVISION"
  export PATH="/home/etsy/.nvm/versions/node/v22.23.2/bin:$PATH"
  [[ "$(node -p "process.versions.node.split('.')[0]")" = 22 ]] || die "Node 22 required"
  (cd "$TARGET_RELEASE_DIR" && npm ci --build-from-source && node -e "require('sqlite3')" && npm run build)
  printf '{\n  "sha": "%s",\n  "status": "COMPLETE"\n}\n' "$TARGET_SHA" > "$TARGET_RELEASE_DIR/MANIFEST.json"
fi

if cmp -s "$BASELINE_RELEASE_DIR/server/database/migrations.js" "$TARGET_RELEASE_DIR/server/database/migrations.js"; then
  DATABASE_MIGRATION_STATUS="NO_NEW_MIGRATIONS"
  COMPATIBILITY_STATUS="BASELINE_AND_TARGET_MIGRATIONS_IDENTICAL"
else
  DATABASE_MIGRATION_STATUS="MIGRATION_CHANGE_DETECTED"
  verify_migration_compatibility_evidence
  COMPATIBILITY_STATUS="ROOT_OWNED_COMPATIBILITY_EVIDENCE_VERIFIED"
fi

# Arm recovery before stop: systemd may report a stop error after the service
# became inactive.  In that case restore baseline code and availability.
RECOVERY_ARMED=1
trap failure_trap ERR
if ! sudo systemctl stop "$SERVICE"; then
  if ! sudo systemctl is-active --quiet "$SERVICE"; then
    SERVICE_STOPPED=1
    rollback_or_abort
  fi
  echo "ERROR: service stop failed" >&2
  exit 1
fi
if sudo systemctl is-active --quiet "$SERVICE"; then
  echo "ERROR: service remained active after stop" >&2
  exit 1
fi
SERVICE_STOPPED=1
if [[ "${RUNBOOK_TEST_INJECT_STOP_FAILURE_AFTER_STOP:-0}" = 1 ]]; then
  echo "TEST: injecting failure after successful service stop" >&2
  false
fi
if command -v fuser >/dev/null 2>&1 && fuser -s "$SERVICE_DB_PATH"; then
  sudo systemctl restart "$SERVICE" || true
  die "database still has a writer/reader after service stop"
fi

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_dir="$BACKUP_DIR/backup_${timestamp}_${BASELINE_SHA:0:7}"
archive="${backup_dir}.tar.gz"
verify_dir="${backup_dir}.verify"
mkdir -p "$backup_dir"
export PATH="/home/etsy/.nvm/versions/node/v22.23.2/bin:$PATH"
if ! run_external_rehearsal; then
  rollback_or_abort
  exit 1
fi
cp "${STATE_DIR}/runtime-contract.before" "$backup_dir/runtime-contract.before"

# All DB handles are closed before this point. Manifest is relative and final.
( cd "$backup_dir" && sha256sum app.db rehearsal.db rehearsal-report.json runtime-contract.before > checksums.sha256 && sha256sum -c checksums.sha256 )
tar -C "$backup_dir" -czf "$archive" app.db rehearsal.db rehearsal-report.json runtime-contract.before checksums.sha256
( cd "$(dirname "$archive")" && sha256sum "$(basename "$archive")" > "$(basename "$archive").sha256" && sha256sum -c "$(basename "$archive").sha256" )
mkdir "$verify_dir"
tar -xzf "$archive" -C "$verify_dir"
( cd "$verify_dir" && sha256sum -c checksums.sha256 )
VERIFY_DB="$verify_dir/app.db" node -e "const sqlite3=require(process.argv[1]);const db=new sqlite3.Database(process.env.VERIFY_DB,sqlite3.OPEN_READONLY,e=>{if(e)throw e;db.get('PRAGMA integrity_check',(e,r)=>{if(e||!r||r.integrity_check!=='ok')process.exit(1);db.close(()=>console.log('EXTRACTED_SNAPSHOT_INTEGRITY=PASS'))})})" "$TARGET_RELEASE_DIR/node_modules/sqlite3"
rm -rf "$verify_dir"

atomic_symlink_switch "$TARGET_RELEASE_DIR"
sudo systemctl restart "$SERVICE"
sleep 3
if ! sudo systemctl is-active --quiet "$SERVICE"; then rollback_or_abort; exit 1; fi
runtime_contract "${STATE_DIR}/runtime-contract.after"
cmp -s "${STATE_DIR}/runtime-contract.before" "${STATE_DIR}/runtime-contract.after" || { rollback_or_abort; exit 1; }
health_matches_revision "$TARGET_SHA" || { rollback_or_abort; exit 1; }

echo "CANONICAL_BACKUP_AND_REHEARSAL=PASS"
echo "TARGET_SHA=$TARGET_SHA"
echo "DATABASE_MIGRATION_STATUS=$DATABASE_MIGRATION_STATUS"
echo "BASELINE_COMPATIBILITY_STATUS=$COMPATIBILITY_STATUS"
echo "DATABASE_RESTORE_STATUS=NOT_PERFORMED"
trap - ERR
RECOVERY_ARMED=0
