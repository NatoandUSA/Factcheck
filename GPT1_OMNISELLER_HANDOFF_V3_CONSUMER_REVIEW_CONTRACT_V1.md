# GPT1 OmniSeller Handoff V3 Consumer Review Contract V1

Status: REVIEW / DESIGN ONLY
OmniSeller runtime mutation: NONE
Social runtime mutation: NONE
Production mutation: NONE

## 1. Frozen baselines

Social production:
- release SHA: 2ae2316ba73abd1fac75b706d2d41b9487bb4321
- release tree: 9e454ca12c19c47c1625f7f2f7663fe2e69f7ed8
- state: ACTIVE_VERIFIED
- authority: RESEARCH_ONLY
- market validation: NOT_CONNECTED
- OmniSeller: DISCONNECTED

OmniSeller canonical main at contract creation:
- SHA: 6ec92824954a43cce90d55fe82766b6e90624b01
- tree: 3055032a51cc0cd097ebd7e65d9e7cc2fbad2f4d
- source: GitHub main
- dirty root D:\Claude\Factcheck is explicitly non-canonical release evidence

Any advance of OmniSeller main changes the Phase 2 implementation base and requires base revalidation.

## 2. Ownership

Codex owns:
- canonical full review of OmniSeller implementation surface;
- clean integration branch creation;
- runtime implementation;
- schema/migration/route/UI changes;
- CI and release evidence.

GPT1 owns:
- review contract;
- fixture/adversarial oracle;
- exact base/head independent review;
- post-merge and production read-only UAT review.

GPT1 MUST NOT implement the consumer runtime.

## 3. Consumer mission

The Handoff V3 consumer may only:

receive
-> verify
-> bind scope
-> persist immutable RESEARCH_ONLY artifact
-> display for human research review

It MUST NOT:

- create or update Product Truth;
- create or update listings or creatives;
- approve, export, submit, or publish;
- claim sellability;
- claim marketplace demand validation;
- write to marketplaces;
- auto-create a commercial test;
- mutate Social state.

## 4. Trust boundary

The consumer must treat the Social response as untrusted until all checks pass.

Required verification, fail-closed:

1. JSON/schema validity for OMNISELLER_INTELLIGENCE_HANDOFF_V3.
2. authority.classification === RESEARCH_ONLY.
3. productTruth === false.
4. approvalAuthority === false.
5. publishAuthority === false.
6. marketplaceWrite === false.
7. marketValidationCapability === NOT_CONNECTED.
8. receipt.authentication === HMAC_SHA256.
9. receipt.signatureScope === PAYLOAD_RECEIPT_TRANSPORT_V1.
10. receipt.artifact.domain === OMNISELLER_HANDOFF_V3.
11. transportDigestAuthority === SERVER_HMAC_AUTHENTICATED_ARTIFACT.
12. transportDigest === receipt.artifact.sha256.
13. canonical artifact identity recomputes exactly.
14. HMAC recomputes over exact canonical envelope:
    { payload, receipt-without-signature, transportDigest, transportDigestAuthority }.
15. issuedAt / expiresAt valid and receipt not expired.
16. nonce valid UUID and replay-protected.
17. sourceRelease.gitSha matches the explicitly trusted Social source SHA.
18. sourceRelease.deploymentId matches the explicitly trusted Social deployment ID.
19. sourceRoleRegistryVersion is recognized.
20. any reviewedPromotionQueue artifact must use domain RESEARCH_OPPORTUNITY_V2.

No single successful check may bypass another.

## 5. Expected trusted Social identity for initial UAT

Trusted Social release SHA:
2ae2316ba73abd1fac75b706d2d41b9487bb4321

Trusted Social deployment ID:
ee11aa7d-e76f-4f72-9771-e6570ddaeb8a

Expected schema:
OMNISELLER_INTELLIGENCE_HANDOFF_V3

Expected source role registry:
SOURCE_ROLE_REGISTRY_V1

Expected market:
US

These values are deployment-specific configuration, not hard-coded forever. Rotation/redeploy requires an explicit trust update.

## 6. Secret handling

The consumer and Social producer may share the integration HMAC secret only after Owner authorizes V3 integration.

Required:
- secret never stored in repo, fixture, log, database payload, UI, or receipt;
- use a dedicated secret for Handoff V3;
- rotate the pre-provisioned disconnected token before production integration;
- compare signatures in constant-time;
- failed signature must reveal no secret-derived detail.

Fixture tests use a synthetic test secret only.

## 7. Replay and idempotency semantics

Two distinct protections are required.

### Receipt nonce replay

A valid nonce may be accepted once for the configured replay window.

Second use of the same nonce:
REJECT_NONCE_REPLAY

Nonce replay rejection MUST occur even if payload/artifact is identical.

### Artifact idempotency

The same already-verified artifact may be delivered again under a fresh valid receipt/nonce.

Expected:
- do not create duplicate immutable research artifact;
- return the existing artifact identity / ingestion result;
- do not alter authority;
- do not mutate commerce state.

Therefore:
nonce identity != artifact identity.

## 8. Scope binding

OmniSeller is tenant/workspace/project bound.

The consumer must not silently infer destination scope from Social.

Required intake scope:
- tenantId from authenticated Omni session / authorized integration mapping;
- workspaceId from authenticated Omni scope / explicit mapping;
- marketplace must be explicit and compatible with the selected project;
- projectId must exist inside the same tenant/workspace/marketplace scope.

Cross-tenant/workspace/project injection:
fail closed with non-enumerating semantics.

The Social artifact itself is research evidence; it cannot override Omni scope.

## 9. Persistence requirements

Preferred design direction based on canonical main inspection:

Existing reusable capabilities:
- strict canonical JSON normalization / hashing patterns in revisionStore.js;
- immutable database-trigger patterns;
- idempotency receipt patterns;
- tenant/workspace/marketplace/project scoping;
- existing research_imports / research_snapshots model;
- existing commerce_write_receipts pattern for operation replay.

Important constraint:
Do NOT store the Social Handoff directly as Product Truth, intelligence snapshot, listing revision, commerce workflow artifact, or submission artifact.

Codex should first determine whether to:
A. extend an existing neutral research artifact store safely; or
B. add a minimal dedicated immutable social_research_handoffs table.

Whichever is chosen must preserve:
- full verified envelope or canonical bytes;
- artifact hash;
- source SHA;
- deployment ID;
- issuedAt;
- expiresAt;
- nonce receipt audit;
- tenant/workspace/marketplace/project scope;
- ingestedAt / ingestedBy;
- RESEARCH_ONLY classification;
- unique artifact identity;
- unique accepted nonce identity.

Immutable means UPDATE/DELETE of accepted artifact rows is prohibited except explicit retention governance outside this phase.

## 10. Commerce-zero invariant

A successful ingest must produce zero writes to:
- product_truth_revisions;
- product_truth_families;
- listings;
- listing_revisions;
- creative revisions;
- submission requests;
- submission exports;
- approvals;
- marketplace write queues;
- commercial experiment records.

Canonical tests must snapshot row counts/hashes before and after ingest.

Expected delta:
only research-handoff persistence + replay/audit receipt storage.

## 11. Concurrency

Two concurrent valid requests for the same artifact:

Expected:
- exactly one immutable artifact row;
- deterministic idempotent response to both callers;
- no duplicate research object;
- no partial nonce/artifact state;
- no commerce mutation.

Two concurrent requests with same nonce but different artifact:

Expected:
- at most one accepted;
- other fails NONCE_REPLAY or equivalent;
- transaction preserves consistency.

## 12. Failure classification

Recommended stable error families:

HANDOFF_SCHEMA_INVALID
HANDOFF_AUTHORITY_INVALID
HANDOFF_ARTIFACT_INTEGRITY_FAILURE
HANDOFF_SIGNATURE_INVALID
HANDOFF_RECEIPT_EXPIRED
HANDOFF_RECEIPT_TIME_INVALID
HANDOFF_NONCE_INVALID
HANDOFF_NONCE_REPLAY
HANDOFF_SOURCE_RELEASE_MISMATCH
HANDOFF_SOURCE_DEPLOYMENT_MISMATCH
HANDOFF_SOURCE_REGISTRY_UNSUPPORTED
HANDOFF_SCOPE_NOT_FOUND
HANDOFF_SCOPE_FORBIDDEN
HANDOFF_PROJECT_SCOPE_MISMATCH
HANDOFF_RESEARCH_ARTIFACT_DOMAIN_INVALID

Exact names may differ, but fail-closed semantics must be testable and stable.

## 13. UI boundary

Human research review UI may show:
- phrase / keyword;
- research priority score and version;
- Social evidence source families;
- observed marketplace public signals as observations only;
- Social lifecycle;
- source SHA/deployment;
- verification status;
- artifact hash;
- received timestamp.

UI must not label the artifact:
- sellable;
- validated demand;
- approved;
- ready to list;
- ready to publish;
- Product Truth;
- marketplace validated.

## 14. Audit expectations

Implementation must add canonical tests for:
- valid envelope;
- payload tamper;
- receipt tamper;
- signature tamper;
- transport digest tamper;
- expired receipt;
- invalid future/temporal receipt;
- nonce replay;
- same artifact fresh receipt retry;
- wrong source SHA;
- wrong deployment ID;
- wrong artifact domain;
- wrong authority flags;
- unsupported schema/registry version;
- cross-tenant/workspace/project injection;
- concurrent same-artifact ingestion;
- concurrent same-nonce conflict;
- zero commerce mutation.

## 15. Exact-head independent review

GPT1 verdict binds:
BASE -> HEAD -> TREE.

Required evidence:
- clean exact worktree;
- Node 22 canonical CI;
- migration rehearsal if schema changes;
- full relevant regression;
- idempotency/concurrency tests;
- zero-commerce-mutation test;
- audit / build / diff-check;
- production unchanged before authorization.

Any new commit invalidates the prior verdict.

## 16. Phase 2 closure

Phase 2 closes only when:
- 2 independent ACCEPTs;
- Owner merge authorization;
- merge and merged-SHA CI PASS;
- integration secret rotated;
- Owner integration/deploy authorization;
- atomic deploy;
- read-only production UAT PASS;
- persisted artifact remains RESEARCH_ONLY;
- Product Truth/listing/approval/export/publish state unchanged.

Only then may Phase 3 Market Validation Receipt V1 be designed.
