# GPT1 OmniSeller Canonical Baseline & Reuse Audit for Handoff V3

Date: 2026-09-21
Role: GPT1 independent evidence/review lane
Runtime mutation: NONE

## Canonical baseline

Repository:
NatoandUSA/Factcheck

Canonical main:
6ec92824954a43cce90d55fe82766b6e90624b01

Tree:
3055032a51cc0cd097ebd7e65d9e7cc2fbad2f4d

Open pull requests observed:
0

Dirty root:
D:\Claude\Factcheck
NON-CANONICAL / DO NOT USE FOR RELEASE EVIDENCE

Exact clean detached review worktree:
D:\Claude\Factcheck-worktrees\full-review-6ec928

GPT1 design/review worktree:
D:\Claude\Factcheck-worktrees\gpt1-handoff-v3-consumer-review-v1

## Existing canonical capabilities worth reusing

### 1. Canonical JSON and hashing

server/revisionStore.js already provides a strict JSON clone/canonicalization pattern:
- NFC normalization;
- sorted object keys;
- non-finite number rejection;
- forbidden prototype keys;
- normalized-key collision rejection;
- depth and byte bounds;
- SHA-256 hashing.

Recommendation:
Codex should reuse or factor an equivalent shared primitive instead of adding a second unrelated JSON canonicalizer.

Caution:
The Social producer uses ECOM_CANONICAL_ARTIFACT_V1 semantics. Consumer verification must be byte-compatible with the Social canonical artifact codec, not merely semantically similar.

### 2. Immutable persistence patterns

Canonical migrations already use immutable UPDATE/DELETE triggers on:
- research_imports;
- research_snapshots;
- intelligence_snapshots;
- commerce_write_receipts;
- commerce_workflow_artifacts.

Recommendation:
Reuse the immutability pattern.

Do not reuse a commerce-authority table merely for convenience if its semantics imply Product Truth/listing/commerce authority.

### 3. Research storage

Existing:
- research_imports
- research_snapshots
- project-scoped research_evidence

These demonstrate that OmniSeller already has a research evidence domain.

Recommendation:
Codex should inspect whether one can safely represent external Social research evidence without overloading marketplace import semantics.

research_imports currently constrains kind to marketplace-specific forms such as AMAZON_XRAY / AMAZON_CEREBRO / AMAZON_REFERENCE / ETSY_SEARCH, so it should NOT be overloaded silently for Social Handoff V3.

Likely safe directions:
- dedicated minimal social_research_handoffs store; or
- explicit versioned extension to a neutral research-evidence abstraction after migration review.

### 4. Scope isolation

Canonical main already has repeated tenant/workspace/marketplace/project scoping and IDOR-safe patterns.

Recommendation:
Consumer destination scope must be authenticated/mapped on Omni side. Never accept tenant/workspace/project authority from Social payload.

### 5. Idempotency and receipts

Canonical stores already implement:
- idempotency key + request hash;
- receipt replay;
- unique scoped operation keys;
- transactional replay checks.

Recommendation:
Reuse the pattern, but preserve distinction:

receipt nonce replay protection
!=
artifact idempotency.

### 6. Concurrency

revisionStore.js already uses serialized write queues and transaction-level replay patterns.

Recommendation:
Codex should evaluate whether the Handoff consumer can reuse the same transaction/queue convention rather than invent a competing lock subsystem.

## Existing capability that must NOT be reused semantically

Do not persist Handoff V3 as:
- product_truth_revisions;
- intelligence_snapshots that require Product Truth;
- listing revisions;
- commerce_workflow_artifacts if that implies commerce-stage authority;
- submission or approval receipts.

The Social artifact is external research evidence only.

## Branch / worktree observations

Many historical Codex and feature branches remain.

No open PR existed at review time.

No existing remote branch named codex/omniseller-handoff-v3-consumer was observed.

Therefore Codex can create:

codex/omniseller-handoff-v3-consumer

from exact main 6ec92824954a43cce90d55fe82766b6e90624b01,
provided main remains unchanged at branch creation time.

GPT1 will not create that runtime branch.

## Review implications

A correct implementation should be small:
- schema / verification primitive;
- minimal scoped immutable persistence;
- one intake route / service;
- read-only research display if needed;
- tests and migration.

A large subsystem, marketplace parser, Product Truth integration, listing workflow, or Social duplicate is architectural drift.

## Exact next Codex checkpoint

Before any runtime write Codex should report:

BASE SHA
BASE TREE
target files
chosen persistence model
chosen canonical codec/HMAC verification path
scope mapping strategy
nonce store strategy
artifact idempotency strategy
zero-commerce-mutation test plan

GPT1 will review that implementation only after an exact successor HEAD exists.
