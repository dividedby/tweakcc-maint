# tweakcc-maint — Execution Roadmap (source of record)

> **Status:** active · **Owner:** maintainer + agents
>
> The authoritative execution roadmap. Every issue appears in the master
> census below (closed issues are kept as `Done` rows — the census is the full
> record), and this is the single place to go to pick the next thing to
> work on. **This document self-updates:** every PR that opens, advances, or
> closes an issue updates that issue's row in the same branch — a PreToolUse hook
> (`.claude/hooks/roadmap-guard.py`) enforces it. Out-of-band drift (issues
> changed via `gh`/web between sessions) is caught by a SessionStart nudge
> (`.claude/hooks/roadmap-drift-nudge.py`) and repaired with `/doc-regen`.

## How to use this doc (read this as your instructions)

You have been pointed here to work the backlog. This section *is* the prompt —
no other guidance is needed. Follow it top to bottom:

1. **Pick the work.** From the top priority wave, take the earliest row whose
   `Status` is `Next` and whose `Deps` are all satisfied (closed). If the top
   wave has no unblocked `Next`, drop to the next wave. Ties break by row order.
2. **Read the issue in full — body *and* every comment.** Open the linked issue
   (`gh issue view <#> --comments`). The **issue body is authoritative** for
   scope and acceptance criteria; the **comments carry live guidance** —
   unblock notes, routing, and sequencing that `/doc-regen` writes back as the
   roadmap reconciles. Do not act on the body alone; a comment may have changed
   the plan. This census row only *routes and orders* — it never restates scope.
3. **Invoke the routed skill.** Use the skill(s) named in the row's `Skill(s)`
   cell as your method; honor the `Notes` cell for any roadmap-only sequencing.
4. **Update this doc's row in your branch before you commit** (the guard hook
   blocks an issue-referencing commit otherwise): set `Status`, and update
   `Deps` on anything your change unblocks.

## Priority waves
| Wave | Theme | Issues | Gate to enter |
| ---- | ----- | ------ | ------------- |
| **W1** | 2.1.168 orphan/boot adoption correctness | #45 #31 #43 | none — active now |
| **W2** | Verdict-signal trust (triage decisions) | #41 | none — triage anytime |
| **—**  | Cross-cutting / later | #26 #11 #8 #51 #52 #53 | n/a |

## Master census (all issues)

### Open
| # | Issue | Wave | Status | Owner | Skill(s) | Deps | Notes |
| - | ----- | ---- | ------ | ----- | -------- | ---- | ----- |
| 45 | Swap tweakcc-fixed#4 detector to the identifierMap-union check | W1 | Blocked | agent | `/tdd` | — | verified commit `bc60baa` pushed to PR #4; agent work done — awaiting HITL boot-verify vs stock 2.1.168 + skrabe merge (both his) |
| 31 | Gate consumes the patcher orphan report (consumer half) | W1 | Blocked | agent | `/tdd` | #43 | buildable behind a faked `--report-orphans` seam; real shell-out needs #43 |
| 43 | Patcher `--report-orphans` (producer, leaf PR to skrabe) | W1 | Backlog | human | `/release-adoption` | — | skrabe-facing PR + merge timing not ours |
| 41 | orphanVariables double-sourced / not trustworthy as authority | W2 | Parked | mixed | `/triage` | — | needs-triage decision on the verdict path |
| 26 | Leaf finding: lobotomized breaks CC 2.1.168 (evidence) | — | Parked | human | — | — | correct root-cause framing + re-baseline gate vs stock tweakcc-fixed |
| 11 | Roadmap: behavioral A/B benchmark (stock vs lobotomized) | — | Parked | human | — | — | roadmap item |
| 8 | Roadmap: leaf test broadening (tweakcc-fixed + lobotomized) | — | Parked | human | — | — | roadmap item |
| 51 | Onboard as an apply-agent-research Consumer loop | — | Backlog | human | `/apply-agent-research` | — | tier-2 slotting: cross-cutting workflow onboarding; operator stands up the loop |
| 52 | Onboard to the architecture-review loop | — | Backlog | human | `/improve-codebase-architecture` | — | tier-2 slotting: cross-cutting workflow onboarding |
| 53 | Onboard to the staleness-review loop | — | Backlog | human | `/staleness-audit` | — | tier-2 slotting: cross-cutting workflow onboarding |

### Done (closed — kept as full record, newest first)
| # | Issue | Wave | Status | Owner | Skill(s) | Deps | Notes |
| - | ----- | ---- | ------ | ----- | -------- | ---- | ----- |
| 46 | Authoring-drift pre-check validates vs the leaf's OWN identifierMap | W1 | Done | mixed | `/triage` | — | closed as **overtaken** — skrabe solved mis-binds at the patcher altitude (`38daf92` extractor adopts upstream's authoritative identifierMap → mis-bind structurally impossible for shared prompts; `4e1b245` audit gate; `322ba20` capture/read-consistency test), so the wrong-lineage fixture can no longer reproduce and a control-plane pre-check is redundant. The leaf-own-JSON validation rule survives (self-correcting; in CONTEXT notes); Boot-verify stays the Four-zeros authority (ADR 0005) |
| 47 | Partial-identifierMap wrong-capture binding boots clean | W2 | Done | mixed | `/triage` | — | resolved by skrabe at the patcher altitude, verified vs tweakcc-fixed main `322ba20`: croncreate 7-slot fill (`50e1ff0` — `CANCEL_TIMEFRAME_DAYS` now at correct slot) + mis-bind audit gate (`4e1b245`) + extractor adopts upstream's authoritative identifierMap (`38daf92`); override realigned (lobotomized `54e0d34`). Boot-verify remains the Four-zeros authority (ADR 0005) |
| 42 | cli.ts hasCredentials() false-negative on stored OAuth | W1 | Done | agent | `/tdd` | — | stored-OAuth probe seam; warn-and-proceed, Boot-verify is authority — unblocks real local gate runs |
| 30 | Re-scope orphan check to authoring-drift pre-check; defer prompts-source to patcher | — | Done | agent | — | — | foundation refined by #45/#46 |
| 27 | Orphan validator: align identifierMap source with applied overrides | — | Done | agent | — | — | — |
| 23 | RealAdoptionEnvironment Restore drill (HITL) | — | Done | human | — | — | — |
| 22 | RealAdoptionEnvironment adopt path — real --apply / boot-verify (HITL) | — | Done | human | — | — | — |
| 21 | listMatrix() seam — environment supplies the Support matrix | — | Done | agent | — | — | — |
| 20 | PRD: RealAdoptionEnvironment — shell-out adapter behind gate seam (HITL) | — | Done | human | — | — | — |
| 13 | Parse apply/boot/validator output into a Four-zeros verdict | — | Done | agent | — | — | — |
| 12 | Adoption-history reporting over Adoption records | — | Done | agent | — | — | — |
| 10 | GitHub-hosted CI running the gate on the fork PR branch | — | Done | human | — | — | harness guards landed here (ADR 0006) |
| 9 | Rebuild the release-adoption skill (ex-/showtime) | — | Done | agent | — | — | — |
| 7 | TB4: real adoption-environment adapter (HITL) | — | Done | agent | — | — | — |
| 6 | TB5: propose-only release-detector run-book | — | Done | agent | — | — | — |
| 5 | TB3: Restore-drill bracketing the gate | — | Done | agent | — | — | — |
| 4 | TB2: Support-matrix iteration — every version must pass | — | Done | agent | — | — | — |
| 3 | TB1: walking-skeleton integration gate → Four-zeros verdict | — | Done | agent | — | — | — |
| 2 | PRD: release-adoption control plane | — | Done | mixed | — | — | — |

## Legend
- **Status** — `Next` (do now) · `Backlog` (ready, unstarted) · `Blocked`
  (waiting on a dep) · `Parked` (deferred/needs-design/wontfix) · `Tracking`
  (epic/PRD parent) · `Done` (closed).
- **Owner** — `agent` · `human` · `mixed`.
- **Deps** — blocking issues; _italic_ = already closed (satisfied).
- **Notes** — roadmap-only sequencing guidance. Scope/AC live in the issue, not here.

## Self-update protocol
Any PR that opens/advances/closes an issue updates that issue's census row
(minimally `Status`, plus `Deps` on anything it unblocks). Closed → `Status: Done`
(keep the row). Enforced by `roadmap-guard.py`; out-of-band drift repaired by `/doc-regen`.
