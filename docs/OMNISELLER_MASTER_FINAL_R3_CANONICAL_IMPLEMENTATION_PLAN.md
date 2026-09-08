# OmniSeller Master Final R3 — Canonical Implementation Plan

**Issued:** 2026-09-08, Asia/Bangkok

**Canonical integration baseline:** `NatoandUSA/Factcheck main@8dd56569832164ecd3b0ddd62caea254fdade452`

**Plan status:** **FINAL IMPLEMENTATION CONTRACT**

**Implementation status:** **NOT YET COMPLETE**

**Production/deploy/marketplace authority:** **LOCKED**

**Phase 1:** Amazon US + Etsy US, `en-US`/`es-US`, manual marketplace submission only
**Binding real-input contract:** `docs/REAL_INPUT_IMPORT_CONTRACT_AND_GAP_AUDIT_HIJA_R1.md`

---

## 0. Final ruling

```text
ARCHITECTURE PLAN:
ACCEPT

IMPLEMENTATION AUTHORIZATION:
C0 CONTRACTS + RED TESTS AUTHORIZED
WAVE 1+ AUTHORIZED ONLY BY WAVE EXIT GATES

CURRENT PRODUCT STATUS:
NOT COMPLETE
NOT PRODUCTION READY

DONOR POLICY:
SELECTIVE TRANSPLANT ONLY
NO WHOLE PROTOTYPE MERGE

AUTO-PUBLISH:
OUT OF SCOPE

PHASE-1 END EVENT:
OPERATOR_REPORTED_SUBMITTED / NOT_SUBMITTED
MARKETPLACE_OUTCOME = NOT_VERIFIED
```

R3 ends the architecture loop. New architecture work is allowed only when a wave exposes a concrete blocker that cannot be solved inside this contract. Work now proceeds through narrow, usable vertical slices.

### Selected solution

```text
ONE OMNISELLER VPS FRONT DOOR
        │
        ├─ Shared authority/safety/revision core
        ├─ Amazon domain adapter
        └─ Etsy domain adapter

Temporary Track A → staff value now → sunset at Amazon canonical parity
Canonical Track B → durable Amazon/Etsy workflow
```

---

## 1. Owner decisions locked in R3

| Decision | Final contract |
| --- | --- |
| Staff access | Remote offices use OmniSeller on VPS |
| Marketplaces | Amazon US and Etsy US |
| Listing locale | System suggests; Seller explicitly confirms `en-US` or `es-US` |
| Product Truth | Seller enters/maintains; Manager confirms exact revision |
| Missing facts | Safe internal draft allowed with explicit blockers; no fabrication |
| Research | Used maximally for analysis and keyword allocation; never Product Truth |
| Keyword loss | No silent loss; every observation and phrase receives disposition/reason |
| Images | Full creative job plan and GPT-ready prompts; staff creates/selects images externally |
| Amazon Brand | A+ included in Phase 1 where verified Brand Registry capability applies |
| Publication | Manual only |
| Submission authority | Seller requests; Owner authorizes exact package; operator records human-declared event |
| Phase 1 boundary | Stops at recorded manual submission/not-submitted; no marketplace outcome inference |
| Existing tools | Preserve and adapt the best domain behavior; no rewrite from zero |
| Delivery priority | Real staff output early, with timeboxes and stop conditions |

No further Owner question blocks C0 or Wave 1.

---

## 2. Review synthesis and adjudication

### 2.1 Accepted from all reviewers

- OmniSeller/Factcheck is the only future canonical front door.
- Amazon and Etsy remain separate domain adapters.
- Research Observation and Product Truth are separate authority domains.
- Donors contribute behavior, fixtures and UI ideas, not parallel databases or approval systems.
- Safe Draft must be available before Manager confirmation.
- Historical revisions are immutable.
- Approval must bind exact hashes and approval-critical policy/validator versions.
- Track A needs a hard sunset.
- Creative plan/prompt/asset/submission readiness are distinct.
- A continuous normal-browser journey is mandatory.
- Phase 1 does not claim listing is live or accepted.

### 2.2 Gravity verdict correction

Gravity’s architecture acceptance is directionally valid, but `BLOCKERS: NONE` is not adopted. GPT1/GPT4/independent review identified reproducible contract contradictions in R2. Gravity’s claimed runtime/test evidence is not treated as release evidence unless accompanied by exact-SHA receipts independently rerun at the applicable wave.

### 2.3 Claim-taxonomy adjudication

R3 does not redefine numeric `C1–C8` into a different `C1–C14` sequence. Renumbering would make existing fixtures and donor reports ambiguous.

Canonical code uses stable string IDs. Legacy C labels may remain display aliases only.

The donor's C4 and C7 are mixed token buckets, not one-to-one semantic classes. Adapter mapping is mandatory at token/pattern level: for example C4 contains capability, performance, environmental and safety terms; C7 contains social-proof, commercial-promise and comparative terms. `SAFETY`, `DIGITAL`, `PRICE/SCARCITY` and `COMPARATIVE` have no dedicated legacy class even where some legacy tokens exist. A class-wide one-to-many authority promotion is forbidden.

### 2.4 Approval adjudication

R3 adopts scoped approvals, not one global boolean:

- changing Creative does not unnecessarily erase a still-valid Listing Content approval;
- changing Product Truth stales all dependent scopes;
- Export Package approval binds the exact set of approved components;
- Submission Authorization binds the exact export package.

### 2.5 Intelligence-change adjudication

A newly imported research artifact or new Intelligence Snapshot does not automatically invalidate already-approved unchanged listing content. The old listing remains reproducible against its bound snapshot. A new composition uses the new snapshot. If package content changes, a new revision and approval are required.

---

## 3. Canonical architecture

```text
REMOTE STAFF
     │ HTTPS/auth/RBAC
     ▼
OMNISELLER VPS
     │
     ├─ Work Queue / Project Shell
     ├─ Product & Truth
     ├─ Research
     ├─ Listing Studio
     ├─ Creative Studio
     ├─ Review & Approval
     └─ Export & Submission
     │
     ▼
SHARED CANONICAL CORE
     ├─ tenant/workspace/project scope
     ├─ immutable revisions
     ├─ Product Truth authority
     ├─ research artifact ledger
     ├─ Claim + IP + policy validation
     ├─ scoped approvals
     ├─ exact export packages
     └─ submission event ledger
     │
     ├───────────────┐
     ▼               ▼
AMAZON ADAPTER     ETSY ADAPTER
Xray/Cerebro       Search snapshots
PPC/A+             Pattern/tags/digital
```

Seven workspaces are an information architecture. Wave 1–2 may implement them as four primary pages plus scoped panels to avoid building navigation instead of a product.

Priority UI surfaces:

1. Work Queue.
2. Product & Truth.
3. Research.
4. Listing Studio.
5. Creative/Review/Export panels until UAT proves separate pages are useful.

---

## 4. Authority model

### 4.1 Product Truth authority

Permitted support states:

```text
STAFF_DECLARED
OWNER_DECLARED
SUPPLIER_SUPPORTED_CANDIDATE
PHYSICAL_EVIDENCE_SUPPORTED
MANAGER_CONFIRMED_REVISION
```

Not Product Truth authorities:

```text
CEREBRO_KEYWORD
XRAY_COMPETITOR
ETSY_LISTING
YTRENDS
HEYETSY
SUPPLIER_OBSERVATION_UNCONFIRMED
AI_INFERENCE
LLM_OUTPUT
GENERATED_IMAGE
```

### 4.2 Research authority

Research is immutable market observation with source/hash/row/cell provenance. Confirmed import means “we accepted this file as an input artifact”, not “its claims are true about our product”.

### 4.3 Generated content authority

Listing copy, A+, tags, PPC recommendations and prompts are derived work products. They never become Product Truth by being saved or approved.

---

## 5. Parallel readiness and capabilities

Readiness axes are server projections, not client-set workflow states.

```text
CREATE PROJECT
     │
     ├──────────────► PRODUCT/TRUTH LANE
     │                   ├─ EMPTY
     │                   ├─ STAFF_DRAFT
     │                   └─ MANAGER_CONFIRMED_REVISION
     │
     └──────────────► RESEARCH LANE
                         ├─ NOT_STARTED
                         ├─ IMPORTED
                         ├─ ANALYZED
                         └─ DEGRADED

Both independently feed COMPOSE/EDITORIAL.
```

Capability rules:

| Condition | Safe compose | Save internal draft | Approve | Export |
| --- | ---: | ---: | ---: | ---: |
| Truth `STAFF_DRAFT`, no research | Yes, degraded + blockers | Yes | No | No |
| Truth `STAFF_DRAFT`, research available | Yes | Yes | No | No |
| Truth confirmed, blocking validation issue | Yes | Yes | No | No |
| Truth confirmed, exact validation clean | Yes | Yes | Role/scope dependent | After exact approval |

Readiness API must return:

```json
{
  "readiness": {},
  "capabilities": {
    "composeSafeDraft": true,
    "approveListing": false,
    "approveCreative": false,
    "exportPackage": false
  },
  "missingPrerequisites": {},
  "nextAction": {}
}
```

React displays this server result; it does not reconstruct eligibility from colors or local state.

---

## 6. Canonical bootstrap

```text
POST project
  ↓
POST Product Truth revision: STAFF_DRAFT
  ├───────────────┐
  │               └─ research preview/import/analyze may run in parallel
  ↓
POST compose-preview: zero write, blockers allowed
  ↓
POST listing identity + immutable v1: INTERNAL_DRAFT / NEEDS_QA
  ↓
Seller edit → immutable v2
  ↓
refresh/reopen → v1 and v2 remain readable
  ↓
Manager confirms exact Product Truth revision
  ↓
validate exact listing/creative scopes
  ↓
Manager approves eligible component scopes
  ↓
Owner authorizes exact Export Package
  ↓
Seller/operator manually submits externally
  ↓
append OPERATOR_REPORTED_SUBMITTED or NOT_SUBMITTED event
```

Manager confirmation is never required merely to create a safe working draft.

---

## 7. Canonical logical data model

```text
Tenant
└─ Workspace
   └─ Project
      ├─ ProductTruthRevision[]
      ├─ ResearchArtifact[]
      │  └─ ResearchObservation[]
      ├─ IntelligenceSnapshot[]
      ├─ Listing
      │  └─ ListingRevision[]
      ├─ Creative
      │  └─ CreativeRevision[]
      ├─ ValidationReport[]
      ├─ ApprovalReceipt[]
      ├─ ExportPackage[]
      └─ SubmissionEvent[]
```

Physical implementation should extend existing canonical tables/ledger where possible. It must not import donor tables such as `staff_research_files` or `staff_editorial_drafts` as a second authority.

---

## 8. Immutable revision contract

Append-only artifacts:

```text
ProductTruthRevision
ResearchArtifact / ResearchObservation
IntelligenceSnapshot
ListingRevision
CreativeRevision
ValidationReport
ApprovalReceipt
ExportPackage
SubmissionEvent
```

Aggregate roots may update current-head pointers. Historical payloads and hashes never mutate.

Create-next-revision request:

```json
{
  "parentRevisionId": 14,
  "expectedHeadRevisionId": 14,
  "idempotencyKey": "uuid",
  "changeReason": "STAFF_EDIT",
  "content": {}
}
```

If the head changed:

```text
409 REVISION_CONFLICT
zero revision write
```

Retrying the same idempotency key returns the same result, not a duplicate revision.

---

## 9. Scoped approval and exact export

### 9.1 Approval scopes

| Scope | Exact dependencies |
| --- | --- |
| `PRODUCT_TRUTH_CONFIRMATION` | Product Truth revision/hash + confirmer |
| `LISTING_CONTENT` | Listing revision/hash, Product Truth revision/hash, locale, product-family version, validation/policy/claim/IP critical versions, bound intelligence snapshot |
| `CREATIVE_PROMPTS` | Creative revision/hash, Product Truth revision/hash, dependent listing revision if used, validation/policy/claim/IP critical versions |
| `EXPORT_PACKAGE` | Exact component manifest + component approval receipt hashes + package hash |
| `SUBMISSION_AUTHORIZATION` | Exact Export Package hash + marketplace/account label + Owner decision |

### 9.2 Invalidation matrix

| Change | Stale scopes |
| --- | --- |
| Product Truth revision | Listing, Creative, Export, Submission |
| Listing revision | Listing, dependent Creative, Export, Submission |
| Creative revision | Creative, Export, Submission; not unrelated Listing approval |
| New Intelligence Snapshot only | No existing content approval; new content binds new snapshot |
| Approval-critical policy/validator change | Affected scope revalidation and approval |
| Documentation URL/metadata-only change | No stale event |

### 9.3 Export invariant

```text
EXPORT_ALLOWED
iff
all required component scopes are approved
and current component hashes match the Export Package manifest
and Owner has authorized the package
```

---

## 10. Product identity, Claim Validator and IP

### 10.1 Product Identity gate

The first gate protects what the buyer receives:

```text
IDENTITY_PRODUCT_TYPE
IDENTITY_PHYSICAL_OR_DIGITAL
IDENTITY_RECIPIENT_OR_DESIGN
IDENTITY_INCLUDED_ITEMS
IDENTITY_VARIANT
IDENTITY_PERSONALIZATION_ENTITLEMENT
```

Research may recommend an identity opportunity. It cannot change Product Identity.

Examples:

- daughter necklace truth + “mom necklace” research → cannot change intended design/recipient;
- digital printable + “boxed game” keyword → no physical box/shipping;
- single item + “set of 3” → no quantity mutation;
- non-personalized truth + personalized keyword → no personalization offer.

### 10.2 Stable claim registry

Canonical string IDs:

```text
COMPOSITION_MATERIAL_PURITY
COMPONENT_GEMSTONE_INCLUDED_PART
MEASURE_DIMENSION_WEIGHT_QUANTITY_CAPACITY
CAPABILITY_PERSONALIZATION_PROCESS
ORIGIN_FACILITY_PRODUCTION_PARTNER
FULFILLMENT_PROCESSING_DELIVERY
SOCIAL_PROOF_RANK_CERTIFICATION
PACKAGING_ACCESSORY_INCLUDED_EXTRA
SAFETY_MEDICAL_HEALTH_AGE_COMPLIANCE
PERFORMANCE_DURABILITY_WATERPROOF_COMPATIBILITY
ENVIRONMENT_ETHICAL_SUSTAINABILITY
DIGITAL_FORMAT_LICENSE_USAGE_RIGHT
PRICE_DISCOUNT_SCARCITY_COMMERCIAL_PROMISE
COMPARATIVE_SUPERLATIVE_EXCLUSIVITY
```

The registry is versioned and extensible. Product-family profiles choose applicable claim groups and corroboration fields.

### 10.3 Validation sequence

```text
research phrase classification
→ pre-composition guard
→ composer
→ post-composition claim/IP/policy audit
→ save immutable revision
→ staff edit
→ post-edit audit
→ scoped approval eligibility
→ export-time exact revalidation
```

Human edits are not automatically trusted. Manager approval cannot legalize an unsupported factual claim.

### 10.4 IP enforcement

- Existing canonical exact/normalized gate remains enforcement authority initially.
- Advanced fuzzy/semantic matcher runs shadow-only in Wave 2.
- Rare token alone is `REVIEW`, not “competitor brand proven”.
- Promotion requires false-positive/false-negative fixtures, Unicode/boundary/glue cases, timeout behavior and independent review.
- UI uses `BLOCKED`, `REVIEW`, `NO_KNOWN_HIT`; never `IP SAFE` or legal-clearance language.

---

## 11. Lossless Research import contract

`docs/REAL_INPUT_IMPORT_CONTRACT_AND_GAP_AUDIT_HIJA_R1.md` is binding.

Certification corpus:

```text
Etsy:    195 observations / 176 unique listing entities / 36 columns
Xray:     19 observations / 32 columns
Cerebro: 1099 keyword rows / 40 columns / 9 dynamic ASIN columns
```

Required invariants:

- bytes + SHA-256 stored before normalization;
- blank/duplicate headers receive stable ordinal keys, never disappear;
- every row binds artifact/sheet/row/cell provenance;
- `blank`, `-`, `N/A` and observed zero remain distinct;
- each file is an immutable artifact even in multi-file upload;
- entity dedup is derived; observations are never destructively deduped;
- UI pagination never truncates the analysis corpus;
- each unknown/rejected/unused field or phrase has a reason;
- price/currency analytics remain blocked if currency is not confirmed;
- parser normalization is separate from relevance/price/IP/claim decisions.

Current known failures to eliminate:

- Etsy route by `keyword_context` and missing snake_case aliases;
- Xray `cat` substring false rejects and Ratings/Sponsored mapping;
- Cerebro blank-header translation loss and top-100 truncation.

---

## 12. Locale contract

```text
corpus
→ language suggestion + confidence
→ Seller confirms en-US or es-US
→ locale stored in strategy/listing/creative revisions
```

Before confirmation, preview and safe internal save are allowed with `LANGUAGE_CONFIRMATION_REQUIRED`. Approval/export is blocked.

Changing locale creates new strategy/listing/creative revisions. A later corpus cannot silently switch existing content language.

---

## 13. Amazon US workflow and output

### 13.1 Pipeline

```text
Product Truth STAFF_DRAFT ───────────────┐
                                         ├─ Safe compose allowed
Xray → ASIN observations → review/batch ─┤
Cerebro → full keyword observations ─────┘
                   ↓
IntelligenceSnapshot
                   ↓
Identity/Claim/IP classification
                   ↓
Full keyword disposition
                   ↓
Amazon ListingRevision + A+ + CreativeRevision
                   ↓
Manager component approvals
                   ↓
Owner-authorized ExportPackage
```

### 13.2 Versioned 2026 policy baseline

For Amazon US non-media products after 2026-07-27:

```text
policyContractId = amazon-us-nonmedia-2026-07-27-v1
titleMaxChars = 75
itemHighlightsMaxChars = 125
genericKeywordsTotalMaxUtf8Bytes = 249
```

Title validation also applies current restricted-character and repeated-word requirements where still approval-critical. Category/account-specific Seller Central rules may override only through a newer machine-readable policy contract confirmed for the target category/account.

`75/125` are policy limits for Title and Item Highlights. They are not the 5 bullet limits and must not be conflated.

### 13.3 Minimum Amazon package

```text
Product Truth manifest
Research artifact/source manifest
Xray observations + selection/exclusion reasons
Cerebro full-corpus metrics and provenance
Keyword disposition/accounting
Title ≤ current policy limit
Item Highlights ≤ current policy limit
5 bullets under active category contract
Description
Generic Keywords ≤249 total UTF-8 bytes
verified variations/personalization
PPC Exact/Phrase/Broad review recommendations
A+ modules where applicable
full Creative plan + GPT prompt package
claim/IP/policy validation reports
revision/approval/export receipts
```

Missing fact → explicit blocker or omission, never filler.

---

## 14. Etsy US workflow and output

### 14.1 Pipeline

```text
Product Truth STAFF_DRAFT ─────────────┐
                                       ├─ Safe compose allowed
Etsy immutable search observations ────┤
Pattern/phrase/opportunity analysis ───┘
                  ↓
Identity/Claim/IP classification
                  ↓
Etsy ListingRevision + CreativeRevision
                  ↓
Manager approvals → Owner ExportPackage
```

### 14.2 Minimum Etsy package

```text
Product Truth manifest
Research/source manifest
snapshot/rank/pattern intelligence
clear Etsy title under active policy contract
up to 13 relevant safe tags, each under active limit
description
verified personalization
verified materials/attributes
physical/digital fields
production-partner and AI disclosure fields when applicable
full Creative plan + GPT prompt package
claim/IP/policy reports
revision/approval/export receipts
```

If 13 safe relevant tags do not exist, use fewer and report the gap. Never pad with irrelevant, IP-risk or unsupported-claim phrases.

Digital product profile must bind file format/count, pages, player count, age, duration, printing requirements and license/usage rights to Product Truth.

---

## 15. Keyword accounting

Every raw observation remains in the ledger. Each normalized phrase aggregate receives one or more explicit destinations:

```text
VISIBLE_COPY
BACKEND_SEARCH
PPC_EXACT_REVIEW
PPC_PHRASE_REVIEW
PPC_BROAD_REVIEW
RESERVE
REJECTED_IDENTITY
REJECTED_IP
REJECTED_CLAIM
REJECTED_POLICY
REJECTED_IRRELEVANT
BELOW_MIN_SEARCH_VOLUME
DUPLICATE_OBSERVATION_REFERENCE
```

Required metadata:

```text
source corpus hash
observation refs
normalization version
strategy version
claim-validator version
IP corpus/version
score inputs and availability
disposition
reason codes
generatedAt
```

Invariants:

```text
input observations = accounted observations
unique phrase universe = usable + reserve + rejected
```

Full accounting does not mean keyword stuffing.

---

## 16. Creative/Image Prompt contract

### 16.1 Creative job record

```json
{
  "slot": "MAIN_PRODUCT",
  "representationMode": "REFERENCE_PRESERVING_EDIT",
  "planStatus": "DEFINED",
  "promptStatus": "PROMPT_READY",
  "assetStatus": "NOT_GENERATED",
  "submissionEligibility": "BLOCKED_REAL_PRODUCT_MATCH_REVIEW",
  "verifiedFactsUsed": [],
  "requiredFacts": [],
  "requiredAssets": [],
  "mustPreserve": [],
  "mustNotInvent": [],
  "promptNeutral": "...",
  "promptOpenAI": "...",
  "qaChecklist": []
}
```

Representation modes:

```text
CONCEPT
REFERENCE_PRESERVING_EDIT
VERIFIED_FACT_INFOGRAPHIC
REAL_PHOTO_SHOT_INSTRUCTION
```

### 16.2 Full job inventory

The tool outputs all applicable slots:

- main product;
- alternate angles/details;
- scale/dimensions;
- material/process detail;
- personalization steps;
- lifestyle/use context;
- gift/recipient/occasion;
- included items/packaging;
- infographic/benefits;
- Etsy digital mockup/sample pages;
- Amazon A+ module imagery.

Each slot may be `PROMPT_READY`, `REAL_PHOTO_REQUIRED`, `OWNER_FACT_REQUIRED`, `REFERENCE_REQUIRED`, `NOT_APPLICABLE` or `BLOCKED_POLICY`.

Full plan does not mean every asset is ready. Required slots depend on marketplace and versioned product-family profile.

### 16.3 Safety

- Main-image prompts are production instructions, not evidence.
- No material, box, card, chain, clasp, acrylic base, accessory or prop may be implied as included without Product Truth.
- Exact typography/text overlay is a separate compositing task.
- AI-generated output must pass human product-match review before upload eligibility.
- Prompt validation runs before/after generation, after staff edit, before approval and before export.

---

## 17. Product-family registry

Each profile is versioned:

```text
profileId
profileVersion
physicalOrDigital
requiredFactGroups
optionalFactGroups
applicableIdentityRules
applicableClaimRules
marketplaceFields
creativeRequiredSlots
creativeConditionalSlots
migrationPolicy
```

Initial cohorts:

- custom jewelry;
- custom embroidery;
- custom acrylic;
- custom blanket;
- custom hat;
- general custom physical product;
- digital printable/game.

`Who killed Arthur Blackwood?` is the digital-profile adversarial cohort, including 10,000 suspects, 24 evidence files, one culprit, 1–6 players, age 14+, 2–4 hours only when these values are confirmed in Product Truth.

---

## 18. Supplier integration

Phase 1:

```text
open supplier decision tool
→ staff compares suppliers/costs
→ staff imports or declares selected candidate facts
→ Manager confirms exact Product Truth revision
```

The supplier site is linked/manual-import first. No automatic supplier connector and no automatic truth promotion in Phase 1.

---

## 19. Track A — temporary staff-value path

```text
classification = TEMPORARY_NON_CANONICAL
purpose = INTERNAL_WORKING_DRAFT_ONLY
authority = NONE
persistence = NONE or isolated single-file convenience workspace
approval/export authority = NONE
```

To support remote offices, Track A may run behind OmniSeller/VPS authentication as an isolated download-only utility. It does not write canonical production data.

If the donor's `data/products.json` convenience store is retained, it is permitted only under all of these constraints:

- one local/isolated file for staff input convenience;
- no users, roles, approval, publish, export authority or canonical identifiers;
- no claim that its records are Product Truth or Research Evidence;
- downloadable as a portable package and revalidated on Track B import;
- fully removable at Track A sunset without migration into canonical tables.
- corrupt or unreadable JSON fails visibly and is quarantined/backed up; it must never silently become an empty library;
- no unauthenticated global Product Library may be exposed on VPS. Until server-derived auth plus tenant/workspace partitioning exists, Track A is loopback-only or one isolated instance per workspace.

Minimum Track A handoff bundle:

```text
00_MANIFEST.json
01_PRODUCT_TRUTH.json
02_RESEARCH_SOURCE_MANIFEST.json
03_AMAZON_DRAFT.json + watermarked CSV/TXT
04_KEYWORD_DISPOSITION.csv
05_CLAIM_IP_POLICY_REPORT.json
06_PPC_REVIEW.csv
07_TRACK_B_IMPORT_RECEIPT_TEMPLATE.json
```

Every component binds SHA-256, byte count and generator/validator versions. Product Truth is labeled `STAFF_INPUT_UNVERIFIED`; human-readable outputs carry `INTERNAL WORKING DRAFT — NOT APPROVED — NOT FOR MARKETPLACE SUBMISSION`. Full keyword accounting may not be sliced at 200 rows.

The envelope requires the exact eight safe component names, rejects duplicate/unrecognized/path-traversal names, and binds `inputObservations == accountedObservations` through a reusable post-schema invariant.

Requirements:

- non-removable `INTERNAL WORKING DRAFT — NOT APPROVED` watermark;
- claim guard + post-composition audit;
- real Hija/Esposa fixtures;
- output schema importable as unapproved source into Track B;
- no users/roles/database/approval roadmap of its own;
- any imported output is revalidated and never gains approval status.

Sunset:

```text
When Track B Amazon vertical slice passes Staff UAT:
→ no new Track A projects
→ FEATURE_FREEZE
→ historical downloads remain readable
→ only critical safety/security/archive fixes
→ staff moves to canonical OmniSeller
```

No new Etsy feature is built in Track A. Existing safe prototype output may be used for designated pilots only.

---

## 20. Track B waves

### Wave 0 — C0 contract freeze and preservation

Timebox: 0.5–1 focused technical day.

- exact baseline/donor hashes;
- donor parity manifest;
- R3 contracts as machine-readable schemas where applicable;
- adversarial RED tests only;
- no broad donor transplant.

Exit: bootstrap/revision/approval/import/policy semantics have executable failing contracts.

### Wave 1 — canonical bootstrap and immutable revisions

Timebox: 2–3 days.

```text
new project
→ STAFF_DRAFT truth
→ zero-write safe preview
→ save NEEDS_QA v1
→ reload
→ edit creates v2
→ v1/v2 readable
```

Normal browser UI required. If the exit fails by timebox, stop and review; do not port intelligence.

### Wave 2 — lossless import + Amazon vertical slice

Timebox: 3–5 days.

- implement binding Hija import contract;
- Xray/Cerebro full observations and accounting;
- Amazon intelligence snapshot;
- stable claim registry;
- advanced IP shadow mode;
- Hija/Esposa real-file draft and editor;
- scoped Listing approval and exact export.

Exit: real Hija Amazon package, full corpus accounting and browser receipt.

### Wave 3 — Creative/A+ vertical slice

Timebox: 2–3 days.

- server-side Creative revisions;
- prompt/plan/asset/readiness separation;
- Product Truth-bound A+;
- external GPT prompt package;
- post-edit validation.

Exit: approved component scopes and exact package with honest blockers.

### Wave 4 — Etsy vertical slice

Timebox: 3–5 days.

- 195-observation import fixture;
- snapshot/pattern/tag adapter;
- physical and digital profiles;
- Etsy listing/creative editor;
- exact export.

Exit: normal-browser real-corpus Etsy package.

### Wave 5 — submission, security and operational hardening

Timebox: 2–4 days.

- Owner package authorization;
- human-declared submission events;
- VPS multi-user/concurrency/restart;
- artifact security;
- backup/restore;
- migration/rollback rehearsal;
- cross-scope negative tests.

Exit: exact-SHA release candidate for independent ruling.

---

## 21. Timeline and anti-waste rule

Focused engineering estimate:

```text
Track A safe pilot:       1–2 days
Track B Waves 0–5:       12.5–21 technical days
```

This is an engineering range, not a calendar promise. Work may be parallelized only where artifacts do not conflict and one integration owner controls merges.

Every wave produces a usable receipt. No team is allowed to spend the full estimate before staff sees a product.

If a wave misses its exit:

```text
STOP new scope
→ record exact blocker/evidence
→ choose simplify, fix, rollback or continue
→ Owner decides only if scope/cost materially changes
```

---

## 22. API semantics

```text
# Project/readiness
POST /api/projects
GET  /api/projects/:id/readiness
GET  /api/work-queue

# Research
POST /api/projects/:id/research/preview              # zero write
POST /api/projects/:id/research/imports              # confirmed immutable artifact
GET  /api/projects/:id/research/imports/:importId
GET  /api/projects/:id/research/imports/:importId/rows
POST /api/projects/:id/intelligence/preview          # zero write
POST /api/projects/:id/intelligence/snapshots

# Product Truth
POST /api/projects/:id/product-truth/revisions
GET  /api/projects/:id/product-truth/revisions
POST /api/projects/:id/product-truth/revisions/:id/confirm

# Listing
POST /api/projects/:id/listings/compose-preview      # zero write
POST /api/projects/:id/listings                      # root + v1
POST /api/listings/:id/revisions                     # new immutable revision
GET  /api/listings/:id/revisions/:revisionId

# Creative
POST /api/listings/:id/creative/preview              # zero write
POST /api/listings/:id/creative/revisions
GET  /api/listings/:id/creative/revisions/:revisionId

# Validate/approve/export/submit
POST /api/listings/:id/validations
POST /api/listings/:id/approvals
POST /api/listings/:id/export-packages
GET  /api/export-packages/:id
POST /api/export-packages/:id/submission-authorizations
POST /api/export-packages/:id/submission-events
```

All mutations require server-derived tenant/workspace/marketplace, idempotency key where retryable, expected head where concurrent, audit actor/time/reason and exact dependency hashes.

No client supplies approval authority or filesystem paths.

---

## 23. Artifact security, lifecycle and migration

Storage namespace:

```text
data/artifacts/<tenant-uuid>/<workspace-uuid>/<project-uuid>/<sha256>/original
```

DB authorization is primary; path layout grants no authority.

Required controls:

- server-generated validated paths;
- traversal/absolute-path/symlink/hardlink escape rejection;
- MIME/signature/extension validation;
- file/row/sheet/archive-depth/decompression limits;
- atomic temp write → hash → durable move;
- immutable content-addressed raw artifacts;
- authorized read/download;
- duplicate-hash reference policy;
- orphan file/DB reconciliation;
- retention/tombstone policy;
- at-rest permission/encryption decision;
- backup manifest binding DB hash, artifact-tree hash/count and missing count.

Migration gate:

- source/target schema versions bound;
- production-like DB + artifact tree backup;
- idempotent migration;
- legacy identity/history preserved without authority elevation;
- incompatible old app fails closed;
- interrupted/late failure recovery;
- rollback receipt;
- clean restore and two-start rehearsal;
- health endpoint reports safe schema/app compatibility.

---

## 24. Role model

### Seller

- create project/product;
- enter and maintain Product Truth draft;
- import research;
- compose/edit listing and prompts;
- select locale;
- request review and submission.

Seller does not self-approve Product Truth, content, export package or submission authorization.

### Manager

- confirm exact Product Truth revision;
- review exact Listing and Creative revisions;
- approve authorized component scopes;
- return blockers to Seller.

### Owner

- authorize exact Export Package;
- decide final manual submission;
- authorize operator/account target;
- review release/deploy/migration decisions.

### Submission operator

Seller or Owner may perform the external manual upload only after Owner authorization. The operator records an attestation event. This event never proves marketplace acceptance/live state.

---

## 25. Acceptance gates

### Gate A — Product Truth, Identity and claim safety

- zero unsupported identity/claim in listing, A+, tags/backend or prompt;
- 18k/925/personalized/shipping/gift-box contamination blocked;
- missing remains missing;
- staff edit revalidated.

### Gate B — Research fidelity and accounting

- Hija import contract passes exactly;
- every source cell/row/keyword accounted;
- raw/source/normalized hashes bound;
- no hidden truncation.

### Gate C — Immutable revisions and concurrency

- v1 bytes/hash unchanged after v2;
- conflict yields 409/zero write;
- retry idempotent;
- history reopens after restart.

### Gate D — Scoped approval and exact export

- Seller authority bypass denied;
- each scope binds exact context;
- stale matrix behaves as specified;
- package contains only required approved components.

### Gate E — Marketplace utility

- Amazon current policy contract passes;
- Etsy current policy contract passes;
- confirmed locale controls output;
- different Truth/corpus produces materially different useful drafts;
- no raw-JSON-only staff workflow.

### Gate F — Creative honesty

- full job inventory;
- prompt ready is not asset ready;
- required slots enforced by profile;
- real-product match remains human-reviewed;
- generated image does not become fact.

### Gate G — VPS security/isolation

- tenant/workspace/project negative tests;
- auth/RBAC;
- file security;
- concurrent users;
- restart/relogin;
- upload/download.

### Gate H — Continuous normal-browser journey

One uninterrupted Amazon journey and one uninterrupted Etsy journey through the normal UI. API/component/DB PASS totals cannot be aggregated as a substitute.

### Gate I — Migration/backup/rollback

- production-like lineage migration;
- backup/manifest/restore;
- interrupted and late failure rollback;
- two starts after restore.

### Gate J — Real cohorts

1. Hija Amazon `en-US` and `es-US`.
2. Hija Etsy `en-US` and `es-US`.
3. Esposa material/purity contamination.
4. Embroidery with missing facts/creative blockers.
5. Non-apparel physical custom product.
6. `Who killed Arthur Blackwood?` digital printable/license.

---

## 26. Continuous browser receipts

Amazon receipt:

```text
login → create project → STAFF_DRAFT truth
→ import real Xray/Cerebro → analyze
→ compose safe draft → save v1 → reload
→ edit/save v2 → Manager confirm Truth
→ validate/approve components → Creative/A+
→ Owner authorize exact export → download
→ record OPERATOR_REPORTED_SUBMITTED or NOT_SUBMITTED
```

Etsy receipt:

```text
login → create project → STAFF_DRAFT truth
→ import three real CSV snapshots → analyze
→ compose safe draft → save/reload/edit
→ Manager confirm/validate/approve
→ Creative plan → Owner exact export
→ record operator event
```

Receipts include exact git SHA, DB schema version, policy versions, fixture hashes, users/roles, timestamps, screenshots/output hashes and explicit steps not executed.

---

## 27. Branch, commit and ownership strategy

Integration branch is created from exact approved baseline after C0 preservation. Branch naming follows repo governance; the plan does not require the obsolete proposed name if current repository rules specify another prefix.

Commit sequence:

```text
C0 contracts + RED tests + donor/fixture manifests
C1 readiness + bootstrap + immutable revisions
C2 lossless spreadsheet/CSV reader and report adapters
C3 Amazon intelligence + accounting + listing
C4 scoped approvals + exact export
C5 Creative/A+ revisions and prompt package
C6 Etsy adapter + physical/digital listing
C7 artifact security + migration/backup/restore
C8 submission events + continuous UAT hardening
```

One integration owner resolves final code. Donor authors do not self-certify their transplant. Independent reviewers certify exact commits and receipts.

---

## 28. Change ledger

### Independent RC-01 through RC-07

| Finding | R3 resolution |
| --- | --- |
| Amazon 2026 policy | Versioned 75/125/249 baseline in §13 |
| Immutable revisions | POST append-only + concurrency in §8/§22 |
| Complete approval context | Scoped exact bindings in §9 |
| Product Identity | Identity gate before claims in §10 |
| Per-source observations | Binding lossless import in §11 |
| Locale confirmation | Seller-confirmed `en-US`/`es-US` in §12 |
| Track A sunset | Hard freeze/sunset in §19 |

### GPT1 P1-01 through P1-10

| Finding | R3 resolution |
| --- | --- |
| Safe draft deadlock | §5–§6 |
| PATCH vs immutable | §8/§22 |
| Approval scope | §9 |
| Submitted authority | §0/§24/§26 |
| Claim-family coverage | stable extensible registry §10 |
| Locale | §12 |
| Track A sunset | §19 |
| Artifact lifecycle/security | §23 |
| Advanced IP enforcement | shadow-only §10.4 |
| Migration/rollback | §23 + Gate I |

### GPT4 B01–B03 and R01–R07

All three blockers are resolved in §5–§9. Parallel pipeline, tenant-safe artifacts, Track A sunset, human submission events, Creative readiness, continuous journey and readiness prerequisites are incorporated in §3, §5, §16, §19, §23–§26.

### Gravity optional improvements

- Generic Keyword byte validation is binding in §13.
- Etsy tag rejection/accounting is binding in §14–§15.

### Real-input addendum

The later Hija input audit supersedes any earlier row-count assumptions. Canonical Etsy certification is 195 observations across three artifacts, not an undocumented “194-row” claim.

### Claude final-review adjudication — accepted for C0

Claude's final review verdict is `ACCEPT — PROCEED TO C0`. The following findings are binding implementation amendments, not optional review notes:

1. **Single-composer invariant.** The legacy surfaces `POST /api/listings`, `POST /api/etsy/batch-learn`, `POST /api/amazon/quick-draft`, `POST /api/trends/:id/draft` and commerce mode on `POST /api/chat` are feature-frozen immediately and excluded from R3 UAT. Baseline has four direct SQL insert paths: `/api/listings`, Etsy batch-learn, Amazon quick-draft and trend-draft; chat composes but does not directly persist. None may append an R3 canonical listing revision. They may remain read/legacy-compatible only until Wave 2 parity, then must be retired. C0 must inventory both composer call sites and listing writers; runtime code gets one canonical composer and one append-only revision writer.
2. **Policy-driven limits.** `75/125/249` remain the current Amazon US non-media baseline, but no composer or validator may hardcode them as hidden constants. The target category/account must bind an Owner-confirmed, versioned policy contract. A C0 mutation test must show that changing `titleMaxChars` from `75` to `200` changes composer/validator behavior without source edits. Client-supplied scalar overrides such as `titleLimit` are forbidden. Composer, post-compose audit, post-edit validation, approval and export all bind the same `policyContractId + policyContractHash`.
3. **Track A compatibility package.** Track A must export the R3 manifest envelope even though it has `authority=NONE`. Every exported artifact is revalidated before Track B ingestion. The donor C1–C8 taxonomy must be translated to the stable R3 claim IDs; the identity-is-not-attribute invariant remains mandatory.
4. **Artifact invalidation.** Quarantine or revocation of an approval-critical artifact invalidates dependent component approvals and export readiness, while retaining immutable audit history and reason codes.

C0 adds these adversarial RED tests:

```text
POLICY_CONTRACT_MUTATION_75_TO_200
SINGLE_CANONICAL_COMPOSER_WRITE_PATH
PRODUCT_NAME_DOES_NOT_PROVE_MATERIAL
```

The third fixture is explicit: `productName = "Sterling Silver Heart Necklace"` with blank `materials` must still block all visible-copy silver claims.

The existing baseline contract split is itself a RED fixture: `keywordRanker.js` applies Amazon 75/125/249 and Etsy 140/13/20, while `publishGate.js` still accepts 200-character Amazon/Etsy titles and treats exactly 13 Etsy tags as a hard policy rule. R3 supersedes this split. Etsy policy is “up to 13”; `targetCount=13` is a quality target, not permission to pad unsafe or irrelevant tags.

---

## 29. Machine-readable policy dependencies

Policy contract minimum:

```json
{
  "schemaVersion": "omniseller.policy-contract.v1",
  "policyContractId": "amazon-us-nonmedia-2026-07-27-v1",
  "marketplace": "AMAZON",
  "site": "US",
  "locales": ["en-US", "es-US"],
  "effectiveFrom": "2026-07-27T00:00:00Z",
  "checkedAt": "2026-09-08T00:00:00Z",
  "verificationStatus": "PUBLIC_BASELINE",
  "approvalEligibility": "DRAFT_ONLY",
  "approvalCritical": true,
  "cohort": {
    "mediaClass": "NON_MEDIA",
    "productTypeIds": [],
    "categoryIds": [],
    "sellerAccountIds": []
  },
  "sourceRefs": [{
    "kind": "PUBLIC_URL",
    "url": "https://sellercentral.amazon.com/seller-forums/discussions/t/145b6d0f-999c-4555-896c-c694bda2e470",
    "capturedAt": "2026-09-08T00:00:00Z"
  }],
  "rules": {
    "title": { "maxChars": 75, "counting": "UNICODE_CODE_POINTS" },
    "itemHighlights": { "maxChars": 125, "counting": "UNICODE_CODE_POINTS" },
    "bullets": { "targetCount": 5, "maxChars": null },
    "genericKeywords": { "maxUtf8Bytes": 249, "allowCommas": false }
  }
}
```

Public baseline contracts may drive a blocked/safe draft but are never approval-eligible. Authenticated category/account rules must be recorded by staff/Owner as an exact-scope `OWNER_CONFIRMED_ACCOUNT_CATEGORY` contract before approval/export.

The contract file is immutable and identified by SHA-256 of its exact stored UTF-8 bytes (`policyContractArtifactHash`); formatting changes therefore create a different artifact. `SUPERSEDED` and `REVOKED` are separate append-only lifecycle events binding the original artifact hash, never mutations of `verificationStatus`. Historical revisions retain their exact contract bytes; updates create a new contract and trigger targeted revalidation, not silent mutation.

---

## 30. External sources verified for R3

- Amazon’s June 2026 announcement states that from July 27, 2026, non-media titles must be at most 75 characters and Item Highlights provide 125 characters: <https://sellercentral.amazon.com/seller-forums/discussions/t/145b6d0f-999c-4555-896c-c694bda2e470>
- Amazon staff guidance identifies the Generic Keywords limit as 249 bytes; the contract applies it as a total compatibility budget: <https://sellercentral.amazon.com/seller-forums/discussions/t/d73f6ef2-6a10-4ae5-b2bf-140066b8b299>
- Etsy keyword/tag guidance: up to 13 varied phrase tags, each up to 20 characters: <https://www.etsy.com/seller-handbook/article/382774281517>
- Etsy 2026 title guidance: clear, scannable titles with holistic listing signals: <https://www.etsy.com/seller-handbook/article/1399426136697>
- Etsy permitted items, AI disclosure and production-partner guidance: <https://help.etsy.com/hc/en-us/articles/360024112614-What-Can-I-Sell-on-Etsy>
- Etsy listing-image requirements: <https://help.etsy.com/hc/en-gb/articles/115015663347-Requirements-and-Best-Practices-for-Images-in-Your-Etsy-Shop>
- OpenAI image generation/editing/reference workflows: <https://help.openai.com/en/articles/11084440-images-in-chatgpt>

All marketplace rules remain versioned dependencies and must be rechecked at release time.

---

## 31. Final implementation instruction

```text
DO NOT REOPEN GENERAL ARCHITECTURE RESEARCH.

BEGIN:
C0 contracts + adversarial RED tests
→ independent contract review
→ C1 Wave-1 browser bootstrap
→ stop or continue strictly by wave exit

DO NOT:
merge donor branches wholesale
create parallel persistence
claim runtime completion from document review
claim marketplace acceptance from human submission
deploy/publish without exact-SHA release ruling
```

The final success criterion is a real staff journey, not a test-count headline:

```text
REAL PRODUCT TRUTH
+ LOSSLESS REAL RESEARCH
→ SAFE, USEFUL AMAZON/ETSY LISTING
+ FULL HONEST GPT IMAGE PROMPT PLAN
→ STAFF EDIT
→ IMMUTABLE REVISION
→ MANAGER COMPONENT APPROVAL
→ OWNER EXACT PACKAGE AUTHORIZATION
→ MANUAL SUBMISSION EVENT
→ RESTART/REOPEN
```

This plan authorizes disciplined implementation. It does not certify that implementation already exists.
