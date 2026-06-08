import { describe, it, expect } from 'vitest';
import { runGate } from '../src/integration-gate.js';
import { FakeAdoptionEnvironment } from '../src/fake-adoption-environment.js';
import type { CapturedSignals } from '../src/four-zeros-verdict.js';

// Golden output fragments matching the real tools (see four-zeros-verdict.test.ts).
const cleanSignals: CapturedSignals = {
  apply: 'patch: spinnerWords: applied\npatch: thinkingVerb: applied\nAll patches applied.',
  bootVerify: 'Boot-verify OK: patched binary responded to prompt.',
  validator: 'Orphan-variable check: 0 orphans across 42 overrides.',
};

describe('AdoptionEnvironment.listMatrix — the environment supplies the Support matrix', () => {
  it('returns the configured list of versions', () => {
    const env = new FakeAdoptionEnvironment(
      { '1.2.3': cleanSignals, '1.2.4': cleanSignals, '1.3.0': cleanSignals },
      { matrix: ['1.2.3', '1.2.4', '1.3.0'] },
    );
    expect(env.listMatrix()).toEqual(['1.2.3', '1.2.4', '1.3.0']);
  });

  it('defaults to the configured signals versions when no explicit matrix is given', () => {
    const env = new FakeAdoptionEnvironment({ '1.2.3': cleanSignals, '1.2.4': cleanSignals });
    expect(env.listMatrix()).toEqual(['1.2.3', '1.2.4']);
  });

  it('a single-version environment lists exactly that version', () => {
    const env = new FakeAdoptionEnvironment({ '1.2.3': cleanSignals });
    expect(env.listMatrix()).toEqual(['1.2.3']);
  });

  it('an empty environment lists nothing', () => {
    const env = new FakeAdoptionEnvironment({}, { matrix: [] });
    expect(env.listMatrix()).toEqual([]);
  });
});

describe('listMatrix → runGate composition — same record as passing the matrix directly', () => {
  it('caller builds the matrix from env.listMatrix() and the gate produces the expected per-version record', () => {
    const env = new FakeAdoptionEnvironment({
      '1.2.3': cleanSignals,
      '1.2.4': cleanSignals,
    });

    const record = runGate(env.listMatrix(), env);

    expect(record.pass).toBe(true);
    expect(record.versions.map((v) => v.ccVersion)).toEqual(['1.2.3', '1.2.4']);
    for (const v of record.versions) {
      expect(v.fourZeros!.pass).toBe(true);
      expect(v.restoreDrill.pass).toBe(true);
    }
  });

  it('composition is identical to passing the same matrix directly', () => {
    const env = new FakeAdoptionEnvironment({
      '1.2.3': cleanSignals,
      '1.2.4': FakeAdoptionEnvironment.breachSignals('bootCrash'),
    });
    const matrix = ['1.2.3', '1.2.4'];

    const viaSeam = runGate(env.listMatrix(), env);
    const viaDirect = runGate(matrix, env);

    expect(viaSeam.versions).toEqual(viaDirect.versions);
    expect(viaSeam.pass).toBe(viaDirect.pass);
  });

  it('an empty listMatrix() flows into runGate’s existing empty-matrix error (#4 behavior)', () => {
    const env = new FakeAdoptionEnvironment({}, { matrix: [] });
    expect(() => runGate(env.listMatrix(), env)).toThrow();
  });
});
