import { describe, it, expect } from 'vitest';
import { runGate, recordToExitCode } from '../src/integration-gate.js';
import type { AdoptionRecord } from '../src/integration-gate.js';
import { FakeAdoptionEnvironment } from '../src/fake-adoption-environment.js';
import type { CapturedSignals } from '../src/four-zeros-verdict.js';

// Golden output fragments matching the real tools (see four-zeros-verdict.test.ts).
const cleanSignals: CapturedSignals = {
  apply: 'patch: spinnerWords: applied\npatch: thinkingVerb: applied\nAll patches applied.',
  bootVerify: 'Boot-verify OK: patched binary responded to prompt.',
  validator: 'Orphan-variable check: 0 orphans across 42 overrides.',
};

describe('IntegrationGate.runGate — clean single version', () => {
  it('emits an Adoption record with a passing Four-zeros result and the CC version', () => {
    const env = new FakeAdoptionEnvironment({ '1.2.3': cleanSignals });
    const record = runGate(['1.2.3'], env);

    expect(record.ccVersion).toBe('1.2.3');
    expect(record.fourZeros.pass).toBe(true);
    expect(record.fourZeros.failedPatches).toEqual([]);
    expect(record.fourZeros.missingSystemPrompts).toEqual([]);
    expect(record.fourZeros.orphanVariables).toEqual([]);
    expect(record.fourZeros.bootVerifyPassed).toBe(true);
  });

  it('record maps to exit code 0', () => {
    const env = new FakeAdoptionEnvironment({ '1.2.3': cleanSignals });
    const record = runGate(['1.2.3'], env);
    expect(recordToExitCode(record)).toBe(0);
  });
});

describe('IntegrationGate — Adoption record is structured/machine-readable', () => {
  it('carries CC version, per-check Four-zeros result, and an ISO date', () => {
    const env = new FakeAdoptionEnvironment({ '1.2.3': cleanSignals });
    const record = runGate(['1.2.3'], env);

    expect(record).toMatchObject({
      ccVersion: '1.2.3',
      fourZeros: {
        pass: true,
        failedPatches: [],
        missingSystemPrompts: [],
        orphanVariables: [],
        bootVerifyPassed: true,
      },
    });
    // Date is present and a valid ISO-8601 timestamp.
    expect(typeof record.date).toBe('string');
    expect(Number.isNaN(Date.parse(record.date))).toBe(false);
    expect(new Date(record.date).toISOString()).toBe(record.date);
  });

  it('omits the Behavioral A/B field (deferred to slice 5)', () => {
    const env = new FakeAdoptionEnvironment({ '1.2.3': cleanSignals });
    const record = runGate(['1.2.3'], env);
    expect('behavioralAB' in record).toBe(false);
  });
});

describe('IntegrationGate.runGate — any Four-zeros breach → non-zero + recorded', () => {
  it('failed patch → non-zero exit and recorded', () => {
    const env = FakeAdoptionEnvironment.breach('1.2.3', 'failedPatch');
    const record = runGate(['1.2.3'], env);

    expect(record.fourZeros.pass).toBe(false);
    expect(record.fourZeros.failedPatches.length).toBeGreaterThan(0);
    expect(recordToExitCode(record)).not.toBe(0);
  });

  it('missing system prompt → non-zero exit and recorded', () => {
    const env = FakeAdoptionEnvironment.breach('1.2.3', 'missingPrompt');
    const record = runGate(['1.2.3'], env);

    expect(record.fourZeros.pass).toBe(false);
    expect(record.fourZeros.missingSystemPrompts.length).toBeGreaterThan(0);
    expect(recordToExitCode(record)).not.toBe(0);
  });

  it('orphan variable → non-zero exit and recorded', () => {
    const env = FakeAdoptionEnvironment.breach('1.2.3', 'orphanVar');
    const record = runGate(['1.2.3'], env);

    expect(record.fourZeros.pass).toBe(false);
    expect(record.fourZeros.orphanVariables.length).toBeGreaterThan(0);
    expect(recordToExitCode(record)).not.toBe(0);
  });

  it('boot crash → non-zero exit and recorded', () => {
    const env = FakeAdoptionEnvironment.breach('1.2.3', 'bootCrash');
    const record = runGate(['1.2.3'], env);

    expect(record.fourZeros.pass).toBe(false);
    expect(record.fourZeros.bootVerifyPassed).toBe(false);
    expect(recordToExitCode(record)).not.toBe(0);
  });
});

describe('IntegrationGate.runGate — matrix-of-one contract', () => {
  it('throws if the matrix is empty', () => {
    const env = new FakeAdoptionEnvironment({ '1.2.3': cleanSignals });
    expect(() => runGate([], env)).toThrow();
  });

  it('throws if the matrix carries more than one version (skeleton is single-version)', () => {
    const env = new FakeAdoptionEnvironment({
      '1.2.3': cleanSignals,
      '1.2.4': cleanSignals,
    });
    expect(() => runGate(['1.2.3', '1.2.4'], env)).toThrow();
  });
});

describe('IntegrationGate.recordToExitCode', () => {
  it('passing record → 0, breaching record → non-zero', () => {
    const pass: AdoptionRecord = {
      ccVersion: '1.2.3',
      fourZeros: {
        pass: true,
        failedPatches: [],
        missingSystemPrompts: [],
        orphanVariables: [],
        bootVerifyPassed: true,
      },
      date: new Date().toISOString(),
    };
    const fail: AdoptionRecord = {
      ...pass,
      fourZeros: { ...pass.fourZeros, pass: false, bootVerifyPassed: false },
    };
    expect(recordToExitCode(pass)).toBe(0);
    expect(recordToExitCode(fail)).not.toBe(0);
  });
});
