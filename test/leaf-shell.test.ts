import { describe, it, expect } from 'vitest';
import { normalizeBootVerify, combinedOutput, type ShellResult } from '../src/leaf-shell.js';
import { evaluate } from '../src/four-zeros-verdict.js';
import { formatValidatorOutput } from '../src/orphan-validator.js';

function result(over: Partial<ShellResult>): ShellResult {
  return { status: 0, stdout: '', stderr: '', ...over };
}

describe('normalizeBootVerify — translate a claude -p result into the verdict marker', () => {
  it('exit 0 with a non-empty reply → carries the Boot-verify OK marker', () => {
    const out = normalizeBootVerify(result({ status: 0, stdout: 'ok\n' }));
    expect(out).toContain('Boot-verify OK');
    // And the verdict accepts it.
    expect(evaluate({ apply: '', bootVerify: out, validator: '' }).bootVerifyPassed).toBe(true);
  });

  it('non-zero exit → no marker, verdict fails boot-verify', () => {
    const out = normalizeBootVerify(result({ status: 1, stderr: 'auth error' }));
    expect(out).not.toContain('Boot-verify OK');
    expect(evaluate({ apply: '', bootVerify: out, validator: '' }).bootVerifyPassed).toBe(false);
  });

  it('exit 0 but empty reply → treated as failure (binary booted but did not respond)', () => {
    const out = normalizeBootVerify(result({ status: 0, stdout: '   \n' }));
    expect(out).not.toContain('Boot-verify OK');
  });

  it('does not echo failure stdout into the message (no marker smuggling)', () => {
    const out = normalizeBootVerify(result({ status: 1, stdout: 'Boot-verify OK (fluke reply)' }));
    expect(out).not.toContain('Boot-verify OK');
  });
});

describe('combinedOutput', () => {
  it('joins stdout and stderr, dropping empty streams', () => {
    expect(combinedOutput(result({ stdout: 'a', stderr: 'b' }))).toBe('a\nb');
    expect(combinedOutput(result({ stdout: 'a', stderr: '' }))).toBe('a');
  });
});

describe('orphan validator → FourZerosVerdict end-to-end (pure)', () => {
  const legal = (vs: string[]) => new Map([['a', new Set(vs)]]);

  it('an orphan in the override signal fails the verdict on the orphan-variable axis', () => {
    const validator = formatValidatorOutput(
      [{ path: 'a.md', content: '<!--\nvariables:\n  - MISSING\n-->\nbody' }],
      legal([]),
    );
    const verdict = evaluate({
      apply: 'All patches applied.',
      bootVerify: 'Boot-verify OK',
      validator,
    });
    expect(verdict.orphanVariables).toEqual(['MISSING']);
    expect(verdict.pass).toBe(false);
  });

  it('a clean override signal passes the orphan-variable axis', () => {
    const validator = formatValidatorOutput(
      [{ path: 'a.md', content: '<!--\nvariables:\n  - X\n-->\nbody' }],
      legal(['X']),
    );
    const verdict = evaluate({
      apply: 'All patches applied.',
      bootVerify: 'Boot-verify OK',
      validator,
    });
    expect(verdict.orphanVariables).toEqual([]);
    expect(verdict.pass).toBe(true);
  });
});
