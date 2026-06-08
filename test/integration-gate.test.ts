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

/** Find the per-version result for a given version in a record (or fail). */
function versionResult(record: AdoptionRecord, ccVersion: string) {
  const result = record.versions.find((v) => v.ccVersion === ccVersion);
  expect(result, `expected a per-version result for ${ccVersion}`).toBeDefined();
  return result!;
}

describe('IntegrationGate.runGate — clean matrix of N versions', () => {
  it('all-clean matrix → run passes with a passing Four-zeros result per version', () => {
    const env = new FakeAdoptionEnvironment({
      '1.2.3': cleanSignals,
      '1.2.4': cleanSignals,
      '1.3.0': cleanSignals,
    });
    const record = runGate(['1.2.3', '1.2.4', '1.3.0'], env);

    expect(record.pass).toBe(true);
    expect(record.versions.map((v) => v.ccVersion)).toEqual(['1.2.3', '1.2.4', '1.3.0']);
    for (const v of record.versions) {
      expect(v.fourZeros.pass).toBe(true);
      expect(v.fourZeros.failedPatches).toEqual([]);
      expect(v.fourZeros.missingSystemPrompts).toEqual([]);
      expect(v.fourZeros.orphanVariables).toEqual([]);
      expect(v.fourZeros.bootVerifyPassed).toBe(true);
    }
  });

  it('all-clean matrix → exit code 0', () => {
    const env = new FakeAdoptionEnvironment({ '1.2.3': cleanSignals, '1.2.4': cleanSignals });
    const record = runGate(['1.2.3', '1.2.4'], env);
    expect(recordToExitCode(record)).toBe(0);
  });

  it('a single-version matrix still works (the #3 skeleton case)', () => {
    const env = new FakeAdoptionEnvironment({ '1.2.3': cleanSignals });
    const record = runGate(['1.2.3'], env);

    expect(record.pass).toBe(true);
    expect(record.versions).toHaveLength(1);
    expect(record.versions[0]!.ccVersion).toBe('1.2.3');
    expect(recordToExitCode(record)).toBe(0);
  });
});

describe('IntegrationGate — Adoption record is structured/machine-readable', () => {
  it('carries per-version CC version + Four-zeros result, run-level pass, and an ISO date', () => {
    const env = new FakeAdoptionEnvironment({ '1.2.3': cleanSignals, '1.2.4': cleanSignals });
    const record = runGate(['1.2.3', '1.2.4'], env);

    expect(record).toMatchObject({
      pass: true,
      versions: [
        { ccVersion: '1.2.3', fourZeros: { pass: true } },
        { ccVersion: '1.2.4', fourZeros: { pass: true } },
      ],
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

describe('IntegrationGate.runGate — any version breaching fails the WHOLE run', () => {
  it('exactly one version breaches → run fails, exit non-zero, record names which version failed', () => {
    const env = new FakeAdoptionEnvironment({
      '1.2.3': cleanSignals,
      '1.2.4': FakeAdoptionEnvironment.breachSignals('bootCrash'),
      '1.3.0': cleanSignals,
    });
    const record = runGate(['1.2.3', '1.2.4', '1.3.0'], env);

    expect(record.pass).toBe(false);
    expect(recordToExitCode(record)).not.toBe(0);

    // The record shows WHICH version failed (and that the others passed).
    expect(versionResult(record, '1.2.3').fourZeros.pass).toBe(true);
    expect(versionResult(record, '1.2.4').fourZeros.pass).toBe(false);
    expect(versionResult(record, '1.3.0').fourZeros.pass).toBe(true);

    const failed = record.versions.filter((v) => !v.fourZeros.pass).map((v) => v.ccVersion);
    expect(failed).toEqual(['1.2.4']);
  });

  it('FIRST version fails → whole run fails', () => {
    const env = new FakeAdoptionEnvironment({
      '1.2.3': FakeAdoptionEnvironment.breachSignals('failedPatch'),
      '1.2.4': cleanSignals,
    });
    const record = runGate(['1.2.3', '1.2.4'], env);

    expect(record.pass).toBe(false);
    expect(recordToExitCode(record)).not.toBe(0);
    expect(versionResult(record, '1.2.3').fourZeros.pass).toBe(false);
    expect(versionResult(record, '1.2.4').fourZeros.pass).toBe(true);
  });

  it('LAST version fails → whole run fails', () => {
    const env = new FakeAdoptionEnvironment({
      '1.2.3': cleanSignals,
      '1.2.4': FakeAdoptionEnvironment.breachSignals('orphanVar'),
    });
    const record = runGate(['1.2.3', '1.2.4'], env);

    expect(record.pass).toBe(false);
    expect(recordToExitCode(record)).not.toBe(0);
    expect(versionResult(record, '1.2.3').fourZeros.pass).toBe(true);
    expect(versionResult(record, '1.2.4').fourZeros.pass).toBe(false);
  });

  it('multiple versions breach → run fails and every breach is recorded', () => {
    const env = new FakeAdoptionEnvironment({
      '1.2.3': FakeAdoptionEnvironment.breachSignals('missingPrompt'),
      '1.2.4': cleanSignals,
      '1.3.0': FakeAdoptionEnvironment.breachSignals('bootCrash'),
    });
    const record = runGate(['1.2.3', '1.2.4', '1.3.0'], env);

    expect(record.pass).toBe(false);
    const failed = record.versions.filter((v) => !v.fourZeros.pass).map((v) => v.ccVersion);
    expect(failed).toEqual(['1.2.3', '1.3.0']);
  });
});

describe('IntegrationGate.runGate — empty matrix is an error, not a vacuous pass', () => {
  it('throws on an empty matrix', () => {
    const env = new FakeAdoptionEnvironment({ '1.2.3': cleanSignals });
    expect(() => runGate([], env)).toThrow();
  });
});

describe('IntegrationGate.recordToExitCode', () => {
  it('passing record → 0, breaching record → non-zero', () => {
    const pass: AdoptionRecord = {
      pass: true,
      versions: [
        {
          ccVersion: '1.2.3',
          fourZeros: {
            pass: true,
            failedPatches: [],
            missingSystemPrompts: [],
            orphanVariables: [],
            bootVerifyPassed: true,
          },
        },
      ],
      date: new Date().toISOString(),
    };
    const fail: AdoptionRecord = {
      ...pass,
      pass: false,
      versions: [
        {
          ...pass.versions[0]!,
          fourZeros: { ...pass.versions[0]!.fourZeros, pass: false, bootVerifyPassed: false },
        },
      ],
    };
    expect(recordToExitCode(pass)).toBe(0);
    expect(recordToExitCode(fail)).not.toBe(0);
  });
});
