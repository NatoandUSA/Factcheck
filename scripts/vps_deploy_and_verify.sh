#!/bin/bash
# ==============================================================================
# OMNISELLER STUDIO — IMMUTABLE SYMLINK RELEASE & ROLLBACK RUNBOOK
# Authoritative Production VPS Topology: etsy@51.79.200.65 (Ubuntu 22.04 LTS)
# ==============================================================================

set -Eeuo pipefail

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

echo "========================================================================"
echo "  OMNISELLER STUDIO — IMMUTABLE RELEASE DEPLOYMENT RUNBOOK"
echo "========================================================================"

# --- STEP 1: PREFLIGHT & BASELINE SHA CAPTURE ---
echo -e "\n[Step 1/7] Capturing Baseline SHA & Resolving Target Release..."

mkdir -p "${RELEASES_DIR}" "${STATE_DIR}/db" "${STATE_DIR}/imports" "${BACKUP_DIR}"

if [ ! -d "${WORKTREE_REPO}" ]; then
    echo "🔴 ERROR: Repository worktree ${WORKTREE_REPO} does not exist."
    exit 1
fi

# Capture Baseline SHA BEFORE any fetch or checkout from active symlink REVISION file
BASELINE_SHA=""
if [ -f "${CURRENT_SYMLINK}/REVISION" ]; then
    BASELINE_SHA=$(cat "${CURRENT_SYMLINK}/REVISION" | tr -d '\r\n')
fi

if [ -z "${BASELINE_SHA}" ] && [ -L "${CURRENT_SYMLINK}" ]; then
    BASELINE_SHA=$(git -C "${CURRENT_SYMLINK}" rev-parse HEAD 2>/dev/null || echo "")
fi

if [ -z "${BASELINE_SHA}" ]; then
    BASELINE_SHA=$(git -C "${WORKTREE_REPO}" rev-parse HEAD 2>/dev/null || echo "e6df541c4a5d7fbc9d6e5bbca18b48d442039b96")
fi

echo "🟢 Active Baseline SHA: ${BASELINE_SHA}"

# Fetch remote tracking branch first before resolving target SHA (Fail-Closed)
echo "Fetching origin/${TARGET_BRANCH}..."
git -C "${WORKTREE_REPO}" fetch origin "${TARGET_BRANCH}:refs/remotes/origin/${TARGET_BRANCH}" || {
    echo "⚠️ Warning: git fetch origin ${TARGET_BRANCH} failed. Proceeding with local object check for target SHA..."
}

TARGET_SHA="${1:-$(git -C "${WORKTREE_REPO}" rev-parse origin/${TARGET_BRANCH} 2>/dev/null || git -C "${WORKTREE_REPO}" rev-parse HEAD)}"
echo "🟢 Target Release SHA: ${TARGET_SHA}"

if [ -z "${TARGET_SHA}" ] || [ ${#TARGET_SHA} -ne 40 ]; then
    echo "🔴 ERROR: Target SHA must be a valid 40-character git commit hash."
    exit 1
fi

# Validate Target Commit Object exists in git history
git -C "${WORKTREE_REPO}" cat-file -e "${TARGET_SHA}^{commit}" || {
    echo "🔴 ERROR: Commit object ${TARGET_SHA} does not exist in git history."
    exit 1
}

BASELINE_RELEASE_DIR="${RELEASES_DIR}/${BASELINE_SHA}"
if [ ! -d "${BASELINE_RELEASE_DIR}" ] || [ ! -f "${BASELINE_RELEASE_DIR}/MANIFEST.json" ]; then
    echo "Preparing baseline release directory ${BASELINE_RELEASE_DIR}..."
    mkdir -p "${BASELINE_RELEASE_DIR}"
    git -C "${WORKTREE_REPO}" archive "${BASELINE_SHA}" | tar -x -C "${BASELINE_RELEASE_DIR}"
    echo "${BASELINE_SHA}" > "${BASELINE_RELEASE_DIR}/REVISION"
    cat << EOF > "${BASELINE_RELEASE_DIR}/MANIFEST.json"
{
  "sha": "${BASELINE_SHA}",
  "built_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "status": "COMPLETE"
}
EOF
fi

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
    echo -e "\n🔴 DEPLOYMENT OR LOCAL/PUBLIC HEALTH VALIDATION FAILED! INITIATING FAIL-CLOSED ROLLBACK..."
    sudo systemctl stop omniseller-web || true
    
    # Remove incomplete / failed release directory to reclaim disk space
    if [ -n "${TARGET_RELEASE_DIR}" ] && [ "${TARGET_RELEASE_DIR}" != "${BASELINE_RELEASE_DIR}" ]; then
        rm -rf "${TARGET_RELEASE_DIR}" 2>/dev/null || true
    fi

    echo "Restoring active symlink atomically to pre-built baseline release ${BASELINE_RELEASE_DIR}..."
    atomic_symlink_switch "${BASELINE_RELEASE_DIR}"
    
    echo "Restarting systemd service 'omniseller-web' on baseline release..."
    sudo systemctl restart omniseller-web
    
    sleep 3
    if sudo systemctl is-active --quiet omniseller-web; then
        echo "🟢 System successfully rolled back to baseline release ${BASELINE_SHA}."
    else
        echo "🔴 CRITICAL: Systemd service failed to restart during rollback. Manual intervention required."
    fi
    exit 1
}

# --- STEP 2: ISOLATED RELEASE BUILDING (0s Downtime) ---
TARGET_RELEASE_DIR="${RELEASES_DIR}/${TARGET_SHA}"
MANIFEST_FILE="${TARGET_RELEASE_DIR}/MANIFEST.json"

echo -e "\n[Step 2/7] Preparing isolated release directory at ${TARGET_RELEASE_DIR}..."

if [ ! -f "${MANIFEST_FILE}" ]; then
    mkdir -p "${TARGET_RELEASE_DIR}"
    git -C "${WORKTREE_REPO}" archive "${TARGET_SHA}" | tar -x -C "${TARGET_RELEASE_DIR}"
    
    echo "${TARGET_SHA}" > "${TARGET_RELEASE_DIR}/REVISION"
    cd "${TARGET_RELEASE_DIR}"

    echo "Installing production dependencies & building native addons from source (Ubuntu 22.04 LTS)..."
    npm ci --build-from-source --production=false || { rollback; }

    echo "Verifying native SQLite addon loading..."
    node -e "require('./node_modules/sqlite3'); console.log('🟢 Native sqlite3 addon verified in release directory.');" || { rollback; }

    echo "Building Vite production bundle inside release directory..."
    npm run build || { rollback; }

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

# --- STEP 3: SAFE SERVICE STOP & WAL-SAFE DB BACKUP ---
echo -e "\n[Step 3/7] Stopping systemd service 'omniseller-web' & snapshotting database..."
sudo systemctl stop omniseller-web

if sudo systemctl is-active --quiet omniseller-web; then
    echo "🔴 ERROR: Failed to stop systemd service omniseller-web. Aborting release."
    exit 1
fi
echo "🟢 systemd service 'omniseller-web' is INACTIVE."

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_SUBDIR="${BACKUP_DIR}/backup_${TIMESTAMP}_${BASELINE_SHA:0:7}"
mkdir -p "${BACKUP_SUBDIR}"

if [ -f "${DB_PATH}" ]; then
    echo "Snapshotting app.db, app.db-wal, and app.db-shm to ${BACKUP_SUBDIR}..."
    cp -p "${DB_PATH}" "${BACKUP_SUBDIR}/app.db"
    [ -f "${DB_PATH}-wal" ] && cp -p "${DB_PATH}-wal" "${BACKUP_SUBDIR}/app.db-wal"
    [ -f "${DB_PATH}-shm" ] && cp -p "${DB_PATH}-shm" "${BACKUP_SUBDIR}/app.db-shm"
    
    echo "Calculating SHA-256 checksums..."
    sha256sum "${BACKUP_SUBDIR}"/app.db* > "${BACKUP_SUBDIR}/checksums.sha256"
    
    echo "Verifying SQLite database integrity on SNAPSHOT ARTIFACT..."
    node -e "
      const sqlite3 = require('${TARGET_RELEASE_DIR}/node_modules/sqlite3');
      const db = new sqlite3.Database('${BACKUP_SUBDIR}/app.db');
      db.get('PRAGMA integrity_check', (err, row) => {
        if (err || !row || row.integrity_check !== 'ok') {
          console.error('🔴 DB Snapshot Integrity Error:', err || row);
          process.exit(1);
        }
        console.log('🟢 DB Snapshot Integrity Check: ok');
        db.close();
      });
    " || { echo "🔴 DB snapshot integrity check failed"; rollback; }
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

# --- STEP 6: DUAL HEALTH & REVISION PROBE VALIDATION ---
echo -e "\n[Step 6/7] Validating Local & Public Health Endpoints & Revision Provenance..."

PORT="${PORT:-3001}"
LOCAL_STATUS="000"
LOCAL_REVISION=""

for i in {1..5}; do
    RESPONSE=$(curl -s "http://127.0.0.1:${PORT}/api/health" || echo "")
    if [ -n "${RESPONSE}" ]; then
        LOCAL_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:${PORT}/api/health" || echo "000")
        LOCAL_REVISION=$(node -e "try { console.log(JSON.parse(process.argv[1]).revision || ''); } catch(_) {}" "${RESPONSE}")
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

PUBLIC_REVISION=$(node -e "try { console.log(JSON.parse(process.argv[1]).revision || ''); } catch(_) {}" "${PUBLIC_RESPONSE}")

if [ "${PUBLIC_STATUS}" -ne 200 ] || [ "${PUBLIC_REVISION}" != "${TARGET_SHA}" ]; then
    echo "🔴 FAIL-CLOSED DEPLOYMENT ERROR: Public Cloudflare health check failed or revision mismatched."
    echo "    Expected HTTP 200 and Revision ${TARGET_SHA}, but got HTTP ${PUBLIC_STATUS} and Revision ${PUBLIC_REVISION}."
    rollback
fi

echo "🟢 Public Cloudflare health probe ${PUBLIC_DOMAIN}/api/health returned 200 OK (Revision: ${PUBLIC_REVISION})."

# Prune old releases (keep only the 2 most recent releases) to prevent ENOSPC disk exhaustion
echo "Pruning old releases from ${RELEASES_DIR}..."
find "${RELEASES_DIR}" -mindepth 1 -maxdepth 1 -type d | sort -r | tail -n +3 | while read -r old_release; do
    if [ "${old_release}" != "${TARGET_RELEASE_DIR}" ] && [ "${old_release}" != "${BASELINE_RELEASE_DIR}" ]; then
        echo "Removing obsolete release: ${old_release}"
        rm -rf "${old_release}"
    fi
done

# --- STEP 7: DEPLOYMENT SUCCESS DECLARATION ---
echo -e "\n========================================================================"
echo "  🟢 IMMUTABLE RELEASE DEPLOYMENT PASSED CLEANLY!"
echo "  Target SHA ${TARGET_SHA} is active on systemd omniseller-web."
echo "  Active Symlink: /home/etsy/omniseller-current -> ${TARGET_RELEASE_DIR}"
echo "========================================================================"
