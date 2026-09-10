# OmniSeller R3 — Automation Control Plane Review R1

Date: 2026-09-09 (Asia/Bangkok)

Verdict: **APPROVE LEVEL 2 WITH CHANGES — AUTOMATE COORDINATION AGGRESSIVELY, NEVER AUTOMATE AUTHORITY ELEVATION**

## 1. Executive answer

The proposed GitHub Coordination Bus is directionally correct and can remove more than the estimated 80–90% of copy/paste if it is implemented as an event-driven control plane rather than a collection of manually moved Markdown files.

Realistic automation targets:

| Scope | Achievable automation |
| --- | ---: |
| Task packet, evidence, test and review coordination | 90–95% |
| Cross-vendor dispatch using ordinary Chat/Pro user interfaces | 60–80% |
| Cross-vendor dispatch with official APIs and service credentials | 90–98% |
| Complete business workflow including truth/approval/submission | 70–85% |

The remaining human work is intentional: Product Truth confirmation, ambiguous claim decisions, Manager approval, Owner release authorization, secret handling and manual marketplace submission.

Do not build the full API orchestrator before the R3 vertical workflow is stable. First implement a small Level 2 control plane that produces deterministic packets, validates exact-SHA receipts and computes the next legal action.

## 2. What is correct in the proposal

- GitHub is a suitable durable coordination and evidence ledger.
- GPT3/Codex remains the only canonical implementation writer and coordinator.
- Other agents receive bounded tasks and return structured findings/receipts.
- Exact SHA, scope, forbidden actions and expected output belong in every packet.
- Linux should generate reproducible machine evidence.
- VPS is a release target, not the orchestration host or development machine.
- Human authority gates must remain outside agent-generated status changes.
- API orchestration should follow, not precede, a stable task/verdict schema.

## 3. Required design corrections

### 3.1 Do not move files among `READY/IN_PROGRESS/BLOCKED/COMPLETED`

Directory moves create noisy commits, merge races and two sources of truth. Use:

```text
immutable task specification in Git
+ GitHub Issue/PR as mutable execution state
+ CI-generated CURRENT_STATE.json as a derived view
```

`CURRENT_STATE.json`, `NEXT_AGENT_PROMPT.md` and `REVIEW_MATRIX.md` must be generated artifacts, never manually authoritative files.

### 3.2 Do not assign canonical code ownership to donor/reviewer agents

The example assigns C2-A ownership to Claude and reviewers GPT2/GPT4. Final model:

```text
implementation owner  = GPT3/Codex
domain specialist     = Claude
truth reviewer        = GPT1
security reviewer     = GPT4
data reviewer         = GPT2 only where persistence/API is affected
```

Claude may provide a bounded donor bundle or patch proposal, but Codex performs the canonical transplant.

### 3.3 GitHub labels are workflow hints, not authority

A label such as `accepted` or `ready-for-deploy` cannot authorize approval, merge or deployment. Required authority is a validated artifact bound to:

- exact repository and full SHA;
- gate and scope;
- reviewer identity/role;
- verdict;
- timestamp and evidence references;
- Owner authorization ID for external mutation.

### 3.4 Use one state machine, not independent label/file states

Recommended task states:

```text
DRAFT
READY
RUNNING
AWAITING_REVIEW
CHANGES_REQUESTED
ACCEPTED
BLOCKED
CANCELLED
```

Release authority is separate:

```text
NO_EXTERNAL_AUTHORITY
PUSH_AUTHORIZED
PR_AUTHORIZED
MERGE_AUTHORIZED
DEPLOY_AUTHORIZED
```

An agent verdict cannot change the second state machine.

### 3.5 Every source change invalidates affected reviews automatically

The controller compares `reviewed_sha` with current PR head. Any mismatch changes the review to `STALE`, recalculates the dependency graph and regenerates the reviewer packet.

## 4. Current repository readiness audit

The repository is not ready to activate the proposed automation unchanged.

### P1 — GitHub write channel unavailable

`gh auth status` reports the active `NatoandUSA` token is invalid. Issues, labels, PR comments and workflow dispatch cannot be treated as available until authentication is restored by the Owner through a secure interactive process.

No token may be pasted into source, reports, shell output or agent prompts.

### P1 — Existing deploy script cannot be called by automation

`scripts/vps_deploy_and_verify.sh` currently:

- defaults to `main`;
- continues after a failed fetch;
- may resolve the target from local `HEAD` when the remote ref is unavailable;
- has no validated Owner authorization artifact or release-manifest gate;
- installs/builds on the VPS;
- performs service stop, backup, symlink switch and old-release deletion.

This is a manual runbook, not yet a safe machine-triggered deployment action. The automated release path must require a literal expected SHA already present in a signed/validated release manifest and must abort on fetch or provenance failure. Deployment remains disabled in Automation R1.

### P1 — No coordination schema or validator exists

The repo currently has one CI workflow and no task/verdict/receipt schemas, issue forms or control-plane validator. Labels alone cannot enforce gate integrity.

### P2 — CI metadata is stale

`.github/workflows/ci.yml` labels the suite as `44/44 Test Files`, while the current canonical inventory discovery reports 66 entries. CI should report dynamic accounting and must never encode a success headline in the step name.

### P2 — CI does not yet produce gate receipts

The workflow builds and tests on Ubuntu/Node 22 but does not emit:

- exact environment/dependency receipt;
- test totals including failed/unexecuted/harness errors;
- changed-file/scope validation;
- fixture hashes;
- migration/rollback evidence;
- review matrix or stale-review check.

### P2 — GitHub protection cannot be assumed

Submitted reviews report that `main` was unprotected. Because current CLI authentication is invalid, this review does not independently claim that live protection state. Branch protection and required checks must be verified after authentication is restored.

## 5. Improved control-plane structure

Use a smaller structure with immutable specifications and generated state:

```text
.omniseller/
├── control-plane/
│   ├── README.md
│   ├── roles/
│   │   ├── gpt1-authority.yaml
│   │   ├── gpt2-data.yaml
│   │   ├── gpt3-codex-implementation.yaml
│   │   ├── gpt4-security.yaml
│   │   ├── claude-domain.yaml
│   │   └── gravity-browser.yaml
│   ├── gates/
│   │   ├── G0-C1-POLICY.yaml
│   │   ├── G1-CLAIM-GUARD.yaml
│   │   ├── G2-REVISIONS.yaml
│   │   ├── G3-INTEGRATION.yaml
│   │   ├── G4-AMAZON.yaml
│   │   ├── G5-ETSY.yaml
│   │   ├── G6-RC.yaml
│   │   └── G7-RELEASE.yaml
│   ├── schemas/
│   │   ├── task.schema.json
│   │   ├── finding.schema.json
│   │   ├── verdict.schema.json
│   │   ├── machine-receipt.schema.json
│   │   └── owner-authorization.schema.json
│   └── policies/
│       ├── transitions.yaml
│       ├── required-reviewers.yaml
│       └── external-actions.yaml
├── generated/                 # ignored or CI artifacts, never authority
│   ├── CURRENT_STATE.json
│   ├── NEXT_AGENT_PROMPT.md
│   └── REVIEW_MATRIX.md
└── receipts/                  # accepted, exact-SHA gate receipts only
```

GitHub Issue/PR fields hold runtime state. Git contains versioned rules and accepted evidence.

## 6. Automation that can be added now

### 6.1 Fully automatic and safe

1. Validate task/verdict/finding/receipt JSON against schemas.
2. Resolve the dependency DAG and calculate the next legal task.
3. Generate a minimal prompt packet for each reviewer.
4. Record full SHA, parent SHA, tree hash and changed-file allowlist.
5. Mark reviews stale when PR head changes.
6. Reject a verdict for the wrong SHA, role or gate.
7. Run Node 22 install, focused tests, canonical discovery, build and diff checks.
8. Produce test accounting without optimistic fixed totals.
9. Hash real fixtures and exported packages.
10. Run static writer/legacy-route/policy-consumer inventories.
11. Run migration on disposable DB, rollback and before/after hashes.
12. Generate review matrix and consolidated gate summary.
13. Open/close internal Codex subagent tasks in one session where supported.
14. Notify the coordinator only on completion, failure, stale review or required human action.

### 6.2 Automatic after one explicit confirmation

1. Create a GitHub branch/PR from an exact clean commit.
2. Request external reviewer attention.
3. Re-run affected checks after a fix.
4. Upload accepted receipts and build artifacts.
5. Push an exact accepted SHA.
6. Merge after a separate Owner authorization and required checks.
7. Start a VPS deployment only after a separate Owner authorization artifact.
8. Roll back automatically when postdeploy health/revision checks fail.

### 6.3 Semi-automatic

1. Claude/Gravity/GPT chats without official API integration: generate one-click prompt/link, but a human opens or activates the destination session.
2. Browser UAT: automate deterministic Playwright journeys and screenshots, then require Gravity/human review for usability and misleading states.
3. Finding triage: classify and route automatically, but a reviewer confirms ambiguous P0/P1 severity.
4. Product Truth completion: highlight gaps and propose questions, but Seller/Manager supplies and confirms facts.

### 6.4 Never automatic in Phase 1

- treating research as Product Truth;
- accepting an unsupported claim exception;
- Manager content approval;
- Owner submission authorization;
- secret/credential disclosure;
- marketplace publish/API write;
- reporting marketplace acceptance/live status;
- direct source or SQLite edits on VPS.

## 7. Level 2.5 — more automation without a cross-vendor API orchestrator

Level 2.5 is recommended after the basic schemas are stable:

```text
GitHub event
→ controller validates state and SHA
→ Codex automatically handles implementation/test subtasks
→ controller generates bounded packets for GPT1/2/4, Claude and Gravity
→ human performs one-click activation only for external Chat/Pro sessions
→ structured verdict is pasted/uploaded once
→ controller validates, updates the matrix and wakes Codex
```

This eliminates repeated report copying while preserving independent external review. It can also use a quiet monitor that wakes only for a meaningful status change; it must not spam periodic status messages.

## 8. Future Level 3 API orchestrator

Only start Level 3 after G3 proves the canonical vertical slice and the control-plane schemas have survived at least two real gate cycles.

Run the orchestrator on the Linux PC or a dedicated control service, not the production OmniSeller VPS. It may:

- receive GitHub webhooks;
- lease one task idempotently;
- call approved vendor APIs;
- bind model/version/prompt/input hashes;
- validate structured output;
- create a finding/verdict comment or artifact;
- retry transient failures with a budget;
- stop on P0/P1, invalid output, stale SHA or missing authority;
- request human action instead of guessing.

Required controls:

- official API credentials stored only in a secret manager;
- minimal GitHub App permissions rather than a broad personal token;
- per-agent cost/token/time budgets;
- idempotency and replay protection;
- prompt-injection isolation: repository/issue content is untrusted data;
- no shell command generated by a reviewer is executed automatically;
- immutable audit logs and redaction;
- circuit breaker and manual kill switch;
- no automatic merge/deploy/publish authority.

Ordinary Chat/Pro subscriptions must not be assumed to include vendor API access or cross-product message delivery.

## 9. GitHub Actions design

Recommended workflows:

```text
control-plane-validate.yml
  pull_request: validate schemas, task scope, SHA and transitions

ci.yml
  pull_request: Node 22 install/build/canonical accounting

gate-receipt.yml
  workflow_run: generate machine receipt and review matrix

migration-certify.yml
  workflow_dispatch: exact SHA + disposable DB only

browser-uat.yml
  workflow_dispatch: exact SHA + fixture manifest; no marketplace write

release-candidate.yml
  workflow_dispatch: verify all accepted evidence for one exact SHA

deploy.yml
  environment-protected manual dispatch; disabled until G6 acceptance
```

Security rules:

- use least-privilege `permissions` explicitly;
- pin third-party actions to reviewed commit SHAs for release workflows;
- never use `pull_request_target` to execute untrusted PR code;
- use concurrency keys so one gate/SHA has one active run;
- retain test logs and receipts as artifacts;
- deployment uses GitHub Environment approval plus the R3 Owner authorization artifact;
- PR labels never substitute for required status checks.

## 10. Minimal implementation order

Automation must not consume the timebox needed to finish the product.

### AUTO-0 — repair prerequisites, 0.25–0.5 day

- Owner restores GitHub authentication securely;
- verify repository/main protection state;
- remove fixed `44/44` CI wording;
- do not touch VPS deployment automation.

### AUTO-1 — schemas and local validator, 0.5 day

- add task/finding/verdict/machine-receipt/Owner-authorization schemas;
- add one local `control_plane_validate` command;
- model G0–G7 and role constraints;
- generate current state and next prompt from facts.

### AUTO-2 — CI validation and artifact generation, 0.5–1 day

- add least-privilege control-plane workflow;
- validate PR task/scope/SHA;
- emit machine receipt, review matrix and next prompt;
- mark stale reviews automatically.

### AUTO-3 — issue forms/labels/branch protection, 0.5 day

- create task/finding/review issue forms;
- create labels from one declarative manifest;
- configure required checks and protected environments after Owner approval.

Then stop automation development and return to G0/G1. AUTO-0 through AUTO-3 must fit within two focused days. If they do not, keep local schemas/validator and defer GitHub polish until after G3.

### AUTO-4 — Level 2.5, after two gate cycles

- add coordinator wake/notification and one-click external-agent packets;
- add deterministic browser UAT dispatch;
- measure actual copy/paste and cycle-time reduction.

### AUTO-5 — Level 3, after G3 and explicit budget decision

- evaluate official vendor APIs and cost;
- prototype one reviewer lane only;
- no production deploy integration during the experiment.

## 11. Acceptance criteria for Automation R1

Automation R1 is accepted only when:

- malformed or wrong-SHA verdicts fail validation;
- a head change makes prior reviews stale;
- the DAG cannot skip a required gate;
- one agent cannot approve its own implementation;
- client/repository text cannot create external authority;
- no GitHub label can authorize merge/deploy;
- generated files reproduce from versioned input;
- CI reports actual totals and failures honestly;
- secrets never enter artifacts/logs;
- deploy workflow remains disabled;
- local validation works even when GitHub is unavailable.

## 12. Final recommendation

Proceed with **Level 2 plus Level 2.5 preparation**, capped at two focused days.

Do not create a full cross-vendor API orchestrator yet. The optimal path is:

```text
versioned schemas and gate DAG
→ local deterministic validator/generator
→ GitHub PR/CI evidence bus
→ one-click external review packets
→ two real gate cycles
→ only then evaluate API orchestration
```

This design can automate nearly all repetitive coordination while preserving the human decisions that make Product Truth, approval, release and submission trustworthy.
