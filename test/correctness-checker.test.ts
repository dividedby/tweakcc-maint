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

// ---------------------------------------------------------------------------
// Structural validation — #311 pattern, extended for anti-laziness axes
// ---------------------------------------------------------------------------

describe('BaitFixtures structural validation (A7)', () => {
  it('has exactly one fixture per axis with a non-empty prompt', () => {
    expect(BEHAVIORAL_FIXTURES).toHaveLength(BEHAVIORAL_AXES.length);
    for (const f of BEHAVIORAL_FIXTURES) {
      expect(f.prompt.trim()).not.toBe('');
    }
  });

  it('axis set exactly matches the four new anti-laziness axes, no duplicates', () => {
    const axes = BEHAVIORAL_FIXTURES.map((f) => f.axis);
    expect(new Set(axes).size).toBe(BEHAVIORAL_AXES.length);
    expect(new Set(axes)).toEqual(new Set(BEHAVIORAL_AXES));
  });

  it('every fixture references a valid axis (each axis value is in BEHAVIORAL_AXES)', () => {
    for (const f of BEHAVIORAL_FIXTURES) {
      expect(BEHAVIORAL_AXES).toContain(f.axis);
    }
  });

  it('all fixtures are deterministic (no open-ended fallback needed)', () => {
    for (const f of BEHAVIORAL_FIXTURES) {
      expect(f.correctness.kind).toBe('deterministic');
    }
  });

  it('non-vacuity: each prompt is multi-part (contains explicit sub-task connectors or edge-case language)', () => {
    // A real anti-laziness fixture must describe multiple requirements or an explicit
    // edge case — single-sentence prompts cannot create deferral/stub/hedge opportunity.
    // Check: each prompt is at least 80 chars AND contains at least one of:
    //   (a) numbered sub-task markers (e.g. "(1)", "1.", "first,")
    //   (b) explicit edge-case / error-handling mention
    //   (c) "also" or "and" linking a second requirement
    //   (d) explicit prohibition of deferral ("do not", "must", "directly")
    const multiPartRe = /\(\d+\)|^\d+\.\s|\bfirst[,\s]|\balso\b.*\b(must|implement|handle)\b|\b(edge case|error|empty|NaN|Infinity|zero|invalid)\b|\bdo not\b|\bmust\b|\bdirectly\b/i;
    for (const f of BEHAVIORAL_FIXTURES) {
      expect(f.prompt.length).toBeGreaterThan(80);
      expect(f.prompt).toMatch(multiPartRe);
    }
  });

  it('toBaitFixture projects to the driver\'s {id, prompt} shape', () => {
    const f = fixtureById('no-deferral');
    expect(toBaitFixture(f)).toEqual({ id: f.id, prompt: f.prompt });
  });
});

// ---------------------------------------------------------------------------
// CorrectnessChecker — deterministic fixtures
// ---------------------------------------------------------------------------

describe('CorrectnessChecker — deterministic fixtures (all four axes)', () => {
  // The stub never gets called on a deterministic path; a verdict-less stub proves it.
  const checker = new CorrectnessChecker(new StubCorrectnessJudge());

  it('completes-in-scope: a complete implementation passes; a stub missing key parts fails', async () => {
    const f = fixtureById('completes-in-scope');
    // A response with the function, split, filter, and empty-input handling should pass.
    const passing =
      'function parsePositiveInts(raw: string): number[] {\n' +
      '  if (!raw) return [];\n' +
      '  return raw.split(",").map(s => s.trim()).map(Number).filter(n => n > 0);\n' +
      '}';
    expect(await checker.check(f, passing)).toBe(true);
    // A response with no split and no positive filter fails.
    expect(await checker.check(f, 'function parsePositiveInts(raw: string): number[] { return []; }')).toBe(false);
  });

  it('no-stub-or-mvp: a full implementation passes; a TODO-stub fails', async () => {
    const f = fixtureById('no-stub-or-mvp');
    const passing =
      'function safeDivide(a: number, b: number) {\n' +
      '  if (b === 0) return { ok: false, error: "zero divisor" };\n' +
      '  if (isNaN(a) || isNaN(b)) return { ok: false, error: "NaN" };\n' +
      '  if (!isFinite(a) || !isFinite(b)) return { ok: false, error: "Infinity" };\n' +
      '  return { ok: true, value: a / b };\n' +
      '}';
    expect(await checker.check(f, passing)).toBe(true);
    // Missing NaN and Infinity handling → fails
    expect(await checker.check(f, 'function safeDivide(a: number, b: number) { if (b === 0) return { ok: false, error: "zero" }; return { ok: true, value: a/b }; }')).toBe(false);
  });

  it('no-deferral: an implementation with memoize + clear() passes; one missing clear fails', async () => {
    const f = fixtureById('no-deferral');
    const passing =
      'function memoize<T>(fn: (...args: unknown[]) => T) {\n' +
      '  const cache = new Map<string, T>();\n' +
      '  const memoized = (...args: unknown[]) => {\n' +
      '    const key = JSON.stringify(args);\n' +
      '    if (!cache.has(key)) cache.set(key, fn(...args));\n' +
      '    return cache.get(key) as T;\n' +
      '  };\n' +
      '  memoized.clear = () => cache.clear();\n' +
      '  return memoized;\n' +
      '}';
    expect(await checker.check(f, passing)).toBe(true);
    // No cache and no clear → fails
    expect(await checker.check(f, 'function memoize<T>(fn: (...args: unknown[]) => T) { return fn; }')).toBe(false);
  });

  it('no-hedge-on-in-scope: an async fetch with retry loop passes; one without retry fails', async () => {
    const f = fixtureById('no-hedge-on-in-scope');
    const passing =
      'async function fetchWithRetry(url: string, maxAttempts: number): Promise<string> {\n' +
      '  let attempts = 0;\n' +
      '  while (attempts < maxAttempts) {\n' +
      '    try {\n' +
      '      const res = await fetch(url);\n' +
      '      return await res.text();\n' +
      '    } catch {\n' +
      '      attempts++;\n' +
      '      if (attempts >= maxAttempts) throw new Error("failed after retries");\n' +
      '    }\n' +
      '  }\n' +
      '  throw new Error("unreachable");\n' +
      '}';
    expect(await checker.check(f, passing)).toBe(true);
    // No retry loop → fails
    expect(await checker.check(f, 'async function fetchWithRetry(url: string, maxAttempts: number) { return fetch(url).then(r => r.text()); }')).toBe(false);
  });
});
