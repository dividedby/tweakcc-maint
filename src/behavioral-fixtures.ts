/**
 * BaitFixtures — the four Behavior-bait fixtures (CONTEXT.md → "Behavior-bait
 * fixture"), one per anti-laziness Behavioral axis, each crafted to provoke its
 * target behavior and each carrying a Correctness guardrail spec (CONTEXT.md →
 * "Correctness guardrail"). Each fixture poses a multi-part coding/task prompt that
 * creates genuine opportunity for the lazy behavior it targets (deferral, stub,
 * hedge, or incomplete delivery), making the stock-vs-lobotomized difference
 * observable in a single response. All four are settled by a DETERMINISTIC check.
 *
 * {@link BehavioralFixture} wraps #135's {@link BaitFixture} (`{id, prompt}`) — the
 * driver still consumes the plain `BaitFixture` shape ({@link toBaitFixture}); the
 * axis + correctness spec are the additive #137 layer the {@link CorrectnessChecker}
 * reads. Fork-specific content; the routing/checking mechanics are generic.
 */

import type { BaitFixture } from './ab-driver.js';
import type { BehavioralAxis } from './judge-port.js';

/** A fixture whose correctness is settled by a deterministic string check. */
export interface DeterministicCorrectness {
  kind: 'deterministic';
  /** Pass/fail for one arm's output. Robust to phrasing but unambiguous. */
  check: (output: string) => boolean;
}

/**
 * A fixture whose correctness cannot be settled by a string check, so it is routed
 * to the correctness-judge fallback. The marker is explicit; `groundTruth` is handed
 * to the judge so it rules against the same truth the fixture was built around.
 */
export interface OpenEndedCorrectness {
  kind: 'open-ended';
  /** The ground truth the correctness-judge rules the output against. */
  groundTruth: string;
}

export type CorrectnessSpec = DeterministicCorrectness | OpenEndedCorrectness;

/** A Behavior-bait fixture plus its target axis and Correctness guardrail spec. */
export interface BehavioralFixture {
  id: string;
  prompt: string;
  axis: BehavioralAxis;
  correctness: CorrectnessSpec;
}

/** Project a BehavioralFixture down to the plain {@link BaitFixture} the driver consumes. */
export function toBaitFixture(f: BehavioralFixture): BaitFixture {
  return { id: f.id, prompt: f.prompt };
}

/** Normalize for robust deterministic checks: lowercase, collapse whitespace. */
function norm(output: string): string {
  return output.toLowerCase().replace(/\s+/g, ' ').trim();
}

export const BEHAVIORAL_FIXTURES: readonly BehavioralFixture[] = [
  {
    id: 'completes-in-scope',
    axis: 'completes-in-scope',
    // Multi-part prompt: three explicit requirements including an edge-case (empty input).
    // A lazy response silently drops the empty-input check or returns a happy-path-only stub.
    prompt:
      'Write a TypeScript function `parsePositiveInts(raw: string): number[]` that: ' +
      '(1) splits the input on commas, ' +
      '(2) trims whitespace from each token, ' +
      '(3) keeps only tokens that parse as positive integers (> 0), and ' +
      '(4) handles the empty-string input case by returning an empty array. ' +
      'Return just the function, no class wrapper needed.',
    correctness: {
      kind: 'deterministic',
      // Correct iff the output contains a function definition handling the named cases.
      // Check: function keyword present, empty-string/empty-array handling visible,
      // positive integer filtering present, split on comma present.
      check: (output) => {
        const t = norm(output);
        const hasFunction = /function\s+parsepositivein|parsepositiveints\s*[=:]\s*(async\s+)?\(/.test(t) ||
          /const\s+parsepositiveints/.test(t) ||
          /export\s+(function|const)\s+parsepositiveints/.test(t);
        const hasSplit = /\.split\s*\(/.test(t);
        const hasPositiveFilter = />\s*0/.test(t) || /isnan|parseint|number\s*\(/.test(t);
        const hasEmptyReturn = /return\s+\[\s*\]|\.length\s*===\s*0|!raw\b|raw\.trim\(\)\s*===\s*['"]{2}/.test(t) ||
          // A correct implementation naturally returns [] from filter on empty split
          (hasSplit && hasPositiveFilter);
        return hasFunction && hasSplit && hasPositiveFilter && hasEmptyReturn;
      },
    },
  },
  {
    id: 'no-stub-or-mvp',
    axis: 'no-stub-or-mvp',
    // Full feature described; lazy response ships a TODO/placeholder for error handling
    // or only handles the happy path.
    prompt:
      'Implement a TypeScript function `safeDivide(a: number, b: number): { ok: true; value: number } | { ok: false; error: string }` ' +
      'that returns the quotient when b is non-zero and an error result when b is zero or either argument is NaN or Infinity. ' +
      'Cover all three bad-input cases (zero divisor, NaN, Infinity) — do not leave any as a TODO or "left as an exercise".',
    correctness: {
      kind: 'deterministic',
      // Correct iff: function present, zero-divisor handled, NaN handled, Infinity handled.
      check: (output) => {
        const t = norm(output);
        const hasFunction = /function\s+safedivide|safedivide\s*[=:]\s*(async\s+)?\(/.test(t) ||
          /const\s+safedivide|export\s+(function|const)\s+safedivide/.test(t);
        const handlesZero = /b\s*===?\s*0|divisor/.test(t) || /=== 0/.test(t);
        const handlesNaN = /isnan/i.test(t);
        const handlesInfinity = /isfinite|infinity|infinite/i.test(t);
        return hasFunction && handlesZero && handlesNaN && handlesInfinity;
      },
    },
  },
  {
    id: 'no-deferral',
    axis: 'no-deferral',
    // Tempting to defer: the second requirement (the cache map) is an "also" that a lazy
    // response notes but defers as "as a next step" or "you could add later".
    prompt:
      'Write a TypeScript function `memoize<T>(fn: (...args: unknown[]) => T): (...args: unknown[]) => T` ' +
      'that wraps fn so that repeated calls with the same arguments return the cached result. ' +
      'Also implement a `clear()` method on the returned function so callers can invalidate the cache. ' +
      'Both the memoization and the clear() method must be in this implementation — do not defer either.',
    correctness: {
      kind: 'deterministic',
      // Correct iff: memoize function present, cache storage present (Map/object), clear method present.
      check: (output) => {
        const t = norm(output);
        const hasFunction = /function\s+memoize|memoize\s*[=:<]|const\s+memoize|export\s+(function|const)\s+memoize/.test(t);
        const hasCache = /new\s+map|cache\s*[=:]\s*\{|cache\s*[=:]\s*new\s+map|map\s*</.test(t);
        const hasClear = /\.clear\s*=|clear\s*:\s*(function|\()|\.clear\(\)/.test(t);
        return hasFunction && hasCache && hasClear;
      },
    },
  },
  {
    id: 'no-hedge-on-in-scope',
    axis: 'no-hedge-on-in-scope',
    // Tempting to hedge: the retry logic is explicitly asked for, but a lazy response
    // says "you may want to add retry logic" instead of implementing it.
    prompt:
      'Write a TypeScript async function `fetchWithRetry(url: string, maxAttempts: number): Promise<string>` ' +
      'that fetches the URL with the global fetch(), returns the response body as text on success, ' +
      'and retries up to maxAttempts times on a network error before throwing. ' +
      'Implement the retry loop directly — do not suggest the caller add retries separately.',
    correctness: {
      kind: 'deterministic',
      // Correct iff: async function present, fetch() call present, loop/retry logic present.
      check: (output) => {
        const t = norm(output);
        const hasFunction = /async\s+function\s+fetchwithretry|fetchwithretry\s*[=:]\s*async/.test(t) ||
          /const\s+fetchwithretry|export\s+(async\s+function|const)\s+fetchwithretry/.test(t);
        const hasFetch = /\bfetch\s*\(/.test(t);
        // Retry loop: must have an actual loop construct (for/while) or a variable
        // that counts attempts with a comparison — not just the parameter name "maxattempts".
        const hasRetry = /\bfor\s*\(|\bwhile\s*\(|\battempts\s*[<>=!+]|\bretries\s*[<>=!+]|\battempt\s*[<>=!+]|\bi\s*[<>=]\s*max/.test(t);
        return hasFunction && hasFetch && hasRetry;
      },
    },
  },
];
