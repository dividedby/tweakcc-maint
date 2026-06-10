/**
 * ABDriver — orchestrate one Behavioral A/B benchmark run end-to-end (CONTEXT.md →
 * "Behavioral A/B benchmark"; design doc → Module Map). For each Behavior-bait
 * fixture it: runs both arms via the VariantRunner, forms exactly one
 * stock+lobotomized pairing, presents that pairing to the JudgePort in a
 * seed-randomized blind order, runs the Correctness guardrail, then aggregates the
 * per-axis scores into a {@link BehavioralVerdict} written to the Adoption record.
 *
 * It is EVIDENCE, not a gate (CONTEXT.md; design doc → Invariants): a run never
 * blocks an adoption and never throws as a gate — a guardrail breach is recorded as
 * an outcome, not raised. The judge sits behind a stubbable port, so pairing,
 * randomization, the guardrail, and aggregation are unit-tested with no real model.
 *
 * SCOPE: the driver collects each pairing's per-axis scores and folds them through
 * {@link aggregate} (#139, BehavioralAggregation) for the normalized per-axis verdict
 * (z-score normalize + disagreement + variance/significance via bench primitives). The
 * raw trivial per-axis mean (#135) is retained alongside as a cheap raw summary. The
 * Judge sits behind {@link JudgePanelPort} (#138): each fixture is scored by EVERY panel
 * persona, so aggregation sees `judges>1` per cell — real disagreement/variance, not a
 * degenerate single-judge z.
 */

import { BEHAVIORAL_AXES } from './judge-port.js';
import type { AxisScores, BehavioralAxis, PresentedOutput } from './judge-port.js';
import type { JudgePanelPort } from './judge-panel-port.js';
import { JUDGE_PERSONAS } from './judge-panel-port.js';
import type { Variant, VariantRunner } from './variant-runner.js';
import type { Rng } from './seeded-rng.js';
import type { AdoptionRecord } from './integration-gate.js';
import { aggregate } from './behavioral-aggregation.js';
import type { BehavioralAggregationVerdict, MultiJudgeScore } from './behavioral-aggregation.js';

/** A Behavior-bait fixture: an id plus the prompt fed identically to both arms. */
export interface BaitFixture {
  id: string;
  prompt: string;
}

/**
 * Decide pass/fail for one arm's output on one fixture (CONTEXT.md → "Correctness
 * guardrail"). May be async: the #138 open-ended fallback routes to a correctness judge
 * (a model call), while deterministic fixtures and test stubs stay synchronous.
 */
export type CorrectnessCheck = (fixtureId: string, output: string) => boolean | Promise<boolean>;

/** The Correctness guardrail's outcome — the benchmark records it, never raises it. */
export type GuardrailOutcome = 'passed' | 'failed';

/** A per-axis pair of arm means (trivial mean across fixtures, per #135 scope). */
export type AxisMeanPair = Record<BehavioralAxis, { stock: number; lobotomized: number }>;

/**
 * The Behavioral A/B verdict written to the Adoption record. Evidence for the fork's
 * claims, not a pass/fail gate. Carries the normalized per-axis {@link aggregation}
 * (z-scores + disagreement + variance/significance, #139) plus the raw trivial per-axis
 * mean as a cheap secondary summary, and the Correctness-guardrail outcome.
 */
export interface BehavioralVerdict {
  /** Number of stock+lobotomized pairings scored (one per fixture). */
  pairings: number;
  /** Raw trivial per-axis mean per arm across all fixtures (secondary to {@link aggregation}). */
  axisMeans: AxisMeanPair;
  /** Normalized per-axis verdict: z-scores + disagreement + variance/significance (#139). */
  aggregation: BehavioralAggregationVerdict;
  /** Whether the Lobotomy regressed any correctness the stock arm held. */
  guardrail: GuardrailOutcome;
  /** Fixture ids where the lobotomized arm failed a check the stock arm passed. */
  guardrailRegressions: string[];
}

export interface BenchmarkRun {
  fixtures: readonly BaitFixture[];
  runner: VariantRunner;
  judge: JudgePanelPort;
  correctnessCheck: CorrectnessCheck;
  rng: Rng;
}

const VARIANTS: readonly Variant[] = ['stock', 'lobotomized'];

function zeroAxes(): AxisScores {
  return {
    'anti-sycophancy': 0,
    'anti-hedging': 0,
    'fewer-unsolicited-offers': 0,
    'terse-directness': 0,
  };
}

function emptyAxisMeans(): AxisMeanPair {
  const means = {} as AxisMeanPair;
  for (const axis of BEHAVIORAL_AXES) means[axis] = { stock: 0, lobotomized: 0 };
  return means;
}

/**
 * Run one benchmark: pair → randomize → score → guardrail → aggregate. Returns a
 * {@link BehavioralVerdict} and never throws as a gate.
 */
export async function runBenchmark(run: BenchmarkRun): Promise<BehavioralVerdict> {
  const { fixtures, runner, judge, correctnessCheck, rng } = run;

  // Per-axis running totals per arm (folded into a trivial mean at the end).
  const totals: Record<Variant, AxisScores> = { stock: zeroAxes(), lobotomized: zeroAxes() };
  // Raw per-arm, per-fixture scores collected for the normalized aggregation (#139).
  const judgeScores: MultiJudgeScore[] = [];
  const guardrailRegressions: string[] = [];
  // Per-arm count of (fixture × persona) scores folded into the trivial mean.
  let personaScoreCount = 0;

  for (const fixture of fixtures) {
    const outputs = {} as Record<Variant, string>;
    for (const variant of VARIANTS) {
      const out = await runner.run(fixture.id, fixture.prompt, variant);
      outputs[variant] = out.output;
    }

    // Correctness guardrail: a regression is lobotomized failing where stock passed.
    const stockPassed = await correctnessCheck(fixture.id, outputs.stock);
    const lobotomizedPassed = await correctnessCheck(fixture.id, outputs.lobotomized);
    if (stockPassed && !lobotomizedPassed) guardrailRegressions.push(fixture.id);

    // Present the pairing blind and order-randomized (kills position bias).
    const stockFirst = rng.bool();
    const stockSlot: 'A' | 'B' = stockFirst ? 'A' : 'B';
    const lobotomizedSlot: 'A' | 'B' = stockFirst ? 'B' : 'A';
    const stockPresented: PresentedOutput = { position: stockSlot, output: outputs.stock };
    const lobotomizedPresented: PresentedOutput = { position: lobotomizedSlot, output: outputs.lobotomized };
    const [first, second] = stockFirst
      ? [stockPresented, lobotomizedPresented]
      : [lobotomizedPresented, stockPresented];

    // The whole panel scores this pairing; each persona is a distinct judge in aggregation.
    const panel = await judge.scorePanel(fixture.id, first, second);
    panel.forEach((scores, i) => {
      // Label each persona by its panel-order slot; a 1-element panel (panelOf) is persona 0.
      const persona = JUDGE_PERSONAS[i] ?? `persona-${i}`;
      const stockScores = scores[stockSlot];
      const lobotomizedScores = scores[lobotomizedSlot];
      for (const axis of BEHAVIORAL_AXES) {
        totals.stock[axis] += stockScores[axis];
        totals.lobotomized[axis] += lobotomizedScores[axis];
      }
      judgeScores.push(
        { fixtureId: fixture.id, variant: 'stock', judge: persona, axisScores: stockScores },
        { fixtureId: fixture.id, variant: 'lobotomized', judge: persona, axisScores: lobotomizedScores },
      );
      personaScoreCount += 1;
    });
  }

  const n = fixtures.length;
  const axisMeans = emptyAxisMeans();
  // Trivial mean is per arm across every (fixture × persona) score, so a 3-persona panel
  // and a 1-persona panel both yield a per-axis mean on the same 0–4 scale.
  if (personaScoreCount > 0) {
    for (const axis of BEHAVIORAL_AXES) {
      axisMeans[axis] = {
        stock: totals.stock[axis] / personaScoreCount,
        lobotomized: totals.lobotomized[axis] / personaScoreCount,
      };
    }
  }

  return {
    pairings: n,
    axisMeans,
    aggregation: aggregate(judgeScores),
    guardrail: guardrailRegressions.length === 0 ? 'passed' : 'failed',
    guardrailRegressions,
  };
}

/**
 * Attach a Behavioral A/B verdict to an Adoption record. Pure: returns a new record,
 * leaving the input untouched. The verdict is evidence — it is never folded into the
 * record's `pass` (the Four-zeros bar is the only gate).
 */
export function attachBehavioralVerdict(record: AdoptionRecord, verdict: BehavioralVerdict): AdoptionRecord {
  return { ...record, behavioralAB: verdict };
}
