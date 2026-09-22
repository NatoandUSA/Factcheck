# Global Candidate Pool — B3 Evidence Evaluation & Decision Support

## Purpose

B3 evaluates the immutable B2 candidate/evidence pool and returns evidence-first decision support. It does not replace evidence with a score, persist a business decision, promote a candidate, or mutate Project/Product Truth/listing state.

## Invariants

- Commercial signals do not imply commercial proof.
- B3 V1 proof requires `OBSERVED_PUBLIC` / `E1_OBSERVED_PUBLIC` plus field provenance `state=OBSERVED`, `authority=SERVER_PROVIDER`, and `allowedUse=COMMERCIAL_DECISION`.
- No current B2 Etsy CSV field meets that proof gate; its canonical field provenance remains `authority=NONE` / `allowedUse=RESEARCH_ONLY`.
- MODELED_THIRD_PARTY, PROJECT_RESEARCH, proxies, and RESEARCH_ONLY data cannot establish commercial proof.
- Current Etsy CSV numeric fields remain research-only because canonical field provenance is authority=NONE and allowedUse=RESEARCH_ONLY.
- Social Handoff remains RESEARCH_ONLY; it may support timing/corroboration but never substitute for marketplace evidence.
- Missing, zero, or weak evidence alone never produces KILL.

## Advisory dispositions

- NEEDS_EVIDENCE: marketplace/commercial evidence is absent or no positive demand/sales signal exists.
- WATCH: positive market signal exists but observed-public evidence, competition context, or corroboration is incomplete.
- PROMOTE: either proof is established with competition context, or observed-public market signals plus competition and cross-source corroboration justify opening a Project for deeper research. The latter is explicitly labeled PROMOTE_FOR_PROJECT_RESEARCH_NOT_AS_COMMERCIAL_PROOF.
- KILL: reserved for a future explicit canonical negative/disqualifier policy; B3 does not infer it from absence or zeros.

Every disposition exposes reason codes, unknowns, accepted unknowns, proof blockers, evidence references, authority/tier, competition context, social support and why-now signals.

## Ranking

There is no opportunity score. priorityRank is a secondary deterministic lexicographic aid only: disposition, proof state, observed-public evidence count, source-family count, positive demand/sales signal count, evidence count, then phrase. The underlying ranking basis is returned with each candidate.

## Pilot alignment

B3 exists to make the program acceptance test executable: 20 diverse real candidates → 5 meaningful Projects → 1–3 business experiments → measurable commercial outcomes. A ranking system that cannot explain why five real candidates deserve Project-level investigation fails this phase.

## Explicit non-goals

- No new migration or generalized framework.
- No persisted decision state or decision write endpoint.
- No UI framework expansion.
- No B4 Promote-to-Project mutation.
- No Product Truth, listing, approval, export, submission or publish mutation.
- No Social Handoff protocol or persistence change.
