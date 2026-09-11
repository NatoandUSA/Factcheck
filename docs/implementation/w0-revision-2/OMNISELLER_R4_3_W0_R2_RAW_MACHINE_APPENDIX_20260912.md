# W0 Revision 2 — Raw Machine Appendix

**Executed:** 2026-09-12  
**Working directory:** `D:\Claude\Factcheck\scratch\omniseller-r4-3-w0`  
**Shell:** PowerShell  
**Purpose:** close W0-R1 P1 by preserving commands, raw output and exit codes.

The repeated warning about `C:\Users\Admin/.config/git/ignore` is an environment permission warning. Every Git command below returned exit code 0 and the repository results were still emitted.

## CMD01 — exact worktree status

```powershell
git status --short
```

```text
?? docs/implementation/OMNISELLER_R4_3_W0_BASELINE_DAG_DIRTY_RECOVERY_RECEIPT_20260911.md
?? docs/implementation/OMNISELLER_R4_3_W0_CONTROL_PACKET_20260911.md
?? docs/implementation/OMNISELLER_R4_3_W0_DEPENDENCY_RENDER_REACHABILITY_RECEIPT_20260911.md
?? docs/implementation/OMNISELLER_R4_3_W0_MKL_PERSISTENCE_SCHEMA_RULING_20260911.md
?? docs/implementation/OMNISELLER_R4_3_W0_PACKET_MANIFEST_20260911.md
?? docs/implementation/OMNISELLER_R4_3_W0_SUBMISSION_STATE_AUDIT_20260911.md
EXIT01=0
```

No product source was listed. Revision 2 files were created only after this capture.

## CMD02 — full identities

```powershell
git rev-parse HEAD HEAD^ origin/main origin/codex/omniseller-r3-marketplace-research-workflows
```

```text
a02db42f63ab76a4091863c53d2fa649fbcc2864
63f9fa746da08e2eee34c4582787c30d60cdd233
a02db42f63ab76a4091863c53d2fa649fbcc2864
5bc0c0f2c165fd7ab1f2b63a30e320cd5e81b56b
EXIT02=0
```

Output order: W0 HEAD, W0 HEAD parent, `origin/main`, donor remote branch.

## CMD03 — merge base

```powershell
git merge-base HEAD 5bc0c0f2c165fd7ab1f2b63a30e320cd5e81b56b
```

```text
a02db42f63ab76a4091863c53d2fa649fbcc2864
EXIT03=0
```

## CMD04 — ahead/behind

```powershell
git rev-list --left-right --count HEAD...5bc0c0f2c165fd7ab1f2b63a30e320cd5e81b56b
```

```text
0       3
EXIT04=0
```

## CMD05 — local W0 and recovery refs

```powershell
git show-ref --heads | Select-String 'refs/heads/(codex/omniseller-r4-3-w0|recovery/omniseller-r4-3-)'
```

```text
a02db42f63ab76a4091863c53d2fa649fbcc2864 refs/heads/codex/omniseller-r4-3-w0
5bc0c0f2c165fd7ab1f2b63a30e320cd5e81b56b refs/heads/recovery/omniseller-r4-3-donor-5bc0c0f2
a02db42f63ab76a4091863c53d2fa649fbcc2864 refs/heads/recovery/omniseller-r4-3-production-a02db42f
EXIT05=0
```

These are local refs. No remote push occurred.

## CMD06 — product-source tracked diff

```powershell
git diff --name-status HEAD -- server src shared scripts tests package.json
```

```text
<empty>
EXIT06=0
```

## CMD07 — explicit non-W0 status filter

```powershell
$nonW0 = @(git status --short | Where-Object {
  $_ -notmatch '^\?\? docs/implementation/OMNISELLER_R4_3_W0_'
})
Write-Output ('NON_W0_CHANGES=' + $nonW0.Count)
$nonW0
```

```text
NON_W0_CHANGES=0
EXIT07=0
```

## CMD08 — donor DAG

```powershell
git log --format='%H|%P|%s' --reverse HEAD..5bc0c0f2c165fd7ab1f2b63a30e320cd5e81b56b
```

```text
354a6b73784487bcf9912046ab872d67553d0509|a02db42f63ab76a4091863c53d2fa649fbcc2864|feat: implement canonical Amazon and Etsy research workflows
d8fbc5f048eaa17c4abdcbf9e4c800de358f6f80|354a6b73784487bcf9912046ab872d67553d0509|docs: correct final Windows test accounting
5bc0c0f2c165fd7ab1f2b63a30e320cd5e81b56b|d8fbc5f048eaa17c4abdcbf9e4c800de358f6f80|fix: align marketplace research workflow with staff operations
EXIT08=0
```

## Machine conclusion

```text
W0 HEAD equals production baseline: yes
Donor is exactly three commits ahead: yes
Recovery refs exist locally: yes
Tracked product-source diff: empty
Non-W0 changes at R1 freeze: 0
Push/merge/deploy: not performed
```

