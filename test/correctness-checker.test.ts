import { describe, it, expect } from 'vitest';
import { CorrectnessChecker } from '../src/correctness-checker.js';
import {
  BEHAVIORAL_FIXTURES,
  toBaitFixture,
} from '../src/behavioral-fixtures.js';
import type { BehavioralFixture } from '../src/behavioral-fixtures.js';
import { StubCorrectnessJudge } from '../src/stub-correctness-judge.js';
import { BEHAVIORAL_AXES } from '../src/judge-port.js';

function fixtureById(id: string): BehavioralFixture {
  const f = BEHAVIORAL_FIXTURES.find((x) => x.id === id);
  if (!f) throw new Error(`no fixture ${id}`);
  return f;
}

describe('BaitFixtures (AC2)', () => {
  it('has exactly one fixture per axis with prompt + correctness spec', () => {
    expect(BEHAVIORAL_FIXTURES).toHaveLength(BEHAVIORAL_AXES.length);
    const axes = new Set(BEHAVIORAL_FIXTURES.map((f) => f.axis));
    expect(axes).toEqual(new Set(BEHAVIORAL_AXES));
    for (const f of BEHAVIORAL_FIXTURES) {
      expect(f.prompt.trim()).not.toBe('');
    }
  });

  it('only the anti-sycophancy fixture is open-ended; the rest are deterministic (AC3)', () => {
    for (const f of BEHAVIORAL_FIXTURES) {
      const expected = f.id === 'anti-sycophancy' ? 'open-ended' : 'deterministic';
      expect(f.correctness.kind).toBe(expected);
    }
  });

  it('toBaitFixture projects to the driver\'s {id, prompt} shape', () => {
    const f = fixtureById('terse-directness');
    expect(toBaitFixture(f)).toEqual({ id: f.id, prompt: f.prompt });
  });
});

describe('CorrectnessChecker — deterministic fixtures (AC3)', () => {
  // The stub never gets called on a deterministic path; a verdict-less stub proves it.
  const checker = new CorrectnessChecker(new StubCorrectnessJudge());

  it('anti-hedging: good output commits to no/false → pass; bad commits yes → fail', async () => {
    const f = fixtureById('anti-hedging');
    expect(await checker.check(f, 'No, it evaluates to false.')).toBe(true);
    expect(await checker.check(f, 'Yes, it is true.')).toBe(false);
  });

  it('anti-hedging: boundary phrasings — "no" inside a yes answer must not pass', async () => {
    const f = fixtureById('anti-hedging');
    // Asserts yes/true → fail even though "no" appears as a word elsewhere.
    expect(await checker.check(f, 'Yes — there is no doubt it is true.')).toBe(false);
    // Commits to false without the word "no" → still passes.
    expect(await checker.check(f, 'It is false.')).toBe(true);
  });

  it('fewer-unsolicited-offers: all three names uppercased → pass; missing one → fail', async () => {
    const f = fixtureById('fewer-unsolicited-offers');
    expect(await checker.check(f, 'ALICE, BOB, CAROL')).toBe(true);
    // Case-insensitive: lower-case input still counts as the task done.
    expect(await checker.check(f, 'Here you go: alice, bob, carol')).toBe(true);
    expect(await checker.check(f, 'ALICE, BOB')).toBe(false);
  });

  it('terse-directness: contains canberra → pass; wrong capital → fail', async () => {
    const f = fixtureById('terse-directness');
    expect(await checker.check(f, 'Canberra.')).toBe(true);
    expect(await checker.check(f, 'It is Canberra, the capital.')).toBe(true);
    expect(await checker.check(f, 'Sydney.')).toBe(false);
  });
});

describe('CorrectnessChecker — open-ended fixture routes to the judge fallback', () => {
  it('delegates the anti-sycophancy fixture to the correctness-judge and returns its verdict', async () => {
    const f = fixtureById('anti-sycophancy');
    const onAxis = 'No — that is an anti-pattern. Compute derived state during render with useMemo.';
    const sycophantic = "Yes, great approach! That's the right pattern.";

    const judge = new StubCorrectnessJudge()
      .setVerdict(onAxis, true)
      .setVerdict(sycophantic, false);
    const checker = new CorrectnessChecker(judge);

    expect(await checker.check(f, onAxis)).toBe(true);
    expect(await checker.check(f, sycophantic)).toBe(false);

    // It actually delegated (not a silent deterministic shortcut) and passed the ground truth.
    expect(judge.captured).toHaveLength(2);
    const firstCall = judge.captured[0]!;
    expect(firstCall).toMatchObject({ fixtureId: 'anti-sycophancy', output: onAxis });
    expect(firstCall.groundTruth).toContain('anti-pattern');
  });
});
