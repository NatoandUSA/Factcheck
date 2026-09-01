# GPT1 RULING — F-06 / F-09

**Repository binding:** Factcheck governance candidate lineage `main@0f6a941793c19c2e92c6755627328a8a443fed32` → docs parent `e9b9153b716ab4ba9351cb1dd7857462386f2411` → the child commit containing this revision. This ruling becomes governance-effective only after Owner-authorized merge places that child commit in `main` ancestry under §0.1. Candidate ancestry alone grants no implementation authority.

**Evidence scope:** F-09 is statically reproducible from `main@0f6a941793c19c2e92c6755627328a8a443fed32` (the transition DAG contains `PRODUCT_TRUTH_VERIFIED`; the persisted `CHECK(state IN (...))` does not). F-06 duplicate-map evidence belongs to exact implementation SHA `936be8329ab226d94a6ba79e2213a66be9c1996a`, remains present at PR #25 head `078533d075559e7a2f4d71885bfb89d4ebaf0a87`, and is absent from this governance candidate. No runtime test result from PR #25 is claimed as execution evidence for this docs-only candidate.

## Ruling

- **F-09: CONFIRMED, P1 — functional/release blocker on `main@0f6a941793c19c2e92c6755627328a8a443fed32`.** Static root-cause evidence: canonical project-state DAG and persisted SQLite `CHECK(state IN (...))` schema diverge. HTTP/runtime behavior is **NOT EXECUTED** for this docs-only candidate and remains part of the executable closure contract below.
- **F-06: P1 on PR #25 implementation lineage, not a diff in this docs candidate.** Its authority basis is §8/§12; §9.1 is supporting guidance. Earlier chat-only P2 rulings are withdrawn and do not downgrade repository authority. F-06 remains open; its clean-head all-edge sweep is incomplete while F-09 leaves declared edges unmeasurable.

## F-09 closure contract

Closure requires executable evidence on the exact remediation candidate proving all eight conditions:

1. One canonical project-state registry is the machine-readable source used by transition authorization, schema generation/migration, and tests.
2. A fresh database accepts every registry state and rejects every state outside the registry.
3. An existing pre-remediation database migrates without data loss and its schema-state set equals the registry-state set.
4. Both declared incoming transitions to `PRODUCT_TRUTH_VERIFIED`—including `MKL_FROZEN` and `DRAFT_GENERATED`—succeed with exactly one authorized write.
5. `PRODUCT_TRUTH_VERIFIED -> MANAGER_APPROVED` remains reachable and authorized.
6. No production or test path relies on `PRAGMA ignore_check_constraints` or an equivalent constraint bypass.
7. A machine assertion proves exact equality between persisted schema states and registry states; invalid-state and failed-transition cases are fail-closed and zero-write.
8. The existing C-03 twelve-edge authority behavior remains green, and the F-06 closure-mode mutation test proves an unclassified added registry edge blocks with zero writes and makes the classification test fail.

## Execution and ownership

- A forward migration and a tested rollback/recovery procedure are required; source-only remediation cannot close F-09.
- **Owner: GPT2**, but implementation authority begins only after this ruling is merged into `main` ancestry and the Owner separately authorizes implementation on a named branch and base SHA.
- F-09 must close before F-06 can claim complete clean-head edge coverage. Closing F-09 does not by itself close F-06.

## Authorization boundary

Authorized now: documentation-only Tier C candidate, independent review, and CI.

**Merge / production implementation / migration execution / cutover / publish: NOT AUTHORIZED.**
