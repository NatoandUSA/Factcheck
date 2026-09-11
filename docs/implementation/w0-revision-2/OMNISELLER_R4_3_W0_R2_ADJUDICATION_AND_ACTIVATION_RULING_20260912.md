# OmniSeller R4.3 — W0 Packet Revision 2 Adjudication

**Status:** `W0 CORRECTIONS COMPLETE — OWNER-DIRECTED BOUNDED W1 ACTIVATION`  
**Date:** 2026-09-12

## Changes from Revision 1

1. Added raw commands, raw outputs and exit codes for status, identities, merge base, ahead/behind, recovery refs, product-source diff and donor DAG.
2. Embedded exact-byte copies of both controlling documents under `controlling-documents/`.
3. Clarified that schema acceptance means acceptance of the logical single-store direction and repair contract S1–S7, never donor code as-is.
4. Explicitly prohibits W1 from using the donor `commerce_workflow_artifacts` writer until its project-bound idempotency/request-hash repairs are accepted and implemented.
5. Added route-by-route `KEEP / STAFF_DENY / ADMIN_READ_ONLY / DEFER_REMOVE` policy and W1 test IDs.

## Human Owner process ruling

The Human Owner directed Codex to proceed without routine multi-agent review. Independent review is now requested only when the coordinator is genuinely uncertain or before consequential decisions such as physical schema migration, destructive cleanup, merge or deployment.

W1 is authorized as a bounded, reversible implementation slice because it does not activate a new physical schema, delete legacy code, push, merge or deploy. Schema migration remains a consequential decision and therefore stays behind a review/Owner decision before activation.

## Binding boundaries

```text
W1 MAY:
  create one staff-visible Amazon path
  create one staff-visible Etsy path
  support 1..N file preview/accounting
  confirm immutable imports using the existing accepted import store
  refresh/relogin/reopen/restart
  deny legacy staff write routes

W1 MAY NOT:
  use donor commerce_workflow_artifacts writer
  add/activate an MKL schema migration
  implement Amazon scoring/MKL
  implement Etsy winners/Pattern Miner
  delete legacy source/routes
  push, merge or deploy
```

## W1 exit

W1 exits only when a normal-browser staff journey passes on an exact local commit with real fixtures and role/scope negative tests. Any failed W1 gate stops the slice; it does not open W2 scope.

