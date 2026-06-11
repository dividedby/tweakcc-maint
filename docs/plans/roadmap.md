<!-- agent-protocol: reconcile=/roadmap; drain=docs/agents/idea-inbox.md -->
# tweakcc-maint — Execution Roadmap (source of record)

> **Read-only mirror.** This is the human-facing execution roadmap: the master
> census below is the single place to pick the next thing to work on. It is the
> census of record for **two** repos — `dividedby/tweakcc-maint` (`#NN`) and the
> owned sibling `dividedby/bench` (`bench#NN`), ADR 0009 — so `bench` has no
> roadmap/inbox/mirror of its own. The doc self-updates in-branch and is mirrored
> read-only to pinned issue **#159** (`🗺️ Roadmap`, ADR 0020) — edit the
> working-tree doc, not the mirror. Agent operating instructions are **not** in
> this body: reconcile lives in the `roadmap` skill (`/roadmap`), inbox drain in
> `docs/agents/idea-inbox.md` (see the breadcrumb at the top of the raw doc).

## Burn-down (2026-06-11)
**92 issues — 89 closed (97%), 3 open.** Closed (cumulative): 89. Open by wave: W4 0 (pruned) · W5 0 (collapsed) · cross-cutting 3 (#99 #230 bench#7).

| Bucket | Count | Issues |
|---|---|---|
| **Ready (agent)** — loop-eligible | 0 | — |
| **Ready (human / HITL)**          | 1 | #230 (verified draft PR skrabe/tweakcc-fixed#9 prepared; awaiting skrabe) |
| **Blocked / deferred**            | 1 | bench#7 (rotate NPM_TOKEN ~2026-09-08) |
| **Tracking** (epic / PRD parents) | 0 | — |
| **Meta** (idea-inbox / onboarding)| 1 | #99 (Idea Inbox) |

## Census
Open waves stay inline, ordered by wave priority. A **wholly-closed** wave collapses
into a `<details>`; once a *newer* wave is active, the collapsed wave's rows are
**pruned** to a one-line summary and the Burn-down cumulative count is bumped
(see Legend; ADR 0023). All numbered waves (W1–W5) are closed: W5 is collapsed with
full rows retained (newest wave); W1–W4 are pruned to one-line summaries.

| # | Issue | Wave | Status | Owner | Skill(s) | Deps | Notes |
| - | ----- | ---- | ------ | ----- | -------- | ---- | ----- |
| 207 | Realign lobotomized overrides to CC 2.1.172 (driver-check) | — | Done | human | `release-adoption` | _211_ | Closed: opus-4-8 anchors match pristine 2.1.173; driver-check fault traced to tf apply-ordering (#230), not this premise |
| 230 | tweakcc-fixed apply-ordering collisions block driver-check at 2.1.173 | — | Backlog | human | `release-adoption` | _228_ | Leaf finding (tf): shadow collisions block driver-check; draft PR skrabe/tweakcc-fixed#9 — awaiting skrabe |
| 228 | Pristine strings-file extractor breaks on all current CC versions | — | Done | agent | `/tdd` | — | Gate-blocking: npm tarball dropped cli.js → source pristine strings from native binary via adapter seam (#229) |
| 234 | release-detector cron fails: Support matrix from `claude --version` on a runner with no CC | — | Done | agent | `/tdd` | — | Cron never succeeded (no CC on runner → empty version); fix = install-free hybrid support-matrix.ts (#235) |
| 99 | 💡 Idea Inbox | — | Tracking | human | — | — | Standing Meta intake for both repos (ADR 0009); drained ideas filed + registered here. First actioned → #102 |
| bench#7 | Rotate NPM_TOKEN before it expires (~2026-09-08) | — | Blocked | human | — | — | `dividedby/bench` — rotate the @dividedby/bench-core publish token before ~2026-09-08 (time-gated ops) |

<details>
<summary>Closed wave W5 — get ahead of the release curve (verification & evidence layer) — 7 issues Done (#210–#216; full rows retained, newest wave)</summary>

| # | Issue | Wave | Status | Owner | Skill(s) | Deps | Notes |
| - | ----- | ---- | ------ | ----- | -------- | ---- | ----- |
| 210 | Build the orphan / leading-identifier report producer in tweakcc-maint (TF#8 redirect) | W5 | Done | agent | `/tdd` | — | Already-satisfied: producer in `main` (PR #124/#43, refined #174); skrabe declined it into the leaf (tf#8, ADR 0007) |
| 211 | Enforce pristine extraction in the realign/anchor-diagnosis flow | W5 | Done | agent | `/tdd` | — | Phase 0. Merged (#217): pristine `npm pack` extract + patched-source guard; fixes the contamination class. Unblocks #213 |
| 212 | Tighten release-detector cadence so new CC versions surface within hours | W5 | Done | agent | `/tdd` | — | Phase 1. Merged (#222): cron daily→every-4h; propose-only, npm-compare only. Unblocks #213, #216 |
| 213 | Auto-attach pristine realign anchor-candidate diff to adopt proposals | W5 | Done | agent | `/tdd` | _211_, _212_ | Phase 1. Merged (#224): pure `buildAnchorCandidateDiff` over two pristine JSONs → additive proposal comment |
| 214 | Stand up Behavioral A/B prove-value run on `@dividedby/bench-core` for adoptions | W5 | Done | agent | `/tdd` | — | Phase 2. Merged (#223): per-version `ProveValueResult` from `BehavioralVerdict` + persisted artifact; no new `claude -p` |
| 215 | Standardize Adoption record + prove-value as leaf-PR evidence body | W5 | Done | agent | `/tdd` | _214_ | Phase 2. Merged (#225): pure `renderLeafPrEvidence` composes the standard leaf-PR body; prepares, opens no PR |
| 216 | Bake the alignment preflight into automation: snapshot skrabe's current state | W5 | Done | agent | `/tdd` | _212_, _213_ | Merged (#226): `gatherAlignmentSnapshot` reads his current state behind seams + flags redundant candidates pre-PR |

</details>

<details>
<summary>Closed waves W1 + W2 + W3 + W4 + cross-cutting — 75 issues Done (pruned to one-line wave summaries)</summary>

Pruned to a one-line summary per wave (ADR 0023): W5 is the newest wholly-closed
wave (full rows retained above), so every *older* closed wave — W1–W4 + cross-cutting
— is pruned here and the Burn-down **Closed (cumulative)** integer carries the all-time
total. Rows are not lost: closed issues persist on GitHub and old rows in git history.

- **W1** — 2.1.169 adoption + 2.1.168 orphan/boot correctness — wholly closed
  (#26 #31 #42 #43 #45 #46 #58).
- **W2** — verdict-signal trust (triage decisions) — wholly closed (#41 #47 #62).
- **W3** — Behavioral A/B benchmark runnable (provisioning) — wholly closed
  (#175–#180 #192).
- **W4** — auto-adopt pipeline (detect → propose → auto-gate) — wholly closed
  (#196–#200).
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
- **Wave** — priority ordering, read top wave first; the `—` / `Meta` pseudo-waves
  hold cross-cutting and standing rows.
- **Status** — `Next` (do now) · `Backlog` (ready, unstarted) · `Blocked`
  (waiting on a dep/hold) · `Parked` (deferred/needs-design/wontfix) · `Tracking`
  (epic/PRD parent or standing intake) · `Done` (closed). A single token from this
  set; deep context lives on the linked issue, not the cell (ADR 0025).
- **Owner** — `agent` · `human` · `mixed`.
- **Deps** — blocking issues; _italic_ = already closed (satisfied).
- **Notes** — one-line roadmap-only sequencing guidance (≤120 chars; ADR 0025).
  Scope/AC live in the issue (body + comments), not here.
- **Cells are thin pointers (ADR 0025).** Notes/Status cells are a single ≤120-char
  line and Status is a single Legend token; the linked issue holds the narrative.
  `roadmap-guard` denies an over-cap or multi-line cell in-branch.
- **Closed-wave collapse + prune (ADR 0023).** A wholly-closed wave is wrapped in a
  collapsed `<details><summary>Closed wave W# — theme</summary>`; once a *newer* wave
  is active it is **pruned** to a one-line summary and the Burn-down cumulative count
  is bumped. The census is an **execution view**, not the archive — GitHub + git
  history are the archive. Open waves and the active census never collapse.
- **Closed (cumulative)** — a running integer of all-time closed issues, bumped on
  each prune so the total survives row deletion (not recomputable once rows are pruned).
- **Burn-down buckets** — a projection of the census onto the `Owner` + `Status` +
  label vocabulary, recomputed every reconcile: **Ready (agent)** (`ready-for-agent`,
  loop-eligible) · **Ready (human / HITL)** (`ready-for-human`) · **Blocked /
  deferred** (`Blocked`/`Parked`) · **Tracking** (epic/PRD parents) · **Meta**
  (idea-inbox / onboarding).
