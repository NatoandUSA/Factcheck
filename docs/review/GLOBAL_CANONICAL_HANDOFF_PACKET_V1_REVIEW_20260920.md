# Global Canonical Handoff Packet V1 — Isolated Review Packet

Branch: `review/global-opportunity-v2-isolated-20260919`

## Isolation contract
- Pure read-only packet builder/verifier only.
- No canonical workflow invocation.
- No route, migration, DB write, filesystem persistence, Project creation, Product Truth mutation, MKL mutation, candidate status mutation, proof-gate mutation, listing approval, export, or publish authority.
- No PR is created from this branch.
- Main and PR #59 remain untouched.

## Added slice
- `server/globalOpportunityCanonicalHandoffPacket.js`
- `review_tests/test_global_opportunity_canonical_handoff_packet.cjs`

## Purpose
Package one `REQUEST_CANONICAL_EVALUATION` review artifact into a deterministic, hash-bound, read-only handoff packet that canonical OmniSeller/Codex can inspect later.

The packet does not execute the handoff. It carries enough lineage and review context for an independent canonical re-evaluation.

## Required bindings
The packet binds together:
- `viewHash`
- `ledgerHash`
- `ledgerTailHash`
- `ledgerEntryCount`
- canonical-evaluation request `artifactId`
- request `entryHash`
- request `sourceEnvelopeHash`
- target cluster ID
- evidence lineage
- target-scoped review artifact references

## Evidence lineage
Each evidence reference carries:
- `sourceFamily`
- `sourceFileId`
- `lineageHash`
- `proofType`
- `commercialMetricsVerified`

The packet requires at least one valid evidence lineage row.

## Execution contract
```text
authority = READ_ONLY_HANDOFF
sidecarMayInvokeCanonicalWorkflow = false
sidecarMayMutateCanonicalState = false
canonicalSystemMustReevaluateIndependently = true
packetConfersNoApproval = true
packetConfersNoProofGate = true
packetConfersNoProjectCreationAuthority = true
packetConfersNoProductTruthAuthority = true
packetConfersNoPublishAuthority = true
```

## Review artifact context
The packet includes target-scoped artifact references in ledger sequence order:
- sequence
- artifact ID
- artifact type / intent
- entry hash
- source envelope hash
- recordedAt
- reviewerRef
- canonical-request marker

It does not copy operational authority from any artifact.

## Full audit / bug-hunt findings
1. **Ledger top-hash validation was insufficient**: initial handoff validation recomputed only `ledgerHash`. A maliciously modified entry plus recomputed ledger hash could bypass that check. Fixed by reusing the Review Artifact Ledger's full semantic/hash-chain verifier.
2. **Review-context ordering**: artifact refs were initially sorted by artifact ID. They now preserve ledger sequence order, which reflects immutable review chronology.
3. **Ledger snapshot binding**: packet now also binds `ledgerTailHash` and `ledgerEntryCount`, not only `ledgerHash`.
4. **Self-consistent authority escalation**: packet verifier now rejects authority changes even when an attacker recomputes a valid packet hash.
5. **Evidence/reference semantics**: verifier validates evidence lineage hashes, review artifact hashes, canonical-request presence, and ledger snapshot bindings after packet hash verification.
6. **Wrong-artifact handoff**: notes/flags/merge/split artifacts cannot be used as the canonical request artifact; only `CANONICAL_EVALUATION_REQUEST` is accepted.
7. **View/ledger drift**: ledger and request must bind to the exact current `viewHash`.

## Verification
- `GLOBAL_CANONICAL_HANDOFF_PACKET_V1 PASS`
- `GLOBAL_REVIEW_ARTIFACT_LEDGER_V1 PASS`
- `GLOBAL_DECISION_BOUNDARY_V1 PASS`
- `GLOBAL_REVIEW_UI_CONTRACT_V1 PASS`
- `GLOBAL_REVIEW_DASHBOARD_MODEL_V1 PASS`
- `GLOBAL_DISCOVERY_PROPOSAL_PIPELINE_V1 PASS`
- `GLOBAL_OPPORTUNITY_IMPORT_NORMALIZER_V1 PASS`
- `GLOBAL_OPPORTUNITY_CLUSTER_ENGINE_V1 PASS`
- `GLOBAL_OPPORTUNITY_BULK_V2 PASS`
- `GLOBAL_OPPORTUNITY_DISCOVERY_V1 PASS`
- `git diff --check` PASS
- Static runtime reference search returned no runtime references to `globalOpportunityCanonicalHandoffPacket`.

## Codex review questions
- Should canonical Omni accept only packets whose ledger snapshot is fully present and independently verified?
- Should packet verification later use OmniSeller's canonical serializer/hash utility instead of the isolated stable serializer?
- Should the canonical side require a fresh proof/evidence fetch rather than relying on packet-contained descriptive evidence?
- Should handoff packets be stored only as immutable audit inputs, never as executable commands?
- If accepted later, integration must be reapplied onto the then-current main and fully re-audited under Node 22 canonical CI.
