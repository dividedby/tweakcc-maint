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
3. **If the row prepares a leaf contribution, run the alignment preflight first.**
   For any work that would author or propose to a skrabe leaf (`tweakcc-fixed`,
   `lobotomized-claude-code`) — `release-adoption`, a realign, a verified leaf PR —
   we **prove, benchmark, and suggest; we do not race**. Before authoring, reconcile
   against his **current** state: leaf `main` HEAD (he may have already done it —
   his own 2.1.172 realign closed our lcc#9), open **and** recently-closed PRs, his
   review comments, and his published CLI (`npm view tweakcc-fixed version`) vs our
   Support matrix. Proceed only if the contribution is still true against his HEAD
   **and** still not something he runs himself; otherwise re-scope or drop it. Any
   anchor/finding must come from a **pristine** extract, never a patched install
   (CLAUDE.md → "Alignment preflight"; MEMORY → alignment-first posture).
4. **Invoke the routed skill.** Use the skill(s) named in the row's `Skill(s)`
   cell as your method; honor the `Notes` cell for any roadmap-only sequencing.
5. **Update this doc's row in your branch before you commit** (the guard hook
   blocks an issue-referencing commit otherwise): set `Status`, and update
   `Deps` on anything your change unblocks.

## Burn-down (2026-06-11)
Reconciled against live `gh` across **both** repos (`/roadmap`).
**91 issues — 87 closed (96%), 4 open.**
**Closed (cumulative): 87.** ← integer total of all closed issues ever, including
those whose rows are pruned from collapsed waves; bumped, never recomputed from the
table (pruned rows are gone), so the count survives wave pruning.

| Bucket | Count | Issues |
|---|---|---|
| **Ready (agent)** — loop-eligible | 0 | — (W5 agent rows all Done) |
| **Ready (human / HITL)**          | 1 | #230 (tweakcc-fixed apply-ordering — leaf finding; preflight UNCOVERED, but the fix is a source-level design call (his) → surface as a suggestion, not a draft PR) |
| **In review (PR open)**           | 0 | — |
| **Blocked / deferred**            | 1 | bench#7 (rotate NPM_TOKEN ~2026-09-08) |
| **Tracking** (epic / PRD parents) | 1 | #196 (Auto-adopt pipeline PRD) |
| **Meta** (idea-inbox / onboarding)| 1 | #99 (Idea Inbox) |

Open by wave: W4 1 (#196) · W5 0 (wholly closed — collapsed) · cross-cutting 3 (#99 #230 bench#7).

## Priority waves
| Wave | Theme | Issues | Gate to enter |
| ---- | ----- | ------ | ------------- |
| **W1** | 2.1.169 adoption + 2.1.168 orphan/boot correctness | — (wholly closed) | done |
| **W2** | Verdict-signal trust (triage decisions) | — (wholly closed) | done |
| **W3** | Behavioral A/B benchmark runnable (provisioning) | — (wholly closed) | done |
| **W4** | Auto-adopt pipeline (detect → propose → auto-gate) | #196–#200 | open (#197–#200 spine merged; only #196 PRD-parent open) |
| **W5** | Get ahead of the release curve — prove/benchmark, don't race (verification & evidence layer) | #210–#216 | wholly closed (collapsed below; no newer wave, so rows retained) |
| **—**  | Cross-cutting / ongoing (incl. all `bench#NN` work) | #99 #207 bench#7 | n/a |

## Master census (active waves inline)

Open waves and the active backlog stay inline below — W4 (PRD parent #196 still
open; its Done spine #197–#200 stays inline until the wave wholly closes) plus the
standing cross-cutting/meta rows (#99, #207, bench#7). **W5 (#210–#216) is now
wholly closed and collapsed** into its own `<details>` below (ADR 0023): a
wholly-closed wave keeps full rows until a *newer numbered* wave is active, then
prunes to a one-liner — W5 is the newest wave, so its rows are retained, not pruned.
W4 going active earlier *pruned* the previously-retained W3 rows to a one-line
summary in the older collapsed block; the cumulative closed-count integer above is
carried (W3's 7 closed issues are already counted in it). The older W1/W2 +
cross-cutting set was pruned the same way.

| # | Issue | Wave | Status | Owner | Skill(s) | Deps | Notes |
| - | ----- | ---- | ------ | ----- | -------- | ---- | ----- |
| 196 | 💡 Auto-adopt pipeline — detect new CC version → propose → auto-gate (PRD) | W4 | Tracking | human | — | — | PRD parent for the **detect → propose → auto-gate** spine (#197–#200). HITL back-half (realign/patch authoring, Behavioral A/B, leaf PRs) explicitly out of scope (ADR 0002; cockpit rule) |
| 197 | Auto-adopt slice 1: `ReleaseDetector` CLI entry + proposal marker + all-fake wiring test | W4 | Done | agent | `/tdd` | — | Merged (#202). Thin CLI mirroring `cli.ts`/`behavioral-ab-cli.ts`; `src/release-detector-cli.ts` + `formatProposal`/`PROPOSAL_LABEL`/`ccVersionMarker` (issue-publisher) + `RealNpmReleaseSource`/`RealIssuePublisher`; propose-only; machine-readable `cc_version` marker; all-fake wiring test. Unblocked #199 |
| 198 | Auto-adopt slice 3: in-gate pristine strings-file extraction (`prompts-<version>.json`) | W4 | Done | agent | `/tdd` | — | Merged (#203). `src/strings-file-extractor.ts`: thin `extractStringsFile(binaryPath,version,outDir,adapter)→path` wrapper (version-mismatch throw) + unit test; real adapter wires the leaf `extractClaudeJsFromNativeInstallation → promptExtractor`; `@babel/parser` dep added + put on the child `NODE_PATH`; output **ephemeral**, `prompts-*.json`/`prompt-data-cache/` gitignored (cockpit). Live native-parse path gate-dispatch-verified. Independent of the detector — the #180 linchpin gap generalized |
| 199 | Auto-adopt slice 2: daily-cron workflow runs the detector → opens proposal | W4 | Done | agent | `/tdd` | _197_ | Merged (#204). `.github/workflows/release-detector.yml`: thin daily-cron (07:00 UTC) + `workflow_dispatch` adapter that only runs `src/release-detector-cli.ts` (no business logic in YAML, mirrors `integration-gate.yml`→`cli.ts`); issue-scoped token (`permissions: issues:write`, `contents:read`), `gh` auth via `GH_TOKEN`; no `claude -p` so no cost-ledger wiring; dedupe one proposal per version is the entry point's job. Verified by real dispatch, not a unit test. Unblocks #200 |
| 200 | Auto-adopt slice 4: auto-chain labeled proposal → gate dispatch + Adoption-record write-back | W4 | Done | agent | `/tdd` | _198, 199_ | `.github/workflows/proposal-chain.yml` (thin `issues:labeled` envelope) + `src/proposal-chain-cli.ts` (parse marker → `gh workflow run integration-gate.yml` w/ `cc_version`+`proposal_issue`; once-per-proposal dispatch-marker guard) + `src/proposal-marker.ts` (pure `cc_version` parser) + `src/adoption-writeback.ts` (pure formatter + additive `ProposalCommenter` seam) + `src/writeback-cli.ts`; gate gains a `proposal_issue` input + in-gate write-back step (additive comment, no auto-close; missing record → FAIL not silent pass) reusing existing `total_cost_usd` surfacing. 4 all-fake unit suites; dispatch chain gate-dispatch-verified. Last W4 slice |
| 207 | Realign lobotomized overrides to CC 2.1.172 (gate `driver-check` fails — opus-4-8 inline anchors stale) | — | Done | human | `release-adoption` | _211_ | Closed (covered / premise-resolved). The opus-4-8 anchor realign is verified done: all 6 flagged anchors match pristine **2.1.173** exactly once; skrabe realigned 2.1.172/2.1.173 and closed lcc#8/#9. Gate run 27369708739 (after the #228 extractor fix unblocked the gate) reached a real four-zeros verdict — all clean **except** `driver-check`, which diagnosis traced to a **distinct** `tweakcc-fixed` named-prompt apply-ordering bug (now **#230**), NOT this issue's lobotomized opus-4-8 premise (disproven as the cause) |
| 230 | tweakcc-fixed apply-ordering collisions block driver-check at 2.1.173 (budget-exceeded + task-tools-reminder shadowed) | — | Backlog | human | `release-adoption` | _228_ | Leaf finding for skrabe's `tweakcc-fixed` (cockpit: prove/suggest, don't impose). `driver-check` `"Could not find": 2` — built-in reminder overrides (`edited_text_file`, `TASK_LIST_REMINDER_INJECTION`) shadow named prompts via an intra-`--apply` splice; both target prompts match pristine exactly once (no drift) and his own curated `prompts-2.1.173.json` carries them (refutes a gate fault). Alignment preflight UNCOVERED on his HEAD `ebb6702`. Draft-PR prep **HALTED at STEP 1**: his `shadows:` reader (`systemPromptSync.ts:28-61`) scans runtime `.md` overlays only; these collisions are built-in TS `ReminderInjection`s with no `.md`/no `shadows` field → the fix is a **source-level interface change (his design call)**, not a mechanical leaf PR (ADR 0007). Surface as a suggestion |
| 228 | Pristine strings-file extractor breaks on all current CC versions (npm tarball no longer ships `package/cli.js`) | — | Done | agent | `/tdd` | — | Gate-blocking. `extractPristineStringsFile` sourced cli.js via `npm pack`→`tar package/cli.js`, but CC's npm package is now a thin launcher with no `cli.js` (2.1.170/172/173) → gate failed closed at *Seed the PRISTINE strings file*. Fix: source from the freshly-installed **native binary** (pristine — read BEFORE the gate's first `--apply`), the same source the real adapter already parses. `extractPristineStringsFile(binaryPath, version, outDir, adapter)` now takes the binary path + delegates to `extractStringsFile` (npm-pack/tar block deleted; cli.js-sourcing behind the existing adapter seam → new unit test, no live registry). `pristine-extract-cli.ts` resolves `~/.local/bin/claude` (`CC_NATIVE_BINARY` override); workflow step reworded. #211's patched-source guard unchanged — still rejects an `--apply`-sourced candidate against the native-install reference |
| 99 | 💡 Idea Inbox | — | Tracking | human | — | — | **Standing Meta row — exempt from burn-down as pickable work.** Canonical intake for unstructured ideas across **both** repos (ADR 0009); a drained idea is filed in tweakcc-maint or `dividedby/bench` and registered as a census row here. First idea actioned → #102 |
| bench#7 | Rotate NPM_TOKEN before it expires (~2026-09-08) | — | Blocked | human | — | — | `dividedby/bench`. Time-gated ops: rotate the `@dividedby/bench-core` publish token before ~2026-09-08 |

<details>
<summary>Closed wave W5 — get ahead of the release curve (verification & evidence layer) — 7 issues Done (#210–#216; full rows retained, no newer wave to prune against)</summary>

| # | Issue | Wave | Status | Owner | Skill(s) | Deps | Notes |
| - | ----- | ---- | ------ | ----- | -------- | ---- | ----- |
| 210 | Build the orphan / leading-identifier report producer in tweakcc-maint (TF#8 redirect) | W5 | Done | agent | `/tdd` | — | Closed as already-satisfied: the producer already lived in `main` (`src/orphan-report-producer.ts` + coverage), landed via PR #124/#43 and refined by #174; the pristine-input nuance is covered by #211 (PR #217). #210 was a re-filing of the closed #43. skrabe declined the tool into the leaf (tweakcc-fixed#8) as redundant (ADR 0007) — it lives **here** as a producer for our downstream consumer, not a leaf PR |
| 211 | Enforce pristine extraction in the realign/anchor-diagnosis flow (no patched-install diagnoses) | W5 | Done | agent | `/tdd` | — | **Phase 0 — precondition for W5.** Merged (#217): gate sources strings file from a pristine `npm pack` extract (not the `--apply` cache) + patched-source guard (provenance + differential override-body fingerprint; literal markers `uJq`/`B6T(`/`*_to_replace` proven false-positive vs pristine). Fixes the contamination class that closed lcc#9 / tweakcc-fixed#8. Unblocks #213, #207 |
| 212 | Tighten release-detector cadence so new CC versions surface within hours | W5 | Done | agent | `/tdd` | — | **Phase 1.** Merged (#222). Raised `release-detector.yml` cron from daily to every 4h (`0 */4 * * *`); propose-only + per-version dedup (issue-publisher PROPOSAL_LABEL/ccVersionMarker) unchanged; npm-compare only, no `claude -p` (no cost-ledger). Unblocks #213, #216 |
| 213 | Auto-attach pristine realign anchor-candidate diff to adopt proposals | W5 | Done | agent | `/tdd` | _211_, _212_ | **Phase 1.** Merged (#224): `src/anchor-candidate-diff.ts` — pure `buildAnchorCandidateDiff(prior,next,overrides)` over two PRISTINE prompts JSONs → per-override candidate (moved/unchanged/`zeroMatch`, channel-classified `Could not find` named-prompt vs `failed to find` inline-blob); `renderAnchorCandidateDiff` markdown + `postAnchorCandidateDiff` via the cockpit-safe additive `ProposalCommenter` seam (comment-only). A candidate that matches zero against pristine is surfaced as `zeroMatch` (no phantom text) — the lcc#9 mode impossible by construction. Reuses the Phase 0 extractor+guard. Unblocks #216 |
| 214 | Stand up Behavioral A/B prove-value run on `@dividedby/bench-core` for adoptions | W5 | Done | agent | `/tdd` | — | **Phase 2 — primary strategy weight (verification/evidence layer).** Merged (#223). Vanilla-vs-fork prove-value per adopted version on `@dividedby/bench-core` (ADR 0003): `src/prove-value-result.ts` distills the `BehavioralVerdict` into a version-keyed machine-readable `ProveValueResult` (per-axis lobotomized−stock delta + significance, guardrail outcome, degenerate flag, `provesValue` evidence summary — NOT a gate) + a leaf-PR markdown renderer #215 reuses; `src/prove-value-artifact.ts` persists it as `prove-value-<ver>.json` (injected fs seam) alongside the Adoption record; `behavioral-ab-cli` keys the run to `BEHAVIORAL_AB_CC_VERSION` and emits the artifact. No NEW `claude -p` invocation (artifact distillation is pure+fs) → no new cost-ledger wiring. `bench#NN`-adjacent but built from sessions here |
| 215 | Standardize Adoption record + prove-value as leaf-PR evidence body | W5 | Done | agent | `/tdd` | _214_ | **Phase 2.** Merged (#225): `src/leaf-pr-evidence.ts` — pure `renderLeafPrEvidence({ccVersion, record, proveValue, provenance})` composes one standard leaf-PR evidence body from three halves: the Adoption record's per-version Four-zeros mapped onto the bar (four zeros spelled out + `auditMisbinds=0`/not-run/breached), the #214 prove-value result (reuses `renderProveValueResult` verbatim — evidence, not the bar), and the pristine `npm pack` provenance (#211/#213). Throws on version mismatch across the halves. A producer that *prepares* a body — opens no leaf PR. Convention documented in the release-adoption SKILL "Prepare verified PRs" step |
| 216 | Bake the alignment preflight into automation: snapshot skrabe's current state on each proposal | W5 | Done | agent | `/tdd` | _212_, _213_ | Merged (#226). Automation counterpart of the CLAUDE.md **Alignment preflight** rule (#218): `src/alignment-snapshot.ts` — `gatherAlignmentSnapshot` reads skrabe's CURRENT state behind injected seams (new read-only `LeafStateSource` for leaf `main` HEAD + recent subjects + open/recently-closed PRs + his review comments; reuses `NpmReleaseSource` for his `tweakcc-fixed` npm version) and compares it to our **Support matrix** (`aheadOfMatrix`); `renderAlignmentSnapshot`/`postAlignmentSnapshot` surface it as an **additive** proposal comment via the cockpit-safe `ProposalCommenter` seam (comment-only). `screenCandidatesAgainstHead` is the #213 precheck: a moved candidate whose proposed text his HEAD already carries is flagged `redundant` — suppressed BEFORE it becomes a leaf PR (the lcc#9/tweakcc-fixed#8 stale-premise mode, prevented in code). `RealLeafStateSource` (`gh`/`gh api`, read-only) ships the prod adapter; all-fake wiring test. No `claude -p` → no cost-ledger |

</details>

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
