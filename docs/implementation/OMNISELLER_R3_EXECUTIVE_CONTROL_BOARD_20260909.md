# OmniSeller R3 — Executive Control Board

Date: 2026-09-09

## Current decision

**READY TO EXECUTE LOCALLY — NOT READY TO MERGE OR DEPLOY**

| State | Result |
| --- | --- |
| Production baseline | `main@8dd565698...` |
| C0 | `df54bfcdb...` — independently ACCEPTED |
| C1 | HEAD `43e2a27ef...` + three tested uncommitted files |
| Route integration | Not implemented |
| Amazon/Etsy continuous UAT | Not executed |
| Linux certification | Pending |
| GitHub push/PR/merge | Not authorized |
| VPS/production | No action authorized |

## Final role table

| Actor | Owns | Must not do |
| --- | --- | --- |
| Owner | authorize push, merge, deploy and final submission policy | treat AI ACCEPT as automatic deployment permission |
| GPT3/Codex | only canonical implementation and integration writer | self-certify, self-merge, direct VPS hotfix |
| GPT1 | Product Truth, policy/approval authority review | canonical implementation or external authorization |
| GPT2 | DB/API/transaction/CAS/migration design review | become second integration owner |
| GPT4 | adversarial security, isolation and exact-SHA review | edit then approve the same code |
| Claude | claim guard, EN/ES semantics, intelligence and donor parity | transplant donor persistence; self-certify donor code |
| Gravity | continuous normal-browser staff UAT and UX findings | architecture/release certification |
| Linux PC | clean Node 22, DB/migration/build certification | act as business authority |
| GitHub | source, PR, CI and release evidence ledger | receive dirty/unreviewed work as release evidence |
| VPS | exact certified release runtime | development, manual DB repair or experimental patching |

## Execution board

| Gate | Deliverable | Owner | Required review | Exit | Estimate |
| --- | --- | --- | --- | --- | ---: |
| G0 | final C1 policy commit | GPT3 | GPT1 + GPT4 | exact SHA, clean, Node 22 PASS | 0.5–1 d |
| G1 | canonical claim/IP guard | GPT3 | Claude + GPT1 + GPT4 | Hija/Esposa and prompt claims safe | 1–2 d |
| G2 | immutable listing/creative revisions | GPT3 | GPT2 + GPT4 + Linux | CAS/idempotency/migration PASS | 1–3 d |
| G3 | compose→edit→approve→export bootstrap | GPT3 | GPT1 + GPT2 + GPT4 | normal UI draft/save/edit/reload works | 1–2 d |
| G4 | Amazon Hija/Esposa workflow + A+/prompts | GPT3 | Claude + Gravity + GPT4 | continuous browser package PASS | 2–4 d |
| G5 | Etsy Hija workflow + prompts | GPT3 | Claude + Gravity + GPT1/GPT4 | continuous browser package PASS | 2–4 d |
| G6 | atomic legacy cutover + RC | GPT3 | all relevant lanes + Linux | one exact RC SHA, no P0/P1 | 1–2 d |
| G7 | GitHub/VPS release | Owner authorizes; GPT3 executes | CI + postdeploy UAT | receipt or rollback | gated |

Expected engineering range: **10–18 focused working days**, including a 2–4 day blocker buffer.

## Staff workflow target

```text
Seller enters Product Truth + imports research
→ safe Amazon/Etsy draft + complete image-prompt package
→ edit/save/reopen immutable revisions
→ Manager verifies Truth and content
→ Owner authorizes exact submission package
→ Seller manually submits
→ tool records OPERATOR_REPORTED_SUBMITTED only
```

## Immediate assignments

| Now | Action |
| --- | --- |
| GPT3/Codex | commit only the three pending C1 files, rerun Node 22 evidence, freeze SHA, stop |
| GPT1 | prepare authority/purpose/lifecycle exact-SHA attacks |
| GPT2 | review C2-B root/revision/CAS/idempotency design |
| GPT4 | replay every C1 bypass on the final SHA |
| Claude | prepare bounded claim-guard allowlist/denylist and EN/ES fixtures |
| Gravity | prepare G3–G5 continuous browser scripts; no PASS claim yet |
| Linux | prepare clean Node 22 and disposable DB certification |
| GitHub/VPS | no action until their gates and Owner authorization |

## Non-negotiable stop rules

- No exact SHA → no certification.
- No independent acceptance → no merge progression.
- No real continuous browser journey → no staff-usability claim.
- Research never becomes Product Truth automatically.
- Product name/type never proves materials, purity, size or included items.
- No second canonical database, writer or integration owner.
- No unsafe keyword/tag padding; preserve all keywords in accounting instead.
- No direct VPS fixes and no marketplace auto-publish in Phase 1.

**NEXT ACTION: close and independently certify G0/C1.**
