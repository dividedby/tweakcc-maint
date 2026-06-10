import { describe, it, expect } from 'vitest';
import {
  aggregate,
  DEFAULT_DISAGREEMENT_RANK_GAP,
  DEFAULT_SIGNIFICANCE_NOISE_FLOOR,
} from '../src/behavioral-aggregation.js';
import type { MultiJudgeScore } from '../src/behavioral-aggregation.js';
import { BEHAVIORAL_AXES } from '../src/judge-port.js';
import type { BehavioralAxis } from '../src/judge-port.js';

/** Build a one-axis-at-a-time score list, leaving the other three axes at a flat baseline. */
function scoresFor(
  axis: BehavioralAxis,
  rows: { fixtureId: string; variant: 'stock' | 'lobotomized'; judge: string; score: number }[],
): MultiJudgeScore[] {
  return rows.map((r) => ({
    fixtureId: r.fixtureId,
    variant: r.variant,
    judge: r.judge,
    axisScores: {
      'anti-sycophancy': axis === 'anti-sycophancy' ? r.score : 0,
      'anti-hedging': axis === 'anti-hedging' ? r.score : 0,
      'fewer-unsolicited-offers': axis === 'fewer-unsolicited-offers' ? r.score : 0,
      'terse-directness': axis === 'terse-directness' ? r.score : 0,
    },
  }));
}

describe('BehavioralAggregation.aggregate', () => {
  it('z-score-normalizes each judge before the per-axis mean (AC1)', () => {
    // Two judges on divergent scales score the SAME ranking of two cells:
    //   judgeWide: stock=10, lobo=90  (spread 80)
    //   judgeNarrow: stock=1, lobo=2  (spread 1)
    // A raw mean would let judgeWide dominate; z-scoring makes them count equally,
    // so both cells land at symmetric z (-1 / +1) and the per-axis arm means mirror.
    const scores = scoresFor('terse-directness', [
      { fixtureId: 'f1', variant: 'stock', judge: 'wide', score: 10 },
      { fixtureId: 'f1', variant: 'lobotomized', judge: 'wide', score: 90 },
      { fixtureId: 'f1', variant: 'stock', judge: 'narrow', score: 1 },
      { fixtureId: 'f1', variant: 'lobotomized', judge: 'narrow', score: 2 },
    ]);

    const verdict = aggregate(scores);
    const axis = verdict.axes['terse-directness'];

    // Both judges rank lobo above stock; z-scoring collapses the scale difference.
    expect(axis.stock.normZ).toBeCloseTo(-1, 6);
    expect(axis.lobotomized.normZ).toBeCloseTo(1, 6);
    // Symmetric: the raw-scale gulf did not bias the normalized verdict.
    expect(axis.lobotomized.normZ + axis.stock.normZ).toBeCloseTo(0, 6);
  });

  it('flags a judge-disagreement pair instead of silently averaging it (AC2)', () => {
    // Two arms across enough fixtures to span the rank gap. Two judges flip the order
    // on the lobo arm: one ranks it top, the other bottom → rankGap >= threshold.
    const fixtures = ['f1', 'f2', 'f3', 'f4'];
    const rows: { fixtureId: string; variant: 'stock' | 'lobotomized'; judge: string; score: number }[] = [];
    fixtures.forEach((f, i) => {
      // judgeA: lobo always best; judgeB: lobo always worst — maximal disagreement.
      rows.push({ fixtureId: f, variant: 'lobotomized', judge: 'A', score: 100 });
      rows.push({ fixtureId: f, variant: 'lobotomized', judge: 'B', score: 0 });
      rows.push({ fixtureId: f, variant: 'stock', judge: 'A', score: 50 + i });
      rows.push({ fixtureId: f, variant: 'stock', judge: 'B', score: 50 + i });
    });
    const verdict = aggregate(scoresFor('anti-hedging', rows));
    expect(verdict.axes['anti-hedging'].disagreement).toBe(true);
  });

  it('does not flag disagreement when all judges agree (edge: all-agree)', () => {
    const rows: { fixtureId: string; variant: 'stock' | 'lobotomized'; judge: string; score: number }[] = [];
    for (const f of ['f1', 'f2', 'f3', 'f4']) {
      for (const judge of ['A', 'B', 'C']) {
        rows.push({ fixtureId: f, variant: 'lobotomized', judge, score: 90 });
        rows.push({ fixtureId: f, variant: 'stock', judge, score: 10 });
      }
    }
    const verdict = aggregate(scoresFor('anti-sycophancy', rows));
    expect(verdict.axes['anti-sycophancy'].disagreement).toBe(false);
  });

  it('reports trial-to-trial variance and flags noisy cells (AC3)', () => {
    // One judge, two arms, several fixtures (= trials). The lobo arm wobbles wildly
    // trial-to-trial; the stock arm is steady. Noisy reflects normalized trial spread.
    const rows: { fixtureId: string; variant: 'stock' | 'lobotomized'; judge: string; score: number }[] = [];
    const loboScores = [100, 0, 100, 0, 100, 0];
    const stockScores = [50, 51, 50, 51, 50, 51];
    loboScores.forEach((lobo, i) => {
      rows.push({ fixtureId: `f${i}`, variant: 'lobotomized', judge: 'A', score: lobo });
      rows.push({ fixtureId: `f${i}`, variant: 'stock', judge: 'A', score: stockScores[i] as number });
    });
    const verdict = aggregate(scoresFor('terse-directness', rows));
    const axis = verdict.axes['terse-directness'];
    expect(axis.lobotomized.trialStd).toBeGreaterThan(0);
    expect(axis.lobotomized.noisy).toBe(true);
    expect(axis.stock.noisy).toBe(false);
  });

  it('reports a within-noise-floor delta as NOT significant (AC4)', () => {
    // Both arms score nearly identically across trials → normalized delta sits inside
    // the noise floor. A within-noise win must not read as real (ADR 0002).
    const rows: { fixtureId: string; variant: 'stock' | 'lobotomized'; judge: string; score: number }[] = [];
    for (let i = 0; i < 5; i++) {
      rows.push({ fixtureId: `f${i}`, variant: 'lobotomized', judge: 'A', score: 50 + (i % 2) });
      rows.push({ fixtureId: `f${i}`, variant: 'stock', judge: 'A', score: 50 + (i % 2) });
    }
    const verdict = aggregate(scoresFor('anti-hedging', rows));
    expect(verdict.axes['anti-hedging'].significant).toBe(false);
  });

  it('reports a clear, low-noise delta as significant', () => {
    const rows: { fixtureId: string; variant: 'stock' | 'lobotomized'; judge: string; score: number }[] = [];
    for (let i = 0; i < 5; i++) {
      rows.push({ fixtureId: `f${i}`, variant: 'lobotomized', judge: 'A', score: 90 + (i % 2) });
      rows.push({ fixtureId: `f${i}`, variant: 'stock', judge: 'A', score: 10 + (i % 2) });
    }
    const verdict = aggregate(scoresFor('anti-sycophancy', rows));
    const axis = verdict.axes['anti-sycophancy'];
    expect(Math.abs(axis.lobotomized.meanZ - axis.stock.meanZ)).toBeGreaterThan(DEFAULT_SIGNIFICANCE_NOISE_FLOOR);
    expect(axis.significant).toBe(true);
  });

  it('handles a single judge with a degenerate (zero) z-score (edge: single judge)', () => {
    // bench `normalize` returns z=0 when a judge has zero spread across cells, and a
    // single judge cannot disagree with itself. The function must not throw or NaN.
    const rows = [
      { fixtureId: 'f1', variant: 'lobotomized' as const, judge: 'solo', score: 7 },
      { fixtureId: 'f1', variant: 'stock' as const, judge: 'solo', score: 3 },
    ];
    const verdict = aggregate(scoresFor('terse-directness', rows));
    const axis = verdict.axes['terse-directness'];
    expect(axis.disagreement).toBe(false);
    expect(Number.isFinite(axis.lobotomized.meanZ)).toBe(true);
    expect(Number.isFinite(axis.stock.meanZ)).toBe(true);
  });

  it('thresholds are tunable via the options argument (boundary control)', () => {
    // A clear, low-noise delta that is significant under the default floor reads as
    // NOT significant once the floor is raised above the observed delta.
    const rows: { fixtureId: string; variant: 'stock' | 'lobotomized'; judge: string; score: number }[] = [];
    for (let i = 0; i < 5; i++) {
      rows.push({ fixtureId: `f${i}`, variant: 'lobotomized', judge: 'A', score: 90 + (i % 2) });
      rows.push({ fixtureId: `f${i}`, variant: 'stock', judge: 'A', score: 10 + (i % 2) });
    }
    const aggressiveFloor = aggregate(scoresFor('anti-sycophancy', rows), { significanceNoiseFloor: 1e9 });
    expect(aggressiveFloor.axes['anti-sycophancy'].significant).toBe(false);
  });

  it('exposes conservative documented default thresholds', () => {
    expect(DEFAULT_DISAGREEMENT_RANK_GAP).toBeGreaterThan(0);
    expect(DEFAULT_SIGNIFICANCE_NOISE_FLOOR).toBeGreaterThan(0);
  });

  it('returns a verdict covering every behavioral axis', () => {
    const rows = [
      { fixtureId: 'f1', variant: 'lobotomized' as const, judge: 'A', score: 5 },
      { fixtureId: 'f1', variant: 'stock' as const, judge: 'A', score: 1 },
    ];
    // Score only one axis; the others should still be present (flat baseline).
    const verdict = aggregate(scoresFor('terse-directness', rows));
    for (const axis of BEHAVIORAL_AXES) {
      expect(verdict.axes[axis]).toBeDefined();
    }
  });

  it('handles an empty score set without throwing', () => {
    const verdict = aggregate([]);
    for (const axis of BEHAVIORAL_AXES) {
      expect(verdict.axes[axis].significant).toBe(false);
      expect(verdict.axes[axis].disagreement).toBe(false);
    }
  });
});
