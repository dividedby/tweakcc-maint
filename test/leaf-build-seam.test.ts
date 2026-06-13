/**
 * Tests for the LeafBuildSeam — stale-build detection + refresh in adopt() (#261).
 *
 * Acceptance criteria:
 * 1. Given src/ is newer than dist/index.mjs → build is called before --apply.
 * 2. Given a behavior-changing source edit → the next gate run rebuilds automatically
 *    (i.e. build is NOT called when fresh, IS called when stale).
 * 3. Given a stale build that cannot be refreshed (build fails or still stale after build)
 *    → gate throws with an explicit message; never a silently-stale apply.
 *
 * The test subclass overrides `installedVersion()`, `runVerification()`, and
 * `buildLeafDist()` to bypass real shell-outs. The `LeafBuildSeam` is injected
 * with a fake so no real filesystem or build tool interactions occur.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  RealAdoptionEnvironment,
  type RealAdoptionEnvironmentConfig,
  type LeafBuildSeam,
} from '../src/real-adoption-environment.js';
import type { CapturedSignals } from '../src/four-zeros-verdict.js';
import type { IsolationFsSeam } from '../src/override-surface-isolation.js';

// ── Null IsolationFsSeam (isolation not under test here) ─────────────────────

const nullIsolationSeam: IsolationFsSeam = {
  lstat: () => ({ isSymbolicLink: () => true }),
  readlink: () => '/original/target',
  symlinkSync: () => {},
  mkdtempSync: (prefix) => `${prefix}0`,
  rmSync: () => {},
};

// ── Fake LeafBuildSeam ────────────────────────────────────────────────────────

interface BuildSeamCalls {
  buildDirs: string[];
}

type MtimeConfig =
  | { kind: 'fresh' }                    // dist is newer than src — no build needed
  | { kind: 'stale' }                    // src is newer than dist — build needed
  | { kind: 'stale-after-build' };       // src still newer even after build — permanent stale

function makeFakeBuildSeam(
  config: MtimeConfig,
  buildSucceeds = true,
): { seam: LeafBuildSeam; calls: BuildSeamCalls } {
  const calls: BuildSeamCalls = { buildDirs: [] };

  // Simulate mtime via simple counters. "Stale" = src mtime > dist mtime.
  const BASE_DIST = 1000;
  const BASE_SRC_STALE = 2000;  // newer than dist
  const BASE_SRC_FRESH = 500;   // older than dist

  let buildCount = 0;

  const seam: LeafBuildSeam = {
    newestSrcMtime: (_dir) => {
      if (config.kind === 'fresh') return BASE_SRC_FRESH;
      // stale and stale-after-build: src is always newer
      return BASE_SRC_STALE;
    },
    distMtime: (_distCli) => {
      if (config.kind === 'fresh') return BASE_DIST;
      if (config.kind === 'stale') {
        // After a successful build, dist becomes fresh
        return buildCount > 0 ? BASE_SRC_STALE + 1 : BASE_DIST;
      }
      // stale-after-build: dist never catches up
      return BASE_DIST;
    },
    build: (_dir) => {
      calls.buildDirs.push(_dir);
      buildCount++;
      if (!buildSucceeds) throw new Error('pnpm build failed');
    },
  };

  return { seam, calls };
}

// ── Canned signals (clean pass) ───────────────────────────────────────────────

const CLEAN_SIGNALS: Pick<CapturedSignals, 'apply' | 'bootVerify' | 'validator'> = {
  apply: 'All patches applied.',
  bootVerify: 'Boot-verify OK: patched binary responded to prompt.',
  validator: 'Orphan-variable check: 0 orphans.',
};

// ── Test subclass ─────────────────────────────────────────────────────────────

class TestableEnv extends RealAdoptionEnvironment {
  readonly verifyCallCount: { n: number } = { n: 0 };
  private readonly _cannedVersion: string;

  constructor(
    config: RealAdoptionEnvironmentConfig,
    buildSeam: LeafBuildSeam,
    cannedVersion: string,
  ) {
    super(config, nullIsolationSeam, buildSeam);
    this._cannedVersion = cannedVersion;
  }

  protected override installedVersion(): string {
    return this._cannedVersion;
  }

  protected override runVerification(
    _overrideDirs: string[],
    _stringsFile: string,
    _ccVersion: string,
  ): Pick<CapturedSignals, 'apply' | 'bootVerify' | 'validator'> {
    this.verifyCallCount.n++;
    return CLEAN_SIGNALS;
  }
}

// ── Temp fixture dir ──────────────────────────────────────────────────────────

const VERSION = '2.1.261';

let fixtureDir: string;

beforeEach(() => {
  fixtureDir = mkdtempSync(join(tmpdir(), 'leaf-build-seam-'));
  mkdirSync(join(fixtureDir, 'dist'), { recursive: true });
  writeFileSync(join(fixtureDir, 'dist', 'index.mjs'), '// stub');
  mkdirSync(join(fixtureDir, 'src'), { recursive: true });
  writeFileSync(join(fixtureDir, 'src', 'index.ts'), '// stub source');
  mkdirSync(join(fixtureDir, 'data', 'prompts'), { recursive: true });
  writeFileSync(
    join(fixtureDir, 'data', 'prompts', `prompts-${VERSION}.json`),
    JSON.stringify({ prompts: [] }),
  );
});

afterEach(() => {
  rmSync(fixtureDir, { recursive: true, force: true });
});

function makeConfig(extra: Partial<RealAdoptionEnvironmentConfig> = {}): RealAdoptionEnvironmentConfig {
  return {
    tweakccFixedDir: fixtureDir,
    lobotomizedDir: fixtureDir,
    tweakccConfigDir: join(fixtureDir, 'tweakcc'),
    promptDirs: ['/fake/prompts/opus'],
    ...extra,
  };
}

// ── AC 2: fresh build — no rebuild triggered ──────────────────────────────────

describe('LeafBuildSeam — fresh dist (src older than dist)', () => {
  it('does NOT call build when dist is fresh', () => {
    const { seam, calls } = makeFakeBuildSeam({ kind: 'fresh' });
    const env = new TestableEnv(makeConfig(), seam, VERSION);
    env.adopt(VERSION);
    expect(calls.buildDirs).toHaveLength(0);
  });

  it('proceeds to runVerification when dist is fresh', () => {
    const { seam } = makeFakeBuildSeam({ kind: 'fresh' });
    const env = new TestableEnv(makeConfig(), seam, VERSION);
    env.adopt(VERSION);
    expect(env.verifyCallCount.n).toBe(1);
  });
});

// ── AC 1 + AC 2: stale build — build is called, then proceeds ─────────────────

describe('LeafBuildSeam — stale dist (src newer than dist)', () => {
  it('calls build exactly once when stale', () => {
    const { seam, calls } = makeFakeBuildSeam({ kind: 'stale' });
    const env = new TestableEnv(makeConfig(), seam, VERSION);
    env.adopt(VERSION);
    expect(calls.buildDirs).toHaveLength(1);
  });

  it('calls build with tweakccFixedDir', () => {
    const { seam, calls } = makeFakeBuildSeam({ kind: 'stale' });
    const env = new TestableEnv(makeConfig(), seam, VERSION);
    env.adopt(VERSION);
    expect(calls.buildDirs[0]).toBe(fixtureDir);
  });

  it('proceeds to runVerification after a successful build', () => {
    const { seam } = makeFakeBuildSeam({ kind: 'stale' });
    const env = new TestableEnv(makeConfig(), seam, VERSION);
    env.adopt(VERSION);
    expect(env.verifyCallCount.n).toBe(1);
  });
});

// ── AC 3: stale and build fails ───────────────────────────────────────────────

describe('LeafBuildSeam — build fails (pnpm build errors)', () => {
  it('throws an explicit error message when build fails', () => {
    const { seam } = makeFakeBuildSeam({ kind: 'stale' }, /* buildSucceeds */ false);
    const env = new TestableEnv(makeConfig(), seam, VERSION);
    expect(() => env.adopt(VERSION)).toThrow(/build.*failed|failed.*build/i);
  });

  it('does NOT call runVerification when build fails', () => {
    const { seam } = makeFakeBuildSeam({ kind: 'stale' }, false);
    const env = new TestableEnv(makeConfig(), seam, VERSION);
    expect(() => env.adopt(VERSION)).toThrow();
    expect(env.verifyCallCount.n).toBe(0);
  });

  it('error message mentions tweakccFixedDir', () => {
    const { seam } = makeFakeBuildSeam({ kind: 'stale' }, false);
    const env = new TestableEnv(makeConfig(), seam, VERSION);
    expect(() => env.adopt(VERSION)).toThrow(fixtureDir);
  });
});

// ── AC 3: build succeeds but dist is STILL stale ─────────────────────────────

describe('LeafBuildSeam — stale-after-build (dist still older after build)', () => {
  it('throws an explicit error message when dist remains stale after build', () => {
    const { seam } = makeFakeBuildSeam({ kind: 'stale-after-build' });
    const env = new TestableEnv(makeConfig(), seam, VERSION);
    expect(() => env.adopt(VERSION)).toThrow(/stale|not.*refresh|still.*stale/i);
  });

  it('does NOT call runVerification when dist is still stale after build', () => {
    const { seam } = makeFakeBuildSeam({ kind: 'stale-after-build' });
    const env = new TestableEnv(makeConfig(), seam, VERSION);
    expect(() => env.adopt(VERSION)).toThrow();
    expect(env.verifyCallCount.n).toBe(0);
  });

  it('error message mentions tweakccFixedDir when still stale', () => {
    const { seam } = makeFakeBuildSeam({ kind: 'stale-after-build' });
    const env = new TestableEnv(makeConfig(), seam, VERSION);
    expect(() => env.adopt(VERSION)).toThrow(fixtureDir);
  });
});

// ── Isolation path: build check also runs before --apply in isolation mode ───

describe('LeafBuildSeam — stale check also runs in isolateOverrides path', () => {
  it('calls build when stale, even with isolateOverrides: true', () => {
    const { seam, calls } = makeFakeBuildSeam({ kind: 'stale' });
    const env = new TestableEnv(makeConfig({ isolateOverrides: true }), seam, VERSION);
    env.adopt(VERSION);
    expect(calls.buildDirs).toHaveLength(1);
  });

  it('does NOT call build when fresh, even with isolateOverrides: true', () => {
    const { seam, calls } = makeFakeBuildSeam({ kind: 'fresh' });
    const env = new TestableEnv(makeConfig({ isolateOverrides: true }), seam, VERSION);
    env.adopt(VERSION);
    expect(calls.buildDirs).toHaveLength(0);
  });
});
