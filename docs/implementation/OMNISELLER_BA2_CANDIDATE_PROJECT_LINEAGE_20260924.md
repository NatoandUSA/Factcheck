# BA-2 Candidate â†’ Project Lineage

Status: implementation candidate
Base: `d03fd883a000dd3d201c967afdaaad2d8d38a2be`
Implementation head: `83534c06a05c5e096514a25999e8854204df44f2`
Production mutation during rehearsal: NONE

## Locked business contract

The human, not the evaluator, owns the shortlist decision.

```text
20 real candidates
â†’ immutable human shortlist 0â€“5
â†’ selected candidate
â†’ canonical Project
â†’ evidence / Product Truth / intelligence / listing lineage
```

Advisory ranking/disposition is context only. It is not shortlist authority.

A candidate may be shortlisted regardless of advisory disposition. A Project may still be created only when canonical Research Readiness is `READY`.

## Reused implementation

BA-2 reuses the existing B4 candidateâ†’Project implementation:

- canonical Project creation;
- one candidate â†’ at most one Project per scope;
- immutable candidate evidence snapshot;
- immutable evaluation snapshot;
- project-scoped `GLOBAL_CANDIDATE_POOL` research evidence;
- idempotent promotion receipt;
- no Product Truth mutation;
- no score tuning;
- no marketplace submission behavior.

## New thin layer

### Immutable shortlist snapshot

New table:

```text
global_candidate_shortlists
```

Each snapshot stores:

- tenant/workspace/marketplace scope;
- exact ordered candidate selection;
- selected count, constrained to 0â€“5;
- candidate keys and display phrases;
- exact evidence refs + evidence snapshot hashes;
- exact evaluation snapshot at selection time;
- optional human decision note;
- actor and timestamp;
- immutable snapshot hash;
- idempotency receipt.

Update/delete are blocked by immutable triggers.

### Promotion lineage

New promotions must supply the exact `shortlistId`.

The candidate must exist in that shortlist with the same immutable candidate key.

New promotion receipts also store:

```text
shortlist_id
shortlist_snapshot_hash
```

Legacy promotion rows remain readable with NULL shortlist lineage.

Project research evidence embeds the same shortlist ID/hash and the selection-time evaluation snapshot.

## Human agency

The shortlist accepts 0 candidates as a valid decision.

The shortlist is capped at 5 candidates.

No `PROMOTE` advisory disposition is required. A real regression test proves an Amazon candidate with:

```text
advisoryDisposition = WATCH
researchReadiness = READY
```

can be explicitly shortlisted by a human and promoted into a Project.

Project creation continues to fail closed when current Research Readiness is not READY.

## Production-copy migration rehearsal

Rehearsal used a consistent SQLite backup of current production DB. Live production was not mutated.

Result:

```text
integrity before: ok
integrity after:  ok
migration 023:   applied
second run:       idempotent
```

Critical production state:

| Scope | Before | After | Result |
| --- | --- | --- | --- |
| Project #5 Etsy | `2d605f21b7601814a1e1da0eeb418647109244ff90c3e3b51f7754726bedb50e` | same | PASS |
| Project #6 Amazon | `20895b6f7b74dab0efe769c634065aae349243f974aa1663b623c606a106da01` | same | PASS |
| Global Candidates | empty hash `4f53cda18c2b...` | same | PASS |
| Global Evidence | empty hash `4f53cda18c2b...` | same | PASS |
| Legacy Promotions | empty hash `4f53cda18c2b...` | same | PASS |

Schema after migration includes:

```text
global_candidate_shortlists
global_candidate_promotions.shortlist_id
global_candidate_promotions.shortlist_snapshot_hash
```

## UI contract

Manager/Owner receives:

1. candidate list and advisory evidence;
2. checkboxes for selecting 0â€“5 candidates;
3. optional human decision note;
4. explicit **KhÃ³a shortlist** action;
5. visible immutable shortlist ID/hash;
6. Project creation only for a READY candidate contained in the locked snapshot.

The UI does not auto-select Top 5 and does not tune scores.

## Exclusions

Unchanged:

- Amazon workflow engine;
- Etsy workflow engine;
- Product Truth authority;
- Amazon policy authority;
- YTrends authority;
- Commercial Proof semantics;
- listing/approval/export workflow;
- scoring/evaluation thresholds.

## Release gate

```text
IMPLEMENTATION        COMPLETE
FOCUSED TESTS         PASS
MIGRATION REHEARSAL   PASS
FULL CANONICAL SUITE  116/118 LOCAL NON-REGRESSION
NODE22 CI             PENDING
INDEPENDENT REVIEW    PENDING
MERGE                 HOLD
DEPLOY                HOLD
```

Local full-suite failures are both pre-existing Windows/Node24 harness failures and reproduce unchanged on exact base `d03fd883...`:

- `test_deploy_rollback_faults.cjs` â€” Unix `ln` rollback harness on Windows;
- `test_runner_accounting.cjs` â€” Windows process-tree timeout/accounting behavior.

All 116 functional/security/workflow tests pass, including the BA-2 shortlist/promotion contract, route security, migrations, Amazon, Etsy, Product Truth, policy authority and canonical UI. Canonical Node22 Linux CI remains merge authority.
