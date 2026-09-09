# OmniSeller R3 — Final Execution Assignment, Gates and Delivery Plan

Date: 2026-09-09 (Asia/Bangkok)

Decision: **APPROVED TO EXECUTE UNDER GATES — NOT APPROVED FOR MERGE OR VPS DEPLOYMENT**

Canonical production baseline: `8dd56569832164ecd3b0ddd62caea254fdade452`

C0 independently certified: `df54bfcdbfcba183e69fd5bc9b58d893e94a28d6`

C1 current HEAD: `43e2a27ef6600e9707e52c44c591cd0ae8991c8a`

C1 current local diff: three tested files, 29 insertions and four deletions; an exact final commit and independent re-review are still required.

## 1. Final ruling

The five submitted operating plans agree on the core architecture:

- one OmniSeller staff front door;
- one canonical authority, revision and approval core;
- separate Amazon and Etsy domain adapters;
- Research Observation never becomes Product Truth automatically;
- donor code is selectively transplanted, never merged wholesale;
- historical revisions are immutable;
- Phase 1 stops after exact export, manual submission and an honest operator-reported event;
- normal-browser UAT and exact-SHA evidence are mandatory.

That direction is accepted. Architecture discovery is closed. Work now proceeds as controlled implementation.

The phrase **ready to execute** means the work packages, owners, inputs, outputs, gates and stop conditions are defined. It does not mean the current code is production-ready. At this checkpoint:

```text
C0 contracts                         CERTIFIED
C1 policy core                       LOCAL HARDENING PASS; FINAL SHA PENDING
C1 route integration                 NOT IMPLEMENTED
Claim guard canonical transplant     NOT IMPLEMENTED
Immutable listing revisions          NOT IMPLEMENTED
Amazon continuous workflow           NOT IMPLEMENTED
Etsy continuous workflow             NOT IMPLEMENTED
Full creative/image-prompt workflow  NOT IMPLEMENTED
Linux exact-SHA certification        PENDING
Normal-browser UAT                   PENDING
GitHub PR/CI                         PENDING
VPS deploy                           NOT AUTHORIZED
```

## 2. Review of the five submitted plans

### 2.1 GPT1 plan

Verdict: **ACCEPT WITH SMALL ROLE CLARIFICATION**.

Strongest contributions:

- defines the final staff product rather than only engineering artifacts;
- provides the most realistic schedule: 10–17 focused working days, not a 3–5 day promise;
- keeps Amazon/Etsy, creative prompts, approval, exact export and manual submission in one program;
- establishes a useful anti-waste timebox and clear Product Truth authority.

Correction:

- GPT1 may issue a technical authority/ruling verdict, but only the human Owner authorizes push, merge, deploy or production mutation.

### 2.2 GPT2 plan

Verdict: **ACCEPT FOR SOURCE HIERARCHY, PERSISTENCE AND MIGRATION GOVERNANCE**.

Strongest contributions:

- explicitly separates canonical architecture, execution evidence, reported checkpoint and proposed operating model;
- correctly assigns immutable revision/CAS/idempotency review to GPT2;
- clearly states that the policy module is not yet route-integrated;
- defines a coherent release-candidate evidence bundle.

Corrections:

- GPT2 is a design/data reviewer, not a second integration owner;
- GPT4 does not replace Gravity as the actual normal-browser journey executor;
- repeated documents/reviews must not become a gate for every small commit—review is bound to risk and gate exits.

### 2.3 GPT4 plan

Verdict: **ACCEPT AS THE PRIMARY ROLE-SEPARATION MODEL**.

Strongest contributions:

- one implementer and independent exact-SHA review;
- singular next action: close C1 exactly;
- clean separation between GitHub evidence, Linux certification and VPS runtime;
- clear finding routing and no production hotfix rule.

Correction:

- C1 needs GPT1 authority/policy review plus GPT4 adversarial review. Claude is mandatory for C2-A semantics, but is advisory for C1 unless a claim-policy boundary is affected.

### 2.4 GPT5 plan

Verdict: **ACCEPT WITH REVIEWER DE-DUPLICATION**.

Strongest contributions:

- clear source hierarchy and one-writer rule;
- useful C2-A/B/C decomposition;
- good distinction among local implementation, Linux clean-room evidence and VPS deployment.

Corrections:

- Claude should not simultaneously be donor, general security authority and final technical approver;
- Gravity should own browser usability and workflow discovery, not architecture certification;
- a minimum of two independent reviewers is required for release-critical gates, not necessarily every internal checkpoint.

### 2.5 Gravity plan

Verdict: **USE AS A COMPACT UAT INPUT; DO NOT ADOPT AS GOVERNANCE AUTHORITY**.

Useful contributions:

- concise seven-step operational picture;
- correctly emphasizes real Hija/Esposa browser tests;
- identifies Gravity's practical value in staff UX and UAT.

Rejected or corrected statements:

- “12 issues completely fixed” is not an exact-commit certification claim;
- “100% quality and schedule” is unsupported and prohibited;
- the primary user working tree was dirty and preserved, not proven clean;
- GPT2 cannot be a second Base Integration Owner;
- Gravity cannot certify architecture or deploy independently;
- Etsy should target up to 13 safe, unique tags; unsafe padding merely to reach 13 is forbidden.

## 3. Single final operating model

```text
Human Owner
  └─ final external-change authority
       ├─ GPT3/Codex: only canonical implementation writer
       ├─ GPT1: Product Truth, approval and policy-authority reviewer
       ├─ GPT2: data, API, transaction and migration design reviewer
       ├─ GPT4: adversarial security/isolation/exact-SHA reviewer
       ├─ Claude: claim, commerce-intelligence and donor-parity specialist
       ├─ Gravity: normal-browser staff UAT and UX failure finder
       ├─ Linux PC: clean exact-SHA certification environment
       ├─ GitHub: canonical source/PR/CI/release ledger
       └─ VPS: certified release runtime only
```

There is one code-writing authority: GPT3/Codex. Review agents may provide findings, specifications or bounded donor artifacts; they do not own competing canonical branches.

No AI has authority to approve its own implementation, merge, deploy or publish. Human Owner authorization is separate for push, PR, merge, deploy and future marketplace API publishing.

## 4. Human staff authority model

### Seller/operator

- creates/selects product and project;
- enters and checks Product Truth as `STAFF_DRAFT`;
- imports research and confirms import accounting;
- generates, edits and saves listing/creative drafts;
- requests Manager QA;
- requests submission authorization;
- after authorization, downloads/copies the exact package, submits manually and records the operator-reported result.

Seller cannot self-approve Product Truth, listing content, creative prompts or submission authorization.

### Manager

- verifies and confirms an exact Product Truth revision;
- reviews listing and creative diffs;
- reviews claim/IP/policy warnings;
- approves eligible content scopes on exact hashes;
- cannot turn research keywords into Product Truth.

### Owner

- audits Manager approval and the exact export dependency graph;
- grants `SUBMISSION_AUTHORIZATION` for the exact package;
- separately authorizes push, merge and VPS deploy;
- does not need to perform the Seller's daily editing work.

Phase 1 submission status is limited to:

```text
NOT_SUBMITTED
OPERATOR_REPORTED_SUBMITTED
```

It never implies Amazon/Etsy accepted, published, indexed or made the listing live.

## 5. Canonical product pipeline

```text
LOGIN / SERVER IDENTITY
  → tenant + workspace + seller account + role
  → product + project
  → Product Truth STAFF_DRAFT
  → Manager-confirmed Product Truth revision
  → raw research import preview
  → confirm hash / rows / sheets / accounting
  → ResearchArtifact + ResearchObservation
  → IntelligenceSnapshot
  → claim/IP/audience/semantic allocation
  → zero-write compose preview
  → Amazon or Etsy ListingRevision v1
  → CreativeRevision with full image-prompt shot list
  → Seller edit → immutable v2/v3...
  → post-edit claim/IP/policy validation
  → Manager approval of exact scopes/hashes
  → Owner submission authorization
  → exact export package
  → Seller/operator manual submission
  → append-only OPERATOR_REPORTED_SUBMITTED event
```

### Authority boundaries

```text
Research keyword     = demand/targeting evidence
Product Truth        = product-fact authority
Visible listing copy = factual customer-facing assertion
Image prompt         = visual assertion; same truth/claim rules as copy
Backend search term  = indexing; unsafe/unverified claims excluded by default
PPC term             = targeting; may retain unverified claim only with an explicit review flag
```

## 6. Required Phase 1 output

### Amazon US, EN or ES according to selected listing locale

- title under the resolved account/category policy;
- exactly five useful bullet drafts at the product-output gate;
- description;
- generic keywords within the exact total UTF-8 byte policy and without unsafe duplication;
- keyword disposition ledger: used, excluded, PPC-only, rejected and reason;
- PPC review package;
- claim/IP/policy reports;
- complete editable and reopenable immutable revisions;
- A+ content copy and module plan for the registered brand;
- exact export package and submission checklist.

### Etsy US, EN or ES according to selected listing locale

- title under the resolved policy;
- up to 13 safe, unique and useful tags, each within policy;
- target 13, but no unsafe or meaningless padding;
- description;
- attributes/material/category suggestions clearly separated from confirmed Product Truth;
- keyword/pattern disposition ledger;
- claim/IP/policy reports;
- editable/reopenable immutable revisions;
- exact export package and submission checklist.

### Full creative/image-prompt package

The tool generates prompts, not final images, in Phase 1. Prompts are revisioned and claim-audited like listing copy. The package includes, when relevant:

1. marketplace-compliant main image;
2. front/alternate angle;
3. material/detail macro;
4. size/scale image;
5. personalization/customization demonstration;
6. lifestyle/recipient/occasion image;
7. packaging/gift presentation;
8. feature/benefit infographic;
9. care/how-to-use image;
10. Amazon A+ hero/banner and module prompts;
11. negative prompt and prohibited-elements section;
12. aspect ratio, crop, background, typography and safe-area instructions.

No prompt may invent materials, purity, gemstones, dimensions, included items, production method, packaging, model identity, rating, shipping promise or certification.

## 7. Import contract for real inputs

Required fixtures:

- `Xray_Hija.xlsx`;
- `Cerebro_Hija.xlsx`;
- all three `para_mi_hija_search_*.csv` Etsy exports;
- Esposa Cerebro/jewelry fixture used for `925` and `18k` contamination tests.

Every importer must:

- preserve raw file bytes, filename, SHA-256, sheet name, row number and original headers;
- parse every non-empty worksheet and row;
- preserve unknown columns in raw observation data;
- retain raw and normalized numeric/text values;
- detect duplicates without silently discarding them;
- keep rejected and below-threshold observations in full accounting;
- treat formulas and spreadsheet text as inert data, never executable instructions;
- report `input = accepted + rejected + duplicate + quarantined` with no hidden truncation;
- bind marketplace, locale, project, workspace, tenant and import receipt;
- allow preview before any canonical write, then require explicit confirm;
- reload the exact persisted research after restart.

## 8. Final work packages and assignments

### G0 — Close C1 policy core

Owner: GPT3/Codex.

Reviewers: GPT1 for authority/policy; GPT4 for bypass/security.

Machine evidence: Linux PC at final gate; local Node 22 may be used before handoff.

Immediate input:

```text
branch: codex/omniseller-r3-c1-policy
HEAD: 43e2a27ef6600e9707e52c44c591cd0ae8991c8a
pending: 3 files / +29 -4
```

Actions:

1. inspect and commit exactly the pending files;
2. rerun Node 22 C1 test, C0 validator, inventory discovery, server AJV check, build and diff check;
3. freeze the exact SHA;
4. reviewers replay WeakSet reflection/inheritance, malformed/duplicate JSON, temporal lifecycle, tenant/workspace, client override and surface-shape attacks;
5. no code changes after acceptance without invalidating that acceptance.

Exit: clean exact commit plus GPT1 `ACCEPT`, GPT4 `ACCEPT` and machine receipt. This accepts only the policy core, not route integration.

Timebox: 0.5–1 focused day.

### G1 — C2-A canonical claim guard and taxonomy adapter

Implementation owner: GPT3/Codex.

Domain owner/reviewer: Claude.

Independent reviewers: GPT1 for truth authority; GPT4 for bypass/isolation.

Inputs selectively inherited:

- Claude `lib/claims.js` two-pass lexical guard;
- claim test fixtures, including twelve known fabrications;
- advanced IP matcher behavior;
- canonical 14-family string taxonomy and token/pattern mapping.

Explicitly not inherited:

- donor global product library;
- donor authentication/persistence/routes/UI shell;
- silent corrupt-file fallback;
- numerical limits or authority supplied by the client;
- class-wide C1–C8 promotion where one legacy class maps to several canonical families.

Required tests:

- `18k`, `925`, wrong material, wrong size;
- personalization capability versus unverified engraving/laser method;
- identity does not prove attributes;
- copy blocks, search terms exclude, PPC flags;
- post-composition and post-edit scans catch template/AI-injected claims;
- EN/ES word boundaries, accents and false-positive fixtures;
- all image prompts go through the same claim audit.

Exit: Hija and Esposa semantic fixtures pass; no second authority or persistence appears.

Timebox: 1–2 focused days.

### G2 — C2-B immutable listing and creative revisions

Implementation owner: GPT3/Codex.

Design reviewer: GPT2.

Adversarial reviewer: GPT4.

Machine evidence: Linux disposable database.

Required physical model:

- reuse existing canonical `listings` row as root; do not add parallel `listing_roots`;
- add append-only `listing_revisions`;
- add idempotent `listing_write_receipts`;
- model creative prompts as immutable revisioned artifacts bound to product/listing truth, not mutable JSON attached without provenance;
- preserve exact Product Truth, research/intelligence, policy, claim/IP, validator and parent-revision hashes;
- implement atomic root+v1 creation and compare-and-swap append;
- perform no LLM, network or file I/O inside a database transaction;
- migrate legacy data without inventing Product Truth or approval authority.

Required failures:

- stale head → conflict and zero write;
- duplicate idempotency key with different request hash → reject;
- cross-project/tenant/workspace access → reject without existence leak;
- historical revision update/delete → reject;
- failure between root and v1 → full rollback;
- restart/reopen → identical revisions and bindings.

Exit: migration, rollback and concurrency tests pass on disposable DB.

Timebox: 1–2 focused days for core; migration remediation may add one day.

G2 design review may begin after G0. Writer activation waits until G1/G2/G3 dependencies are green.

### G3 — C2-C policy integration and canonical bootstrap

Implementation owner: GPT3/Codex.

Reviewers: GPT1 policy/authority, GPT2 API/data and GPT4 adversarial security.

Integrate the identical server-derived policy binding at:

```text
compose preview
post-compose validation
post-edit validation
approval
export
```

Add positive request DTO allowlists before policy override scanning. Policy compliance alone never authorizes approval or export.

Required bootstrap journey:

```text
new project
→ Product Truth STAFF_DRAFT
→ safe zero-write preview even if optional AI provider is unavailable
→ save NEEDS_QA revision
→ reload/relogin
→ edit and append v2
→ v1 remains unchanged
```

Exit: one normal API/browser-supported vertical path works; all five legacy composer/create surfaces remain frozen until atomic UI cutover.

Timebox: 1–2 focused days.

### G4 — Amazon Hija/Esposa usable workflow

Implementation owner: GPT3/Codex.

Domain reviewer: Claude.

Browser owner: Gravity.

Security reviewer: GPT4.

Inputs: real Xray/Cerebro files and confirmed Product Truth.

Exit requires one continuous normal-browser execution:

```text
login → store/project → truth → import preview/confirm → intelligence
→ full Amazon draft → full creative/A+ prompt package → save/edit/reload
→ Manager review → Owner submission authorization → exact export
→ Seller manual submission decision → record honest event
```

Run both Hija and Esposa. Esposa must prove `plata 925` and `oro 18k` do not contaminate visible copy or creative prompts for 14k gold-plated stainless-steel Product Truth.

Timebox: 2–4 focused days.

### G5 — Etsy Hija usable workflow

Implementation owner: GPT3/Codex.

Domain reviewers: Claude for language/claim behavior; GPT1 for truth authority.

Browser owner: Gravity.

Security reviewer: GPT4.

Inputs: all real Etsy CSV exports and confirmed Product Truth.

Exit requires the same continuous journey, producing title, safe tags, description, creative prompts, revision history, approval, exact export and manual-submission receipt.

Timebox: 2–4 focused days.

### G6 — Atomic legacy cutover and release candidate

Implementation owner: GPT3/Codex.

Reviewers: GPT1, GPT2, GPT4; Claude only for changed claim/intelligence surfaces.

Browser owner: Gravity.

Machine evidence: Linux clean checkout.

Cut over all known UI callers and retire these five legacy composition/create surfaces in one gated release:

```text
POST /api/listings
POST /api/etsy/batch-learn
POST /api/amazon/quick-draft
POST /api/trends/:id/draft
POST /api/chat mode=COMMERCE_DRAFT
```

Unauthenticated requests return `401` before authenticated `410 LEGACY_COMPOSER_RETIRED`. Research chat remains zero-write. Historical data stays readable.

Release candidate requirements:

- one exact SHA shared by all receipts;
- full test accounting, including failed/unexecuted/harness errors;
- Linux clean dependency install, build, migrations and rollback;
- Hija/Esposa normal-browser PASS;
- auth/RBAC/IDOR/tenant/workspace/project isolation PASS;
- no unresolved P0/P1;
- every accepted/deferred P2/P3 recorded;
- exact export determinism and backup/restore evidence.

Timebox: 1–2 focused days plus blocker remediation.

### G7 — GitHub and VPS release

Owner: human Owner.

Executor after authorization: GPT3/Codex using reviewed scripts.

Sequence:

```text
Owner authorizes push
→ push exact accepted branch
→ PR + CI
→ reviewers confirm PR head/tree
→ Owner authorizes merge
→ record merge SHA
→ Owner authorizes deploy
→ VPS preflight + backup + config snapshot
→ deploy exact release artifact
→ controlled migration
→ health/auth/isolation/read-only smoke
→ selected normal-browser staff UAT
→ deployment receipt or rollback
```

No direct VPS editing, random file copy, manual SQLite repair or experimental dependency install is permitted.

## 9. Dependency graph and safe parallelism

```text
G0 C1 close ──┬──→ G1 claim guard ───────────┐
              └──→ G2 design review only ───┤
G1 + G2 implementation ──→ G3 integration ──┤
                                            ├──→ G4 Amazon ──┐
                                            └──→ G5 Etsy ────┤
                                                             └──→ G6 RC → G7 release
```

Parallel work is limited to review/specification and non-overlapping tests. There remains one canonical code writer, so parallelism must not create competing implementations.

## 10. Evidence contract for every gate

Every receipt contains:

```text
gate ID and scope
repository + branch + full SHA
parent SHA
clean/dirty status
changed files
runtime and dependency identity
commands + exit codes
total / passed / failed / unexecuted / harness_errors
real fixture names + hashes
DB before/after or ZERO-WRITE proof
reviewer verdicts bound to the same SHA
known debt and deferred findings
explicit merge/VPS/production authority state
```

Allowed verdict vocabulary:

```text
ACCEPT
CHANGES REQUESTED
BLOCKED — INSUFFICIENT EVIDENCE
NOT REVIEWED
```

## 11. Anti-waste controls

- One implementer, one canonical branch lineage and no whole donor merges.
- Show a usable browser increment at G3, Amazon at G4 and Etsy at G5; do not wait until the end to expose staff utility.
- Do not add dashboards, auto-publish, marketplace outcome reconciliation or learning loops in Phase 1.
- Do not spend time making all research keywords visible. Preserve every keyword in accounting, but allocate it only where truthful, relevant and marketplace-safe.
- Timebox every gate. When missed, stop new features, record the exact blocker and choose simplify, rollback or continue.
- Known provider/Windows process debt remains separate and visible; it neither hides new regressions nor blocks Linux certification when demonstrably unrelated.
- A test-count headline is never a staff-usability claim.
- A draft may contain explicit missing-data markers and request later completion, but no missing fact may be invented.

## 12. Overall schedule

| Work | Focused estimate | Usable outcome |
| --- | ---: | --- |
| G0 policy close | 0.5–1 day | independently accepted policy core |
| G1 claim guard | 1–2 days | safe visible copy/search/PPC/prompt boundary |
| G2 revision core | 1–3 days | immutable editable/reopenable drafts |
| G3 bootstrap integration | 1–2 days | first canonical staff vertical slice |
| G4 Amazon | 2–4 days | real Hija/Esposa Amazon package |
| G5 Etsy | 2–4 days | real Etsy package |
| G6 release hardening | 1–2 days | exact release candidate |
| remediation buffer | 2–4 days | independently found blockers closed |

Expected range: **10–18 focused working days**, not a promise. First usable canonical browser increment is targeted by the end of G3; first full marketplace package by the end of G4.

## 13. Immediate final assignment

### GPT3/Codex — execute now

Close G0 only:

1. commit exactly the three pending C1 files;
2. rerun the documented Node 22 evidence;
3. issue one exact candidate SHA and clean receipt;
4. stop implementation and request exact-SHA review.

### GPT1 — prepare/review

- replay authority, purpose, Product Truth and lifecycle timing attacks on the G0 SHA;
- issue `ACCEPT` or `CHANGES REQUESTED` only;
- do not infer merge/deploy authority.

### GPT2 — prepare in parallel

- review the proposed `listings` root reuse, `listing_revisions`, write receipt, CAS, migration and rollback contract;
- return a bounded C2-B design critique; do not write a second implementation.

### GPT4 — prepare/review

- replay all prior C1 bypasses on the G0 SHA;
- attack scope, identity, JSON/Unicode, lifecycle and restart/multi-process assumptions;
- issue an exact-SHA verdict.

### Claude — prepare in parallel

- package only the claim guard, necessary helpers and semantic fixtures;
- supply an explicit donor file/function allowlist and denylist;
- add EN/ES Hija/Esposa and image-prompt adversarial cases;
- do not modify canonical persistence or self-certify the transplant.

### Gravity — prepare in parallel

- write browser scripts for G3/G4/G5, including reload, relogin, project switch, disabled CTA reason and error recovery;
- do not claim PASS before executing a continuous browser journey on an exact SHA.

### Linux, GitHub and VPS

- Linux: prepare clean Node 22 checkout and disposable DB procedure; certify only an exact commit.
- GitHub: no R3 push until Owner authorizes it after local acceptance.
- VPS: no action.

## 14. Final go/no-go statement

```text
GO: controlled local implementation and independent review under G0–G6.
NO-GO: merge, production database mutation, VPS deployment or marketplace API publishing.
NEXT ACTION: create and independently certify the exact final C1 policy commit.
```

