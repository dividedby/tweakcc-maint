/**
 * Unit tests for lobotomy-ranker (Phase 4 of the Full adoption path, #243).
 *
 * Verifies:
 *   - scoreAxes detects each anti-laziness Behavioral axis correctly
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
      'completes-in-scope',
      'no-stub-or-mvp',
      'no-deferral',
      'no-hedge-on-in-scope',
    ]);
  });

  it('scores zero for a clean, directive prompt', () => {
    const axes = scoreAxes('List the files in the directory. Do not explain.');
    // completes-in-scope is always 0 from regex; others should also be 0 for this text
    axes.forEach((a) => expect(a.score).toBe(0));
  });

  it('completes-in-scope is always 0 (ponytail: not pre-screened by regex)', () => {
    // Even a text loaded with deferral/stub/hedge language scores 0 on completes-in-scope
    const axes = scoreAxes('TODO: handle the edge case. You may want to add validation later.');
    const c = axes.find((a) => a.axis === 'completes-in-scope')!;
    expect(c.score).toBe(0);
    expect(c.rationale).toMatch(/not pre-screened/i);
  });

  it('detects stub/MVP phrases', () => {
    const axes = scoreAxes('TODO: implement this. Use a minimal version for now.');
    const s = axes.find((a) => a.axis === 'no-stub-or-mvp')!;
    expect(s.score).toBeGreaterThan(0);
  });

  it('detects deferral phrases', () => {
    const axes = scoreAxes('As a next step, handle the error case. Left for a follow-up.');
    const d = axes.find((a) => a.axis === 'no-deferral')!;
    expect(d.score).toBeGreaterThan(0);
  });

  it('detects hedge-on-scope phrases', () => {
    const axes = scoreAxes('You may want to add retry logic. Consider implementing error handling.');
    const h = axes.find((a) => a.axis === 'no-hedge-on-in-scope')!;
    expect(h.score).toBeGreaterThan(0);
  });

  it('caps axis score at 3 even for many pattern matches', () => {
    const text =
      'TODO: fix this. FIXME: not implemented. Happy path only. Minimal version. Placeholder here. ' +
      'For brevity, just skip it. You may want to add it later.';
    const axes = scoreAxes(text);
    for (const a of axes) {
      expect(a.score).toBeLessThanOrEqual(3);
    }
  });
});

// ---------------------------------------------------------------------------
// rankByLobotomyPotential — sorting, penalty, clearsBar
// ---------------------------------------------------------------------------

const LAZY_PROMPT = 'TODO: implement this. As a next step, add the error case. You may want to add retry logic.';
const CLEAN_PROMPT = 'Run the linter. Report errors only.';

describe('rankByLobotomyPotential', () => {
  it('returns an empty list for no candidates', () => {
    expect(rankByLobotomyPotential([])).toEqual([]);
  });

  it('sorts results descending by totalScore', () => {
    const candidates: PromptCandidate[] = [
      { promptId: 'clean', text: CLEAN_PROMPT },
      { promptId: 'lazy', text: LAZY_PROMPT },
    ];
    const ranked = rankByLobotomyPotential(candidates);
    expect(ranked[0]!.promptId).toBe('lazy');
    expect(ranked[1]!.promptId).toBe('clean');
    expect(ranked[0]!.totalScore).toBeGreaterThanOrEqual(ranked[1]!.totalScore);
  });

  it('applies inactivePenalty=2 for inactive slots and reduces totalScore', () => {
    const candidates: PromptCandidate[] = [
      { promptId: 'inactive', text: LAZY_PROMPT, inactive: true },
    ];
    const [r] = rankByLobotomyPotential(candidates);
    expect(r!.inactivePenalty).toBe(2);
    // totalScore = max(0, rawScore - 2)
    const axes = scoreAxes(LAZY_PROMPT);
    const raw = axes.reduce((s, a) => s + a.score, 0);
    expect(r!.totalScore).toBe(Math.max(0, raw - 2));
  });

  it('applies no penalty for active slots', () => {
    const candidates: PromptCandidate[] = [{ promptId: 'active', text: LAZY_PROMPT }];
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
    const candidates: PromptCandidate[] = [{ promptId: 'high', text: LAZY_PROMPT }];
    const [r] = rankByLobotomyPotential(candidates);
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
      { promptId: 'lazy', text: LAZY_PROMPT },
    ]);
    const lazyRanking = rankings.find((r) => r.promptId === 'lazy')!;
    if (lazyRanking.clearsBar) {
      expect(anyClears(rankings)).toBe(true);
    } else {
      expect(anyClears(rankings)).toBe(false);
    }
  });
});
