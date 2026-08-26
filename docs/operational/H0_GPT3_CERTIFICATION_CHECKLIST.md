# H0 GPT3 Certification Checklist

Status: PREPARATION ONLY — this file does not grant merge, deploy, migration, cutover, or marketplace publish authorization.

Owner role: GPT3 — UI/integration, exact SHA, certification, release/cutover.

Governance start point for this preparation branch: `4f7eea5aa9c5e6da24eeeb9088d02527c7ca82be`.
Production/base reference at preparation time: `5c4153bbb03ccf9e0f02b4b90781f64819b70848`.

## Entry conditions

Do not start final certification until all of these exist as exact artifacts/verdicts:

- GPT2 exact H0 candidate SHA and parent/base ancestry.
- GPT4 adversarial verdict against that exact candidate.
- Claude independent exact-diff + test-oracle verdict against that exact candidate.
- GPT1 final authority verdict against that exact candidate and canonical authority contract.
- Open authority/security findings are closed or explicitly BLOCK release.

A report from another AI is not GPT3 verification. Every item below must be verified live or labeled `NOT VERIFIED` / `NOT EXECUTED`.

## Exact-artifact lock

Record before running certification:

```text
Candidate SHA:
Parent SHA:
Base/production SHA:
Branch:
Bundle path (if any):
Bundle SHA-256 (if any):
Changed files:
Worktree status:
GPT4 verdict artifact:
Claude verdict artifact:
GPT1 authority verdict artifact:
```

Stop if SHA/branch/worktree differs from the handoff.

## Runtime/toolchain gate

Repository contract requires Node `>=22.0.0 <23.0.0`. Canonical CI runs `22.x`, builds native addons from source, verifies `sqlite3`, builds Vite, then runs `npm test`.

Required evidence on the exact H0 candidate:

```bash
node --version
npm --version
npm ci --build-from-source
node -e "require('./node_modules/sqlite3'); console.log('sqlite3 native addon OK')"
npm run build
npm test
```

Acceptance:

- Node major version is exactly 22.
- dependency install exits 0;
- native sqlite3 addon loads successfully;
- production bundle build exits 0;
- canonical suite exits 0;
- no test is reclassified as PASS when it was not executed.

## H0 targeted gate

Before full-suite PASS can be used for release, targeted H0 evidence must show the final contract is enforced at the exact candidate.

Required categories:

- non-qualifying research/manual inputs fail closed;
- unknown/missing/malformed kind fails closed;
- forged authority metadata on generic evidence path cannot mint authority;
- legacy/direct accepted rows cannot bypass the shared research guard required by the final GPT1 ruling;
- wrong tenant/workspace/marketplace/project fails closed and zero-write;
- rejected acceptance creates no acceptance event;
- provider-controlled server-derived positive control succeeds;
- server-derived hash/scope/version binding is verified where required by the authority contract.

Record exact test names and outputs; do not substitute a prose summary.

## Exact-SHA CI gate

Required:

- GitHub Actions workflow is associated with the exact candidate SHA;
- workflow conclusion is `success`;
- Node 22 job succeeds;
- native SQLite verification succeeds;
- production build succeeds;
- canonical suite succeeds.

If any byte changes after CI success, this gate resets.

## Migration/state gate

Before cutover:

- determine whether H0 changes schema/migrations: `YES / NO / NOT VERIFIED`;
- if `YES`, require fresh migration evidence and owner-approved DB handling;
- verify production mutable state is outside the release worktree;
- verify repo does not track runtime DB/import state;
- verify current DB path/import path/env path from the actual production service/runtime, not from documentation alone.

No database remediation is authorized by this checklist.

## Backup → restore rehearsal gate

`tests/test_backup_restore_and_migrations.cjs` is not sufficient evidence by itself. It creates a test DB, uses `VACUUM INTO`, copies a file back, and reopens it; it does not prove the production backup artifact can restore into a clean isolated runtime.

Final gate requires the procedure in `H0_BACKUP_RESTORE_REHEARSAL.md` to complete with evidence from a clean isolated restore target.

## Production read-only audit gate

Run only after the H0 candidate and authority evaluator are certified.

Required output:

- exact production revision observed;
- exact certified evaluator/candidate revision used for audit;
- count/list of invalid accepted evidence by scoped identity;
- downstream projects affected;
- zero production writes during audit;
- no automatic quarantine/remediation unless separately authorized.

## Cutover gate

Use `H0_CUTOVER_ROLLBACK_PACKET.md`.

Cutover remains BLOCKED until:

- exact candidate PASS from GPT4, Claude, GPT1, GPT3;
- exact-SHA CI PASS;
- restore rehearsal PASS;
- production preflight PASS;
- owner grants cutover authorization.

## Certification verdict format

```text
GPT3 CERTIFICATION VERDICT
Candidate SHA:
Parent SHA:
Base/production SHA:
Node 22: PASS/BLOCK/NOT EXECUTED
Native SQLite: PASS/BLOCK/NOT EXECUTED
Production build: PASS/BLOCK/NOT EXECUTED
H0 targeted tests: PASS/BLOCK/NOT EXECUTED
Canonical suite: PASS/BLOCK/NOT EXECUTED
Exact-SHA CI: PASS/BLOCK/NOT EXECUTED
Migration evidence: PASS/BLOCK/NOT APPLICABLE/NOT EXECUTED
Backup→restore rehearsal: PASS/BLOCK/NOT EXECUTED
Production read-only audit: PASS/BLOCK/NOT EXECUTED
GPT4 verdict: PASS/BLOCK/NOT VERIFIED
Claude verdict: PASS/BLOCK/NOT VERIFIED
GPT1 authority verdict: PASS/BLOCK/NOT VERIFIED
Residual findings:
Release-ready: YES/NO
Cutover authorization: GRANTED/NOT GRANTED
Marketplace publish authorization: GRANTED/NOT GRANTED
```

`Release-ready = YES` never implies cutover or marketplace publish authorization.