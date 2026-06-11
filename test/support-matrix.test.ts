/**
 * Unit test for the install-free Support matrix composition (support-matrix.ts).
 *
 * The matrix is what the Release detector dedups against; the detector cron runner
 * has no Claude Code, so it cannot read the gate's installed-version-only matrix
 * (#199 cron failure). These assert the pure SEED-union — the `gh` fetch that supplies
 * the proposal versions is CLI transport, integration-verified by a real dispatch.
 */

import { describe, it, expect } from 'vitest';
import { SUPPORT_MATRIX_SEED, supportMatrix } from '../src/support-matrix.js';

describe('supportMatrix (install-free composition)', () => {
  it('with no proposal versions, the matrix is exactly the seed (deduped)', () => {
    expect(supportMatrix([])).toEqual([...new Set(SUPPORT_MATRIX_SEED)]);
  });

  it('unions proposal-derived versions onto the seed', () => {
    const matrix = supportMatrix(['2.2.0']);
    expect(matrix).toContain('2.2.0');
    for (const seeded of SUPPORT_MATRIX_SEED) expect(matrix).toContain(seeded);
  });

  it('deduplicates a proposal version that is already in the seed', () => {
    const newest = SUPPORT_MATRIX_SEED[SUPPORT_MATRIX_SEED.length - 1]!;
    const matrix = supportMatrix([newest]);
    expect(matrix.filter((v) => v === newest)).toHaveLength(1);
  });

  it('seed carries the current newest adopted version — guards against a spurious re-proposal', () => {
    // An empty/regressed seed would let the detector re-propose an already-adopted
    // version (the surprise-proposal mode the hybrid matrix exists to prevent).
    expect(SUPPORT_MATRIX_SEED.length).toBeGreaterThan(0);
    expect(SUPPORT_MATRIX_SEED).toContain('2.1.173');
  });
});
