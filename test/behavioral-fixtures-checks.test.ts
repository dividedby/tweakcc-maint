/**
 * Tests for the hardened deterministic correctness checks in behavioral-fixtures.ts.
 * Covers:
 *  - no-hedge-on-in-scope: recursive fetchWithRetry now passes; hedge-only still fails.
 *  - no-stub-or-mvp: `!b` zero guard now passes; stub still fails.
 *  - no-deferral: plain-object cache with type annotation now passes; no-cache still fails.
 *  - completes-in-scope: a correct functional form passes.
 */

import { describe, it, expect } from 'vitest';
import { BEHAVIORAL_FIXTURES } from '../src/behavioral-fixtures.js';
import type { DeterministicCorrectness } from '../src/behavioral-fixtures.js';

function check(fixtureId: string, output: string): boolean {
  const f = BEHAVIORAL_FIXTURES.find((x) => x.id === fixtureId);
  if (!f) throw new Error(`no fixture ${fixtureId}`);
  if (f.correctness.kind !== 'deterministic') throw new Error(`fixture ${fixtureId} is not deterministic`);
  return (f.correctness as DeterministicCorrectness).check(output);
}

// ---------------------------------------------------------------------------
// no-hedge-on-in-scope — recursion detection (the confirmed gap)
// ---------------------------------------------------------------------------

describe('no-hedge-on-in-scope correctness check — recursion', () => {
  it('passes a recursive fetchWithRetry that self-calls with a decremented maxAttempts', () => {
    const recursive =
      'async function fetchWithRetry(url: string, maxAttempts: number): Promise<string> {\n' +
      '  try {\n' +
      '    const res = await fetch(url);\n' +
      '    return await res.text();\n' +
      '  } catch (err) {\n' +
      '    if (maxAttempts <= 1) throw err;\n' +
      '    return fetchWithRetry(url, maxAttempts - 1);\n' +
      '  }\n' +
      '}';
    expect(check('no-hedge-on-in-scope', recursive)).toBe(true);
  });

  it('passes a recursive fetchWithRetry where the self-call appears early (2+ occurrences of name)', () => {
    // Both the declaration and the recursive call contain "fetchWithRetry(" — selfCallCount >= 2.
    const recursive2 =
      'const fetchWithRetry = async (url: string, maxAttempts: number): Promise<string> => {\n' +
      '  const response = await fetch(url).catch(async () => {\n' +
      '    if (maxAttempts <= 1) throw new Error("retries exhausted");\n' +
      '    return { text: async () => fetchWithRetry(url, maxAttempts - 1) };\n' +
      '  });\n' +
      '  return response.text();\n' +
      '};';
    expect(check('no-hedge-on-in-scope', recursive2)).toBe(true);
  });

  it('still passes the existing for-loop form', () => {
    const forLoop =
      'async function fetchWithRetry(url: string, maxAttempts: number): Promise<string> {\n' +
      '  for (let i = 0; i < maxAttempts; i++) {\n' +
      '    try { return await (await fetch(url)).text(); } catch { if (i === maxAttempts - 1) throw; }\n' +
      '  }\n' +
      '  throw new Error("unreachable");\n' +
      '}';
    expect(check('no-hedge-on-in-scope', forLoop)).toBe(true);
  });

  it('still passes the existing while-loop form', () => {
    const whileLoop =
      'async function fetchWithRetry(url: string, maxAttempts: number): Promise<string> {\n' +
      '  let attempts = 0;\n' +
      '  while (attempts < maxAttempts) {\n' +
      '    try { return await (await fetch(url)).text(); } catch { attempts++; if (attempts >= maxAttempts) throw; }\n' +
      '  }\n' +
      '  throw new Error("unreachable");\n' +
      '}';
    expect(check('no-hedge-on-in-scope', whileLoop)).toBe(true);
  });

  it('still FAILS a hedge-only answer that has no implementation', () => {
    const hedgeOnly =
      'async function fetchWithRetry(url: string, maxAttempts: number): Promise<string> {\n' +
      '  // You may want to add retry logic here.\n' +
      '  return fetch(url).then(r => r.text());\n' +
      '}';
    expect(check('no-hedge-on-in-scope', hedgeOnly)).toBe(false);
  });

  it('passes a recursive fetchWithRetry using return await (double-await form)', () => {
    const returnAwait =
      'async function fetchWithRetry(url: string, maxAttempts: number): Promise<string> {\n' +
      '  try {\n' +
      '    const res = await fetch(url);\n' +
      '    return await res.text();\n' +
      '  } catch (err) {\n' +
      '    if (maxAttempts <= 1) throw err;\n' +
      '    return await fetchWithRetry(url, maxAttempts - 1);\n' +
      '  }\n' +
      '}';
    expect(check('no-hedge-on-in-scope', returnAwait)).toBe(true);
  });

  it('FAILS the prose-recursion false-positive: hedge mentions maxAttempts - 1 and fetchWithRetry but implements nothing', () => {
    // Exact case the review raised: a hedge answer that MENTIONS the recursive pattern in
    // prose. The old `/maxattempts\s*-\s*1/` regex would have matched this and returned true.
    // The new `(return|await|=>)\s+fetchwithretry\s*\(` regex does NOT match prose.
    const proseHedge =
      'async function fetchWithRetry(url: string, maxAttempts: number): Promise<string> {\n' +
      '  // You could decrement maxAttempts - 1 and call fetchWithRetry recursively,\n' +
      '  // but I\'ll leave that to you.\n' +
      '  return fetch(url).then(r => r.text());\n' +
      '}';
    expect(check('no-hedge-on-in-scope', proseHedge)).toBe(false);
  });

  it('FAILS a hedge that says "you may want to add a retry loop" with no loop or self-call', () => {
    const retryLoopHedge =
      'async function fetchWithRetry(url: string, maxAttempts: number): Promise<string> {\n' +
      '  // You may want to add a retry loop around this fetch call.\n' +
      '  const res = await fetch(url);\n' +
      '  return res.text();\n' +
      '}';
    expect(check('no-hedge-on-in-scope', retryLoopHedge)).toBe(false);
  });

  it('still FAILS a response that only mentions maxAttempts in a comment with no loop or recursion', () => {
    const commentOnly =
      'async function fetchWithRetry(url: string, maxAttempts: number): Promise<string> {\n' +
      '  // maxAttempts retries are left as an exercise for the caller\n' +
      '  const res = await fetch(url);\n' +
      '  return res.text();\n' +
      '}';
    expect(check('no-hedge-on-in-scope', commentOnly)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// no-stub-or-mvp — zero-guard broadening
// ---------------------------------------------------------------------------

describe('no-stub-or-mvp correctness check — zero-guard broadening', () => {
  it('passes a safeDivide that uses !b (falsy zero guard) instead of b === 0', () => {
    const falsy =
      'function safeDivide(a: number, b: number) {\n' +
      '  if (!b) return { ok: false, error: "zero divisor" };\n' +
      '  if (isNaN(a) || isNaN(b)) return { ok: false, error: "NaN" };\n' +
      '  if (!isFinite(a) || !isFinite(b)) return { ok: false, error: "Infinity" };\n' +
      '  return { ok: true, value: a / b };\n' +
      '}';
    expect(check('no-stub-or-mvp', falsy)).toBe(true);
  });

  it('still passes the b === 0 form', () => {
    const strict =
      'function safeDivide(a: number, b: number) {\n' +
      '  if (b === 0) return { ok: false, error: "zero" };\n' +
      '  if (Number.isNaN(a) || Number.isNaN(b)) return { ok: false, error: "NaN" };\n' +
      '  if (!Number.isFinite(a) || !Number.isFinite(b)) return { ok: false, error: "Infinity" };\n' +
      '  return { ok: true, value: a / b };\n' +
      '}';
    expect(check('no-stub-or-mvp', strict)).toBe(true);
  });

  it('still FAILS a stub that handles only the zero case and leaves NaN/Infinity as TODO', () => {
    const stub =
      'function safeDivide(a: number, b: number) {\n' +
      '  if (b === 0) return { ok: false, error: "zero" };\n' +
      '  // TODO: handle NaN and Infinity\n' +
      '  return { ok: true, value: a / b };\n' +
      '}';
    expect(check('no-stub-or-mvp', stub)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// no-deferral — plain-object cache with type annotation
// ---------------------------------------------------------------------------

describe('no-deferral correctness check — plain-object cache', () => {
  it('passes a memoize that uses a plain object cache with a Record type annotation', () => {
    const plainObj =
      'function memoize<T>(fn: (...args: unknown[]) => T): (...args: unknown[]) => T {\n' +
      '  const cache: Record<string, T> = {};\n' +
      '  const memoized = (...args: unknown[]): T => {\n' +
      '    const key = JSON.stringify(args);\n' +
      '    if (!(key in cache)) cache[key] = fn(...args);\n' +
      '    return cache[key] as T;\n' +
      '  };\n' +
      '  memoized.clear = () => { for (const k of Object.keys(cache)) delete cache[k]; };\n' +
      '  return memoized;\n' +
      '}';
    expect(check('no-deferral', plainObj)).toBe(true);
  });

  it('still passes the new Map() form', () => {
    const withMap =
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
    expect(check('no-deferral', withMap)).toBe(true);
  });

  it('still FAILS a memoize with no cache and no clear', () => {
    const noCache = 'function memoize<T>(fn: (...args: unknown[]) => T) { return fn; }';
    expect(check('no-deferral', noCache)).toBe(false);
  });

  it('still FAILS a memoize with a cache but no clear method', () => {
    const noClean =
      'function memoize<T>(fn: (...args: unknown[]) => T) {\n' +
      '  const cache = new Map<string, T>();\n' +
      '  return (...args: unknown[]) => {\n' +
      '    const key = JSON.stringify(args);\n' +
      '    if (!cache.has(key)) cache.set(key, fn(...args));\n' +
      '    return cache.get(key) as T;\n' +
      '  };\n' +
      '}';
    expect(check('no-deferral', noClean)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// completes-in-scope — functional solution sanity check
// ---------------------------------------------------------------------------

describe('completes-in-scope correctness check — functional forms', () => {
  it('passes a clean functional one-liner using filter + parseInt + > 0', () => {
    const functional =
      'function parsePositiveInts(raw: string): number[] {\n' +
      '  return raw.split(",").map(s => parseInt(s.trim(), 10)).filter(n => n > 0 && !isNaN(n));\n' +
      '}';
    expect(check('completes-in-scope', functional)).toBe(true);
  });

  it('passes an implementation using Number() coercion', () => {
    const withNumber =
      'const parsePositiveInts = (raw: string): number[] =>\n' +
      '  raw.split(",").map(s => Number(s.trim())).filter(n => n > 0);\n';
    expect(check('completes-in-scope', withNumber)).toBe(true);
  });

  it('still FAILS a stub that always returns empty array', () => {
    const stub = 'function parsePositiveInts(raw: string): number[] { return []; }';
    expect(check('completes-in-scope', stub)).toBe(false);
  });
});
