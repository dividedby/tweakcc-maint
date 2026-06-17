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

---

## Concrete leaf-PR candidates (honest, alignment-gated)

- **No version-adoption PR is worth preparing.** Both leaves are at 2.1.179; the
  catch-up race is one we already lost twice (`tf#10`/`tf#11`).
- **LC1 — leanness artifact for an `lcc` override set** *(retargeted; #315).* A
  deterministic stock-vs-lobo **always-on prompt-size delta** (per model:
  per-prompt + per-category token/char reduction, the always-on subset matching
  the README's six categories — harness, communication, doing-tasks,
  executing-actions, memory, core tools), reported as a structured artifact that
  substantiates skrabe's ~30% claim. Pair with the **non-regression guardrail**
  (powered Behavioral A/B: the leaner prompt regresses no correctness). Re-run the
  preflight at proposal time; surface as a **draft PR with an intent ping**
  (cockpit: prepare, don't impose). *Needs A6 (the leanness tool).*
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

1. **A6 — leanness tool** (the new deciding artifact) → **LC1** leanness draft PR.
2. **B2** (#307) config-dir resolution — Restore-drill correctness bug.
3. **A3** (#306) provisioning preflight — diagnostic so a setup miss ≠ a bad verdict.
4. **C2** (#310) seam tests — guard release-detection + preflight.
5. **C3** (#311), **B3** (#308) — hardening + transport.
6. **D1–D3** (#312–#314) — docs reconciliation (incl. the v2 wording sweep).

## Known unknowns

- Which exact prompt ids constitute the README's "always-on" six categories — no
  manifest exists; A6 must derive it from the id taxonomy and validate the total
  against skrabe's ~30% to confirm we matched his definition.
- Whether the leanness artifact clears skrabe's review bar as a *contribution*
  (vs a restatement of his README) — re-preflight + intent-ping before proposing.
- Whether any uncovered helper gap (LC2) actually exists — only further work reveals it.
