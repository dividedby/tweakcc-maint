# tweakcc-maint — Execution Roadmap (source of record)

> **Status:** active · **Owner:** maintainer + agents
>
> The authoritative execution roadmap. It is the single census of record for
> **two** repos — `dividedby/tweakcc-maint` (rows written as a bare `#NN`) and the
> owned sibling `dividedby/bench` (rows written `bench#NN`); `bench` has no roadmap
> of its own (**ADR 0009**). The active backlog appears inline below; wholly-closed
> work is collapsed (the census is an *execution view*, not the archive — GitHub +
> git history hold the full record, ADR 0023). **This document self-updates:** every
> PR that opens, advances, or closes an issue updates that issue's row in the same
> branch — a PreToolUse hook (`.claude/hooks/roadmap-guard.py`) enforces it.
> Out-of-band drift (issues changed via `gh`/web between sessions, **in either
> repo**) is caught by a SessionStart nudge (`.claude/hooks/roadmap-drift-nudge.py`,
> which enumerates both repos) and repaired with `/roadmap`. A read-only mirror of
> this doc is rendered by CI into issue **#159** (`🗺️ Roadmap`, ADR 0020).

## How to use this doc (read this as your instructions)

You have been pointed here to work the backlog. This section *is* the prompt —
no other guidance is needed. Follow it top to bottom:

1. **Pick the work.** From the top priority wave, take the earliest row whose
   `Status` is `Next` and whose `Deps` are all satisfied (closed). If the top
   wave has no unblocked `Next`, drop to the next wave. Ties break by row order.
   A `bench#NN` row's work lives in `dividedby/bench`.
2. **Read the issue in full — body *and* every comment.** Open the linked issue
   (`gh issue view <#> --comments`, adding `-R dividedby/bench` for a `bench#NN`
   row). The **issue body is authoritative** for scope and acceptance criteria;
   the **comments carry live guidance** — unblock notes, routing, and sequencing
   that `/roadmap` writes back as the roadmap reconciles. Do not act on the body
   alone; a comment may have changed the plan. This census row only *routes and
   orders* — it never restates scope.
3. **Invoke the routed skill.** Use the skill(s) named in the row's `Skill(s)`
   cell as your method; honor the `Notes` cell for any roadmap-only sequencing.
4. **Update this doc's row in your branch before you commit** (the guard hook
   blocks an issue-referencing commit otherwise): set `Status`, and update
   `Deps` on anything your change unblocks.

## Burn-down (2026-06-10)
Reconciled against live `gh` across **both** repos (`/roadmap`).
**77 issues — 71 closed (92%), 6 open.**
**Closed (cumulative): 71.** ← integer total of all closed issues ever, including
those whose rows are pruned from collapsed waves; bumped, never recomputed from the
table (pruned rows are gone), so the count survives wave pruning.

| Bucket | Count | Issues |
|---|---|---|
| **Ready (agent)** — loop-eligible | 0 | — (#176 #177 merged; #178 #179 blocked on the #175 spike chain) |
| **Ready (human / HITL)**          | 1 | #175 (provisioning spike) |
| **Blocked / deferred**            | 4 | #178 #179 #180 (provisioning chain); bench#7 (time-gated: rotate NPM_TOKEN ~2026-09-08) |
| **Tracking** (epic / PRD parents) | 0 | — (#102 closed — all of #166–#168 landed) |
| **Meta** (idea-inbox / onboarding)| 1 | #99 (Idea Inbox) |

Open by wave: W1 0 · W2 0 · W3 4 (#175 #178 #179 #180) · unscoped 2 (#99 bench#7).

## Priority waves
| Wave | Theme | Issues | Gate to enter |
| ---- | ----- | ------ | ------------- |
| **W1** | 2.1.169 adoption + 2.1.168 orphan/boot correctness | — (wholly closed) | done |
| **W2** | Verdict-signal trust (triage decisions) | — (wholly closed) | done |
| **W3** | Behavioral A/B benchmark runnable (provisioning) | #175–#180 | done |
| **—**  | Cross-cutting / ongoing (incl. all `bench#NN` work) | #99 bench#7 | n/a |

## Master census (active waves inline)

Open waves and the active backlog stay inline below. The wholly-closed waves W1/W2
and the large closed cross-cutting set are collapsed into the `<details>` block at
the end (rows retained on first collapse; once a *newer numbered* wave is active they
prune to a one-line summary and the cumulative count above is bumped — ADR 0023).

| # | Issue | Wave | Status | Owner | Skill(s) | Deps | Notes |
| - | ----- | ---- | ------ | ----- | -------- | ---- | ----- |
| 175 | Behavioral A/B provisioning: spike — discovery-redirect, `--effort`, native-install (R1/R2/R3) | W3 | Next | human | — | — | Read-only spike: can `tweakcc-fixed` discovery be steered to a copy via `HOME`+`TWEAKCC_CONFIG_DIR` alone (R1); does adopted CLI accept `--effort` (R2); native-install fallback + v1 scope (R3). Output: a decision note unblocking #178/#176. EVIDENCE not gate (ADR 0002) |
| 176 | Behavioral A/B provisioning: prod `runCli` node-spawn wrapper + unit test | W3 | Done | agent | `/tdd` | — | `node <cliPath> -p --output-format json --model --effort …` constant across arms (ADR 0002); mirror `leaf-shell.ts` maxBuffer; keep credential env explicit under sandboxed HOME (R4) |
| 177 | Behavioral A/B provisioning: `workDir` stager helper + unit test | W3 | Done | agent | `/tdd` | — | Fresh isolated per-(fixture,variant) scratch dir under a removable work root; teardown removes it (R5) |
| 178 | Behavioral A/B provisioning: `provisionVariants()` producer + contract test | W3 | Blocked | agent | `/tdd` | 175 | copy-then-apply in sandbox HOME+config; stock=pristine copy, lobotomized=`--apply`-patched copy w/ backup in sandbox not `~/.tweakcc`; live install READ-only so Restore drill stays byte-clean. Contract test w/ fake patcher/copy seam |
| 179 | Behavioral A/B provisioning: `src/behavioral-ab-cli.ts` entry point + all-fake wiring test | W3 | Blocked | agent | `/tdd` | _176_, _177_, 178 | mirrors `cli.ts`/`pairing-coherence-cli.ts`; minimal `AdoptionRecord`, prints `BehavioralVerdict`, ALWAYS exits 0, `finally` cleanup (evidence not gate, ADR 0002). All-fake doubles, no real claude |
| 180 | Behavioral A/B provisioning: one HITL live run — capture first real `BehavioralVerdict` | W3 | Blocked | human | — | 179 | One real local run (~8 arms + ~14 Opus judge calls), real budget, captures first real verdict + any provisioning quirks; NEVER added to CI (local-first, ADR 0002) |
| 99 | 💡 Idea Inbox | — | Tracking | human | — | — | **Standing Meta row — exempt from burn-down as pickable work.** Canonical intake for unstructured ideas across **both** repos (ADR 0009); a drained idea is filed in tweakcc-maint or `dividedby/bench` and registered as a census row here. First idea actioned → #102 |
| bench#7 | Rotate NPM_TOKEN before it expires (~2026-09-08) | — | Blocked | human | — | — | `dividedby/bench`. Time-gated ops: rotate the `@dividedby/bench-core` publish token before ~2026-09-08 |

<details>
<summary>Closed waves W1 + W2 + cross-cutting — 63 issues Done (pruned to one-line wave summaries)</summary>

Pruned to a one-line summary per wave (ADR 0023): W3 is now an active *newer
numbered* wave, so the retained full rows are pruned and the Burn-down **Closed
(cumulative)** integer below carries the all-time total. The detailed rows are not
lost — every closed issue persists on GitHub, and every old census row persists in
git history; this `<details>` is an index, not the archive.

- **W1** — 2.1.169 adoption + 2.1.168 orphan/boot correctness — wholly closed
  (#26 #31 #42 #43 #45 #46 #58).
- **W2** — verdict-signal trust (triage decisions) — wholly closed (#41 #47 #62).
- **Cross-cutting `—`** — the maintenance-machine epic (#81 #83–#85 #93–#96), the
  Behavioral A/B tree (#11 #134–#139 #152), loop-onboarding (#51–#53), fallow
  hygiene (#102 #103 #125–#128 #166–#168), CI/gate + control-plane substrate (#2–#13
  #20–#23 #27 #30 #75–#77 #80 #107 #114 #148 #151 #154 #156 #159), and the owned-sibling
  `@dividedby/bench` work (bench#1 #2 #3 #8) — all closed.

</details>

## Legend
- **Repo qualification (ADR 0009)** — a bare `#NN` row is a `dividedby/tweakcc-maint`
  issue; a `bench#NN` row is a `dividedby/bench` issue tracked here. `bench` has no
  roadmap/inbox/mirror of its own; one Idea Inbox (#99) feeds both repos.
- **Status** — `Next` (do now) · `Backlog` (ready, unstarted) · `Blocked`
  (waiting on a dep/hold) · `Parked` (deferred/needs-design/wontfix) · `Tracking`
  (epic/PRD parent or standing intake) · `Done` (closed).
- **Owner** — `agent` · `human` · `mixed`.
- **Deps** — blocking issues; _italic_ = already closed (satisfied).
- **Notes** — roadmap-only sequencing guidance. Scope/AC live in the issue, not here.
- **Closed-wave collapse + prune** — a wholly-closed wave is wrapped in a collapsed
  `<details><summary>Closed wave W# — theme</summary>`; once a *newer* wave is
  active it is **pruned** to a one-line summary and the Burn-down cumulative count
  is bumped. The census is an **execution view**, not the archive — GitHub + git
  history are the archive (ADR 0023). Open waves and the active census never collapse.
- **Closed (cumulative)** — a running integer of all-time closed issues, bumped on
  each prune so the total survives row deletion.
- **Burn-down buckets** — a projection of the census onto the `Owner` + `Status` +
  label vocabulary, recomputed every reconcile: **Ready (agent)** (`ready-for-agent`,
  loop-eligible) · **Ready (human / HITL)** (`ready-for-human`) · **Blocked /
  deferred** (`Blocked`/`Parked`) · **Tracking** (epic/PRD parents) · **Meta**
  (idea-inbox / onboarding).

## Self-update protocol
Any PR that opens/advances/closes an issue (in **either** repo) updates that issue's
census row (minimally `Status`, plus `Deps` on anything it unblocks). Closed →
`Status: Done`. **Closed-wave lifecycle (ADR 0023):** when *every* issue in a wave is
`Done`, collapse that wave's rows into a `<details><summary>Closed wave W# — theme</summary>`;
once a *newer* wave is active, **prune** the collapsed rows to a one-line wave summary
and **bump the Burn-down cumulative closed-count integer** (do not recompute it from
the table — pruned rows are gone). The pruned rows are not lost: closed issues persist
on GitHub and every old row persists in git history. In-branch freshness is enforced
by `roadmap-guard.py`; out-of-band drift across **both** repos is *detected* by the
SessionStart `roadmap-drift-nudge.py` (which enumerates both, ADR 0009) and *repaired*
by `/roadmap`.
