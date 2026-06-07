# 0002 — The vs-vanilla benchmark measures targeted behavior, not generic task success

Status: Accepted (2026-06-07)

## Context

The fork makes a value claim: the `lobotomized-claude-code` overrides make Claude
Code *better* than stock. We want to prove it. `~/repos/bench` already exists, but
it measures something different — a `model × effort` cost/quality matrix for the
daily-driver *skills*, varying a single binary. It has no notion of comparing
prompt-override variants.

The trap: the obvious reading of "prove it's better" is a generic task-success
benchmark. But the **Lobotomy** targets *behavior* (directness, anti-sycophancy,
anti-hedging, fewer unsolicited offers), not *capability*. A generic task-success
benchmark would measure a dimension the overrides never claimed to move, likely
show ~no difference (or a slight regression from a shorter, blunter persona), and
falsely "disprove" the claim.

## Decision

The **Behavioral A/B benchmark** compares **stock CC** vs **lobotomized-CC** —
same version, same model, same effort, same prompt — and:

- scores each output on the **behavioral axes the Lobotomy targets**, via an LLM
  judge, with paired outputs in randomized order to kill position bias;
- applies a **Correctness guardrail** asserting task correctness didn't regress;
- declares the claim proven when the Lobotomy wins on behavioral axes at no
  significant correctness cost.

**Home (hybrid):** the generic run/judge/aggregate *mechanics* are reused from
`~/repos/bench` as primitives (a small leaf refactor in bench to expose them as a
library, not just CLI scripts). The tweakcc-specific **fixtures** (behavior-bait
prompts), the **behavioral rubric**, and the **A/B driver** live in
`tweakcc-maint`, because they encode what "lobotomized" *means* — fork-specific
domain content, not general benchmark plumbing.

## Alternatives considered

- **Generic task-success benchmark.** Rejected: measures the wrong dimension;
  would under-credit or falsely refute a behavior-only claim.
- **Behavior axes only, no correctness guardrail.** Rejected: can't distinguish
  "more direct" from "more direct but wrong"; the guardrail is cheap insurance
  against shipping a persona that degrades correctness.
- **Build a fresh A/B harness in `tweakcc-maint`.** Rejected: duplicates bench's
  run/judge/aggregate and invites two drifting harnesses.
- **Put fixtures + rubric in bench too.** Rejected: the behavior-bait fixtures and
  anti-sycophancy rubric are fork domain content; housing them in the general
  skills-benchmark repo dilutes its purpose and scatters the domain model.

## Consequences

- bench gains a "binary variant" axis conceptually and must expose its
  run/judge primitives for reuse — tracked as *leaf* work in bench.
- This benchmark is a **value-proving track, not a gate**. It never blocks a
  release adoption; it produces evidence. (Contrast the **Verification gate**'s
  **Four-zeros bar**, which does block — [ADR 0001](./0001-verification-gate-split-by-altitude.md).)
- The behavioral rubric is itself a maintained artifact: as the Lobotomy's intent
  evolves, the axes and bait fixtures must track it.
