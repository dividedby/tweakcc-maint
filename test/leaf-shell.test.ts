import { describe, it, expect } from 'vitest';
import { runSync, normalizeBootVerify, combinedOutput, extractResultText, type ShellResult } from '../src/leaf-shell.js';
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

describe('extractResultText — reply from claude -p stream-json output', () => {
  const assistant = '{"type":"assistant","message":{"content":[{"type":"text","text":"ok"}]}}';
  const ok = '{"type":"result","subtype":"success","is_error":false,"result":"ok","total_cost_usd":0.0012,"num_turns":1}';

  it('returns the result event reply text', () => {
    expect(extractResultText(`${assistant}\n${ok}`)).toBe('ok');
  });

  it('errored result yields empty (boot-verify treats it as a failure)', () => {
    const err = '{"type":"result","is_error":true,"result":"boom"}';
    expect(extractResultText(err)).toBe('');
  });

  it('skips non-JSON lines and tolerates no result event', () => {
    expect(extractResultText('warming up...\n' + assistant)).toBe('');
  });

  it('takes the last result event when several are present', () => {
    const first = '{"type":"result","is_error":false,"result":"first"}';
    expect(extractResultText(`${first}\n${ok}`)).toBe('ok');
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

  it('a static-validator orphan is surfaced as ADVISORY, not a hard fail (ADR 0005)', () => {
    const validator = formatValidatorOutput(
      [{ path: 'a.md', content: '<!--\nvariables:\n  - MISSING\n-->\nbody' }],
      legal([]),
    );
    const verdict = evaluate({
      apply: 'All patches applied.',
      bootVerify: 'Boot-verify OK',
      validator,
    });
    // The authoring-drift check no longer fails the bar; it is advisory only.
    expect(verdict.advisoryOrphans).toEqual(['MISSING']);
    expect(verdict.orphanVariables).toEqual([]);
    expect(verdict.orphanSource).toBe('boot-verify-fallback');
    expect(verdict.pass).toBe(true);
  });

  it('a clean override signal yields no advisory findings and passes', () => {
    const validator = formatValidatorOutput(
      [{ path: 'a.md', content: '<!--\nvariables:\n  - X\n-->\nbody' }],
      legal(['X']),
    );
    const verdict = evaluate({
      apply: 'All patches applied.',
      bootVerify: 'Boot-verify OK',
      validator,
    });
    expect(verdict.advisoryOrphans).toEqual([]);
    expect(verdict.orphanVariables).toEqual([]);
    expect(verdict.pass).toBe(true);
  });
});

describe('runSync — capture is not truncated at the 1 MiB spawnSync default (#95)', () => {
  it('captures multi-megabyte stdout intact (a tf prompts JSON via `git show` is ~1.5 MB)', () => {
    const r = runSync('node', ['-e', "process.stdout.write('x'.repeat(2 * 1024 * 1024))"]);
    expect(r.status).toBe(0);
    expect(r.stdout.length).toBe(2 * 1024 * 1024);
  });
});
