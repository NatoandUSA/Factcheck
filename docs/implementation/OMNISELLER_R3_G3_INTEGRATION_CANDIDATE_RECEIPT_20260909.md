# OmniSeller R3 — G3 Canonical Vertical Slice Candidate Receipt

Date: 2026-09-09 (Asia/Bangkok)

Branch: `codex/omniseller-r3-g3-final`

Accepted base: G2 `e79777684bd2b3d14c54d7a591a952b6c5191366`

Status: **REVIEW CANDIDATE — DO NOT MERGE, PUSH, DEPLOY OR SUBMIT**

## Outcome

G3 now exposes one provider-independent, project-first canonical path:

```text
authenticated workspace + persisted project classification
  -> append-only Product Truth STAFF_DRAFT
  -> immutable Manager/Owner confirmation
  -> zero-write deterministic preview
  -> canonical listing root + immutable revision v1
  -> immutable edit revision v2
  -> scoped history/reopen
```

This is a usable bootstrap slice, not the finished Amazon/Etsy production workflow. It deliberately stops before canonical approval/export because the checked-in public policy contracts are `DRAFT_ONLY` and the saved draft has no persisted research/intelligence snapshot yet.

## Canonical storage added

- Workspace policy target: server-owned `seller_account_label` and `site`.
- Project classification: `locale`, `media_class`, `product_type_id`, `category_id`, `product_family_version`.
- Project head pointer: `head_product_truth_revision_id`.
- Append-only `product_truth_revisions` with hash, parent and revision number.
- Append-only `product_truth_confirmations` bound to the exact revision hash.
- Idempotent `product_truth_write_receipts`.
- G2 `listing_revisions` and write receipts remain the only canonical listing-history writer.

Legacy listing-bound Product Truth remains legacy-readable. It is not promoted into the new project authority and no historical authority is invented.

## Canonical HTTP surface

- `POST /api/projects`
- `POST /api/projects/:id/product-truth/revisions`
- `GET /api/projects/:id/product-truth/revisions`
- `POST /api/projects/:id/product-truth/revisions/:revisionId/confirm`
- `POST /api/projects/:id/listings/compose-preview`
- `POST /api/projects/:id/listings`
- `GET /api/projects/:id/listings`
- `POST /api/listings/:id/revisions`
- `GET /api/listings/:id/revisions`
- `GET /api/listings/:id/revisions/:revisionId`

Each mutation has an exact top-level allowlist. The server derives tenant, workspace, marketplace, seller-account identity, policy binding, claim/IP binding, validator binding, state and authority. Client-supplied dependency or authority fields are rejected.

## Safety and authority decisions

- Product Truth is current only through the project head pointer; newest-row inference is not authority.
- Manager/Owner confirmation verifies the current scoped revision and its exact content hash.
- Preview contains only asserted Product Truth and writes no canonical or receipt rows.
- Save and edit re-run claim, IP and C1 draft-policy validation server-side.
- Missing research/intelligence is explicit in the dependency manifest as `INCOMPLETE`; safe internal save is allowed.
- A newly saved canonical root starts at `NEEDS_QA`.
- Canonical roots cannot be edited, approved or exported through legacy routes.
- Legacy approval returns `CANONICAL_APPROVAL_ROUTE_REQUIRED`.
- Legacy export returns `CANONICAL_EXPORT_PACKAGE_ROUTE_REQUIRED`.
- No public draft policy is allowed to become approval or export authority.

## Exact Windows Node 22 evidence before candidate commit

```text
G2 immutable revisions                         45/45 PASS
G3 project Product Truth revisions             18/18 PASS
G3 canonical HTTP bootstrap                     40/40 PASS
C1 policy contract registry                     10 groups PASS
C2 claim guard                                  18/18 PASS
C2 IP matcher                                   12/12 PASS
C3 claim/policy integration                      6/6 PASS
Route registry                       69 discovered; 65 authenticated non-public PASS
P0 route security                                  PASS
Workspace switching/auth security                 PASS
Backup/restore and migrations                      PASS
Legacy migration idempotency/isolation             PASS
H0 state migration                              42/42 PASS
H0 publish integrity                            46/46 PASS
Production build: 2,425 modules transformed          PASS
git diff --check                                    PASS
```

The HTTP bootstrap specifically proves project creation, staff Product Truth, Owner confirmation, zero-write preview, immutable v1/v2, reload of both versions, forged dependency rejection, and no-write blocking of legacy edit/approval/export against the canonical root. It also proves a committed T1 write replays after the Product Truth head advances to T2, while a new write against stale T1 is rejected.

## Independent review round 1 remediation

Independent review of local SHA `38834d6dc789e0f7e277f652e4cd2b731dbffe1a` returned no P0 and two P1 findings. Both were reproduced and remediated before this successor candidate:

1. Product Truth, listing and creative receipt replay is now actor-bound. A different actor reusing the same scope/operation/key receives `IDEMPOTENCY_KEY_ACTOR_MISMATCH`; it cannot obtain a success response attributed to the original actor.
2. Canonical listing writes now place selected Product Truth identity in the server-derived request envelope, replay a committed receipt before mutable validation, and assert the exact Product Truth head ID/hash inside the same `BEGIN IMMEDIATE` transaction that commits the listing revision.

Permanent regression probes cover cross-actor Product Truth/listing/creative replay, replay after Product Truth head advancement, zero extra writes on replay, and rejection of a new stale-head write.

Independent review round 2 confirmed those original flaws closed and identified two remediation regressions. The successor keeps the predecessor request-envelope hashes compatible while enforcing actor ownership through immutable receipt `created_by`, so same-actor retries survive an upgrade and cross-actor retries remain blocked. It also persists C2 validation accounting and its SHA-256 hash on every canonical listing revision. Save, edit, history and reopen therefore retain backend-keyword exclusions and flagged PPC claims instead of losing their only warning signal.

Independent review round 3 found that adding the accounting columns inside already-recorded migration `011` would break databases that had run an earlier candidate. The columns now have their own transactional migration `012_listing_revision_validation_accounting`. A permanent upgrade ratchet simulates a database with marker `011` and no accounting columns, runs current migrations twice, and verifies both columns plus exactly one `012` marker.

## Explicitly not certified in G3

- Owner-scoped `APPROVAL_ELIGIBLE` Amazon/Etsy policy contracts.
- Canonical approval records or exact export packages.
- Persisted Xray/Cerebro/Etsy research and intelligence snapshot bindings.
- Full Hija/Esposa commerce composition and keyword allocation.
- Full image-prompt set, A+ creative revisions or external AI image generation.
- Browser UAT; the browser-control service was unavailable because the account tool quota was exhausted, and no workaround was used.
- Linux exact-SHA certification and independent exact-SHA acceptance; these occur only after the candidate commit.

## Next bounded gate

1. Commit this candidate locally and bind all evidence to its exact SHA.
2. Obtain independent review of scope isolation, idempotency, immutable authority, DTO rejection, policy binding and legacy bypasses.
3. Run exact-SHA Node 22 Linux tests/build if the independent review finds no P0/P1.
4. Only then mark G3 accepted and begin G4 real-data Amazon/Etsy composition and creative outputs.

No remote push, merge, VPS mutation, deployment or marketplace submission was performed.
