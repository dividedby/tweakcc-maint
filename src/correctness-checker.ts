/**
 * CorrectnessChecker — the routing seam that decides pass/fail for one arm's output
 * on one Behavior-bait fixture (design doc → Seams; CONTEXT.md → "Correctness
 * guardrail"). It routes by the fixture's correctness spec: a DETERMINISTIC fixture
 * is settled by its string check (no model call); an OPEN-ENDED fixture is delegated
 * to the {@link CorrectnessJudgePort} fallback against the fixture's ground truth.
 *
 * It does NOT score the Behavioral axes — that is {@link JudgePort}'s job, kept
 * deliberately separate so a per-axis 0–4 score is never mistaken for a correctness
 * verdict. The real correctness-judge is #138; tests inject {@link StubCorrectnessJudge}.
 */

import type { BehavioralFixture } from './behavioral-fixtures.js';
import type { CorrectnessJudgePort } from './correctness-judge-port.js';

export class CorrectnessChecker {
  constructor(private readonly judge: CorrectnessJudgePort) {}

  /** Decide whether `output` is correct for `fixture`, routing by its correctness spec. */
  async check(fixture: BehavioralFixture, output: string): Promise<boolean> {
    const spec = fixture.correctness;
    if (spec.kind === 'deterministic') {
      return spec.check(output);
    }
    // Open-ended: the only path that reaches the model (the #138 real judge).
    return this.judge.isCorrect(fixture.id, spec.groundTruth, output);
  }
}
