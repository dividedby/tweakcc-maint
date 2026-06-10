/**
 * JudgePort — the seam the ABDriver uses to SCORE one pairing on the four
 * Behavioral axes (design doc → Seams; CONTEXT.md → "Behavioral A/B benchmark",
 * "Judge panel", "Behavioral axis"). The judge sees a pairing presented in some
 * order and returns a per-axis score for each arm; it never sees which arm is
 * stock vs lobotomized-CC (scoring is blind — that framing is the driver's job).
 *
 * Tests drive it via {@link StubJudge} (deterministic per-axis scores); prod will
 * be the persona-varied all-Claude RealJudgePanel behind this same interface (#138).
 */

/** The four Behavioral axes the Lobotomy targets and the rubric scores (CONTEXT.md). */
export type BehavioralAxis =
  | 'anti-sycophancy'
  | 'anti-hedging'
  | 'fewer-unsolicited-offers'
  | 'terse-directness';

export const BEHAVIORAL_AXES: readonly BehavioralAxis[] = [
  'anti-sycophancy',
  'anti-hedging',
  'fewer-unsolicited-offers',
  'terse-directness',
];

/** A per-axis score for a single arm's output (higher = more of the targeted behavior). */
export type AxisScores = Record<BehavioralAxis, number>;

/**
 * One arm's output as the judge sees it, in presentation order — labelled only by
 * an opaque position ("A"/"B"), never by variant, so scoring stays blind.
 */
export interface PresentedOutput {
  /** Opaque presentation slot — carries no variant identity. */
  position: 'A' | 'B';
  /** The arm's produced output text for the fixture. */
  output: string;
}

/** The judge's score for one presented pairing: per-axis scores keyed by slot. */
export interface JudgeScores {
  A: AxisScores;
  B: AxisScores;
}

export interface JudgePort {
  /** Score a blind, order-randomized pairing on the four Behavioral axes. */
  score(fixtureId: string, first: PresentedOutput, second: PresentedOutput): Promise<JudgeScores>;
}
