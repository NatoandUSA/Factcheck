# OmniSeller R3 G4 — Real-input UAT and remediation receipt

**Date:** 2026-09-10 (Asia/Bangkok)

**Branch:** `codex/omniseller-r3-g4-commerce`

**PR:** `#33`

**Phase boundary:** draft creation and `NEEDS_QA` only. No merge, deployment, marketplace submission, or fabricated Owner attestation is authorized by this receipt.

## 1. Verdict

The Amazon US and Etsy US canonical staff workflows process the supplied real research exports end to end:

```text
Seller selects workspace and creates a scoped project
  -> preview import (zero write)
  -> explicit import confirmation (raw hash + row accounting)
  -> persisted research snapshot
  -> Seller enters and checks Product Truth
  -> intelligence preview (zero write)
  -> immutable intelligence snapshot
  -> complete listing draft + full image-prompt set
  -> save as NEEDS_QA
  -> Manager/Owner review boundary
```

The current result is suitable for continued review and controlled staff UAT. It is deliberately not certified for production publishing because both marketplace policy contracts remain `DRAFT_ONLY` until their evidence/approval requirement is satisfied.

## 2. Input corpus and provenance

| Marketplace | File | SHA-256 | Rows consumed |
|---|---|---:|---:|
| Amazon | `Cerebro_Hija.xlsx` | `c77428d8e080c70545d14409a9d64d98e076e8df72b45d0f3257877cc75615d6` | 1,099 |
| Amazon | `Xray_Hija.xlsx` | `171e8935249ae00e775207efd8c08645321212048ff02abac6fbff4a8d043bfe` | 19 |
| Etsy | `para_mi_hija_search_20260908_222159.csv` | `70a7c212ec94cba7a880d42e71d0f984bd7cabe944b04c3c28d8068878fcd023` | 63 |
| Etsy | `para_mi_hija_search_20260908_222205.csv` | `72c065ff5783a0507e3b0697e2e6abd847df53268e802001fb9e250d4fbde2c5` | 66 |
| Etsy | `para_mi_hija_search_20260908_222208.csv` | `f3ffae62c0fbd10921637ceeb051630dcfc156b25bb1a39519f862edcb66405f` | 66 |

Import inspection found:

- Cerebro: 1,099 rows and 1,084 unique keywords.
- Xray: 19 competitor rows; all sheets and rows accounted for.
- Etsy: 195 observations, 176 unique external listing IDs, 19 cross-file duplicates.
- Each Etsy CSV mapped all 36 recognized columns with no unmapped columns, collisions, or invalid rows.
- Workbook date cells are serialized deterministically to ISO text before hashing/persistence.

## 3. Defects closed in this remediation

### Project and access model

- Seller and Manager fixture identities can access both assigned Amazon and Etsy workspaces without role escalation.
- A project now persists marketplace-specific `productType`, `category`, `policyProfile`, and `locale` (`en-US` or `es-US`) instead of using a generic placeholder.
- Switching workspace does not carry the previous workspace's active project or authority into the new scope.

### Amazon intelligence

- Listing language is inferred from an unambiguous seed phrase before the broader mixed corpus.
- Non-target-language phrases remain accounted for and route to targeting/PPC rather than visible copy.
- Xray competitor brands are excluded from visible copy.
- Recipient-direction conflicts and lexical-review candidates are separated from safe copy.
- Unverified attribute claims stay out of visible copy; targeting remains explicitly labelled.
- Every unique input keyword has exactly one terminal accounting route. A gap raises `INTELLIGENCE_KEYWORD_ACCOUNTING_MISMATCH`.
- The intelligence binding hash now covers the semantic rules used to make the decision.

### Etsy intelligence

- Etsy now has explicit EN/ES/MIXED/NEUTRAL language handling.
- AUTO resolves from the canonical project seed first and weighted normalized corpus second; the real-input UAT now exercises AUTO rather than bypassing it with explicit `ES`.
- Conflicting product type, recipient direction, and competitor shop names are blocked from title/tags.
- Tags are generated from safe contiguous phrase variants with diversity, not arbitrary truncation.
- The output fills 13 distinct tags when the safe source permits; every tag is at most 20 characters.
- Title composition prioritizes verified Product Truth identity; keywords are distributed to tags and description without title stuffing.
- All 601 keyword candidates in the real run are terminally accounted for; a gap is a hard failure.
- Etsy UI labels no longer imply that blocked claims or other-language phrases are sent to PPC.

### Draft and image prompts

- Draft generation uses Product Truth as claim authority and research as demand evidence; neither domain silently elevates the other.
- Eight image slots are emitted. A prompt is `READY` only when its required Product Truth is present; otherwise it is `BLOCKED` with the missing facts named for later completion.
- The workflow uses external image generation only. It does not upload or publish generated media.

## 4. Real-input canonical UAT results

### Amazon US / Spanish listing

| Evidence | Result |
|---|---|
| Research snapshot | `b7711fa8ba2fb0acc140d798b55db7161b6cc1d0e5059ad16aee44ba259530f9` |
| Intelligence snapshot | `526e301b78b348a921186f382c2e0d65ee4434d1cb0310fa5a5e176e0ce601fc` |
| Unique input / scored / allocated | 1,084 / 1,084 / 1,084 |
| Copy-safe | 146 |
| Claim targeting | 65 |
| Other language / targeting | 479 |
| Competitor brand blocked | 20 |
| Lexical review | 368 |
| IP blocked | 6 |
| ASIN accepted / rejected | 10 / 9 |
| Unallocated | 0 |
| Draft status | `NEEDS_QA` |
| Title | `Regalo de Madre para Hija \| Collar Personalizado para Mujer` |
| Image prompt slots | 8 total: 5 `READY`, 3 `BLOCKED` for missing material, size, or packaging facts |

Amazon draft constraints passed: title <=75 characters and Generic Keywords <=249 UTF-8 bytes.

### Etsy US / Spanish listing

| Evidence | Result |
|---|---|
| Research snapshot | `57ef89984a421f206ef8193ef6333423ef44195e71ae5937f9379d2ecf839d3e` |
| Intelligence snapshot | `6e5ddd8595ba335a880eb759e580fba97c4bcb45d363af5731abacc47037b4c9` |
| Seller observations | 195 |
| Keyword candidates / allocated | 601 / 601 |
| Claim blocked | 38 |
| IP blocked | 1 |
| Irrelevant | 374 |
| Other language | 173 |
| Safe but not used in title/tags | 3 |
| Accounting gap | 0 |
| Draft status | `NEEDS_QA` |
| Title | `Collar Personalizado Para Mi Hija` |
| Tags | 13 distinct tags; each <=20 characters |
| Image prompt slots | 8 total: 5 `READY`, 3 `BLOCKED` for missing material, size, or packaging facts |

## 5. Test and browser evidence

Focused suites passed after remediation:

- Amazon intelligence: 25/25.
- Etsy intelligence: 28/28, including AUTO Spanish inference.
- Stored research normalization: 18/18.
- Commerce intelligence review: 22/22.
- Canonical Amazon HTTP workflow: 73/73.
- Canonical Etsy HTTP workflow: 22/22, including AUTO Spanish persistence through the HTTP boundary.
- Canonical commerce UI: passed.
- Database fixture isolation: passed.
- Workspace switching and authorization: passed.
- Security/auth foundation: 18/18 in the post-fix isolated rerun.
- Production frontend build: passed.
- Linux CI run `34452824609` passed on the AUTO-language remediation SHA `b19d3e89af661dfe482eda505e2e455ddabbdccb`.

The earlier full local run completed 84 suites with 78 passes and six failures. The security failure from that run was fixed and its complete suite then passed. The remaining five are not represented as product passes: two require a live provider and three expose the existing Windows runner/process-tree shutdown defect. Linux CI is the authoritative clean-room regression for the pushed commit.

Browser UAT on the local app confirmed that the Seller login can select either assigned workspace, create an Etsy Spanish project, and reach the canonical `EVIDENCE_INTAKE` workflow with import, Product Truth, intelligence, listing, image-prompt, and Manager QA boundaries visible. Real-file parsing and persistence were verified through the canonical HTTP workflow to avoid substituting browser file-dialog behavior for data-integrity evidence.

## 6. Repeatable operator command

No customer input file is committed. Run the opt-in UAT against local operator files:

```powershell
npm run uat:real-commerce -- `
  --cerebro "C:\Users\Admin\Downloads\Inputdata08092026\Cerebro_Hija.xlsx" `
  --xray "C:\Users\Admin\Downloads\Inputdata08092026\Xray_Hija.xlsx" `
  --etsy "C:\Users\Admin\Downloads\Inputdata08092026\para_mi_hija_search_20260908_222159.csv" `
  --etsy "C:\Users\Admin\Downloads\Inputdata08092026\para_mi_hija_search_20260908_222205.csv" `
  --etsy "C:\Users\Admin\Downloads\Inputdata08092026\para_mi_hija_search_20260908_222208.csv"
```

The command fails if source hashes/row accounting cannot be persisted, keyword accounting has a gap, marketplace limits are exceeded, the saved draft is not `NEEDS_QA`, or a `DRAFT_ONLY` policy contract is treated as approved.

## 7. Policy boundary and remaining release gates

The implemented public baseline is:

- Amazon non-media title <=75 characters, Item Highlights <=125 characters, Generic Keywords <=249 bytes.
- Etsy title <=140 characters, up to 13 tags, each tag <=20 characters, with clear/scannable titles and varied natural multi-word tags.

Both policy contracts remain `DRAFT_ONLY`. Consequently, approval/publishing is correctly blocked with `POLICY_CONTRACT_DRAFT_ONLY`. Closing this gate requires authenticated marketplace/category evidence or an exact Owner attestation stored as its own auditable artifact. It must not be inferred from a test pass.

## 8. Handoff decision

Independent review found and remediated the Etsy AUTO-language defect documented in `OMNISELLER_R3_G4_INDEPENDENT_REVIEW_F31FF2665_20260910.md`. Keep PR #33 open and unmerged. After clean CI on the remediation commit, the next authorized activity is Staff/Manager execution of `OMNISELLER_R3_G4_STAFF_MANAGER_UAT_RUNBOOK_20260910.md` at the `NEEDS_QA` boundary—not deployment or marketplace submission.
