# TWO-AXIS / GATE C SPEC V1

Date: 2026-09-23
Status: SEALED FOR GATE C VALIDATION — FEATURE CODE FROZEN
Omni repository main: `5b5f60b92520692f88896ad970eec9af0d061288`
Omni frozen release baseline: `b911ffbfa590dfee083c572871c1286642dc4f1c`

## 0. Release authority lock during Gate C

`LATEST MAIN != RELEASE AUTHORITY DURING GATE C`

`RELEASE AUTHORITY = b911ffbfa590dfee083c572871c1286642dc4f1c UNTIL GATE C DECISION`

Repository `main` is canonical development history only during Gate C. It may contain merged but intentionally un-deployed behavior, including PR #71. It MUST NOT be interpreted as production authorization.

Every Gate C receipt MUST record the exact production SHA actually observed. Every deploy/release command during Gate C MUST name an explicit owner-authorized target SHA. Automation, operators, and reviewers MUST NOT infer a deploy target from `origin/main`, `latest main`, or the newest merge commit.

## 1. Owner decisions

1. Intel-only signals go to an Opportunity / Investigation Queue, not directly to a Research Project.
2. Export authority is OWNER authorization; it is not gated by `commercialProof`.
3. Freshness policy V1: Amazon Cerebro <= 30 days; Etsy capture <= 14 days.
4. Diagnostic-only repairs are allowed during freeze only when the diff changes what the system reports about itself and cannot change operational/product behavior.

## 2. Separation of concerns

`researchReadiness` answers: is the marketplace input sufficient to form a research hypothesis worth testing?
`commercialProof` answers: has marketplace commercial performance been established?
`exportAuthorization` answers: is an authorized human allowed to export the artifact?

These three concerns are independent. Research readiness MUST NOT be treated as commercial proof.
Commercial proof MUST NOT be used as a proxy for export authorization.
## 3. Research Readiness V1

Research Readiness = AUTHORITY × INTEGRITY × SUFFICIENCY.

A candidate is READY only when all three dimensions pass.

### 3.1 Authority — closed allowlist, deny by default

AMAZON:
- sourceFamily: `AMAZON_CEREBRO`
- authority classification: `MODELED_THIRD_PARTY`
- CAN satisfy the Research Readiness authority floor.
- CANNOT establish Commercial Proof by itself.

ETSY:
- sourceFamily: `ETSY_PUBLIC_SEARCH`
- authority classification: `OBSERVED_PUBLIC`
- CAN satisfy the Research Readiness authority floor.
- DOES NOT automatically establish Commercial Proof.

INTEL / SOCIAL:
- sourceFamily: `SOCIAL_LISTENING`
- contributes 0 to the Research Readiness authority floor.
- allowed use: opportunity discovery, WhyNow, VOC, language/context.
- Intel-only MUST stay in Opportunity / Investigation Queue.

Any new qualifying source type requires an explicit owner-approved policy change and receipt.
### 3.2 Integrity

Parser outcomes are:
- `VALID`
- `DEGRADED_PARSE`
- `INVALID`

VALID means:
- parser contract satisfied;
- required structural markers are present;
- no known truncation or partial-fetch signal;
- coverage meets a baseline-derived parser contract;
- no structural-drift warning.

VALID MUST NOT claim impossible "100% completeness" when the denominator is unknowable.
If completeness/coverage cannot be established, record `UNKNOWN`; do not silently infer completeness.

`DEGRADED_PARSE` includes known partial retrieval, structural drift, below-contract coverage, truncation, or network degradation.
`DEGRADED_PARSE` is fail-closed for Research Readiness.

Input file SHA-256 and an immutable copy/reference to the exact input are required for Gate C evidence.
### 3.3 Sufficiency

Amazon V1:
- qualifying Cerebro source;
- candidate <-> keyword-set relevance;
- usable modeled demand signal;
- enough keyword / competition context to form a research hypothesis.

Etsy V1:
- qualifying Etsy public-search capture;
- query/candidate relevance;
- enough marketplace observations;
- enough competition / pattern context to form a research hypothesis.
- missing sold/revenue remains UNKNOWN and does not automatically make the candidate NOT_READY.

Freshness V1:
- Amazon Cerebro export age <= 30 days.
- Etsy capture age <= 14 days.
- unknown capture/export date => `FRESHNESS_UNKNOWN` and NOT_READY in V1.

These are Policy V1 thresholds, not architectural invariants.
## 4. Commercial Proof

Existing states remain:
- `NOT_PRESENT`
- `NOT_ESTABLISHED`
- `ESTABLISHED`

Modeled third-party evidence cannot establish Commercial Proof by itself.
Observed marketplace evidence does not automatically establish Commercial Proof merely because it is observed.

Downstream commercial gates MUST read `commercialProof`, not `researchReadiness`.

## 5. Export

Exact export / UAT packaging is governed by OWNER authorization.
Export is not proof of sellability and MUST NOT require `commercialProof = ESTABLISHED` unless a future explicit owner policy says otherwise.

## 6. Legacy advisory disposition

`advisoryDisposition` / PROMOTE / WATCH / NEEDS_EVIDENCE remains a legacy/internal compatibility surface in V1.
It MUST NOT define whether a Research Project may be opened once a future two-axis implementation is authorized.
Do not delete or rename the legacy enum during Gate C freeze; enumerate and migrate consumers separately after evidence authorizes implementation.
## 7. Candidate evidence persistence semantics

Current Global Candidate preview is zero-write.
Current confirm/import reparses the exact uploaded file and persists candidate evidence.

Candidate Confirm is defined as:
- permission to persist parsed research evidence;
- NOT a staff attestation of truth;
- NOT an evidence-authority upgrade;
- NOT promotion authority;
- NOT commercial proof.

Therefore any future one-click Preview -> Confirm orchestration must preserve the original source authority classification and must not relabel evidence as staff asserted.

## 8. Intel policy

Intel is a discovery/context system.
Intel-only evidence cannot open a Research Project in V1.
Intel signals enter an Opportunity / Investigation Queue until qualifying marketplace evidence is supplied.

The previous behavior in which Intel could be the deciding vote that flips WATCH -> PROMOTE is intentionally not a target behavior under this spec.
Any future test that protects such behavior must be rewritten only after code implementation is separately authorized, with an owner decision receipt.
## 9. Freeze rules

PRE-GATE-C ALLOWED:
- deploy an already-approved canonical release;
- restore SSH/access;
- production configuration correction;
- read-only diagnostics;
- provenance verification;
- health checks and receipts;
- diagnostic-only repair that changes reporting only, not operational/product behavior.

PRE-GATE-C FORBIDDEN:
- repository feature changes;
- evaluator behavior changes;
- parser feature changes;
- UI workflow changes;
- new product-capability branches/PRs.

If an operational problem requires behavior-changing source code, the affected Gate C lane remains BLOCKED. The freeze is not bypassed.

## 10. Gate C decision rule

Gate C must identify the FIRST FRICTION:
- STEPS => one-click intake becomes P1.
- GATE => two-axis semantic split becomes P1.
- PARSE => parser integrity/outcome-set becomes P1.
- WORDING => wording/localization becomes P1.
- DATA_MISSING => improve input/source contract, not UI.
- BUG => fix the bug narrowly.

Do not implement all possible improvements. Implement only what real workflow evidence authorizes.
