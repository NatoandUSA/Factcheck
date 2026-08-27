# GPT1 RULING — F-06 / F-09

**Repository binding:** candidate for Factcheck `main`; checkpoint base `0f6a941` (fresh-verified externally at `2026-08-27T05:37:10Z`). This ruling becomes governance-effective only after an approved documentation commit containing it enters the candidate ancestry under §0.1.

## Ruling

- **F-09: CONFIRMED, P1 — functional/release blocker.** Root-cause class: canonical project-state DAG and persisted SQLite `CHECK(state IN (...))` schema diverge. The declared transition to `PRODUCT_TRUTH_VERIFIED` reaches authorization but fails at persistence with `500 DATABASE_ERROR` and zero state change.
- **F-06: P1.** `GOLDEN_RULES.md` on the stated canonical base records F-06 as P1. Earlier chat-only P2 rulings are withdrawn and do not downgrade repository authority. F-06 remains open; its clean-head all-edge sweep is incomplete while F-09 leaves declared edges unmeasurable.

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
- **Owner: GPT2**, but implementation authority begins only after this ruling is present in the approved candidate ancestry.
- F-09 must close before F-06 can claim complete clean-head edge coverage. Closing F-09 does not by itself close F-06.

## Authorization boundary

Authorized now: documentation-only Tier C candidate, independent review, and CI.

**Merge / production implementation / migration execution / cutover / publish: NOT AUTHORIZED.**
