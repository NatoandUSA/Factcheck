# OmniSeller R4.3 — W1 Implementation and UAT Receipt

**Date:** 2026-09-12 (Asia/Bangkok)

**Branch:** `codex/omniseller-r4-3-w1`

**W0 parent:** `baaf7c006` (`docs: freeze OmniSeller R4.3 W0 revision 2`)

**Status:** `W1 IMPLEMENTED — AUTOMATED GATES PASS; BROWSER UAT PARTIAL DUE CODEX COMPUTER-USE QUOTA`

**Remote push / merge / deploy:** not performed

## 1. Bounded W1 scope

W1 implements only the vertical slice authorized by the R4.3 Amendment A control basis:

```text
same authentication + workspace + project
→ one active staff shell per marketplace
→ select one or many research files
→ zero-write preview per file
→ explicit immutable confirm per valid file
→ refresh / reopen persisted imports
```

It does not introduce a new persistence table, does not use the rejected donor
`commerce_workflow_artifacts` writer, does not delete legacy source, and does not
implement or expose the old bare-`SUBMITTED` writer.

## 2. Implemented changes

### Active staff render

- `App.jsx` now renders `SinglePathMarketplaceWorkspace` for Amazon and Etsy.
- The old `AmazonWorkspace` and `EtsyWorkspace` remain in Git for recovery but are
  unreachable from the normal staff App render.
- The shell uses the authenticated session and the currently selected marketplace's
  project collection. It does not create a second login or a second project model.
- A callback-identity loop discovered in browser UAT was fixed by storing toast delivery
  in a ref; project loading no longer repeats because a parent callback identity changes.

### Multi-file research intake

- The research picker has the native `multiple` contract.
- One selection can contain multiple files.
- Each file is previewed separately through the existing canonical zero-write endpoint.
- Valid and invalid files receive separate visible results; one invalid file does not hide
  another valid file.
- Confirm persists each valid preview independently and retains every returned import id.
- Reload hydrates the immutable imports from `commerce-state`.

### Amazon boundary

```text
Seed → Xray → editable ASIN suggestions (≤10 each) → Cerebro → Master KW
```

- Xray and Cerebro are separate import kinds.
- Xray batch output is a convenience suggestion, never an ancestry lock.
- An already available Cerebro file can be imported directly.
- Product Truth remains a parallel lane and becomes mandatory only at safe-compose.

### Etsy HTML boundary

- Canonical Etsy research accepts CSV, HTML and HTM.
- Existing search-result `ItemList` JSON-LD remains supported.
- A saved Etsy listing page using JSON-LD `Product` is now parsed as one research-only
  observation, including listing id, title, shop, offer and aggregate rating when present.
- The parser no longer decodes the entire HTML before JSON parsing; this fixes Etsy
  descriptions containing `&quot;` that otherwise corrupt valid JSON-LD.
- Saved listing HTML never becomes Product Truth automatically.

### Legacy writer retirement

With `OMNI_R43_SINGLE_PATH=1`, direct legacy mutation routes return:

```json
{"success":false,"error":"LEGACY_WRITE_ROUTE_RETIRED"}
```

The retired group includes Smart Pull, legacy listing creation/approval, legacy project
transitions, quick draft, old H10/trends upload writers, learning writers, evidence accept,
and the old submission handoff. Historical test execution can omit the cutover flag; W1
browser/UAT and any later release candidate must enable it.

## 3. Fixture proof

The local W1 suite used the exact supplied artifacts when available:

| Artifact | SHA-256 / observed identity | Result |
|---|---|---|
| `Xray_Hija.xlsx` | `171e8935249ae00e775207efd8c08645321212048ff02abac6fbff4a8d043bfe` | 19 input rows; ASIN suggestions generated |
| `Cerebro_Hija.xlsx` | `c77428d8e080c70545d14409a9d64d98e076e8df72b45d0f3257877cc75615d6` | keyword observations parsed and persisted |
| `etsy.html` | listing `4533292901` | JSON-LD Product parsed: title and shop `Fantasticgiftsltd` |

CI-safe generated fallbacks are present only when those workstation files do not exist.
They exercise the same file formats and endpoints without weakening local real-file proof.

## 4. Executed verification

All commands below ran with Node 22.

| Gate | Result |
|---|---:|
| Production Vite build | PASS — 1,826 modules transformed |
| `test_r43_w1_single_path.cjs` | 18/18 PASS |
| `test_g4_canonical_commerce_ui.cjs` | 21/21 PASS |
| `test_g4_canonical_research_http.cjs` | 76/76 PASS |
| `test_g4_etsy_canonical_http.cjs` | 22/22 PASS |
| `test_g4_etsy_intelligence_adapter.cjs` | 28/28 PASS |
| `test_etsy_pasted_search_parser.cjs` | PASS |
| `test_project_setup_and_stage_guidance.cjs` | PASS |
| `sec_auth_foundation.test.cjs` | all 18 security/workspace scenarios PASS |
| `p0_route_security.test.cjs` | PASS |
| `route_registry_coverage.test.cjs` | 83 discovered; 79 non-public classified; PASS |
| `test_jsx_static_contract_ratchet.cjs` | 35/35 PASS |
| `git diff --check` | PASS (line-ending notices only) |

`test_runner_accounting.cjs` was also attempted on native Windows. Its self-test failed in
the pre-existing detached-descendant timing assertion (`true !== false`) after correctly
recording its intentional pass/fail/timeout fixtures. This is a runner/process-management
issue, not a W1 workflow assertion, and is not represented as green.

## 5. Browser UAT receipt

Local processes:

- frontend `http://127.0.0.1:4317`
- backend `http://127.0.0.1:4318`
- backend mode `NODE_ENV=test`, `OMNI_R43_SINGLE_PATH=1`

Observed successfully in the Codex in-app browser:

1. OmniSeller loaded without a white screen.
2. Seller fixture login presented explicit Amazon/Etsy workspace selection.
3. `seller@omniseller.local` logged into Amazon Main Store.
4. A new Spanish-US `W1 Browser Hija` project was created.
5. The project reopened in the single staff shell while retaining legacy
   `EVIDENCE_INTAKE` only as non-blocking compatibility metadata.
6. The UI showed the corrected Amazon sequence and parallel Product Truth lane.
7. The real `Xray_Hija.xlsx` file was selected and the zero-write Preview action unlocked.

The remaining visual clicks (preview result → confirm → browser reload → reopen) could not
be completed because the Codex Computer Use quota was exhausted and the browser session
was closed. The same persistence chain passed through the real-file HTTP test and fresh
authenticated-session reopen assertion. This receipt deliberately records browser UAT as
partial, not complete.

## 6. W1 ruling and next gate

```text
W1 SOURCE IMPLEMENTATION:       COMPLETE
W1 AUTOMATED/REAL-FILE PROOF:   PASS
W1 NORMAL-BROWSER PROOF:        PARTIAL — QUOTA BLOCKED
SCHEMA MIGRATION:               NOT PERFORMED
LEGACY DELETE:                  NOT PERFORMED
REMOTE PUSH:                    NOT PERFORMED
MERGE/DEPLOY:                   NOT AUTHORIZED / NOT PERFORMED
```

Next safe action is to finish the four remaining browser clicks when Computer Use is
available, freeze this branch's exact SHA, then proceed to W2 Amazon Xray/Cerebro → Master
Keyword List. W2 must not reintroduce batch ancestry enforcement or a second staff shell.
