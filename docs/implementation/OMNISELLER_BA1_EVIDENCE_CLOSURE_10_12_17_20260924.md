# BA-1 Evidence Closure — Candidates #10 and #12–#17

**Authority baseline:** `9517c7c96ec6672e681bebc49f8c9e67866b0939`  
**Production mutation:** NONE  
**Scoring / threshold changes:** NONE  
**P2 cleanup:** NONE

## Result summary

The prioritized candidates cannot yet be truthfully marked Research Ready.

- #10 Amazon is blocked by one missing operator fact: the actual source capture/export date of the exact Cerebro workbook.
- #12–#17 Etsy have public marketplace evidence, but the current Global Candidate intake cannot produce the trusted exact-query binding required by the evaluator.
- A client-echoed query + uploaded source hint must not be relabeled as a server capture receipt. That approach was tested locally and rejected before commit because it would launder client-controlled metadata into server authority.

No authority gate was weakened.
## #10 — postpartum gifts for new mom

Exact workbook:
`Cerebro Mom Hallo Sweats Embr _ NGA - BR3.xlsx`

SHA-256:
`2114755df532e7eac1ffcc69af8335c34a63e306190db78e2a365171b8a277d5`

Verified source-native row:
- Search Volume: 1826
- Keyword Sales: 26
- Competing Products: 1000
- Title Density: 0
- Suggested bid: 1.09

Current result:
- advisory disposition: WATCH
- Research Readiness: NOT_READY
- blocker: `SOURCE_CAPTURE_DATE_REQUIRED`
- Commercial Proof: NOT_ESTABLISHED

No operator-explicit export/capture date has been found in prior project records. Filesystem/library timestamps are not accepted as a substitute.
## #12–#17 Etsy — current marketplace existence check

External public retrieval on 2026-09-24 confirms live Etsy evidence exists for the prioritized themes, including:
- #12 ADHD college planner;
- #13 contractor invoice template;
- #14 IEP parent binder printable;
- #15 Airbnb cleaning checklist printable;
- #16 moody botanical printable wall art;
- #17 Notion wedding planner.

This is useful evidence-discovery context only. It is **not** imported as canonical OmniSeller evidence and does not establish Research Readiness by itself.

The current evaluator requires an Etsy evidence row with:
- `sourceFamily=ETSY_PUBLIC_SEARCH`;
- valid integrity;
- fresh operator-attested source date;
- `supportScope=QUERY_RESULT_SET`;
- exact query binding;
- binding state `OBSERVED`;
- authority `SERVER_PROVIDER` or `SERVER_CAPTURE_RECEIPT`;
- a non-null server capture/receipt identity.
## Confirmed BA blocker

Current Global Candidate Etsy import derives query context from the uploaded CSV/HTML parser as:
- state: `SOURCE_HINT`;
- authority: `NONE`;
- captureId: null;
- support scope: `QUERY_CONTEXT_HINT`.

Therefore the normal staff path cannot satisfy the current Etsy Research Readiness gate.

There is no production implementation of `SERVER_CAPTURE_RECEIPT`; only evaluator/promotion test fixtures currently model it.

Existing Etsy routes consume staff-uploaded evidence or YTrends research. They do not provide a server-originated Etsy public-search capture receipt suitable for this gate.

## Rejected unsafe shortcut

Rejected before commit:
```text
operator queryPhrase
+ uploaded CSV keyword_context
+ server hash
→ SERVER_CAPTURE_RECEIPT
```

Reason: both semantic inputs are client-controlled. A server hash would notarize the submission, not independently establish marketplace query identity.
## Required narrow BA engineering blocker

A future implementation may proceed only if it creates a **genuine server-originated or independently verifiable query capture**, not merely an attestation echo.

Minimum acceptance:
1. exact query identity originates from, or is independently verified by, the server-side capture mechanism;
2. raw response/artifact hash is retained;
3. capture time and timezone are retained;
4. parser integrity is VALID;
5. query-result membership is derived from the captured artifact;
6. deterministic capture/receipt identity is persisted or independently re-verifiable;
7. arbitrary staff CSV query hints remain authority NONE;
8. mismatch/tamper cases fail closed;
9. no Commercial Proof authority is granted by this receipt;
10. YTrends remains research-only and is not relabeled as Etsy public-search proof.

Until such a path exists, #12–#17 remain NOT_READY under current authority.

## BA-1 status

```text
#10:       BLOCKED — OPERATOR_CAPTURE_DATE_REQUIRED
#12–#17:  BLOCKED — TRUSTED_ETSY_QUERY_CAPTURE_PATH_MISSING

SHORTLIST_V1: NOT AUTHORIZED
PRODUCTION:   UNCHANGED
```
