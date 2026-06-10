/**
 * StubCorrectnessJudge — the test double for the {@link CorrectnessJudgePort} seam.
 * It returns a DETERMINISTIC verdict keyed by the output text it is shown, so a test
 * can assert that the {@link CorrectnessChecker} routes an open-ended fixture to the
 * judge fallback and returns the judge's verdict — with no real model call.
 *
 * The verdict map IS the test fixture: register a boolean per output string; an
 * unregistered output is judged incorrect (`false`).
 */

import type { CorrectnessJudgePort } from './correctness-judge-port.js';

export class StubCorrectnessJudge implements CorrectnessJudgePort {
  /** Calls captured in order, recording what the judge was asked to rule on. */
  readonly captured: { fixtureId: string; groundTruth: string; output: string }[] = [];

  /** Per-output-text verdict. An unregistered output is judged incorrect. */
  private readonly byOutput = new Map<string, boolean>();

  /** Register the verdict the judge should return for a given output text. */
  setVerdict(output: string, correct: boolean): this {
    this.byOutput.set(output, correct);
    return this;
  }

  isCorrect(fixtureId: string, groundTruth: string, output: string): Promise<boolean> {
    this.captured.push({ fixtureId, groundTruth, output });
    return Promise.resolve(this.byOutput.get(output) ?? false);
  }
}
