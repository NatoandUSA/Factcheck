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
5. A separate GitHub Owner authorization must bind the exact baseline SHA, target SHA, both fingerprints and technical-evidence SHA-256. Local file ownership is not authorization evidence.
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
| E-04 GitHub verification | `ACCEPT — P2 PROVEN` | Verify PR head equals target SHA and base is `main`; paginate with a hard page bound and a ten-second request timeout. Keep the repository public for read-only verification while removing committed host identity. |
| E-05 local CRLF | `ACCEPT — WORKTREE HYGIENE` | Renormalize tracked shell/template paths; never weaken raw-byte LF assertions. |
| E-01/E-02 extension/symlink | `ACCEPT — DEFENSE IN DEPTH` | Release-control digest covers every regular file and committed symlink without an extension allowlist. Schema dependencies are recursively resolved regardless of extension; schema-authority symlinks are rejected. |

The schema-authority manifest seeds `server/database/migrations.js` and `server/projectStateRegistry.js`, recursively includes their relative dependencies, and hashes only the marked bootstrap-schema region of `server/server.js`. Any additional DDL elsewhere in `server/server.js` fails closed. UI, test and route-only edits change `releaseControlFingerprint` but not `schemaAuthorityFingerprint`; actual migration/bootstrap/dependency edits change the schema fingerprint. `release_gate_policy.cjs` makes this decision executable and independently tested.

Owner authorization schema v2 binds the baseline/target commits, both schema fingerprints, both comparator fingerprints, the target release-control fingerprint and the technical-evidence hash. It is required for every release. When schema is unchanged, the release-control fingerprint is the evidence binding; when schema changes, the verified migration evidence SHA replaces it.

Required final-delta review: reproduce UI/test-only no-migration behavior, actual DDL requiring rehearsal, comparator-only Owner review, latest-review/revocation behavior, PR lineage/pagination/timeout, schema symlink rejection, and E-07 rollback under an unwritable backup destination. Production read-only DDL and stale-row receipts remain blocking evidence.

The third-successor canonical inventory contains 103 suites. Focused controls and the Vite build pass locally; the unsupported Node 24/Windows run reports `102/103 PASS`, with only the previously isolated process-tree sentinel failing. The exact successor must still pass the Node 22 PR event before this section becomes certifying evidence.
