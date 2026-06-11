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

## Burn-down (2026-06-11)
Reconciled against live `gh` across **both** repos (`/roadmap`).
**89 issues — 78 closed (88%), 11 open.**
**Closed (cumulative): 78.** ← integer total of all closed issues ever, including
those whose rows are pruned from collapsed waves; bumped, never recomputed from the
table (pruned rows are gone), so the count survives wave pruning.

| Bucket | Count | Issues |
|---|---|---|
| **Ready (agent)** — loop-eligible | 3 | #210 #212 #214 |
| **Ready (human / HITL)**          | 0 | — |
| **In review (PR open)**           | 1 | #211 (pristine-extraction Phase 0; PR #217) |
| **Blocked / deferred**            | 5 | #213 #215 #216 (W5 dep-blocked) · #207 (lobotomized realign; lcc#9 closed-contaminated, blocked on #211) · bench#7 (rotate NPM_TOKEN ~2026-09-08) |
| **Tracking** (epic / PRD parents) | 1 | #196 (Auto-adopt pipeline PRD) |
| **Meta** (idea-inbox / onboarding)| 1 | #99 (Idea Inbox) |

Open by wave: W4 1 (#196) · W5 7 (#210–#216) · cross-cutting 3 (#99 #207 bench#7).

## Priority waves
| Wave | Theme | Issues | Gate to enter |
| ---- | ----- | ------ | ------------- |
| **W1** | 2.1.169 adoption + 2.1.168 orphan/boot correctness | — (wholly closed) | done |
| **W2** | Verdict-signal trust (triage decisions) | — (wholly closed) | done |
| **W3** | Behavioral A/B benchmark runnable (provisioning) | — (wholly closed) | done |
| **W4** | Auto-adopt pipeline (detect → propose → auto-gate) | #196–#200 | open (#197–#200 spine merged; only #196 PRD-parent open) |
| **W5** | Get ahead of the release curve — prove/benchmark, don't race (verification & evidence layer) | #210–#216 | open (Phase 0 #211 in review; primary weight = prove-value evidence) |
| **—**  | Cross-cutting / ongoing (incl. all `bench#NN` work) | #99 #207 bench#7 | n/a |

## Master census (active waves inline)

Open waves and the active backlog stay inline below — W4 (PRD parent #196 still
open) and W5 (the active numbered wave) plus the standing cross-cutting/meta rows
(#99, #207, bench#7). W4 going active *pruned*
the previously-retained W3 rows to a one-line summary in the collapsed block below
(ADR 0023): a wholly-closed wave keeps full rows only until a newer numbered wave is
active, then prunes; the cumulative closed-count integer above is carried (W3's 7
closed issues are already counted in it). The older W1/W2 + cross-cutting set was
pruned the same way.

| # | Issue | Wave | Status | Owner | Skill(s) | Deps | Notes |
| - | ----- | ---- | ------ | ----- | -------- | ---- | ----- |
| 196 | 💡 Auto-adopt pipeline — detect new CC version → propose → auto-gate (PRD) | W4 | Tracking | human | — | — | PRD parent for the **detect → propose → auto-gate** spine (#197–#200). HITL back-half (realign/patch authoring, Behavioral A/B, leaf PRs) explicitly out of scope (ADR 0002; cockpit rule) |
| 197 | Auto-adopt slice 1: `ReleaseDetector` CLI entry + proposal marker + all-fake wiring test | W4 | Done | agent | `/tdd` | — | Merged (#202). Thin CLI mirroring `cli.ts`/`behavioral-ab-cli.ts`; `src/release-detector-cli.ts` + `formatProposal`/`PROPOSAL_LABEL`/`ccVersionMarker` (issue-publisher) + `RealNpmReleaseSource`/`RealIssuePublisher`; propose-only; machine-readable `cc_version` marker; all-fake wiring test. Unblocked #199 |
| 198 | Auto-adopt slice 3: in-gate pristine strings-file extraction (`prompts-<version>.json`) | W4 | Done | agent | `/tdd` | — | Merged (#203). `src/strings-file-extractor.ts`: thin `extractStringsFile(binaryPath,version,outDir,adapter)→path` wrapper (version-mismatch throw) + unit test; real adapter wires the leaf `extractClaudeJsFromNativeInstallation → promptExtractor`; `@babel/parser` dep added + put on the child `NODE_PATH`; output **ephemeral**, `prompts-*.json`/`prompt-data-cache/` gitignored (cockpit). Live native-parse path gate-dispatch-verified. Independent of the detector — the #180 linchpin gap generalized |
| 199 | Auto-adopt slice 2: daily-cron workflow runs the detector → opens proposal | W4 | Done | agent | `/tdd` | _197_ | Merged (#204). `.github/workflows/release-detector.yml`: thin daily-cron (07:00 UTC) + `workflow_dispatch` adapter that only runs `src/release-detector-cli.ts` (no business logic in YAML, mirrors `integration-gate.yml`→`cli.ts`); issue-scoped token (`permissions: issues:write`, `contents:read`), `gh` auth via `GH_TOKEN`; no `claude -p` so no cost-ledger wiring; dedupe one proposal per version is the entry point's job. Verified by real dispatch, not a unit test. Unblocks #200 |
| 200 | Auto-adopt slice 4: auto-chain labeled proposal → gate dispatch + Adoption-record write-back | W4 | Done | agent | `/tdd` | _198, 199_ | `.github/workflows/proposal-chain.yml` (thin `issues:labeled` envelope) + `src/proposal-chain-cli.ts` (parse marker → `gh workflow run integration-gate.yml` w/ `cc_version`+`proposal_issue`; once-per-proposal dispatch-marker guard) + `src/proposal-marker.ts` (pure `cc_version` parser) + `src/adoption-writeback.ts` (pure formatter + additive `ProposalCommenter` seam) + `src/writeback-cli.ts`; gate gains a `proposal_issue` input + in-gate write-back step (additive comment, no auto-close; missing record → FAIL not silent pass) reusing existing `total_cost_usd` surfacing. 4 all-fake unit suites; dispatch chain gate-dispatch-verified. Last W4 slice |
| 210 | Build the orphan / leading-identifier report producer in tweakcc-maint (TF#8 redirect) | W5 | Next | agent | `/tdd` | — | skrabe agreed the finding but declined the tool into the leaf (tweakcc-fixed#8) as redundant with gates he runs (ADR 0007); redirected to live **here**, run against his published `prompts-*.json`. Producer for our downstream consumer, not a leaf PR |
| 211 | Enforce pristine extraction in the realign/anchor-diagnosis flow (no patched-install diagnoses) | W5 | In review | agent | `/tdd` | — | **Phase 0 — precondition for W5.** PR #217: gate sources strings file from a pristine `npm pack` extract (not the `--apply` cache) + patched-source guard (provenance + differential override-body fingerprint; literal markers `uJq`/`B6T(`/`*_to_replace` proven false-positive vs pristine). Fixes the contamination class that closed lcc#9 / tweakcc-fixed#8 |
| 212 | Tighten release-detector cadence so new CC versions surface within hours | W5 | Next | agent | `/tdd` | — | **Phase 1.** Raise `release-detector.yml` cron from daily to every few hours; keep propose-only + per-version dedup; no `claude -p` on this path (no cost-ledger) |
| 213 | Auto-attach pristine realign anchor-candidate diff to adopt proposals | W5 | Blocked | agent | `/tdd` | 211, 212 | **Phase 1.** Cross-version anchor diff from pristine prompts JSON, attached to the proposal as evidence; mechanical, reuses the Phase 0 extractor+guard so a zero-match candidate (the lcc#9 failure) is impossible by construction |
| 214 | Stand up Behavioral A/B prove-value run on `@dividedby/bench-core` for adoptions | W5 | Next | agent | `/tdd` | — | **Phase 2 — primary strategy weight (verification/evidence layer).** Vanilla-vs-fork prove-value per adopted version on `@dividedby/bench-core` (ADR 0003); emit a machine-readable result alongside the Adoption record. Cost-ledger wiring if it drives `claude -p`. `bench#NN`-adjacent but built from sessions here |
| 215 | Standardize Adoption record + prove-value as leaf-PR evidence body | W5 | Blocked | agent | `/tdd` | 214 | **Phase 2.** Convention: every leaf realign/adoption PR links its Adoption record + prove-value result + pristine provenance, mapped onto the Four-zeros bar |
| 216 | Bake the alignment preflight into automation: snapshot skrabe's current state on each proposal | W5 | Blocked | agent | `/tdd` | 212, 213 | Automation counterpart of the CLAUDE.md **Alignment preflight** rule (landed PR #218): snapshot leaf `main` HEAD + open/recently-closed PRs + his comments + his `tweakcc-fixed` npm version on each proposal; suppress a change already on his HEAD before it becomes a leaf PR |
| 207 | Realign lobotomized overrides to CC 2.1.172 (gate `driver-check` fails — opus-4-8 inline anchors stale) | — | Blocked | human | `release-adoption` | 211 | HITL Release-adoption realignment (ADR 0002; PRD #196 back-half, out-of-loop). **Draft PR lcc#9 closed by skrabe 2026-06-11 as contaminated** — anchors diagnosed against an already-patched install matched **zero** vs a fresh pristine extract (the override-body text + apply-time-spliced `uJq`/`B6T(` names were the tell; the MEMORY pristine-vs-`--apply` trap). skrabe had already realigned 2.1.172 himself (lcc `origin/main` eb3d6ad) and is on 2.1.173. **Blocked on #211 (Phase 0 pristine extraction);** human to re-scope against his current HEAD — redo only genuinely-uncovered opus-4-8 anchors from a pristine extract, if any remain |
| 99 | 💡 Idea Inbox | — | Tracking | human | — | — | **Standing Meta row — exempt from burn-down as pickable work.** Canonical intake for unstructured ideas across **both** repos (ADR 0009); a drained idea is filed in tweakcc-maint or `dividedby/bench` and registered as a census row here. First idea actioned → #102 |
| bench#7 | Rotate NPM_TOKEN before it expires (~2026-09-08) | — | Blocked | human | — | — | `dividedby/bench`. Time-gated ops: rotate the `@dividedby/bench-core` publish token before ~2026-09-08 |

<details>
<summary>Closed waves W1 + W2 + W3 + cross-cutting — 70 issues Done (pruned to one-line wave summaries)</summary>

Pruned to a one-line summary per wave (ADR 0023): W4 is now the active *newer
numbered* wave, so W3's previously-retained rows are pruned here and the Burn-down
**Closed (cumulative)** integer above carries the all-time total. The detailed rows
are not lost — every closed issue persists on GitHub, and every old census row
persists in git history; this `<details>` is an index, not the archive.

- **W1** — 2.1.169 adoption + 2.1.168 orphan/boot correctness — wholly closed
  (#26 #31 #42 #43 #45 #46 #58).
- **W2** — verdict-signal trust (triage decisions) — wholly closed (#41 #47 #62).
- **W3** — Behavioral A/B benchmark runnable (provisioning) — wholly closed
  (#175–#180 #192).
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
