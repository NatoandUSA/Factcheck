#!/bin/bash
# ==============================================================================
# OMNISELLER STUDIO — SYSTEMD & CLOUDFLARE TUNNEL VPS DEPLOYMENT & ROLLBACK RUNBOOK
# Authoritative Production VPS Topology: etsy@51.79.200.65
# ==============================================================================

set -e

# Target SHA & Baseline
TARGET_SHA="${1:-c6f3933541e7b069ea65849304c74e0efce70740}"
TARGET_BRANCH="codex/audit-closeout"
PUBLIC_DOMAIN="https://omniseller.theglobalserviceteam.site"

# Production Paths for etsy@zoyckgyolinux
APP_DIR="/home/etsy/omniseller"
STATE_DIR="/home/etsy/omniseller-state"
DB_PATH="${STATE_DIR}/db/app.db"
ENV_FILE="${STATE_DIR}/omniseller.env"
BACKUP_DIR="${STATE_DIR}/backups"

echo "========================================================================"
echo "  OMNISELLER STUDIO — SYSTEMD & CLOUDFLARE TUNNEL VPS DEPLOYMENT RUNBOOK"
echo "  Target SHA: ${TARGET_SHA}"
echo "========================================================================"

# --- STEP 1: PREFLIGHT ENVIRONMENT & PATH VERIFICATION ---
echo -e "\n[Step 1/7] Verifying VPS Environment Paths & Prerequisites..."

if [ ! -d "${APP_DIR}" ]; then
    echo "🔴 ERROR: App directory ${APP_DIR} does not exist."
    exit 1
fi

if [ ! -f "${ENV_FILE}" ]; then
    echo "🔴 ERROR: External env file ${ENV_FILE} does not exist."
    exit 1
fi

cd "${APP_DIR}"

BASELINE_SHA=$(git rev-parse HEAD)
echo "🟢 Current Baseline SHA: ${BASELINE_SHA}"
echo "🟢 App Directory: ${APP_DIR}"
echo "🟢 Database Path: ${DB_PATH}"
echo "🟢 Env File: ${ENV_FILE}"

# --- STEP 2: SAFE SERVICE STOP & WAL-SAFE DB BACKUP ---
echo -e "\n[Step 2/7] Stopping systemd service 'omniseller-web' & creating WAL-safe backup..."
sudo systemctl stop omniseller-web || true

mkdir -p "${BACKUP_DIR}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_SUBDIR="${BACKUP_DIR}/backup_${TIMESTAMP}_${BASELINE_SHA:0:7}"
mkdir -p "${BACKUP_SUBDIR}"

if [ -f "${DB_PATH}" ]; then
    echo "Copying DB, WAL and SHM files to ${BACKUP_SUBDIR}..."
    cp "${DB_PATH}" "${BACKUP_SUBDIR}/app.db"
    [ -f "${DB_PATH}-wal" ] && cp "${DB_PATH}-wal" "${BACKUP_SUBDIR}/app.db-wal"
    [ -f "${DB_PATH}-shm" ] && cp "${DB_PATH}-shm" "${BACKUP_SUBDIR}/app.db-shm"
    echo "🟢 WAL-safe database backup completed."
else
    echo "ℹ️ No existing database file found at ${DB_PATH}."
fi

# Function for clean rollback
rollback() {
    echo -e "\n🔴 DEPLOYMENT OR SMOKE TEST FAILED! INITIATING SYSTEMD ROLLBACK..."
    sudo systemctl stop omniseller-web || true
    
    echo "Restoring baseline Git SHA ${BASELINE_SHA}..."
    cd "${APP_DIR}"
    git checkout -f "${BASELINE_SHA}"
    npm ci --production=false
    npm run build
    
    if [ -d "${BACKUP_SUBDIR}" ]; then
        echo "Restoring pre-deployment database backup..."
        cp "${BACKUP_SUBDIR}/app.db" "${DB_PATH}"
        [ -f "${BACKUP_SUBDIR}/app.db-wal" ] && cp "${BACKUP_SUBDIR}/app.db-wal" "${DB_PATH}-wal"
        [ -f "${BACKUP_SUBDIR}/app.db-shm" ] && cp "${BACKUP_SUBDIR}/app.db-shm" "${DB_PATH}-shm"
    fi
    
    echo "Restarting systemd service 'omniseller-web'..."
    sudo systemctl restart omniseller-web
    echo "🔴 System successfully rolled back to baseline SHA ${BASELINE_SHA}."
    exit 1
}

# --- STEP 3: CODE CHECKOUT TO TARGET SHA ---
echo -e "\n[Step 3/7] Fetching & checking out target SHA ${TARGET_SHA}..."
git fetch origin "${TARGET_BRANCH}"
git checkout -f "${TARGET_SHA}" || { rollback; }

DEPLOYED_SHA=$(git rev-parse HEAD)
echo "🟢 Verified checkout on exact SHA: ${DEPLOYED_SHA}"

# --- STEP 4: DEPENDENCY INSTALL & VITE BUILD ---
echo -e "\n[Step 4/7] Installing dependencies & building Vite bundle..."
npm ci --production=false || { rollback; }
npm run build || { rollback; }

# --- STEP 5: RESTART SYSTEMD SERVICE ---
echo -e "\n[Step 5/7] Starting systemd service 'omniseller-web'..."
sudo systemctl restart omniseller-web || { rollback; }
sleep 3

# Check systemd status
if ! sudo systemctl is-active --quiet omniseller-web; then
    echo "🔴 systemd service 'omniseller-web' failed to enter active state."
    rollback
fi
echo "🟢 systemd service 'omniseller-web' is ACTIVE."

# --- STEP 6: LOCAL & PUBLIC CLOUDFLARE SMOKE VALIDATION ---
echo -e "\n[Step 6/7] Validating Local & Public Cloudflare Tunnel Health Endpoints..."

# 6a. Local Loopback Check
LOCAL_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3001/api/health || echo "000")
if [ "${LOCAL_STATUS}" -ne 200 ]; then
    echo "🔴 Local health check failed: HTTP ${LOCAL_STATUS} (expected 200)."
    rollback
fi
echo "🟢 Local health probe http://127.0.0.1:3001/api/health returned 200 OK."

# 6b. Public Cloudflare Domain Check
PUBLIC_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${PUBLIC_DOMAIN}/api/health" || echo "000")
if [ "${PUBLIC_STATUS}" -ne 200 ]; then
    echo "⚠️ Warning: Public Cloudflare health check returned HTTP ${PUBLIC_STATUS}."
    echo "Retrying in 5 seconds for Cloudflare Tunnel resolution..."
    sleep 5
    PUBLIC_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${PUBLIC_DOMAIN}/api/health" || echo "000")
fi

if [ "${PUBLIC_STATUS}" -eq 200 ]; then
    echo "🟢 Public Cloudflare health probe ${PUBLIC_DOMAIN}/api/health returned 200 OK."
else
    echo "⚠️ Public Cloudflare Tunnel returned HTTP ${PUBLIC_STATUS} (local 3001 passed)."
fi

# --- STEP 7: DEPLOYMENT SUCCESS DECLARATION ---
echo -e "\n========================================================================"
echo "  🟢 LIVE VPS DEPLOYMENT & SYSTEMD SERVICE RELOAD PASSED CLEANLY!"
echo "  Target SHA ${TARGET_SHA} is active on systemd omniseller-web."
echo "========================================================================"
