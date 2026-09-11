# W0 Receipt 4 — Submission-State and Authority Audit

**Audited baseline:** `a02db42f63ab76a4091863c53d2fa649fbcc2864`  
**Finding:** current source conflates Owner authorization with external operator reporting and uses misleading bare `SUBMITTED`.

## Current behavior

```text
Seller POST /api/listings/:id/submission-requests
→ immutable canonical_submission_requests row
→ status response SUBMISSION_REQUESTED

Owner POST /api/listings/:id/submission-handoffs
→ requires confirmedExternalSubmission=true
→ requires externalReference and notes
→ inserts canonical_submission_handoffs.submitted_by/submitted_at
→ UPDATE listings SET status='SUBMITTED'
→ response status SUBMITTED
→ response marketplacePublishingPerformed=false
```

The UI says Owner must confirm external submission and offers `Owner ghi nhận SUBMITTED`. This is semantically contradictory and violates the ratified authority chain.

## Affected source surfaces

| Surface | Current responsibility |
|---|---|
| `server/canonicalReviewHandoffStore.js` | request creation, Owner-only external confirmation, handoff insertion, bare status mutation |
| `server/server.js` | Seller request route, Owner handoff route, DTO fields and listing queue reads |
| `server/database/migrations.js` | request/handoff tables, `submitted_by`, `submitted_at`, request binding |
| `src/components/CanonicalCommerceWorkflow.jsx` | Owner external-confirmation UI and bare SUBMITTED display |
| `server/revisionStore.js` and review logic | treats `SUBMITTED` as terminal |
| focused HTTP/migration/UI tests | encode the old role/state semantics |

## Required model

```text
1. Seller creates SUBMISSION_AUTHORIZATION_REQUESTED
   bound to listing revision, review, dependency hash and package hash.

2. Owner creates SUBMISSION_AUTHORIZED
   bound to the same exact package hash.
   Owner does not claim an external action occurred.

3. System produces/reveals exact export
   and records export hash/version; no marketplace write.

4. Seller/operator submits outside OmniSeller.

5. Seller/operator appends OPERATOR_REPORTED_SUBMITTED
   or OPERATOR_REPORTED_NOT_SUBMITTED/correction with evidence/reference.
```

No Phase 1 event means marketplace accepted, published or made the listing live.

## Physical migration strategy

Prefer append-only event tables/rows rather than renaming historical facts in place:

- retain `canonical_submission_requests` as historical request evidence; add explicit event/type only if necessary;
- introduce an immutable Owner authorization record bound to request id and exact package hash;
- introduce an immutable operator report record bound to authorization/export;
- keep old `canonical_submission_handoffs` rows readable as `LEGACY_OWNER_RECORDED_EXTERNAL_CONFIRMATION`, not silently reinterpret them as authorization or marketplace acceptance;
- stop new writes to the legacy handoff route after cutover;
- derive current display state from the latest valid dependency-bound events;
- never mutate a historical `SUBMITTED` row to pretend it was a different event;
- preserve rollback through DB backup/restore and compatibility reads.

Whether listing root `status` gains new enum values or becomes a derived projection is a GPT2 schema decision. The event history is authoritative; a bare terminal status must not be the only evidence.

## Exact authorization binding

Owner authorization must cover:

```text
tenant/workspace/marketplace/project/listing
listing revision id + content hash
dependency manifest hash
Manager review id
Product Truth revision/hash/confirmation
Master Keyword artifact id/hash
package hash
authorization actor/time/reason
```

Any subsequent listing/dependency change invalidates the authorization and requires a new request/review/authorization.

## Role matrix

| Action | Seller | Manager | Owner | Operator |
|---|---:|---:|---:|---:|
| Edit/save NEEDS_QA | yes | yes if existing policy permits | yes if existing policy permits | no implicit access |
| Manager QA decision | no | yes | yes only if governance explicitly permits | no |
| Request submission authorization | yes | no | no | no |
| Authorize exact package | no | no | yes | no |
| Download exact authorized export | policy-scoped yes | policy-scoped | yes | policy-scoped |
| Perform external submission | business action outside app | no default | not implied by Owner role | Seller/operator |
| Record operator report | Seller/operator identity | no | only if separately acting as operator with explicit role/audit | Seller/operator |

One human may hold multiple memberships, but each event records the role/capacity used. Owner is not automatically operator.

## Negative tests required

- Seller cannot authorize;
- Manager cannot authorize or report submission by virtue of QA role;
- Owner authorization cannot claim external submission;
- operator cannot report without exact current authorization/export;
- stale request/package/dependency/revision rejected;
- cross-tenant/workspace/project/listing ids rejected without disclosure;
- replay exact request is idempotent; changed body/key reuse rejected;
- Owner authorization alone never returns `OPERATOR_REPORTED_SUBMITTED`;
- operator report never returns marketplace accepted/live;
- legacy handoff read remains historically labeled;
- terminal/correction behavior is explicit and tested.

## Timing boundary

This defect is documented in W0 and must be designed now, but its product implementation belongs to W5 unless an earlier W1 route-retirement change would otherwise expose the misleading write path. During W1–W4, the legacy Owner submission write must be hidden/disabled from the new staff path and protected from accidental use.

## Requested verdict

```text
CURRENT MODEL:             REJECT
AMENDMENT AUTHORITY MODEL: RECOMMEND ACCEPT
MIGRATION DESIGN:          GPT1/GPT2/GPT4 REVIEW REQUIRED
W1 CONDITION:              OLD WRITE PATH NOT STAFF-REACHABLE
```

