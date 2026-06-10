/**
 * JudgePanelPort — the seam the ABDriver uses to SCORE one pairing through the whole
 * Judge panel at once (ADR 0008; design doc → Seams). Where {@link JudgePort} is one
 * judge returning one {@link JudgeScores}, this returns ONE JudgeScores PER PERSONA, in
 * panel order: three persona-varied Claude judge-agents (strict literalist /
 * devil's-advocate / holistic reviewer) all scoring the same blind, order-randomized
 * pairing. The driver folds each persona's A/B slots back to the arms and pushes one
 * {@link MultiJudgeScore} per (persona × arm), giving aggregation `judges>1` per cell —
 * real cross-judge disagreement and variance instead of a degenerate single-judge z.
 *
 * Tests drive it via {@link panelOf} (wraps a single {@link StubJudge} as a one-element
 * panel) so existing single-judge driver tests speak the panel seam unchanged; prod is
 * RealJudgePanel (#138). {@link JudgePort}/{@link StubJudge} stay intact alongside.
 */

import type { JudgePort, JudgeScores, PresentedOutput } from './judge-port.js';

/**
 * The three judge-panel personas (ADR 0008). Each name becomes the `judge` field of a
 * MultiJudgeScore, so a full panel yields three distinct judges per cell. Panel order.
 */
export const JUDGE_PERSONAS = ['strict-literalist', 'devils-advocate', 'holistic-reviewer'] as const;

export type JudgePersona = (typeof JUDGE_PERSONAS)[number];

export interface JudgePanelPort {
  /**
   * Score a blind, order-randomized pairing through every panel persona, returning one
   * {@link JudgeScores} per persona in panel order (never sees which arm is which).
   */
  scorePanel(fixtureId: string, first: PresentedOutput, second: PresentedOutput): Promise<JudgeScores[]>;
}

/**
 * Wrap a single {@link JudgePort} as a one-element {@link JudgePanelPort}. Lets a
 * single-judge stub speak the panel seam — used by the existing driver tests to keep
 * their assertions through the new interface. The driver labels each panel slot by its
 * {@link JUDGE_PERSONAS} index, so `name` is documentary only (the wrapped judge's
 * intended persona); it does not change the score the driver records.
 */
export function panelOf(judge: JudgePort, name: string = JUDGE_PERSONAS[0]): JudgePanelPort {
  void name;
  return {
    async scorePanel(fixtureId, first, second) {
      return [await judge.score(fixtureId, first, second)];
    },
  };
}
