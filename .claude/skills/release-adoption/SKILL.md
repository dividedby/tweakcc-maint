---
name: release-adoption
description: Walk a maintainer through the verify-and-measure pass for a newly-shipped Claude Code version — dispatch the Integration gate as our own trust instrument, measure leanness (#328) + anti-laziness (#331), and prepare only surgical/measurement draft PRs (never a version-adoption PR). Use when a new CC version ships and the fork must be verified and proven, or when an "adopt CC X.Y.Z" proposal issue is picked up.
---

# Release adoption

Drives the recurring **Release adoption** (CONTEXT.md): verifying and measuring the
fork against a newly-shipped Claude Code version. skrabe ships CC versions the same day
they land on npm — a version-adoption PR is never the contribution. This skill verifies
his state and measures what he can't.

## The guardrail — read first

This repo (`tweakcc-maint`) is the **control plane** / contributor cockpit. The leaf
repos (`tweakcc-fixed`, `lobotomized-claude-code`) are owned by a *separate* maintainer
(`skrabe`).

- **NEVER author a version-adoption PR** ("Prompts for \<ver\>", full-set realign,
  patcher bump). He ships versions same-day; racing him is the exact failure mode
  that produced closed/contaminated drafts (lcc#9, tweakcc-fixed#8).
- **NEVER direct-push, merge, or otherwise mutate a leaf.** All changes land via a
  draft PR from your fork branch — with a cockpit **intent ping** in the body.
- **Re-preflight before every PR.** Verify his current leaf HEAD before opening
  any draft; a stale premise is how redundant drafts get closed.
- The **Verification gate** is our own trust instrument (not a step that produces a
  PR). A green **Four-zeros bar** is evidence we attach to PRs; it is not itself a
  leaf change.
- If any step seems to need a direct leaf mutation outside a PR, STOP and surface it.

## When to invoke this skill

- A new CC version appears on npm (`npm view @anthropic-ai/claude-code version` ticks).
- An "adopt CC X.Y.Z" proposal issue is picked up from the tracker.
- A periodic verify-and-measure sweep is requested.

## The verify-and-measure sequence

All detail — phase-by-phase instructions, CLI commands, PR bodies — lives in
[`references/adopt-flow.md`](references/adopt-flow.md). This section is the overview.

### Phase 1 — Preflight alignment check

Four parallel reads: latest CC version on npm, skrabe's leaf state (tweakcc-fixed +
lcc commits + open/closed PRs), adoption records on disk. Compose the version ×
`skrabeAdopted` × `ourFlowComplete` table (ADR 0010). Decide whether there is anything
new to verify; clean-exit if already handled.

`skrabeAdopted` is **always live-checked, never cached** (ADR 0010 invariant). The
two-path fork (Full adoption vs. Verify-and-improve) no longer applies: skrabe ships
same-day, so every real run is verify-and-measure on his already-shipped state.

### Phase 2 — Gate: dispatch and watch

Dispatch `integration-gate.yml` for the new CC version and watch CI. The gate is the
**Integration gate** (CONTEXT.md): real `--apply` → **Boot-verify** → **Orphan-variable**
validation → **Four-zeros bar** across the **Support matrix**, bracketed by the **Restore
drill**. It emits the **Adoption record**.

The gate confirms skrabe's shipped state is correct against our bar. It does not author
a PR. A non-zero exit or `pass: false` is a **blocking failure** — diagnose and report
before proceeding.

### Phase 3 — Measure: leanness + anti-laziness + non-regression

The deciding artifacts are the two things we can measure that he cannot generate himself:

1. **Leanness report (primary, deciding):** always-on prompt-size delta — stock CC vs
   lobotomized-CC per-prompt + per-category. This is the objective, deterministic
   prove-value artifact (A6 / #328, ~27% leaner at 2.1.179). ADR 0012 records it as the
   headline; the Behavioral A/B is the backstop, not the headline.

2. **Anti-laziness delta (behavioral, secondary):** the **Behavioral A/B benchmark**
   with anti-laziness **behavior-bait fixtures** (#331 / ADR 0012). The first metered
   run (n=5, 2.1.179) returned `provesValue: false` — it is **recorded but NOT surfaced
   to skrabe** unless a higher-power re-run is commissioned. Do not present a null result.

3. **Behavioral A/B as non-regression guardrail:** run the powered bench as a
   correctness check on the new version — a failing **Correctness guardrail** blocks the
   lcc PR. This is the only mandatory Behavioral A/B run; proving value is secondary.

### Phase 4 — Prepare surgical draft PRs (cockpit-first)

Only after the gate is green and Phase 3 is complete. Contributions are narrow:

- **tweakcc-fixed:** a test for a silent-corruption class the gate surfaced, OR a
  surgical correctness fix for a specific anchor miss / mis-bind. **Never** a version-
  adoption PR.
- **lcc:** a surgical mis-bind / vocab fix the gate proved, OR a leanness + non-
  regression **measurement artifact** he can't generate. **Never** a full-set realign.

Every PR is a **draft** with a cockpit **intent ping** in the body. skrabe has Issues
DISABLED — draft PRs are the only surface channel. Never suggest filing an issue to him.

## Execution model

Local-first ([ADR 0003](../../../docs/adr/0003-gate-runs-local-first-then-github-hosted-ci.md)):
a human runs this on the Mac or the VPS. CI runs the Integration gate
([ADR 0006](../../../docs/adr/0006-github-hosted-ci-runs-the-integration-gate.md)).

The **Verification gate** splits by altitude ([ADR 0001](../../../docs/adr/0001-verification-gate-split-by-altitude.md)):
leaf checks (unit + golden-snapshot tests) live in the leaf repos; the **Integration
gate** is owned here. Do not reimplement either altitude's checks in this skill.

## Gearbox routing notes

- Phase 1 reads: run on the lead or a Bash-capable tier (T1+). T0 scouts have no Bash.
- Gate dispatch + PR authoring: T2 minimum — involves CI watch loop and leaf PR
  authoring with an intent ping; do not delegate below T2.
- Re-verify surprising or empty subagent results directly at the orchestrator level
  before proceeding.
