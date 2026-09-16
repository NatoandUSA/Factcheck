# OMNISELLER PR #42 — POST-DEPLOY HARDENING MASTER

Date: 2026-09-15
Canonical baseline: `d6642c2502071ba885da01b02f39a6f0ebc8a605`
Implementation branch: `codex/pr42-production-hardening`
Writer authority: GPT3/Codex only
Review agents: reproduce, challenge and propose; do not mutate canonical code

## 1. Executive verdict

PR #42 is deployed and the public health endpoint reports the exact production SHA, but that proves service health, not end-to-end business readiness.

Current release posture:

| Scope | Verdict |
|---|---|
| Public service and exact revision | `PROVEN HEALTHY` |
| Universal Product Truth + research + MKL + draft | `SUPERVISED UAT ALLOWED` |
| Manager approval / Owner authorization / exact export | `BLOCKED — POLICY DRAFT_ONLY` |
| Marketplace publishing | `NOT AUTHORIZED / NOT IMPLEMENTED` |
| VPS symlink, systemd, runtime env, journal and production DDL | `AGENT-REPORTED — NEEDS FROZEN VPS RECEIPT` |
| Production readiness | `NO` |

## 2. Reconciled findings from GPT1 and Claude

| Finding | Decision | Canonical treatment |
|---|---|---|
| Production exact SHA and public health | `ACCEPT — PROVEN` | Preserve exact-revision health gate. |
| Claude: production SHA absent locally | `SUPERSEDED` | It described the stale dirty clone, not the GitHub/production object. |
| Claude A-05: no state migration mechanism | `REJECT FOR d6642c` | Exact production code contains `projectStateMigration.js`, registry authority and executable migration/lineage tests. Production DDL still needs a read-only receipt. |
| Legacy orphan state and dead edge | `ACCEPT AS HISTORICAL DEFECT` | Do not repair the rejected graph. Keep legacy writes retired under R4.3 and test historical migration/read compatibility separately. |
| R4.3 flag optional in production | `ACCEPT — P0 CONFIGURATION GAP` | Production startup and deploy now require exact `OMNI_R43_SINGLE_PATH=1`; active process environment is verified after restart. |
| `DRAFT_ONLY` disclosed too late | `ACCEPT — P1 UX` | Server returns policy capability at commerce-state; UI displays it at the top and disables approval/authorization/export. |
| Release pruning sorted SHA lexically | `ACCEPT — P1 OPS` | Retention is based on validated manifest time and explicitly preserves target and baseline. Invalid manifests are retained for review. |
| Rollback wording overstates safety | `ACCEPT — P1 OPS` | All messages/receipts state code-symlink-only rollback. Migration authority changes require a two-direction compatibility receipt before deploy. |
| Runtime evidence not frozen/time-bounded | `ACCEPT — P1 OPS` | Deploy writes a secret-free JSON receipt plus SHA-256 and bounds journal errors from deploy start. |
| Canonical test count mixes authorities | `ACCEPT — P2 GOVERNANCE` | Companion authority manifest classifies active R4.3, historical compatibility, migration, security and release/harness suites. Counts are dynamic. |
| Node 22 production/CI receipt | `ACCEPT FOR REPORTED RUN; RE-RUN REQUIRED FOR THIS PATCH` | Local host is Node 24 and cannot certify release. Merge gate remains clean Node 22 CI. |

## 3. Canonical operating model

```text
Product Truth revisions ───────────────┐
                                       ├─> safe compose ─> NEEDS_QA draft
Research imports -> snapshot -> MKL ───┘                         │
                                                                 ├─ policy DRAFT_ONLY -> STOP
                                                                 └─ approval-eligible policy
                                                                    -> Manager exact review
                                                                    -> Seller request
                                                                    -> Owner authorization
                                                                    -> exact export
                                                                    -> manual submission
                                                                    -> operator report
```

Research never creates product facts. Competitor, Data Dive, Helium 10, Etsy, EverBee, HeyEtsy, Aura and YTrends observations retain source/provenance and may rank or allocate keywords only. Product claims and image prompts may use asserted Product Truth only. Unknown stays unknown.

## 4. Active versus historical surfaces

Active staff UI:

- `src/App.jsx` mounts `SinglePathMarketplaceWorkspace` for Amazon and Etsy.
- `SinglePathMarketplaceWorkspace` mounts `CanonicalCommerceWorkflow`.
- Canonical writes use immutable Product Truth, research, workflow artifacts, intelligence, listing revisions and canonical review/handoff stores.

Historical compatibility:

- The legacy state vocabulary and legacy composer routes remain readable/testable for migration and recovery.
- In R4.3 production, legacy mutation routes must return `410 LEGACY_WRITE_ROUTE_RETIRED`.
- Historical tests are not evidence that staff should use the historical workflow.
- Do not repair, extend or expose the old `EVIDENCE_INTAKE -> RESEARCH_ACCEPTED -> DNA_ACCEPTED -> MKL_FROZEN` path.

Test authority is declared in `tests/canonical_test_authority.json`; the executable inventory remains `tests/canonical_test_inventory.json`.

## 5. Deployment and rollback contract

Pre-cutover requirements:

1. Exact 40-character baseline and target commits resolve locally.
2. Node major is 22 and production state paths are external to the release tree.
3. The external environment file contains exactly one `OMNI_R43_SINGLE_PATH=1` assignment.
4. Only a real schema-authority fingerprint change requires an exact baseline/target technical receipt proving:
   - forward migration;
   - baseline read after forward migration;
   - restore from the immutable backup.
5. After merge, a separate GitHub Owner authorization must bind the exact baseline SHA, merged `main` target SHA, both fingerprints and technical-evidence SHA-256. Local file ownership and a pre-merge marker are not authorization evidence.
6. Target build and native SQLite load pass before stopping the service.
7. WAL-safe backup integrity and checksums pass before cutover.

The supported systemd process and the external environment file must both pin `NODE_ENV=production` and `OMNI_R43_SINGLE_PATH=1`. The former PM2 entry point has been removed; the old PM2/Nginx guide is a non-executable tombstone.

Post-cutover requirements:

1. systemd is active;
2. the active process environment contains `OMNI_R43_SINGLE_PATH=1`;
3. local and public health both return HTTP 200 with exact target SHA;
4. retention deletes only complete, validated release directories outside the keep set;
5. a time-bounded, secret-free deployment receipt is written under production state and hashed.

Rollback is **code symlink only**. Database restore is separate, migration-aware and Owner-approved. No report may shorten that statement to “rollback proven” without the matching migration compatibility evidence.

## 6. Repository hygiene rules

- Canonical work happens only in the clean dedicated worktree based on exact production SHA.
- The dirty root `D:\Claude\Factcheck` is quarantined as user/agent evidence; do not reset, clean, apply donor patches or delete files there.
- Agent A v1/v2 patches and `.new` files are donor evidence only. They are not canonical implementation inputs unless a specific finding is re-adjudicated.
- Do not copy old test counts into runbooks. Use `SUITE_RESULT` and `TEST_AUTHORITY_COUNTS` from the exact run.
- Do not use review documents as executable instructions. The current request, approved R4.3 rulings and canonical code/tests govern.

## 7. Required independent review instructions

Every reviewer must return one row per finding with:

`ID | severity | exact file:line or runtime artifact | PROVEN/INFERRED/UNTESTED | reproduction | expected | actual | minimal remediation | regression test | verdict`

Review assignments:

- GPT1: verify governance lineage, R4.3 startup fail-closed behavior, policy-capability semantics and that no claim exceeds evidence.
- Claude: reproduce runtime-policy, migration-receipt and retention negative cases from a clean checkout; verify prior A-05 statement is withdrawn for exact `d6642c`.
- GPT2: audit DB migration/rollback compatibility and production DDL receipt; no code edits.
- GPT4: adversarial auth/IDOR/CSRF/SSRF plus attempts to call every legacy mutation route with production flag enabled; no code edits.
- Gravity: normal-browser UAT for one new Amazon and one new Etsy project, measuring clicks/time and recording confusing Product Truth fields; stop at saved `NEEDS_QA` under `DRAFT_ONLY`.
- Release reviewer: clean Node 22 install, build, full dynamic suite, artifact SHA, deploy-script syntax and receipt-schema verification.

Reviewers must explicitly challenge:

1. Can production start without the R4.3 flag by any supported entry point?
2. Can a stale `MANAGER_APPROVED` row bypass the UI/API policy boundary?
3. Can retention delete target, baseline, an incomplete release or a directory outside `releases`?
4. Can a migration-changing release deploy without exact two-direction evidence?
5. Does the receipt omit secrets and bind exact process/runtime/revision/time bounds?
6. Does any active UI/import call a historical composer or state transition?
7. Can research/competitor text become Product Truth or image-prompt fact without assertion evidence?

Agents may not merge, deploy, clean the dirty root, mutate production data or certify their own proposed patch.

## 8. Remaining release gates

- Run the full suite and build on Node 22 for the exact candidate SHA.
- Independent review of this patch must close all P0/P1 findings.
- Before deploying, add `OMNI_R43_SINGLE_PATH=1` to the real external production environment file.
- When the migration gate fires, add the exact reviewed PR number as `OMNI_OWNER_APPROVAL_PR_NUMBER`; the PR must contain the generated authorization marker from GitHub user `NatoandUSA`.
- Obtain a frozen VPS receipt from the updated deploy run.
- Run read-only production DDL/state-lineage verification.
- Run supervised draft-only browser UAT. Do not test approval/export as a success path until an approval-eligible policy contract is separately ratified.

Until these gates pass, this branch is a hardening candidate, not a production-ready release.

## 9. Predecessor implementation receipt — `172bc625`

Environment: Windows, Node `v24.18.0` (unsupported by package engine; audit only).

| Check | Result |
|---|---|
| Production runtime policy unit test | `PASS` |
| Release retention unit/adversarial test | `PASS` |
| Migration compatibility receipt validator | `PASS` |
| Test authority manifest | `PASS` |
| VPS shell syntax + static deployment contracts | `PASS` |
| R4.3 single-path HTTP regression | `18/18 PASS` |
| Canonical commerce UI regression | `39/39 PASS` |
| Canonical research HTTP regression | `79/79 PASS` |
| Vite production build | `PASS`, 1,827 modules |
| Full canonical inventory | `99/100 PASS`, `0 unexecuted`, `0 harness errors` |

The sole full-suite failure is `test_runner_accounting.cjs`: its Windows child-process sentinel survives under Node 24. This repository explicitly supports Node 22 only. The failure is recorded and not weakened or hidden. This receipt belongs to predecessor `172bc625`; it does not certify the successor remediation.

## 10. Claude review of `172bc625` and canonical disposition

| ID | Severity | Decision | Successor remediation |
|---|---|---|---|
| C-01 | P0 | `ACCEPT — PROVEN` | Pin and verify `NODE_ENV=production` together with `OMNI_R43_SINGLE_PATH=1` in environment preflight, systemd template, platform installer and live `/proc/PID/environ`. |
| C-02 | P1 | `ACCEPT — PROVEN` | Remove `ecosystem.config.cjs`; replace the former PM2 guide with a non-executable tombstone. |
| C-03 | P1 | `ACCEPT — PROVEN` | Replace the three-file allowlist with a deterministic fingerprint that discovers every DDL/schema-authority JavaScript file, including inline DDL in `server/server.js`. |
| C-04 | P1 | `ACCEPT — PROVEN` | Receipt schema v2 binds exact baseline/target schema fingerprints to the SHA-256 of a real, bounded, regular non-symlink evidence file; verifier checks timestamps, three executed checks, DB checksums, row counts and independent file ownership. |
| C-05 | P1 | `ACCEPT — PROVEN` | Retire the entire legacy GET export route under R4.3 before row lookup; canonical submission/export continues through the policy-gated route. |
| C-06 | P2 | `ACCEPT — PROVEN` | Treat manifest `built_at` more than 24 hours in the future as untrusted and retain it for manual review. |
| C-07 | P2 | `ACCEPT — PROVEN` | Classify the authority-manifest test explicitly as `HARNESS_RELEASE_OPS`. |
| A-05 code claim | — | `WITHDRAWN` | Preserve project-state registry migration; production DDL remains a read-only runtime verification requirement. |

Additional canonical finding: `scripts/vps_migrate_and_setup_platform.sh` was another unit generator with the same C-01 root cause and a worktree-local `.env` fallback. It now enforces the external state environment and pins both production controls.

Focused successor checks pass: runtime policy, retention, schema fingerprint, evidence-bound migration receipt, test authority, both VPS shell scripts, platform contract, production smoke preflight, R4.3 single path (`19/19`), canonical UI (`39/39`) and canonical research HTTP (`79/79`). Vite build passes with 1,827 modules.

The successor canonical inventory contains 101 suites. The unsupported local Node 24 run reports `100/101 PASS`, `0 unexecuted`, `0 harness errors`; the only failure remains the already-isolated Windows child-process sentinel in `test_runner_accounting.cjs`. Clean Node 22 full-suite/build evidence remains mandatory on the exact successor commit.

## 11. Independent review of `0bce21d6` and second successor disposition

The exact remote artifact and GitHub Actions run `34960594551` were independently checked by GPT1. The run is a manual review receipt, not the eventual PR merge gate: exact head SHA `0bce21d60ddf3fb4ebc6ccf4d527e4b28bfa7e0a`, Node 22 build PASS and `101/101` canonical suites PASS.

| ID | Severity | Decision | Second successor remediation |
|---|---|---|---|
| D-01 | P1 | `ACCEPT — PROVEN` | Fingerprint every `.js`, `.cjs`, `.mjs`, `.sql` and `.json` file across the release tree except generated/vendor directories; include the fingerprinter and receipt verifier themselves. Baseline runs its own comparator, target independently scans baseline, and comparator drift forces the gate. |
| D-02 | P1 | `ACCEPT — PROVEN` | Remove `approvedBy`/UID ownership from the technical receipt. Verify a separate GitHub Owner review/comment from `NatoandUSA` containing an exact authorization digest bound to the commit pair, fingerprint pair and evidence hash. The verifier fetches GitHub directly without a deploy-host write token. |
| D-03 | P2 | `ACCEPT — PROVEN` | Require non-empty counts containing `research_projects` and `listings`, a changed forward DB hash, and evidence completed within seven days with five-minute future skew tolerance. |
| D-04 | P2 | `ACCEPT — PROVEN` | Pin `*.sh` and `deploy/*.template` to LF in `.gitattributes`; assert raw committed bytes contain zero CR before `bash -n`, without normalization. |
| D-05 | P3 | `ACCEPT — PROVEN` | Publish the receipt using atomic hard-link no-clobber semantics instead of overwriting `rename`; the hash sidecar is also no-clobber. |
| D-06 | P3 | `ACCEPT — GOVERNANCE NOTE` | Preserve the explicit default authority but continue migrating tests to deliberate categories when touched. |

Additional defense-in-depth accepted from the review: legacy writes are default-deny. Historical compatibility execution must explicitly set `OMNI_R43_ALLOW_LEGACY_WRITES=1`; R4.3 still wins, and production startup rejects that override. The deployment receipt now embeds backup integrity status, every backup file size/hash and the checksum-manifest SHA-256.

Second-successor focused checks pass for schema adversarial coverage, technical receipt negative cases, GitHub Owner authorization, runtime policy, raw LF enforcement, shell syntax, no-clobber receipt publishing and R4.3 Single-Path (`19/19`). The local unsupported Node 24 inventory is now 102 suites and reports `101/102 PASS`; only the pre-existing Windows process-tree sentinel fails. Exact Node 22 CI on the new frozen SHA remains required before merge eligibility.

Second-successor reviewers must reproduce only the changed control surface: whole-tree fingerprint blind spots and comparator drift, technical receipt empty/no-op/stale cases, forged GitHub identity/digest/commit cases, CRLF rejection, duplicate receipt refusal, default-deny without environment configuration and backup receipt completeness. Do not reopen already accepted C-01–C-07 without new executable counter-evidence.

## 12. GPT1/Claude review of `55cf91d2` and deploy-deadlock correction

GPT1 proved a P0 interaction that module-level adversarial coverage did not detect: the whole-tree digest changed for every release, comparator absence forced the migration branch, and the technical receipt correctly rejected a no-op database hash. The result was an impossible deploy for a control-only release. Claude independently confirmed the over-trigger as E-06 and found E-07, an unguarded failure window after the service stops.

Canonical disposition:

| ID | Decision | Correction |
|---|---|---|
| GPT1 deploy deadlock | `ACCEPT — P0 PROVEN` | Split schema authority, release-control integrity and comparator identity. Only schema change requires migration rehearsal. Comparator-only change requires exact Owner authorization and must not fabricate a DB migration. |
| E-07 backup failure window | `ACCEPT — P1 PROVEN` | Arm inherited `ERR` rollback immediately before service stop, disable it inside rollback, and explicitly guard backup directory creation, primary DB copy and checksum creation. |
| E-03 authorization revocation | `ACCEPT — P2 PROVEN` | Use the Owner's latest timestamped review and reject an explicit digest-bound revocation marker. |
| E-04 GitHub verification | `SUPERSEDED BY V3` | V2 bound the PR head to the target, which deadlocks when GitHub creates a distinct merge/squash commit on `main`. V3 requires a merged PR, exact `merge_commit_sha`, base `main`, and a post-merge Owner comment. |
| E-05 local CRLF | `ACCEPT — WORKTREE HYGIENE` | Renormalize tracked shell/template paths; never weaken raw-byte LF assertions. |
| E-01/E-02 extension/symlink | `ACCEPT — DEFENSE IN DEPTH` | Release-control digest covers every regular file and committed symlink without an extension allowlist. Schema dependencies are recursively resolved regardless of extension; schema-authority symlinks are rejected. |

The schema-authority manifest seeds `server/database/migrations.js` and `server/projectStateRegistry.js`, recursively includes their relative dependencies, and hashes only the marked bootstrap-schema region of `server/server.js`. Any additional DDL elsewhere in `server/server.js` fails closed. UI, test and route-only edits change `releaseControlFingerprint` but not `schemaAuthorityFingerprint`; actual migration/bootstrap/dependency edits change the schema fingerprint. `release_gate_policy.cjs` makes this decision executable and independently tested.

Owner authorization schema v3 binds the baseline/target commits, both schema fingerprints, both comparator fingerprints, the target release-control fingerprint and the technical-evidence hash. It is required for every release and can only be issued after GitHub has created the exact merged commit on `main`. When schema is unchanged, the release-control fingerprint is the evidence binding; when schema changes, the verified migration evidence SHA replaces it.

Required final-delta review: reproduce UI/test-only no-migration behavior, actual DDL requiring rehearsal, comparator-only Owner review, latest-review/revocation behavior, PR lineage/pagination/timeout, schema symlink rejection, and E-07 rollback under an unwritable backup destination. Production read-only DDL and stale-row receipts remain blocking evidence.

The third-successor canonical inventory contains 103 suites. Focused controls and the Vite build pass locally; the unsupported Node 24/Windows run reports `102/103 PASS`, with only the previously isolated process-tree sentinel failing. The exact successor must still pass the Node 22 PR event before this section becomes certifying evidence.

## 13. Independent review of `6c4a20a2`, production evidence and final P2 hardening

GPT1 and Claude independently accepted the three-fingerprint correction and proved that the deployment deadlock and E-07 backup window are closed. Node 22 PR run `34980514149` and exact-head run `34981023771` both completed successfully with `103/103`, build PASS. Production remained on `d6642c2502071ba885da01b02f39a6f0ebc8a605` while this review occurred.

The private production read-only receipt was captured through the configured administrative SSH port with SQLite `OPEN_READONLY` and `PRAGMA query_only=1`. It proves the project-state registry DDL and migration ledger entry are present and the aggregate of legacy listings with no head revision in `MANAGER_APPROVED` or `PUBLISH_READY` is empty. Receipt SHA-256: `62de306586862f85e5737774fe9c9085debde54bbc015be36aa9a393a1eebbd0`. The receipt remains outside the public repository because it contains production topology and full DDL.

Final review disposition:

| ID | Decision | Canonical response |
|---|---|---|
| GPT1 dynamic dependency | `ACCEPT — P2 PROVEN` | Reject non-literal `require()`/`import()` in schema authority. Intentional dynamic dependencies must be explicit manifest entries. |
| F-01 unclassified DDL | `ACCEPT — P2 PROVEN` | Declare the complete `server/database` tree as schema authority and scan declared runtime roots for DDL outside the closure; test fixtures remain outside runtime scan roots. |
| F-02 rollback self-abort | `ACCEPT — P2 PROVEN` | Make baseline symlink restoration and service restart best-effort so rollback cannot abort before restart/critical reporting. |
| F-03 comment revocation | `ACCEPT — P2 PROVEN` | An Owner comment is valid only when timestamped after the latest Owner `CHANGES_REQUESTED` review. |
| F-04 pagination origin | `ACCEPT — P3 PROVEN` | Follow pagination only on the exact `https://api.github.com` origin. |
| F-05 service account/layout | `ACCEPT — P3 DEFERRED` | Do not mix a systemd identity/topology migration into this control hotfix. The public origin/IP is absent; service-account abstraction requires a separately rehearsed operations change. |

Required final-successor delta review: attack runtime-root DDL classification, non-literal schema loads, rollback failure inside the rollback function, comment-then-change-request ordering, and cross-origin pagination. No Owner marker may be created until that exact successor is frozen and independently accepted.

The final-successor inventory contains 104 suites, including an executable rollback fault-injection test. The unsupported local Node 24/Windows run reports `103/104 PASS`; only the previously isolated process-tree sentinel fails. Exact-head Node 22 `104/104` and build evidence remain mandatory.

## 14. Independent review of `21eecf6d` and rollback-evidence correction

Claude executed 47 adversarial cases plus seven fault injections and accepted F-01 through F-04 and the dynamic-dependency guard. Two additional P2 findings were accepted: production-host scripts were outside runtime DDL classification, and rollback could print a false baseline-success line after symlink restoration failed post-cutover.

Canonical response:

| ID | Decision | Correction |
|---|---|---|
| F-prime-01 scripts DDL gap | `ACCEPT — P2 PROVEN` | Add `scripts` to runtime schema scan roots and regress a DDL-bearing production script as unclassified authority. |
| F-prime-02 false rollback success | `ACCEPT — P2 PROVEN` | Track symlink restoration, resolve the actual active target, and emit success only when the symlink equals the baseline and the service is active. Fault cases must end with CRITICAL and no success claim. |
| F-prime-03 fixture over-trigger | `ACCEPT — P3 PROVEN` | Exclude non-DDL database fixtures from the schema digest while preserving runtime DDL scanning over those files. |
| F-prime-04 blanket symlink policy | `ACCEPT — P3 DOCUMENTED` | Preserve fail-closed behavior and declare `FORBID` explicitly in the schema-authority manifest. |

Production evidence correction: the current registry contains **10 states**, not nine. `PRE_H0_NINE_STATE` is the historical lineage that omits `PRODUCT_TRUTH_VERIFIED`; it is not the current expected schema. The private receipt DDL contains the exact current 10-state set exported by `projectStateRegistry.js`, records migration `2026-09-02_project_state_registry`, and reports zero stale legacy approval/publish rows. A byte-identical receipt copy is available under the private connected `reports` workspace for independent review; it must not be committed to the public repository.

Final review must attack the exact successor only: DDL under `scripts`, excluded fixture files containing DDL, post-cutover symlink-restore failure, false success suppression, actual active-target reporting, and manifest symlink-policy enforcement. Pre-merge deployment authorization remains prohibited; the V3 marker is issued only for the exact merged `main` commit after review and merge.

## 15. Whole-control-plane self-audit after final independent review

GPT1 and Claude independently accepted the `754f798e` direction and verified the private production receipt. The canonical writer then audited failure classes across the full release control plane rather than limiting remediation to their last findings.

| ID | Severity | Proven failure class | Systemic correction |
|---|---:|---|---|
| G-01 evidence leakage | P2 | `reports/` was a tracked public-tree location while private receipts and agent probes were stored there locally. | Ignore the entire root, remove the tracked debug probe, and add a canonical test that rejects any tracked `reports/` path. Private evidence remains local and recoverable. |
| S-01 extension blind spot | P1 | Runtime DDL discovery skipped shell, Python and extensionless files; it also missed `CREATE VIEW`, virtual tables and unique indexes. | Content-scan every regular file in all runtime roots, independent of extension; reject NUL/binary and oversized files fail-closed; broaden SQLite schema verbs; retain explicit authority closure. |
| S-02 destructive rollback ordering | P1 | Rollback deleted the failed target before baseline symlink and service recovery were proven. A symlink failure could leave the service pointing at deleted code. | Restore and resolve baseline symlink, restart, verify local health reports the exact baseline SHA, then and only then delete a validated target directory. Otherwise retain target and emit CRITICAL. |
| S-03 head/merge authorization mismatch | P0 | Deploy resolves `origin/main`, while V2 required `pull_request.head.sha == targetSha`. A normal merge commit such as PR #42 makes both conditions impossible. | Authorization V3 binds `pull_request.merge_commit_sha` after the PR is merged to `main`; only a timestamped Owner comment newer than merge and any change request can authorize deployment. |
| S-04 concurrent deployment race | P1 | No process lock protected the fixed temporary symlink, systemd state, backup, retention and receipt paths. | Acquire a non-blocking `flock` for the complete lifecycle before preflight; concurrent deploys fail before mutation. |
| S-05 stale/non-main release | P1 | A failed fetch was only a warning, and an explicit argument could select any locally available commit. | Fetch failure is fatal; target must equal refreshed `origin/main`; baseline must be an ancestor of target. Historical rollback remains a separate migration-aware workflow. |
| S-06 dependency authority drift | P1 | The root workspace lock used by CI/deploy was clean, but a stale nested `server/package-lock.json` pinned vulnerable Multer/qs versions and contradicted `server/package.json`. | Retain one root workspace lockfile, ignore/reject the nested lock, mirror security overrides in the server package contract, and require both root and server-scoped production audits to report zero vulnerabilities. |
| S-07 CI action runtime drift | P2 | CI still referenced Node-20-based `checkout@v4` and `setup-node@v4`, producing platform deprecation warnings despite testing the application on Node 22. | Pin the current Node-24 action implementations by immutable commit SHA, preserve the Node 22 job matrix, and set workflow permissions explicitly to read-only. |

The corrected release sequence is now:

1. freeze and independently review the branch head;
2. pass exact-head Node 22 CI;
3. Owner explicitly merges the accepted PR to `main` (this is merge authority, not deploy authority);
4. freeze the resulting `main` merge/squash SHA and compute the eight-field V3 digest;
5. Owner posts the exact V3 marker on the merged PR after the merge timestamp;
6. deploy only that refreshed `origin/main` SHA; collect frozen runtime receipt; perform supervised draft-only UAT.

Any code change after branch review requires a new branch-head review. Any change to the merged target or fingerprints invalidates the V3 marker. No marker, merge, deploy, approval/export enablement or marketplace publication is performed by this audit.

Local verification receipt for this successor:

- target comparator successfully scanned a clean Git archive of production baseline `d6642c2502071ba885da01b02f39a6f0ebc8a605`; baseline-as-seen-by-target and target schema-authority fingerprints are identical (`e69e24a36dbddf7bd298052f955e317277bda83e1d9643f67e18b5847712ce04`), so this control-only delta does not fabricate a migration requirement;
- focused schema, rollback, Owner V3, migration receipt, release gate, repository hygiene, authority accounting, platform and shell-syntax checks pass;
- Vite production build passes with 1,827 modules transformed;
- root and server-workspace npm audits report zero known vulnerabilities after resolving Multer `2.4.0`, qs `6.16.0` and uuid `11.1.1` through the single root lockfile;
- the canonical inventory is 105 suites. On unsupported local Node `24.18.0`, `104/105` pass; only the pre-existing Windows detached-descendant runner sentinel fails. This remains non-certifying. Exact-successor Node 22 PR CI is mandatory.
