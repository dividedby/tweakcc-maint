import { describe, it, expect } from 'vitest';
import { runBenchmark, attachBehavioralVerdict } from '../src/ab-driver.js';
import type { BaitFixture } from '../src/ab-driver.js';
import { StubJudge } from '../src/stub-judge.js';
import { FakeVariantRunner } from '../src/fake-variant-runner.js';
import { SeededRng } from '../src/seeded-rng.js';
import type { AdoptionRecord } from '../src/integration-gate.js';
import { panelOf, JUDGE_PERSONAS } from '../src/judge-panel-port.js';
import type { JudgePanelPort, PanelResult } from '../src/judge-panel-port.js';
import type { PresentedOutput } from '../src/judge-port.js';
import { BEHAVIORAL_AXES } from '../src/judge-port.js';
import type { VariantRunner } from '../src/variant-runner.js';

/** A fixture whose stock/lobotomized outputs and correctness both pass by default. */
function fixture(id: string): BaitFixture {
  return { id, prompt: `prompt for ${id}` };
}

/** A runner with canned stock/lobotomized outputs for each given fixture. */
function runnerFor(fixtures: BaitFixture[]): FakeVariantRunner {
  const r = new FakeVariantRunner();
  for (const f of fixtures) {
    r.setOutput(f.id, 'stock', `${f.id}:stock`);
    r.setOutput(f.id, 'lobotomized', `${f.id}:lobo`);
  }
  return r;
}

/** A correctness check that passes everything. */
const allPass = () => true;

describe('ABDriver.runBenchmark', () => {
  it('forms exactly one stock+lobotomized pairing per fixture (AC1)', async () => {
    const fixtures = [fixture('f1'), fixture('f2'), fixture('f3')];
    const judge = new StubJudge();
    const verdict = await runBenchmark({
      fixtures,
      runner: runnerFor(fixtures),
      judge: panelOf(judge),
      correctnessCheck: allPass,
      rng: new SeededRng(1),
    });

    // One judge call per fixture — one pairing each, both arms present.
    expect(judge.captured).toHaveLength(3);
    expect(verdict.pairings).toBe(3);
    for (const call of judge.captured) {
      expect(new Set(call.outputs)).toEqual(new Set([`${call.fixtureId}:stock`, `${call.fixtureId}:lobo`]));
    }
  });

  it('randomizes per-pair presentation order, reproducible under the seed (AC2)', async () => {
    const fixtures = [fixture('f1'), fixture('f2'), fixture('f3'), fixture('f4'), fixture('f5')];

    const judgeA = new StubJudge();
    await runBenchmark({ fixtures, runner: runnerFor(fixtures), judge: panelOf(judgeA), correctnessCheck: allPass, rng: new SeededRng(42) });

    const judgeB = new StubJudge();
    await runBenchmark({ fixtures, runner: runnerFor(fixtures), judge: panelOf(judgeB), correctnessCheck: allPass, rng: new SeededRng(42) });

    const firstOutputs = (j: StubJudge) => j.captured.map((c) => c.outputs[0]);
    // Reproducible: same seed → identical presentation order across runs.
    expect(firstOutputs(judgeA)).toEqual(firstOutputs(judgeB));

    // Randomized: with 5 fixtures, the stock arm is not always shown first.
    const stockFirst = firstOutputs(judgeA).filter((o) => o.endsWith(':stock')).length;
    expect(stockFirst).toBeGreaterThan(0);
    expect(stockFirst).toBeLessThan(5);

    // A different seed produces a different order (not a constant).
    const judgeC = new StubJudge();
    await runBenchmark({ fixtures, runner: runnerFor(fixtures), judge: panelOf(judgeC), correctnessCheck: allPass, rng: new SeededRng(7) });
    expect(firstOutputs(judgeC)).not.toEqual(firstOutputs(judgeA));
  });

  it('writes a per-axis mean + guardrail outcome verdict (AC3)', async () => {
    const fixtures = [fixture('f1'), fixture('f2')];
    const judge = new StubJudge();
    // lobotomized outputs score higher on every axis than stock.
    judge
      .setScores('f1:stock', { 'anti-sycophancy': 2, 'anti-hedging': 2, 'fewer-unsolicited-offers': 2, 'terse-directness': 2 })
      .setScores('f2:stock', { 'anti-sycophancy': 4, 'anti-hedging': 4, 'fewer-unsolicited-offers': 4, 'terse-directness': 4 })
      .setScores('f1:lobo', { 'anti-sycophancy': 8, 'anti-hedging': 8, 'fewer-unsolicited-offers': 8, 'terse-directness': 8 })
      .setScores('f2:lobo', { 'anti-sycophancy': 6, 'anti-hedging': 6, 'fewer-unsolicited-offers': 6, 'terse-directness': 6 });

    const verdict = await runBenchmark({
      fixtures,
      runner: runnerFor(fixtures),
      judge: panelOf(judge),
      correctnessCheck: allPass,
      rng: new SeededRng(1),
    });

    // Trivial per-axis mean across fixtures, per arm: stock (2+4)/2=3, lobo (8+6)/2=7.
    for (const axis of ['anti-sycophancy', 'anti-hedging', 'fewer-unsolicited-offers', 'terse-directness'] as const) {
      expect(verdict.axisMeans[axis].stock).toBe(3);
      expect(verdict.axisMeans[axis].lobotomized).toBe(7);
    }
    // The normalized aggregation is wired (#139): lobo outscored stock on every axis,
    // so its normalized mean leads stock per axis.
    for (const axis of ['anti-sycophancy', 'anti-hedging', 'fewer-unsolicited-offers', 'terse-directness'] as const) {
      const a = verdict.aggregation.axes[axis];
      expect(a.lobotomized.meanZ).toBeGreaterThan(a.stock.meanZ);
    }
    expect(verdict.guardrail).toBe('passed');

    // Verdict is attachable to the Adoption record.
    const base: AdoptionRecord = { pass: true, versions: [], date: '2026-06-10T00:00:00.000Z' };
    const withVerdict = attachBehavioralVerdict(base, verdict);
    expect(withVerdict.behavioralAB).toBe(verdict);
    expect(base.behavioralAB).toBeUndefined(); // pure: input untouched
  });

  it('guardrail is `failed` when lobotomized fails a correctness check stock passed (AC4)', async () => {
    const fixtures = [fixture('f1'), fixture('f2')];
    const judge = new StubJudge();
    // Correctness: stock passes everything; lobotomized fails fixture f2.
    const correctnessCheck = (_fixtureId: string, output: string) => !(output === 'f2:lobo');

    const verdict = await runBenchmark({
      fixtures,
      runner: runnerFor(fixtures),
      judge: panelOf(judge),
      correctnessCheck,
      rng: new SeededRng(1),
    });

    expect(verdict.guardrail).toBe('failed');
    expect(verdict.guardrailRegressions).toContain('f2');
  });

  it('guardrail passes when lobotomized fails only where stock also failed', async () => {
    const fixtures = [fixture('f1')];
    const judge = new StubJudge();
    // Both arms fail correctness on f1 → no regression introduced by the Lobotomy.
    const correctnessCheck = () => false;

    const verdict = await runBenchmark({
      fixtures,
      runner: runnerFor(fixtures),
      judge: panelOf(judge),
      correctnessCheck,
      rng: new SeededRng(1),
    });

    expect(verdict.guardrail).toBe('passed');
    expect(verdict.guardrailRegressions).toEqual([]);
  });

  it('returns a verdict and never throws as a gate, even on a failing arm (AC5)', async () => {
    const fixtures = [fixture('f1')];
    const judge = new StubJudge();
    const correctnessCheck = (_fixtureId: string, output: string) => !(output === 'f1:lobo');

    const verdict = await runBenchmark({
      fixtures,
      runner: runnerFor(fixtures),
      judge: panelOf(judge),
      correctnessCheck,
      rng: new SeededRng(1),
    });

    // A guardrail failure is recorded as evidence, not raised as a gate.
    expect(verdict.guardrail).toBe('failed');
    expect(verdict.pairings).toBe(1);
  });

  it('handles a single fixture', async () => {
    const fixtures = [fixture('only')];
    const judge = new StubJudge();
    const verdict = await runBenchmark({
      fixtures,
      runner: runnerFor(fixtures),
      judge: panelOf(judge),
      correctnessCheck: allPass,
      rng: new SeededRng(1),
    });
    expect(verdict.pairings).toBe(1);
    expect(judge.captured).toHaveLength(1);
  });

  it('degenerate is true when both arms produce byte-identical output on every fixture (#192)', async () => {
    const fixtures = [fixture('f1'), fixture('f2')];
    const runner = new FakeVariantRunner();
    // Both arms return the SAME output — the lobotomization had no effect (stock-vs-stock).
    for (const f of fixtures) {
      runner.setOutput(f.id, 'stock', `${f.id}:same`);
      runner.setOutput(f.id, 'lobotomized', `${f.id}:same`);
    }
    const verdict = await runBenchmark({
      fixtures,
      runner,
      judge: panelOf(new StubJudge()),
      correctnessCheck: allPass,
      rng: new SeededRng(1),
    });
    expect(verdict.degenerate).toBe(true);
  });

  it('degenerate is false when the arms differ on any fixture (#192)', async () => {
    const fixtures = [fixture('f1'), fixture('f2')];
    const verdict = await runBenchmark({
      fixtures,
      runner: runnerFor(fixtures),
      judge: panelOf(new StubJudge()),
      correctnessCheck: allPass,
      rng: new SeededRng(1),
    });
    expect(verdict.degenerate).toBe(false);
  });

  it('omissions.panelPersonas carries the omitted persona when one panelist deferred (#304)', async () => {
    const omittedPersona = JUDGE_PERSONAS[0];
    const flatAxes = () => Object.fromEntries(BEHAVIORAL_AXES.map((a) => [a, 2])) as Record<(typeof BEHAVIORAL_AXES)[number], number>;
    // A panel that omits the first persona and grades with the remaining two.
    const panelWithOmission: JudgePanelPort = {
      async scorePanel(_fixtureId, _first, _second): Promise<PanelResult> {
        return {
          graded: JUDGE_PERSONAS.slice(1).map((persona) => ({
            persona,
            scores: { A: flatAxes(), B: flatAxes() },
          })),
          omitted: [omittedPersona],
        };
      },
    };

    const fixtures = [fixture('f1')];
    const verdict = await runBenchmark({
      fixtures,
      runner: runnerFor(fixtures),
      judge: panelWithOmission,
      correctnessCheck: allPass,
      rng: new SeededRng(1),
    });

    expect(verdict.omissions.panelPersonas).toContain(omittedPersona);
  });

  it('handles an empty fixture set without throwing', async () => {
    const judge = new StubJudge();
    const verdict = await runBenchmark({
      fixtures: [],
      runner: new FakeVariantRunner(),
      judge: panelOf(judge),
      correctnessCheck: allPass,
      rng: new SeededRng(1),
    });
    expect(verdict.pairings).toBe(0);
    expect(verdict.guardrail).toBe('passed');
    // No fixtures → no identical outputs to flag; an empty run is not degenerate (#192).
    expect(verdict.degenerate).toBe(false);
    expect(verdict.axisMeans['anti-sycophancy'].stock).toBe(0);
    // Aggregation is present and inert on an empty run (no significant/disagreement).
    expect(verdict.aggregation.axes['anti-sycophancy'].significant).toBe(false);
    expect(verdict.aggregation.axes['anti-sycophancy'].disagreement).toBe(false);
  });

  it('feeds a 3-persona panel to aggregation as distinct judges → judges>1 + disagreement', async () => {
    // Three StubJudges, one per persona. Across enough fixtures, persona C ranks the lobo
    // arm in the OPPOSITE order to A/B, so the lobo cells' judge rank-gap clears the
    // disagreement threshold — only possible because the panel feeds 3 distinct judges.
    const personas = JUDGE_PERSONAS.map(() => new StubJudge());
    const [pa, pb, pc] = personas as [StubJudge, StubJudge, StubJudge];
    const fixtures = [fixture('f1'), fixture('f2'), fixture('f3'), fixture('f4'), fixture('f5')];
    fixtures.forEach((f, i) => {
      // A/B: lobo score rises with i; C: lobo score falls with i → inverted ranking.
      for (const j of [pa, pb]) j.setScores(`${f.id}:lobo`, { 'anti-hedging': i });
      pc.setScores(`${f.id}:lobo`, { 'anti-hedging': 4 - i });
    });

    const panel: JudgePanelPort = {
      async scorePanel(fixtureId, first: PresentedOutput, second: PresentedOutput): Promise<PanelResult> {
        const personaScores = await Promise.all(personas.map((j) => j.score(fixtureId, first, second)));
        return {
          graded: JUDGE_PERSONAS.map((persona, i) => ({ persona, scores: personaScores[i]! })),
          omitted: [],
        };
      },
    };

    const verdict = await runBenchmark({
      fixtures,
      runner: runnerFor(fixtures),
      judge: panel,
      correctnessCheck: allPass,
      rng: new SeededRng(1),
    });

    // Each persona scored every fixture → three judges per cell drove aggregation.
    for (const j of personas) expect(j.captured).toHaveLength(5);
    expect(verdict.aggregation.axes['anti-hedging'].disagreement).toBe(true);
  });

  describe('trials knob', () => {
    /** Wraps a VariantRunner to count run() invocations. */
    function countingRunner(inner: VariantRunner): { runner: VariantRunner; runCount: () => number } {
      let n = 0;
      return {
        runner: {
          run: async (fixtureId, prompt, variant) => {
            n++;
            return inner.run(fixtureId, prompt, variant);
          },
        },
        runCount: () => n,
      };
    }

    /** Wraps a JudgePanelPort to count scorePanel() invocations. */
    function countingPanel(inner: JudgePanelPort): { panel: JudgePanelPort; panelCount: () => number } {
      let n = 0;
      return {
        panel: {
          scorePanel: async (fixtureId, first, second) => {
            n++;
            return inner.scorePanel(fixtureId, first, second);
          },
        },
        panelCount: () => n,
      };
    }

    it('trials=3: runner.run and judge.scorePanel called fixtures×3 times, pairings===fixtures×3', async () => {
      const fixtures = [fixture('f1'), fixture('f2')];
      const { runner, runCount } = countingRunner(runnerFor(fixtures));
      const { panel, panelCount } = countingPanel(panelOf(new StubJudge()));

      const verdict = await runBenchmark({
        fixtures,
        runner,
        judge: panel,
        correctnessCheck: allPass,
        rng: new SeededRng(1),
        trials: 3,
      });

      // 2 fixtures × 3 trials × 2 arms = 12 runner.run calls.
      expect(runCount()).toBe(2 * 3 * 2);
      // 2 fixtures × 3 trials = 6 scorePanel calls.
      expect(panelCount()).toBe(2 * 3);
      // pairings = fixtures.length × trials.
      expect(verdict.pairings).toBe(2 * 3);
    });

    it('trials=3: a fixture regressing on one trial appears once in guardrailRegressions', async () => {
      const fixtures = [fixture('f1'), fixture('f2')];
      let f2TrialCount = 0;

      // f2's lobotomized arm fails correctness on the first trial only.
      const selectiveCheck = (_fixtureId: string, output: string): boolean => {
        if (output === 'f2:lobo') {
          f2TrialCount++;
          return f2TrialCount !== 1; // fail on trial 0, pass on subsequent trials
        }
        return true;
      };

      const verdict = await runBenchmark({
        fixtures,
        runner: runnerFor(fixtures),
        judge: panelOf(new StubJudge()),
        correctnessCheck: selectiveCheck,
        rng: new SeededRng(1),
        trials: 3,
      });

      // The fixture appears once (deduped), even though it only regressed on trial 0.
      expect(verdict.guardrail).toBe('failed');
      expect(verdict.guardrailRegressions).toEqual(['f2']);
      expect(verdict.guardrailRegressions).toHaveLength(1);
    });

    it('trials unset: call counts and pairings match the single-trial baseline', async () => {
      const fixtures = [fixture('f1'), fixture('f2'), fixture('f3')];
      const { runner, runCount } = countingRunner(runnerFor(fixtures));
      const { panel, panelCount } = countingPanel(panelOf(new StubJudge()));

      const verdict = await runBenchmark({
        fixtures,
        runner,
        judge: panel,
        correctnessCheck: allPass,
        rng: new SeededRng(1),
        // trials not set → defaults to 1
      });

      // 3 fixtures × 1 trial × 2 arms = 6 runner.run calls.
      expect(runCount()).toBe(3 * 1 * 2);
      // 3 fixtures × 1 trial = 3 scorePanel calls.
      expect(panelCount()).toBe(3 * 1);
      expect(verdict.pairings).toBe(3);
    });
  });
});
