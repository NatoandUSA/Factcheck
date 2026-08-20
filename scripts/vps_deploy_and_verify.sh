#!/bin/bash
# ==============================================================================
# OMNISELLER STUDIO — IMMUTABLE SYMLINK RELEASE & ROLLBACK RUNBOOK
# Authoritative Target Topology: etsy@51.79.200.65 (Ubuntu 22.04 LTS)
# ==============================================================================

set -e

TARGET_BRANCH="codex/audit-closeout"
PUBLIC_DOMAIN="https://omniseller.theglobalserviceteam.site"

# Production Base Paths
BASE_DIR="/home/etsy"
WORKTREE_REPO="${BASE_DIR}/omniseller"
RELEASES_DIR="${BASE_DIR}/omniseller-releases"
CURRENT_SYMLINK="${BASE_DIR}/omniseller-current"
STATE_DIR="${BASE_DIR}/omniseller-state"

DB_PATH="${STATE_DIR}/db/app.db"
ENV_FILE="${STATE_DIR}/env/omniseller.env"
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

if [ ! -f "${ENV_FILE}" ]; then
    echo "🔴 ERROR: External production env file ${ENV_FILE} does not exist."
    exit 1
fi

# Capture Baseline SHA BEFORE any fetch or checkout
if [ -L "${CURRENT_SYMLINK}" ] && [ -d "${CURRENT_SYMLINK}" ]; then
    BASELINE_SHA=$(git -C "${CURRENT_SYMLINK}" rev-parse HEAD 2>/dev/null || git -C "${WORKTREE_REPO}" rev-parse HEAD)
else
    BASELINE_SHA=$(git -C "${WORKTREE_REPO}" rev-parse HEAD)
fi

echo "🟢 Active Baseline SHA: ${BASELINE_SHA}"

# Fetch remote tracking branch first
echo "Fetching origin/${TARGET_BRANCH}..."
git -C "${WORKTREE_REPO}" fetch origin "${TARGET_BRANCH}"

TARGET_SHA="${1:-$(git -C "${WORKTREE_REPO}" rev-parse origin/${TARGET_BRANCH})}"
echo "🟢 Target Release SHA: ${TARGET_SHA}"

if [ -z "${TARGET_SHA}" ] || [ ${#TARGET_SHA} -ne 40 ]; then
    echo "🔴 ERROR: Target SHA must be a valid 40-character git commit hash."
    exit 1
fi

# Ensure baseline release directory exists for instant rollback
BASELINE_RELEASE_DIR="${RELEASES_DIR}/${BASELINE_SHA}"
if [ ! -d "${BASELINE_RELEASE_DIR}" ]; then
    echo "Preparing baseline release directory ${BASELINE_RELEASE_DIR}..."
    mkdir -p "${BASELINE_RELEASE_DIR}"
    cp -rp "${WORKTREE_REPO}/." "${BASELINE_RELEASE_DIR}/"
fi

# Function for Fail-Closed Rollback
rollback() {
    echo -e "\n🔴 DEPLOYMENT OR HEALTH VALIDATION FAILED! INITIATING FAIL-CLOSED ROLLBACK..."
    sudo systemctl stop omniseller-web || true
    
    echo "Restoring active symlink to baseline release ${BASELINE_RELEASE_DIR}..."
    ln -sfn "${BASELINE_RELEASE_DIR}" "${CURRENT_SYMLINK}"
    
    if [ -d "${BACKUP_SUBDIR}" ]; then
        echo "Restoring WAL-safe database backup from ${BACKUP_SUBDIR}..."
        cp -p "${BACKUP_SUBDIR}/app.db" "${DB_PATH}" 2>/dev/null || true
        [ -f "${BACKUP_SUBDIR}/app.db-wal" ] && cp -p "${BACKUP_SUBDIR}/app.db-wal" "${DB_PATH}-wal" 2>/dev/null || true
        [ -f "${BACKUP_SUBDIR}/app.db-shm" ] && cp -p "${BACKUP_SUBDIR}/app.db-shm" "${DB_PATH}-shm" 2>/dev/null || true
    fi
    
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
echo -e "\n[Step 2/7] Preparing isolated release directory at ${TARGET_RELEASE_DIR}..."

if [ ! -d "${TARGET_RELEASE_DIR}" ]; then
    mkdir -p "${TARGET_RELEASE_DIR}"
    git -C "${WORKTREE_REPO}" archive "${TARGET_SHA}" | tar -x -C "${TARGET_RELEASE_DIR}"
fi

cd "${TARGET_RELEASE_DIR}"

echo "Installing production dependencies & building native addons from source (Ubuntu 22.04 LTS)..."
npm ci --build-from-source --production=false || { rollback; }

echo "Verifying native SQLite addon loading..."
node -e "require('./node_modules/sqlite3'); console.log('🟢 Native sqlite3 addon verified in release directory.');" || { rollback; }

echo "Building Vite production bundle inside release directory..."
npm run build || { rollback; }

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
    
    echo "Verifying SQLite database integrity..."
    node -e "
      const sqlite3 = require('${TARGET_RELEASE_DIR}/node_modules/sqlite3');
      const db = new sqlite3.Database('${DB_PATH}');
      db.get('PRAGMA integrity_check', (err, row) => {
        if (err || !row || row.integrity_check !== 'ok') {
          console.error('🔴 DB Integrity Error:', err || row);
          process.exit(1);
        }
        console.log('🟢 DB Integrity Check: ok');
        db.close();
      });
    " || { echo "🔴 DB integrity check failed"; rollback; }
fi

# --- STEP 4: ATOMIC SYMLINK SWITCH ---
echo -e "\n[Step 4/7] Updating active symlink /home/etsy/omniseller-current -> ${TARGET_RELEASE_DIR}..."
ln -sfn "${TARGET_RELEASE_DIR}" "${CURRENT_SYMLINK}"
echo "🟢 Symlink updated atomically."

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
        if [ "${LOCAL_STATUS}" -eq 200 ] && [ -n "${LOCAL_REVISION}" ]; then
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
echo "🟢 Local health probe http://127.0.0.1:${PORT}/api/health returned 200 OK (Revision: ${LOCAL_REVISION})."

# Check revision match
if [[ "${TARGET_SHA}" != "${LOCAL_REVISION}"* ]] && [[ "${LOCAL_REVISION}" != "${TARGET_SHA}"* ]]; then
    echo "🔴 Revision Mismatch: Target SHA is ${TARGET_SHA}, but local server reported revision ${LOCAL_REVISION}."
    rollback
fi
echo "🟢 Local Revision Provenance Verified: matches Target SHA ${TARGET_SHA}."

# 6b. Public Cloudflare Domain Check
PUBLIC_RESPONSE=$(curl -s "${PUBLIC_DOMAIN}/api/health" || echo "")
PUBLIC_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${PUBLIC_DOMAIN}/api/health" || echo "000")

if [ "${PUBLIC_STATUS}" -ne 200 ]; then
    echo "⚠️ Public Cloudflare health check returned HTTP ${PUBLIC_STATUS}. Retrying in 5s..."
    sleep 5
    PUBLIC_RESPONSE=$(curl -s "${PUBLIC_DOMAIN}/api/health" || echo "")
    PUBLIC_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${PUBLIC_DOMAIN}/api/health" || echo "000")
fi

if [ "${PUBLIC_STATUS}" -ne 200 ]; then
    echo "🔴 Public Cloudflare health check failed: HTTP ${PUBLIC_STATUS} (expected 200)."
    rollback
fi

PUBLIC_REVISION=$(node -e "try { console.log(JSON.parse(process.argv[1]).revision || ''); } catch(_) {}" "${PUBLIC_RESPONSE}")
echo "🟢 Public Cloudflare health probe ${PUBLIC_DOMAIN}/api/health returned 200 OK (Revision: ${PUBLIC_REVISION})."

if [[ "${TARGET_SHA}" != "${PUBLIC_REVISION}"* ]] && [[ "${PUBLIC_REVISION}" != "${TARGET_SHA}"* ]]; then
    echo "🔴 Public Revision Mismatch: Target SHA is ${TARGET_SHA}, but public endpoint reported ${PUBLIC_REVISION}."
    rollback
fi
echo "🟢 Public Revision Provenance Verified: matches Target SHA ${TARGET_SHA}."

# --- STEP 7: DEPLOYMENT SUCCESS DECLARATION ---
echo -e "\n========================================================================"
echo "  🟢 IMMUTABLE RELEASE DEPLOYMENT PASSED CLEANLY!"
echo "  Target SHA ${TARGET_SHA} is active on systemd omniseller-web."
echo "  Active Symlink: /home/etsy/omniseller-current -> ${TARGET_RELEASE_DIR}"
echo "========================================================================"
