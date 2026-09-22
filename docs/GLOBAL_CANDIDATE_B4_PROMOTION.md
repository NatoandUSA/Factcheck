# Global Candidate Pool — B4 Promote-to-Project thin slice

## Purpose

B4 adds one explicit human promotion action from an accepted B3 PROMOTE candidate into the existing OmniSeller Project workflow.

Business path:

Global Candidate → explicit OWNER/MANAGER Promote → canonical Project scope → EVIDENCE_INTAKE → existing OmniSeller workflow.

## Authority and provenance

Promotion does not upgrade evidence authority. The project-scoped intake row is OBSERVED research evidence with source GLOBAL_CANDIDATE_POOL, authority NONE, and allowedUse RESEARCH_ONLY.

It stores only immutable Global Candidate evidence refs/hashes plus the B3 evaluation snapshot. Original raw evidence remains in the immutable Global Candidate Pool.

## Promotion gate

The server reevaluates the candidate with canonical B3 logic at promotion time. Only advisoryDisposition=PROMOTE can create a Project.

The project seed phrase is server-derived from the candidate. The client supplies only an explicit project name and idempotency key.

## Idempotency

global_candidate_promotions is an immutable receipt table.

- same idempotency key + same request → replay existing Project;
- same idempotency key + different request → fail closed;
- same candidate with a different key → fail closed as already promoted;
- one candidate can create at most one Project in one tenant/workspace/marketplace scope.

## Project semantics

A promoted candidate creates a normal scoped research_projects row in EVIDENCE_INTAKE. It does not bind product classification or invent Product Truth.

Existing Projects are not updated.

## Explicit non-goals

- no Product Truth creation;
- no listing creation;
- no approval/export/publish;
- no marketplace write;
- no Social Handoff change;
- no automatic promotion;
- no donor Project insertion path;
- no generalized promotion framework;
- no experiment automation.

B4 exists only to move accepted candidates toward the business pilot: 20 real candidates → Top 5 → 5 Projects → 1–3 experiments.