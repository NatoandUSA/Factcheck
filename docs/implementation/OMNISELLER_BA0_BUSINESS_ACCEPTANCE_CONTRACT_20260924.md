# OmniSeller BA-0 — Business Acceptance Contract V1

**Status:** LOCKED  
**Authority baseline:** `9517c7c96ec6672e681bebc49f8c9e67866b0939`  
**Production baseline:** `9517c7c96ec6672e681bebc49f8c9e67866b0939`  
**Scope:** Business acceptance only. No P2-04/P2-05/P2-06 cleanup unless it blocks this contract.

## 1. North Star

OmniSeller Business Acceptance is complete only when real candidates are taken through an attributable decision path and at least one closed commercial learning loop exists:

```text
20 real evaluated candidates
→ human shortlist of 0–5 candidates
→ canonical Projects
→ at least one real Amazon journey and one real Etsy journey when qualifying candidates exist
→ 1–3 controlled marketplace experiments
→ measured commercial outcomes
→ learning receipts tied back to the original candidate/evidence snapshot
```

Engineering correctness, zero code blockers, export success, or release success alone do not satisfy Business Acceptance.

## 2. Existing authority model remains binding

- Research Readiness and Commercial Proof are independent.
- `researchReadiness=READY` is the current runtime gate for candidate → Project promotion.
- Legacy `advisoryDisposition` remains explanatory/compatibility metadata and is not the promotion authority.
- Commercial signals, modeled data, PROJECT_RESEARCH, RESEARCH_ONLY evidence, and Intel/social context do not become Commercial Proof merely by being useful for research.
- Promotion does not upgrade evidence authority.
- Product Truth remains independent of competitor/research evidence.
- Export authorization is not Commercial Proof.
- Marketplace submission remains manual. BA does not authorize auto-publish.

If an older document conflicts with current runtime semantics above, current certified runtime + tests at the authority baseline govern BA-0.

## 3. BA stages and mandatory artifacts

### BA-1 — Evidence Closure + Human Shortlist

Input: the existing 20 real evaluated candidates.

For every candidate with missing/insufficient evidence, record:
- candidate ID and marketplace;
- exact missing field/evidence family;
- why the evidence is required;
- expected source;
- whether it is obtainable now;
- observed authority/allowed-use classification;
- resulting Research Readiness after refresh.

Do not change scoring/thresholds merely to manufacture a shortlist.

The human shortlist is an immutable decision snapshot with:
- candidate ID;
- marketplace;
- evaluation snapshot/reference;
- Research Readiness state;
- selected by;
- selected at;
- selection reason;
- known missing evidence;
- intended experiment hypothesis.

Shortlist size is **0–5**. Five is a ceiling, not a quota.

### BA-2 — Candidate → Project lineage

For selected candidates, preserve traceability:

```text
candidate
→ evaluation/evidence snapshot
→ human shortlist decision
→ Project
→ marketplace research evidence
→ Research Readiness
→ Product Truth
→ Intelligence
→ exact listing revision
→ Manager QA
→ Owner authorization
→ exact export
→ manual marketplace submission artifact
```

At least one real Amazon journey and one real Etsy journey are required when the shortlist contains qualifying candidates for both marketplaces. Fixture-only journeys do not satisfy BA.

### BA-3 — Controlled Experiment Contract

Before marketplace submission, freeze an experiment record containing:
- experiment ID;
- candidate ID;
- Project ID;
- listing revision ID/hash;
- marketplace;
- hypothesis;
- price;
- COGS;
- expected marketplace fees;
- shipping assumption;
- traffic source;
- planned ad spend, if any;
- success criteria;
- kill criteria;
- start date;
- review window.

Changing a material experiment input requires a new revision/receipt; do not silently rewrite the original experiment.

### BA-4 — Commercial Outcome Capture

Capture only observed or explicitly verified values. Unknown remains `UNKNOWN`.

Demand:
- impressions/views where available;
- visits/clicks where available;
- orders;
- units;
- CVR when denominator exists.

Economics:
- revenue;
- AOV;
- COGS;
- marketplace fees;
- shipping;
- ad spend;
- gross margin;
- contribution profit.

Efficiency:
- CAC only when attributable paid acquisition exists;
- ROAS only when paid spend and attributable revenue exist;
- contribution profit/order where calculable.

Every metric must retain source and observation window.

Commercial Proof cannot be synthesized from modeled or research-only data.

### BA-5 — Learning Receipt V1

For every completed experiment, compare pre-registered hypotheses with observed outcomes.

Each hypothesis receives exactly one result:
- `SUPPORTED`
- `CONTRADICTED`
- `INCONCLUSIVE`

The learning receipt must reference:
- experiment ID;
- candidate/evaluation snapshot;
- Project;
- listing revision;
- outcome metric evidence;
- observation window;
- result and rationale.

V1 is observational learning only. Do **not** automatically retrain weights or change scoring thresholds from 1–3 experiments.

## 4. Exit criteria

Business Acceptance V1 is PASS only when all applicable conditions are satisfied:

1. Existing 20-candidate set has a documented evidence-closure pass.
2. A human shortlist decision snapshot exists with 0–5 selections and no quota forcing.
3. Every selected candidate has immutable candidate/evaluation lineage.
4. At least one selected candidate reaches an exact canonical Project/export/submission journey.
5. When qualifying shortlist candidates exist on both marketplaces, at least one Amazon and one Etsy real journey are completed.
6. 1–3 real controlled experiment contracts are frozen before submission.
7. At least one experiment reaches a defined review window with outcome capture.
8. At least one learning receipt closes prediction → outcome with SUPPORTED/CONTRADICTED/INCONCLUSIVE.
9. No experiment outcome is backfilled as if it were pre-existing Commercial Proof.
10. No automated marketplace publish capability is introduced.

If evidence is insufficient to select any candidate, BA-1 may legitimately produce shortlist size 0; that is a valid fail-closed business result, not permission to loosen authority.

## 5. Change-control rule

```text
NO NEW ARCHITECTURE WITHOUT BUSINESS-UAT NEED
```

During BA-1 through BA-5:
- P2-04/P2-05/P2-06 remain deferred.
- Open an engineering PR only for a concrete BA blocker, data-lineage defect, production-safety issue, or staff-confusion issue that would corrupt the experiment.
- Fix the narrow blocker, release it through normal governance, then resume the same BA checkpoint.
- Do not restart broad architecture cleanup.

## 6. Immediate next action

Start BA-1 against the current 20 real candidates:
1. obtain the current production evaluation snapshot;
2. classify each candidate's missing evidence by cause;
3. refresh only evidence that is obtainable and authority-valid;
4. re-evaluate without changing scoring/thresholds;
5. produce SHORTLIST_V1 with at most five human-selected candidates.

