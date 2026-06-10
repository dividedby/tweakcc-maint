# Design Plan: Behavioral A/B benchmark (stock vs lobotomized-CC)

> Status: approved
> Created: 2026-06-10
> Epic: #134 (PRD) · roadmap parent #11

## Context

The fork claims the `lobotomized-claude-code` overrides make Claude Code measurably *better* — more direct, less sycophantic, less hedging, fewer unsolicited offers — yet nothing proves it and the Adoption record's Behavioral A/B field is never populated. This feature is the value-proving track (ADR 0002): a paired, order-randomized comparison of stock CC vs lobotomized-CC at the same version/model/effort/prompt, scored by an LLM-judge panel on the four behavioral axes the Lobotomy targets, with a Correctness guardrail. It produces evidence, never a gate.

## Domain Vocabulary Used

Terms from CONTEXT.md this plan relies on (not redefined here):

- **Behavioral A/B benchmark** — the stock-vs-lobotomized head-to-head on the same conditions, judged on targeted behavior.
- **Lobotomy** — the override set's intent: strip sycophancy/hedging/unsolicited-offers/verbosity toward terse directness.
- **Stock CC / lobotomized-CC** — the two binaries compared.
- **Correctness guardrail** — the assertion that task correctness did not regress.
- **Adoption record** — carries the Behavioral A/B field this benchmark fills.
- **Four-zeros bar** — the actual gate; this benchmark is explicitly *not* a gate.

## Module Map

| Module | Responsibility | Interface (operations) | Seams |
|---|---|---|---|
| ABDriver | Orchestrate one benchmark run: pairing → randomization → score → aggregate → guardrail → write verdict | run(fixtures) → Behavioral A/B verdict | JudgePort, VariantRunner, CorrectnessChecker, Adoption record |
| BehavioralAggregation | Combine multi-judge scores into a normalized per-axis verdict with disagreement + significance | aggregate(scores) → verdict + flags | (pure; reuses bench `normalize`/`groupByCell`) |
| BehavioralRubric + BaitFixtures | The four-axis criteria + bait fixtures + per-fixture correctness checks | rubric criteria; fixture set; deterministic check(fixture, output) → pass/fail | CorrectnessChecker (judge fallback) |

## Seams

| Seam | What crosses it | Adapter in tests | Adapter in prod |
|---|---|---|---|
| JudgePort | Score a pairing on the four axes | StubJudge (deterministic per-axis scores; supports disagreement + guardrail-fail inputs) | RealJudgePanel (3 persona-varied Opus sub-agents, blind + order-randomized) |
| VariantRunner | Produce a variant's output for a fixture | FakeVariantRunner (canned outputs; supports stock-pass/lobo-fail correctness inputs) | RealVariantRunner (two version-pinned installs via bench `executeRun`) |
| CorrectnessChecker | Decide pass/fail for an output | deterministic check + StubJudge fallback for open-ended fixtures | deterministic check + RealJudgePanel correctness fallback |
| Adoption record | Persist the Behavioral A/B verdict | existing fake adoption environment | existing real adoption environment |

## Invariants and Contracts

- The benchmark is **evidence, not a gate** — a run never blocks an adoption (the Four-zeros bar is the only gate).
- The judge sits **behind a stubbable port** — pairing/randomization/aggregation/guardrail are unit-tested with no real model call.
- Both arms run at the **same version, model, effort, and prompt** — the only difference is which `cli.js` (stock vs lobotomized).
- Scoring is **blind** (no variant labels to the judge) and **order-randomized** per pair (kills position bias).
- Family self-preference cancels (both arms are Claude); residual persona-preference is handled by rubric-anchoring + blind framing.
- The guardrail fails iff the lobotomized arm fails a correctness check the stock arm passed.

## Testing Strategy

| Module | Test entry point | Test level | Fake strategy |
|---|---|---|---|
| ABDriver | run(fixtures) with injected ports + seeded RNG | Unit | StubJudge + FakeVariantRunner |
| BehavioralAggregation | aggregate(scores) | Unit | none (pure; real inputs) |
| BehavioralRubric + BaitFixtures | each fixture's deterministic check | Unit | StubJudge for the open-ended fallback path |
| Real adapters | adapter contract conformance | Unit (canned/recorded) | no live call in CI |
| Live A/B run | the on-demand run path | On-demand only | real panel + real installs; never in CI |

## Issue Index

| Issue | Module | One-line description |
|---|---|---|
| #135 | ABDriver | Tracer bullet: paired run end-to-end on stub ports, trivial-mean aggregation |
| #139 | BehavioralAggregation | z-score normalize + disagreement + variance/significance (reuses bench) |
| #136 | bench-core (leaf) | Refactor run/judge/aggregate/cost into importable primitives + publish package |
| #137 | BehavioralRubric + BaitFixtures | Four-axis rubric + bait fixtures + deterministic correctness checks |
| #138 | RealJudgePanel + RealVariantRunner | Real adapters + correctness judge fallback + live wiring → Adoption record |

## Open Questions

- [ ] Public npm vs private GitHub Packages for the published bench package. (blocks #136)
- [ ] Disagreement threshold + significance noise-floor values — concrete numbers. (refines #139; settle during implementation)
