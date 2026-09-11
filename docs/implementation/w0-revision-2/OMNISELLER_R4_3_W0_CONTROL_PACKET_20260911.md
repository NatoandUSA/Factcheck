# OmniSeller R4.3 — W0 Control Packet

**Packet date:** 2026-09-11  
**Packet status:** `SUBMITTED FOR GPT1 / GPT2 / GPT4 REVIEW`  
**Implementation:** `HOLD`  
**Cleanup / push / merge / deploy / production mutation:** `NOT AUTHORIZED`  
**Coordinator:** GPT3/Codex — evidence assembly only; cannot self-approve

This packet implements W0 of the ratified R4.3 Amendment A. It contains no feature implementation. It freezes the exact baseline and donor, maps active render/write paths, adjudicates the proposed MKL persistence model, and audits the current submission state.

## Packet contents

1. `OMNISELLER_R4_3_W0_BASELINE_DAG_DIRTY_RECOVERY_RECEIPT_20260911.md`
2. `OMNISELLER_R4_3_W0_DEPENDENCY_RENDER_REACHABILITY_RECEIPT_20260911.md`
3. `OMNISELLER_R4_3_W0_MKL_PERSISTENCE_SCHEMA_RULING_20260911.md`
4. `OMNISELLER_R4_3_W0_SUBMISSION_STATE_AUDIT_20260911.md`
5. this index and reviewer decision form.

## W0 coordinator finding

```text
BASELINE / RECOVERY:       READY FOR REVIEW
RENDER / REACHABILITY:     READY FOR REVIEW — DUPLICATE ACTIVE PATH CONFIRMED
MKL PHYSICAL SCHEMA:       CHANGES REQUESTED BEFORE ACTIVATION
SUBMISSION STATE:          CHANGES REQUESTED BEFORE W5
W1 IMPLEMENTATION:         HOLD UNTIL REQUIRED W0 ACCEPTANCES
```

The schema finding is not a request to redesign OmniSeller. The donor table is the right logical direction, but its current idempotency replay is not project-bound and does not bind a request hash. It must not be transplanted unchanged.

## Reviewer assignments

| Reviewer | Mandatory decision |
|---|---|
| GPT1 | Product Truth boundary; approval and submission authority; staff workflow integrity |
| GPT2 | Physical MKL schema; migration; CAS/idempotency; restart/rollback; historical reads |
| GPT4 | Authentication/authorization; tenant/workspace/project isolation; IDOR; retired-route boundary |
| Human Owner | No technical self-review required; later authorizes remote archival refs, merge and deploy separately |

Allowed verdicts:

```text
ACCEPT
CHANGES REQUESTED
BLOCKED — INSUFFICIENT EVIDENCE
NOT REVIEWED
```

## Activation rule

W1 may begin only when:

- GPT1 accepts its mandatory scope;
- GPT2 accepts the schema decision/repair contract;
- GPT4 accepts the isolation and route-retirement contract;
- all packet files are frozen with exact SHA-256 hashes;
- a dedicated implementation task/branch is explicitly activated.

W0 acceptance does not authorize push, merge, VPS deploy or marketplace publishing.

## Reviewer response template

```yaml
reviewer:
reviewed_packet_hashes:
scope:
verdict:
findings:
required_corrections:
w1_activation_recommendation: HOLD | ALLOW
authority_statement: NO PUSH / NO MERGE / NO DEPLOY
```

