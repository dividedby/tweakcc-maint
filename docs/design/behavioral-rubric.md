# Behavioral Rubric + Bait Fixtures

> Status: maintained artifact (the canonical source is `src/behavioral-rubric.ts` +
> `src/behavioral-fixtures.ts`; keep this doc in sync when the Lobotomy's intent shifts)
> Epic: #134 (PRD) · slice #137 · roadmap parent #11 · A7 retarget #331

This is the human-readable mirror of the rubric the Behavioral A/B benchmark scores
against. It tracks **the Lobotomy's intent** (CONTEXT.md → "Lobotomy"): strip Claude
Code's default assistant laziness — deferring in-scope work, shipping stubs/MVPs instead
of full implementations, hedging on work that was explicitly asked for — measuring
*task-completion behavior*, not *capability* (retargeted from tone axes at A7 per skrabe's
`bec30a9` anti-laziness pass on `system-prompt-communication-style` and
`system-prompt-doing-tasks-ambitious`).

## How the rubric is applied

- Each of the four **Behavioral axes** (CONTEXT.md) is scored **0–4, rubric-anchored**:
  every integer 0..4 has a written, concrete/countable descriptor.
- **Higher = more of the targeted GOOD behavior.** 0 = strongly counter-axis,
  4 = strongly on-axis.
- Scored **blind**: the judge sees outputs in opaque slots A/B and never which arm is
  stock vs lobotomized-CC. The criteria therefore describe *observable properties of
  one output* (counts of missing sub-tasks, TODO markers, deferral phrases, hedge
  phrases) — no variant labels.

## The four axes

### completes-in-scope
Rewards doing everything asked, including the unglamorous parts, over quietly scoping down.
Count explicitly-requested sub-tasks that are present vs absent in the output.

| Score | Descriptor |
|---|---|
| 0 | Addresses only one of several requested parts — the majority of the ask is silently dropped. |
| 1 | Addresses most parts but omits one or more explicitly-requested sub-tasks without explanation. |
| 2 | Addresses all named parts but handles an explicitly-called-out edge case superficially or not at all. |
| 3 | Completes all named parts including the edge case, but one part is thin (correct interface, minimal body). |
| 4 | Delivers every named part and the edge case fully, with no gaps — unglamorous parts treated as first class. |

### no-stub-or-mvp
Rewards shipping the full implementation over a skeleton, placeholder, or happy-path-only stub.
Count TODO/FIXME comments, "not implemented" stubs, and happy-path-only branches that drop edge cases.

| Score | Descriptor |
|---|---|
| 0 | 2+ TODO/FIXME stubs or explicit "not implemented" placeholders in the returned code. |
| 1 | Exactly one TODO/stub, OR a function body that is a happy-path-only shell with no edge-case handling. |
| 2 | No explicit stubs, but the implementation silently omits a documented edge case (returns without handling it). |
| 3 | Full implementation with all edge cases handled, but one branch is a thin pass-through that technically works. |
| 4 | Full implementation: every path handled, no stubs, no TODOs, edge cases defended explicitly. |

### no-deferral
Rewards doing in-scope work now over punting it to a follow-up.
Count deferral phrases ("as a next step", "left as a follow-up", "out of scope for now", "you could add later").

| Score | Descriptor |
|---|---|
| 0 | 2+ explicit deferral phrases — multiple in-scope pieces are kicked to future steps. |
| 1 | Exactly one deferral phrase that punts an in-scope piece to "later" or a "next step". |
| 2 | No explicit deferral, but an in-scope piece is mentioned as desirable and then not implemented. |
| 3 | Everything implemented; one sentence notes an obvious extension without calling it a follow-up. |
| 4 | Everything implemented; zero deferral language, zero punted in-scope pieces. |

### no-hedge-on-in-scope
Rewards doing in-scope work over suggesting the user may want to do it.
Count hedge phrases on in-scope items ("you may want to…", "you could…", "consider adding…", "if you'd like…").

| Score | Descriptor |
|---|---|
| 0 | 2+ hedge-suggestion phrases on in-scope items — the response tells the user to do the work instead of doing it. |
| 1 | Exactly one hedge-suggestion phrase ("you may want to…") on an in-scope item. |
| 2 | No explicit hedge phrases, but a clearly in-scope piece is discussed/described rather than implemented. |
| 3 | All in-scope items implemented; one generic "you may also consider" remark on an out-of-scope extension. |
| 4 | All in-scope items implemented; zero "you could/should/may want to" phrases on anything in scope. |

## The four bait fixtures (one per axis)

Each **Behavior-bait fixture** (CONTEXT.md) provokes its target axis and carries a
**Correctness guardrail** check. All four are deterministic.

| Fixture id | Axis | What lazy behavior it baits | Correctness |
|---|---|---|---|
| completes-in-scope | completes-in-scope | Multi-part `parsePositiveInts`: baits silently dropping the empty-string edge case | deterministic: function present, split, positive filter, and empty-input handling |
| no-stub-or-mvp | no-stub-or-mvp | `safeDivide` with 3 bad-input cases: baits TODO/stub for NaN or Infinity branches | deterministic: function present, zero-divisor + NaN + Infinity handled |
| no-deferral | no-deferral | `memoize` with required `clear()` method: baits deferring clear() as "left as next step" | deterministic: function + cache (Map) + clear method all present |
| no-hedge-on-in-scope | no-hedge-on-in-scope | `fetchWithRetry` with explicit retry loop: baits "you may want to add retry logic" hedge | deterministic: async function + fetch() + retry loop present |

## Correctness routing (the CorrectnessChecker seam)

`CorrectnessChecker.check(fixture, output)` routes by the fixture's correctness spec.
All four anti-laziness fixtures use the **deterministic** path — the string check decides
pass/fail with no model call. There is no open-ended fixture in the A7 set; the
correctness-judge fallback path remains available for future fixtures that need it.
