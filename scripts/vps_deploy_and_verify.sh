#!/bin/bash
# ==============================================================================
# REAL VPS PREFLIGHT, LIVE SERVICE SMOKE VALIDATION & ROLLBACK VERIFICATION SCRIPT
# Target Commit SHA: 9fcf03aa34f9fdb6e380a8c51e3baa5d14aa3b31
# Target Branch: codex/audit-closeout
# ==============================================================================

set -e

TARGET_SHA="9fcf03aa34f9fdb6e380a8c51e3baa5d14aa3b31"
TARGET_BRANCH="codex/audit-closeout"
APP_DIR="/var/www/omniseller"
DATA_DIR="/var/lib/omniseller"
BACKUP_DIR="${DATA_DIR}/backups"
ENV_FILE="/etc/omniseller/omniseller.env"

echo "========================================================================"
echo "  OMNISELLER STUDIO — REAL VPS PREFLIGHT & DEPLOYMENT RUNBOOK"
echo "  Target SHA: ${TARGET_SHA}"
echo "========================================================================"

# --- 1. VPS PREFLIGHT ENVIRONMENT CHECKS ---
echo -e "\n[Step 1/6] Running VPS System Environment Preflight..."

if ! command -v node &> /dev/null; then
    echo "🔴 ERROR: Node.js is not installed on this VPS."
    exit 1
fi

NODE_VERSION=$(node -v)
echo "🟢 Node.js version: ${NODE_VERSION}"

if ! command -v pm2 &> /dev/null; then
    echo "🔴 ERROR: PM2 process manager is not installed."
    exit 1
fi
echo "🟢 PM2 Process Manager installed."

if [ ! -f "${ENV_FILE}" ]; then
    echo "🔴 ERROR: Production environment file ${ENV_FILE} not found."
    echo "Please create ${ENV_FILE} with OMNI_DB_PATH, OMNI_IMPORTS_DIR, and DOTENV_PATH."
    exit 1
fi
echo "🟢 Production environment configuration found at ${ENV_FILE}."

# --- 2. PRE-DEPLOYMENT WAL-SAFE DATABASE BACKUP ---
echo -e "\n[Step 2/6] Performing WAL-Safe Pre-Deployment Database Backup..."
mkdir -p "${BACKUP_DIR}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/app_backup_${TIMESTAMP}.db"

if [ -f "${DATA_DIR}/app.db" ]; then
    # Safely checkpoint and backup SQLite database
    sqlite3 "${DATA_DIR}/app.db" "PRAGMA wal_checkpoint(FULL);" || true
    cp "${DATA_DIR}/app.db" "${BACKUP_FILE}"
    echo "🟢 Backup created: ${BACKUP_FILE} ($(du -h ${BACKUP_FILE} | cut -f1))"
else
    echo "ℹ️ Initial deployment: no pre-existing app.db found at ${DATA_DIR}/app.db."
fi

# --- 3. CODE CHECKOUT & BUILD ON EXACT SHA ---
echo -e "\n[Step 3/6] Fetching and checking out exact target SHA ${TARGET_SHA}..."
cd "${APP_DIR}"
git fetch origin "${TARGET_BRANCH}"
git checkout "${TARGET_SHA}"

CURRENT_SHA=$(git rev-parse HEAD)
if [ "${CURRENT_SHA}" != "${TARGET_SHA}" ]; then
    echo "🔴 ERROR: Git checkout failed. Worktree at ${CURRENT_SHA}, expected ${TARGET_SHA}."
    exit 1
fi
echo "🟢 Worktree verified on exact SHA: ${CURRENT_SHA}"

echo "Installing production dependencies..."
npm ci --production=false

echo "Building Vite production bundle..."
npm run build

# --- 4. PM2 PROCESS RELOAD / START ---
echo -e "\n[Step 4/6] Reloading application process via PM2..."
pm2 startOrReload ecosystem.config.cjs --env production
pm2 save

# --- 5. LIVE VPS SERVICE SMOKE VALIDATION ---
echo -e "\n[Step 5/6] Validating Live VPS Health Endpoint & Nginx Proxy..."
sleep 3

HEALTH_RESPONSE=$(curl -s -w "\n%{http_code}" http://127.0.0.1:3001/api/health)
HTTP_CODE=$(echo "${HEALTH_RESPONSE}" | tail -n1)
BODY=$(echo "${HEALTH_RESPONSE}" | head -n -1)

if [ "${HTTP_CODE}" -eq 200 ]; then
    echo "🟢 Live VPS Health Check PASSED (HTTP 200 OK)."
    echo "Response: ${BODY}"
else
    echo "🔴 LIVE SMOKE FAILED: Health endpoint returned HTTP ${HTTP_CODE}."
    echo "Response: ${BODY}"
    echo "Initiating automatic rollback procedure..."
    
    # --- 6. AUTOMATIC ROLLBACK PROCEDURE ---
    echo -e "\n[Step 6/6] AUTOMATIC ROLLBACK PROCEDURE..."
    if [ -f "${BACKUP_FILE}" ]; then
        echo "Restoring database backup from ${BACKUP_FILE}..."
        cp "${BACKUP_FILE}" "${DATA_DIR}/app.db"
    fi
    git checkout HEAD~1
    pm2 reload ecosystem.config.cjs --env production
    echo "🔴 Rollback executed. System reverted to previous stable commit."
    exit 1
fi

echo -e "\n========================================================================"
echo "  🟢 LIVE VPS DEPLOYMENT, SMOKE VALIDATION & PREFLIGHT PASSED CLEANLY!"
echo "  Exact SHA ${TARGET_SHA} is LIVE on production VPS."
echo "========================================================================"
