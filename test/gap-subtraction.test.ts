/**
 * Unit tests for gap-subtraction (Path B Phase 4 gap-diff, #244).
 *
 * Verifies:
 *   - hasActiveOverride correctly identifies absent, empty-stub, and active cases
 *   - subtractActiveOverrides returns only genuine gaps (clears bar + no active override)
 *   - candidates below the bar are excluded even when no override exists
 *   - "nothing to add" (empty result) is a valid, correct output
 *
 * All-fake wiring: in-memory override files + rankings — no fs, no gh.
 */

import { describe, it, expect } from 'vitest';
import { hasActiveOverride, subtractActiveOverrides } from '../src/gap-subtraction.js';
import type { NamedOverrideFile } from '../src/drift-triage.js';
import type { LobotomyRanking } from '../src/lobotomy-ranker.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeOverrideFile(promptId: string, modelSet: string, body: string): NamedOverrideFile {
  return {
    promptId,
    modelSet,
    content: `<!--\nname: '${promptId}'\nccVersion: 2.1.177\n-->\n${body}`,
  };
}

function makeRanking(promptId: string, clearsBar: boolean, totalScore = clearsBar ? 3 : 0): LobotomyRanking {
  return {
    promptId,
    totalScore,
    axes: [],
    inactivePenalty: 0,
    clearsBar,
  };
}

// ---------------------------------------------------------------------------
// hasActiveOverride
// ---------------------------------------------------------------------------

describe('hasActiveOverride', () => {
  it('returns false when no overrides exist for the prompt id', () => {
    expect(hasActiveOverride('missing-id', [])).toBe(false);
  });

  it('returns false when the only override is an empty-stub', () => {
    const overrides = [makeOverrideFile('prompt-a', 'system-prompts-fable-5', '')];
    expect(hasActiveOverride('prompt-a', overrides)).toBe(false);
  });

  it('returns false when all overrides across model sets are empty-stubs', () => {
    const overrides = [
      makeOverrideFile('prompt-a', 'system-prompts-fable-5', ''),
      makeOverrideFile('prompt-a', 'system-prompts-opus-4-7', ''),
      makeOverrideFile('prompt-a', 'system-prompts-opus-4-8', ''),
    ];
    expect(hasActiveOverride('prompt-a', overrides)).toBe(false);
  });

  it('returns true when at least one override has an active body', () => {
    const overrides = [
      makeOverrideFile('prompt-a', 'system-prompts-fable-5', ''),
      makeOverrideFile('prompt-a', 'system-prompts-opus-4-7', 'Be terse. Do not hedge.'),
    ];
    expect(hasActiveOverride('prompt-a', overrides)).toBe(true);
  });

  it('returns true when all overrides are active', () => {
    const overrides = [
      makeOverrideFile('prompt-a', 'system-prompts-fable-5', 'Override text.'),
      makeOverrideFile('prompt-a', 'system-prompts-opus-4-7', 'Override text.'),
    ];
    expect(hasActiveOverride('prompt-a', overrides)).toBe(true);
  });

  it('ignores overrides for other prompt ids', () => {
    const overrides = [makeOverrideFile('prompt-b', 'system-prompts-fable-5', 'Active body.')];
    expect(hasActiveOverride('prompt-a', overrides)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// subtractActiveOverrides
// ---------------------------------------------------------------------------

describe('subtractActiveOverrides', () => {
  it('returns empty list when rankings is empty', () => {
    expect(subtractActiveOverrides([], [])).toEqual([]);
  });

  it('returns empty list when all candidates are below the bar (nothing clears)', () => {
    const rankings = [makeRanking('prompt-a', false), makeRanking('prompt-b', false)];
    expect(subtractActiveOverrides(rankings, [])).toHaveLength(0);
  });

  it('returns a gap when candidate clears bar and has no override', () => {
    const rankings = [makeRanking('prompt-a', true)];
    const gaps = subtractActiveOverrides(rankings, []);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]!.promptId).toBe('prompt-a');
    expect(gaps[0]!.ranking.clearsBar).toBe(true);
  });

  it('excludes a candidate that clears bar but has an active override', () => {
    const rankings = [makeRanking('prompt-a', true)];
    const overrides = [makeOverrideFile('prompt-a', 'system-prompts-fable-5', 'He already covers it.')];
    expect(subtractActiveOverrides(rankings, overrides)).toHaveLength(0);
  });

  it('includes a candidate whose only override is an empty-stub (covered=false)', () => {
    const rankings = [makeRanking('prompt-a', true)];
    const overrides = [makeOverrideFile('prompt-a', 'system-prompts-fable-5', '')];
    const gaps = subtractActiveOverrides(rankings, overrides);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]!.promptId).toBe('prompt-a');
  });

  it('returns only genuine gaps from a mixed list', () => {
    // prompt-a: clears bar, no override → gap
    // prompt-b: clears bar, active override → covered, excluded
    // prompt-c: below bar, no override → excluded (bar not cleared)
    // prompt-d: clears bar, empty-stub override → gap (stub = not covered)
    const rankings = [
      makeRanking('prompt-a', true),
      makeRanking('prompt-b', true),
      makeRanking('prompt-c', false),
      makeRanking('prompt-d', true),
    ];
    const overrides = [
      makeOverrideFile('prompt-b', 'system-prompts-fable-5', 'Active override body.'),
      makeOverrideFile('prompt-d', 'system-prompts-opus-4-7', ''), // empty-stub
    ];
    const gaps = subtractActiveOverrides(rankings, overrides);
    expect(gaps.map((g) => g.promptId)).toEqual(['prompt-a', 'prompt-d']);
  });

  it('carries the full ranking on each gap candidate', () => {
    const ranking = makeRanking('prompt-a', true, 4);
    const gaps = subtractActiveOverrides([ranking], []);
    expect(gaps[0]!.ranking).toBe(ranking);
  });

  it('"nothing to add" — valid output when all bar-clearing candidates are covered', () => {
    const rankings = [makeRanking('prompt-a', true), makeRanking('prompt-b', true)];
    const overrides = [
      makeOverrideFile('prompt-a', 'system-prompts-fable-5', 'Active.'),
      makeOverrideFile('prompt-b', 'system-prompts-fable-5', 'Also active.'),
    ];
    const gaps = subtractActiveOverrides(rankings, overrides);
    // "nothing to add" is the valid, expected output — no crash, empty array
    expect(gaps).toHaveLength(0);
  });
});
