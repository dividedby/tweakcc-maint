/**
 * CorrectnessJudgePort — the seam the {@link CorrectnessChecker} uses to decide
 * pass/fail for an OPEN-ENDED Behavior-bait fixture, where no deterministic string
 * check can settle correctness (CONTEXT.md → "Correctness guardrail", "Behavior-bait
 * fixture"). It is deliberately SEPARATE from {@link JudgePort}: the judge panel scores
 * the four Behavioral axes (0–4), whereas this port answers one boolean question —
 * "did this output get the ground truth right?" — so the two never get conflated.
 *
 * Tests drive it via {@link StubCorrectnessJudge} (a canned per-output verdict). The
 * real all-Claude implementation is #138; until then the open-ended path is exercised
 * only through the stub.
 */

export interface CorrectnessJudgePort {
  /**
   * Decide whether `output` is correct for an open-ended fixture, given its ground
   * truth. The judge sees the fixture's content, never which arm produced the output.
   * Returns `null` when the backend deferred or failed (#304, degrade-to-partial) —
   * the caller records the omission and skips the correctness guardrail for this fixture.
   */
  isCorrect(fixtureId: string, groundTruth: string, output: string): Promise<boolean | null>;
}
