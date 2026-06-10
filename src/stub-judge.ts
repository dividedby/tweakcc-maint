/**
 * StubJudge — the test double for the JudgePort seam (design doc → Seams). It
 * returns DETERMINISTIC per-axis scores keyed by the output text it is shown, so
 * a test can assert pairing/randomization/aggregation/guardrail with no real model
 * call. Because the stub scores the *output it sees* (never a variant label), it
 * stays faithful to the blind-scoring contract: it cannot peek at variant identity.
 *
 * The score map IS the test fixture: register a per-axis score per output string;
 * an unregistered output scores zero on every axis.
 */

import { BEHAVIORAL_AXES } from './judge-port.js';
import type { AxisScores, JudgePort, JudgeScores, PresentedOutput } from './judge-port.js';

function zeroAxes(): AxisScores {
  return {
    'anti-sycophancy': 0,
    'anti-hedging': 0,
    'fewer-unsolicited-offers': 0,
    'terse-directness': 0,
  };
}

export class StubJudge implements JudgePort {
  /** Pairings captured in call order, recording the presentation order the judge saw. */
  readonly captured: { fixtureId: string; order: ['A' | 'B', 'A' | 'B']; outputs: [string, string] }[] = [];

  /** Per-output-text axis scores. An unregistered output scores zero on every axis. */
  private readonly byOutput = new Map<string, AxisScores>();

  /** Register the per-axis scores the judge should return for a given output text. */
  setScores(output: string, scores: Partial<AxisScores>): this {
    this.byOutput.set(output, { ...zeroAxes(), ...scores });
    return this;
  }

  private scoreOne(presented: PresentedOutput): AxisScores {
    return this.byOutput.get(presented.output) ?? zeroAxes();
  }

  score(fixtureId: string, first: PresentedOutput, second: PresentedOutput): Promise<JudgeScores> {
    this.captured.push({
      fixtureId,
      order: [first.position, second.position],
      outputs: [first.output, second.output],
    });
    const slots: Record<'A' | 'B', AxisScores> = { A: zeroAxes(), B: zeroAxes() };
    for (const presented of [first, second]) {
      slots[presented.position] = this.scoreOne(presented);
    }
    return Promise.resolve({ A: slots.A, B: slots.B });
  }
}

/** Re-export the axis list so test/score builders need only import the stub. */
export { BEHAVIORAL_AXES };
