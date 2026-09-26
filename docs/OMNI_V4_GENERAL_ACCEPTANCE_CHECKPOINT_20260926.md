# OmniSeller V4 — General Acceptance Checkpoint

Date: 2026-09-26
Status: **HOLD — AWAITING_FRESH_REAL_INPUT**

## Purpose
This checkpoint records the start of V4 General Acceptance / Fresh Project Validation after Amazon and Etsy golden references were established.

A project counts toward General Acceptance only when it is a real, independent, previously unseen acceptance candidate. Defect-discovery cases and historical UAT/fixture cases do **not** count.

## Frozen acceptance baseline

### Production runtime
`94a17a5dc24b6ee5e057dfab17440b49a90d4365`

This release contains PR #96:
**Fix Fresh Acceptance Amazon ES mug localization and personalization prompt truth gate**.

Exact merge-head Node 22 CI: **SUCCESS**.

Immutable deploy:
- baseline: `70c157008fdfd579cadc3044914ae74285f9d0db`
- target: `94a17a5dc24b6ee5e057dfab17440b49a90d4365`
- Owner authorization V3 verified
- DB backup integrity/checksums passed
- atomic release switch passed
- local/public health revision matched target
- service active

### Amazon golden
Project #6 / Listing #18 / revision #23
Semantic status: `LISTING_READY_FOR_HUMAN_USE`

### Etsy golden
Project #9 / Listing #19 / revision #24
Semantic status: `LISTING_READY_FOR_HUMAN_USE`

## G0 — Amazon Golden Re-baseline

Amazon Project #6 was replayed read-only against the pre-FA production baseline and again after PR #96.

Current post-PR96 evidence:
- engine binding: `6a4ecace05e449ca830a74be8386e0fa51844281b3159b7a2409cecc8de5c249`
- title preserved: **Regalo de Cumpleaños en Español | Regalo de Madre para Hija**
- keyword accounting: **1084 input / 1084 allocated / 0 unallocated**
- internal provenance leakage: absent
- personalization detail: `OWNER_FACT_REQUIRED` for `personalization_method_and_area`
- remaining physical image slots stay truth-safe

**G0 result: PASS**

## Etsy Golden Cross-check after PR #96

Project #9 remains semantically stable:
- title unchanged: **Personalized Pet Memorial Necklace · Pet Sympathy Gift · Dog Memorial Gift**
- keyword accounting: master 87 / allocated 87 / corpus gap 0
- sibling-product contamination: absent
- personalization detail is now more conservative:
  `OWNER_FACT_REQUIRED` for `personalization_method_and_area`
- scale dimensions remains `OWNER_FACT_REQUIRED`

This tightening is accepted because it removes an unsupported inference rather than degrading listing quality.

## Fresh Acceptance defect-discovery case

### Project #10 — FA-1 Madrina Padrino Mug 20260926

Real input lineage:
- Amazon Xray import #23
  - raw hash: `e690cbccbd5149aba35dcb2afc8b052217d124c9b31d03f641bcf4ee59a83b67`
- Amazon Cerebro import #24
  - raw hash: `8ab9e455dfd0a1e3e55e812c026cd91995a4f954cfa1377dc83b1750aff4073d`
- Research Snapshot #22
- Product Truth revision #27
- Master Keyword artifact #33
  - hash: `b7bbb587f54043761a6ab38bdd3adad7b6d546457158619f1209434b4ae6133d`
  - 370 keywords
- no pre-existing Intelligence or Listing at entry

Project #10 was a valid fresh entry candidate and correctly exposed engine defects.

### Defects discovered
1. Spanish buyer-facing copy leaked English presentation values:
   `Proposal Mug`, `name/year`, and English handle colors.
2. Personalization field names/options such as `name`, `year` were incorrectly treated as verified personalization method + area for image prompt generation.

Under the General Acceptance protocol, Project #10 therefore became a:
**DEFECT_DISCOVERY_CASE**

It does **not** count as a Fresh Acceptance PASS.

### PR #96 fix
PR #96 implemented root-cause changes:
- deterministic ES localization for mug/personalization/color buyer values;
- visible ES keyword rendering without changing source/provenance accounting;
- personalization-detail image prompt now requires explicit verified method + area;
- field-only/string/array personalization remains `OWNER_FACT_REQUIRED`.

After deployment, exact Project #10 replay:
- deterministic: PASS
- output hash:
  `bc21854acdd63246ae69663afb70a0613deadb79ce325c432134945257148510`
- ES visible presentation leakage: absent
- material prompt: `OWNER_FACT_REQUIRED`
- personalization prompt: `OWNER_FACT_REQUIRED`
- packaging prompt: `OWNER_FACT_REQUIRED`
- keyword accounting: **370 / 370 allocated, 0 unallocated**

This closes the defect but does not convert Project #10 into Fresh Acceptance evidence.

## Candidate inventory review

The existing project database does not currently contain another independent fresh acceptance project that meets entry criteria.

Excluded candidates:

- Amazon #1 — historical supervised/UAT project.
- Amazon #3 — no Intelligence, but Product Truth quality is not acceptable for fresh entry:
  examples include `brand = "Para Mi HIja"` and `colors = "Hermana Gifts"`.
  This is an input-quality failure, not engine evidence.
- Amazon #6 — golden reference.
- Amazon #8 — previously documented contaminated-context case.
- Amazon #10 — defect-discovery case from this acceptance cycle.
- Etsy #2 — historical processed project / workflow-history case.
- Etsy #4 / #5 — explicit historical UAT projects.
- Etsy #7 — regression/cross-market case used during V4 fixes.
- Etsy #9 — golden reference.

Alex was checked for additional real Helium 10 / Excel source files in accessible user/project data locations. No additional suitable Xray/Cerebro workbook pair was found.

## Fresh Acceptance counter

```
Independent Fresh PASS candidates: 0

Amazon PASS: 0
Etsy PASS: 0

Defect-discovery cases: 1
  - Project #10

Unresolved P1/P2 from defect #10: 0
```

The counter intentionally resets after the PR #96 engine fix for the affected acceptance surface.

## Required next real input

To resume General Acceptance without weakening the protocol, ingest at least one **new real project** after PR #96.

Preferred next candidate:
- Amazon physical product;
- not daughter/Hija jewelry;
- not Madrina/Padrino mug;
- not a project previously used as UAT/regression;
- real Xray and Cerebro workbooks;
- explicit owner/supplier Product Truth;
- unsupported fields remain unknown.

Minimum Amazon entry artifacts:
1. real `AMAZON_XRAY` import;
2. real `AMAZON_CEREBRO` import;
3. immutable Research Snapshot;
4. Master Keyword artifact;
5. Product Truth revision with source/basis and explicit unknowns;
6. no pre-existing V4 Intelligence/Listing generated from the acceptance engine.

A fresh Etsy candidate is also valid if it uses new real marketplace/keyword evidence and has not been used in prior UAT/fix/golden work.

## Resume protocol

For the next fresh candidate:

```
DEPENDENCY FREEZE
→ ZERO-WRITE INTELLIGENCE REPLAY x2
→ DETERMINISM HASH CHECK
→ PRODUCT TRUTH BOUNDARY AUDIT
→ KEYWORD SURFACE + OMISSION AUDIT
→ COMPLETE LISTING QA
→ POLICY / IP / CLAIM QA
→ IMAGE PROMPT PACK QA
→ HUMAN-USABILITY CLASSIFICATION
→ PERSIST SUCCESSOR
→ EXACT PERSISTED REVALIDATION
→ PASS / HOLD / ENGINE_DEFECT
```

If a new candidate discovers another engine defect:
- it becomes `DEFECT_DISCOVERY_CASE`;
- fix root cause with regression;
- run full Node 22 suite + CI + golden cross-replay;
- deploy;
- start a **new** independent fresh candidate.

## General Acceptance exit criteria

V4 General Acceptance is PASS only when all of the following are satisfied:

- at least 4 independent fresh real projects;
- at least 2 Amazon;
- at least 2 Etsy;
- at least 3 distinct product forms;
- at least 1 multilingual case;
- at least 1 personalized case;
- unresolved P1/P2 = 0;
- major rewrite required = 0;
- silent worthwhile-keyword omission = 0;
- Product Truth leakage = 0;
- determinism failures = 0;
- image-prompt fabrication = 0;
- canonical lineage / DB integrity failures = 0.

Until new real source data is available:

**V4_GENERAL_ACCEPTANCE = HOLD — AWAITING_FRESH_REAL_INPUT**
