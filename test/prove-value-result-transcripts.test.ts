/**
 * Tests for Fix 2: guardrailRegressionTranscripts landing in the emitted ProveValueResult.
 * Verifies the transcripts are threaded through buildProveValueResult and that the existing
 * keys are unchanged when there is no regression (backward compat).
 */

import { describe, it, expect } from 'vitest';
import { buildProveValueResult } from '../src/prove-value-result.js';
import type { BehavioralVerdict } from '../src/ab-driver.js';
import type { BehavioralAggregationVerdict } from '../src/behavioral-aggregation.js';
import { BEHAVIORAL_AXES } from '../src/judge-port.js';
import type { BehavioralAxis } from '../src/judge-port.js';

function aggregationOf(
  per: Partial<Record<BehavioralAxis, { stockZ: number; loboZ: number; significant: boolean; disagreement?: boolean }>>,
): BehavioralAggregationVerdict {
  const axes = {} as BehavioralAggregationVerdict['axes'];
  for (const axis of BEHAVIORAL_AXES) {
    const a = per[axis] ?? { stockZ: 0, loboZ: 0, significant: false };
    axes[axis] = {
      stock: { meanZ: a.stockZ, normZ: a.stockZ, trialStd: 0, nTrials: 2, noisy: false },
      lobotomized: { meanZ: a.loboZ, normZ: a.loboZ, trialStd: 0, nTrials: 2, noisy: false },
      disagreement: a.disagreement ?? false,
      significant: a.significant,
    };
  }
  return { axes };
}

function verdictOf(overrides: Partial<BehavioralVerdict> = {}): BehavioralVerdict {
  const axisMeans = {} as BehavioralVerdict['axisMeans'];
  for (const axis of BEHAVIORAL_AXES) axisMeans[axis] = { stock: 1, lobotomized: 3 };
  return {
    pairings: 4,
    axisMeans,
    aggregation: aggregationOf({}),
    guardrail: 'passed',
    guardrailRegressions: [],
    guardrailRegressionTranscripts: [],
    degenerate: false,
    omissions: { panelPersonas: [], correctnessFixtures: [] },
    ...overrides,
  };
}

describe('buildProveValueResult — guardrailRegressionTranscripts', () => {
  it('threads transcripts from the verdict into the result', () => {
    const transcript = {
      fixtureId: 'no-hedge-on-in-scope',
      trial: 0,
      stockOutput: 'stock output text',
      lobotomizedOutput: 'lobo output text',
    };
    const verdict = verdictOf({
      guardrail: 'failed',
      guardrailRegressions: ['no-hedge-on-in-scope'],
      guardrailRegressionTranscripts: [transcript],
    });

    const result = buildProveValueResult('2.1.172', verdict, '2026-06-16T00:00:00.000Z');

    expect(result.guardrailRegressionTranscripts).toHaveLength(1);
    const t = result.guardrailRegressionTranscripts![0]!;
    expect(t.fixtureId).toBe('no-hedge-on-in-scope');
    expect(t.trial).toBe(0);
    expect(t.stockOutput).toBe('stock output text');
    expect(t.lobotomizedOutput).toBe('lobo output text');
  });

  it('emits an empty array when there are no regressions (guardrail passed)', () => {
    const result = buildProveValueResult('2.1.172', verdictOf(), '2026-06-16T00:00:00.000Z');

    expect(result.guardrailRegressionTranscripts).toEqual([]);
  });

  it('existing keys are present and unchanged when there is no regression', () => {
    const result = buildProveValueResult('2.1.172', verdictOf(), '2026-06-16T00:00:00.000Z');

    // All pre-existing keys must still be present.
    expect(result).toHaveProperty('ccVersion', '2.1.172');
    expect(result).toHaveProperty('date', '2026-06-16T00:00:00.000Z');
    expect(result).toHaveProperty('pairings', 4);
    expect(result).toHaveProperty('axes');
    expect(result).toHaveProperty('guardrail', 'passed');
    expect(result).toHaveProperty('guardrailRegressions');
    expect(result).toHaveProperty('degenerate', false);
    expect(result).toHaveProperty('provesValue');
    expect(result).toHaveProperty('omissions');
  });

  it('the result is a copy — mutating the transcript array does not affect the verdict', () => {
    const transcript = {
      fixtureId: 'fx',
      trial: 0,
      stockOutput: 'stock',
      lobotomizedOutput: 'lobo',
    };
    const verdict = verdictOf({
      guardrail: 'failed',
      guardrailRegressions: ['fx'],
      guardrailRegressionTranscripts: [transcript],
    });

    const result = buildProveValueResult('2.1.172', verdict, 'd');
    // Mutate the result's copy.
    result.guardrailRegressionTranscripts![0]!.stockOutput = 'mutated';

    // The original verdict is unchanged.
    expect(verdict.guardrailRegressionTranscripts![0]!.stockOutput).toBe('stock');
  });

  it('handles a verdict with no guardrailRegressionTranscripts field (backward compat)', () => {
    // Simulate an older verdict without the field.
    const oldVerdict = verdictOf();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (oldVerdict as any).guardrailRegressionTranscripts;

    const result = buildProveValueResult('2.1.172', oldVerdict, 'd');

    // Must not throw; result should have an empty array.
    expect(result.guardrailRegressionTranscripts).toEqual([]);
  });

  it('transcripts appear in the JSON-serialized form of the result', () => {
    const transcript = {
      fixtureId: 'no-hedge-on-in-scope',
      trial: 1,
      stockOutput: 'correct impl',
      lobotomizedOutput: 'hedge text',
    };
    const verdict = verdictOf({
      guardrail: 'failed',
      guardrailRegressions: ['no-hedge-on-in-scope'],
      guardrailRegressionTranscripts: [transcript],
    });

    const result = buildProveValueResult('2.1.172', verdict, '2026-06-16T00:00:00.000Z');
    const json = JSON.stringify(result);
    const parsed = JSON.parse(json) as typeof result;

    expect(parsed.guardrailRegressionTranscripts).toHaveLength(1);
    expect(parsed.guardrailRegressionTranscripts![0]!.lobotomizedOutput).toBe('hedge text');
  });
});
