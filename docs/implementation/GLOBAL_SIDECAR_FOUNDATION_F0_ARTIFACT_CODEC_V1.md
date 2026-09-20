# Global Sidecar Foundation F0 — Canonical Artifact Codec V1

## Purpose

This module is the shared integrity primitive for future Global Opportunity sidecar artifacts. It replaces the prototype's duplicated `stable()` functions, which allowed distinct JavaScript values such as `[]` and `[undefined]` to produce the same serialized form.

## Authority boundary

The codec provides deterministic serialization and domain-separated SHA-256 integrity. It does **not** authenticate a caller, reviewer, timestamp or storage origin. Authenticity must be supplied later by server-owned persistence and lookup/signature controls.

## Accepted value domain

- `null`
- booleans
- finite numbers except negative zero
- strings, normalized to Unicode NFC
- dense arrays containing accepted values
- plain objects (`Object.prototype` or null prototype) with enumerable data properties and string keys

The codec rejects undefined values, sparse arrays, extra array properties, non-finite numbers, negative zero, BigInt, Symbol, functions, accessors, non-enumerable properties, symbol keys, cycles, non-plain objects and prototype-pollution keys.

## Identity contract

```text
SHA-256(
  codecVersion
  + NUL
  + artifactDomain
  + NUL
  + canonicalSerializedPayload
)
```

The domain must be an explicit uppercase identifier such as `GLOBAL_SIDECAR.PROPOSAL`. This prevents the same bytes from being silently reused as a different artifact type.

## Resource contract

Serialization fails closed on configurable depth, node-count and UTF-8 byte limits. Byte accounting occurs during encoding rather than only after the complete output has been allocated.

## Migration rule

Existing approval and production hash formats are not silently rewritten. Future sidecar artifacts must declare `OMNISELLER_ARTIFACT_CODEC_V1`; any later codec change requires a new version and explicit migration/compatibility policy.
