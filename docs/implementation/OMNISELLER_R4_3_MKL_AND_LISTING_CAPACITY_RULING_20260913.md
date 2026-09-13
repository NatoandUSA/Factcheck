# OmniSeller R4.3 — Master Keyword List and listing-capacity ruling

Date: 2026-09-13
Scope: Amazon US non-media and Etsy US; workflow design and implementation contract.

## Executive ruling

OmniSeller must optimize **relevant, evidence-backed keyword coverage**, not raw character count. A field is complete when no higher-priority, semantically useful, truth-safe phrase still fits. It must never add duplicate words, weak filler, competitor brands, unsupported attributes or invented tags merely to display `100%`.

Every editable listing surface must show `used / allowed`. When the marketplace limit varies by product type or A+ module, OmniSeller must show the resolved Product Type Definition/module limit. Until that exact authority is resolved, the UI must say `PTD` rather than manufacture a number.

## Amazon workflow and scoring

```text
Seed
→ 1..N Xray exports
→ relevance-screened ASIN cohorts (editable, max 10 per Helium 10 run)
→ 1..N Cerebro exports (independent import; no ancestry proof)
→ normalized/deduplicated Master Keyword List
→ Product Truth (parallel lane)
→ safe allocation to Title / Item Highlights / Bullets / Description / Backend / PPC
→ A+ module composition
```

Xray selects representative competitors. Cerebro provides the keyword observations. ASIN cohorts are a convenience artifact and remain freely editable. A valid Cerebro file is useful even when OmniSeller cannot prove which cohort created it.

Keyword priority is lexicographic, not a single opaque ratio:

1. Product and buyer-intent relevance is a hard prerequisite.
2. Demand: Search Volume, Keyword Sales and trend.
3. Competitor proof: number/share of selected competitors ranking organically.
4. Opportunity: lower competing products, lower Title Density and lower CPR, interpreted only after relevance and demand.
5. Stability: repeated evidence across files/runs versus a one-file outlier.
6. Risk: brand/IP, conflicting recipient/product, unsupported claim, language mismatch.

Helium 10 documents Search Volume, Keyword Sales, Competing Products, Cerebro IQ, CPR, Title Density and Ranking Competitors as distinct signals; low Title Density/CPR can indicate easier ranking. DataDive likewise starts with deliberate competitor selection, removes branded/irrelevant terms, then studies roots and root coverage. Therefore OmniSeller must preserve the component metrics and provenance instead of reducing every decision to “high SV / low competition.”

### Amazon output surfaces

Order in OmniSeller:

1. Amazon Title — `used / 75 characters`.
2. Item Highlights — `used / 125 characters`.
3. Five Bullet Points — count each bullet separately against the resolved Product Type Definition.
4. Backend Search Terms — `used / 249 UTF-8 bytes` under the active contract; unique useful tokens, no commas and no redundant visible-copy tokens.
5. Description — count against the resolved Product Type Definition.
6. A+ — count each selected module field separately (headline/body/alt-text); there is no honest universal A+ limit.

Amazon announced the 2026 modular-title split as 75 characters for Item Name and 125 for Item Highlights, and later clarified that both are search inputs without priority over each other.[^amazon-title][^amazon-title-qa] Amazon listing attribute requirements are product-type schemas and can change, so bullet and description limits must come from Product Type Definitions rather than a global constant.[^amazon-ptd] A+ constraints are module/field-specific in Amazon's own examples.[^amazon-aplus]

`100% utilization` means:

- never exceed the resolved hard limit;
- keep the strongest identity phrase and differentiating facts first;
- greedily add non-duplicative, relevant roots while they fit naturally;
- expose character/byte utilization and corpus-token coverage separately;
- finish below the maximum when the only remaining candidates are duplicate, irrelevant, unsafe or unreadable.

The operating target for fixed, resolved Amazon fields is **90–99%**, measured against the real policy limit. A percentage below 90 is a visible capacity gap, not an automatic failure: the receipt must state whether the cause is missing Product Truth, no additional unique relevant roots, a language/claim/IP exclusion, or an unresolved Product Type Definition. OmniSeller must never make a weak phrase stronger merely because it fills more characters.

Alternate-language Cerebro phrases for Amazon US are treated asymmetrically: they cannot enter the selected listing-language Title, Item Highlights, Bullets or Description, but their non-branded, non-claim, semantically relevant, non-redundant roots may enter Generic Keywords. This preserves readable customer copy while using the single 249-byte backend budget efficiently.

## Etsy workflow and scoring

```text
Seed
→ Etsy live search + HeyEtsy capture
→ 1..N CSV/HTML imports
→ normalized listings and editable multi-cohort Winner Set
→ Pattern Miner
→ Etsy Master Keyword List
→ Product Truth (parallel lane)
→ Title / up to 13 explained tags / Description / image prompts
```

YTrends is E3 supplemental data, not the live-data prerequisite. HeyEtsy/Alura/EverBee sales, conversion and volume values remain third-party estimates; public listing/rank observations and provider estimates must retain separate evidence tiers.

### Winner Set

More winners are useful only when they are relevant, deduplicated, diverse and representative. More off-niche or highly concentrated winners make the pattern worse. OmniSeller therefore supports the union of multiple cohorts plus row-level editing, with a 60-listing analysis ceiling, while showing unique shops and largest-shop concentration.

Useful cohorts include current organic leaders, total-traction leaders, live-velocity leaders, engagement leaders, conversion candidates and emerging/new winners. A listing can belong to several cohorts and is counted once in the Winner Set.

### Pattern Miner and Etsy MKL

Pattern Miner must be a table, not concatenated prose. Each row exposes phrase, type, listing coverage, percentage, shop spread and evidence tier. Unparseable concatenated HeyEtsy tag cells stay in a quarantine count and never flow into the MKL.

Etsy MKL priority:

1. hard relevance/product/recipient/language/IP screen;
2. observed Etsy query/autocomplete signal;
3. winner listing spread and shop spread;
4. live engagement/velocity/conversion proxies;
5. third-party demand versus competition opportunity;
6. long-tail purchase intent and semantic diversity;
7. evidence freshness and provenance.

Etsy describes search as query matching followed by ranking signals including relevance and listing/shop quality.[^etsy-search] Etsy currently permits up to 13 tags, each up to 20 characters, and recommends relevant multi-word, diversified tags.[^etsy-tags] Its current title guidance emphasizes clear, buyer-friendly titles and holistic matching, so filling all 140 title characters with repetition is not an optimization goal.[^etsy-title]

HeyEtsy describes Etsy suggestions as a demand signal and competitor count as a competition signal, while warning that its keyword system may not always be current.[^heyetsy] Alura and EverBee similarly describe high-demand/low-competition analysis but their numerical volumes/scores are provider metrics, not Etsy's canonical truth.[^alura][^everbee]

## Product Truth boundary and Step 3

Research patterns never become product facts. Product Truth may be entered from the company's own listing, supplier records, physical inspection, or a staff-confirmed same-source listing. Unsupported competitor-derived claims are excluded from visible copy.

When Step 3 rejects a claim, the UI must identify exact field/token and offer the correct decision:

- if true for this product, add it to a new Product Truth revision with its source;
- if false or unknown, leave Product Truth unchanged and do not use the claim.

The observed Etsy failure for `zirconia` / `cubic zirconia` was this boundary operating correctly, not a missing MKL. The later Product Truth revision allowed intelligence preview to succeed. OmniSeller now presents this diagnosis inline instead of appearing silently locked.

### Marketplace-page capture is evidence, not complete truth

Neither “Save page as HTML” nor a server-side URL fetch is guaranteed to contain the complete rendered listing. Amazon may block automated fetch/save and both marketplaces load sections, variants and seller metrics dynamically. The 2026-09-13 active-browser inspection of the supplied pages found materially richer rendered evidence than a minimal saved-page parser can assume:

- Amazon exposed title, category breadcrumb, material, metal, clasp, chain, gem, item type, six bullets, detailed dimensions, variants, package type and product metadata.
- Etsy exposed title, price, live-view signal, material, made-to-order state, variants, shipping origin and shop/listing metrics, while description/tags were not consistently present in the currently rendered DOM.

Product Truth intake therefore uses this authority order:

1. supplier/production specification or the company's own canonical listing record;
2. active rendered-page capture for a staff-confirmed same-source product;
3. saved HTML/TXT capture as a fallback;
4. direct URL fetch only when the marketplace returns usable content;
5. staff manual correction and explicit unknowns for anything not evidenced.

OmniSeller now accepts pasted rendered page text as well as HTML/TXT. It extracts component attributes such as metal type, clasp, chain, gem, dimensions, weight and package data into editable Product Truth fields. The preview is still zero-write. A competitor listing remains research/style evidence unless staff explicitly confirms the same supplier/source and corrects every variant difference before saving a Product Truth revision.

When Product Truth advances, any old Intelligence Snapshot is stale by definition. The UI clears the old claim warning and requires only `3A preview → 3B save` against the new Truth revision; it must not reuse the stale snapshot or appear permanently blocked.

## Real Hija composition receipt — 2026-09-13

The canonical API was rerun against the existing Hija project with Product Truth revision `8`, Research Snapshot `5` and Amazon Master Keyword Artifact `9` (1,084 accounted keywords). The result after the no-mid-phrase truncation fix was:

- Title: `74/75` characters.
- Item Highlights: `122/125` characters.
- Bullets: `220/230`, `207/230`, `216/230`, `213/230`, `209/230` characters. All five are at least 90% of the temporary composition ceiling and none ends in a truncation ellipsis. The `230` value is visibly labeled as a working ceiling pending the category/product-type PTD response; it is not represented as universal Amazon policy.
- Generic Keywords: `246/249` UTF-8 bytes, with visible-copy roots removed before packing.
- Description: `506` characters; its hard ceiling remains unresolved until PTD supplies it.
- A+ source points: 9 facts, counted individually; final limits remain module/field-specific.

This receipt proves field utilization for the Hija fixture, not automatic marketplace acceptance. Staff still reviews readability, Product Truth support and the exact category schema before submission authorization.

## Sources

[^amazon-title]: [Amazon — Updates to improve your product titles begin July 27, 2026](https://sellercentral.amazon.com/seller-forums/discussions/t/145b6d0f-999c-4555-896c-c694bda2e470)
[^amazon-title-qa]: [Amazon — Answers to product title update questions](https://sellercentral.amazon.com/seller-forums/discussions/t/302aaac6-6f2b-4d86-bcd2-36fe24f0e6cd)
[^amazon-ptd]: [Amazon SP-API — Manage product listings and Product Type Definitions](https://developer-docs.amazon.com/sp-api/lang-en_EN/docs/manage-product-listings-guide)
[^amazon-aplus]: [Amazon SP-API — A+ Content examples and field constraints](https://developer-docs.amazon.com/sp-api/lang-en_US/docs/a-plus-content-examples)
[^etsy-search]: [Etsy — How Etsy Search Works](https://www.etsy.com/seller-handbook/article/375461474487)
[^etsy-tags]: [Etsy — Keywords 101](https://www.etsy.com/seller-handbook/article/382774281517)
[^etsy-title]: [Etsy — Guidance for listing titles](https://www.etsy.com/seller-handbook/article/1399426136697)
[^heyetsy]: [HeyEtsy — View keyword competitiveness](https://help.heyetsy.com/en/features/the-meanings-of-the-metrics-on-the-extension/view-keyword-competitiveness)
[^alura]: [Alura — Getting started with Keyword Research](https://help.alura.io/en/articles/5397016-getting-started-with-keyword-research)
[^everbee]: [EverBee — Keyword Research Suite](https://help.everbee.io/en/article/4-keyword-research-suite)

Additional methodology references: [Helium 10 Cerebro](https://kb.helium10.com/hc/en-us/articles/360046326894-How-Do-I-Use-Cerebro), [Helium 10 group keyword analysis](https://kb.helium10.com/hc/en-us/articles/44554301950107-Cerebro-Plus-Magnet-Video-How-to-Analyze-a-Group-of-Keywords), [DataDive clean MKL guide](https://datadive.tools/wp-content/uploads/2024/08/QSG-Stepbystep.pdf), [DataDive Roots](https://support.datadive.tools/hc/en-us/articles/4414631325209-Roots), and [DataDive Listing Builder](https://support.datadive.tools/hc/en-us/articles/4414623848857-Listing-Builder).
