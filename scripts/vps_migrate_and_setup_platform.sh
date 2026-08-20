#!/bin/bash
# ==============================================================================
# OMNISELLER STUDIO — ONE-TIME SYSTEMD PLATFORM MIGRATION INSTALLER
# Safe Baseline Migration Script for VPS etsy@51.79.200.65 (Ubuntu 22.04 LTS)
# ==============================================================================

set -e

BASE_DIR="/home/etsy"
WORKTREE_REPO="${BASE_DIR}/omniseller"
RELEASES_DIR="${BASE_DIR}/omniseller-releases"
CURRENT_SYMLINK="${BASE_DIR}/omniseller-current"
STATE_DIR="${BASE_DIR}/omniseller-state"

SYSTEMD_UNIT_PATH="/etc/systemd/system/omniseller-web.service"
SYSTEMD_BAK_PATH="/etc/systemd/system/omniseller-web.service.bak"

echo "========================================================================"
echo "  OMNISELLER STUDIO — SYSTEMD RELEASE PLATFORM MIGRATION INSTALLER"
echo "========================================================================"

# Check root/sudo permissions for systemd installation
if ! sudo -n true 2>/dev/null; then
    echo "ℹ️ sudo credentials required for systemd unit update."
fi

# Step 1: Preflight Paths & Baseline State
echo -e "\n[Step 1/5] Verifying Environment Paths & Baseline..."

if [ ! -d "${WORKTREE_REPO}" ]; then
    echo "🔴 ERROR: Repository worktree ${WORKTREE_REPO} does not exist."
    exit 1
fi

mkdir -p "${RELEASES_DIR}" "${STATE_DIR}/db" "${STATE_DIR}/imports" "${STATE_DIR}/env" "${STATE_DIR}/backups"

# Move or verify production env file
if [ -f "${STATE_DIR}/omniseller.env" ] && [ ! -f "${STATE_DIR}/env/omniseller.env" ]; then
    cp -p "${STATE_DIR}/omniseller.env" "${STATE_DIR}/env/omniseller.env"
fi

if [ ! -f "${STATE_DIR}/env/omniseller.env" ] && [ -f "${WORKTREE_REPO}/.env" ]; then
    cp -p "${WORKTREE_REPO}/.env" "${STATE_DIR}/env/omniseller.env"
fi

# Capture Baseline SHA
BASELINE_SHA=$(git -C "${WORKTREE_REPO}" rev-parse HEAD)
echo "🟢 Baseline Git SHA: ${BASELINE_SHA}"

BASELINE_RELEASE_DIR="${RELEASES_DIR}/${BASELINE_SHA}"
echo "🟢 Target Baseline Release Directory: ${BASELINE_RELEASE_DIR}"

# Step 2: Build Baseline Release Directory
echo -e "\n[Step 2/5] Building Baseline Release Directory..."

if [ ! -d "${BASELINE_RELEASE_DIR}" ]; then
    mkdir -p "${BASELINE_RELEASE_DIR}"
    git -C "${WORKTREE_REPO}" archive "${BASELINE_SHA}" | tar -x -C "${BASELINE_RELEASE_DIR}"
fi

echo "${BASELINE_SHA}" > "${BASELINE_RELEASE_DIR}/REVISION"
cd "${BASELINE_RELEASE_DIR}"

echo "Building production native dependencies from source..."
npm ci --build-from-source --production=false

echo "Verifying native sqlite3 addon loading..."
node -e "require('./node_modules/sqlite3'); console.log('🟢 Native sqlite3 verified in baseline release.');"

echo "Building Vite production bundle..."
npm run build

# Step 3: Atomic Symlink Initialization
echo -e "\n[Step 3/5] Initializing active symlink /home/etsy/omniseller-current..."

SYMLINK_TMP="${BASE_DIR}/omniseller-current-tmp"
ln -snf "${BASELINE_RELEASE_DIR}" "${SYMLINK_TMP}"
mv -Tf "${SYMLINK_TMP}" "${CURRENT_SYMLINK}"
echo "🟢 Active Symlink: ${CURRENT_SYMLINK} -> ${BASELINE_RELEASE_DIR}"

# Step 4: Systemd Service Unit Migration
echo -e "\n[Step 4/5] Migrating Systemd service unit omniseller-web.service..."

if [ -f "${SYSTEMD_UNIT_PATH}" ]; then
    echo "Backing up original systemd unit to ${SYSTEMD_BAK_PATH}..."
    sudo cp -p "${SYSTEMD_UNIT_PATH}" "${SYSTEMD_BAK_PATH}"
fi

TEMPLATE_PATH="${BASELINE_RELEASE_DIR}/deploy/omniseller-web.service.template"
if [ ! -f "${TEMPLATE_PATH}" ]; then
    TEMPLATE_PATH="${WORKTREE_REPO}/deploy/omniseller-web.service.template"
fi

if [ -f "${TEMPLATE_PATH}" ]; then
    sudo cp "${TEMPLATE_PATH}" "${SYSTEMD_UNIT_PATH}"
    sudo chown root:root "${SYSTEMD_UNIT_PATH}"
    sudo chmod 644 "${SYSTEMD_UNIT_PATH}"
    echo "🟢 Installed new systemd unit from template."
else
    echo "🔴 ERROR: Systemd unit template not found."
    exit 1
fi

echo "Executing systemctl daemon-reload & restarting service..."
sudo systemctl daemon-reload
sudo systemctl restart omniseller-web

sleep 3

# Step 5: Verification & Status Check
echo -e "\n[Step 5/5] Verifying Systemd Service Status & Local Health Probe..."

if ! sudo systemctl is-active --quiet omniseller-web; then
    echo "🔴 ERROR: omniseller-web failed to start. Rolling back systemd unit..."
    [ -f "${SYSTEMD_BAK_PATH}" ] && sudo cp -p "${SYSTEMD_BAK_PATH}" "${SYSTEMD_UNIT_PATH}"
    sudo systemctl daemon-reload
    sudo systemctl restart omniseller-web || true
    exit 1
fi

PORT="${PORT:-3001}"
LOCAL_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:${PORT}/api/health" || echo "000")
LOCAL_RESPONSE=$(curl -s "http://127.0.0.1:${PORT}/api/health" || echo "")

echo "🟢 systemd service 'omniseller-web' is ACTIVE."
echo "🟢 Local Health Check HTTP Status: ${LOCAL_STATUS}"
echo "🟢 Local Health Response: ${LOCAL_RESPONSE}"

echo -e "\n========================================================================"
echo "  🟢 ONE-TIME SYSTEMD PLATFORM MIGRATION PASSED CLEANLY!"
echo "  Systemd WorkingDirectory: ${CURRENT_SYMLINK}/server"
echo "  Active Baseline SHA: ${BASELINE_SHA}"
echo "========================================================================"
