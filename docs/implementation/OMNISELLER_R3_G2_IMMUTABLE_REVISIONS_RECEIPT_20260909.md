# OmniSeller R3 — G2 Immutable Revision Core Receipt

Date: 2026-09-09 (Asia/Bangkok)
Branch: `codex/omniseller-r3-g2-revisions`
Base: accepted C2 SHA `675e8cc324671b669c7bd051c8b52874ba090407`
Status: **IMPLEMENTED CANDIDATE — INDEPENDENT REVIEW REQUIRED — WRITER NOT ACTIVATED**

## 1. Scope actually implemented

G2 adds the revision persistence primitive required by the R3 plan. It does not claim G3 route/UI integration, staff UAT, merge, deployment, or production readiness.

Physical model:

```text
existing listings row (aggregate root)
├─ head_revision_id ─────────────→ listing_revisions[] (append-only)
└─ head_creative_revision_id ────→ creative_revisions[] (append-only)

listing_write_receipts[] (append-only idempotency ledger)
```

No parallel `listing_roots`, Product Truth store, approval system, or donor database was added.

## 2. Write contract

The new `server/revisionStore.js` supplies:

- atomic listing root plus revision v1 creation;
- compare-and-swap listing revision append;
- compare-and-swap creative revision append;
- exact historical revision read by tenant/workspace/marketplace/project/listing/revision scope;
- UUID idempotency keys with request-hash equality;
- deterministic canonical JSON and SHA-256 content/dependency hashes;
- mandatory server-side dependency resolver, strict allowlist, paired ID/hash validation, and explicit `BOUND`/`INCOMPLETE` accounting;
- a 2 MiB payload ceiling, depth ceiling, JSON-only values, NFC normalization, and normalized-key collision rejection.

The persistence primitive performs database operations only. It performs no LLM call, network request, or file I/O inside its transaction.

## 3. Preserved dependency bindings

New writes have a closed manifest containing only:

```text
Product Truth revision ID/hash
Research snapshot ID/hash
Intelligence snapshot ID/hash
Policy binding hash
Claim/IP binding hash
Validator hash
Bound listing revision ID/hash (creative revisions)
Locale
Product-family version
```

Creative callers cannot forge the listing hash: the store reads the scoped listing revision and overwrites that binding with the server-side ID/hash. Missing approval-critical dependencies remain saveable for a safe internal draft, but are enumerated in `missingBindings` and force `bindingState=INCOMPLETE`; G3 approval/export must reject that state.

Appending listing copy invalidates prior approval columns, but does not erase the root's Product Truth fields. Product Truth and generated copy are separate authority domains.

## 4. Atomicity and conflict behavior

All creates/appends use `BEGIN IMMEDIATE` and commit only after:

1. scoped parent/root verification;
2. append-only revision insertion;
3. conditional head update;
4. immutable idempotency receipt insertion.

Any exception rolls the transaction back. A stale head returns `REVISION_CONFLICT`; no losing revision or receipt remains. A reused idempotency key with a different request hash returns `IDEMPOTENCY_KEY_REUSE`. Wrong-scope and nonexistent roots both return `LISTING_NOT_FOUND`, avoiding an existence oracle.

## 5. Migration behavior

Migration `009_immutable_listing_creative_revisions`:

- adds only head pointers to the existing `listings` root;
- creates the three G2 tables and scoped indexes;
- installs database triggers rejecting UPDATE/DELETE on revisions and receipts;
- snapshots each already-scoped legacy listing once at its current `listing_version`;
- hashes the exact stored payload bytes without canonicalizing/reinterpreting them;
- marks the dependency state `LEGACY_UNKNOWN` and reason `LEGACY_SNAPSHOT_NO_HISTORY_INVENTED`;
- leaves unscoped legacy rows without revisions rather than guessing ownership;
- is transaction-wrapped and migration-ledger idempotent.

This is a snapshot of the only state actually present. It does not invent missing v1…vN history, Product Truth, evidence, approval, or authorship.

## 6. Machine evidence on this candidate

Exact Node runtime used for the following targeted certification: `v22.23.2` on Windows and native Ubuntu 24.04/WSL2.

```text
G2 immutable revisions                         38/38 PASS
listing/agent scope migration                  PASS
fresh migration + backup/restore               PASS
legacy migration idempotency/isolation         PASS
route registry coverage                        PASS (59 found; 55 non-public authenticated)
P0 route security                              PASS
security controls unit                         PASS
H0 publish integrity                           45/45 PASS
C1 policy registry                             PASS (10 groups)
C2 claim guard                                 18/18 PASS
C2 IP matcher                                  12/12 PASS
production build                               PASS (2430 modules)
git diff --check                               PASS (line-ending warnings only)
native Linux G2                                38/38 PASS
native Linux migration/backup/legacy           PASS
native Linux C1/C2 regression                  PASS
```

The G2 suite directly exercises:

- root+v1 atomic creation;
- same-request idempotent replay;
- same-request replay remains identical after dependency authority changes and does not re-run the resolver;
- different-request idempotency rejection and zero write;
- immutable v1 after v2;
- stale-parent rejection and zero write;
- tenant/workspace/project isolation and no existence leak;
- database-enforced UPDATE/DELETE rejection for revisions and receipts;
- injected failure after root insertion and full rollback;
- creative v1/v2 and server-owned listing-revision binding;
- two-connection concurrent CAS: exactly one winner and one clean conflict;
- same-production-handle concurrent CAS: per-handle serialization, one winner and one clean conflict;
- close/reopen byte/hash/head identity;
- legacy exact-byte backfill with no invented authority;
- unscoped legacy quarantine behavior;
- incomplete dependency pair and Unicode-normalized key collision rejection.
- malformed legacy payload remains readable as exact raw bytes with `MALFORMED_LEGACY_JSON` instead of becoming an unreadable history row;
- server dependency resolver is mandatory, incomplete bindings are explicit, and corrupt stored-parent hashes fail closed.

## 7. Honest limitations and next gate

- The production listing routes are intentionally not switched to this writer on the standalone G2 branch. Writer activation is G3 and must bind server-resolved C1/C2/Product Truth dependencies.
- This candidate has targeted Windows and native Linux Node 22 evidence. It still needs an independent re-review of the remediated exact SHA before G2 acceptance.
- Browser UAT is not a G2 persistence exit criterion and was not claimed here.
- Nothing was pushed, merged, deployed, or submitted to Amazon/Etsy.

Required decision after independent review:

```text
ACCEPT G2
or
CHANGES REQUESTED with reproducible finding
```

Only after G2 acceptance should the accepted C1 + C2 + G2 primitives be assembled into one clean G3 integration candidate and connected to every canonical create/edit/reopen path.
