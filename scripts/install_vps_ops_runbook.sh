#!/bin/bash
# Installs the reviewed operational helper outside application source/releases.
set -Eeuo pipefail

RUNBOOK_GIT_SHA="${1:-}"
BASELINE_SHA="${2:-}"
SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
BASE_DIR="/home/etsy"
OPS_ROOT="${BASE_DIR}/omniseller-ops"
DESTINATION="${OPS_ROOT}/${RUNBOOK_GIT_SHA}"
BASELINE_NODE_MODULES="${BASE_DIR}/omniseller-releases/${BASELINE_SHA}/node_modules"
BASELINE_SQLITE3_BINDING="${BASELINE_NODE_MODULES}/sqlite3/build/Release/node_sqlite3.node"
NODE22_BIN="/home/etsy/.nvm/versions/node/v22.23.2/bin"

[[ "$RUNBOOK_GIT_SHA" =~ ^[0-9a-f]{40}$ ]] || { echo "full runbook Git SHA required" >&2; exit 1; }
[[ "$BASELINE_SHA" =~ ^[0-9a-f]{40}$ ]] || { echo "full baseline SHA required" >&2; exit 1; }
[[ "$SOURCE_DIR" != "$BASE_DIR/omniseller"/* && "$SOURCE_DIR" != "$BASE_DIR/omniseller-releases"/* ]] || {
  echo "installer source must be outside repository/releases" >&2; exit 1;
}
[[ "$(id -u)" = 0 ]] || { echo "run with sudo" >&2; exit 1; }
mkdir -p "$OPS_ROOT"
[[ ! -e "$DESTINATION" ]] || { echo "immutable ops destination already exists" >&2; exit 1; }

stage="$(mktemp -d "${OPS_ROOT}/.stage.XXXXXX")"
cleanup() { rm -rf "$stage"; }
trap cleanup EXIT
install -m 0555 "$SOURCE_DIR/vps_deploy_and_verify.sh" "$stage/vps_deploy_and_verify.sh"
install -m 0555 "$SOURCE_DIR/vps_backup_rehearsal.cjs" "$stage/vps_backup_rehearsal.cjs"
install -d -m 0755 "$stage/server/database"
install -m 0444 "$SOURCE_DIR/../server/database/migrations.js" "$stage/server/database/migrations.js"
install -m 0444 "$SOURCE_DIR/../server/package.json" "$stage/server/package.json"
install -m 0444 "$SOURCE_DIR/../package.json" "$stage/package.json"
install -m 0444 "$SOURCE_DIR/../package-lock.json" "$stage/package-lock.json"
printf '%s\n' "$RUNBOOK_GIT_SHA" > "$stage/RUNBOOK_GIT_SHA"
chmod 0444 "$stage/RUNBOOK_GIT_SHA"
export PATH="${NODE22_BIN}:$PATH"
[[ "$(node -p "process.versions.node.split('.')[0]")" = 22 ]] || { echo "Node 22 required" >&2; exit 1; }
# The read-only helper deliberately uses sqlite3, currently declared in the
# repository's devDependencies. Keep the complete lockfile dependency set in
# this root-owned operational directory rather than relying on target release.
(cd "$stage" && npm ci --include=dev --workspaces)
[[ -r "$BASELINE_SQLITE3_BINDING" ]] || { echo "baseline Node 22 sqlite3 binding unavailable" >&2; exit 1; }
install -D -m 0555 "$BASELINE_SQLITE3_BINDING" "$stage/node_modules/sqlite3/build/Release/node_sqlite3.node"
NODE_PATH="$stage/node_modules" node -e "require.resolve('sqlite3')" >/dev/null
NODE_PATH="$stage/node_modules" node -e "require('sqlite3')" >/dev/null
(cd "$stage" && {
  printf '# RUNBOOK_GIT_SHA=%s\n' "$RUNBOOK_GIT_SHA"
  sha256sum vps_deploy_and_verify.sh vps_backup_rehearsal.cjs server/package.json server/database/migrations.js package.json package-lock.json RUNBOOK_GIT_SHA node_modules/sqlite3/build/Release/node_sqlite3.node
} > ops-manifest.sha256)
chmod 0444 "$stage/ops-manifest.sha256"
chown -R root:root "$stage"
find "$stage" -type d -exec chmod 0755 {} +
find "$stage" -type f -exec chmod 0444 {} +
chmod 0555 "$stage/vps_deploy_and_verify.sh" "$stage/vps_backup_rehearsal.cjs"
mv "$stage" "$DESTINATION"
trap - EXIT
echo "OPS_RUNBOOK_INSTALL=PASS"
echo "RUNBOOK_GIT_SHA=$RUNBOOK_GIT_SHA"
echo "OPS_DIR=$DESTINATION"
