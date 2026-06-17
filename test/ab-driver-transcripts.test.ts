/**
 * Tests for Fix 2: guardrail regression transcript capture in ab-driver.ts.
 * Verifies that when stock passes and lobotomized fails, the first failing trial's
 * transcript is captured (right fixtureId, both outputs, deduped to first trial).
 */

import { describe, it, expect } from 'vitest';
import { runBenchmark } from '../src/ab-driver.js';
import type { BaitFixture } from '../src/ab-driver.js';
import { StubJudge } from '../src/stub-judge.js';
import { FakeVariantRunner } from '../src/fake-variant-runner.js';
import { SeededRng } from '../src/seeded-rng.js';
import { panelOf } from '../src/judge-panel-port.js';

function fixture(id: string): BaitFixture {
  return { id, prompt: `prompt for ${id}` };
}

function runnerFor(fixtures: BaitFixture[]): FakeVariantRunner {
  const r = new FakeVariantRunner();
  for (const f of fixtures) {
    r.setOutput(f.id, 'stock', `${f.id}:stock`);
    r.setOutput(f.id, 'lobotomized', `${f.id}:lobo`);
  }
  return r;
}

describe('guardrailRegressionTranscripts', () => {
  it('captures the transcript when lobo fails and stock passes', async () => {
    const fixtures = [fixture('f1'), fixture('f2')];
    // stock always passes; lobo fails only on f2.
    const correctnessCheck = (_id: string, output: string) => output !== 'f2:lobo';

    const verdict = await runBenchmark({
      fixtures,
      runner: runnerFor(fixtures),
      judge: panelOf(new StubJudge()),
      correctnessCheck,
      rng: new SeededRng(1),
    });

    expect(verdict.guardrail).toBe('failed');
    expect(verdict.guardrailRegressions).toContain('f2');
    expect(verdict.guardrailRegressionTranscripts).toHaveLength(1);

    const t = verdict.guardrailRegressionTranscripts![0]!;
    expect(t.fixtureId).toBe('f2');
    expect(t.stockOutput).toBe('f2:stock');
    expect(t.lobotomizedOutput).toBe('f2:lobo');
    expect(t.trial).toBe(0);
  });

  it('captures transcripts for multiple regressed fixtures', async () => {
    const fixtures = [fixture('f1'), fixture('f2'), fixture('f3')];
    // stock always passes; lobo fails on f1 and f3.
    const correctnessCheck = (_id: string, output: string) =>
      output !== 'f1:lobo' && output !== 'f3:lobo';

    const verdict = await runBenchmark({
      fixtures,
      runner: runnerFor(fixtures),
      judge: panelOf(new StubJudge()),
      correctnessCheck,
      rng: new SeededRng(1),
    });

    expect(verdict.guardrailRegressions).toHaveLength(2);
    expect(verdict.guardrailRegressionTranscripts).toHaveLength(2);
    const ids = verdict.guardrailRegressionTranscripts!.map((t) => t.fixtureId);
    expect(ids).toContain('f1');
    expect(ids).toContain('f3');
  });

  it('dedupes to the FIRST failing trial when trials > 1 and f2 only regresses on trial 0', async () => {
    const fixtures = [fixture('f1'), fixture('f2')];
    let f2LoboCount = 0;
    // f2 lobo fails only on trial 0 (first check), passes on subsequent trials.
    const correctnessCheck = (_id: string, output: string): boolean => {
      if (output === 'f2:lobo') {
        f2LoboCount++;
        return f2LoboCount !== 1; // fail on first call only
      }
      return true;
    };

    const verdict = await runBenchmark({
      fixtures,
      runner: runnerFor(fixtures),
      judge: panelOf(new StubJudge()),
      correctnessCheck,
      rng: new SeededRng(1),
      trials: 3,
    });

    // The fixture appears once despite 3 trials.
    expect(verdict.guardrailRegressions).toEqual(['f2']);
    expect(verdict.guardrailRegressionTranscripts).toHaveLength(1);

    const t = verdict.guardrailRegressionTranscripts![0]!;
    expect(t.fixtureId).toBe('f2');
    expect(t.trial).toBe(0); // first (trial=0) failure captured
    expect(t.stockOutput).toBe('f2:stock');
    expect(t.lobotomizedOutput).toBe('f2:lobo');
  });

  it('is empty when the guardrail passed', async () => {
    const fixtures = [fixture('f1')];
    const verdict = await runBenchmark({
      fixtures,
      runner: runnerFor(fixtures),
      judge: panelOf(new StubJudge()),
      correctnessCheck: () => true,
      rng: new SeededRng(1),
    });

    expect(verdict.guardrail).toBe('passed');
    expect(verdict.guardrailRegressionTranscripts).toEqual([]);
  });

  it('is empty when both arms fail (no regression introduced by the Lobotomy)', async () => {
    const fixtures = [fixture('f1')];
    const verdict = await runBenchmark({
      fixtures,
      runner: runnerFor(fixtures),
      judge: panelOf(new StubJudge()),
      correctnessCheck: () => false,
      rng: new SeededRng(1),
    });

    expect(verdict.guardrail).toBe('passed');
    expect(verdict.guardrailRegressionTranscripts).toEqual([]);
  });

  it('captures full outputs without truncation', async () => {
    const longOutput = 'x'.repeat(5000);
    const fixtures = [fixture('fx')];
    const runner = new FakeVariantRunner();
    runner.setOutput('fx', 'stock', longOutput);
    runner.setOutput('fx', 'lobotomized', 'short lobo output');

    const verdict = await runBenchmark({
      fixtures,
      runner,
      judge: panelOf(new StubJudge()),
      correctnessCheck: (_id, output) => output === longOutput, // stock passes, lobo fails
      rng: new SeededRng(1),
    });

    expect(verdict.guardrailRegressionTranscripts).toHaveLength(1);
    const t = verdict.guardrailRegressionTranscripts![0]!;
    expect(t.stockOutput).toHaveLength(5000);
    expect(t.lobotomizedOutput).toBe('short lobo output');
  });
});
