import { describe, it, expect } from 'vitest';
import { isCleanFromHashes } from '../src/real-adoption-environment.js';

// The real backupExists/restore/isCleanStock are HITL (real fs + `--restore` shell-out + a
// sha256 over the ~210MB install); only the pure digest-comparison seam is unit-tested here.
describe('isCleanFromHashes — install vs backup digest → clean-stock signal', () => {
  it('equal digests → clean stock', () => {
    expect(isCleanFromHashes('abc123', 'abc123')).toBe(true);
  });

  it('differing digests → dirty restore (install bytes ≠ backup)', () => {
    expect(isCleanFromHashes('abc123', 'def456')).toBe(false);
  });

  it('unreadable/unlocatable install → not clean (cannot prove restored)', () => {
    expect(isCleanFromHashes(undefined, 'abc123')).toBe(false);
  });

  it('missing backup → not clean', () => {
    expect(isCleanFromHashes('abc123', undefined)).toBe(false);
  });

  it('both undefined → not clean', () => {
    expect(isCleanFromHashes(undefined, undefined)).toBe(false);
  });
});
