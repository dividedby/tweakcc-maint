# 0008 — The Behavioral A/B uses an all-Claude, persona-varied judge panel

Status: Accepted (2026-06-10)

## Context

The **Behavioral A/B benchmark** ([ADR 0002](./0002-vs-vanilla-measures-targeted-behavior.md))
needs an LLM judge to score paired **stock CC** vs **lobotomized-CC** outputs on the
four **behavioral axes**. The textbook way to mitigate single-judge bias and
self-preference is a *multi-vendor* panel (a Claude judge scoring Claude outputs is
the canonical self-preference trap). We have Claude-only access, so a multi-vendor
panel is off the table.

## Decision

Use a **Judge panel** of three Claude judge-agents on one model tier (Opus), spawned
as fresh-context sub-agents, differing by grader **persona** — strict literalist,
devil's-advocate, holistic reviewer — scoring **blind** (variant labels hidden) with
**order randomized** per pair, then **z-score-normalized** per judge and averaged.

The self-preference objection does not apply here: **both arms of the A/B are Claude**
(same model, only the overrides differ). A judge's "favor my own family" bias therefore
lands equally on both arms — it is a constant that **cancels** in a paired comparison.
The bias that does *not* cancel is **persona-preference**: a judge favoring the stock
default tone because it matches its own trained politeness. That is controlled by
**rubric-anchored** scoring (concrete, countable per-axis criteria, not holistic
preference) plus the blind framing — not by judge-vendor diversity.

The remaining weakness of an all-Claude panel is **correlated errors** (three Claude
judges share failure modes). Persona variation is the decorrelation lever we have
without vendor diversity.

## Considered options

- **Multi-vendor panel.** The default choice; rejected — no non-Claude access.
- **Single Claude judge.** Simplest/cheapest; rejected — no cross-judge agreement or
  variance signal.
- **Claude inside a mixed panel.** Moot without other vendors.
- **Vary model tier instead of persona** (Opus/Sonnet/Haiku). A valid decorrelation
  lever; rejected for v1 in favor of persona variation (capability-tier differences
  conflate "disagrees" with "weaker judge").

## Consequences

- This is an **evidence track, not a gate** ([ADR 0002](./0002-vs-vanilla-measures-targeted-behavior.md)),
  so the residual bias risk is acceptable — the **Four-zeros bar** remains the only gate.
- If non-Claude access ever lands, revisit: a multi-vendor panel would strictly
  decorrelate better, and this ADR would be superseded.
- The panel's persona prompts and the rubric are maintained artifacts that must track
  the **Lobotomy**'s intent as it evolves.
