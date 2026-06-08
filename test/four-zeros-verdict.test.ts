import { describe, it, expect } from 'vitest';
import { evaluate } from '../src/four-zeros-verdict.js';
import type { CapturedSignals } from '../src/four-zeros-verdict.js';

// Golden output fragments captured from the real tools (tweakcc-fixed --apply,
// claude -p boot-verify, the lobotomized orphan-variable validator).
const clean: CapturedSignals = {
  apply: 'patch: spinnerWords: applied\npatch: thinkingVerb: applied\nAll patches applied.',
  bootVerify: 'Boot-verify OK: patched binary responded to prompt.',
  validator: 'Orphan-variable check: 0 orphans across 42 overrides.',
};

describe('FourZerosVerdict.evaluate — pass', () => {
  it('all four signals clean → pass (all four zero/passing)', () => {
    const result = evaluate(clean);
    expect(result.pass).toBe(true);
    expect(result.failedPatches).toEqual([]);
    expect(result.missingSystemPrompts).toEqual([]);
    expect(result.orphanVariables).toEqual([]);
    expect(result.bootVerifyPassed).toBe(true);
  });
});

describe('FourZerosVerdict.evaluate — failed patch', () => {
  it('reports the failed patch and is not a pass', () => {
    const result = evaluate({
      ...clean,
      apply: 'patch: spinnerWords: applied\npatch: thinkingVerb: failed to find anchor string',
    });
    expect(result.pass).toBe(false);
    expect(result.failedPatches).toEqual(['thinkingVerb']);
  });

  it('reports every failed patch when multiple fail in one run', () => {
    const result = evaluate({
      ...clean,
      apply:
        'patch: spinnerWords: failed to find anchor\n' +
        'patch: thinkingVerb: applied\n' +
        'patch: toolHeader: failed to find regex match',
    });
    expect(result.pass).toBe(false);
    expect(result.failedPatches).toEqual(['spinnerWords', 'toolHeader']);
  });
});

describe('FourZerosVerdict.evaluate — missing system prompt', () => {
  it('reports a missing system prompt and is not a pass', () => {
    const result = evaluate({
      ...clean,
      apply: "Could not find system prompt 'main-loop'",
    });
    expect(result.pass).toBe(false);
    expect(result.missingSystemPrompts).toEqual(['main-loop']);
  });

  it('reports every missing system prompt', () => {
    const result = evaluate({
      ...clean,
      apply:
        "Could not find system prompt 'main-loop'\nCould not find system prompt 'compact'",
    });
    expect(result.missingSystemPrompts).toEqual(['main-loop', 'compact']);
  });
});

describe('FourZerosVerdict.evaluate — orphan variable', () => {
  it('reports an Orphan variable from a ReferenceError and is not a pass', () => {
    const result = evaluate({
      ...clean,
      validator: 'ReferenceError: TODAYS_DATE is not defined',
    });
    expect(result.pass).toBe(false);
    expect(result.orphanVariables).toEqual(['TODAYS_DATE']);
  });

  it('reports every Orphan variable', () => {
    const result = evaluate({
      ...clean,
      validator:
        'ReferenceError: TODAYS_DATE is not defined\nReferenceError: CWD is not defined',
    });
    expect(result.orphanVariables).toEqual(['TODAYS_DATE', 'CWD']);
  });
});

describe('FourZerosVerdict.evaluate — boot-verify failure', () => {
  it('reports boot-verify failure when the patched path did not start/run', () => {
    const result = evaluate({
      ...clean,
      bootVerify: 'SyntaxError: Unexpected token — claude failed to start',
    });
    expect(result.pass).toBe(false);
    expect(result.bootVerifyPassed).toBe(false);
  });

  it('empty boot-verify output is treated as a failure (did not run)', () => {
    const result = evaluate({ ...clean, bootVerify: '' });
    expect(result.pass).toBe(false);
    expect(result.bootVerifyPassed).toBe(false);
  });
});

describe('FourZerosVerdict.evaluate — edge cases', () => {
  it('reports multiple simultaneous failures across all four signals', () => {
    const result = evaluate({
      apply:
        "patch: spinnerWords: failed to find anchor\nCould not find system prompt 'compact'",
      bootVerify: 'TypeError: not a function',
      validator: 'ReferenceError: CWD is not defined',
    });
    expect(result.pass).toBe(false);
    expect(result.failedPatches).toEqual(['spinnerWords']);
    expect(result.missingSystemPrompts).toEqual(['compact']);
    expect(result.orphanVariables).toEqual(['CWD']);
    expect(result.bootVerifyPassed).toBe(false);
  });

  it('unrecognized / garbage output must NOT false-pass', () => {
    const result = evaluate({
      apply: 'some totally unexpected blob of output -- nonsense',
      bootVerify: 'gibberish that is not a recognized boot-verify success marker',
      validator: 'unknown validator chatter',
    });
    expect(result.pass).toBe(false);
    expect(result.bootVerifyPassed).toBe(false);
  });
});
