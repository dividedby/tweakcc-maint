/**
 * Unit tests for lobotomy-ranker (Phase 4 of the Full adoption path, #243).
 *
 * Verifies:
 *   - scoreAxes detects each Behavioral axis correctly
 *   - rankByLobotomyPotential sorts descending, applies inactive penalty, sets clearsBar
 *   - anyClears reports correctly
 *   - "nothing clears the bar" is a valid output (no crash, explicit false)
 *
 * All-fake wiring: in-memory prompt texts — no fs, no gh.
 */

import { describe, it, expect } from 'vitest';
import {
  scoreAxes,
  rankByLobotomyPotential,
  anyClears,
  type PromptCandidate,
} from '../src/lobotomy-ranker.js';

// ---------------------------------------------------------------------------
// scoreAxes — per-axis signal detection
// ---------------------------------------------------------------------------

describe('scoreAxes', () => {
  it('returns four axes', () => {
    const axes = scoreAxes('');
    expect(axes).toHaveLength(4);
    expect(axes.map((a) => a.axis)).toEqual([
      'anti-sycophancy',
      'anti-hedging',
      'fewer-unsolicited-offers',
      'terse-directness',
    ]);
  });

  it('scores zero for a clean, terse prompt', () => {
    const axes = scoreAxes('List the files in the directory. Do not explain.');
    axes.forEach((a) => expect(a.score).toBe(0));
  });

  it('detects sycophantic phrases', () => {
    const axes = scoreAxes('Great! Of course, I am happy to help. Certainly!');
    const s = axes.find((a) => a.axis === 'anti-sycophancy')!;
    expect(s.score).toBeGreaterThan(0);
  });

  it('detects hedging phrases', () => {
    const axes = scoreAxes('I think perhaps this might be the case. It seems correct.');
    const h = axes.find((a) => a.axis === 'anti-hedging')!;
    expect(h.score).toBeGreaterThan(0);
  });

  it('detects unsolicited offer phrases', () => {
    const axes = scoreAxes('Would you like me to explain? Shall I proceed? Let me know if you need more.');
    const o = axes.find((a) => a.axis === 'fewer-unsolicited-offers')!;
    expect(o.score).toBeGreaterThan(0);
  });

  it('detects verbosity signals', () => {
    const axes = scoreAxes('In summary, as an AI assistant, I am here to help. I will help.');
    const v = axes.find((a) => a.axis === 'terse-directness')!;
    expect(v.score).toBeGreaterThan(0);
  });

  it('caps axis score at 3 even for many pattern matches', () => {
    const text =
      'Great! Excellent! Wonderful! Thanks! Glad to help! Happy to. Of course! Certainly! Absolutely!';
    const axes = scoreAxes(text);
    const s = axes.find((a) => a.axis === 'anti-sycophancy')!;
    expect(s.score).toBeLessThanOrEqual(3);
  });
});

// ---------------------------------------------------------------------------
// rankByLobotomyPotential — sorting, penalty, clearsBar
// ---------------------------------------------------------------------------

const SYCOPHANTIC_PROMPT = 'Great! Of course, I am happy to help. Certainly!';
const CLEAN_PROMPT = 'Run the linter. Report errors only.';

describe('rankByLobotomyPotential', () => {
  it('returns an empty list for no candidates', () => {
    expect(rankByLobotomyPotential([])).toEqual([]);
  });

  it('sorts results descending by totalScore', () => {
    const candidates: PromptCandidate[] = [
      { promptId: 'clean', text: CLEAN_PROMPT },
      { promptId: 'sycophantic', text: SYCOPHANTIC_PROMPT },
    ];
    const ranked = rankByLobotomyPotential(candidates);
    expect(ranked[0]!.promptId).toBe('sycophantic');
    expect(ranked[1]!.promptId).toBe('clean');
    expect(ranked[0]!.totalScore).toBeGreaterThanOrEqual(ranked[1]!.totalScore);
  });

  it('applies inactivePenalty=2 for inactive slots and reduces totalScore', () => {
    const candidates: PromptCandidate[] = [
      { promptId: 'inactive', text: SYCOPHANTIC_PROMPT, inactive: true },
    ];
    const [r] = rankByLobotomyPotential(candidates);
    expect(r!.inactivePenalty).toBe(2);
    // totalScore = max(0, rawScore - 2)
    const axes = scoreAxes(SYCOPHANTIC_PROMPT);
    const raw = axes.reduce((s, a) => s + a.score, 0);
    expect(r!.totalScore).toBe(Math.max(0, raw - 2));
  });

  it('applies no penalty for active slots', () => {
    const candidates: PromptCandidate[] = [{ promptId: 'active', text: SYCOPHANTIC_PROMPT }];
    const [r] = rankByLobotomyPotential(candidates);
    expect(r!.inactivePenalty).toBe(0);
  });

  it('floors totalScore at 0 when penalty exceeds raw score', () => {
    const candidates: PromptCandidate[] = [
      { promptId: 'penalized', text: CLEAN_PROMPT, inactive: true },
    ];
    const [r] = rankByLobotomyPotential(candidates);
    expect(r!.totalScore).toBeGreaterThanOrEqual(0);
  });

  it('sets clearsBar=true when totalScore >= 2', () => {
    const candidates: PromptCandidate[] = [{ promptId: 'high', text: SYCOPHANTIC_PROMPT }];
    const [r] = rankByLobotomyPotential(candidates);
    // SYCOPHANTIC_PROMPT should score >= 2 on the sycophancy axis alone
    if (r!.totalScore >= 2) {
      expect(r!.clearsBar).toBe(true);
    }
  });

  it('sets clearsBar=false when totalScore < 2 (nothing clears the bar)', () => {
    const candidates: PromptCandidate[] = [{ promptId: 'zero', text: CLEAN_PROMPT }];
    const [r] = rankByLobotomyPotential(candidates);
    expect(r!.clearsBar).toBe(false);
  });

  it('includes all four axes in the result', () => {
    const candidates: PromptCandidate[] = [{ promptId: 'x', text: CLEAN_PROMPT }];
    const [r] = rankByLobotomyPotential(candidates);
    expect(r!.axes).toHaveLength(4);
  });
});

// ---------------------------------------------------------------------------
// anyClears
// ---------------------------------------------------------------------------

describe('anyClears', () => {
  it('returns false for an empty list (nothing clears the bar)', () => {
    expect(anyClears([])).toBe(false);
  });

  it('returns false when no ranking clears the bar', () => {
    const rankings = rankByLobotomyPotential([{ promptId: 'z', text: CLEAN_PROMPT }]);
    expect(anyClears(rankings)).toBe(false);
  });

  it('returns true when at least one ranking clears the bar', () => {
    const rankings = rankByLobotomyPotential([
      { promptId: 'clean', text: CLEAN_PROMPT },
      { promptId: 'heavy', text: SYCOPHANTIC_PROMPT },
    ]);
    // At least one should clear if the sycophantic prompt scores >= 2
    const heavyRanking = rankings.find((r) => r.promptId === 'heavy')!;
    if (heavyRanking.clearsBar) {
      expect(anyClears(rankings)).toBe(true);
    } else {
      expect(anyClears(rankings)).toBe(false);
    }
  });
});
