import { describe, it, expect } from 'vitest';
import { summarizeHistory, renderHistory } from '../src/adoption-history.js';
import type { AdoptionRecord, VersionResult } from '../src/integration-gate.js';
import type { FourZerosResult } from '../src/four-zeros-verdict.js';

// ── fixture builders ─────────────────────────────────────────────────────────────────

const passFourZeros: FourZerosResult = {
  pass: true,
  failedPatches: [],
  missingSystemPrompts: [],
  orphanVariables: [],
  orphanSource: 'patcher-report',
  advisoryOrphans: [],
  bootVerifyPassed: true,
};

const failFourZeros: FourZerosResult = {
  pass: false,
  failedPatches: ['spinnerWords'],
  missingSystemPrompts: [],
  orphanVariables: [],
  orphanSource: 'patcher-report',
  advisoryOrphans: [],
  bootVerifyPassed: true,
};

/** A passing version result (clean Four-zeros + clean Restore drill). */
function passVersion(ccVersion: string): VersionResult {
  return {
    ccVersion,
    fourZeros: passFourZeros,
    restoreDrill: {
      pass: true,
      status: 'pass',
      backupExists: true,
      restored: true,
      cleanStock: true,
    },
  };
}

/** A version that fails the Four-zeros bar but whose Restore drill is clean. */
function fourZerosFailVersion(ccVersion: string): VersionResult {
  return {
    ccVersion,
    fourZeros: failFourZeros,
    restoreDrill: {
      pass: true,
      status: 'pass',
      backupExists: true,
      restored: true,
      cleanStock: true,
    },
  };
}

/** A version whose Restore drill landed dirty (restore ran but did not return to clean stock). */
function dirtyRestoreVersion(ccVersion: string): VersionResult {
  return {
    ccVersion,
    fourZeros: passFourZeros,
    restoreDrill: {
      pass: false,
      status: 'dirty-restore',
      backupExists: true,
      restored: true,
      cleanStock: false,
    },
  };
}

function record(date: string, versions: VersionResult[]): AdoptionRecord {
  return { pass: versions.every((v) => v.restoreDrill.pass && v.fourZeros?.pass === true), versions, date };
}

// ── summarizeHistory ──────────────────────────────────────────────────────────────────

describe('summarizeHistory', () => {
  it('empty input → empty, fully-defined history (no latest, zeroed track record)', () => {
    const history = summarizeHistory([]);
    expect(history.versions).toEqual([]);
    expect(history.latest).toBeUndefined();
    expect(history.totalRuns).toBe(0);
    expect(history.restoreDrill).toEqual({ total: 0, passed: 0, failed: 0, byStatus: {} });
  });

  it('all-pass history across runs → every version latest-pass, run streak intact', () => {
    const history = summarizeHistory([
      record('2026-06-01T00:00:00.000Z', [passVersion('1.2.3'), passVersion('1.2.4')]),
      record('2026-06-02T00:00:00.000Z', [passVersion('1.2.3'), passVersion('1.2.4')]),
    ]);

    expect(history.totalRuns).toBe(2);
    expect(history.latest?.pass).toBe(true);
    expect(history.latest?.date).toBe('2026-06-02T00:00:00.000Z');

    const byVersion = Object.fromEntries(history.versions.map((v) => [v.ccVersion, v]));
    expect(Object.keys(byVersion).sort()).toEqual(['1.2.3', '1.2.4']);
    for (const v of Object.values(byVersion)) {
      expect(v.latestPass).toBe(true);
      expect(v.runs).toBe(2);
      expect(v.passes).toBe(2);
      expect(v.fails).toBe(0);
      expect(v.timeline.map((t) => t.pass)).toEqual([true, true]);
    }

    expect(history.restoreDrill).toEqual({
      total: 4,
      passed: 4,
      failed: 0,
      byStatus: { pass: 4 },
    });
  });

  it('a version that regressed across runs → latestPass false, timeline shows the flip', () => {
    const history = summarizeHistory([
      record('2026-06-01T00:00:00.000Z', [passVersion('1.2.3'), passVersion('1.2.4')]),
      record('2026-06-02T00:00:00.000Z', [passVersion('1.2.3'), fourZerosFailVersion('1.2.4')]),
    ]);

    const byVersion = Object.fromEntries(history.versions.map((v) => [v.ccVersion, v]));
    expect(byVersion['1.2.3']!.latestPass).toBe(true);
    expect(byVersion['1.2.4']!.latestPass).toBe(false);
    expect(byVersion['1.2.4']!.passes).toBe(1);
    expect(byVersion['1.2.4']!.fails).toBe(1);
    expect(byVersion['1.2.4']!.timeline.map((t) => t.pass)).toEqual([true, false]);
    // Latest matrix outcome reflects the regression.
    expect(history.latest?.pass).toBe(false);
  });

  it('timeline orders entries chronologically regardless of input record order', () => {
    const history = summarizeHistory([
      record('2026-06-03T00:00:00.000Z', [fourZerosFailVersion('1.2.4')]),
      record('2026-06-01T00:00:00.000Z', [passVersion('1.2.4')]),
    ]);
    const v = history.versions[0]!;
    expect(v.timeline.map((t) => t.date)).toEqual([
      '2026-06-01T00:00:00.000Z',
      '2026-06-03T00:00:00.000Z',
    ]);
    expect(v.latestPass).toBe(false); // 06-03 is the latest
    expect(history.latest?.date).toBe('2026-06-03T00:00:00.000Z');
  });

  it('a dirty / restore-failed drill → counted in the Restore-drill track record', () => {
    const history = summarizeHistory([
      record('2026-06-01T00:00:00.000Z', [passVersion('1.2.3'), dirtyRestoreVersion('1.2.4')]),
    ]);

    expect(history.restoreDrill).toEqual({
      total: 2,
      passed: 1,
      failed: 1,
      byStatus: { pass: 1, 'dirty-restore': 1 },
    });

    const byVersion = Object.fromEntries(history.versions.map((v) => [v.ccVersion, v]));
    expect(byVersion['1.2.4']!.restoreDrill).toEqual({
      total: 1,
      passed: 0,
      failed: 1,
      byStatus: { 'dirty-restore': 1 },
    });
    expect(byVersion['1.2.4']!.latestPass).toBe(false);
  });

  it('a missing-backup version (no Four-zeros) is a fail with no fourZeros verdict', () => {
    const missingBackup: VersionResult = {
      ccVersion: '1.2.4',
      restoreDrill: {
        pass: false,
        status: 'missing-backup',
        backupExists: false,
        restored: false,
        cleanStock: false,
      },
    };
    const history = summarizeHistory([record('2026-06-01T00:00:00.000Z', [missingBackup])]);
    const v = history.versions[0]!;
    expect(v.latestPass).toBe(false);
    expect(v.timeline[0]!.fourZerosPass).toBeUndefined();
    expect(history.restoreDrill.byStatus).toEqual({ 'missing-backup': 1 });
  });
});

// ── renderHistory (human-readable) ────────────────────────────────────────────────────

describe('renderHistory', () => {
  it('empty history renders a stable no-data line', () => {
    expect(renderHistory(summarizeHistory([]))).toContain('no adoption records');
  });

  it('renders per-version status and the restore-drill track record', () => {
    const text = renderHistory(
      summarizeHistory([
        record('2026-06-01T00:00:00.000Z', [passVersion('1.2.3'), dirtyRestoreVersion('1.2.4')]),
      ]),
    );
    expect(text).toContain('1.2.3');
    expect(text).toContain('1.2.4');
    expect(text).toContain('Restore drill');
    // The latest-fail version should be visibly marked as failing.
    expect(text).toMatch(/1\.2\.4.*FAIL/);
  });
});
