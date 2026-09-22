# GATE C OBSERVATION PROTOCOL V1

Date: 2026-09-23
Purpose: capture real operator friction before authorizing new feature behavior.

## 1. Run identity

Gate C Run ID:
Marketplace: AMAZON / ETSY
Omni Production Revision (MUST equal `b911ffbfa590dfee083c572871c1286642dc4f1c` for the frozen Gate C reference build unless a later owner decision explicitly replaces the baseline):
Intel Production Revision (only if Intel is used):
Operator Role:
Operator Prior Experience:
Started At:
Observer / Reviewer:

## 2. Input identity

Input filename:
Input SHA-256:
Immutable input copy/reference:
Export/capture date:
Freshness status: FRESH / STALE / UNKNOWN

For Amazon, use a real Helium 10 Cerebro CSV/XLSX.
For Etsy, use a real Etsy Search CSV/HTML capture supported by the current production parser.
## 3. Operator rules

- Operator must not be the owner.
- No terminal, database, API, or developer-console assistance.
- Observer may watch and record, but must not tell the operator which button to click.
- Existing normal staff instructions may be provided before the run.
- Do not alter production data or code solely to make the run pass.
- Do not continue past a fail-closed gate by manual bypass.

## 4. Per-step observation

For every pause longer than 30 seconds, record:

Time:
Screen:
What the operator intended to do:
What blocked or confused them:
Classification: STEPS / GATE / PARSE / WORDING / DATA_MISSING / BUG
Operator verbatim:

The operator verbatim quote is primary evidence. Do not paraphrase it in place of the original wording.
## 5. Canonical first friction

Record exactly ONE primary first friction:

Screen:
Classification:
Operator verbatim:
Observed system message/code:
Did operator continue after first friction? YES / NO

Secondary friction notes:
(optional; first friction remains the canonical primary finding)

## 6. Completion

Could the operator finish the intended workflow? YES / NO
Stopped at:
Total time:
Number of times they asked another person:
Number of times they reread instructions:

Evidence captured by:
## 7. Data sanity observation

Visually compare the application's interpretation with the source file.

Record:
- parsed listing/keyword count appears plausible vs input: YES / NO / UNKNOWN
- any value shown as 0 that should be UNKNOWN: YES / NO
- any metric shown without a source/provenance explanation: YES / NO
- truncation or partial retrieval signal: YES / NO / UNKNOWN
- structural drift indication: YES / NO / UNKNOWN

Do not infer missing = zero.

## 8. Gate C-M sequence

Run independently for Amazon and Etsy.

Amazon:
1. Start from current production UI.
2. Use one real, relevant Cerebro export within Freshness Policy V1 when possible.
3. Attempt the normal path from marketplace evidence toward creating/opening a Research Project.
4. Stop and record the first friction before receiving developer help.

Etsy:
1. Start from current production UI.
2. Use one real, relevant Etsy Search capture within Freshness Policy V1 when possible.
3. Attempt the normal path from marketplace evidence toward creating/opening a Research Project.
4. Stop and record the first friction before receiving developer help.
## 9. Gate C-I sequence

Gate C-I is separate from Gate C-M.

Prerequisites:
- exact Intel production revision recorded;
- exact production handoff read path known;
- last successful sync known;
- synthetic/seed involvement known;
- health failures assessed only if they are on the exact handoff read path.

Intel-only evidence must not be interpreted as marketplace validation.
The run may validate handoff usability, provenance, wording, and queue behavior only.

## 10. Decision mapping

If FIRST FRICTION = GATE:
- two-axis semantic split becomes authorized P1.

If FIRST FRICTION = STEPS:
- one-click orchestration becomes authorized P1.

If FIRST FRICTION = PARSE:
- parser integrity/outcome-set becomes authorized P1.

If FIRST FRICTION = WORDING:
- wording/localization becomes authorized P1.

If FIRST FRICTION = DATA_MISSING:
- fix source/input contract first.

If FIRST FRICTION = BUG:
- fix only the observed bug unless additional evidence authorizes more.
