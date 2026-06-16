/**
 * JudgePanelPort — the seam the ABDriver uses to SCORE one pairing through the whole
 * Judge panel at once (ADR 0008; design doc → Seams). Where {@link JudgePort} is one
 * judge returning one {@link JudgeScores}, this returns a {@link PanelResult} carrying
 * persona-tagged scores for graded personas and an omitted list for any persona that did
 * not produce a usable grade (#304, degrade-to-partial). Three persona-varied Claude
 * judge-agents (strict literalist / devil's-advocate / holistic reviewer) all score the
 * same blind, order-randomized pairing. The driver folds each graded persona's A/B slots
 * back to the arms and pushes one {@link MultiJudgeScore} per (persona × arm), giving
 * aggregation `judges>1` per cell — real cross-judge disagreement and variance.
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

/**
 * The result of scoring one pairing through the panel (#304, degrade-to-partial).
 * `graded` carries persona-tagged scores for every persona that produced a valid grade;
 * `omitted` lists any persona whose backend deferred or failed. The panel throws rather
 * than returning this if `graded.length` falls below the floor.
 */
export interface PanelResult {
  graded: Array<{ persona: JudgePersona; scores: JudgeScores }>;
  omitted: JudgePersona[];
}

export interface JudgePanelPort {
  /**
   * Score a blind, order-randomized pairing through every panel persona, returning a
   * {@link PanelResult} with graded persona-scores and any omitted personas.
   * Throws if too few personas produce a valid grade (below the floor).
   */
  scorePanel(fixtureId: string, first: PresentedOutput, second: PresentedOutput): Promise<PanelResult>;
}

/**
 * Wrap a single {@link JudgePort} as a one-element {@link JudgePanelPort}. Lets a
 * single-judge stub speak the panel seam — used by the existing driver tests to keep
 * their assertions through the new interface. The wrapped judge is labelled with the
 * first {@link JUDGE_PERSONAS} entry; `name` is documentary only.
 */
export function panelOf(judge: JudgePort, name: string = JUDGE_PERSONAS[0]): JudgePanelPort {
  void name;
  return {
    async scorePanel(fixtureId, first, second) {
      const scores = await judge.score(fixtureId, first, second);
      return { graded: [{ persona: JUDGE_PERSONAS[0], scores }], omitted: [] };
    },
  };
}
