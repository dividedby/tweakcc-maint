import { describe, it, expect } from 'vitest';
import { runBehavioralAB } from '../src/behavioral-ab-run.js';
import { BEHAVIORAL_FIXTURES } from '../src/behavioral-fixtures.js';
import { JUDGE_PERSONAS } from '../src/judge-panel-port.js';
import { BEHAVIORAL_AXES } from '../src/judge-port.js';
import type { JudgePanelPort } from '../src/judge-panel-port.js';
import type { VariantRunner } from '../src/variant-runner.js';
import type { CorrectnessJudgePort } from '../src/correctness-judge-port.js';
import type { AdoptionRecord } from '../src/integration-gate.js';

/** All-fake runner: a distinct canned output per (fixture, variant). */
const fakeRunner: VariantRunner = {
  async run(fixtureId, _prompt, variant) {
    return { variant, output: `${fixtureId}:${variant}` };
  },
};

/** A fake panel scoring every slot 2 on every axis, one JudgeScores per persona. */
const fakePanel: JudgePanelPort = {
  async scorePanel(_fixtureId, _first, _second) {
    const flat = () => Object.fromEntries(BEHAVIORAL_AXES.map((a) => [a, 2])) as Record<(typeof BEHAVIORAL_AXES)[number], number>;
    return {
      graded: JUDGE_PERSONAS.map((persona) => ({ persona, scores: { A: flat(), B: flat() } })),
      omitted: [],
    };
  },
};

/** Open-ended fixtures are judged correct by this fake. */
const fakeCorrectnessJudge: CorrectnessJudgePort = {
  async isCorrect() {
    return true;
  },
};

describe('runBehavioralAB', () => {
  it('attaches a verdict to the AdoptionRecord without touching its pass', async () => {
    const base: AdoptionRecord = { pass: false, versions: [], date: '2026-06-10T00:00:00.000Z' };

    const result = await runBehavioralAB(base, {
      runner: fakeRunner,
      panel: fakePanel,
      correctnessJudge: fakeCorrectnessJudge,
      rng: undefined,
    });

    expect(result.behavioralAB).toBeDefined();
    expect(result.behavioralAB!.pairings).toBe(BEHAVIORAL_FIXTURES.length);
    // Never gated: pass is carried through untouched, input untouched (pure).
    expect(result.pass).toBe(false);
    expect(base.behavioralAB).toBeUndefined();
  });
});
