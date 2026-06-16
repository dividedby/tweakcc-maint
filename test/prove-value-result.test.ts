import { describe, it, expect } from 'vitest';
import { buildProveValueResult, renderProveValueResult } from '../src/prove-value-result.js';
import type { BehavioralVerdict } from '../src/ab-driver.js';
import type { BehavioralAggregationVerdict } from '../src/behavioral-aggregation.js';
import { BEHAVIORAL_AXES } from '../src/judge-port.js';
import type { BehavioralAxis } from '../src/judge-port.js';

/** An aggregation verdict where each axis carries the given (delta, significant). */
function aggregationOf(per: Partial<Record<BehavioralAxis, { stockZ: number; loboZ: number; significant: boolean; disagreement?: boolean }>>): BehavioralAggregationVerdict {
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
    degenerate: false,
    omissions: { panelPersonas: [], correctnessFixtures: [] },
    ...overrides,
  };
}

describe('buildProveValueResult', () => {
  it('keys the result to the adopted CC version and carries the run date + pairing count', () => {
    const result = buildProveValueResult('2.1.172', verdictOf(), '2026-06-11T00:00:00.000Z');
    expect(result.ccVersion).toBe('2.1.172');
    expect(result.date).toBe('2026-06-11T00:00:00.000Z');
    expect(result.pairings).toBe(4);
  });

  it('emits a per-axis lobotomized−stock delta and significance for every behavioral axis', () => {
    const aggregation = aggregationOf({
      'anti-sycophancy': { stockZ: -0.8, loboZ: 0.9, significant: true },
      'anti-hedging': { stockZ: 0.1, loboZ: 0.2, significant: false },
    });
    const result = buildProveValueResult('2.1.172', verdictOf({ aggregation }), '2026-06-11T00:00:00.000Z');
    expect(new Set(result.axes.map((a) => a.axis))).toEqual(new Set(BEHAVIORAL_AXES));
    const syco = result.axes.find((a) => a.axis === 'anti-sycophancy')!;
    expect(syco.delta).toBeCloseTo(1.7, 5);
    expect(syco.significant).toBe(true);
    const hedge = result.axes.find((a) => a.axis === 'anti-hedging')!;
    expect(hedge.significant).toBe(false);
  });

  it('carries the Correctness-guardrail outcome and its regressions', () => {
    const result = buildProveValueResult(
      '2.1.172',
      verdictOf({ guardrail: 'failed', guardrailRegressions: ['fixture-x'] }),
      '2026-06-11T00:00:00.000Z',
    );
    expect(result.guardrail).toBe('failed');
    expect(result.guardrailRegressions).toEqual(['fixture-x']);
  });

  it('counts a result as proving value only when at least one axis is a significant lobotomized win and the guardrail passed', () => {
    const winning = buildProveValueResult(
      '2.1.172',
      verdictOf({ aggregation: aggregationOf({ 'terse-directness': { stockZ: -1, loboZ: 1, significant: true } }) }),
      'd',
    );
    expect(winning.provesValue).toBe(true);

    const noSignificant = buildProveValueResult('2.1.172', verdictOf({ aggregation: aggregationOf({}) }), 'd');
    expect(noSignificant.provesValue).toBe(false);

    // A significant axis but a guardrail regression does not prove value (more-direct-but-wrong).
    const guardrailFailed = buildProveValueResult(
      '2.1.172',
      verdictOf({
        guardrail: 'failed',
        guardrailRegressions: ['fx'],
        aggregation: aggregationOf({ 'terse-directness': { stockZ: -1, loboZ: 1, significant: true } }),
      }),
      'd',
    );
    expect(guardrailFailed.provesValue).toBe(false);
  });

  it('flags a degenerate run (both arms identical) as not proving value regardless of scores', () => {
    const result = buildProveValueResult(
      '2.1.172',
      verdictOf({ degenerate: true, aggregation: aggregationOf({ 'terse-directness': { stockZ: -1, loboZ: 1, significant: true } }) }),
      'd',
    );
    expect(result.degenerate).toBe(true);
    expect(result.provesValue).toBe(false);
  });

  it('is a pure transform that does not mutate the verdict', () => {
    const verdict = verdictOf();
    const before = JSON.stringify(verdict);
    buildProveValueResult('2.1.172', verdict, 'd');
    expect(JSON.stringify(verdict)).toBe(before);
  });
});

describe('renderProveValueResult', () => {
  it('renders a leaf-PR-ready evidence block naming the version, verdict, and each significant axis', () => {
    const result = buildProveValueResult(
      '2.1.172',
      verdictOf({ aggregation: aggregationOf({ 'anti-sycophancy': { stockZ: -1, loboZ: 1, significant: true } }) }),
      '2026-06-11T00:00:00.000Z',
    );
    const md = renderProveValueResult(result);
    expect(md).toContain('2.1.172');
    expect(md).toContain('anti-sycophancy');
    // Names the evidence track, not a gate verdict.
    expect(md.toLowerCase()).toContain('prove');
  });
});
