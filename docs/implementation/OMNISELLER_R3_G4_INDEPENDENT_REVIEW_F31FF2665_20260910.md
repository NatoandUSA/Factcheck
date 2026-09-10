# OmniSeller R3 G4 — Independent review of `f31ff2665`

**Review target:** `f31ff26653931f25a44adc720a3ff52409b4271e`

**Review date:** 2026-09-10 (Asia/Bangkok)

**Decision:** `APPROVE STAFF UAT — PR REMAINS UNMERGED`

## 1. Scope and invariants

This review examined the exact PR #33 head after its successful Linux CI run. It covered:

- canonical project classification and workspace isolation;
- XLSX/CSV import provenance and persistence;
- Amazon and Etsy language routing;
- claim, IP, competitor identity, recipient, and product-type gates;
- keyword terminal accounting;
- draft composition and image-prompt readiness;
- the `NEEDS_QA` stop boundary.

The review does not authorize merge, deployment, marketplace submission, or creation of Owner/policy evidence.

## 2. Finding IR-01 — P1 Etsy AUTO language mismatch

### Reproduction

The UI labels `AUTO` as “Theo keyword đầu vào”. The server intentionally omits `configuration.listingLanguage` for AUTO so the adapter can infer it. At `f31ff2665`, Amazon performed that inference, but Etsy used:

```text
explicit EN/ES -> requested language
otherwise      -> EN
```

Therefore a Spanish Etsy project with seed `para mi hija` could route Spanish candidates into `languageTargeting` when Staff left the default AUTO selection unchanged. The earlier real-file UAT did not expose this because its operator script explicitly sent `ES`.

### Required correction

Etsy must apply this deterministic order:

1. explicit `EN` or `ES` selected by Staff;
2. unambiguous canonical project seed language;
3. weighted language evidence from the normalized candidate corpus;
4. deterministic `EN` fallback only when neither source resolves the language.

Both unit and HTTP regression tests must use AUTO with a Spanish seed. The real-input operator UAT must also use AUTO, preventing another test-only bypass.

## 3. Other reviewed boundaries

No additional P1/P2 defect was confirmed in the reviewed scope:

- Project UI and API use the same canonical fields: `locale`, `mediaClass`, `productTypeId`, `categoryId`, and `productFamilyVersion`.
- Seller/Manager memberships remain workspace-scoped and do not elevate role while switching Amazon/Etsy.
- Research preview remains zero-write; commit persists raw bytes/hash; snapshots bind immutable inputs.
- Product Truth remains the authority for visible claims. Research demand does not corroborate material, purity, size, personalization method, packaging, ratings, delivery, or certification claims.
- Amazon blocked claims may remain in labelled PPC targeting; competitor/IP blocks do not enter visible copy.
- Etsy has no seller-selected PPC surface. Its blocked/unused candidates remain visible in internal accounting instead.
- Every normalized Amazon/Etsy candidate has a terminal disposition; zero accounting gaps are hard invariants.
- Drafts stop at `NEEDS_QA`; policy contracts remain `DRAFT_ONLY` and cannot become approved through tests.

## 4. Exit criteria

IR-01 is closed only when all of the following pass on the correction commit:

- Etsy adapter AUTO Spanish regression;
- Etsy canonical HTTP AUTO Spanish regression;
- full real-file Amazon/Etsy UAT using AUTO;
- focused Amazon, Etsy, security, persistence, and UI suites;
- production build;
- clean Linux CI on the exact pushed SHA.

Until then, Staff UAT may be prepared but must not be signed off.

## 5. Remediation evidence

- Etsy adapter AUTO Spanish: 28/28 PASS.
- Etsy canonical HTTP with `listingLanguage=AUTO`: 22/22 PASS.
- Real-input operator UAT with AUTO: PASS for both Amazon and Etsy; both resolved `ES`.
- Amazon terminal accounting: 1,084/1,084; unallocated 0.
- Etsy terminal accounting: 601/601; accounting gap 0.
- Both persisted drafts stopped at `NEEDS_QA`.
- Production build: PASS.

Linux CI run `34452824609` passed on remediation SHA `b19d3e89af661dfe482eda505e2e455ddabbdccb`, including native SQLite loading, production build, and the complete canonical suite. IR-01 is closed. PR #33 must remain open and unmerged during Staff UAT.
