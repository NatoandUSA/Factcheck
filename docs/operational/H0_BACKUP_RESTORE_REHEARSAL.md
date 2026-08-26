# H0 Backup → Restore Rehearsal

Status: PREPARATION ONLY. This is a release gate design, not evidence that a rehearsal has been executed.

Owner role: GPT3 release/certification.

## Purpose

Prove that a real backup artifact can be restored into a clean isolated runtime and that the restored application can read critical state correctly before any production cutover.

This is intentionally stronger than `tests/test_backup_restore_and_migrations.cjs`, which exercises a synthetic test DB with `VACUUM INTO` + `copyFileSync` and therefore is not sufficient production restore evidence.

## Source runtime facts to verify at execution time

Do not assume documentation equals production. Verify live before rehearsal:

- service unit: `omniseller-web`;
- service user;
- active release symlink and exact `REVISION`;
- Node executable/version;
- `OMNI_DB_PATH`;
- `OMNI_IMPORTS_DIR`;
- `DOTENV_PATH`;
- SQLite journal mode and presence of `-wal` / `-shm` files;
- available disk space.

Repository templates currently expect `/home/etsy/omniseller-current` and Node v22.23.2, but these are reference values until live-verified.

## Safety constraints

- Rehearsal target must be isolated from production DB/import paths.
- Never point the rehearsal process at the production DB for writes.
- Never overwrite production DB as part of rehearsal.
- Never treat a copied file as PASS without opening it and running integrity + application smoke checks.
- Secrets must not be printed into logs.
- Database rollback remains separate from code rollback and requires explicit authorization.

## Phase 1 — Capture exact source artifact

Record:

```text
Production revision:
Certified H0 candidate SHA:
Backup timestamp UTC:
Source DB path:
Source imports path:
Backup directory:
DB file size:
DB SHA-256:
WAL present: YES/NO
SHM present: YES/NO
```

Before backup, stop or otherwise obtain a SQLite-consistent snapshot under the production runbook contract. Existing deploy logic stops `omniseller-web`, copies `app.db` plus WAL/SHM when present, records SHA-256, and checks `PRAGMA integrity_check` on the snapshot. That can create the candidate backup artifact, but rehearsal still requires the clean restore phases below.

## Phase 2 — Verify backup artifact

On the backup artifact, record:

```text
sha256sum <backup files>
PRAGMA integrity_check
PRAGMA foreign_key_check
schema_migrations rows
critical table counts (read-only)
```

Acceptance:

- checksums recorded;
- `integrity_check = ok`;
- no unexplained foreign-key violations;
- schema/version metadata is readable;
- critical tables can be queried.

Any failure = BLOCK.

## Phase 3 — Build clean isolated restore target

Create a new isolated directory not used by production, for example under a temporary/rehearsal root approved for the VPS or certification host.

The target must start empty and contain separate paths for:

```text
restore-root/
  db/
  imports/
  env/
  release/
  logs/
```

Requirements:

- no symlink to production state;
- no inherited DB file from a previous rehearsal;
- permissions compatible with the test service user;
- enough disk for restored DB + build/runtime files.

Record directory listing before restore as evidence that the target is clean.

## Phase 4 — Restore backup into clean target

Restore the exact backup artifact to the isolated DB path.

After copy/restore:

- recompute SHA-256 and compare with the source backup artifact where byte-for-byte equality is expected;
- open restored DB with SQLite/native addon;
- run `PRAGMA integrity_check`;
- run `PRAGMA foreign_key_check`;
- record schema migration state;
- verify critical scoped data exists.

Do not run destructive migrations unless the certified candidate's startup contract requires them and the migration gate explicitly allows it.

## Phase 5 — Start application against restored state

Use the exact certified release artifact/SHA, not an arbitrary checkout.

Set isolated runtime variables so the application points only to rehearsal state:

```text
NODE_ENV=production
OMNI_DB_PATH=<isolated restore DB>
OMNI_IMPORTS_DIR=<isolated restore imports>
DOTENV_PATH=<isolated rehearsal env>
PORT=<non-production port>
```

Verify before start that none of these paths resolve to production locations.

Start the application in the isolated environment.

Acceptance:

- process starts successfully;
- revision/health endpoint reports the exact certified SHA;
- no runtime-path safety errors;
- no attempt to write into the Git release tree as canonical mutable state.

## Phase 6 — Read-only application smoke

At minimum verify, using non-destructive reads:

- health/revision endpoint;
- authenticated or equivalent safe staff read flow if credentials are available for rehearsal;
- workspace/marketplace/project scoping;
- research project retrieval;
- evidence retrieval;
- one representative Product Truth/listing read path if present in restored data;
- imports directory resolution.

For H0 specifically, add a read-only audit/smoke that confirms restored legacy evidence can be evaluated without changing production or rehearsal records unexpectedly.

Record expected vs actual results.

## Phase 7 — Prove isolation and zero production impact

Before declaring PASS:

- compare production DB mtime/size/checksum before vs after rehearsal where practical;
- verify production service revision did not change because of rehearsal;
- verify rehearsal process PID/path/env used isolated state only;
- verify no rehearsal-created file exists under production state paths;
- stop and clean up the rehearsal process without deleting the backup evidence required for audit.

## PASS criteria

All must be true:

```text
Backup artifact checksum: VERIFIED
Backup SQLite integrity: PASS
Clean restore target: VERIFIED
Restored SQLite integrity: PASS
Exact candidate runtime starts: PASS
Exact revision probe: PASS
Critical read smoke: PASS
Scope/isolation smoke: PASS
Production impact: ZERO-WRITE / NO REVISION CHANGE
Evidence packet complete: YES
```

If any item is missing, verdict is `NOT EXECUTED` or `BLOCK`, never PASS.

## Evidence packet

```text
REHEARSAL VERDICT
Production revision observed:
Certified candidate SHA:
Backup artifact path:
Backup SHA-256:
Restore target path:
Node version:
Native sqlite3 load:
Integrity check:
Foreign-key check:
Schema migration state:
Health/revision result:
Critical read-smoke results:
Isolation proof:
Production zero-write proof:
Residual findings:
Verdict: PASS/BLOCK
Provenance label: GPT-LIVE-VERIFIED / USER-SSH-VERIFIED / NOT VERIFIED
```
