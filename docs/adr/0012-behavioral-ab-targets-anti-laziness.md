# 0012 — The Behavioral A/B benchmark targets anti-laziness, not tone

Status: Accepted (2026-06-16)

## Context

[ADR 0002](./0002-vs-vanilla-measures-targeted-behavior.md) established that the
Behavioral A/B benchmark measures the **behavioral axes the Lobotomy targets**, and
foresaw that "as the Lobotomy's intent evolves, the axes and bait fixtures must track
it" (0002 → Consequences).

The original four axes were tone — anti-sycophancy, anti-hedging,
fewer-unsolicited-offers, terse-directness. A metered run returned **~0 signal** on
them: the `opus-4-8` overrides are ~95% agentic/tooling prompts that are dormant on a
single conversational turn, so a one-shot bench cannot move those axes. Meanwhile
skrabe's current `lobotomized-claude-code` focus is **anti-laziness**: his `bec30a9`
pass rewrote the two main-conversational prompts (`system-prompt-communication-style`,
`system-prompt-doing-tasks-ambitious`) with directives that DO fire on a normal turn
(don't defer in-scope work, don't ship a quiet MVP/stub, don't hedge in-scope work as
a suggestion).

## Decision

Retarget the Behavioral A/B benchmark from the four tone axes to four **anti-laziness /
task-completion** axes: **completes-in-scope, no-stub-or-mvp, no-deferral,
no-hedge-on-in-scope**. The behavior-bait fixtures become small, multi-part task
prompts that create real opportunity to defer / stub / hedge in-scope work; each keeps
a deterministic **Correctness guardrail**.

**Leanness, not behavior, is the primary prove-value artifact.** The objective,
deterministic leanness report (A6 / #328 — always-on prompt-size delta, ~27% leaner)
is what maps onto `lcc`'s own stated value without redundancy. The Behavioral A/B is
the **non-regression backstop**, not the headline.

## Evidence / outcome

The first metered anti-laziness run (`opus-4-8`, 2.1.179, trials=5, 20 pairings,
$6.07) returned **`provesValue: false`**: no significant delta on any axis, with judge
disagreement throughout. The lone Correctness-guardrail flag was a deterministic-check
recursion false-negative (now fixed and made auditable by persisting the failing
pairing's transcript), not a real lcc regression. **Conclusion: anti-laziness is not a
demonstrable single-turn value-prop at n=5 — it is recorded but NOT surfaced to skrabe;
leanness stays primary.**

## Alternatives considered

- **Keep the tone axes.** Rejected: they return ~0 because the prompts that shape them
  are dormant on a single turn; the bench would keep "disproving" a claim it can't test.
- **A full agentic eval of the sub-agent prompts.** Rejected (ponytail-filtered
  non-goal): out of proportion to the prove-value track; a single-turn bench is the
  right altitude, and anti-laziness is the one main-prompt axis it can reach.
- **Surface the anti-laziness delta anyway.** Rejected: it is null at n=5; surfacing an
  unproven claim to skrabe violates the cockpit's prepare-don't-impose posture.

## Consequences

- The glossary terms **Behavioral axis** and **Behavior-bait fixture** (CONTEXT.md) now
  name the anti-laziness axes; ADR 0002 stays as the historical record of the
  vs-vanilla decision.
- The Correctness guardrail persists the failing pairing's transcript, so a regression
  is auditable from the artifact rather than requiring a re-run.
- LC1 (#315) composes the leanness artifact + the non-regression guardrail; the
  anti-laziness delta is recorded, not presented, unless a higher-power re-run is
  commissioned.
