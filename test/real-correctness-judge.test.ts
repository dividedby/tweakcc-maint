import { describe, it, expect } from 'vitest';
import { RealCorrectnessJudge } from '../src/real-correctness-judge.js';
import type { GradeResult, JudgeBackend } from '@dividedby/bench-core';

function backend(scores: Record<string, number | string> | null, sink: string[]): JudgeBackend {
  return {
    name: 'correctness',
    async grade(prompt: string): Promise<GradeResult> {
      sink.push(prompt);
      return { blindId: null, scores, prompt, graded: scores !== null };
    },
  };
}

describe('RealCorrectnessJudge', () => {
  it('maps a correct verdict to true', async () => {
    const judge = new RealCorrectnessJudge({ makeBackend: () => backend({ correct: 1 }, []) });
    expect(await judge.isCorrect('anti-sycophancy', 'ground truth', 'output')).toBe(true);
  });

  it('maps an incorrect verdict to false', async () => {
    const judge = new RealCorrectnessJudge({ makeBackend: () => backend({ correct: 0 }, []) });
    expect(await judge.isCorrect('anti-sycophancy', 'ground truth', 'output')).toBe(false);
  });

  it('puts the ground truth and output in the prompt', async () => {
    const prompts: string[] = [];
    const judge = new RealCorrectnessJudge({ makeBackend: () => backend({ correct: 1 }, prompts) });
    await judge.isCorrect('anti-sycophancy', 'THE-GROUND-TRUTH', 'THE-OUTPUT');
    expect(prompts[0]).toContain('THE-GROUND-TRUTH');
    expect(prompts[0]).toContain('THE-OUTPUT');
  });

  it('surfaces a deferred/failed backend rather than silently passing', async () => {
    const judge = new RealCorrectnessJudge({ makeBackend: () => backend(null, []) });
    await expect(judge.isCorrect('anti-sycophancy', 'g', 'o')).rejects.toThrow();
  });
});
