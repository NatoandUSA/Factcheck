# PROJECT OPERATING GUIDE — Claude + GPT
## OmniSeller / 22Etsy Agent / AMZ-FBM Toolkit

**Status:** ACTIVE  
**Audience:** Claude, Claude Code, GPT, Codex, Antigravity, reviewers, future engineering agents  
**Owner context:** Internal operating system for the owner's own team and shops. This is **not** a SaaS product for outside sellers.  
**Primary business north star:** **Generate real embroidery revenue first** while building only the minimum trustworthy tooling needed to operate better.

---

# 1. WHY THIS GUIDE EXISTS

This project has accumulated multiple tools, architecture documents, handoffs, reviews and model contributions. The biggest risk is no longer lack of ideas. The biggest risk is:

- solving the wrong problem,
- building platform architecture before real business usage,
- duplicating sources of truth,
- confusing CI GREEN with business readiness,
- trusting stale/synthetic-looking data,
- changing proven domain logic while consolidating,
- letting multiple agents work from different assumptions,
- and spending more time on tooling than on actual Etsy/Amazon launches.

This guide is the shared operating contract for Claude and GPT.

Every agent must optimize for:

> **Correct business outcome + reliable evidence + minimum safe engineering + lower staff friction.**

The goal is not “finish the ticket.”  
The goal is to move the business and system forward without creating a new source of truth, a new maintenance burden, or a false confidence signal.

---

# 2. CURRENT MASTER DECISION

The system is split into three tracks.

## Track R — Revenue
**Priority: Highest**

22Etsy Agent and AMZ-FBM Toolkit remain active revenue/launch engines.

They do **not** wait for Omni consolidation.

### Etsy
22Etsy remains the active Etsy domain engine for:
- research interpretation,
- evidence-backed keyword work,
- Queue,
- Studio,
- Product Truth / Owner Check,
- manual publish readiness,
- first-sale workflow,
- Day-3 / Day-7 learning.

### Amazon
AMZ-FBM Toolkit remains the active Amazon domain authority for:
- Xray/Cerebro ingestion,
- keyword allocation,
- A10/listing rules,
- compliance,
- Product Truth,
- fail-closed launch readiness,
- PPC launch logic,
- manual execution.

## Track S — Safety & Trust
**Priority: P0 / P0.5**

Omni is currently allowed to receive:
- security closure,
- authentication,
- workspace correctness,
- SSRF protection,
- route classification,
- evidence/freshness instrumentation,
- raw observation persistence,
- auditability.

Omni is **not** currently authorized for broad feature expansion.

## Track C — Consolidation
**Priority: GATED**

Full Omni consolidation is not an active implementation program yet.

It may reopen only when:
1. P0 security is accepted.
2. P0.5 ingestion truth is accepted.
3. There is real Etsy/Amazon operational data.
4. There are 8–12 real cases for parity testing.
5. Staff pain/duplication is measurable.
6. Omni can prove it reduces steps/errors instead of creating a third permanent maintenance surface.

---

# 3. PROJECT MAP

## 3.1 OmniSeller Studio / Factcheck

**Repository:** `NatoandUSA/Factcheck`

### Current role
Internal staff shell / orchestration candidate.

### Current exact baseline
At the current reviewed checkpoint:
- `main`: `0433323d05382328e08f11fcd9794f0d071c6fa4`
- CI run: `31992003648`
- CI conclusion: GREEN
- Security Issue #3: OPEN

Treat exact SHA evidence as a checkpoint, not as proof of full readiness.

### Current strengths
- real Amazon + Etsy data ingestion paths exist,
- workspace/listing isolation controls have begun,
- AES-256-GCM secret storage exists,
- approval hash/version concurrency exists,
- recent-auth/nonce reset protection exists,
- CI exists,
- real Cerebro and Etsy data paths have been exercised,
- dashboard provides useful staff-facing views.

### Current critical weaknesses
- operational routes are not fully classified/protected,
- SSRF risk remains in URL-fetch learning path,
- `market_trends` / `learned_templates` ownership is incomplete,
- MCP/network transport is not fully bounded/auditable,
- current persisted research model is not yet the final cross-workspace source of truth,
- current UI numbers must not be trusted as “fresh real evidence” without provenance,
- branch governance must preserve exact-SHA trust baselines.

### Omni rule
**Omni may become the shared staff shell later. It is not yet the canonical cross-system data authority.**

---

## 3.2 22Etsy Agent

**Primary business role:** Etsy revenue engine  
**Canonical direction:** Queue → Studio → Owner Check → Publish & Learn

### Proven patterns worth preserving
- Evidence references and provenance.
- Deterministic listing package compilation.
- Product Truth facts.
- Owner Check assertions.
- Owner-set price required for publish eligibility.
- Modeled values never satisfy hard publish gates.
- Human verification persists separately from recomputed model output.
- Revision-bound facts.
- Manual publish.
- Day-3 / Day-7 learning.

### Current operating principle
Do not keep expanding the old dashboard.

Allowed work:
- first-sale path,
- Queue → Studio path,
- Publish & Learn minimum flow,
- fresh evidence ingestion,
- data correctness,
- bug/data-loss prevention,
- staff usability directly tied to launch.

Disallowed for now:
- large UI expansion,
- speculative analytics,
- parallel workflow systems,
- new platform layers unrelated to sales or data truth.

### Important business constraint
When evidence is missing, say **UNKNOWN**.

Never turn:
- “no data”
into
- zero volume,
- zero competition,
- low demand,
- high opportunity,
or any other fabricated signal.

---

## 3.3 AMZ-FBM Toolkit

**Primary business role:** Amazon launch engine

### Preserve as Amazon domain authority
- Xray/Cerebro semantics.
- Keyword allocation.
- A10/listing copy rules.
- compliance.
- Product Truth.
- fail-closed readiness.
- hash/revision-bound approval behavior.
- PPC launch logic.
- staff launch workflow.

### Key architecture lesson
The Staff UI/Owner Console should be an orchestration layer over existing accepted authorities.

The UI must not become a second business-rule engine.

### AMZ rule
AMZ launch work continues independently of Omni.

Do not delay a real Amazon embroidery launch while waiting for consolidation.

---

# 4. BUSINESS NORTH STAR

Engineering decisions must be evaluated against these outcomes:

## Etsy
1. Finish shop setup.
2. Publish real embroidery listings.
3. Confirm make-and-ship path.
4. Get the first sale.
5. Capture Day-3 / Day-7 results.
6. Learn from actual buyer behavior.

## Amazon
1. Complete Product Truth.
2. Build compliant launch-ready listing.
3. Prepare PPC / launch package.
4. Reach manual launch-ready/live state.
5. Learn from real launch data.

## Staff
The tool should make it obvious:
- what to do,
- who owns it,
- what data is real,
- what is blocked,
- why it is blocked,
- and the single next action.

If engineering work does not improve one of these dimensions, it is probably not P0/P1.

---

# 5. GOLDEN RULES FOR ALL AGENTS

## 5.1 Evidence before confidence
Never say:
- VERIFIED,
- GREEN,
- READY,
- FIXED,
- DEPLOYED,
- DONE

unless the evidence actually supports the claim.

Use explicit provenance labels:

- `GPT-LIVE-VERIFIED`
- `CLAUDE-LIVE-VERIFIED`
- `OWNER-REPORTED`
- `REPO-HANDOFF-REPORTED`
- `NOT VERIFIED`
- `NOT EXECUTED`
- `PENDING`

Never convert another agent’s report into your own verification.

---

## 5.2 Exact-SHA discipline
All CI, regression and merge-readiness claims must be tied to:
- repository,
- branch,
- exact SHA,
- workflow/run,
- conclusion.

GREEN on SHA A does not certify SHA B.

---

## 5.3 Read before editing
Before modifying code:

1. Read the target file.
2. Read callers.
3. Read callees.
4. Read related tests.
5. Read schema/migrations if data is involved.
6. Read staff/UI path if workflow is involved.
7. Search for same bug class.
8. Identify source of truth.

Forbidden:

> Prompt → Edit → DONE

Required:

> Understand → Trace → Verify → Decide → Implement → Test → Re-audit → Handoff

---

## 5.4 Root-cause closure
A fix is not complete unless:
- the visible symptom is fixed,
- the root cause is understood,
- same bug class is searched,
- adjacent behavior is checked,
- regression coverage exists where justified.

If root cause is not closed, status must be:

`PARTIALLY_RESOLVED`

---

## 5.5 One source of truth
Before adding:
- status,
- config,
- score,
- mapping,
- schema field,
- readiness flag,
- metadata,
- derived state,

ask:

> Where does this truth already live?

Reuse / derive / normalize whenever possible.

Do not silently create a duplicate authority.

---

## 5.6 CI GREEN ≠ product accepted
Acceptance has separate dimensions:

### Engineering acceptance
- code works,
- tests pass,
- exact-SHA CI passes.

### Security acceptance
- threat path closed,
- negative tests pass,
- access boundaries proven.

### Usability acceptance
- Staff can use it correctly,
- next action is obvious,
- no duplicate/conflicting workflow.

### Operational acceptance
- works in real deployment,
- works with real data,
- survives expected failures.

Never collapse these into one status.

---

# 6. SECURITY MODEL — INTERNAL, NOT SAAS

The system is for one organization with multiple staff/workspaces/shops.

Do not build:
- customer tenant provisioning,
- billing,
- SaaS entitlement systems,
- complex policy engines.

But keep these protections because they also prevent internal data corruption:

- authenticated sessions,
- CSRF protection,
- minimal roles,
- server-derived workspace,
- server-derived marketplace,
- workspace-scoped reads/writes,
- IDOR-safe behavior,
- SSRF protection,
- route classification,
- audit logs.

Recommended simple role set:
- `OWNER`
- `MANAGER`
- `STAFF`

Do not create more roles unless a real workflow requires them.

---

# 7. OMNI P0 SECURITY CONTRACT

Before new Omni product features merge, close the operational-route bug class.

## Required mechanism
Create one centralized Route Registry, decorator system, middleware declaration, or equivalent testable inventory.

Each operational route must explicitly define:
- `requires_auth`
- `allowed_roles`
- `requires_workspace`
- `marketplace_scope`
- `action_type`
- public/private classification

CI should fail if an operational route is unclassified.

## P0 must cover
- unauthenticated operational mutation routes,
- external-call endpoints,
- uploads,
- agent toggles,
- destructive template actions,
- learning URL fetch,
- remaining read surfaces.

## SSRF policy
URL-fetch paths must:
- allow supported HTTPS destinations only,
- reject loopback,
- reject RFC1918/private IPs,
- reject link-local,
- reject cloud metadata,
- reject reserved/multicast,
- validate IPv6,
- validate redirects,
- enforce timeout,
- enforce response-size cap,
- return safe error messages.

---

# 8. OMNI P0.5 — INGESTION TRUTH

Before Omni research metrics become trusted evidence, prove the data path.

## Raw observation contract
Persist an immutable raw record before normalization.

Required fields:
- `source`
- `provider`
- `workspace_id`
- `marketplace`
- `observed_at`
- `imported_at`
- `content_hash`
- `http_status`
- `elapsed_ms`
- `response_size`
- raw response or durable raw-response reference
- parse status

## Critical time rule
`observed_at` = when the real-world observation applies.

`imported_at` = when Omni ingested it.

Never use UI render time as evidence time.

Never silently substitute `imported_at` for unknown `observed_at`.

---

# 9. FUTURE SHARED CORE — ONLY AFTER GATES

If consolidation is approved later, the universal contract begins here:

## Shared
- Tenant/Workspace/Marketplace context.
- Observation/Evidence envelope.
- Provenance.
- `observed_at`.
- `imported_at`.
- content hash.
- revision identity.
- human verification assertions.
- audit trail.
- canonical server-side Readiness/Next Action output.

## Not universal
Do not force Etsy and Amazon into one business schema.

### Etsy-specific
- Etsy opportunity semantics,
- Etsy Master Keyword rules,
- Etsy Listing Cluster,
- 13 tags,
- Etsy Product Truth,
- personalization,
- owner-set Etsy price,
- Day-3 / Day-7 learning.

### Amazon-specific
- Xray/Cerebro,
- Amazon keyword allocation,
- title/bullet/backend search-term rules,
- compliance,
- Product Truth,
- PPC,
- launch approvals.

---

# 10. NEXT ACTION COMPILER RULE

There must be exactly one server-side authority for workflow readiness.

Input:
- Evidence,
- Product Truth,
- domain package,
- owner assertions,
- approval state.

Output:
- `PASS`
- `WARN`
- `BLOCK`
- reasons,
- one clear next action.

The UI may display this result.

The UI must not independently recreate the rules.

Forbidden:
- React component deciding publish readiness,
- duplicate `if` chains in multiple views,
- UI-only hard gates,
- hidden fallback IDs,
- default fake data to keep screens populated.

---

# 11. HUMAN VERIFICATION RULE

AI/model output may assist.

It may not satisfy hard owner/product truth gates.

Examples:

Allowed:
- MODELED price reference.
- suggested material based on evidence.
- inferred gift angle.
- predicted trend.

Not allowed to auto-pass:
- exact SKU,
- supplier confirmation,
- material,
- dimensions,
- personalization limits,
- IP QA,
- owner-set selling price,
- publish approval.

Human assertions must be:
- persisted,
- attributable,
- timestamped,
- bound to the exact fact/revision reviewed.

If evidence changes, approval/verification that depended on it must invalidate where appropriate.

---

# 12. REVENUE TRACK RULES

## Etsy
Engineering work is allowed when it:
- gets a listing published,
- improves real evidence,
- prevents wrong data,
- reduces Staff steps,
- records Day-3 / Day-7 learning,
- prevents fulfillment/publish mistakes.

Engineering work should be deferred when it:
- creates more dashboards,
- adds speculative analytics,
- adds new workflows,
- adds platform abstractions,
- duplicates YTuong/HeyEtsy research.

## Amazon
Engineering work is allowed when it:
- improves Product Truth,
- listing correctness,
- compliance,
- PPC launch,
- launch readiness,
- staff execution.

Do not delay Amazon launch work for Omni.

---

# 13. MULTI-AGENT WORKING MODEL

The shared environment is:

> **Git repository + branches/worktrees + Pull Requests + CI**

Not one chat.

## Recommended roles

### Claude / Claude Code
Primary implementation owner for a scoped task.

Responsibilities:
- inspect the system,
- implement,
- run targeted tests,
- run regression tests,
- self-review,
- produce exact-SHA handoff.

### GPT
Independent reviewer / architect / Best Next Move authority.

Responsibilities:
- challenge claims,
- verify exact state,
- review full stack,
- inspect architecture,
- inspect regression risk,
- inspect Staff impact,
- check source-of-truth duplication,
- choose next P0/P1/P2 action.

### Antigravity / second reviewer
Independent review, same-bug-class search, edge-case review.

## Rule
One implementation owner per task.

Do not let multiple agents independently modify the same feature at the same time.

Parallel work must be isolated by:
- branch,
- worktree,
- clearly separate scope.

---

# 14. PR DESIGN RULE

Each PR should have one main purpose.

Good:
- P0 route security closure.
- P0.5 MCP transport hardening.
- Queue → Studio cutover.
- atomic CSV write.
- Product Truth bug fix.

Bad:
- security + new dashboard + schema redesign + UX cleanup + dependency upgrade.

Every PR should answer:
1. What problem?
2. What root cause?
3. What files?
4. What invariant changes?
5. What was intentionally not changed?
6. What tests prove it?
7. What same-bug-class search was performed?
8. What remains unverified?

---

# 15. TESTING STANDARD

Use a layered test strategy.

## Targeted
Proves the exact bug/fix.

## Negative
Proves forbidden behavior stays forbidden.

## Boundary
Tests:
- empty,
- null,
- malformed,
- oversized,
- wrong workspace,
- wrong role,
- stale revision,
- missing evidence.

## Regression
Run the canonical suite.

## Runtime
When deployment/runtime behavior matters, verify actual runtime.

## Real-data
When a claim concerns:
- data quality,
- ranking,
- parsing,
- freshness,
- listing output,

test against real representative data.

Never claim “works with real data” from synthetic fixtures alone.

---

# 16. STAFF UX STANDARD

Every Staff workflow must answer:

1. What am I looking at?
2. Where did this data come from?
3. Is it real / modeled / owner-confirmed?
4. What is blocked?
5. Why?
6. What should I do next?
7. Where will the result appear?

Prefer:
- one front door,
- one queue,
- one next action,
- explicit PASS/WARN/BLOCK.

Avoid:
- many tabs,
- many overlapping workflows,
- hidden legacy routes,
- multiple versions of “ready”.

---

# 17. STOP-DOING LIST

Do not:

- build a SaaS platform,
- add more Omni product features before P0/P0.5,
- create a universal Amazon/Etsy mega-schema,
- auto-publish,
- duplicate H10/YTuong research engines,
- let UI calculate readiness,
- treat missing data as zero,
- treat modeled price as owner-set price,
- trust UI freshness without provenance,
- keep building the old 22Etsy dashboard,
- retire 22Etsy domain logic before parity,
- retire AMZ domain logic before parity,
- use `npm audit fix --force`,
- silently edit frozen scoring/gating logic,
- accept “DONE” without evidence,
- use old handoffs when a newer canonical handoff exists,
- create another strategy document unless it ends in an executed gate or revenue action.

---

# 18. CURRENT MASTER SEQUENCE

## Phase A — Revenue + Safety in parallel

### Revenue
- publish 2–3 strong Etsy embroidery listings,
- verify fulfillment,
- refresh niche evidence,
- cut Queue → Studio,
- create minimum Publish & Learn,
- continue one real Amazon embroidery launch.

### Safety
- protect main,
- close Omni Issue #3,
- add route classification,
- add SSRF fail-closed policy,
- preserve workspace correctness,
- exact-SHA CI.

## Phase B — Ingestion Truth
- harden MCP/network transport,
- persist raw observations,
- prove freshness end-to-end.

## Phase C — Real operating evidence
- collect Day-3 / Day-7 results,
- collect Amazon launch data,
- collect 8–12 real workflows.

## Phase D — GO / NO-GO Consolidation Review
Consolidation proceeds only if it measurably reduces:
- duplicate entry,
- staff confusion,
- operational errors,
- maintenance surfaces.

---

# 19. DECISION GATES

## GO — Omni consolidation
Only if:
- P0 accepted,
- P0.5 accepted,
- fresh evidence proven,
- 8–12 real parity cases exist,
- staff pain is measured,
- migration reduces complexity,
- revenue track is not blocked.

## NO-GO / DELAY
If:
- first sale is still blocked by ordinary business execution,
- Amazon launch is still blocked,
- Omni freshness is unproven,
- security remains open,
- consolidation would create a permanent third system,
- parity cannot be demonstrated.

---

# 20. WEEKLY SCOREBOARD

## Revenue
- Etsy listings live.
- Etsy orders.
- Day-3 views/favorites/orders.
- Day-7 results.
- Amazon embroidery launch-ready/live count.

## Staff
- tasks with clear owner.
- blocked tasks.
- average research → publish-ready time.
- duplicate manual-entry count.

## Trust
- P0 findings open.
- unclassified routes.
- observations with valid provenance.
- exact-SHA CI state.

## Consolidation
- real parity cases collected.
- duplicated workflow steps identified.
- duplicated business rules across repos.

---

# 21. REQUIRED HANDOFF FORMAT

Every substantial task ends with:

```json
{
  "project": "",
  "repository": "",
  "branch": "",
  "base_sha": "",
  "current_sha": "",
  "current_state": "",
  "objective": "",
  "what_changed": [],
  "files_changed": [],
  "gpt_suggestion_coverage": [],
  "root_cause": "",
  "impact_surface": [],
  "source_of_truth_review": "",
  "tests_executed": [],
  "tests_not_executed": [],
  "ci_evidence": {},
  "runtime_evidence": [],
  "known_risks": [],
  "not_verified": [],
  "open_questions": [],
  "recommended_next_step": "",
  "requested_gpt_review": [],
  "provenance": {}
}
```

Do not omit uncomfortable facts.

A good handoff makes the next reviewer faster and more skeptical.

---

# 22. PROMPT FOR CLAUDE IMPLEMENTATION

Use this template:

> Read `PROJECT_GUIDE_CLAUDE_GPT.md` first and treat it as the active operating contract.  
> Before editing, inspect the relevant source, callers, callees, tests, schema/data contracts, and Staff workflow.  
> Identify the root cause and search the same bug class.  
> Do not add a new source of truth.  
> Implement the smallest safe change that closes the root cause.  
> Run targeted, negative, boundary and regression tests proportional to risk.  
> Re-audit your own change.  
> Do not claim DONE unless the exact evidence supports it.  
> End with a structured JSON handoff using the required fields, exact branch/SHA, tests, known risks, not-verified items, and what GPT must review next.

---

# 23. PROMPT FOR GPT REVIEW

Use this template:

> Act as independent reviewer, system architect and Best Next Move authority.  
> Read the complete handoff and this Project Guide.  
> Do not accept DONE/FIXED/GREEN/READY at face value.  
> Verify the exact SHA and evidence where possible.  
> Review UI → API → business logic → persistence → schema/contracts → tests → Staff workflow.  
> Separate verified facts from reported claims and assumptions.  
> Search for same bug class and duplicated sources of truth.  
> Evaluate engineering, security, usability and business value separately.  
> Decide whether the checkpoint is ACCEPTED, PARTIALLY ACCEPTED or REJECTED.  
> Then choose exactly one Best Next Move ranked P0/P1/P2.

---

# 24. PROMPT FOR ARCHITECTURE WORK

Before proposing architecture, answer:

1. What real Staff/business problem exists?
2. Is it proven with current usage?
3. Can an existing tool already solve it?
4. What is the current source of truth?
5. What duplication will this remove?
6. What new maintenance surface will this create?
7. Is this required before first sale / launch?
8. Can it wait until real data exists?
9. What is the rollback path?
10. What is the measurable acceptance gate?

If these cannot be answered, do not start the architecture migration.

---

# 25. FINAL OPERATING PRINCIPLE

Claude and GPT should help the project become **smarter by reducing uncertainty, duplication and Staff effort**, not by generating more architecture.

The current system should evolve in this order:

> **Revenue → Safety → Truth → Real Usage → Consolidation**

Not:

> Architecture → More Architecture → New Dashboard → Rewrite → Eventually Launch

When in doubt, choose the next action that:
1. protects correctness,
2. gets a real product closer to market,
3. makes Staff work simpler,
4. produces better evidence for the next decision.

That is the operating standard.
