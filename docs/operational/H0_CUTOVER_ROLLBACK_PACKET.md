# H0 Cutover / Rollback Packet

Status: PREPARATION ONLY. This document does not authorize deploy, migration, cutover, or marketplace publish.

Owner role: GPT3 release/certification.

## 1. Release identity

Complete immediately before cutover:

```text
Candidate SHA:
Parent SHA:
Base/production SHA:
Branch:
Release directory:
REVISION file:
Bundle SHA-256 (if used):
GitHub exact-SHA CI run:
GPT4 verdict artifact:
Claude verdict artifact:
GPT1 authority verdict artifact:
GPT3 certification verdict artifact:
```

Stop if any artifact references a different SHA.

## 2. Required authorizations

Track separately:

```text
Push: GRANTED / NOT GRANTED
Merge: GRANTED / NOT GRANTED
Migration evidence: PASS / NOT APPLICABLE / BLOCK
Cutover: GRANTED / NOT GRANTED
Marketplace publish: GRANTED / NOT GRANTED
```

`Release-ready` never implies cutover or publish permission.

## 3. Production preflight

Live-verify and record:

- current active production SHA from `/api/health` revision and active release `REVISION`;
- service state for `omniseller-web`;
- service user and Node version;
- actual DB/import/env paths;
- free disk space;
- current DB size and integrity status;
- current backup destination and permissions;
- rollback release directory exists or can be recreated from the exact baseline SHA;
- no runtime state is tracked in Git release paths;
- no open P0/P1 release finding.

Repository reference topology currently uses:

```text
worktree: /home/etsy/omniseller
releases: /home/etsy/omniseller-releases
current:  /home/etsy/omniseller-current
state:    /home/etsy/omniseller-state
service:  omniseller-web
```

Treat these as reference until live-verified.

## 4. Candidate build gate

The existing immutable deployment script builds an isolated release directory for the target SHA, runs:

```bash
npm ci --build-from-source --production=false
node -e "require('./node_modules/sqlite3')"
npm run build
```

Before cutover, additionally require the exact candidate's canonical test evidence and exact-SHA CI PASS from the certification checklist.

## 5. Backup gate

Before code switch:

- stop `omniseller-web` and prove it remains inactive;
- create a SQLite-consistent backup artifact under the approved backup directory;
- include WAL/SHM where applicable under the chosen snapshot method;
- record SHA-256;
- run SQLite integrity verification on the backup artifact;
- complete the clean-instance backup→restore rehearsal defined in `H0_BACKUP_RESTORE_REHEARSAL.md` before the real cutover window.

Do not overwrite the production DB during code rollback.

## 6. Cutover order

Only after explicit cutover authorization:

1. Re-verify target candidate SHA and production baseline SHA.
2. Re-verify all required review/certification verdicts apply to the same candidate SHA.
3. Re-verify backup artifact and rollback release are available.
4. Stop service and verify inactive.
5. Create the final pre-cutover DB backup/checksum if required by the runbook.
6. Atomically switch `/home/etsy/omniseller-current` to the exact target release directory.
7. Restart `omniseller-web`.
8. Verify service becomes active.
9. Verify local `/api/health` returns HTTP 200 and `revision == Candidate SHA`.
10. Verify public `/api/health` returns HTTP 200 and `revision == Candidate SHA`.
11. Run H0 post-cutover read-only/safe smoke.
12. Keep marketplace publish gate closed unless separately authorized.

Any revision mismatch = immediate BLOCK and rollback.

## 7. H0 post-cutover smoke

At minimum:

- service health stable across repeated probes;
- exact revision equality locally and publicly;
- no startup/migration/path-contract error in recent logs;
- workspace/marketplace/project scoped reads still work;
- generic/manual evidence cannot mint qualifying authority;
- malformed/unknown authority-bearing input remains fail-closed;
- safe positive server-controlled evidence path works if testable without production mutation, otherwise mark `NOT EXECUTED` and retain pre-cutover evidence;
- no unexpected acceptance event/write occurs during rejected-path smoke;
- critical staff UI loads against the correct project/marketplace after hard reload.

Production write tests must not be improvised during cutover. Use pre-approved safe fixtures or read-only probes.

## 8. Rollback triggers

Rollback code immediately if any of these occurs after switch:

- service fails to start or repeatedly restarts;
- local/public health is non-200 after retry budget;
- reported revision differs from candidate SHA;
- native SQLite/runtime load failure;
- critical scoped reads fail;
- H0 authority behavior regresses fail-open;
- unexpected migration/state corruption signal;
- high-severity production finding with no safe forward fix in the cutover window.

## 9. Code rollback procedure

Existing deployment design treats code rollback and DB rollback separately.

Code rollback:

1. stop `omniseller-web`;
2. atomically repoint `/home/etsy/omniseller-current` to the exact baseline release directory;
3. restart service;
4. verify service active;
5. verify local/public revision equals baseline SHA;
6. run baseline health/scoped-read smoke;
7. record rollback evidence.

Do not restore an older DB automatically just because code rolled back.

## 10. Database rollback decision

Default: **NO DB ROLLBACK**.

A DB rollback requires all of:

- demonstrated DB incompatibility/corruption or separately approved remediation need;
- exact backup artifact identified and integrity-verified;
- authority/owner approval;
- explicit handling of writes that occurred after the backup;
- separate restore plan and post-restore verification.

If H0 contains no schema migration, state that explicitly and keep DB rollback closed unless corruption is independently observed.

## 11. Cutover evidence packet

```text
CUTOVER RECORD
Candidate SHA:
Baseline SHA:
Cutover authorization by:
Start UTC:
End UTC:
Backup artifact:
Backup SHA-256:
Restore rehearsal artifact/verdict:
Active symlink target before:
Active symlink target after:
Node version:
Service status:
Local health/revision:
Public health/revision:
H0 smoke results:
Migration status:
Unexpected writes/errors:
Rollback required: YES/NO
Rollback SHA (if used):
Post-rollback health/revision (if used):
Residual findings:
Marketplace publish authorization: GRANTED/NOT GRANTED
Final operational verdict: PASS/BLOCK
```

## 12. Stop rule

If exact SHA, backup integrity, restore rehearsal, review verdicts, or owner cutover authorization cannot be verified, stop before the symlink switch. Do not convert missing evidence into a warning.