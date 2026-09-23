# BA-1 — 20 Candidate Current-Authority Replay

**Authority HEAD:** `9517c7c96ec6672e681bebc49f8c9e67866b0939`
**Evaluator:** `GLOBAL_CANDIDATE_EVALUATION_V1` / `GLOBAL_CANDIDATE_PROOF_V1`
**Production mutation:** NONE
**Candidate set:** the same locked 20 pilot labels.

## Replay integrity

This is a current-authority **semantic reconstruction**, not a claim that the old transient in-memory evidence objects were byte-preserved.

Preserved exactly where verifiable:
- the 20 candidate labels and marketplace scopes;
- Intel source hash `4e7c4c0...`;
- Amazon workbook hashes `2114755d...` and `fe700526...`;
- thematic-vs-exact Amazon relationship semantics;
- Etsy verified snapshot hash `e5c97785...` and six source URLs;
- old disposition baseline;
- suppression of candidate-wide commercial metrics for thematic Amazon rows.

Amazon source workbooks on Alex were re-hashed and match the verified pilot hashes exactly.
For candidate #10, the source-native workbook row was re-read:
- phrase: `postpartum gifts for new mom`
- Search Volume: 1826
- Keyword Sales: 26
- Competing Products: 1000
- Title Density: 0
- H10 suggested bid: 1.09

No new freshness date, server capture receipt, Commercial Proof authority, or marketplace evidence was invented.

## Result

```text
Candidates:             20
Disposition:
  NEEDS_EVIDENCE:       19
  WATCH:                 1
  PROMOTE:               0
  KILL:                  0

Research Readiness:
  READY:                 0
  NOT_READY:            20

Commercial Proof:
  ESTABLISHED:           0
  NOT_ESTABLISHED:       7
  NOT_PRESENT:          13

Disposition drift vs verified pilot:
  0
```
## Evidence-closure classification

### Lane A — exact Amazon lead, freshness metadata missing

**#10 — postpartum gifts for new mom**

Current result:
- disposition: WATCH
- Research Readiness: NOT_READY
- reason: `SOURCE_CAPTURE_DATE_REQUIRED`
- proof: NOT_ESTABLISHED

The exact Cerebro metrics remain useful research evidence. Do not backfill a capture date from filesystem metadata. Obtain a canonical fresh Cerebro export or an explicit operator-attested source capture date that satisfies current policy.

### Lane B — Amazon thematic proxies

**#8, #9, #11**

Current result:
- Research Readiness: NOT_READY
- freshness metadata absent;
- candidate-wide commercial metrics remain intentionally suppressed.

Required closure:
- obtain candidate-aligned marketplace evidence, not merely a thematically related keyword row;
- preserve exact source relationship;
- supply current-policy source capture metadata.
### Lane C — Etsy observed pages without trusted query binding

**#12–#17**

Current result:
- disposition: NEEDS_EVIDENCE
- Research Readiness: NOT_READY
- reason: `ETSY_MARKETPLACE_EVIDENCE_REQUIRED`

The prior observed-public page extracts are not upgraded. Current policy requires a qualifying Etsy query-result-set with authoritative server/capture-receipt query binding plus valid freshness metadata.

Required closure:
- recapture through the canonical Etsy marketplace evidence path for the exact candidate query;
- retain `QUERY_RESULT_SET` scope;
- retain trusted query binding/capture ID;
- retain explicit source capture date/timezone metadata.

### Lane D — Intel/research-only candidates

**#1–#7, #18–#20**

Current result:
- Research Readiness: NOT_READY
- reason: `ETSY_MARKETPLACE_EVIDENCE_REQUIRED`

Intel remains discovery/context only. These candidates need qualifying marketplace evidence before Project selection.
## BA-1 decision

`SHORTLIST_V1` is **not authorized yet**.

No threshold or scoring change is justified by this replay.

The next action is evidence closure, in this order:
1. recapture/attest #10 exact Amazon source freshness;
2. canonical Etsy query captures for #12–#17;
3. candidate-aligned Amazon evidence for #8/#9/#11;
4. marketplace evidence acquisition for Intel-only #1–#7/#18–#20.

After valid evidence refresh, rerun the same evaluator without changing policy, then perform the human 0–5 shortlist decision.
