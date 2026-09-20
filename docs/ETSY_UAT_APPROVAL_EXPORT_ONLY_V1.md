# Etsy commercial revision and UAT approval/export-only policy V1

## Purpose

This policy lets staff exercise the complete internal evidence chain on a dedicated Etsy UAT project:

```text
immutable listing revision
→ Manager exact-package review
→ Seller requests exact UAT export
→ Owner authorizes that exact package
→ Seller downloads immutable audit JSON
→ stop
```

It does **not** authorize marketplace submission, operator submission reporting, or publishing.

## Immutable commercial content

The canonical Etsy listing content owns these normalized scalar fields:

| Field | Contract |
| --- | --- |
| `shopName` | NFC string, trimmed, at most 120 characters, no control characters |
| `priceAmount` | Positive fixed-decimal string, at most two fractional digits |
| `priceCurrency` | Three uppercase letters, for example `USD` |

They participate in the listing revision content JSON and content hash. They therefore travel unchanged through the exact review package and exact export. A QA edit creates a successor revision; it never mutates the parent revision.

Draft creation may leave the fields empty. In `UAT_APPROVAL_EXPORT_ONLY`, Manager approval fails closed until all three are present.

## Authorization authority

Only an authenticated Owner may create `APPROVAL_EXPORT_ONLY` authorization. It is:

- project-, tenant-, workspace-, and marketplace-scoped;
- Etsy-only;
- permitted only before the project has any listing;
- immutable after insertion;
- idempotent by an exact request hash;
- bound to the server-derived Owner identity and server timestamp;
- included in the policy-context dependency hash of every later listing revision.

Enabling UAT is an explicit lifecycle selection for a disposable project, not a way to upgrade an existing listing.

## Allowed operations

| Operation | UAT result |
| --- | --- |
| Save draft / QA successor | Allowed; immutable revision, status `NEEDS_QA` |
| Manager exact-package approval | Allowed when Product Truth, dependencies, claim/IP/policy validation, shop identity, and price/currency pass |
| Seller export request | `UAT_EXPORT_REQUESTED` |
| Owner exact-package authorization | `UAT_EXPORT_AUTHORIZED` |
| Seller exact audit export | `UAT_EXACT_EXPORT_READY` / `UAT_EXACT_AUDIT_EXPORT` |
| Marketplace submission/report | Forbidden server-side with `UAT_MARKETPLACE_SUBMISSION_FORBIDDEN` |
| Legacy canonical handoff | Retired and unavailable |

The UAT audit file declares `uatOnly: true` and `marketplaceSubmissionAllowed: false`, and binds the lifecycle authorization id, hash, actor, and timestamp.

## Non-authority rules

- A Preview score is advisory and never grants approval or submission authority.
- Competitor research must never supply the shop identity or price of the product being listed.
- UAT approval does not change the underlying marketplace policy contract into an approval-eligible publishing contract.
- The exact audit export is evidence for review; it must not be uploaded to a marketplace.
- No UI state can override the server lifecycle capability.

## Required UAT assertions

1. Missing commercial fields block Manager approval with stable blocker codes.
2. QA edit persists commercial fields only through an immutable successor revision.
3. Exact review package contains the same commercial values and lifecycle authorization.
4. Manager approval, Seller request, Owner authorization, and exact audit export bind the same head revision and hashes.
5. The exported JSON contains the exact shop/price/currency values and UAT-only markers.
6. Operator submission report returns `409 UAT_MARKETPLACE_SUBMISSION_FORBIDDEN` and writes no marketplace event.
7. Stale-head and dependency-rebind protections remain fail-closed.

Marketplace publishing remains outside this policy and requires a separate future policy contract, authorization, and UAT.
