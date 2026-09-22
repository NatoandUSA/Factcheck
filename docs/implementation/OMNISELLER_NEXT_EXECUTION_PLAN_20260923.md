# OMNISELLER — NEXT EXECUTION PLAN — 2026-09-23

## 0. Objective

Move OmniSeller forward with the smallest set of changes that improve real staff operation **without replacing architecture that already exists**.

Business objective:

```text
real source data
→ preserved provenance
→ research project
→ Product Truth
→ intelligence
→ controlled listing
→ human review
→ exact authorized export
```

The plan explicitly incorporates prior project lessons:

1. do not call an audit “full” before capability inventory is complete;
2. do not propose a new subsystem until the existing one has been searched;
3. code gaps do not authorize feature expansion by themselves;
4. main is development history, not release authority;
5. exact-SHA evidence beats chat descriptions;
6. staff workflow simplicity matters, but simplification may not weaken provenance;
7. one canonical writer / one canonical authority path;
8. do not make paid/unavailable dependencies mandatory;
9. do not repeat full UAT unnecessarily when targeted changed-path verification is enough.

---

## 1. Fixed constraints

### Production

`b911ffbfa590dfee083c572871c1286642dc4f1c`

Keep this frozen until a successor release is independently reviewed and Owner-authorized.

### Current main

`b44fc198390c849310bd0dab28cfe920afac2d63`

Main contains PR #71 and governance docs. It is not a release target merely because it is latest.

### Canonical operator sources V1

**Amazon**

```text
Helium 10 Cerebro CSV/XLSX
optional Xray CSV/XLSX
NO H10 MCP dependency
```

**Etsy**

```text
Etsy / ytuong.me extension-tool capture CSV/HTML
+
optional YTrends MCP supplemental research
NO Etsy Plus dependency
NO eRank/EverBee dependency
```

**Intel**

```text
discovery / social VOC / WhyNow
NOT marketplace readiness authority
```

---

# 2. Critical path

## Phase 0 — runtime verification of live P1-01

When Alex becomes available, first create a **clean audit worktree** from current main.

Do not modify the dirty root.

Verify the Etsy provenance fallback with a hermetic targeted test:

```text
provider:
  listings = present
  tags = []
  related_keywords = []

expected:
  seed/title-derived phrases MUST NOT emerge as provider-observed tags
```

### Decision

If reproduced, open narrow remediation PR.

Preferred outcome:

```text
provider gives no usable keywords/tags
→ fail closed
→ no market_trends business write
```

If owner explicitly wants title-derived terms, classify them as:

```text
DERIVED_FROM_PROVIDER_LISTING_TITLE
RESEARCH_ONLY
```

Never `ETSY_MCP_LIVE observed tag`.

This finding precedes #71 because it is in the production lineage.

---

## Phase 1 — successor to #71: Research Readiness Authority Hardening

**Do not rewrite #71. Build a narrow successor on current main.**

### 1A. Closed qualifying source tuples

Deny by default.

Amazon qualifying tuple:

```text
marketplace = AMAZON
sourceFamily = AMAZON_CEREBRO
authorityClassification = MODELED_THIRD_PARTY
evidenceTier = E2_MODELED_THIRD_PARTY
```

Etsy qualifying evidence must reuse the existing Etsy provenance model. Do not flatten modeled extension metrics into observed authority.

YTrends:

```text
E3_SUPPLEMENTAL_INDEX
→ discovery/corroboration/context
→ cannot replace qualifying marketplace evidence
```

Intel:

```text
RESEARCH_ONLY
→ cannot replace qualifying marketplace evidence
```

### 1B. Calculate readiness on qualifying evidence only

Never calculate readiness demand/competition across the entire candidate evidence bag.

Regression:

```text
weak Cerebro
+ positive PROJECT_RESEARCH proxy
→ NOT_READY
```

### 1C. Etsy query support correction

```text
query-context candidate
→ full listing result set from that captured query

tag candidate
→ only listings that actually support the tag
```

This is a data-association fix, not a new Etsy architecture.

### 1D. Preserve commercial proof separation

Required regression:

```text
good Cerebro
→ READY
→ commercialProof = NOT_ESTABLISHED
```

### 1E. Keep legacy disposition as compatibility only

Do not delete enum/callers in the same PR.

---

## Phase 2 — Input Integrity V1

Only after Phase 1 is exact-head green.

### Reuse existing parser diagnostics

Amazon currently exposes sheet/header/accounting information.

Etsy currently exposes:
- header diagnostics;
- row accounting;
- unmapped columns;
- parser metadata.

Define explicit outcome from existing facts:

```text
VALID
DEGRADED_PARSE
INVALID
UNKNOWN
```

Principles:

```text
known truncation → DEGRADED_PARSE
structural drift → DEGRADED_PARSE
below proven parser contract → DEGRADED_PARSE
unprovable coverage → UNKNOWN
missing != zero
```

Do not claim impossible 100% completeness.

### Baseline-derived coverage

Do not invent a number in implementation.

Use known-good real captures to derive parser contract expectations, then ratify them with tests.

---

## Phase 3 — Freshness V1 decision

Freshness is currently a **governance requirement without a trustworthy source timestamp in canonical research import storage**.

Do not implement filename guessing.

Before code, choose one of two explicit policies:

### Option A — strict source freshness

Add trusted `capturedAt/exportedAt` provenance during import.

UI asks once:

> File này được lấy/export ngày nào?

Then:

```text
Cerebro <= 30d
Etsy capture <= 14d
unknown/stale → NOT_READY
```

If storage requires schema change, use normal schema fingerprint + migration rehearsal process.

### Option B — operational freshness advisory

If manual date entry creates more friction than value, change the repo-bound Gate C spec first and make freshness advisory rather than readiness authority.

**Do not let code silently diverge from repo-bound policy.**

---

# 3. Required regression matrix before release

## Amazon

```text
good Cerebro
→ READY
→ commercialProof NOT_ESTABLISHED

weak Cerebro
+ positive Project Research
→ NOT_READY

Intel-only
→ NOT_READY

Intel + weak Cerebro
→ NOT_READY

parser degraded/invalid
→ NOT_READY

stale/unknown
→ according to ratified Freshness V1
```

## Etsy

```text
real query capture
→ query candidate receives result-set support

tag candidate
→ only supporting listings attached

YTrends-only
→ NOT_READY

Intel-only
→ NOT_READY

weak Etsy evidence + YTrends
→ NOT_READY

modeled sales/revenue metrics
→ never upgraded to observed commercial proof

zero/missing metrics
→ not KILL by absence alone
→ also not automatically READY

parser degraded
→ NOT_READY
```

## One-click UI

```text
select file
→ zero-write preview internally
→ successful canonical persistence
→ reload evaluation
→ no source authority upgrade
```

---

# 4. Exact implementation workflow when Alex is online

1. Fetch current `origin/main`.
2. Confirm clean release baseline and current production SHA.
3. Create a clean worktree, e.g.
   `D:\Claude\Factcheck-worktrees\fix-readiness-authority-v1`.
4. Use Node 22.
5. Implement **one defect class per PR**.
6. Run `git diff --check`.
7. Run targeted tests.
8. Run full canonical suite.
9. Record:
   - passed
   - failed
   - unexecuted
10. Push branch.
11. Wait exact-head GitHub CI.
12. Perform independent exact-diff review.
13. Merge only when P0=0 / P1 blockers=0.
14. Re-check `origin/main` exact SHA.

No development work from `D:\Claude\Factcheck` dirty root.

---

# 5. Release sequence

A successful merge does not authorize deployment.

Release target must be explicit.

```text
BASELINE
b911ffbfa590dfee083c572871c1286642dc4f1c

TARGET
<exact successor merge SHA>
```

Canonical VPS procedure only:

```bash
cd /home/etsy/omniseller
git fetch origin main --prune
bash scripts/vps_deploy_and_verify.sh <TARGET_SHA>
```

If Step 2 emits:

```text
OWNER_AUTHORIZATION_NOT_PROVEN:
OMNISELLER_OWNER_AUTHORIZATION_V3:<digest>
```

stop.

Owner manually inspects the exact PR and manually posts the exact marker on that PR.

Then rerun the same canonical deployment command.

Never:
- fabricate the marker;
- calculate an alternate marker as authority;
- edit symlinks manually;
- stop the service manually to bypass runbook;
- deploy “latest main”.

---

# 6. Post-deploy verification

Do **targeted real workflow smoke**, not another giant UAT campaign.

### Amazon changed path

Use the existing real Cerebro artifact:

```text
3US_AMAZON_cerebro_B08L9QQ4BX_2026-09-22.csv

SHA256
CE4A9FCDB8CD854C049680349CFCA22B4022BF1D31DE03125E0BEFD5BF5FFDAE
```

Verify:

```text
import/analyze
→ readiness result
→ create Project when READY
→ Product Truth path reachable
```

### Etsy changed path

Use a real current ytuong.me/Etsy capture, not a fixture.

Verify:

```text
capture
→ query candidate support
→ winners/patterns
→ optional YTrends supplement
→ Master Keywords
→ Product Truth
```

### Release receipt

Capture:
- Owner authorization verified;
- backup path;
- service active;
- local revision exact;
- public revision exact;
- receipt path;
- smoke result.

---

# 7. P2 queue — explicitly outside release critical path

Only after the successor production release is stable:

1. allowlist or retire generic `/api/mcp/call`;
2. remove/hide unsupported H10 MCP surface;
3. consolidate legacy Etsy `YTRENDS_CONNECTOR_READY=false` UI with canonical reality;
4. correct Reset Database wording;
5. update stale Global Candidate B4 docs;
6. classify visible UI surfaces:
   - CANONICAL
   - OPTIONAL RESEARCH
   - HISTORICAL/HIDDEN
   - RETIRED
7. progressively hide legacy operator controls that no longer serve staff.

Do not bundle these into the readiness successor.

---

# 8. Product/operations direction

The desired staff-facing workflow should converge to:

### Amazon

```text
Have product/competitors
→ upload Cerebro
→ Analyze Opportunity
→ READY / NEED MORE DATA
→ Create Project
→ canonical project workflow
```

Xray remains optional support for ASIN planning.

### Etsy

```text
Need ideas?
→ optional YTrends discovery

Have niche/keyword?
→ ytuong.me / Etsy capture
→ Analyze Opportunity
→ READY / NEED MORE DATA
→ Create Project
→ Winners
→ Patterns
→ optional YTrends supplement
→ Master Keywords
→ Product Truth
```

### Intel

```text
market/social discovery
→ Opportunity Queue
→ route operator to the relevant marketplace validation source
```

This keeps Intel useful without allowing social context to become marketplace authority.

---

# 9. Exit criteria for the next release

The next release is eligible for Owner deployment review only when:

```text
P0 = 0
P1 release blockers = 0

production baseline exact and healthy
successor exact-head CI SUCCESS
canonical suite fully executed
no unexpected source/schema drift
readiness uses only qualifying evidence
Etsy query support semantics corrected
Intel/YTrends cannot substitute marketplace readiness evidence
commercialProof remains independent
one-click preserves provenance
release target explicit
```

If integrity/freshness is not implemented in that release, the repo-bound Spec V1 must be explicitly reconciled before declaring semantic closure.

---

# 10. Final priority order

```text
1. Verify/fix live Etsy observed-vs-derived provenance defect
2. Narrow successor: Research Readiness authority scoping
3. Etsy query-context support correction
4. Parser integrity outcome
5. Freshness decision/implementation
6. exact-head CI + independent review
7. explicit-SHA canonical deploy
8. targeted Amazon/Etsy smoke
9. P2 surface consolidation
```

This order is intentionally practical: protect truth first, unblock the simple operator workflow second, clean legacy surfaces later.
