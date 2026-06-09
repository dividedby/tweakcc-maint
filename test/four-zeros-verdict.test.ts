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

// The patcher `--report-orphans` JSON is the AUTHORITATIVE orphan input (ADR 0005, #31):
// `{ version, prompts: { <promptId>: [VAR, ...] } }`.
const reportOf = (prompts: Record<string, string[]>): string =>
  JSON.stringify({ version: '2.1.169', prompts });

describe('FourZerosVerdict.evaluate — patcher orphan report is the authority', () => {
  it('a report naming a surviving placeholder fails the orphan bar, attributed to the patcher report', () => {
    const result = evaluate({
      ...clean,
      orphanReport: reportOf({ 'tool-description-agent-usage-notes': ['IS_TRUTHY_FN'] }),
    });
    expect(result.pass).toBe(false);
    expect(result.orphanVariables).toEqual(['IS_TRUTHY_FN']);
    expect(result.orphanSource).toBe('patcher-report');
  });

  it('a report whose prompt arrays are all empty passes the orphan bar', () => {
    const result = evaluate({ ...clean, orphanReport: reportOf({ 'prompt-a': [] }) });
    expect(result.pass).toBe(true);
    expect(result.orphanVariables).toEqual([]);
    expect(result.orphanSource).toBe('patcher-report');
  });

  it('dedups a variable surviving across multiple prompts to one orphan-bar finding', () => {
    const result = evaluate({
      ...clean,
      orphanReport: reportOf({ 'prompt-a': ['CWD'], 'prompt-b': ['CWD', 'TODAYS_DATE'] }),
    });
    expect(result.orphanVariables).toEqual(['CWD', 'TODAYS_DATE']);
  });
});

describe('FourZerosVerdict.evaluate — static check demoted to advisory (ADR 0005)', () => {
  it('a static-validator orphan no longer fails the bar; it is surfaced as advisory', () => {
    const result = evaluate({
      ...clean,
      orphanReport: reportOf({}),
      validator: 'ReferenceError: TODAYS_DATE is not defined',
    });
    expect(result.pass).toBe(true);
    expect(result.orphanVariables).toEqual([]);
    expect(result.advisoryOrphans).toEqual(['TODAYS_DATE']);
  });

  it('dedups advisory orphans (same VAR flagged across N override files)', () => {
    const result = evaluate({
      ...clean,
      orphanReport: reportOf({}),
      validator:
        '# a.md\nReferenceError: CWD is not defined\n# b.md\nReferenceError: CWD is not defined',
    });
    expect(result.advisoryOrphans).toEqual(['CWD']);
  });
});

describe('FourZerosVerdict.evaluate — no report → Boot-verify fallback (#31 AC 4)', () => {
  it('absent report falls back to Boot-verify as the orphan authority, not the static check', () => {
    const result = evaluate({
      ...clean,
      // no orphanReport — leaf does not support the flag yet (#43 unlanded)
      validator: 'ReferenceError: TODAYS_DATE is not defined',
    });
    expect(result.orphanSource).toBe('boot-verify-fallback');
    expect(result.orphanVariables).toEqual([]);
    expect(result.advisoryOrphans).toEqual(['TODAYS_DATE']);
    // Boot-verify is clean here, so the static advisory finding does NOT fail the run.
    expect(result.pass).toBe(true);
  });

  it('in fallback, a boot crash still fails the run (runtime orphan authority)', () => {
    const result = evaluate({
      ...clean,
      bootVerify: 'ReferenceError: IS_TRUTHY_FN is not defined — claude failed to start',
    });
    expect(result.orphanSource).toBe('boot-verify-fallback');
    expect(result.bootVerifyPassed).toBe(false);
    expect(result.pass).toBe(false);
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

// The leaf's `tools/auditMisbinds.mjs` output — skrabe's four-zero #4 (#80). Golden
// fragments match the real tool: `mis-bind audit: 0 …` on pass, `MIS-BINDS: N …` +
// indented finding lines on fail, `mis-bind audit: SKIPPED — …` when the upstream
// reference dump is unavailable (exit 0 — explicitly not a failure).
describe('FourZerosVerdict.evaluate — auditMisbinds is the fourth zero (#80)', () => {
  it('a clean mis-bind audit passes and is attributed as a hard input', () => {
    const result = evaluate({
      ...clean,
      auditMisbinds: 'mis-bind audit: 0 (every used placeholder sits at the upstream slot)',
    });
    expect(result.pass).toBe(true);
    expect(result.auditMisbindsPassed).toBe(true);
    expect(result.misbinds).toEqual([]);
  });

  it('a mis-bind fails the bar even when the other three zeros are clean (wrong-but-valid var)', () => {
    const result = evaluate({
      ...clean,
      auditMisbinds:
        'MIS-BINDS: 1 (override placeholder at wrong slot)\n' +
        '  main-loop: ${TODAYS_DATE} ours=slotB upstream=slotQ\n' +
        '\nFix: adopt upstream’s identifierMap for the prompt',
    });
    expect(result.pass).toBe(false);
    expect(result.auditMisbindsPassed).toBe(false);
    expect(result.misbinds).toEqual(['main-loop: ${TODAYS_DATE} ours=slotB upstream=slotQ']);
  });

  it('a SKIPPED audit (no upstream reference dump) is not a hard input and does not fail the bar', () => {
    const result = evaluate({
      ...clean,
      auditMisbinds:
        "mis-bind audit: SKIPPED — upstream reference '/tmp/pieb-2.1.169.json' missing/empty",
    });
    expect(result.pass).toBe(true);
    expect(result.auditMisbindsPassed).toBeUndefined();
  });

  it('an absent audit signal (fake / hand-rolled fallback) leaves the bar at three zeros + Boot-verify', () => {
    const result = evaluate(clean);
    expect(result.pass).toBe(true);
    expect(result.auditMisbindsPassed).toBeUndefined();
    expect(result.misbinds).toEqual([]);
  });

  it('unrecognized audit output must NOT false-pass', () => {
    const result = evaluate({ ...clean, auditMisbinds: 'some unexpected blob' });
    expect(result.pass).toBe(false);
    expect(result.auditMisbindsPassed).toBe(false);
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
    // No report → fallback; the static validator orphan is advisory, not a hard input.
    expect(result.orphanVariables).toEqual([]);
    expect(result.advisoryOrphans).toEqual(['CWD']);
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
