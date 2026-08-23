# Product Truth Contract V1

Status: frozen at `bdd44d27d05bd5611d434b24f8978b6c80844c45` for GPT2 integration.

## Authority boundary

Only a structured fact with `VERIFIED` evidence bound to the current `productId` and `listingVersion` has factual authority. Raw titles, tags, briefs, SEO metadata, model output, placeholders and free-text notes never become Product Truth.

```js
{
  productId: '42',
  listingVersion: 7,
  state: 'VERIFIED',
  facts: {
    materials: {
      value: ['80% cotton', '20% polyester'],
      evidence: {
        state: 'VERIFIED',
        subjectId: '42',
        listingVersion: 7,
        source: { kind: 'SUPPLIER_SPEC', id: 'spec-123' }
      }
    }
  },
  ipEvidence: {
    state: 'CLEARED',
    subjectId: '42',
    listingVersion: 7,
    checkerVersion: 'server-ip-guard-v1',
    checkedAt: '2026-08-23T00:00:00.000Z'
  }
}
```

The server replaces client-supplied IP evidence during approval. Any content edit increments `listingVersion` and clears the persisted card and approval.

## Canonical API

CommonJS consumers import `shared/productTruth.cjs`. Browser/ESM consumers import `shared/productTruth.js`.

- `isEvidenceBoundToListing(evidence, context)`
- `isVerifiedFact(fact, context)`
- `isVerifiedPersonalization(card, context)`
- `getVerifiedPersonalization(card, context)`
- `isIpCleared(card, context)`
- `validateProductTruthCard(card, context)`
- `projectVerifiedFacts(card, context)`
- `invalidateProductTruthCard(card)`

`context` is always `{ productId, listingVersion }`. IDs are normalized to non-empty strings; versions must be positive integers and must match exactly.

## GPT2 integration rules

1. Use `projectVerifiedFacts()` as the only Product Truth projection into model prompts.
2. Never supplement that projection from title, tags, ProductBrief, model prose or category defaults.
3. Do not duplicate `VERIFIED` or binding logic in GPT2-owned files.
4. Treat validation failure as zero factual inputs and zero publish/export authority.
5. Flag proposed API or semantic changes for cross-review before editing the shared module.

## Merge gate

- Both workstreams share the same base commit.
- Full build and test suite pass on the integration SHA.
- Tests prove stale/mismatched/UNKNOWN evidence cannot reach prompt, output, publish or export.
- `git diff --check` passes and GPT2-owned files receive independent review.
