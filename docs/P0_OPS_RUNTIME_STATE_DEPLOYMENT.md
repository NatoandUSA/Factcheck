# P0-OPS Runtime State Migration & Deploy Runbook

Purpose: move mutable OmniSeller production state outside the Git-controlled release worktree before deploying the runtime-path boundary change.

This is an operational runbook, not proof that production has already been migrated. Stop if any preflight check cannot be verified.

## Required production contract

A successful production start must have:

- `NODE_ENV=production`
- `OMNI_DB_PATH=<absolute path outside repo>`
- `OMNI_IMPORTS_DIR=<absolute path outside repo>`
- `DOTENV_PATH=<absolute path outside repo>`

The server intentionally fails startup when these are missing, relative, or lexically inside the repository worktree.

Example layout only (verify service-user ownership/permissions before using):

- state: `/var/lib/omniseller/app.db`
- mutable imports: `/var/lib/omniseller/imports/`
- secrets: `/etc/omniseller/omniseller.env`

Do not assume these paths are writable on the VPS. Confirm the actual systemd service user first.

## Preflight — no destructive Git command yet

1. Record repository, branch, exact target SHA, current VPS SHA, service unit, service user, repo root, current DB path, and current imports path.
2. Confirm the target SHA has exact-head CI evidence.
3. Confirm a maintenance window and the ability to **stop** `omniseller-web`. A SIGTERM is not sufficient if `Restart=always` immediately restarts it.
4. Verify free disk space for at least two DB copies plus imports.
5. Create the external state/config directories with least-privilege ownership and permissions.
6. Prepare rollback locations before stopping the service.

## Safe cutover order

1. **Stop the web service and verify it stays stopped.** Do not run reset/checkout/clean while the live process can still write the old DB.
2. Create a timestamped backup of the current SQLite DB. Prefer SQLite's `.backup` command or another SQLite-consistent method; verify the backup opens successfully.
3. Copy/move the production DB to the external state path and verify size/checksum/integrity before continuing.
4. Copy/move mutable imports to the external imports directory; preserve ownership and permissions.
5. Copy the production `.env` to the external secrets path with restrictive permissions. Do not print secret contents into logs.
6. Configure the service environment/drop-in with `NODE_ENV=production`, `OMNI_DB_PATH`, `OMNI_IMPORTS_DIR`, and `DOTENV_PATH`.
7. Optional backward-compatibility safety: create repo-local symlinks from the historical DB/import paths to the external state. The symlink may be deleted by a future clean/reset, but the external target remains safe. Recreate the symlink during rollback to old code if needed.
8. Only now fetch/checkout/reset to the exact reviewed code SHA. Verify `git rev-parse HEAD` equals the intended SHA.
9. Start the service. A startup failure is a BLOCK, not a reason to fall back to repo-local state.

## Post-start acceptance

Verify all of the following before calling runtime acceptance complete:

- service is active and stable after restart;
- startup logs contain no `P0_OPS_*` path-contract errors;
- process environment resolves DB/imports/config to external absolute paths;
- external DB opens and migrations are present;
- repo-local historical DB/import paths are not the canonical storage locations;
- authenticated Staff login works;
- workspace/marketplace isolation smoke passes;
- one safe upload writes into the external imports directory;
- repository HEAD matches the exact deployed SHA;
- no mutable production state was recreated as a regular file under the repo worktree.

## Rollback

If the new release fails:

1. Stop the service and keep it stopped.
2. Preserve the external DB; do **not** copy an older backup over it unless a database rollback is explicitly required and approved.
3. Roll back code to the previously accepted SHA.
4. If the old code expects `server/app.db` / `data/imports`, recreate repo-local symlinks pointing to the external state rather than moving production data back into the worktree.
5. Start the old release and run the same DB/service/auth smoke checks.

## Hard prohibitions

- Do not use `git clean -fdx`, `git reset --hard`, checkout, or release-directory replacement before production state is external and verified.
- Do not interpret `.gitignore` as a runtime-state boundary.
- Do not start production with missing P0-OPS environment variables and then manually copy data into repo-local fallback paths.
- Do not deploy a different SHA than the one reviewed/CI-verified without a new acceptance cycle.
