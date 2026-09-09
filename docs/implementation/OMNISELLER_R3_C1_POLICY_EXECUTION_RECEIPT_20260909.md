# OmniSeller R3 — C1 Policy Registry Execution Receipt

Date: 2026-09-09 (Asia/Bangkok)

Baseline: `8dd56569832164ecd3b0ddd62caea254fdade452`

C0 certified commit: `df54bfcdbfcba183e69fd5bc9b58d893e94a28d6`

Branch: `codex/omniseller-r3-c1-policy`

Worktree: `D:\Claude\Factcheck\scratch\omniseller-r3-c1-policy`

Reviewed implementation commit: `969bcaf3725729e83d26bb71197cce15128e2a82`

## 1. Outcome

Status: **C1 POLICY CORE HARDENED — FOCUSED TESTS PASS — ROUTE INTEGRATION NOT YET CLAIMED**.

This slice supplies a server-controlled policy registry, exact-byte policy binding, lifecycle resolution and reusable surface enforcement. It does not yet connect those modules to the live composer, edit, approval or export routes. It therefore cannot be described as a complete workflow, production-ready approval gate or merge-ready Wave 1 by itself.

No VPS deployment, publish action, production database write, primary dirty-worktree overwrite or legacy-route retirement occurred.

## 2. Independent review findings and disposition

Two read-only reviewers reproduced the original C1 fail-open behavior at commit `f2bc59fe4772e3479e46b75d667ba10995bde22c`. The findings were accepted, not waived.

| Finding | Severity | Disposition in `969bcaf37` |
| --- | --- | --- |
| Empty/malformed surfaces returned `canApprove=true` and `canExport=true` | P1 | Removed overall authority booleans; required/wrong-type surfaces fail policy validation |
| Caller could forge a resolution, contract and artifact hash | P1 | Registry resolutions now carry a private server-only brand; enforcement rejects unbranded objects |
| A DRAFT resolution could imply approval/export | P1 | Eligibility is purpose-specific; DRAFT cannot become approval/export eligible |
| Client policy envelopes and canonical scalar names bypassed the denylist | P1 | NFKC/decoded normalized keys, policy-container rejection, non-plain prototype rejection, iterative depth/node limits |
| `REVOKED`/`SUPERSEDED` events were ignored | P1 | Authoritative lifecycle snapshot is mandatory; exact source hash, event schema, chronology, scope and cohort are enforced |
| Tenant/workspace context did not affect matching | P1 | Approval-eligible artifacts require server authority scope; all purposes enforce tenant/workspace match and bind a scope hash |
| `rules.bullets.maxChars` was not enforced | P1 | Every supplied Amazon bullet is checked when the contract declares a limit |
| Etsy malformed/duplicate surfaces passed | P1 | Required title/tag types and normalized duplicate rejection added; safe tag shortage remains a quality gap |
| Impossible dates passed the custom regex | P1 | RFC3339 shape plus calendar/time validation is shared by contracts, events and server context |
| Recursive override traversal could overflow | P1 | Traversal is iterative and capped at depth 64 / 10,000 object nodes |
| AJV was not declared by the server workspace | P2 | AJV 8 is now a direct runtime dependency of `server/package.json` |

## 3. Authority boundary

The policy module now returns only these narrow facts:

- `policyCompliant`;
- `policyContractApprovalEligible` only for an `APPROVAL` resolution;
- `policyContractExportEligible` only for an `EXPORT` resolution;
- `requiresAdditionalApprovalGates: true` always.

It deliberately does not return `canApprove` or `canExport`. Final authority must still combine, at minimum:

```text
authenticated server identity and RBAC
  + tenant/workspace/seller-account ownership
  + immutable listing revision and stale-head check
  + Product Truth completeness/state
  + claim audit and IP/TM review
  + policy contract + lifecycle binding
  + manager/owner approval binding
  = approval/export decision
```

Policy compliance alone can never elevate evidence, approve a listing or authorize marketplace submission.

## 4. Runtime behavior delivered

### 4.1 Resolution inputs

The server context binds:

- tenant;
- workspace;
- seller account;
- marketplace and US site;
- locale (`en-US` or `es-US` through the contract);
- media class;
- product type and category;
- effective time.

Approval-eligible artifacts additionally receive a server-owned tenant/workspace authority scope. Its deterministic SHA-256 is included in downstream policy bindings.

### 4.2 Immutable artifact and lifecycle behavior

- Policy contract identity is SHA-256 of exact stored UTF-8 bytes.
- Semantic JSON reserialization does not reproduce the same binding unless bytes are identical.
- A lifecycle snapshot must state `completeThrough` and contain schema-valid append-only events.
- Approval/export fails closed when the snapshot does not cover the effective time.
- `REVOKED` removes the exact artifact hash.
- `SUPERSEDED` requires a real newer contract in the same authority scope and exact cohort.
- The embedded legacy `supersedes` field is not trusted as lifecycle authority.

### 4.3 Marketplace surface behavior

Amazon policy checks:

- non-empty title and item highlights;
- title/highlight character counting according to the resolved contract;
- bullets must be an array of non-empty strings;
- per-bullet maximum when declared;
- generic keyword total UTF-8 byte limit and comma rule.

Etsy policy checks:

- non-empty title string and character maximum;
- tag array containing only non-empty strings;
- tag maximum count and per-tag character maximum;
- normalized duplicate tags forbidden;
- fewer than the safe target is reported as a quality gap, never filled with unsafe padding.

## 5. Test and build evidence

Supported runtime used for focused certification: Node `v22.23.2`.

```text
C1_POLICY_REGISTRY PASS groups=10
C0_JSON_SCHEMA_2020_POSITIVE_NEGATIVE_VALIDATION PASS
```

The ten C1 groups cover contract mutation, exact-byte hashing, client override attacks, composer/validator parity, forged resolution rejection, purpose separation, unknown/ambiguous/scope failure, runtime schema/date invariants, Etsy policy-versus-quality behavior, required surfaces and bullet limits, plus lifecycle revoke/supersede/completeness behavior.

Additional evidence:

```text
npm ls ajv --workspace=server -> ajv@8.17.1
canonical inventory discovery -> 66 entries
npm run build -> PASS (2430 modules transformed)
git diff --check -> PASS
```

The full canonical suite was not rerun after this focused patch because its baseline receipt already records five unrelated provider/Windows process failures and multi-minute shutdown timeouts. No claim of a fully green repository is made.

## 6. Remaining gate before C1 integration

An independent reviewer must re-run the previously successful attacks on the exact final receipt commit and confirm:

1. empty/malformed surfaces cannot acquire policy eligibility;
2. forged and cross-purpose resolutions fail;
3. owner policy cannot cross tenant/workspace;
4. revoked/superseded/incomplete lifecycle state fails closed;
5. client override depth, prototype, encoded and canonical-field attacks fail;
6. focused Node 22 test, C0 validator, production build and diff check remain clean.

Even after that acceptance, route integration is a separate commit and review gate.

## 7. Assigned next implementation sequence

### C2-A — claim taxonomy adapter and Claude guard transplant

Owner: claim/intelligence lane, reviewed independently.

Deliverables:

- executable token/pattern adapter from the stable R3 taxonomy to the donor C1–C8 labels;
- transplant of the donor two-pass claim guard without its global product library or parallel persistence;
- Product Identity cannot prove material, purity, dimensions, included items or fulfillment claims;
- visible copy blocks unverified claims, backend terms exclude them by default, PPC retains them only with `unverified_claims` flags;
- Hija and Esposa fixtures permanently cover `18k`, `925`, personalization method and the twelve known fabricated details.

### C2-B — immutable listing root/revision repository

Owner: persistence lane; may prepare schema/tests in parallel but cannot activate writers before C2-A and C1 integration acceptance.

Deliverables:

- reuse canonical `listings` as root; no parallel `listing_roots` table;
- append-only `listing_revisions` plus idempotent `listing_write_receipts`;
- atomic root+v1 create and compare-and-swap revision append;
- exact Product Truth, intelligence, policy, claim/IP and approval bindings per revision;
- no LLM/network/file I/O inside database transactions;
- legacy backfill preserves raw payloads and never invents approval authority.

### C2-C — policy integration RED-to-GREEN

Owner: integration lane after exact C1 acceptance.

Deliverables:

- server-derived policy context at compose-preview, post-compose, post-edit, approval and export;
- identical contract/hash/scope binding across all five stages;
- positive request DTOs at each route before `assertNoClientPolicyOverrides`;
- stale/revoked/mismatched bindings fail closed;
- behavioral tests entered into `tests/canonical_test_inventory.json` in the same commit.

### C2-D — Track A usable pilot preparation

Owner: staff-workflow lane; remains non-canonical and download-only.

Deliverables:

- exact nine-component handoff package including Amazon JSON, CSV and TXT views;
- component-level schemas, hashes, byte counts, full keyword disposition and tamper checks;
- real Hija and Esposa import/accounting tests;
- no VPS exposure until server authentication and tenant/workspace isolation exist;
- no Etsy/image-prompt claim in Track A; those stay in the canonical Track B workflow.

## 8. Stop conditions

Stop the affected lane if it requires any of the following before its gate:

- pushing, merging or deploying without explicit authorization and exact-commit acceptance;
- writing to production/VPS or marketplace APIs;
- reviving any of the five legacy composition/create surfaces as a compatibility writer;
- trusting client policy scalars, Product Identity as attribute evidence or research keywords as Product Truth;
- creating parallel canonical listing roots;
- claiming staff usability from unit tests without real-file browser UAT.
