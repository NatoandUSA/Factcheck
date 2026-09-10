# OmniSeller R3 — G4 Commerce Foundation Receipt

Date: 2026-09-10 (Asia/Bangkok)

Branch: `codex/omniseller-r3-g4-commerce`

Accepted base: G3 `72860b3cd9bb1bb8f771ace3106d8bf0b993f718`

Status: **LOCAL END-TO-END STAFF-WORKFLOW CANDIDATE — APPROVAL POLICY EVIDENCE, BROWSER UAT AND FINAL REVIEW REMAIN**

## Current result

- Transplanted the additive commerce-intelligence engine from donor commit `a000feb47`.
- Preserved its independently testable scoring, semantic clustering, ASIN batching, keyword allocation and Amazon candidate composition.
- Added object-row normalizers for persisted Cerebro and Xray data.
- Missing optional metrics remain `null`; they are not fabricated as zero.
- Every nonblank Cerebro observation remains reconstructable with `importId`, sheet and source row.
- Duplicate phrase aggregation retains the provenance of every observation.
- UI preview limits are not applied to normalized storage output.
- No request-supplied Product Truth mapper was transplanted.
- Added immutable raw research imports, research snapshots, intelligence snapshots and actor-bound write receipts.
- Added project-head compare-and-swap for research, Product Truth and intelligence dependencies.
- Added Amazon and Etsy server-owned research adapters. They consume exact stored bytes rather than temp paths.
- Added canonical preview/commit HTTP routes with zero-write preview and route-registry authentication coverage.
- Added Amazon and Etsy intelligence adapters. Donor scoring has no authority to bypass canonical claim, IP or policy validation.
- Added a canonical commerce listing preview and fully bound listing save path. Saved drafts stop at `NEEDS_QA`.
- Added eight physical-product image prompt slots and seven digital-product prompt slots. Missing verified facts leave the affected prompt blank and `ready:false`.
- Connected exact research, Product Truth and intelligence IDs/hashes to the listing dependency manifest.
- Added one canonical staff workflow to both existing Amazon and Etsy workspaces. It exposes separate preview and confirm actions for imports and intelligence, Seller Product Truth revisions, Manager-only truth confirmation, editable listing fields, image-prompt copy and an explicit `NEEDS_QA` stop.
- Added immutable Manager review, Seller submission-request and Owner submission-handoff records. Approval requires the exact current listing revision, current dependency hashes and a Manager-confirmed Product Truth revision. A new listing revision invalidates approval through the existing revision path.
- `SUBMITTED` is Owner-only and requires an immutable request created by a `SELLER`, bound to the exact approved package, plus a non-empty external marketplace reference. Owner/Manager cannot manufacture the Seller decision. The receipt states `marketplacePublishingPerformed:false`; no Amazon/Etsy publishing API is called.
- Approval resolves policy again with purpose `APPROVAL`. The included fixtures are `DRAFT_ONLY` and the lifecycle snapshot is incomplete for the current time, so the application correctly blocks approval instead of promoting `MANAGER_APPROVED`.
- Listing revisions now bind the policy contract id/artifact hash, stable policy-context hash, lifecycle digest and validator hash; review/submission rejects stale bindings.
- The Manager UI loads the full exact content, dependency manifest, validation accounting and hashes before enabling approval. A visible policy-readiness result explains why approval is blocked.
- Manager review submits the exact expected revision id, content hash and dependency hash; a head change between reading and clicking fails with `REVIEW_PACKAGE_STALE` instead of approving unseen content.
- `validatorHash` covers the transitive claim, IP and policy validation implementation modules, not only their public entry points.
- `SUBMITTED` is terminal in phase 1: neither canonical review nor revision APIs can reopen it. The append transaction rechecks and compare-and-swaps status, closing the race where Owner submits during revision preparation. Later marketplace tracking belongs to the separately scoped phase 2.
- Fixed canonical research hashing so an own `__proto__` evidence key cannot be silently dropped or collide with a different snapshot.
- Fixed worksheet projection to retain blank and duplicate header columns and exact physical row provenance. The real Hija Cerebro translation column is retained for all 1,099 rows.
- Etsy keyword allocation now dispositions conflicting product nouns (for example, `Daughter Lamp` for a necklace), unverified appearance terms and unverified product descriptors. Product Truth exposes color, finish, design, style, theme and pattern fields to unlock supported wording.
- Amazon A+ copy points are now non-empty when Product Truth supports them; the UI also exposes A+, item highlights, category and PPC targeting rather than hiding those package fields.
- Legacy Amazon/Etsy generation buttons in the primary workspaces are now visibly locked and direct staff to the canonical workflow. Their research views remain available. The legacy server routes remain compatibility-only pending a separately reviewed route-removal change; they are not the UAT path.

## Evidence

```text
Commerce-intelligence donor suite          22/22 PASS
Spreadsheet buffer/path parity             18/18 PASS
Stored-research normalization               17/17 PASS
Amazon research adapter                     18/18 PASS
Amazon intelligence adapter                 18/18 PASS
Etsy intelligence adapter                   19/19 PASS
Image prompt generator                      11/11 PASS
Immutable commerce snapshot chain           42/42 PASS
Amazon canonical research/intelligence HTTP 73/73 PASS
Etsy canonical end-to-end HTTP              21/21 PASS
Canonical commerce React workflow           14/14 PASS
014 -> 015 submission migration upgrade       4/4 PASS
G4 focused checks total                    258/258 PASS
G3 canonical HTTP regression                40/40 PASS
G2 immutable revisions regression           45/45 PASS
Research consumer runtime wiring            19/19 PASS
Route registry                              80 routes / 76 non-public authenticated
P0 route security                           PASS
Production build                            PASS (2,426 modules)
```

## Authority boundary

The donor `ipScreen.js`, semantic banned-phrase list and composer options are not policy authority. Before any candidate reaches a canonical listing revision, G4 now:

1. resolve Product Truth only from the G3 project head;
2. resolve limits from C1, never from request fields;
3. run canonical C2 claim/IP rules by surface;
4. persists full immutable research and intelligence snapshots;
5. binds their exact IDs/hashes in the G2 listing dependency manifest.

The old donor `staffWorkflow.js`, mutable draft tables, `factsConfirmed` boolean and route implementation are explicitly rejected and will not be transplanted.

## Real-file probes

```text
Cerebro_Hija.xlsx   1,099 rows, 40/40 source columns retained (including blank-header translation column)
Xray_Hija.xlsx         19 rows, 32/32 source columns retained
Amazon total        1,118 rows, 0 unconsumed rows

Three Etsy CSVs       195 rows, 36/36 columns recognized
Unique Etsy listings  176
Unmapped columns        0
Truncated rows           0
```

## Remaining gates

- Independent read-only re-review returned `READY` with no concrete blocker after the terminal-state race fixture passed.
- Run browser UAT with the real Hija files when browser-control capacity is available.
- Replace the DRAFT_ONLY fixture with an Owner-confirmed, account/site/category-specific approval contract and a lifecycle snapshot complete through the approval effective time. Until then, draft/edit/save works but `MANAGER_APPROVED` and `SUBMITTED` remain deliberately blocked.
- Decide and test an explicit multilingual Product Truth alias contract. Today an English material fact does not automatically corroborate its Spanish equivalent; the guard blocks rather than translates by inference.
- Image generation remains external. This slice creates safe prompt packages but does not call an image provider.

No remote push, merge, deployment, VPS change or marketplace submission was performed.

## Full-inventory disclosure

The canonical inventory contains 84 suites. The latest Windows run was stopped at the already-known Vite child-process shutdown hang. Before that point, two legacy live-provider assertions received the explicitly surfaced `503` provider-unavailable response and runner accounting reproduced its Windows process-state mismatch. Two change-related regressions found during that run (legacy dependency-manifest compatibility and missing-array UI handling) were repaired and rerun green: 45/45 and 19/19. These results are not described as a clean full-system pass.
