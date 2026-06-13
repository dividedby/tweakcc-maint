/**
 * Unit tests for:
 *   - SUPPORT_MATRIX_SEED reset (ADR 0010: baseline is 2.1.176)
 *   - supportMatrixStatus() — the version × skrabeAdopted × ourFlowComplete table
 *
 * All-fake wiring: AdoptionRecordSource (in-memory) + AlignmentSnapshot (canned)
 * — no git, no gh, no npm.
 *
 * Invariant under test (ADR 0010):
 *   - ourFlowComplete ≡ a passing record exists (no second stored boolean)
 *   - skrabeAdopted is derived from the injected snapshot; nothing is persisted
 */

import { describe, it, expect } from 'vitest';
import {
  supportMatrixStatus,
  type AdoptionRecordSource,
  type AlignmentSnapshot,
  type MatrixStatusSources,
} from '../src/alignment-snapshot.js';
import { SUPPORT_MATRIX_SEED } from '../src/support-matrix.js';

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

/** In-memory adoption record source: a version → pass map. */
class FakeAdoptionRecordSource implements AdoptionRecordSource {
  constructor(private readonly passing: Set<string>) {}
  async hasPassingRecord(ccVersion: string): Promise<boolean> {
    return this.passing.has(ccVersion);
  }
}

/** Minimal canned AlignmentSnapshot — no leaves needed for the status table. */
function makeSnap(overrides: Partial<AlignmentSnapshot> = {}): AlignmentSnapshot {
  return {
    publishedCliVersion: null,
    supportMatrix: [],
    aheadOfMatrix: false,
    leaves: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// SUPPORT_MATRIX_SEED baseline assertion
// ---------------------------------------------------------------------------

describe('SUPPORT_MATRIX_SEED', () => {
  it('is exactly ["2.1.176"] — pre-baseline versions pruned, 2.1.177 is the first adopt target', () => {
    expect(SUPPORT_MATRIX_SEED).toEqual(['2.1.176']);
  });

  it('2.1.177 reads as ahead of the seed via semver comparison', () => {
    // Replicate the aheadOfEvery logic inline to verify the seed change is correct.
    function parse(v: string) {
      const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(v.trim());
      if (!m) return null;
      return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) };
    }
    function aheadOfEvery(version: string, matrix: readonly string[]): boolean {
      const v = parse(version);
      if (!v) return false;
      return matrix.every((m) => {
        const p = parse(m);
        if (!p) return true;
        const cmp = v.major - p.major || v.minor - p.minor || v.patch - p.patch;
        return cmp > 0;
      });
    }

    expect(aheadOfEvery('2.1.177', SUPPORT_MATRIX_SEED)).toBe(true);
    expect(aheadOfEvery('2.1.176', SUPPORT_MATRIX_SEED)).toBe(false);
    expect(aheadOfEvery('2.1.175', SUPPORT_MATRIX_SEED)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// supportMatrixStatus — table composition
// ---------------------------------------------------------------------------

describe('supportMatrixStatus (all-fake)', () => {
  it('returns one row per matrix version', async () => {
    const sources: MatrixStatusSources = {
      matrixVersions: ['2.1.176', '2.1.177'],
      adoptionRecords: new FakeAdoptionRecordSource(new Set()),
      snap: makeSnap(),
    };
    const status = await supportMatrixStatus(sources);
    expect(status.rows).toHaveLength(2);
    expect(status.rows.map((r) => r.ccVersion)).toEqual(['2.1.176', '2.1.177']);
  });

  it('ourFlowComplete=true when a passing record exists for the version', async () => {
    const sources: MatrixStatusSources = {
      matrixVersions: ['2.1.176'],
      adoptionRecords: new FakeAdoptionRecordSource(new Set(['2.1.176'])),
      snap: makeSnap(),
    };
    const status = await supportMatrixStatus(sources);
    expect(status.rows[0]!.ourFlowComplete).toBe(true);
  });

  it('ourFlowComplete=false when no record exists for the version', async () => {
    const sources: MatrixStatusSources = {
      matrixVersions: ['2.1.176'],
      adoptionRecords: new FakeAdoptionRecordSource(new Set()),
      snap: makeSnap(),
    };
    const status = await supportMatrixStatus(sources);
    expect(status.rows[0]!.ourFlowComplete).toBe(false);
  });

  it('skrabeAdopted=true when his published npm version matches', async () => {
    const sources: MatrixStatusSources = {
      matrixVersions: ['2.1.176'],
      adoptionRecords: new FakeAdoptionRecordSource(new Set()),
      snap: makeSnap({ publishedCliVersion: '2.1.176' }),
    };
    const status = await supportMatrixStatus(sources);
    expect(status.rows[0]!.skrabeAdopted).toBe(true);
  });

  it('skrabeAdopted=true when a leaf recent commit subject mentions the version', async () => {
    const sources: MatrixStatusSources = {
      matrixVersions: ['2.1.177'],
      adoptionRecords: new FakeAdoptionRecordSource(new Set()),
      snap: makeSnap({
        leaves: [
          {
            leaf: 'skrabe/tweakcc-fixed',
            headSha: 'abc1234',
            recentSubjects: ['realign overrides to 2.1.177'],
            openPrs: [],
            recentlyClosedPrs: [],
            reviewComments: [],
          },
        ],
      }),
    };
    const status = await supportMatrixStatus(sources);
    expect(status.rows[0]!.skrabeAdopted).toBe(true);
  });

  it('skrabeAdopted=true when an open leaf PR title mentions the version', async () => {
    const sources: MatrixStatusSources = {
      matrixVersions: ['2.1.177'],
      adoptionRecords: new FakeAdoptionRecordSource(new Set()),
      snap: makeSnap({
        leaves: [
          {
            leaf: 'skrabe/tweakcc-fixed',
            headSha: 'abc1234',
            recentSubjects: [],
            openPrs: [{ number: 12, title: 'adopt CC 2.1.177', headSha: 'def5678' }],
            recentlyClosedPrs: [],
            reviewComments: [],
          },
        ],
      }),
    };
    const status = await supportMatrixStatus(sources);
    expect(status.rows[0]!.skrabeAdopted).toBe(true);
  });

  it('skrabeAdopted=true when a merged closed PR title mentions the version', async () => {
    const sources: MatrixStatusSources = {
      matrixVersions: ['2.1.177'],
      adoptionRecords: new FakeAdoptionRecordSource(new Set()),
      snap: makeSnap({
        leaves: [
          {
            leaf: 'skrabe/tweakcc-fixed',
            headSha: 'abc1234',
            recentSubjects: [],
            openPrs: [],
            recentlyClosedPrs: [{ number: 11, title: 'bump to 2.1.177', headSha: 'fff0000', merged: true }],
            reviewComments: [],
          },
        ],
      }),
    };
    const status = await supportMatrixStatus(sources);
    expect(status.rows[0]!.skrabeAdopted).toBe(true);
  });

  it('skrabeAdopted=false when a closed-unmerged PR title mentions the version', async () => {
    // A closed-but-NOT-merged PR does not count as adopted.
    const sources: MatrixStatusSources = {
      matrixVersions: ['2.1.177'],
      adoptionRecords: new FakeAdoptionRecordSource(new Set()),
      snap: makeSnap({
        leaves: [
          {
            leaf: 'skrabe/tweakcc-fixed',
            headSha: 'abc1234',
            recentSubjects: [],
            openPrs: [],
            recentlyClosedPrs: [{ number: 9, title: 'adopt 2.1.177 attempt', headSha: 'aba0001', merged: false }],
            reviewComments: [],
          },
        ],
      }),
    };
    const status = await supportMatrixStatus(sources);
    expect(status.rows[0]!.skrabeAdopted).toBe(false);
  });

  it('skrabeAdopted=false when nothing in the snapshot mentions the version', async () => {
    const sources: MatrixStatusSources = {
      matrixVersions: ['2.1.177'],
      adoptionRecords: new FakeAdoptionRecordSource(new Set()),
      snap: makeSnap(),
    };
    const status = await supportMatrixStatus(sources);
    expect(status.rows[0]!.skrabeAdopted).toBe(false);
  });

  it('ADR 0010 invariant: different versions have independent ourFlowComplete values', async () => {
    const sources: MatrixStatusSources = {
      matrixVersions: ['2.1.176', '2.1.177'],
      adoptionRecords: new FakeAdoptionRecordSource(new Set(['2.1.176'])),
      snap: makeSnap(),
    };
    const status = await supportMatrixStatus(sources);
    const v176 = status.rows.find((r) => r.ccVersion === '2.1.176')!;
    const v177 = status.rows.find((r) => r.ccVersion === '2.1.177')!;
    expect(v176.ourFlowComplete).toBe(true);
    expect(v177.ourFlowComplete).toBe(false);
  });

  it('ADR 0010 invariant: rows preserve matrix order', async () => {
    const sources: MatrixStatusSources = {
      matrixVersions: ['2.1.176', '2.1.177', '2.1.178'],
      adoptionRecords: new FakeAdoptionRecordSource(new Set()),
      snap: makeSnap(),
    };
    const status = await supportMatrixStatus(sources);
    expect(status.rows.map((r) => r.ccVersion)).toEqual(['2.1.176', '2.1.177', '2.1.178']);
  });

  it('handles an empty matrix (no rows)', async () => {
    const sources: MatrixStatusSources = {
      matrixVersions: [],
      adoptionRecords: new FakeAdoptionRecordSource(new Set()),
      snap: makeSnap(),
    };
    const status = await supportMatrixStatus(sources);
    expect(status.rows).toHaveLength(0);
  });
});
