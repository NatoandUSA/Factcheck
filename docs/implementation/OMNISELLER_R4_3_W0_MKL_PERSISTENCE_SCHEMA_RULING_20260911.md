# W0 Receipt 3 — Master Keyword Persistence Schema Ruling

**Decision target:** donor `commerce_workflow_artifacts` versus a new `keyword_snapshots` table  
**Coordinator verdict:** `USE ONE GENERIC ARTIFACT STORE IN PRINCIPLE — CHANGES REQUESTED BEFORE PHYSICAL MIGRATION ACCEPTANCE`

## Decision

Do not add `keyword_snapshots`. Use a single immutable workflow-artifact store for Amazon and Etsy Master Keyword artifacts, while keeping `intelligence_snapshots` as the separate truth-bound analysis/composition domain.

The donor `commerce_workflow_artifacts` schema is a viable base because it already provides scope, kind, revisions, parent links, dependency/payload/accounting hashes, engine binding and immutable triggers. It must not be transplanted unchanged because the implementation has isolation/idempotency and envelope-integrity defects.

## Intended domain separation

```text
research_imports / research_snapshots
  → observed research and normalized evidence

commerce_workflow_artifacts
  → decision artifacts independent of Product Truth
  → AMAZON_MASTER_KEYWORDS / ETSY_MASTER_KEYWORDS
  → optional ASIN/winner/pattern decision records

product_truth_revisions
  → verified product facts

intelligence_snapshots
  → truth-bound allocation/audit derived from exact MKL + exact Truth

listing_revisions
  → exact customer-facing draft and dependency manifest
```

Only `commerce_workflow_artifacts` may write canonical MKL revisions. `intelligence_snapshots` may consume an exact MKL artifact but must not silently generate or replace a competing MKL.

## Positive donor properties verified

- scoped project existence check;
- per-kind monotonically increasing revision and parent id;
- optimistic expected-head check;
- immutable update/delete triggers;
- payload, dependencies and accounting hashes;
- stored engine binding;
- scoped reads;
- 25/25 focused donor tests pass;
- 4/4 existing submission migration tests pass.

These test counts describe focused suites, not whole-system certification.

## P1 schema/implementation corrections

### S1 — project-unbound idempotency replay / IDOR risk

Current duplicate lookup is scoped by tenant, workspace, marketplace, kind and idempotency key, but **not `project_id`**. Its unique constraint also omits project. If a key is reused across projects, the function returns the prior artifact before checking the requested project.

Required:

```text
UNIQUE(tenant_id, workspace_id, marketplace, project_id, kind, idempotency_key)
duplicate lookup includes project_id
duplicate response cannot cross project scope
```

### S2 — no request-hash replay validation

The table stores an artifact hash but no canonical request hash. Reusing one idempotency key with different dependencies/payload/accounting returns the old artifact as a successful duplicate.

Required:

- compute request hash over canonical operation, full scope, project, kind, expected head, dependencies, payload, accounting and change reason;
- store it;
- exact same key + exact same request hash + same actor may replay;
- mismatch returns `IDEMPOTENCY_KEY_REUSE` 409;
- actor mismatch returns an explicit 409/403 without leaking artifact content.

### S3 — artifact hash does not bind identity/context

Current `artifact_hash` covers only component hashes and engine binding. It does not bind tenant/workspace/marketplace/project/kind/revision/parent/creator.

Required: hash a canonical immutable envelope that includes scope, project, kind, revision, parent, dependency hash, payload hash, accounting hash, engine/policy/parser/scoring bindings and creator. Reads verify the full envelope.

### S4 — process-local lock is not cross-process CAS

The WeakMap queue serializes only one Node process. Expected-head checking plus unique revision can race across workers/restarts and surface as an unclassified SQLite constraint error.

Required: `BEGIN IMMEDIATE`, recheck idempotency and head inside the transaction, translate unique/race failures to deterministic 409, and prove concurrent tests.

### S5 — unbounded JSON payload and index strategy

No explicit maximum applies to dependency/payload/accounting JSON.

Required: documented byte ceilings, per-file/raw evidence stored in existing import storage rather than copied into MKL JSON, row/accounting limits, and index/query plan evidence.

### S6 — incomplete binding/version contract

One engine hash is computed from a mixed fixed file set and does not expose parser/scoring/policy versions separately.

Required: store explicit version/binding hashes for parser, normalization, scoring/allocation and policy context relevant to the artifact.

### S7 — optional decisions must not become mandatory ancestry

`AMAZON_ASIN_BATCH_PLAN`, `AMAZON_CEREBRO_BINDING`, `ETSY_WINNER_SET` and `ETSY_PATTERN_SNAPSHOT` may be persisted for explainability, but MKL creation cannot require batch ancestry or complete binding coverage. Direct structurally valid Cerebro import must work.

## Required physical contract

Minimum columns/semantics:

```text
id
tenant_id + workspace_id + marketplace + project_id
kind
revision_number + parent_revision_id
request_hash + idempotency_key + created_by
dependency_manifest_json + dependency_manifest_hash
payload_json + payload_hash
accounting_json + accounting_hash
parser_binding_hash
scoring_binding_hash
policy_binding_hash nullable where irrelevant
artifact_hash over full immutable envelope
change_reason + created_at
```

Listing/intelligence dependency manifests bind exact artifact id **and** artifact hash.

## Migration and compatibility contract

Before activation, prove on a production-like copy:

1. backup includes DB/WAL/SHM and import blobs;
2. migration in a transaction is idempotent;
3. donor/preexisting table detection is explicit;
4. no destructive rewrite of historical `intelligence_snapshots`;
5. old projects remain readable;
6. restart produces identical artifact heads/hashes;
7. restore rollback returns the exact prior DB and imports;
8. mixed-version app/schema startup fails closed;
9. foreign keys and integrity check pass;
10. no legacy route can write a second canonical MKL.

## Local database audit limitation

The only root local `server/app.db` found was an old 180224-byte development DB. It passes `PRAGMA integrity_check` and contains six `NEEDS_QA` listings, but only migrations `002` through `007`; it has none of the canonical research/intelligence/submission tables. It is **not** a production-like migration fixture and cannot certify the proposed schema.

Therefore GPT2 must require a sanitized production-schema copy or a deterministic fixture representing migrations through the current production baseline before schema acceptance.

## Required test matrix

- same request/key replay;
- same key/different body rejection;
- same key across projects cannot collide or disclose;
- actor mismatch;
- tenant/workspace/marketplace/project IDOR reads and writes;
- stale expected head;
- two concurrent writers;
- tampered payload/dependency/accounting/envelope;
- restart/reopen;
- multi-file raw-hash dependencies;
- direct Cerebro without batch artifact;
- legacy intelligence reader and new MKL consumer coexistence;
- migration twice; rollback/restore.

## W0 schema verdict requested from GPT2/GPT4

```text
LOGICAL MODEL:             RECOMMEND ACCEPT
DONOR PHYSICAL CODE:       CHANGES REQUESTED
NEW keyword_snapshots:     REJECT
MIGRATION ACTIVATION:      HOLD
W1 USE:                    allowed only after accepted repair/migration scope
```

