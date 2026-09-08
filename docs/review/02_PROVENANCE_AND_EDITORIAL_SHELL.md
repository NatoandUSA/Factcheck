# Section 02 — Provenance and Editorial Shell

Date: 2026-09-08
Source prototype: GPT3 `scratch/staff-workflow-review-8dd5656`
Target branch: `review/omni-commerce-intelligence-r1`

## What was ported

- `server/staffWorkflow.js`
- additive staff-workflow migration invoked after existing migrations
- four scoped staff-workflow routes added to the route registry
- buffer support in `spreadsheetReader.js`
- restart probe and editorial workflow tests
- canonical test inventory entry

## Boundary retained

The module writes only:

- `staff_research_files`
- `staff_editorial_drafts`

It does not write commerce `listings`, does not accept evidence, and does not transition `research_projects.state`.
Saved content is explicitly classified as `INTERNAL_EDITORIAL_DRAFT` with `authority: NONE`.

## Important provenance properties

- raw file bytes are persisted
- SHA-256 file hash is persisted
- parsed rows and row accounting are persisted
- duplicate import is idempotent by `(project_id, file_hash, kind)`
- tenant/workspace/marketplace scope is checked on every route
- source hash makes a saved draft stale when research files change
- optimistic `expectedVersion` prevents silent overwrite
## Verification on this branch

Environment note: default Node v24 failed before assertions because the existing SQLite native binary is not compatible with that runtime. The clean test was therefore rerun with the same Node 22 runtime family used by the GPT3 candidate.

Result on this branch:

```text
Node v22.23.2
STAFF_API measured=58 passed=58 failed=0
```

This proves the synthetic API/DB workflow on the integration branch. It does **not** prove browser UI behavior.

The GPT3 candidate separately contains an execution receipt showing 80/80 checks with the real Hija corpus (19 X-Ray + 1,099 Cerebro + 16 reference rows, plus 194 Etsy rows). That historical receipt is evidence for the source prototype, not a rerun result for this branch.

## Review findings / known limitations

1. Current table stores the latest editorial draft only; `version` is optimistic concurrency, not immutable draft history.
2. The generator inside GPT3 (`draftFromFacts`) remains intentionally simple and must not become Omni's final research-driven generator.
3. Staff keyword search uses substring matching only as a lookup convenience; it must not be reused as relevance or IP logic.
4. Current screening still calls the legacy `server/ipGuard`; Section 03/04 will introduce a reviewable intelligence/IP layer rather than silently replacing production behavior.
5. Frontend build/browser UAT is outside this section and remains unverified.

## Agent review questions

- Should immutable editorial version history be required before integration to main?
- Should raw file bytes stay in SQLite or move to object/file storage with hash binding?
- Is `authority: NONE` sufficient naming, or should the domain define a stronger explicit non-commerce authority enum?
