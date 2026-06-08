import { describe, it, expect } from 'vitest';
import { isCleanFromConfig } from '../src/real-adoption-environment.js';

// The real backupExists/restore/isCleanStock are HITL (real fs + `--restore` shell-out);
// only the pure config-parse helper is unit-tested here.
describe('isCleanFromConfig — tweakcc config.json → clean-stock signal', () => {
  it('changesApplied:false → clean stock', () => {
    expect(isCleanFromConfig('{"changesApplied": false, "ccVersion": "2.1.168"}')).toBe(true);
  });

  it('changesApplied:true → not clean (install still patched)', () => {
    expect(isCleanFromConfig('{"changesApplied": true}')).toBe(false);
  });

  it('missing changesApplied → not clean (cannot prove restored)', () => {
    expect(isCleanFromConfig('{"ccVersion": "2.1.168"}')).toBe(false);
  });

  it('non-boolean changesApplied is not treated as clean', () => {
    expect(isCleanFromConfig('{"changesApplied": "false"}')).toBe(false);
  });
});
