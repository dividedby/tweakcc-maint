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
 * The mapping onto the bench shapes is per axis, treating one arm's output on one
 * fixture as a bench "cell" (`blindId = "<variant>::<fixtureId>"`):
 *   - normalize: one bench `Grade` per (judge × cell), `scores.overall` = that judge's
 *     axis score. Yields a per-cell `normZ` (fair across judges) + a `disagree` flag.
 *   - groupByCell: each normalized cell is a "trial" of its arm — `resolve` maps the
 *     blindId's variant onto the bench `model` slot and the axis onto `effort`. Yields
 *     a per-arm `meanZ` + `trialStd` + a `noisy` flag (the across-fixture variance).
 *
 * Significance is OURS (bench has no two-arm comparator): the lobotomized−stock gap in
 * normalized mean (`meanZ`) must clear a noise floor scaled by the arms' trial noise,
 * else it reads as not-significant. A within-noise win must never read as real — that
 * is the whole point of the evidence-not-a-gate track (ADR 0002).
 */

import { normalize, groupByCell } from '@dividedby/bench-core';
import type { Grade, BlindCell } from '@dividedby/bench-core';
import { BEHAVIORAL_AXES } from './judge-port.js';
import type { AxisScores, BehavioralAxis } from './judge-port.js';

/** A Variant arm of the Behavioral A/B benchmark (mirrors variant-runner's vocabulary). */
export type AggVariant = 'stock' | 'lobotomized';

/**
 * One judge's per-axis scores for ONE arm's output on ONE fixture — the raw grain the
 * aggregation folds. (Higher = more of the targeted behavior, per JudgePort.)
 */
export interface MultiJudgeScore {
  fixtureId: string;
  variant: AggVariant;
  /** Opaque judge identity (a Judge-panel persona). */
  judge: string;
  axisScores: AxisScores;
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
 * normalized mean must exceed this PLUS the arms' trial noise to read as significant.
 * 0.5 z is deliberately conservative — it matches bench's own `noisy` trial-std cutoff,
 * so a delta no larger than a single arm's trial wobble is never called real (ADR 0002:
 * a within-noise win must read as not-significant). Tunable via {@link AggregationOptions}.
 */
export const DEFAULT_SIGNIFICANCE_NOISE_FLOOR = 0.5;

export interface AggregationOptions {
  disagreementRankGap?: number;
  significanceNoiseFloor?: number;
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
  /** True iff the lobotomized−stock normalized gap cleared the noise floor + trial noise. */
  significant: boolean;
}

export interface BehavioralAggregationVerdict {
  axes: Record<BehavioralAxis, AxisVerdict>;
}

function blindId(variant: AggVariant, fixtureId: string): string {
  return `${variant}::${fixtureId}`;
}

function emptyArmSummary(): ArmAxisSummary {
  return { meanZ: 0, normZ: 0, trialStd: 0, nTrials: 0, noisy: false };
}

/**
 * Aggregate one axis: z-normalize judges via bench `normalize`, then fold each arm's
 * cells across fixtures via bench `groupByCell`, then derive disagreement + significance.
 */
function aggregateAxis(
  axis: BehavioralAxis,
  scores: MultiJudgeScore[],
  opts: Required<AggregationOptions>,
): AxisVerdict {
  // One bench Grade per (judge × arm-fixture cell); scores.overall = this axis's score.
  const grades: Grade[] = scores.map((s) => ({
    blindId: blindId(s.variant, s.fixtureId),
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

  // Group each arm's cells across fixtures: variant → bench `model`, axis → bench `effort`.
  const cellVariant = new Map<string, AggVariant>();
  for (const s of scores) cellVariant.set(blindId(s.variant, s.fixtureId), s.variant);

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

  // Significance: the lobotomized−stock normalized gap must clear the noise floor PLUS
  // the arms' trial noise. Within either arm's trial wobble → not significant (ADR 0002).
  const delta = summaries.lobotomized.meanZ - summaries.stock.meanZ;
  const trialNoise = Math.max(summaries.stock.trialStd, summaries.lobotomized.trialStd);
  const significant =
    summaries.stock.nTrials > 0 &&
    summaries.lobotomized.nTrials > 0 &&
    Math.abs(delta) > opts.significanceNoiseFloor + trialNoise;

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
  };

  const axes = {} as Record<BehavioralAxis, AxisVerdict>;
  for (const axis of BEHAVIORAL_AXES) {
    axes[axis] = aggregateAxis(axis, scores, opts);
  }
  return { axes };
}
