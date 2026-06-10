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
**71 issues — 67 closed (94%), 4 open.**
**Closed (cumulative): 67.** ← integer total of all closed issues ever, including
those whose rows are pruned from collapsed waves; bumped, never recomputed from the
table (pruned rows are gone), so the count survives wave pruning.

| Bucket | Count | Issues |
|---|---|---|
| **Ready (agent)** — loop-eligible | 1 | #168 (fallow-baselines regen — #166+#167 satisfied, unblocked) |
| **Ready (human / HITL)**          | 0 | — |
| **Blocked / deferred**            | 1 | bench#7 (time-gated: rotate NPM_TOKEN ~2026-09-08) |
| **Tracking** (epic / PRD parents) | 1 | #102 (fallow refactor plan accepted + split → #166–#168; closes when they land) |
| **Meta** (idea-inbox / onboarding)| 1 | #99 (Idea Inbox) |

Open by wave: W1 0 · W2 0 · unscoped 4 (#99 #102 #168 bench#7).

## Priority waves
| Wave | Theme | Issues | Gate to enter |
| ---- | ----- | ------ | ------------- |
| **W1** | 2.1.169 adoption + 2.1.168 orphan/boot correctness | — (wholly closed) | done |
| **W2** | Verdict-signal trust (triage decisions) | — (wholly closed) | done |
| **—**  | Cross-cutting / ongoing (incl. all `bench#NN` work) | #99 #102 #168 bench#7 | n/a |

## Master census (active waves inline)

Open waves and the active backlog stay inline below. The wholly-closed waves W1/W2
and the large closed cross-cutting set are collapsed into the `<details>` block at
the end (rows retained on first collapse; once a *newer numbered* wave is active they
prune to a one-line summary and the cumulative count above is bumped — ADR 0023).

| # | Issue | Wave | Status | Owner | Skill(s) | Deps | Notes |
| - | ----- | ---- | ------ | ----- | -------- | ---- | ----- |
| 102 | Post-backlog: complete refactor plan from a fallow static-analysis pass | — | Tracking | human | `/improve-codebase-architecture` | — | Plan **accepted** (fresh re-run, fallow 2.91.0 @ `196d3e0`) and split via `/to-issues` → **#166 #167 #168**. P3/P4 stayed monitoring notes (not ticketed). Prior P2/P5 obsolete (entry-points + baseline already landed via #126/#128). `/software-design` early-exited (single-module hygiene → `/tdd`). Parent row — closes when #166–#168 land. Spawned from Idea Inbox #99 |
| 166 | fallow P1: resolve 5 dead exports in the A/B tree | — | Done | agent | `/tdd` | — | 4 de-export internal helpers (orphan-report-producer, persona-prompts) + delete 1 dead re-export (stub-judge `BEHAVIORAL_AXES`). Gate-covered mechanical (ADR 0004 no-build, ADR 0007 untouched). From #102 P1 |
| 167 | fallow P2: suppress 3 port-fake DI false positives | — | Done | agent | `/tdd` | — | Suppressed `VariantRunner`/`Rng` adapter members via `.fallowrc.json` `usedClassMembers` rules (#127 convention) — fallow can't see through the port (ADR-0004 seam). 3→0 unused class members, no deletions, no stale suppressions. From #102 P2 |
| 168 | fallow P1 follow-up: regenerate committed fallow-baselines after dead-code cleanup | — | Ready | agent | `/tdd` | ~~#166~~ ~~#167~~ | Regenerate `fallow-baselines/` to the new dead-code floor now #166+#167 landed; report-only CI tracks the new delta. #166 landed (5→0 dead exports); #167 landed (3→0 unused class members). Unblocked. From #102 sequencing |
| 99 | 💡 Idea Inbox | — | Tracking | human | — | — | **Standing Meta row — exempt from burn-down as pickable work.** Canonical intake for unstructured ideas across **both** repos (ADR 0009); a drained idea is filed in tweakcc-maint or `dividedby/bench` and registered as a census row here. First idea actioned → #102 |
| bench#7 | Rotate NPM_TOKEN before it expires (~2026-09-08) | — | Blocked | human | — | — | `dividedby/bench`. Time-gated ops: rotate the `@dividedby/bench-core` publish token before ~2026-09-08 |

<details>
<summary>Closed waves W1 + W2 + cross-cutting — 59 issues Done (collapsed; superseded backlog)</summary>

Rows retained on first collapse (ADR 0023). Closed issues live on GitHub + in git
history; the Burn-down **Closed (cumulative)** integer carries the all-time total.
W1 (2.1.169 adoption + 2.1.168 orphan/boot correctness) and W2 (verdict-signal
trust) shipped fully; the cross-cutting `—` set covers the maintenance-machine epic,
the Behavioral A/B tree, the loop-onboarding work, fallow hygiene, and the
`@dividedby/bench-core` extraction (`bench#3`). Once a *newer numbered* wave opens,
these rows prune to a one-line summary per wave and the cumulative count is bumped.

| # | Issue | Wave | Status | Owner | Skill(s) | Notes |
| - | ----- | ---- | ------ | ----- | -------- | ----- |
| 148 | Enforce gate as a required status check on main | — | Done | agent | `/update-config` | Stood up `.github/workflows/ci.yml` (`ci` check: `pnpm test`+`pnpm typecheck` on PRs) — the missing always-green PR check; `main` branch protection now requires it (`enforce_admins=false`). Also fixed two latent CI bugs: pnpm devEngines caret → exact 11.5.2, and an inert `minimumReleaseAgeExclude` (version-suffixed → name pattern, exempting first-party bench-core). PR #163 |
| bench#2 | Publish benchmark results to GitHub Pages (model × effort × cost/quality) | — | Done | agent | — | `dividedby/bench`. Committed-derived-snapshot model: `site/build-data.mjs` joins cost+quality on the `model__effort` cell key → `site/data.json`; `pages.yml` renders+deploys on push (no sweep/secrets). Pages live: https://dividedby.github.io/bench/ (bench PR #10) |
| 156 | Bump GitHub Actions off deprecated Node 20 (integration-gate + fallow-report @v4 → current majors) | — | Done | agent | — | All five `@v4` refs bumped (checkout→v6, setup-node→v6, action-setup→v6, cache→v5, upload-artifact→v7) across both workflows; pnpm pin (11.5.2) passed explicitly to action-setup so resolution is unaffected. fallow PR run went green on the bumped actions (PR #161) |
| 151 | Onboard Idea Inbox + roadmap mirror, reconcile roadmap to new format (ADR 0023) | — | Done | agent | `/roadmap` | Idea Inbox (#99) + CI-owned read-only mirror (#159) + two-repo census departure (ADR 0009) + format migration (PR #160) |
| bench#8 | Adopt label convention v1 (dividedby/skills #218) — full set | — | Done | agent | `/triage` | `dividedby/bench`. v1 set (6 CORE + 2 CHANNEL) applied; 8 stock labels removed (issue-free); `source:*`/LOOP labels not seeded (no proposal loops yet). Mirror of #154 |
| bench#1 | Add an npm test PR gate on main | — | Done | agent | — | `dividedby/bench`. `test.yml` runs `node --test` PR gate on `main` (Node 24, checkout@v6 + setup-node@v6); also moved publish.yml off EOL Node 20 / `@v4` (bench PR #9). Branch protection to require the `test` check is a follow-up admin step |
| bench#3 | Add a model-calling JudgeBackend (live Opus grading) alongside the no-model default | — | Done | agent | — | `dividedby/bench`. Shipped `createModelJudgeBackend`, published `@dividedby/bench-core@0.2.0`; consumed here via #152 |
| 154 | Adopt label convention v1 (dividedby/skills #218) — full set | — | Done | agent | `/triage` | Closed — v1 label set adopted on tweakcc-maint's tracker; bench mirror is bench#8 |
| 152 | Behavioral A/B: swap judge adapters to bench-core live model backend | — | Done | agent | — | Bumped dep `^0.1.0`→`^0.2.0`, swapped default backend to `createModelJudgeBackend` (PR #155) |
| 139 | Behavioral A/B: BehavioralAggregation (z-score + disagreement + variance/significance) | — | Done | agent | `/tdd` | Pure `aggregate()` reusing bench `normalize`/`groupByCell`; driver swap done |
| 138 | Behavioral A/B: real adapters + live wiring | — | Done | agent | `/tdd` | JudgePanelPort + AFK adapters; driver scores a 3-persona panel (PR #149) |
| 137 | Behavioral A/B: behavioral rubric + bait-fixture suite | — | Done | human | — | Rubric-anchored 0–4 axes + 4 bait fixtures + CorrectnessChecker seam |
| 136 | Behavioral A/B: bench refactor + publish as library package (leaf) | — | Done | human | — | Published `@dividedby/bench-core@0.1.0`; stood up `dividedby/bench` |
| 135 | Behavioral A/B: driver skeleton end-to-end on stub ports | — | Done | agent | `/tdd` | ABDriver tracer-bullet on stub ports |
| 134 | PRD: Behavioral A/B benchmark (stock vs lobotomized-CC) | — | Done | agent | `/to-issues` | Codified #11's 6 decisions; whole slice set shipped |
| 128 | fallow hygiene: save health baseline + wire report-only CI delta (#102 P5) | — | Done | agent | `/tdd` | Committed baselines + introduced/inherited delta in `fallow-report.yml` |
| 127 | fallow hygiene: suppress DI port/seam false-positives (#102 P3) | — | Done | agent | `/tdd` | `usedClassMembers` rules + one dead-method drop |
| 126 | fallow hygiene: register tsx CLI entry points in fallow config (#102 P2) | — | Done | agent | `/tdd` | Root `.fallowrc.json` entry roots |
| 125 | fallow hygiene: triage 4 genuinely-dead exports (#102 P1) | — | Done | agent | `/tdd` | 4 dead exports made module-private |
| 114 | integration-gate: boot-verify `claude -p` has no `--model` pin or `--max-budget-usd` cap | — | Done | agent | — | Pinned haiku snapshot model + `--max-budget-usd 1.00` cap |
| 107 | staleness-review: pnpm CI pin exact + Node cross-major (2 findings) | — | Done | agent | `/staleness-audit` | CI pnpm pinned exact; `.nvmrc`→26.3.0, gate green under live Node 26 |
| 103 | CI: standing fallow static-analysis check (report-only first) | — | Done | agent | — | `fallow-report.yml`, report-only baseline for #102 |
| 96 | Leaf ask: make escape-or-not mechanical (per-prompt delimiter or escape audit) | — | Done | agent | — | Framed ask delivered as an intent-ping on tf#7 |
| 95 | Gate: standing cross-leaf pairing-coherence check | — | Done | agent | `/tdd` | `pairing-coherence-cli.ts` invokes skrabe's `auditMisbinds` across tf×lcc pairings |
| 94 | Pre-stage CC 2.1.170 adoption on skrabe's open PR pair — current on merge day | — | Done | agent | `/release-adoption` | Merge-day gate green vs merged mains; 2.1.170 record finalized |
| 93 | Bug evidence: chronic duplicate-id carryover in prompts JSONs — deliver upstream | — | Done | agent | — | Evidence intent-ping on tf#7 |
| 85 | Maintenance machine — Phase C: extract the defer-vs-lead improvement backlog | — | Done | agent | — | `docs/index/improvement-backlog.md`; leads #93–#96 spawned |
| 84 | Maintenance machine — Phase B: synthesize the index into durable knowledge | — | Done | agent | — | CONTEXT/ADR 0007/CLAUDE/runbook updated |
| 83 | Maintenance machine — Phase A: index both leaf repos | — | Done | agent | — | `docs/index/leaf-repos.md` |
| 81 | Maintenance machine — epic | — | Done | human | — | All 3 phase children shipped |
| 80 | Gate shells to skrabe's published `driver.mjs` instead of reconstructing the verdict | — | Done | agent | `/tdd` | `driver-verification.ts` sources signals from `driver.mjs` exit codes |
| 77 | Add PreToolUse hook to gate typecheck before git commits | — | Done | agent | `/update-config` | `typecheck-guard.py` |
| 76 | deepening: export `versionPassed` from integration-gate | — | Done | agent | `/improve-codebase-architecture` | De-duplicated the pass predicate |
| 75 | staleness-review: Node + pnpm pins | — | Done | mixed | `/staleness-audit` | `.github/dependabot.yml`; `.nvmrc` 22→24 |
| 62 | Orphan-validator false-clean: SYNTHETIC_POSITIONAL hides boot-crashing `_VAR_<n>` | W2 | Done | agent | `/tdd` | Removed the blanket `_VAR_<n>` exclusion |
| 58 | Adopt CC 2.1.169 | W1 | Done | agent | `/release-adoption` | Gate green; record establishes `docs/records/` |
| 53 | Onboard to the staleness-review loop | — | Done | mixed | `/staleness-audit` | `staleness-review.yml` (caveat → dividedby/skills#179) |
| 52 | Onboard to the architecture-review loop | — | Done | mixed | `/improve-codebase-architecture` | `improve-codebase-architecture.yml` |
| 51 | Onboard as an apply-agent-research Consumer loop | — | Done | mixed | `/apply-agent-research` | `apply-agent-research.yml` |
| 47 | Partial-identifierMap wrong-capture binding boots clean | W2 | Done | mixed | `/triage` | Resolved at the patcher altitude |
| 46 | Authoring-drift pre-check validates vs the leaf's OWN identifierMap | W1 | Done | mixed | `/triage` | Closed as overtaken (skrabe `38daf92`) |
| 45 | Swap tweakcc-fixed#4 detector to the identifierMap-union check | W1 | Done | mixed | `/tdd` | Merged by skrabe (tf#4) |
| 43 | Orphan report producer (relocated to control plane) | W1 | Done | agent | `/release-adoption` | Ported to `src/orphan-report-producer.ts`, wired into #80 |
| 42 | cli.ts hasCredentials() false-negative on stored OAuth | W1 | Done | agent | `/tdd` | Stored-OAuth probe seam |
| 41 | orphanVariables double-sourced / not trustworthy | W2 | Done | mixed | `/triage` | Closed as superseded-by-#31 |
| 31 | Gate consumes the patcher orphan report (consumer half) | W1 | Done | agent | `/tdd` | `orphan-report.ts` parser + Four-zeros authority |
| 30 | Re-scope orphan check to authoring-drift pre-check | — | Done | agent | — | Foundation refined by #45/#46 |
| 27 | Orphan validator: align identifierMap source with applied overrides | — | Done | agent | — | — |
| 26 | Leaf finding: lobotomized breaks CC 2.1.168 (evidence) | W1 | Done | mixed | — | Named-prompt realign delivered → lcc#7 merged |
| 23 | RealAdoptionEnvironment Restore drill (HITL) | — | Done | human | — | — |
| 22 | RealAdoptionEnvironment adopt path — real --apply / boot-verify (HITL) | — | Done | human | — | — |
| 21 | listMatrix() seam — environment supplies the Support matrix | — | Done | agent | — | — |
| 20 | PRD: RealAdoptionEnvironment — shell-out adapter behind gate seam (HITL) | — | Done | human | — | — |
| 13 | Parse apply/boot/validator output into a Four-zeros verdict | — | Done | agent | — | — |
| 12 | Adoption-history reporting over Adoption records | — | Done | agent | — | — |
| 11 | Roadmap: Behavioral A/B benchmark (stock vs lobotomized) | — | Done | mixed | `/to-prd` `/to-issues` | Epic delivered end-to-end → #134 → #135–#139 + #152 |
| 10 | GitHub-hosted CI running the gate on the fork PR branch | — | Done | human | — | Harness guards landed (ADR 0006) |
| 9 | Rebuild the release-adoption skill (ex-/showtime) | — | Done | agent | — | — |
| 8 | Roadmap: leaf test broadening (tweakcc-fixed + lobotomized) | — | Done | human | `/tdd` | tf#6 merged (helper units kept, golden snapshot dropped) |
| 7 | TB4: real adoption-environment adapter (HITL) | — | Done | agent | — | — |
| 6 | TB5: propose-only release-detector run-book | — | Done | agent | — | — |
| 5 | TB3: Restore-drill bracketing the gate | — | Done | agent | — | — |
| 4 | TB2: Support-matrix iteration — every version must pass | — | Done | agent | — | — |
| 3 | TB1: walking-skeleton integration gate → Four-zeros verdict | — | Done | agent | — | — |
| 2 | PRD: release-adoption control plane | — | Done | mixed | — | — |

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
