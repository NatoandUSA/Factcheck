# OmniSeller Social Handoff V3 Consumer — Phase 2A

## Scope

Phase 2A adds only a verified, immutable intake boundary for the Social Listening Handoff V3 artifact.
It does not create Product Truth, projects, marketplace research snapshots, listings, approvals, exports,
submission reports, or marketplace writes. There is no UI in this phase.

## Authority boundary

- Source authority must be `RESEARCH_ONLY`.
- `marketValidationCapability` must be `NOT_CONNECTED`.
- Product Truth, approval, publish, and marketplace-write authority must all be `false`.
- The source Git SHA and Cloudflare deployment ID are exact server configuration pins.
- The Social codec/HMAC is verified independently of OmniSeller's internal artifact codec.

## Pull endpoint

`POST /api/integrations/social-listening/handoffs/pull`

The endpoint requires an authenticated `OWNER` session and a body containing an idempotency key:

```json
{ "idempotencyKey": "social-handoff-uat-0001" }
```

OmniSeller performs the upstream GET itself. The Handoff token never enters the browser.

## Required server configuration

```text
SOCIAL_HANDOFF_URL=https://intel.theglobalserviceteam.site/api/integrations/omniseller/opportunities
OMNISELLER_HANDOFF_TOKEN=<rotated shared secret, at least 32 characters>
SOCIAL_HANDOFF_ALLOWED_SOURCE_SHA=2ae2316ba73abd1fac75b706d2d41b9487bb4321
SOCIAL_HANDOFF_ALLOWED_DEPLOYMENT_ID=ee11aa7d-e76f-4f72-9771-e6570ddaeb8a
```

The token and pins are not configured or rotated by this implementation commit. Integration cutover and
secret rotation require a later explicit release authorization.

## Verification

The verifier enforces the V3 JSON schema, bounded canonical JSON, exact source release pins, receipt time
window, domain-separated artifact identity, promotion artifact identities, transport digest, HMAC signature,
and constant-time digest comparison. Nonce replay, idempotency conflicts, oversized upstream responses,
unexpected content type, redirects, and non-HTTPS/malformed endpoint configuration fail closed.

## Persistence

Migration `020_social_handoff_v3_consumer` creates:

- `external_research_handoffs`: tenant-scoped immutable Handoff envelopes with globally unique source nonce.
- `external_research_handoff_receipts`: actor-bound idempotency receipts.

Both tables reject update and delete operations through SQLite triggers. Artifact, receipt, and audit-event
writes share one `BEGIN IMMEDIATE` transaction, so an injected audit failure rolls back the entire intake.

## Deferred to Phase 2B+

- Staff read/list/detail UI.
- Human selection or adoption into an OmniSeller research project.
- Any marketplace validation receipt.
- Any Product Truth/listing/approval/export/publish integration.
- Production secrets, migration rehearsal, deploy, and live cross-system pull.
