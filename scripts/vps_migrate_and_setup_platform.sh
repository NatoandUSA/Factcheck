#!/bin/bash
# ==============================================================================
# OMNISELLER STUDIO — SAFE SYSTEMD RELEASE PLATFORM MIGRATION INSTALLER
# Authoritative Baseline SHA: e6df541c4a5d7fbc9d6e5bbca18b48d442039b96
# Target VPS Host: etsy@51.79.200.65 (Ubuntu 22.04 LTS)
# ==============================================================================

set -Eeuo pipefail

BASE_DIR="/home/etsy"
WORKTREE_REPO="${BASE_DIR}/omniseller"
RELEASES_DIR="${BASE_DIR}/omniseller-releases"
CURRENT_SYMLINK="${BASE_DIR}/omniseller-current"
STATE_DIR="${BASE_DIR}/omniseller-state"

SYSTEMD_UNIT_PATH="/etc/systemd/system/omniseller-web.service"
SYSTEMD_BAK_PATH="/etc/systemd/system/omniseller-web.service.bak"

BASELINE_SHA="${1:-e6df541c4a5d7fbc9d6e5bbca18b48d442039b96}"

echo "========================================================================"
echo "  OMNISELLER STUDIO — SYSTEMD RELEASE PLATFORM MIGRATION INSTALLER"
echo "  Explicit Baseline SHA: ${BASELINE_SHA}"
echo "========================================================================"

# Step 1: Preflight Environment & Dynamic Unit Inspection
echo -e "\n[Step 1/5] Inspecting Existing Systemd Unit & Environment Contract..."

if [ ! -d "${WORKTREE_REPO}" ]; then
    echo "🔴 ERROR: Repository worktree ${WORKTREE_REPO} does not exist."
    exit 1
fi

# Validate Baseline Commit Object exists
git -C "${WORKTREE_REPO}" cat-file -e "${BASELINE_SHA}^{commit}" || {
    echo "🔴 ERROR: Commit object ${BASELINE_SHA} does not exist in git history."
    exit 1
}

mkdir -p "${RELEASES_DIR}" "${STATE_DIR}/db" "${STATE_DIR}/imports" "${STATE_DIR}/backups"

# Dynamically extract EnvironmentFile from active systemd unit & drop-ins
DETECTED_ENV=""
if [ -f "${SYSTEMD_UNIT_PATH}" ]; then
    DETECTED_ENV=$(grep -E "^EnvironmentFile=" "${SYSTEMD_UNIT_PATH}" 2>/dev/null | cut -d'=' -f2 | tr -d '\r' || echo "")
fi

if [ -z "${DETECTED_ENV}" ] || [ ! -f "${DETECTED_ENV}" ]; then
    if [ -f "${STATE_DIR}/omniseller.env" ]; then
        DETECTED_ENV="${STATE_DIR}/omniseller.env"
    elif [ -f "${STATE_DIR}/env/omniseller.env" ]; then
        DETECTED_ENV="${STATE_DIR}/env/omniseller.env"
    elif [ -f "${WORKTREE_REPO}/.env" ]; then
        DETECTED_ENV="${WORKTREE_REPO}/.env"
    fi
fi

if [ -z "${DETECTED_ENV}" ] || [ ! -f "${DETECTED_ENV}" ]; then
    echo "🔴 ERROR: Could not resolve a valid non-empty EnvironmentFile."
    exit 1
fi

echo "🟢 Preserved Active Environment File: ${DETECTED_ENV}"

# Idempotency Guard for Unit Backup (never overwrite initial .bak)
if [ -f "${SYSTEMD_UNIT_PATH}" ] && [ ! -f "${SYSTEMD_BAK_PATH}" ]; then
    echo "Backing up original systemd unit to ${SYSTEMD_BAK_PATH} (Idempotent Guard Active)..."
    sudo cp -p "${SYSTEMD_UNIT_PATH}" "${SYSTEMD_BAK_PATH}"
fi

# Step 2: Build Baseline Release Directory from Explicit BASELINE_SHA
BASELINE_RELEASE_DIR="${RELEASES_DIR}/${BASELINE_SHA}"
echo -e "\n[Step 2/5] Building Baseline Release Directory at ${BASELINE_RELEASE_DIR}..."

MANIFEST_FILE="${BASELINE_RELEASE_DIR}/MANIFEST.json"

if [ ! -f "${MANIFEST_FILE}" ]; then
    mkdir -p "${BASELINE_RELEASE_DIR}"
    git -C "${WORKTREE_REPO}" archive "${BASELINE_SHA}" | tar -x -C "${BASELINE_RELEASE_DIR}"
    
    echo "${BASELINE_SHA}" > "${BASELINE_RELEASE_DIR}/REVISION"
    cd "${BASELINE_RELEASE_DIR}"

    echo "Installing production dependencies & building native addons from source..."
    npm ci --build-from-source --production=false

    echo "Verifying native sqlite3 addon loading..."
    node -e "require('./node_modules/sqlite3'); console.log('🟢 Native sqlite3 verified in baseline release.');"

    echo "Building Vite production bundle..."
    npm run build

    # Write Atomic Completion Manifest
    cat << EOF > "${MANIFEST_FILE}"
{
  "sha": "${BASELINE_SHA}",
  "built_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "status": "COMPLETE"
}
EOF
    echo "🟢 Atomic completion manifest written."
fi

# Step 3: Atomic Symlink Initialization
echo -e "\n[Step 3/5] Initializing active symlink /home/etsy/omniseller-current..."

SYMLINK_TMP="${BASE_DIR}/omniseller-current-tmp"
ln -snf "${BASELINE_RELEASE_DIR}" "${SYMLINK_TMP}"
mv -Tf "${SYMLINK_TMP}" "${CURRENT_SYMLINK}"
echo "🟢 Active Symlink: ${CURRENT_SYMLINK} -> ${BASELINE_RELEASE_DIR}"

# Step 4: Systemd Service Unit Migration
echo -e "\n[Step 4/5] Updating Systemd service unit omniseller-web.service..."

sudo cat << EOF > /tmp/omniseller-web.service.new
[Unit]
Description=OmniSeller Studio backend (Amazon/Etsy listing workflow)
After=network-online.target
Wants=network-online.target

[Service]
User=etsy
WorkingDirectory=/home/etsy/omniseller-current/server
EnvironmentFile=${DETECTED_ENV}
ExecStart=/home/etsy/.nvm/versions/node/v22.23.2/bin/node /home/etsy/omniseller-current/server/server.js
Restart=always
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

sudo cp /tmp/omniseller-web.service.new "${SYSTEMD_UNIT_PATH}"
sudo chown root:root "${SYSTEMD_UNIT_PATH}"
sudo chmod 644 "${SYSTEMD_UNIT_PATH}"
rm -f /tmp/omniseller-web.service.new

if command -v systemd-analyze >/dev/null 2>&1; then
    systemd-analyze verify "${SYSTEMD_UNIT_PATH}" || echo "⚠️ systemd-analyze warning"
fi

echo "Executing systemctl daemon-reload & restarting baseline service..."
sudo systemctl daemon-reload
sudo systemctl restart omniseller-web

sleep 3

# Step 5: Fail-Closed Baseline Health Probe & Strict Revision Verification
echo -e "\n[Step 5/5] Validating Baseline Service Status & Local Health Probe..."

if ! sudo systemctl is-active --quiet omniseller-web; then
    echo "🔴 ERROR: omniseller-web failed to enter active state during migration. Restoring original systemd unit..."
    [ -f "${SYSTEMD_BAK_PATH}" ] && sudo cp -p "${SYSTEMD_BAK_PATH}" "${SYSTEMD_UNIT_PATH}"
    sudo systemctl daemon-reload
    sudo systemctl restart omniseller-web || true
    exit 1
fi

PORT="${PORT:-3001}"
LOCAL_STATUS="000"
LOCAL_REVISION=""

for i in {1..5}; do
    RESPONSE=$(curl -s "http://127.0.0.1:${PORT}/api/health" || echo "")
    if [ -n "${RESPONSE}" ]; then
        LOCAL_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:${PORT}/api/health" || echo "000")
        LOCAL_REVISION=$(node -e "try { console.log(JSON.parse(process.argv[1]).revision || ''); } catch(_) {}" "${RESPONSE}")
        if [ "${LOCAL_STATUS}" -eq 200 ] && [ "${LOCAL_REVISION}" = "${BASELINE_SHA}" ]; then
            break
        fi
    fi
    echo "Waiting for baseline server startup on port ${PORT}... (attempt ${i}/5)"
    sleep 2
done

if [ "${LOCAL_STATUS}" -ne 200 ] || [ "${LOCAL_REVISION}" != "${BASELINE_SHA}" ]; then
    echo "🔴 ERROR: Baseline health/revision check failed (HTTP ${LOCAL_STATUS}, Revision ${LOCAL_REVISION}). Restoring original unit..."
    [ -f "${SYSTEMD_BAK_PATH}" ] && sudo cp -p "${SYSTEMD_BAK_PATH}" "${SYSTEMD_UNIT_PATH}"
    sudo systemctl daemon-reload
    sudo systemctl restart omniseller-web || true
    exit 1
fi

echo "🟢 systemd service 'omniseller-web' is ACTIVE."
echo "🟢 Local Health Probe HTTP 200 OK (Strict Revision Verified: ${LOCAL_REVISION})."

echo -e "\n========================================================================"
echo "  🟢 ONE-TIME SYSTEMD PLATFORM MIGRATION PASSED CLEANLY!"
echo "  Active Symlink: ${CURRENT_SYMLINK} -> ${BASELINE_RELEASE_DIR}"
echo "  Preserved Env File: ${DETECTED_ENV}"
echo "  Verified Baseline Revision: ${BASELINE_SHA}"
echo "========================================================================"
