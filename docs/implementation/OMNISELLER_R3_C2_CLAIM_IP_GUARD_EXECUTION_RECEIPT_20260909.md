# OmniSeller R3 — C2 Claim and IP Guard Execution Receipt

Date: 2026-09-09 (Asia/Bangkok)

Parent C1 accepted SHA: `84afc3ba8386fb67efd62016dcd4b1aac48a5037`

C2 implementation SHA before this receipt: `b4c5e26ed53cb881badf05ea9d97c9f3ef87c3b2`

Branch: `codex/omniseller-r3-c2-claims`

Worktree: `D:\Claude\Factcheck\scratch\omniseller-r3-c2-claims`

## 1. Outcome

Status: **C2 CLAIM/IP CORE IMPLEMENTED — FOCUSED NODE 22 TESTS PASS — LIVE ROUTE INTEGRATION NOT CLAIMED**.

This commit adds one canonical server claim guard and one caller-injected IP screening module. It does not connect them to compose, edit, approval, export, database, UI or marketplace routes. It cannot authorize approval, submission or publication.

No primary-worktree overwrite, push, merge, VPS write, production database write or marketplace action occurred.

## 2. Donor inheritance

The donor was inspected only after exact-byte verification:

| Donor | Verified SHA-256 | Inherited |
| --- | --- | --- |
| `Claude outputs/amz-draft-engine/lib/claims.js` | `89b449c57b2c020c27c894154b6e8872e560ec08eba24f4c0b094784c4b89a2a` | lexical claim detection, Product Truth corroboration boundary, surface policy and second-pass output audit |
| `Claude outputs/amz-draft-engine/lib/ipguard.js` | `258d64ea4b6b4ecbe75c765775bde555c84d2b126907f3bae8697073488d68ce` | normalized token/boundary screening and shadow-only fuzzy review |

The donor composer, keyword engine, global product library, server, persistence, UI and image-prompt generator were not copied. The known image-prompt generator fabrications are negative tests, not reusable content.

## 3. Runtime behavior

- The repo-ratified 14 stable claim IDs remain the only canonical claim families.
- Legacy C1–C8 labels map at token/pattern granularity. A whole legacy class cannot promote into several stable claim families.
- Product identity may corroborate an explicitly named capability, but cannot prove material, purity, dimensions, included items, packaging, origin or fulfillment.
- A filled personalization field permits the personalization family but does not prove laser, engraving, embossing or another process.
- Unverified visible copy and image prompts are blocked.
- Unverified backend search terms are excluded by default.
- PPC targeting may retain research phrases only with explicit unverified-claim flags.
- A second pass audits composed and staff-edited output, including nested image prompts.
- EN/ES accent folding and Unicode compatibility normalization use token boundaries.
- Exact IP library matches enforce the injected disposition. Fuzzy variants remain shadow-only review signals.
- The IP library is injected by the server caller; this module contains no global brand/product library and never claims legal clearance.
- Claim definitions, field rules and their nested arrays are immutable at runtime.

## 4. Focused test evidence

Runtime: WSL Ubuntu 24.04, Node `v22.23.2`.

```text
node tests/test_c2_claim_guard.cjs
claim guard: 16 passed / 0 failed / 0 unexecuted
IP matcher: 12 passed / 0 failed / 0 unexecuted

node scripts/c0_validate_contracts.cjs
C0_JSON_SCHEMA_2020_POSITIVE_NEGATIVE_VALIDATION PASS

npm run build
PASS — 2,430 modules transformed

canonical inventory manifest: 67
actual tests/*.cjs entrypoints excluding runner: 67
missing from manifest: 0
missing on disk: 0
```

The focused fixtures cover:

- Hija audience/occasion phrases without false attribute claims;
- Esposa Product Truth `Acero inoxidable, bano de oro 14k` accepting 14k while rejecting `oro 18k` and `plata 925`;
- all twelve known fabricated image-prompt details;
- `Dedication` and `Dedicatoría` not matching the injected word `cat`;
- exact EN/ES IP terms, ambiguous exact terms and shadow-only leet/plural/repeated/glued variants;
- full-width Unicode claim text;
- Product Identity versus attribute authority;
- post-compose, post-edit and nested image-prompt auditing.

## 5. Real Etsy file probe

This was an external read-only execution against the three owner-supplied CSV copies currently located under `D:\Claude\Factcheck\Inputdata08092026`. It is not a hermetic canonical test and does not certify persistence or browser behavior.

```text
222159: 63 input / 63 valid / 63 unique / 63 returned; 36 recognized / 0 unmapped
222205: 66 input / 66 valid / 66 unique / 66 returned; 36 recognized / 0 unmapped
222208: 66 input / 66 valid / 66 unique / 66 returned; 36 recognized / 0 unmapped

combined observations: 195
unique listing entities: 176
repeated observations retained across snapshots: 19
listings present in all three snapshots: 6
```

The specialized Etsy parser preserves the expected rank history for listing `4522488949` as 13 and 1, and for `4533292901` as 1, 61 and 61. This proves parser/accounting behavior only. Multi-file artifact persistence, restart/reload and downstream bundle use remain open.

The originally referenced `Xray_Hija.xlsx` and `Cerebro_Hija.xlsx` were not present at their Downloads paths or in the current `Inputdata08092026` directory during this execution. Their hashes and structural audit remain recorded in `docs/REAL_INPUT_IMPORT_CONTRACT_AND_GAP_AUDIT_HIJA_R1.md`, but C2 does not claim a fresh rerun of those workbooks.

## 6. Remaining gate

An independent reviewer must inspect and execute the exact receipt commit, with particular attention to:

1. mutation of exported definitions/field rules;
2. token-boundary false positives and Unicode bypass;
3. identity accidentally proving attributes;
4. partial corroboration such as verified gold with unverified 18k;
5. all twelve image-prompt fabrications;
6. injected IP-library accounting and fuzzy behavior remaining shadow-only;
7. Node 22 focused tests, C0 validation, build, inventory parity and clean worktree.

After independent acceptance, the next implementation cluster is C2-C route integration: derive Product Truth and policy context on the server, run claim/IP checks at compose-preview, post-compose, post-edit, approval and export, then prove rejected operations have zero authority/business side effects. Persistence and importer work remain separate clusters and cannot be implied by this module-level PASS.
