import { describe, it, expect } from 'vitest';
import { runBenchmark, attachBehavioralVerdict } from '../src/ab-driver.js';
import type { BaitFixture } from '../src/ab-driver.js';
import { StubJudge } from '../src/stub-judge.js';
import { FakeVariantRunner } from '../src/fake-variant-runner.js';
import { SeededRng } from '../src/seeded-rng.js';
import type { AdoptionRecord } from '../src/integration-gate.js';

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
      judge,
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
    await runBenchmark({ fixtures, runner: runnerFor(fixtures), judge: judgeA, correctnessCheck: allPass, rng: new SeededRng(42) });

    const judgeB = new StubJudge();
    await runBenchmark({ fixtures, runner: runnerFor(fixtures), judge: judgeB, correctnessCheck: allPass, rng: new SeededRng(42) });

    const firstOutputs = (j: StubJudge) => j.captured.map((c) => c.outputs[0]);
    // Reproducible: same seed → identical presentation order across runs.
    expect(firstOutputs(judgeA)).toEqual(firstOutputs(judgeB));

    // Randomized: with 5 fixtures, the stock arm is not always shown first.
    const stockFirst = firstOutputs(judgeA).filter((o) => o.endsWith(':stock')).length;
    expect(stockFirst).toBeGreaterThan(0);
    expect(stockFirst).toBeLessThan(5);

    // A different seed produces a different order (not a constant).
    const judgeC = new StubJudge();
    await runBenchmark({ fixtures, runner: runnerFor(fixtures), judge: judgeC, correctnessCheck: allPass, rng: new SeededRng(7) });
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
      judge,
      correctnessCheck: allPass,
      rng: new SeededRng(1),
    });

    // Trivial per-axis mean across fixtures, per arm: stock (2+4)/2=3, lobo (8+6)/2=7.
    for (const axis of ['anti-sycophancy', 'anti-hedging', 'fewer-unsolicited-offers', 'terse-directness'] as const) {
      expect(verdict.axisMeans[axis].stock).toBe(3);
      expect(verdict.axisMeans[axis].lobotomized).toBe(7);
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
      judge,
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
      judge,
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
      judge,
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
      judge,
      correctnessCheck: allPass,
      rng: new SeededRng(1),
    });
    expect(verdict.pairings).toBe(1);
    expect(judge.captured).toHaveLength(1);
  });

  it('handles an empty fixture set without throwing', async () => {
    const judge = new StubJudge();
    const verdict = await runBenchmark({
      fixtures: [],
      runner: new FakeVariantRunner(),
      judge,
      correctnessCheck: allPass,
      rng: new SeededRng(1),
    });
    expect(verdict.pairings).toBe(0);
    expect(verdict.guardrail).toBe('passed');
    expect(verdict.axisMeans['anti-sycophancy'].stock).toBe(0);
  });
});
