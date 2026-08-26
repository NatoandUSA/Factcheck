# H0 Production Read-Only Audit Plan

Status: PREPARATION ONLY. This document defines how GPT3 should audit production after the H0 authority evaluator is certified. It does not authorize production access, writes, remediation, migration, cutover, or publish.

Owner role: GPT3 release/certification.

## Purpose

Use the exact certified H0 policy/evaluator to identify legacy or currently accepted evidence that would fail the new fail-closed authority contract, while proving the audit itself performs zero production writes.

The audit must answer:

- What production revision is actually running?
- What exact H0 candidate/evaluator revision is used for the audit?
- Which accepted evidence rows are invalid under the certified policy?
- Which tenant/workspace/marketplace/project scopes are affected?
- Which downstream projects/states depend on those rows?
- Did the audit change any production state? Expected answer: NO.

## Preconditions

Do not run until:

- GPT2 exact H0 candidate exists;
- GPT4 adversarial review PASS on exact candidate;
- Claude independent diff/test-oracle review PASS on exact candidate;
- GPT1 authority PASS on exact candidate and canonical contract;
- GPT3 runtime/toolchain certification has at least validated the exact candidate evaluator locally/CI;
- production access is explicitly authorized for read-only audit;
- current production revision and DB path can be live-verified.

If any prerequisite is absent, mark audit `NOT EXECUTED`.

## Exact-artifact binding

Record before querying production:

```text
Production revision from /api/health:
Production release REVISION:
Certified H0 candidate SHA:
Certified evaluator source path/module:
Evaluator artifact checksum if separately packaged:
Governance/authority artifact SHA:
GPT1 authority verdict artifact:
Audit start UTC:
Operator/provenance label:
```

Production revision and release `REVISION` must agree. A mismatch is a release finding and blocks the audit verdict.

## Zero-write controls

Use defense in depth. At least two independent controls should prove the audit cannot mutate state.

Preferred controls:

1. Open SQLite in read-only mode or use a read-only copy/snapshot for evaluator analysis when possible.
2. If querying the live DB, use read-only transaction/connection semantics and never invoke mutation routes.
3. Capture DB file size, mtime, and checksum (where operationally safe) before/after.
4. Record counts/max IDs for append-only event tables before/after.
5. Do not call acceptance, transition, remediation, quarantine, migration, import, or publish endpoints.
6. Do not start the production application with an unreviewed evaluator build just to run the audit.

Any observed write = audit BLOCK and incident finding.

## Data scope inventory

The audit must enumerate the actual schema before assuming table/column names. Record:

```text
.tables
.schema <evidence-related tables>
.schema research_projects
.schema <workflow/event tables>
```

Then map the certified evaluator inputs to stored fields.

At minimum identify fields representing or deriving:

- tenant identity;
- workspace identity;
- marketplace;
- project identity;
- evidence/artifact/source identity;
- kind/source/provider;
- evidence state / accepted state;
- metadata/annotations;
- content hash;
- version binding;
- timestamps/provenance;
- downstream workflow state.

Do not infer absent fields as safe defaults.

## Audit classification

For every production evidence row currently treated as accepted/qualifying by legacy state, run the exact certified evaluator without mutation.

Output one classification per row:

```text
VALID_UNDER_H0
INVALID_UNDER_H0
INSUFFICIENT_DATA
EVALUATOR_ERROR
```

For invalid/insufficient/error rows, record machine-readable reasons from the evaluator where available.

Required fields in the audit result:

```text
tenant_id
workspace_id
marketplace
project_id
evidence_id / artifact_id
legacy_state
kind
provider/source identity
content_hash_present
version/scope binding present
H0 classification
reason codes
```

Do not print secret payloads or unnecessary sensitive content.

## Downstream impact map

For every `INVALID_UNDER_H0` or `INSUFFICIENT_DATA` row, identify downstream project/workflow states that relied on it.

At minimum report:

- project current state;
- whether project previously crossed RESEARCH_ACCEPTED;
- whether project crossed DNA_ACCEPTED;
- any later state that is causally dependent on the invalid research foundation under the final GPT1 ruling;
- whether a Product Truth/publish authority state exists separately.

This is impact analysis only. Do not roll back, quarantine, or mutate state during the audit.

## Aggregate report

Produce totals by:

- tenant;
- workspace;
- marketplace;
- project;
- evidence kind/source/provider;
- classification/reason code.

Required accounting:

```text
legacyAcceptedTotal
= validUnderH0
+ invalidUnderH0
+ insufficientData
+ evaluatorError
```

`silentLoss = 0`.

Any row omitted from accounting = audit BLOCK.

## Before/after zero-write proof

Record before and after:

```text
Production revision
DB size
DB mtime
DB checksum if safe/feasible
acceptance event count/max id
audit/event count/max id
workflow transition event count/max id
research project row count
accepted evidence row count
```

Expected: no changes attributable to the audit.

If background production traffic can legitimately change these values, use a maintenance/read replica/snapshot or a narrower immutable proof method; do not falsely claim zero-write from noisy counters.

## Remediation boundary

Audit output may recommend remediation categories, but must not execute them.

Allowed recommendations:

```text
NO_ACTION
OWNER_RULING_REQUIRED
REVALIDATE_SOURCE
RECOMPUTE_WITH_SERVER_PROVIDER
QUARANTINE_PROPOSAL
STATE_REVIEW_REQUIRED
```

Actual remediation requires separate authority ruling and append-only audit event under the Golden Rules.

## Audit evidence packet

```text
H0 PRODUCTION READ-ONLY AUDIT
Production revision:
Certified H0 candidate SHA:
Governance/authority SHA:
DB path verified:
Read-only mechanism:
Audit start/end UTC:
Legacy accepted total:
VALID_UNDER_H0:
INVALID_UNDER_H0:
INSUFFICIENT_DATA:
EVALUATOR_ERROR:
Affected projects:
Affected tenants/workspaces/marketplaces:
Downstream impact summary:
Accounting reconciliation:
Zero-write proof:
Residual findings:
Recommended remediation owner:
Verdict: PASS/BLOCK/NOT EXECUTED
Provenance label:
```

## PASS criteria

PASS means only that the read-only audit was complete and trustworthy. It does not mean production data is clean or cutover is authorized.

PASS requires:

- exact production revision verified;
- exact certified evaluator used;
- every legacy accepted row accounted for;
- invalid/insufficient rows have reasons;
- downstream impact map completed;
- zero-write controls passed;
- no remediation was performed;
- evidence packet is complete.
