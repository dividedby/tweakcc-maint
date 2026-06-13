/**
 * Tests for issue #263 — ISOLATE_OVERRIDES: both surfaces isolated + auto-restore.
 *
 * Covers the Override-surface composition module (setup + teardown):
 *   - AC 1: isolation points both surfaces at throwaway/empty dirs
 *   - AC 2: teardown restores the original state on success AND on throw — for all three
 *     possible states of ~/.tweakcc/system-prompts (symlink / real-dir / absent)
 *   - AC 3: isolated run → orphans [], Boot-verify ✓, mis-bind not-run pass-through
 *   - AC 4: no gate runtime writes land inside a tracked work clone
 *
 * Fakes: injected temp-dir + fake fs ops — no real fs mutations.
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

type FsEntry =
  | { kind: 'symlink'; target: string }
  | { kind: 'directory' }
  | { kind: 'absent' };

interface FsState {
  [path: string]: FsEntry;
}

function makeFakeSeam(initialFs: FsState): {
  seam: IsolationFsSeam;
  fs: FsState;
  removedPaths: string[];
} {
  const fs: FsState = { ...initialFs };
  const removedPaths: string[] = [];
  let tempCounter = 0;

  const seam: IsolationFsSeam = {
    lstat: (path) => {
      const entry = fs[path];
      if (!entry || entry.kind === 'absent') {
        const err = new Error(`ENOENT: no such file or directory, lstat '${path}'`) as NodeJS.ErrnoException;
        err.code = 'ENOENT';
        throw err;
      }
      return {
        isSymbolicLink: () => entry.kind === 'symlink',
      };
    },
    readlink: (path) => {
      const entry = fs[path];
      if (!entry || entry.kind !== 'symlink') throw new Error(`Not a symlink: ${path}`);
      return entry.target;
    },
    symlinkSync: (target, path) => {
      fs[path] = { kind: 'symlink', target };
    },
    unlinkSync: (path) => {
      delete fs[path];
    },
    rename: (oldPath, newPath) => {
      fs[newPath] = fs[oldPath]!;
      delete fs[oldPath];
    },
    mkdir: (path) => {
      fs[path] = { kind: 'directory' };
    },
    mkdtempSync: (prefix) => {
      const dir = `${prefix}${tempCounter++}`;
      fs[dir] = { kind: 'directory' };
      return dir;
    },
    rmSync: (dir, _opts) => {
      removedPaths.push(dir);
      delete fs[dir];
    },
  };

  return { seam, fs, removedPaths };
}

const TWEAKCC_CONFIG = '/home/user/.tweakcc';
const LINK_PATH = '/home/user/.tweakcc/system-prompts';
const ORIGINAL_TARGET = '/home/user/repos/lobotomized-claude-code/system-prompts-opus-4-8';

// Helper: make a fresh seam for each variant
function makeSymlinkSeam() {
  return makeFakeSeam({ [LINK_PATH]: { kind: 'symlink', target: ORIGINAL_TARGET } });
}
function makeDirectorySeam() {
  return makeFakeSeam({ [LINK_PATH]: { kind: 'directory' } });
}
function makeAbsentSeam() {
  return makeFakeSeam({});
}

// ── AC 1: setup points both surfaces at throwaway/empty dirs ─────────────────

describe('setupIsolation — symlink case (AC 1)', () => {
  it('returns an empty overrideDirs array', () => {
    const { seam } = makeSymlinkSeam();
    const result = setupIsolation(TWEAKCC_CONFIG, seam);
    expect(result.overrideDirs).toEqual([]);
  });

  it('records kind: symlink', () => {
    const { seam } = makeSymlinkSeam();
    const result = setupIsolation(TWEAKCC_CONFIG, seam);
    expect(result.kind).toBe('symlink');
  });

  it('repoints the symlink at a throwaway dir', () => {
    const { seam, fs } = makeSymlinkSeam();
    setupIsolation(TWEAKCC_CONFIG, seam);
    const entry = fs[LINK_PATH];
    expect(entry?.kind).toBe('symlink');
    expect((entry as { kind: 'symlink'; target: string }).target).not.toBe(ORIGINAL_TARGET);
    expect((entry as { kind: 'symlink'; target: string }).target).toContain('isolated-');
  });

  it('saves the original symlink target', () => {
    const { seam } = makeSymlinkSeam();
    const result = setupIsolation(TWEAKCC_CONFIG, seam);
    if (result.kind !== 'symlink') throw new Error('expected symlink kind');
    expect(result.savedTarget).toBe(ORIGINAL_TARGET);
  });

  it('the new symlink target equals the throwawayDir', () => {
    const { seam, fs } = makeSymlinkSeam();
    const result = setupIsolation(TWEAKCC_CONFIG, seam);
    if (result.kind !== 'symlink') throw new Error('expected symlink kind');
    const entry = fs[LINK_PATH] as { kind: 'symlink'; target: string };
    expect(entry.target).toBe(result.throwawayDir);
  });
});

describe('setupIsolation — real-directory case (AC 1)', () => {
  it('returns an empty overrideDirs array', () => {
    const { seam } = makeDirectorySeam();
    const result = setupIsolation(TWEAKCC_CONFIG, seam);
    expect(result.overrideDirs).toEqual([]);
  });

  it('records kind: directory', () => {
    const { seam } = makeDirectorySeam();
    const result = setupIsolation(TWEAKCC_CONFIG, seam);
    expect(result.kind).toBe('directory');
  });

  it('moves the real dir aside (link path becomes a directory, real dir at savedPath)', () => {
    const { seam, fs } = makeDirectorySeam();
    const result = setupIsolation(TWEAKCC_CONFIG, seam);
    if (result.kind !== 'directory') throw new Error('expected directory kind');
    // The link path now has an empty directory (the isolated surface).
    expect(fs[LINK_PATH]?.kind).toBe('directory');
    // The savedPath has the original directory (moved there).
    expect(fs[result.savedPath]?.kind).toBe('directory');
    // The throwawayDir is the link path itself.
    expect(result.throwawayDir).toBe(LINK_PATH);
  });

  it('does NOT call readlink on the real directory (no EINVAL)', () => {
    const { seam } = makeDirectorySeam();
    // The real seam would throw EINVAL on readlink for a non-symlink;
    // our fake would throw "Not a symlink". This confirms readlink is not called.
    const readlinkCalls: string[] = [];
    const wrappedSeam: IsolationFsSeam = {
      ...seam,
      readlink: (path) => { readlinkCalls.push(path); return seam.readlink(path); },
    };
    setupIsolation(TWEAKCC_CONFIG, wrappedSeam);
    expect(readlinkCalls).toHaveLength(0);
  });
});

describe('setupIsolation — absent case (AC 1)', () => {
  it('returns an empty overrideDirs array', () => {
    const { seam } = makeAbsentSeam();
    const result = setupIsolation(TWEAKCC_CONFIG, seam);
    expect(result.overrideDirs).toEqual([]);
  });

  it('records kind: absent', () => {
    const { seam } = makeAbsentSeam();
    const result = setupIsolation(TWEAKCC_CONFIG, seam);
    expect(result.kind).toBe('absent');
  });

  it('creates a directory at the link path as the isolated surface', () => {
    const { seam, fs } = makeAbsentSeam();
    setupIsolation(TWEAKCC_CONFIG, seam);
    expect(fs[LINK_PATH]?.kind).toBe('directory');
  });

  it('throwawayDir equals the link path', () => {
    const { seam } = makeAbsentSeam();
    const result = setupIsolation(TWEAKCC_CONFIG, seam);
    expect(result.throwawayDir).toBe(LINK_PATH);
  });
});

// ── AC 2: teardown restores original state on success AND on throw ────────────

describe('teardownIsolation — symlink case (AC 2)', () => {
  it('restores the symlink to the original target on normal exit', () => {
    const { seam, fs } = makeSymlinkSeam();
    const setup = setupIsolation(TWEAKCC_CONFIG, seam);
    teardownIsolation(TWEAKCC_CONFIG, setup, seam);
    const entry = fs[LINK_PATH] as { kind: 'symlink'; target: string };
    expect(entry?.kind).toBe('symlink');
    expect(entry?.target).toBe(ORIGINAL_TARGET);
  });

  it('removes the throwaway dir on teardown', () => {
    const { seam, removedPaths } = makeSymlinkSeam();
    const setup = setupIsolation(TWEAKCC_CONFIG, seam);
    if (setup.kind !== 'symlink') throw new Error('expected symlink kind');
    teardownIsolation(TWEAKCC_CONFIG, setup, seam);
    expect(removedPaths).toContain(setup.throwawayDir);
  });

  it('withIsolation restores the symlink even when the run body throws', () => {
    const { seam, fs } = makeSymlinkSeam();
    expect(() =>
      withIsolation(TWEAKCC_CONFIG, seam, () => { throw new Error('body failure'); }),
    ).toThrow('body failure');
    const entry = fs[LINK_PATH] as { kind: 'symlink'; target: string };
    expect(entry?.kind).toBe('symlink');
    expect(entry?.target).toBe(ORIGINAL_TARGET);
  });

  it('withIsolation removes the throwaway dir even when the run body throws', () => {
    const { seam, removedPaths } = makeSymlinkSeam();
    let capturedThrowaway: string | undefined;
    expect(() =>
      withIsolation(TWEAKCC_CONFIG, seam, (result) => {
        capturedThrowaway = result.throwawayDir;
        throw new Error('body failure');
      }),
    ).toThrow('body failure');
    expect(removedPaths).toContain(capturedThrowaway);
  });
});

describe('teardownIsolation — real-directory case (AC 2)', () => {
  it('removes the isolated surface and renames the real dir back on normal exit', () => {
    const { seam, fs, removedPaths } = makeDirectorySeam();
    const setup = setupIsolation(TWEAKCC_CONFIG, seam);
    if (setup.kind !== 'directory') throw new Error('expected directory kind');
    const savedPath = setup.savedPath;
    teardownIsolation(TWEAKCC_CONFIG, setup, seam);
    // The isolated surface (at link path) was removed.
    expect(removedPaths).toContain(LINK_PATH);
    // The real dir was renamed back to the link path.
    expect(fs[LINK_PATH]?.kind).toBe('directory');
    // The savedPath is now absent.
    expect(fs[savedPath]).toBeUndefined();
  });

  it('withIsolation renames the real dir back even when the run body throws', () => {
    const { seam, fs } = makeDirectorySeam();
    let savedPath: string | undefined;
    expect(() =>
      withIsolation(TWEAKCC_CONFIG, seam, (result) => {
        if (result.kind !== 'directory') throw new Error('expected directory kind');
        savedPath = result.savedPath;
        throw new Error('body failure');
      }),
    ).toThrow('body failure');
    // The real dir must be back at the link path.
    expect(fs[LINK_PATH]?.kind).toBe('directory');
    // The savedPath should be absent (renamed back).
    if (savedPath) expect(fs[savedPath]).toBeUndefined();
  });

  it('withIsolation removes the isolated surface even when the run body throws', () => {
    const { seam, removedPaths } = makeDirectorySeam();
    expect(() =>
      withIsolation(TWEAKCC_CONFIG, seam, () => { throw new Error('body failure'); }),
    ).toThrow('body failure');
    expect(removedPaths).toContain(LINK_PATH);
  });
});

describe('teardownIsolation — absent case (AC 2)', () => {
  it('removes the created empty dir on normal exit (path returns to absent)', () => {
    const { seam, fs, removedPaths } = makeAbsentSeam();
    const setup = setupIsolation(TWEAKCC_CONFIG, seam);
    teardownIsolation(TWEAKCC_CONFIG, setup, seam);
    expect(removedPaths).toContain(LINK_PATH);
    expect(fs[LINK_PATH]).toBeUndefined();
  });

  it('withIsolation removes the created dir even when the run body throws', () => {
    const { seam, fs, removedPaths } = makeAbsentSeam();
    expect(() =>
      withIsolation(TWEAKCC_CONFIG, seam, () => { throw new Error('body failure'); }),
    ).toThrow('body failure');
    expect(removedPaths).toContain(LINK_PATH);
    expect(fs[LINK_PATH]).toBeUndefined();
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
    const { seam } = makeSymlinkSeam();
    const setup = setupIsolation(TWEAKCC_CONFIG, seam);
    // overrideDirs is empty — stale lobotomized dirs are not present
    expect(setup.overrideDirs).toEqual([]);
    teardownIsolation(TWEAKCC_CONFIG, setup, seam);
  });
});

// ── AC 4: no gate runtime writes inside a tracked work clone ─────────────────

describe('isolation prevents runtime writes inside a tracked work clone (AC 4)', () => {
  it('symlink case: the symlink points at throwaway (not the tracked clone)', () => {
    const trackedClone = '/home/user/repos/lobotomized-claude-code';
    const { seam, fs } = makeSymlinkSeam();
    setupIsolation(TWEAKCC_CONFIG, seam);
    const entry = fs[LINK_PATH] as { kind: 'symlink'; target: string };
    expect(entry.target.startsWith(trackedClone)).toBe(false);
  });

  it('after teardown, the symlink points back at the original target (tracked clone or wherever)', () => {
    const { seam, fs } = makeSymlinkSeam();
    const setup = setupIsolation(TWEAKCC_CONFIG, seam);
    teardownIsolation(TWEAKCC_CONFIG, setup, seam);
    const entry = fs[LINK_PATH] as { kind: 'symlink'; target: string };
    expect(entry.target).toBe(ORIGINAL_TARGET);
  });

  it('directory case: the real dir is moved aside, not left at the link path during the run', () => {
    const { seam, fs } = makeDirectorySeam();
    const setup = setupIsolation(TWEAKCC_CONFIG, seam);
    if (setup.kind !== 'directory') throw new Error('expected directory kind');
    // During the run, the savedPath holds the original dir — it should exist there.
    expect(fs[setup.savedPath]?.kind).toBe('directory');
    teardownIsolation(TWEAKCC_CONFIG, setup, seam);
  });
});

// ── withIsolation: the run body receives the setup result ────────────────────

describe('withIsolation — body receives IsolationSetupResult (setup shape)', () => {
  it('body receives overrideDirs: [] from the setup (symlink case)', () => {
    const { seam } = makeSymlinkSeam();
    let capturedOverrideDirs: string[] | undefined;
    withIsolation(TWEAKCC_CONFIG, seam, (result) => {
      capturedOverrideDirs = result.overrideDirs;
    });
    expect(capturedOverrideDirs).toEqual([]);
  });

  it('body receives overrideDirs: [] from the setup (directory case)', () => {
    const { seam } = makeDirectorySeam();
    let capturedOverrideDirs: string[] | undefined;
    withIsolation(TWEAKCC_CONFIG, seam, (result) => {
      capturedOverrideDirs = result.overrideDirs;
    });
    expect(capturedOverrideDirs).toEqual([]);
  });

  it('body receives overrideDirs: [] from the setup (absent case)', () => {
    const { seam } = makeAbsentSeam();
    let capturedOverrideDirs: string[] | undefined;
    withIsolation(TWEAKCC_CONFIG, seam, (result) => {
      capturedOverrideDirs = result.overrideDirs;
    });
    expect(capturedOverrideDirs).toEqual([]);
  });

  it('body receives throwawayDir string from the setup (symlink case)', () => {
    const { seam } = makeSymlinkSeam();
    let capturedDir: string | undefined;
    withIsolation(TWEAKCC_CONFIG, seam, (result) => {
      capturedDir = result.throwawayDir;
    });
    expect(typeof capturedDir).toBe('string');
  });

  it('withIsolation returns the body return value on success', () => {
    const { seam } = makeSymlinkSeam();
    const value = withIsolation(TWEAKCC_CONFIG, seam, () => 42);
    expect(value).toBe(42);
  });
});
