# GATE C RELEASE AUTHORITY LOCK

Date: 2026-09-23
Status: CANONICAL GOVERNANCE LOCK

LATEST MAIN != RELEASE AUTHORITY DURING GATE C

RELEASE AUTHORITY:
`b911ffbfa590dfee083c572871c1286642dc4f1c`

Repository main:
`5b5f60b92520692f88896ad970eec9af0d061288`

Meaning:
- main is canonical development history;
- main contains merged PR #71;
- PR #71 is intentionally not production-authorized;
- production remains the frozen Gate C reference build at `b911ff...`;
- every Gate C receipt must record the exact production SHA observed;
- no deploy automation or operator may infer a target from latest main, origin/main, newest merge, or branch tip;
- any release during Gate C must name an explicit owner-authorized target SHA;
- this lock remains in force until a later Gate C decision explicitly replaces the frozen release baseline.

Current production verification before this lock:
- public health: HTTP 200;
- database: CONNECTED;
- revision: `b911ffbfa590dfee083c572871c1286642dc4f1c`.

This document changes governance only. It does not authorize any deploy, code mutation, evaluator change, parser change, or UI change.
