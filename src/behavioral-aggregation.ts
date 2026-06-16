/**
 * BehavioralAggregation — combine multi-judge per-axis scores into a normalized
 * per-axis verdict with disagreement + significance flags (design doc → Module Map;
 * CONTEXT.md → "Behavioral axis", "Judge panel"). PURE: scores in, verdict out.
 *
 * Why z-scoring, not a raw mean: the Judge panel's personas grade on divergent
 * scales, so a raw mean lets the wider-spread judge dominate. We reuse the published
 * bench primitives `normalize` (per-judge z-score across cells, then per-cell mean +
 * a rank-gap disagreement flag) and `groupByCell` (trial-to-trial variance + a noisy
 * flag) from `@dividedby/bench-core` rather than reimplementing them.
 *
 * The mapping onto the bench shapes is per axis, treating one arm×fixture×trial as a
 * bench "cell" (`blindId = "<variant>::<fixtureId>::<trial>"`):
 *   - normalize: one bench `Grade` per (judge × cell), `scores.overall` = that judge's
 *     axis score. Yields a per-cell `normZ` (fair across judges) + a `disagree` flag.
 *   - groupByCell: each normalized cell is a "trial" of its arm — `resolve` maps the
 *     blindId's variant onto the bench `model` slot and the axis onto `effort`. Yields
 *     a per-arm `meanZ` + `trialStd` + `nTrials` + a `noisy` flag (across-cell variance).
 *
 * Significance is OURS (bench has no two-arm comparator): the lobotomized−stock gap in
 * normalized mean (`meanZ`) must satisfy a two-part criterion:
 *   1. Exceed the noise floor (a within-noise win must never read as real — ADR 0002).
 *   2. Be ≥ k·SE(delta), where SE(delta) = sqrt(SE_stock²+SE_lobo²) is the Welch-style
 *      standard error of the difference. More trials shrink SE, tightening the bound so
 *      additional bench runs add genuine statistical power.
 * When seDelta is 0 (zero trial variance), the SE term is 0 so only the floor governs.
 */

import { normalize, groupByCell } from '@dividedby/bench-core';
import type { Grade, BlindCell } from '@dividedby/bench-core';
import { BEHAVIORAL_AXES } from './judge-port.js';
import type { AxisScores, BehavioralAxis } from './judge-port.js';

/** A Variant arm of the Behavioral A/B benchmark (mirrors variant-runner's vocabulary). */
export type AggVariant = 'stock' | 'lobotomized';

/**
 * One judge's per-axis scores for ONE arm's output on ONE fixture on ONE trial —
 * the raw grain the aggregation folds. Each (variant × fixtureId × trial) is a
 * distinct bench cell so `groupByCell` sees `nTrials = fixtures×trials` per arm/axis.
 * (Higher = more of the targeted behavior, per JudgePort.)
 */
export interface MultiJudgeScore {
  fixtureId: string;
  variant: AggVariant;
  /** Opaque judge identity (a Judge-panel persona). */
  judge: string;
  axisScores: AxisScores;
  /** Trial index (0-based). Each (variant×fixtureId×trial) is a separate bench cell. */
  trial: number;
}

/**
 * Disagreement rank-gap threshold. bench `normalize` flags a cell when its judges'
 * within-judge ranks span >= this many positions; we surface that per arm. Conservative:
 * bench's own canonical default is 4, and we keep it — a smaller gap fires on ordinary
 * judge noise and would over-flag. Tunable via {@link AggregationOptions}.
 */
export const DEFAULT_DISAGREEMENT_RANK_GAP = 4;

/**
 * Significance noise floor, in judge-std (z-score) units. The lobotomized−stock gap in
 * normalized mean must exceed this AND clear `significanceSeMultiplier × SE(delta)` to
 * read as significant. 0.5 z is deliberately conservative — a delta within typical judge
 * noise is never called real regardless of SE (ADR 0002). Tunable via {@link AggregationOptions}.
 */
export const DEFAULT_SIGNIFICANCE_NOISE_FLOOR = 0.5;

/**
 * SE multiplier for the significance criterion. The lobotomized−stock gap must be
 * ≥ `significanceSeMultiplier × SE(delta)` (Welch-style SE of the difference of means),
 * in addition to exceeding the noise floor. At 2, a delta must exceed 2·SE to read as
 * significant; more trials shrink SE so the bound tightens with sample size. Default 2.
 */
export const DEFAULT_SIGNIFICANCE_SE_MULTIPLIER = 2;

export interface AggregationOptions {
  disagreementRankGap?: number;
  significanceNoiseFloor?: number;
  /** Multiplier on SE(delta); default {@link DEFAULT_SIGNIFICANCE_SE_MULTIPLIER}. */
  significanceSeMultiplier?: number;
}

/** Per-arm normalized summary for one axis (the bench `GroupedCell` signal we keep). */
export interface ArmAxisSummary {
  /** Mean normalized z across this arm's fixtures (= the fair cross-judge score). */
  meanZ: number;
  /** Mean normalized z of the single most recent normalize pass (per-cell normZ mean). */
  normZ: number;
  /** Trial-to-trial std of normZ across fixtures (judge-std units) — the run-variance signal. */
  trialStd: number;
  /** Number of fixtures (trials) scored for this arm. */
  nTrials: number;
  /** True iff trial spread crossed bench's noisy cutoff (wobbly enough to distrust). */
  noisy: boolean;
}

/** The per-axis verdict: both arms' normalized summaries plus the two flags. */
export interface AxisVerdict {
  stock: ArmAxisSummary;
  lobotomized: ArmAxisSummary;
  /** True iff any cell on this axis tripped bench's judge-disagreement rank gap. */
  disagreement: boolean;
  /**
   * True iff the lobotomized−stock normalized gap cleared BOTH the noise floor AND
   * `significanceSeMultiplier × SE(delta)` (Welch-style SE of the difference of means).
   * More trials shrink SE, so additional bench runs tighten the bound (statistical power).
   */
  significant: boolean;
}

export interface BehavioralAggregationVerdict {
  axes: Record<BehavioralAxis, AxisVerdict>;
}

function blindId(variant: AggVariant, fixtureId: string, trial: number): string {
  return `${variant}::${fixtureId}::${trial}`;
}

function emptyArmSummary(): ArmAxisSummary {
  return { meanZ: 0, normZ: 0, trialStd: 0, nTrials: 0, noisy: false };
}

/**
 * Aggregate one axis: z-normalize judges via bench `normalize`, then fold each arm's
 * cells across fixtures×trials via bench `groupByCell`, then derive disagreement +
 * significance using the two-part SE criterion.
 */
function aggregateAxis(
  axis: BehavioralAxis,
  scores: MultiJudgeScore[],
  opts: Required<AggregationOptions>,
): AxisVerdict {
  // One bench Grade per (judge × arm×fixture×trial cell); scores.overall = this axis's score.
  const grades: Grade[] = scores.map((s) => ({
    blindId: blindId(s.variant, s.fixtureId, s.trial),
    judge: s.judge,
    scores: { overall: s.axisScores[axis] },
  }));

  const normalized = normalize(grades);
  // A cell trips disagreement when its judges rank it >= the gap apart (bench `disagree`,
  // computed with bench's own canonical gap of 4). We honour a caller override by also
  // checking the raw rankGap against the configured threshold.
  const disagreement = normalized.cells.some(
    (c) => c.judges > 1 && c.rankGap >= opts.disagreementRankGap,
  );

  // Group each arm's cells across fixtures×trials: variant → bench `model`, axis → `effort`.
  const cellVariant = new Map<string, AggVariant>();
  for (const s of scores) cellVariant.set(blindId(s.variant, s.fixtureId, s.trial), s.variant);

  const blindCells: BlindCell[] = normalized.cells.map((c) => ({
    blindId: c.blindId,
    normZ: c.normZ,
    rawMean: c.rawMean,
  }));
  const grouped = groupByCell(blindCells, (id) => ({
    model: cellVariant.get(id) ?? 'stock',
    effort: axis,
  }));

  const summaries: Record<AggVariant, ArmAxisSummary> = {
    stock: emptyArmSummary(),
    lobotomized: emptyArmSummary(),
  };
  for (const g of grouped) {
    const variant = g.model as AggVariant;
    if (variant !== 'stock' && variant !== 'lobotomized') continue;
    summaries[variant] = {
      meanZ: g.meanZ,
      normZ: g.meanZ,
      trialStd: g.trialStd,
      nTrials: g.nTrials,
      noisy: g.noisy,
    };
  }

  // Significance: two-part criterion (ADR 0002 + SE upgrade).
  //   1. |delta| > noise floor (a within-noise win must never read as real).
  //   2. |delta| >= seMultiplier × SE(delta), where SE(delta) is the Welch-style
  //      standard error of the difference of means:
  //        seStock = trialStd / sqrt(nTrials)   (shrinks with more trials)
  //        seLobo  = trialStd / sqrt(nTrials)
  //        seDelta = sqrt(seStock² + seLobo²)
  //   When seDelta === 0 (zero trial variance), the SE term is 0 so only the floor
  //   governs. Infinity from a zero-trial arm keeps the verdict not-significant.
  const delta = summaries.lobotomized.meanZ - summaries.stock.meanZ;
  const seStock = summaries.stock.nTrials > 0
    ? summaries.stock.trialStd / Math.sqrt(summaries.stock.nTrials)
    : Infinity;
  const seLobo = summaries.lobotomized.nTrials > 0
    ? summaries.lobotomized.trialStd / Math.sqrt(summaries.lobotomized.nTrials)
    : Infinity;
  const seDelta = Math.sqrt(seStock ** 2 + seLobo ** 2);
  const significant =
    summaries.stock.nTrials > 0 &&
    summaries.lobotomized.nTrials > 0 &&
    Math.abs(delta) > opts.significanceNoiseFloor &&
    Math.abs(delta) >= opts.significanceSeMultiplier * seDelta;

  return { stock: summaries.stock, lobotomized: summaries.lobotomized, disagreement, significant };
}

/**
 * Combine multi-judge per-axis scores into a normalized per-axis verdict with
 * disagreement + significance flags. Pure; never throws (evidence, not a gate).
 */
export function aggregate(
  scores: MultiJudgeScore[],
  options: AggregationOptions = {},
): BehavioralAggregationVerdict {
  const opts: Required<AggregationOptions> = {
    disagreementRankGap: options.disagreementRankGap ?? DEFAULT_DISAGREEMENT_RANK_GAP,
    significanceNoiseFloor: options.significanceNoiseFloor ?? DEFAULT_SIGNIFICANCE_NOISE_FLOOR,
    significanceSeMultiplier: options.significanceSeMultiplier ?? DEFAULT_SIGNIFICANCE_SE_MULTIPLIER,
  };

  const axes = {} as Record<BehavioralAxis, AxisVerdict>;
  for (const axis of BEHAVIORAL_AXES) {
    axes[axis] = aggregateAxis(axis, scores, opts);
  }
  return { axes };
}
