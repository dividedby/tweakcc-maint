/**
 * Tests for issue #263 — ISOLATE_OVERRIDES: both surfaces isolated + auto-restore.
 *
 * Covers the Override-surface composition module (setup + teardown):
 *   - AC 1: isolation points both surfaces at throwaway/empty dirs
 *   - AC 2: teardown restores the original symlink target on success AND on throw
 *   - AC 3: isolated run → orphans [], Boot-verify ✓, mis-bind not-run pass-through
 *   - AC 4: no gate runtime writes land inside a tracked work clone
 *
 * Fakes: injected temp-dir + fake symlink read/write ops — no real fs mutations.
 */

import { describe, it, expect } from 'vitest';
import {
  setupIsolation,
  teardownIsolation,
  withIsolation,
} from '../src/override-surface-isolation.js';
import type { IsolationFsSeam, IsolationSetupResult } from '../src/override-surface-isolation.js';
import type { CapturedSignals } from '../src/four-zeros-verdict.js';
import { evaluate } from '../src/four-zeros-verdict.js';

// ── Fake fs seam ─────────────────────────────────────────────────────────────

interface SymlinkState {
  target: string | null;
}

function makeFakeSeam(originalTarget: string): {
  seam: IsolationFsSeam;
  symlink: SymlinkState;
  thrownTemp: string[];
} {
  const symlink: SymlinkState = { target: originalTarget };
  const thrownTemp: string[] = [];
  let tempCounter = 0;

  const seam: IsolationFsSeam = {
    readlink: () => symlink.target!,
    symlinkSync: (target, _path) => {
      symlink.target = target;
    },
    mkdtempSync: (prefix) => {
      const dir = `${prefix}${tempCounter++}`;
      return dir;
    },
    rmSync: (dir, _opts) => {
      thrownTemp.push(dir);
    },
  };

  return { seam, symlink, thrownTemp };
}

const TWEAKCC_CONFIG = '/home/user/.tweakcc';
const ORIGINAL_TARGET = '/home/user/repos/lobotomized-claude-code/system-prompts-opus-4-8';

// ── AC 1: setup points both surfaces at throwaway/empty dirs ─────────────────

describe('setupIsolation — both surfaces point at throwaway dirs (AC 1)', () => {
  it('returns an empty overrideDirs array (no dirs for the gate to scan)', () => {
    const { seam } = makeFakeSeam(ORIGINAL_TARGET);
    const result = setupIsolation(TWEAKCC_CONFIG, seam);
    expect(result.overrideDirs).toEqual([]);
  });

  it('repoints the ~/.tweakcc/system-prompts symlink at a throwaway dir', () => {
    const { seam, symlink } = makeFakeSeam(ORIGINAL_TARGET);
    setupIsolation(TWEAKCC_CONFIG, seam);
    expect(symlink.target).not.toBe(ORIGINAL_TARGET);
    expect(symlink.target).toContain('isolated-');
  });

  it('saves the original symlink target so teardown can restore it', () => {
    const { seam } = makeFakeSeam(ORIGINAL_TARGET);
    const result = setupIsolation(TWEAKCC_CONFIG, seam);
    expect(result.savedSymlinkTarget).toBe(ORIGINAL_TARGET);
  });

  it('records the throwaway dir path for cleanup', () => {
    const { seam } = makeFakeSeam(ORIGINAL_TARGET);
    const result = setupIsolation(TWEAKCC_CONFIG, seam);
    expect(result.throwawayDir).toBeDefined();
    expect(typeof result.throwawayDir).toBe('string');
  });

  it('the new symlink target equals the throwaway dir', () => {
    const { seam, symlink } = makeFakeSeam(ORIGINAL_TARGET);
    const result = setupIsolation(TWEAKCC_CONFIG, seam);
    expect(symlink.target).toBe(result.throwawayDir);
  });
});

// ── AC 2: teardown restores original symlink target on success AND on throw ──

describe('teardownIsolation — restores original symlink target (AC 2)', () => {
  it('restores the symlink to the original target on normal exit', () => {
    const { seam, symlink } = makeFakeSeam(ORIGINAL_TARGET);
    const setup = setupIsolation(TWEAKCC_CONFIG, seam);
    teardownIsolation(TWEAKCC_CONFIG, setup, seam);
    expect(symlink.target).toBe(ORIGINAL_TARGET);
  });

  it('removes the throwaway dir on teardown', () => {
    const { seam, thrownTemp } = makeFakeSeam(ORIGINAL_TARGET);
    const setup = setupIsolation(TWEAKCC_CONFIG, seam);
    teardownIsolation(TWEAKCC_CONFIG, setup, seam);
    expect(thrownTemp).toContain(setup.throwawayDir);
  });

  it('withIsolation restores even when the run body throws', () => {
    const { seam, symlink } = makeFakeSeam(ORIGINAL_TARGET);
    expect(() =>
      withIsolation(TWEAKCC_CONFIG, seam, (_result) => {
        throw new Error('body failure');
      }),
    ).toThrow('body failure');
    // Symlink must be restored despite the throw
    expect(symlink.target).toBe(ORIGINAL_TARGET);
  });

  it('withIsolation removes the throwaway dir even when the run body throws', () => {
    const { seam, thrownTemp } = makeFakeSeam(ORIGINAL_TARGET);
    let capturedThrowaway: string | undefined;
    expect(() =>
      withIsolation(TWEAKCC_CONFIG, seam, (result) => {
        capturedThrowaway = result.throwawayDir;
        throw new Error('body failure');
      }),
    ).toThrow('body failure');
    expect(thrownTemp).toContain(capturedThrowaway);
  });

  it('withIsolation returns the body return value on success', () => {
    const { seam } = makeFakeSeam(ORIGINAL_TARGET);
    const value = withIsolation(TWEAKCC_CONFIG, seam, () => 42);
    expect(value).toBe(42);
  });

  it('withIsolation restores the symlink on success', () => {
    const { seam, symlink } = makeFakeSeam(ORIGINAL_TARGET);
    withIsolation(TWEAKCC_CONFIG, seam, () => 'done');
    expect(symlink.target).toBe(ORIGINAL_TARGET);
  });

  it('no leftover isolated symlink after teardown: target is the original, not the throwaway', () => {
    const { seam, symlink } = makeFakeSeam(ORIGINAL_TARGET);
    const setup = setupIsolation(TWEAKCC_CONFIG, seam);
    const throwawayDir = setup.throwawayDir;
    teardownIsolation(TWEAKCC_CONFIG, setup, seam);
    expect(symlink.target).toBe(ORIGINAL_TARGET);
    expect(symlink.target).not.toBe(throwawayDir);
  });
});

// ── AC 3: isolated run → orphans [], Boot-verify ✓, mis-bind not-run pass-through ──

describe('isolated run produces clean patcher+prompts record (AC 3)', () => {
  /**
   * Simulates what the gate sees when isolation is requested: overrideDirs is empty,
   * isolationExplicit is true, and the other signals are clean.
   *
   * The mis-bind audit pass-through is the already-merged #262 contract — tested in
   * audit-not-run.test.ts. This test confirms the evaluate() composition with isolation
   * signals produces the correct record shape: orphans [], Boot-verify ✓, not-run
   * pass-through, no unexpected-empty warning.
   */
  it('empty overrideDirs + isolationExplicit → Four-zeros pass with not-run pass-through', () => {
    const signals: CapturedSignals = {
      apply: 'All patches applied.',
      bootVerify: 'Boot-verify OK: patched binary responded to prompt.',
      validator: 'Orphan-variable check: 0 orphans.',
      orphanReport: JSON.stringify({ version: '2.1.177', prompts: {} }),
      // empty override surface with explicit isolation (what setup produces)
      auditMisbinds: undefined,
      auditNotRunReason: 'not-run',
      isolationExplicit: true,
    };
    const result = evaluate(signals);
    expect(result.pass).toBe(true);
    expect(result.orphanVariables).toEqual([]);
    expect(result.bootVerifyPassed).toBe(true);
    expect(result.auditMisbindsPassed).toBeUndefined();
    expect(result.auditNotRunReason).toBe('not-run');
    // No unexpected-empty warning when isolation was explicit
    expect(result.unexpectedEmptyOverrideDirs).toBe(false);
  });

  it('isolated run with stale lobotomized overrides: isolation prevents the stale dirs from reaching the gate', () => {
    // The gate receives empty overrideDirs (the isolated state) — stale dirs never enter the scan.
    const { seam } = makeFakeSeam(ORIGINAL_TARGET);
    const setup = setupIsolation(TWEAKCC_CONFIG, seam);
    // overrideDirs is empty — stale lobotomized dirs are not present
    expect(setup.overrideDirs).toEqual([]);
    teardownIsolation(TWEAKCC_CONFIG, setup, seam);
  });
});

// ── AC 4: no gate runtime writes inside a tracked work clone ─────────────────

describe('isolation prevents runtime writes inside a tracked work clone (AC 4)', () => {
  it('the throwaway dir is under tmpdir, not inside any lobotomized clone path', () => {
    // The fake seam prefixes throwaway dirs with a temp prefix — in the real seam, mkdtempSync
    // uses os.tmpdir(). The throwaway must not be a subdirectory of the tracked clone path.
    const trackedClone = '/home/user/repos/lobotomized-claude-code';
    const { seam, symlink } = makeFakeSeam(ORIGINAL_TARGET);
    const result = setupIsolation(TWEAKCC_CONFIG, seam);
    // The symlink now points at the throwaway (not the tracked clone), so tweakcc-fixed's
    // runtime writes land in the throwaway dir, not in the tracked clone.
    expect(symlink.target!.startsWith(trackedClone)).toBe(false);
    teardownIsolation(TWEAKCC_CONFIG, result, seam);
  });

  it('after teardown, the symlink points back at the original target (tracked clone or wherever)', () => {
    const { seam, symlink } = makeFakeSeam(ORIGINAL_TARGET);
    const setup = setupIsolation(TWEAKCC_CONFIG, seam);
    teardownIsolation(TWEAKCC_CONFIG, setup, seam);
    expect(symlink.target).toBe(ORIGINAL_TARGET);
  });
});

// ── withIsolation: the run body receives the setup result ────────────────────

describe('withIsolation — body receives IsolationSetupResult (setup shape)', () => {
  it('body receives overrideDirs: [] from the setup', () => {
    const { seam } = makeFakeSeam(ORIGINAL_TARGET);
    let capturedOverrideDirs: string[] | undefined;
    withIsolation(TWEAKCC_CONFIG, seam, (result) => {
      capturedOverrideDirs = result.overrideDirs;
    });
    expect(capturedOverrideDirs).toEqual([]);
  });

  it('body receives throwawayDir string from the setup', () => {
    const { seam } = makeFakeSeam(ORIGINAL_TARGET);
    let capturedDir: string | undefined;
    withIsolation(TWEAKCC_CONFIG, seam, (result) => {
      capturedDir = result.throwawayDir;
    });
    expect(typeof capturedDir).toBe('string');
  });
});
