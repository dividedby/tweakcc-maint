import { describe, it, expect } from 'vitest';
import { RealJudgePanel } from '../src/real-judge-panel.js';
import { JUDGE_PERSONAS } from '../src/judge-panel-port.js';
import { BEHAVIORAL_AXES } from '../src/judge-port.js';
import type { GradeResult, JudgeBackend } from '@dividedby/bench-core';

/** A fake JudgeBackend returning a recorded GradeResult; captures the prompt it was given. */
function fakeBackend(name: string, scores: Record<string, number | string> | null, sink: string[]): JudgeBackend {
  return {
    name,
    async grade(prompt: string): Promise<GradeResult> {
      sink.push(prompt);
      return { blindId: null, scores, prompt, graded: scores !== null };
    },
  };
}

/** Canned per-axis scores for both slots: A scores `a`, B scores `b` on every axis. */
function flatScores(a: number, b: number): Record<string, number> {
  const s: Record<string, number> = {};
  for (const axis of BEHAVIORAL_AXES) {
    s[`A_${axis}`] = a;
    s[`B_${axis}`] = b;
  }
  return s;
}

describe('RealJudgePanel', () => {
  it('produces one JudgeScores per persona, parsing per-axis A/B scores', async () => {
    const prompts: string[] = [];
    const panel = new RealJudgePanel({
      makeBackend: (name) => fakeBackend(name, flatScores(1, 3), prompts),
    });

    const result = await panel.scorePanel(
      'anti-hedging',
      { position: 'A', output: 'first output' },
      { position: 'B', output: 'second output' },
    );

    expect(result).toHaveLength(JUDGE_PERSONAS.length);
    for (const scores of result) {
      for (const axis of BEHAVIORAL_AXES) {
        expect(scores.A[axis]).toBe(1);
        expect(scores.B[axis]).toBe(3);
      }
    }
  });

  it('stays blind — no variant label reaches the constructed prompt', async () => {
    const prompts: string[] = [];
    const panel = new RealJudgePanel({
      makeBackend: (name) => fakeBackend(name, flatScores(2, 2), prompts),
    });

    await panel.scorePanel(
      'terse-directness',
      { position: 'A', output: 'OUTPUT-ALPHA' },
      { position: 'B', output: 'OUTPUT-BETA' },
    );

    expect(prompts.length).toBe(JUDGE_PERSONAS.length);
    for (const p of prompts) {
      expect(p).not.toMatch(/stock|lobotomized|lobo/i);
      // The blind slot framing and the actual outputs do reach the judge.
      expect(p).toContain('OUTPUT-ALPHA');
      expect(p).toContain('OUTPUT-BETA');
    }
  });

  it('surfaces a judge-backend failure/deferral (scores=null) as a thrown error', async () => {
    const prompts: string[] = [];
    const panel = new RealJudgePanel({
      makeBackend: (name) => fakeBackend(name, null, prompts),
    });

    await expect(
      panel.scorePanel('anti-sycophancy', { position: 'A', output: 'x' }, { position: 'B', output: 'y' }),
    ).rejects.toThrow();
  });
});
