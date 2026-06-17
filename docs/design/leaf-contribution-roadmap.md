# Leaf-contribution roadmap (v2 — leanness reframe, 2026-06-16)

Output of a directed `repo-audit` pass, **revised after the prove-value
experiment** (the first end-to-end Behavioral A/B run). Lens: **what limits this
control plane's ability to prepare verified, accepted PRs into the two skrabe
leaves** (`tweakcc-fixed`, `lobotomized-claude-code`) — not generic repo health.

> **v2 changed the prove-value thesis.** v1 assumed a *Behavioral A/B* (does an
> override measurably change Claude's conversational behavior vs stock?) was the
> deciding evidence. Running it proved that instrument is **mismatched to what the
> leaves actually deliver.** See "What the experiment established" below. The
> deciding artifact for `lcc` is now a **leanness report**; the Behavioral A/B is
> demoted to a **non-regression guardrail**.

## Strategic frame — stop racing, prove the *right* thing

Alignment preflight (verified directly against leaf `origin/main`):

| | leaf HEAD | our state |
|---|---|---|
| `tweakcc-fixed` | `5183f6b` — CLI **2.0.4**, CC **2.1.179** deep support | gate runs any dispatched `cc_version` |
| `lobotomized-claude-code` | `bec30a9` — opus-4-8 anti-laziness pass, **2.1.179** | behavioral infra validated @ 2.1.178 |

skrabe ships version-adoption faster than we can, solo, and owns the repos. A
faster adoption pipeline is **not a meaningful contribution** — it's a race we
lose (CONTEXT/ADR 0007). Meaningful contribution = the work he does *not* do
himself. The two leaves deliver **orthogonal** value, and we must measure each on
its own axis — not force both through one bench:

- **`tweakcc-fixed` = the mechanism.** Its README frames value as *mechanical
  robustness*: the **four-zeros bar** (smoke · apply-hygiene · no-orphan-overrides
  · no-latent-var-breakage), version currency, extraction fidelity, patch
  correctness across minified CC shapes. **No behavioral value to measure.** We
  help it via the integration gate + verified correctness/tooling PRs. A
  behavioral bench was never the right instrument for it.
- **`lcc` = the content.** Its README headline is **leanness**, not tone: it
  "cuts the bulk and rewrites the load-bearing parts in a register the model
  actually behaves better in" — **~30% leaner always-on** (Fable ~40%; ~36% across
  all behavior-shaping prompts; 39 prompts removed entirely), "shaped against the
  model's system card, not by taste." Its two success axes are **(1) leanness**
  (less always-on → faster first response, more headroom before compaction, less
  drift from contradictory rules) and **(2) behavioral non-regression** vs the
  model's system card ("without losing anything the model relies on").

This roadmap therefore weights a **leanness prove-value artifact (Epic A)** and
**verification correctness (Epic B)**. The adoption pipeline matters as a
*verification instrument we can trust*, not as a speed play.

---

## What the prove-value experiment established (2026-06-16) — don't re-litigate

The Behavioral A/B path was built, metered, powered, and run end-to-end against
the `opus-4-8` set @ CC 2.1.178. Findings (durable):

1. **The bench works.** Provisioning holds on a credentialed runner; the powered
   run (20 pairings, $5.20) graded a full panel with zero deferrals and emitted a
   correct cost-ledger line. The infra is sound and reusable.
2. **It returned `provesValue=false` — correctly, but on the wrong question.** All
   four conversational-tone axes showed ~0 delta (powered, not underpowered).
3. **Root cause is an instrument mismatch, not a fixture-content gap.** The
   `opus-4-8` set is ~95% **agentic/tooling** (43 `agent-prompt-*`, 100
   `tool-description-*`, 72 `skill-*`, 48 `inline-*`, ~33 of 97 `system-prompt-*`
   are agent/loop/memory-specific). A **single conversational turn never fires**
   most of it. And the value the README claims is **leanness/efficiency**, which a
   tone A/B cannot see *regardless of fixtures*. Only **2** main-conversational
   files changed in his latest pass, and those govern *multi-step task completion*,
   not single-turn style.
4. **Therefore:** the Behavioral A/B is a **non-regression guardrail** (does the
   leaner prompt regress correctness?), **not** the value-delta. The value-delta is
   the **leanness metric** — objective, deterministic, no judges, no model calls,
   immune to the firing mismatch, and a structured comparative form of skrabe's own
   ~30% claim that he does not publish.

## What skrabe actually values (his recent commits, 2026-06-16) — the contribution filter

Mined from ~40 recent commits on each leaf `origin/main`. Use this to decide what to *prepare*, not just what's green:

- **`tweakcc-fixed` — correctness, proven, not speed.** His bar is the **four-zeros** (`CNF=0`, `K9 mis-bind=0`, `parse-fail=0`), **apply round-trip safety** (the 2.0.4 headline, `d613ae7`), **byte-diff patched-vs-pristine** silent-corruption catches, and `auditMisbinds`. He ships version support **same-day** (`5183f6b` 2.0.4/2.1.179 today; 2.1.178 one day after release) — **racing him is pointless.** Merged dividedby PRs: **test coverage of a corruption class** (`test/broaden-leaf-coverage`) and **surgical correctness fixes** (`fix/skip-unresolved-placeholder-prompts`).
- **`lcc` — leanness + anti-laziness, curated solo.** Realigns and the **anti-laziness pass** (`bec30a9`) are his design call; he reworks rather than accept full-set copies. Merged dividedby PRs: **surgical mis-bind/vocab fixes only** (`fix/realign-agent-usage-croncreate-26`, `fix/realign-overrides-26`).
- **What helps (vs races):** for `tweakcc-fixed` — a **test catching a silent-corruption class** or a **surgical correctness fix** the gate surfaced; for `lcc` — a **surgical mis-bind/vocab fix** or a **measurement he can't generate** (leanness #328, anti-laziness #331). **Never** a version-adoption PR or a full-set realign.

This is why `/adopt` is being overhauled (Epic E): the command was built to *author version bumps* — the one thing he never needs from us.

---

## Epic A — Prove-value produces attachable, reproducible evidence

Tracker: **#316**. The behavioral run path is delivered and validated; the pivot
is to make **leanness** the primary artifact and keep the bench as a guardrail.

| id | item | status | evidence / notes |
|---|---|---|---|
| **A1** | Judge panel + correctness judge **degrade-to-partial** | ✅ done (#304) | precondition for any complete run; verified on the live run (zero deferrals) |
| **A2** | **Evidence-rendering CLI** (`renderLeafPrEvidence` → file) | ✅ done (#305) | `leaf-pr-evidence-cli.ts` |
| **A3** | `provisionVariants` **preflight/diagnostic** | open (#306) | the runner failed opaquely on a missing prompt-data-cache; a real preflight is still wanted |
| **A4** | **Bench powered** — multi-trial + SE-based significance | ✅ done (#315d) | `BEHAVIORAL_AB_TRIALS`; significance = noise-floor AND ≥2·SE |
| **A5** | **Metered dispatch** — `behavioral-ab.yml` + bench-core `0.3.0` cost sink + ledger onboarding | ✅ done (#315b/c) | runs the bench on a credentialed runner; cost in the agent-research ledger |
| **A6** | **Leanness report tool** — always-on prompt-size delta (stock vs lobo) per model | **NEW — primary (#328)** | the deciding artifact; see #328 and "Leaf-PR candidates" |
| **A7** | **Anti-laziness fixtures** — retarget the bench to task-completion (no-defer / no-stub / no-hedge-on-in-scope) | **NEW (#331)** | the one behavioral axis that maps to skrabe's *current* lcc focus (his `bec30a9` anti-laziness pass) and fires on the main prompt; complements A6 |

**Leaf-bar mapping:** A6's leanness artifact is the contribution that maps onto
`lcc`'s *own* stated value without redundancy — skrabe asserts ~30% leaner but
ships no structured stock-vs-lobo comparison. The Behavioral A/B (A1/A4/A5)
backstops it as a non-regression guardrail: the leaner prompt must not regress
correctness.

## Epic B — Verification correctness (trust our own gate)

Tracker: **#317**.

| id | item | status | evidence |
|---|---|---|---|
| **B1** | Reconcile the two orphan-detection channels (#302) | ✅ done (#302) | root cause = lossy CI native-extract clobbering the committed prompts JSON; fixed (prefer committed + coverage tripwire) |
| **B2** | `RealAdoptionEnvironment` honor `tweakcc-fixed` config-dir resolution | open (#307) | false missing-backup in the Restore drill |
| **B3** | `adoption-history-cli` — serialize history as PR evidence | open (#308) | `adoption-history.ts` (no CLI) |

## Epic C — Test & CI hardening

Tracker: **#318**.

| id | item | status | evidence |
|---|---|---|---|
| **C1** | `timeout-minutes` on the three workflows | ✅ done (#309) | |
| **C2** | Test the prod network/CLI seams (npm HTTP, `gh`) | open (#310) | |
| **C3** | Structural-validation tests for bench inputs | open (#311) | behavioral-fixtures / persona-prompts / seeded-rng |

## Epic D — Docs reconciliation

Tracker: **#319**. Open: **#312** (stale closed-issue refs), **#313** (runbook vs
ADR 0005), **#314** (Piebald/upstream mentions). Add to D's sweep: this reframe —
purge "Behavioral A/B is the deciding prove-value evidence" wording wherever it
reads as current (it's now the guardrail, not the headline).

## Epic E — `/adopt` overhaul (verify-and-measure, not version-adopt)

Tracker: **#330**. The `/adopt` command + `release-adoption` skill encode a
**version-adoption** pipeline (extract → realign → "Prompts for <ver>" PR) — the
one thing skrabe never needs from us (he ships versions same-day). Overhaul it to
the v2 framework:

- **Verify** the gate/four-zeros as our *own* trust instrument; on a version he
  already shipped, the gate confirms his state — it does not author a PR.
- **Measure** what he can't: the **leanness report (#328)** + the **anti-laziness
  delta (#331)**, with the Behavioral A/B as the non-regression guardrail.
- **Prepare only what he merges** (cockpit draft PR + intent ping + re-preflight):
  for `tweakcc-fixed`, a corruption-class **test** or a **surgical correctness
  fix**; for `lcc`, a **surgical mis-bind/vocab fix** or a **measurement artifact**.
  Never a version-adoption or full-set-realign PR.
- **Collapse the duplication:** `.claude/commands/adopt.md` (743 lines) and
  `.claude/skills/release-adoption/SKILL.md` (143 lines) are two independent homes
  for one procedure (they will drift). Consolidate to one — the skill as the single
  source (SKILL.md + REFERENCE.md), `/adopt` a thin invoker; reconcile
  `docs/design/adopt-command.md` + ADR 0010.

---

## Concrete leaf-PR candidates (honest, alignment-gated)

- **No version-adoption PR is worth preparing.** Both leaves are at 2.1.179; the
  catch-up race is one we already lost twice (`tf#10`/`tf#11`).
- **LC1 — leanness artifact for an `lcc` override set** *(retargeted; #315).* A
  deterministic stock-vs-lobo **always-on prompt-size delta** (per model:
  per-prompt + per-category token/char reduction, the always-on subset matching
  the README's six categories — harness, communication, doing-tasks,
  executing-actions, memory, core tools), reported as a structured artifact that
  substantiates skrabe's ~30% claim. Compose with the **anti-laziness delta (A7,
  #331)** — the behavioral half that maps to his current focus — and the
  **non-regression guardrail** (powered Behavioral A/B: the leaner prompt regresses
  no correctness). Re-run the preflight at proposal time; surface as a **draft PR
  with an intent ping** (cockpit: prepare, don't impose). *Needs A6 + A7.*
- **LC2 — a version-independent helper unit.** Still held: his toolkit covers the
  obvious ones (`auditMisbinds`, Showtime, Driver — ADR 0007). Only propose if a
  genuine, uncovered gap surfaces. Flagged, not committed.

## Deliberately NOT building (ponytail filter)

| dropped | why |
|---|---|
| Auto-open leaf PRs | Violates the cockpit rule — *prepare, don't impose*. The draft PR is a deliberate human gate. |
| **A behavioral *value-delta* bench for `lcc`** | The experiment proved the instrument is mismatched; tone A/B can't see leanness/agentic value. Kept only as a non-regression guardrail. |
| **An agentic task-completion eval** | The "right" instrument for the agentic overrides, but a SWE-benchmark-scale build — beyond the cockpit's scope unless the maintainer commits to it. |
| Retry/backoff on every network call | YAGNI — add when a real flake bites. |
| Config-file-ify fixtures/personas | Unrequested abstraction; they're fine in code. |

## Sequenced priority

1. **A6 (#328) leanness tool** + **A7 (#331) anti-laziness fixtures** — the two measurement artifacts.
2. **Epic E (#330) `/adopt` overhaul** — realign the command to verify-and-measure + collapse the command/skill duplication.
3. **LC1 (#315)** — compose leanness + anti-laziness + the non-regression guardrail into the first draft leaf-PR *(needs 1)*.
4. **B2** (#307) config-dir resolution — Restore-drill correctness bug.
5. **A3** (#306) provisioning preflight — diagnostic so a setup miss ≠ a bad verdict.
6. **C2** (#310) seam tests — guard release-detection + preflight.
7. **C3** (#311), **B3** (#308) — hardening + transport.
8. **D1–D3** (#312–#314) — docs reconciliation (incl. the v2 wording sweep).

## Known unknowns

- Which exact prompt ids constitute the README's "always-on" six categories — no
  manifest exists; A6 must derive it from the id taxonomy and validate the total
  against skrabe's ~30% to confirm we matched his definition.
- Whether the leanness artifact clears skrabe's review bar as a *contribution*
  (vs a restatement of his README) — re-preflight + intent-ping before proposing.
- Whether any uncovered helper gap (LC2) actually exists — only further work reveals it.
