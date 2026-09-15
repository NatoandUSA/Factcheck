#!/bin/bash
# ==============================================================================
# OMNISELLER STUDIO — IMMUTABLE SYMLINK RELEASE & ROLLBACK RUNBOOK
# Production host identity is external configuration; do not publish it here.
# ==============================================================================

set -Eeuo pipefail

DEPLOY_STARTED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

TARGET_BRANCH="main"
PUBLIC_DOMAIN="https://omniseller.theglobalserviceteam.site"

# Production Base Paths
BASE_DIR="/home/etsy"
WORKTREE_REPO="${BASE_DIR}/omniseller"
RELEASES_DIR="${BASE_DIR}/omniseller-releases"
CURRENT_SYMLINK="${BASE_DIR}/omniseller-current"
STATE_DIR="${BASE_DIR}/omniseller-state"

# Dynamically resolve DB Path matching server/config/paths.js contract
DB_PATH="${OMNI_DB_PATH:-${STATE_DIR}/db/app.db}"
ENV_FILE="${DOTENV_PATH:-${STATE_DIR}/env/omniseller.env}"
[ ! -f "${ENV_FILE}" ] && ENV_FILE="${STATE_DIR}/omniseller.env"
BACKUP_DIR="${STATE_DIR}/backups"
RECEIPT_DIR="${STATE_DIR}/release-receipts"
NODE_HOME="${OMNI_NODE_HOME:-${BASE_DIR}/.nvm/versions/node/v22.23.2}"
NODE_BIN="${NODE_HOME}/bin/node"
NPM_CLI="${NODE_HOME}/lib/node_modules/npm/bin/npm-cli.js"

echo "========================================================================"
echo "  OMNISELLER STUDIO — IMMUTABLE RELEASE DEPLOYMENT RUNBOOK"
echo "========================================================================"

# --- STEP 1: PREFLIGHT & BASELINE SHA CAPTURE ---
echo -e "\n[Step 1/7] Capturing Baseline SHA & Resolving Target Release..."

mkdir -p "${RELEASES_DIR}" "${STATE_DIR}/db" "${STATE_DIR}/imports" "${BACKUP_DIR}" "${RECEIPT_DIR}"

if [ ! -x "${NODE_BIN}" ] || [ ! -f "${NPM_CLI}" ]; then
    echo "🔴 ERROR: Required Node 22 runtime not found under ${NODE_HOME}."
    exit 1
fi

NODE_MAJOR=$("${NODE_BIN}" -p "process.versions.node.split('.')[0]")
if [ "${NODE_MAJOR}" != "22" ]; then
    echo "🔴 ERROR: Deployment requires Node 22; resolved ${NODE_BIN} as major ${NODE_MAJOR}."
    exit 1
fi
echo "🟢 Deployment runtime: $("${NODE_BIN}" --version) (${NODE_BIN})"

if [ ! -f "${ENV_FILE}" ]; then
    echo "🔴 ERROR: Production environment file ${ENV_FILE} does not exist."
    exit 1
fi
R43_FLAG_COUNT=$(awk -F= '/^[[:space:]]*OMNI_R43_SINGLE_PATH[[:space:]]*=/ { count += 1; value=$2; gsub(/[[:space:]\r]/, "", value) } END { print count ":" value }' "${ENV_FILE}")
NODE_ENV_COUNT=$(awk -F= '/^[[:space:]]*NODE_ENV[[:space:]]*=/ { count += 1; value=$2; gsub(/[[:space:]\r]/, "", value) } END { print count ":" value }' "${ENV_FILE}")
if [ "${R43_FLAG_COUNT}" != "1:1" ] || [ "${NODE_ENV_COUNT}" != "1:production" ]; then
    echo "🔴 ERROR: ${ENV_FILE} must contain exactly one NODE_ENV=production and one OMNI_R43_SINGLE_PATH=1 assignment."
    exit 1
fi
echo "🟢 R4.3 single-path production policy is explicitly configured."

if [ ! -d "${WORKTREE_REPO}" ]; then
    echo "🔴 ERROR: Repository worktree ${WORKTREE_REPO} does not exist."
    exit 1
fi

# A rollback target must be the exact currently running, already built release.
# Reconstructing one from Git after the fact would not prove its dependencies,
# build output or runtime compatibility.
if [ ! -L "${CURRENT_SYMLINK}" ]; then
    echo "🔴 ERROR: ${CURRENT_SYMLINK} must be an existing release symlink before deployment."
    exit 1
fi
BASELINE_RELEASE_DIR=$(readlink -f "${CURRENT_SYMLINK}")
if [ "$(dirname "${BASELINE_RELEASE_DIR}")" != "${RELEASES_DIR}" ] \
  || [ ! -f "${BASELINE_RELEASE_DIR}/REVISION" ] \
  || [ ! -f "${BASELINE_RELEASE_DIR}/MANIFEST.json" ] \
  || [ ! -d "${BASELINE_RELEASE_DIR}/node_modules" ] \
  || [ ! -f "${BASELINE_RELEASE_DIR}/dist/index.html" ]; then
    echo "🔴 ERROR: Active baseline is not a complete immutable release under ${RELEASES_DIR}."
    exit 1
fi
BASELINE_SHA=$(tr -d '\r\n' < "${BASELINE_RELEASE_DIR}/REVISION")

echo "🟢 Active Baseline SHA: ${BASELINE_SHA}"

# Fetch remote tracking branch first before resolving target SHA (Fail-Closed)
echo "Fetching origin/${TARGET_BRANCH}..."
git -C "${WORKTREE_REPO}" fetch origin "${TARGET_BRANCH}:refs/remotes/origin/${TARGET_BRANCH}" || {
    echo "⚠️ Warning: git fetch origin ${TARGET_BRANCH} failed. Proceeding with local object check for target SHA..."
}

TARGET_SHA="${1:-$(git -C "${WORKTREE_REPO}" rev-parse origin/${TARGET_BRANCH} 2>/dev/null || git -C "${WORKTREE_REPO}" rev-parse HEAD)}"
echo "🟢 Target Release SHA: ${TARGET_SHA}"

if [[ ! "${TARGET_SHA}" =~ ^[a-f0-9]{40}$ ]]; then
    echo "🔴 ERROR: Target SHA must be a valid 40-character git commit hash."
    exit 1
fi

# Validate Target Commit Object exists in git history
git -C "${WORKTREE_REPO}" cat-file -e "${TARGET_SHA}^{commit}" || {
    echo "🔴 ERROR: Commit object ${TARGET_SHA} does not exist in git history."
    exit 1
}

if [[ ! "${BASELINE_SHA}" =~ ^[a-f0-9]{40}$ ]] \
  || ! git -C "${WORKTREE_REPO}" cat-file -e "${BASELINE_SHA}^{commit}" 2>/dev/null; then
    echo "🔴 ERROR: Captured baseline must resolve to an exact 40-character commit before rollback can be claimed."
    exit 1
fi

"${NODE_BIN}" -e "const fs=require('node:fs');const p=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));if(p.sha!==process.argv[2]||p.status!=='COMPLETE'||!Number.isFinite(Date.parse(p.built_at)))process.exit(1);" \
  "${BASELINE_RELEASE_DIR}/MANIFEST.json" "${BASELINE_SHA}" || {
    echo "🔴 ERROR: Active baseline manifest does not bind the exact baseline SHA as COMPLETE."
    exit 1
}

# Function for Atomic Symlink Swap
atomic_symlink_switch() {
    local target_dir="$1"
    local symlink_tmp="${BASE_DIR}/omniseller-current-tmp"
    ln -snf "${target_dir}" "${symlink_tmp}"
    mv -Tf "${symlink_tmp}" "${CURRENT_SYMLINK}"
}

# Fail-Closed State Machine Rollback Trap
# NOTE: Deployment rollback ONLY swaps code symlinks to baseline.
# Database restore is strictly a separate, explicit, migration-aware, owner-approved operation.
rollback() {
    trap - ERR
    echo -e "\n🔴 DEPLOYMENT OR LOCAL/PUBLIC HEALTH VALIDATION FAILED! INITIATING CODE-ONLY ROLLBACK..."
    echo "⚠️ This rollback changes the release symlink only; it does not restore the database."
    sudo systemctl stop omniseller-web || true
    
    # Remove incomplete / failed release directory to reclaim disk space
    if [ "${TARGET_RELEASE_CREATED:-0}" = "1" ] && [ -n "${TARGET_RELEASE_DIR}" ] && [ "${TARGET_RELEASE_DIR}" != "${BASELINE_RELEASE_DIR}" ]; then
        rm -rf "${TARGET_RELEASE_DIR}" 2>/dev/null || true
    fi

    echo "Restoring active symlink atomically to pre-built baseline release ${BASELINE_RELEASE_DIR}..."
    SYMLINK_RESTORED=0
    if atomic_symlink_switch "${BASELINE_RELEASE_DIR}"; then
        ACTIVE_RELEASE_AFTER_ROLLBACK="$(readlink -f "${CURRENT_SYMLINK}" 2>/dev/null || true)"
        if [ "${ACTIVE_RELEASE_AFTER_ROLLBACK}" = "${BASELINE_RELEASE_DIR}" ]; then
            SYMLINK_RESTORED=1
        else
            echo "🔴 CRITICAL: Symlink switch returned success but active target is '${ACTIVE_RELEASE_AFTER_ROLLBACK:-UNRESOLVED}'."
        fi
    else
        ACTIVE_RELEASE_AFTER_ROLLBACK="$(readlink -f "${CURRENT_SYMLINK}" 2>/dev/null || true)"
        echo "🔴 CRITICAL: Baseline symlink could not be restored. Active target is '${ACTIVE_RELEASE_AFTER_ROLLBACK:-UNRESOLVED}'."
    fi
    
    echo "Restarting systemd service 'omniseller-web' on baseline release..."
    sudo systemctl restart omniseller-web || true
    
    sleep 3
    if [ "${SYMLINK_RESTORED}" = "1" ] && sudo systemctl is-active --quiet omniseller-web; then
        echo "🟢 System successfully rolled back to baseline release ${BASELINE_SHA} (active: ${ACTIVE_RELEASE_AFTER_ROLLBACK})."
    else
        SERVICE_STATE_AFTER_ROLLBACK="$(sudo systemctl is-active omniseller-web 2>/dev/null || true)"
        echo "🔴 CRITICAL: Baseline rollback is NOT verified (service=${SERVICE_STATE_AFTER_ROLLBACK:-UNKNOWN}, active=${ACTIVE_RELEASE_AFTER_ROLLBACK:-UNRESOLVED}). Manual intervention required."
    fi
    exit 1
}

# --- STEP 2: ISOLATED RELEASE BUILDING (0s Downtime) ---
TARGET_RELEASE_DIR="${RELEASES_DIR}/${TARGET_SHA}"
MANIFEST_FILE="${TARGET_RELEASE_DIR}/MANIFEST.json"
TARGET_RELEASE_CREATED=0

echo -e "\n[Step 2/7] Preparing isolated release directory at ${TARGET_RELEASE_DIR}..."

if [ ! -f "${MANIFEST_FILE}" ]; then
    mkdir -p "${TARGET_RELEASE_DIR}"
    TARGET_RELEASE_CREATED=1
    git -C "${WORKTREE_REPO}" archive "${TARGET_SHA}" | tar -x -C "${TARGET_RELEASE_DIR}"
    
    echo "${TARGET_SHA}" > "${TARGET_RELEASE_DIR}/REVISION"
    cd "${TARGET_RELEASE_DIR}"

    echo "Installing production dependencies & building native addons from source (Ubuntu 22.04 LTS)..."
    MAKEFLAGS=-j1 npm_config_jobs=1 "${NODE_BIN}" "${NPM_CLI}" ci --build-from-source --production=false || { rollback; }

    echo "Verifying native SQLite addon loading..."
    "${NODE_BIN}" -e "require('./node_modules/sqlite3'); console.log('🟢 Native sqlite3 addon verified in release directory.');" || { rollback; }

    echo "Building Vite production bundle inside release directory..."
    "${NODE_BIN}" "${NPM_CLI}" run build || { rollback; }

    # Write Atomic Completion Manifest
    cat << EOF > "${MANIFEST_FILE}"
{
  "sha": "${TARGET_SHA}",
  "built_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "status": "COMPLETE"
}
EOF
    echo "🟢 Atomic completion manifest written."
fi

BASELINE_SCHEMA_AS_SEEN_BY_TARGET=$("${NODE_BIN}" "${TARGET_RELEASE_DIR}/scripts/schema_fingerprint.cjs" "${BASELINE_RELEASE_DIR}") || exit 1
BASELINE_SCHEMA_FINGERPRINT=$("${NODE_BIN}" -e "console.log(JSON.parse(process.argv[1]).schemaAuthorityFingerprint)" "${BASELINE_SCHEMA_AS_SEEN_BY_TARGET}")
BASELINE_COMPARATOR_FINGERPRINT=$("${NODE_BIN}" -e "console.log('0'.repeat(64))")
SCHEMA_COMPARATOR_DRIFT=0
if [ -f "${BASELINE_RELEASE_DIR}/scripts/schema_fingerprint.cjs" ]; then
    BASELINE_SCHEMA=$("${NODE_BIN}" "${BASELINE_RELEASE_DIR}/scripts/schema_fingerprint.cjs" "${BASELINE_RELEASE_DIR}") || exit 1
    BASELINE_NATIVE_FINGERPRINT=$("${NODE_BIN}" -e "const v=JSON.parse(process.argv[1]); console.log(v.schemaAuthorityFingerprint || v.fingerprint)" "${BASELINE_SCHEMA}")
    BASELINE_COMPARATOR_FINGERPRINT=$("${NODE_BIN}" -e "const v=JSON.parse(process.argv[1]); console.log(v.comparatorFingerprint || '0'.repeat(64))" "${BASELINE_SCHEMA}")
    [ "${BASELINE_NATIVE_FINGERPRINT}" != "${BASELINE_SCHEMA_FINGERPRINT}" ] && SCHEMA_COMPARATOR_DRIFT=1
else
    SCHEMA_COMPARATOR_DRIFT=1
fi
TARGET_SCHEMA=$("${NODE_BIN}" "${TARGET_RELEASE_DIR}/scripts/schema_fingerprint.cjs" "${TARGET_RELEASE_DIR}") || exit 1
TARGET_SCHEMA_FINGERPRINT=$("${NODE_BIN}" -e "console.log(JSON.parse(process.argv[1]).schemaAuthorityFingerprint)" "${TARGET_SCHEMA}")
TARGET_COMPARATOR_FINGERPRINT=$("${NODE_BIN}" -e "console.log(JSON.parse(process.argv[1]).comparatorFingerprint)" "${TARGET_SCHEMA}")
TARGET_RELEASE_CONTROL_FINGERPRINT=$("${NODE_BIN}" -e "console.log(JSON.parse(process.argv[1]).releaseControlFingerprint)" "${TARGET_SCHEMA}")
RELEASE_GATE_DECISION=$("${NODE_BIN}" "${TARGET_RELEASE_DIR}/scripts/release_gate_policy.cjs" \
  "${BASELINE_SCHEMA_FINGERPRINT}" "${TARGET_SCHEMA_FINGERPRINT}" \
  "${BASELINE_COMPARATOR_FINGERPRINT}" "${TARGET_COMPARATOR_FINGERPRINT}") || exit 1
MIGRATION_REHEARSAL_REQUIRED=$("${NODE_BIN}" -e "console.log(JSON.parse(process.argv[1]).migrationRehearsalRequired)" "${RELEASE_GATE_DECISION}")
COMPARATOR_CHANGED=$("${NODE_BIN}" -e "console.log(JSON.parse(process.argv[1]).comparatorChanged)" "${RELEASE_GATE_DECISION}")
[ "${COMPARATOR_CHANGED}" = "true" ] && SCHEMA_COMPARATOR_DRIFT=1
MIGRATION_EVIDENCE_SHA="${TARGET_RELEASE_CONTROL_FINGERPRINT}"
if [ "${MIGRATION_REHEARSAL_REQUIRED}" = "true" ]; then
    MIGRATION_RECEIPT="${STATE_DIR}/migration-compatibility/${BASELINE_SHA}_${TARGET_SHA}.json"
    MIGRATION_EVIDENCE_DIR="${STATE_DIR}/migration-compatibility/evidence"
    if [ ! -f "${MIGRATION_RECEIPT}" ]; then
        echo "🔴 ERROR: Migration authority changed; exact compatibility receipt is required at ${MIGRATION_RECEIPT}."
        exit 1
    fi
    "${NODE_BIN}" "${TARGET_RELEASE_DIR}/scripts/verify_migration_compatibility_receipt.cjs" \
      "${MIGRATION_RECEIPT}" "${BASELINE_SHA}" "${TARGET_SHA}" \
      "${BASELINE_SCHEMA_FINGERPRINT}" "${TARGET_SCHEMA_FINGERPRINT}" "${MIGRATION_EVIDENCE_DIR}" || exit 1
    MIGRATION_EVIDENCE_SHA=$("${NODE_BIN}" -e "const r=require(process.argv[1]); console.log(r.evidenceSha256 || '')" "${MIGRATION_RECEIPT}")
fi
OWNER_APPROVAL_PR_NUMBER=$(awk -F= '/^[[:space:]]*OMNI_OWNER_APPROVAL_PR_NUMBER[[:space:]]*=/ { count += 1; value=$2; gsub(/[[:space:]\r]/, "", value) } END { if (count == 1) print value }' "${ENV_FILE}")
if ! [[ "${OWNER_APPROVAL_PR_NUMBER}" =~ ^[1-9][0-9]*$ ]]; then
    echo "🔴 ERROR: Exact GitHub Owner approval PR number is required for every release."
    exit 1
fi
"${NODE_BIN}" "${TARGET_RELEASE_DIR}/scripts/verify_owner_authorization.cjs" \
  "${OWNER_APPROVAL_PR_NUMBER}" "NatoandUSA" "${BASELINE_SHA}" "${TARGET_SHA}" \
  "${BASELINE_SCHEMA_FINGERPRINT}" "${TARGET_SCHEMA_FINGERPRINT}" \
  "${BASELINE_COMPARATOR_FINGERPRINT}" "${TARGET_COMPARATOR_FINGERPRINT}" \
  "${TARGET_RELEASE_CONTROL_FINGERPRINT}" "${MIGRATION_EVIDENCE_SHA}" || exit 1
if [ "${SCHEMA_COMPARATOR_DRIFT}" = "1" ]; then
    echo "🟡 Comparator changed or was absent on baseline; exact Owner authorization accepted without fabricating a DB migration."
fi

# --- STEP 3: SAFE SERVICE STOP & WAL-SAFE DB BACKUP ---
echo -e "\n[Step 3/7] Stopping systemd service 'omniseller-web' & snapshotting database..."
trap 'rollback' ERR
sudo systemctl stop omniseller-web

if sudo systemctl is-active --quiet omniseller-web; then
    echo "🔴 ERROR: Failed to stop systemd service omniseller-web. Aborting release."
    exit 1
fi
echo "🟢 systemd service 'omniseller-web' is INACTIVE."

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_SUBDIR="${BACKUP_DIR}/backup_${TIMESTAMP}_${BASELINE_SHA:0:7}"
mkdir -p "${BACKUP_SUBDIR}" || rollback
BACKUP_INTEGRITY_CHECK="NOT_PRESENT"
BACKUP_CHECKSUM_MANIFEST=""

if [ -f "${DB_PATH}" ]; then
    echo "Snapshotting app.db, app.db-wal, and app.db-shm to ${BACKUP_SUBDIR}..."
    cp -p "${DB_PATH}" "${BACKUP_SUBDIR}/app.db" || rollback
    [ -f "${DB_PATH}-wal" ] && cp -p "${DB_PATH}-wal" "${BACKUP_SUBDIR}/app.db-wal"
    [ -f "${DB_PATH}-shm" ] && cp -p "${DB_PATH}-shm" "${BACKUP_SUBDIR}/app.db-shm"
    
    echo "Verifying SQLite database integrity on read-only SNAPSHOT ARTIFACT..."
    "${NODE_BIN}" -e "
      const sqlite3 = require('${TARGET_RELEASE_DIR}/node_modules/sqlite3');
      const db = new sqlite3.Database('${BACKUP_SUBDIR}/app.db', sqlite3.OPEN_READONLY);
      db.get('PRAGMA integrity_check', (err, row) => {
        if (err || !row || row.integrity_check !== 'ok') {
          console.error('🔴 DB Snapshot Integrity Error:', err || row);
          process.exit(1);
        }
        console.log('🟢 DB Snapshot Integrity Check: ok');
        db.close();
      });
    " || { echo "🔴 DB snapshot integrity check failed"; rollback; }

    echo "Calculating and verifying SHA-256 checksums after the read-only integrity probe..."
    sha256sum "${BACKUP_SUBDIR}"/app.db* > "${BACKUP_SUBDIR}/checksums.sha256" || rollback
    (cd "${BACKUP_SUBDIR}" && sha256sum -c checksums.sha256) || {
        echo "🔴 DB snapshot checksum verification failed"; rollback;
    }
    BACKUP_INTEGRITY_CHECK="ok"
    BACKUP_CHECKSUM_MANIFEST="${BACKUP_SUBDIR}/checksums.sha256"
fi

# --- STEP 4: ATOMIC SYMLINK SWITCH ---
echo -e "\n[Step 4/7] Atomic symlink switch /home/etsy/omniseller-current -> ${TARGET_RELEASE_DIR}..."
atomic_symlink_switch "${TARGET_RELEASE_DIR}"
echo "🟢 Symlink updated atomically with mv -Tf."

# --- STEP 5: RESTART SYSTEMD SERVICE ---
echo -e "\n[Step 5/7] Starting systemd service 'omniseller-web'..."
sudo systemctl restart omniseller-web

sleep 3

if ! sudo systemctl is-active --quiet omniseller-web; then
    echo "🔴 systemd service 'omniseller-web' failed to enter active state."
    sudo journalctl -u omniseller-web -n 25 --no-pager || true
    rollback
fi
echo "🟢 systemd service 'omniseller-web' is ACTIVE."

SERVICE_PID=$(sudo systemctl show -p MainPID --value omniseller-web)
if [ -z "${SERVICE_PID}" ] || [ "${SERVICE_PID}" = "0" ] \
  || ! sudo tr '\0' '\n' < "/proc/${SERVICE_PID}/environ" | grep -qx 'NODE_ENV=production' \
  || ! sudo tr '\0' '\n' < "/proc/${SERVICE_PID}/environ" | grep -qx 'OMNI_R43_SINGLE_PATH=1'; then
    echo "🔴 Runtime policy receipt failed: active service process must expose NODE_ENV=production and OMNI_R43_SINGLE_PATH=1."
    rollback
fi
echo "🟢 Active service process confirms OMNI_R43_SINGLE_PATH=1."

# --- STEP 6: DUAL HEALTH & REVISION PROBE VALIDATION ---
echo -e "\n[Step 6/7] Validating Local & Public Health Endpoints & Revision Provenance..."

PORT="${PORT:-3001}"
LOCAL_STATUS="000"
LOCAL_REVISION=""

for i in {1..5}; do
    RESPONSE=$(curl -s "http://127.0.0.1:${PORT}/api/health" || echo "")
    if [ -n "${RESPONSE}" ]; then
        LOCAL_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:${PORT}/api/health" || echo "000")
        LOCAL_REVISION=$("${NODE_BIN}" -e "try { console.log(JSON.parse(process.argv[1]).revision || ''); } catch(_) {}" "${RESPONSE}")
        if [ "${LOCAL_STATUS}" -eq 200 ] && [ "${LOCAL_REVISION}" = "${TARGET_SHA}" ]; then
            break
        fi
    fi
    echo "Waiting for server startup on port ${PORT}... (attempt ${i}/5)"
    sleep 2
done

if [ "${LOCAL_STATUS}" -ne 200 ]; then
    echo "🔴 Local health check failed: HTTP ${LOCAL_STATUS} (expected 200)."
    rollback
fi

# Strict 40-character SHA equality check
if [ "${LOCAL_REVISION}" != "${TARGET_SHA}" ]; then
    echo "🔴 Revision Mismatch: Target SHA is ${TARGET_SHA}, but local server reported revision ${LOCAL_REVISION}."
    rollback
fi
echo "🟢 Local Revision Provenance Verified: 100% exact match with Target SHA ${TARGET_SHA}."

# 6b. Public Cloudflare Domain Verification (FAIL-CLOSED Contract)
PUBLIC_RESPONSE=$(curl -s "${PUBLIC_DOMAIN}/api/health" || echo "")
PUBLIC_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${PUBLIC_DOMAIN}/api/health" || echo "000")

if [ "${PUBLIC_STATUS}" -ne 200 ]; then
    echo "⚠️ Public Cloudflare health check returned HTTP ${PUBLIC_STATUS}. Retrying in 5s..."
    sleep 5
    PUBLIC_RESPONSE=$(curl -s "${PUBLIC_DOMAIN}/api/health" || echo "")
    PUBLIC_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${PUBLIC_DOMAIN}/api/health" || echo "000")
fi

PUBLIC_REVISION=$("${NODE_BIN}" -e "try { console.log(JSON.parse(process.argv[1]).revision || ''); } catch(_) {}" "${PUBLIC_RESPONSE}")

if [ "${PUBLIC_STATUS}" -ne 200 ] || [ "${PUBLIC_REVISION}" != "${TARGET_SHA}" ]; then
    echo "🔴 FAIL-CLOSED DEPLOYMENT ERROR: Public Cloudflare health check failed or revision mismatched."
    echo "    Expected HTTP 200 and Revision ${TARGET_SHA}, but got HTTP ${PUBLIC_STATUS} and Revision ${PUBLIC_REVISION}."
    rollback
fi

echo "🟢 Public Cloudflare health probe ${PUBLIC_DOMAIN}/api/health returned 200 OK (Revision: ${PUBLIC_REVISION})."

# Retention is based on validated manifest timestamps, never SHA sort order.
# The active target and captured baseline are always retained in addition to
# the two newest complete releases. Invalid/missing manifests fail safe: warn
# and retain for manual inspection.
echo "Planning release retention from validated manifests..."
RETENTION_PLAN_FILE=$(mktemp)
"${NODE_BIN}" "${TARGET_RELEASE_DIR}/scripts/release_retention.cjs" \
  "${RELEASES_DIR}" "${TARGET_SHA}" "${BASELINE_SHA}" 2 > "${RETENTION_PLAN_FILE}" || rollback
"${NODE_BIN}" -e "const p=require(process.argv[1]); for(const w of p.warnings) console.error('⚠️ Retained for manual review: '+w.sha+' '+w.code);" "${RETENTION_PLAN_FILE}"
mapfile -t PRUNE_RELEASES < <("${NODE_BIN}" -e "const p=require(process.argv[1]); for(const item of p.prune) console.log(item);" "${RETENTION_PLAN_FILE}")
for old_release in "${PRUNE_RELEASES[@]}"; do
    release_name=$(basename "${old_release}")
    if [[ "${old_release}" != "${RELEASES_DIR}/"* ]] || [[ ! "${release_name}" =~ ^[a-f0-9]{40}$ ]] \
      || [ "${old_release}" = "${TARGET_RELEASE_DIR}" ] || [ "${old_release}" = "${BASELINE_RELEASE_DIR}" ]; then
        echo "🔴 Unsafe retention target rejected: ${old_release}"
        rollback
    fi
    echo "Removing obsolete validated release: ${old_release}"
    rm -rf -- "${old_release}"
done
rm -f "${RETENTION_PLAN_FILE}"

# Freeze a machine-readable, secret-free receipt for independent review.
SERVICE_EXEC=$(sudo systemctl show -p ExecStart --value omniseller-web)
SERVICE_WORKDIR=$(sudo systemctl show -p WorkingDirectory --value omniseller-web)
ACTIVE_RELEASE=$(readlink -f "${CURRENT_SYMLINK}")
JOURNAL_ERROR_COUNT=$(sudo journalctl -u omniseller-web --since "${DEPLOY_STARTED_AT}" -p err --no-pager -q | wc -l | tr -d ' ') || rollback
RECEIPT_FILE="${RECEIPT_DIR}/${TARGET_SHA}_${TIMESTAMP}.json"
receipt_failure() {
    echo "🔴 RELEASE_ACTIVE_BUT_UNRECEIPTED: target remains active and health-verified, but atomic receipt creation failed."
    echo "🔴 Deployment is incomplete and must not be declared successful; inspect ${RECEIPT_DIR} before any next deploy."
    exit 2
}
if ! RECEIPT_TARGET_SHA="${TARGET_SHA}" RECEIPT_BASELINE_SHA="${BASELINE_SHA}" \
RECEIPT_STARTED_AT="${DEPLOY_STARTED_AT}" RECEIPT_FINISHED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
RECEIPT_NODE_VERSION="$("${NODE_BIN}" --version)" RECEIPT_NODE_ENV="production" RECEIPT_ACTIVE_RELEASE="${ACTIVE_RELEASE}" \
RECEIPT_BACKUP_DIR="${BACKUP_SUBDIR}" RECEIPT_LOCAL_STATUS="${LOCAL_STATUS}" \
RECEIPT_BACKUP_INTEGRITY="${BACKUP_INTEGRITY_CHECK}" RECEIPT_BACKUP_MANIFEST="${BACKUP_CHECKSUM_MANIFEST}" \
RECEIPT_LOCAL_REVISION="${LOCAL_REVISION}" RECEIPT_PUBLIC_STATUS="${PUBLIC_STATUS}" \
RECEIPT_PUBLIC_REVISION="${PUBLIC_REVISION}" RECEIPT_SERVICE_PID="${SERVICE_PID}" \
RECEIPT_SERVICE_EXEC="${SERVICE_EXEC}" RECEIPT_SERVICE_WORKDIR="${SERVICE_WORKDIR}" \
RECEIPT_JOURNAL_ERRORS="${JOURNAL_ERROR_COUNT}" RECEIPT_FILE="${RECEIPT_FILE}" \
"${NODE_BIN}" - <<'NODE'
const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');
let backupFiles = [];
let checksumManifestSha256 = null;
if (process.env.RECEIPT_BACKUP_MANIFEST) {
  const manifestBytes = fs.readFileSync(process.env.RECEIPT_BACKUP_MANIFEST);
  checksumManifestSha256 = crypto.createHash('sha256').update(manifestBytes).digest('hex');
  backupFiles = manifestBytes.toString('utf8').trim().split(/\r?\n/).filter(Boolean).map(line => {
    const match = line.match(/^([a-f0-9]{64})\s+(.+)$/);
    if (!match) throw new Error('BACKUP_CHECKSUM_MANIFEST_INVALID');
    const absolute = path.resolve(match[2]);
    if (path.dirname(absolute) !== path.resolve(process.env.RECEIPT_BACKUP_DIR)) {
      throw new Error('BACKUP_CHECKSUM_PATH_ESCAPE');
    }
    return { name: path.basename(absolute), size: fs.statSync(absolute).size, sha256: match[1] };
  });
}
const receipt = {
  schemaVersion: 1,
  deploymentStatus: 'ACTIVE_VERIFIED',
  targetSha: process.env.RECEIPT_TARGET_SHA,
  baselineSha: process.env.RECEIPT_BASELINE_SHA,
  startedAt: process.env.RECEIPT_STARTED_AT,
  finishedAt: process.env.RECEIPT_FINISHED_AT,
  nodeVersion: process.env.RECEIPT_NODE_VERSION,
  nodeEnvironment: process.env.RECEIPT_NODE_ENV,
  activeRelease: process.env.RECEIPT_ACTIVE_RELEASE,
  backup: {
    directory: process.env.RECEIPT_BACKUP_DIR,
    integrityCheck: process.env.RECEIPT_BACKUP_INTEGRITY,
    files: backupFiles,
    checksumManifestSha256
  },
  health: {
    local: { status: Number(process.env.RECEIPT_LOCAL_STATUS), revision: process.env.RECEIPT_LOCAL_REVISION },
    public: { status: Number(process.env.RECEIPT_PUBLIC_STATUS), revision: process.env.RECEIPT_PUBLIC_REVISION }
  },
  service: {
    active: true,
    pid: Number(process.env.RECEIPT_SERVICE_PID),
    execStart: process.env.RECEIPT_SERVICE_EXEC,
    workingDirectory: process.env.RECEIPT_SERVICE_WORKDIR,
    r43SinglePath: true,
    journalErrorCountSinceDeployStart: Number(process.env.RECEIPT_JOURNAL_ERRORS)
  },
  rollbackScope: 'CODE_SYMLINK_ONLY_DATABASE_RESTORE_REQUIRES_OWNER_APPROVAL'
};
const target = process.env.RECEIPT_FILE;
const temporary = `${target}.tmp-${process.pid}`;
let descriptor;
try {
  descriptor = fs.openSync(temporary, 'wx', 0o600);
  fs.writeFileSync(descriptor, `${JSON.stringify(receipt, null, 2)}\n`);
  fs.fsyncSync(descriptor);
  fs.closeSync(descriptor); descriptor = undefined;
  fs.linkSync(temporary, target);
  fs.unlinkSync(temporary);
  const directory = fs.openSync(require('node:path').dirname(target), 'r');
  try { fs.fsyncSync(directory); } finally { fs.closeSync(directory); }
} catch (error) {
  if (descriptor !== undefined) fs.closeSync(descriptor);
  try { fs.unlinkSync(temporary); } catch (_) {}
  throw error;
}
NODE
then
    receipt_failure
fi
sha256sum "${RECEIPT_FILE}" > "${RECEIPT_FILE}.sha256.tmp" || receipt_failure
ln "${RECEIPT_FILE}.sha256.tmp" "${RECEIPT_FILE}.sha256" || receipt_failure
rm -f "${RECEIPT_FILE}.sha256.tmp" || receipt_failure
echo "🟢 Frozen deployment receipt: ${RECEIPT_FILE}"

# --- STEP 7: DEPLOYMENT SUCCESS DECLARATION ---
echo -e "\n========================================================================"
echo "  🟢 IMMUTABLE RELEASE DEPLOYMENT PASSED CLEANLY!"
echo "  Target SHA ${TARGET_SHA} is active on systemd omniseller-web."
echo "  Active Symlink: /home/etsy/omniseller-current -> ${TARGET_RELEASE_DIR}"
echo "========================================================================"
