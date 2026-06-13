/**
 * Tests for the ISOLATE_OVERRIDES wiring in RealAdoptionEnvironment (#263).
 *
 * These tests exercise the isolation flag in the gate environment's adopt() method:
 *   - Flag set: withIsolation is called (fake seam observes setup+teardown), overrideDirs
 *     is [] when runVerification receives it, isolationExplicit: true reaches the verdict.
 *   - Restore on throw: teardown runs even when the verification body throws.
 *   - Flag unset: no isolation, promptDirs reaches runVerification unchanged.
 *
 * The test subclass overrides `installedVersion()` and `runVerification()` to bypass real
 * shell-outs (HITL concern — identical to restore-drill.test.ts's rationale). The
 * `IsolationFsSeam` is injected with a fake so no real symlink mutations occur (#263 seam pattern).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  RealAdoptionEnvironment,
  type RealAdoptionEnvironmentConfig,
} from '../src/real-adoption-environment.js';
import type { CapturedSignals } from '../src/four-zeros-verdict.js';
import type { IsolationFsSeam } from '../src/override-surface-isolation.js';

// ── Fake IsolationFsSeam (same shape as override-surface-isolation.test.ts) ──

interface SeamCalls {
  readlinkCalled: boolean;
  mkdtempCalled: boolean;
  symlinkTargets: string[];
  rmSyncCalled: boolean;
}

function makeFakeSeam(originalTarget: string): { seam: IsolationFsSeam; calls: SeamCalls } {
  let currentTarget = originalTarget;
  let tempCounter = 0;
  const calls: SeamCalls = {
    readlinkCalled: false,
    mkdtempCalled: false,
    symlinkTargets: [],
    rmSyncCalled: false,
  };

  const seam: IsolationFsSeam = {
    readlink: (_path) => {
      calls.readlinkCalled = true;
      return currentTarget;
    },
    symlinkSync: (target, _path) => {
      calls.symlinkTargets.push(target);
      currentTarget = target;
    },
    mkdtempSync: (prefix) => {
      calls.mkdtempCalled = true;
      return `${prefix}${tempCounter++}`;
    },
    rmSync: (_dir, _opts) => {
      calls.rmSyncCalled = true;
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

/**
 * Subclass that replaces the HITL shell-outs (`installedVersion`, `runVerification`)
 * with controllable test doubles. Captures the args runVerification receives to verify
 * the isolation wiring.
 */
class TestableEnv extends RealAdoptionEnvironment {
  readonly verifyCallArgs: Array<{ overrideDirs: string[]; stringsFile: string; ccVersion: string }> = [];
  private readonly _cannedVersion: string;
  private _verifyResult:
    | (() => Pick<CapturedSignals, 'apply' | 'bootVerify' | 'validator'>)
    | 'throw'
    | null = null;

  constructor(
    config: RealAdoptionEnvironmentConfig,
    seam: IsolationFsSeam,
    cannedVersion: string,
    verifyResult:
      | Pick<CapturedSignals, 'apply' | 'bootVerify' | 'validator'>
      | 'throw' = CLEAN_SIGNALS,
  ) {
    super(config, seam);
    this._cannedVersion = cannedVersion;
    if (verifyResult === 'throw') {
      this._verifyResult = 'throw';
    } else {
      const result = verifyResult;
      this._verifyResult = () => result;
    }
  }

  protected override installedVersion(): string {
    return this._cannedVersion;
  }

  protected override runVerification(
    overrideDirs: string[],
    stringsFile: string,
    ccVersion: string,
  ): Pick<CapturedSignals, 'apply' | 'bootVerify' | 'validator'> {
    this.verifyCallArgs.push({ overrideDirs, stringsFile, ccVersion });
    if (this._verifyResult === 'throw') {
      throw new Error('verification body failure');
    }
    return this._verifyResult!();
  }
}

// ── Temp fixture dir ──────────────────────────────────────────────────────────

const VERSION = '2.1.177';

let fixtureDir: string;

/**
 * Create a minimal tweakcc-fixed fixture: dist/index.mjs (so the existsSync check
 * in adopt() passes) and data/prompts/prompts-{version}.json (so resolveStringsFilePath
 * finds a strings file without a real leaf checkout).
 */
beforeEach(() => {
  fixtureDir = mkdtempSync(join(tmpdir(), 'rae-isolation-'));
  mkdirSync(join(fixtureDir, 'dist'), { recursive: true });
  writeFileSync(join(fixtureDir, 'dist', 'index.mjs'), '// stub');
  mkdirSync(join(fixtureDir, 'data', 'prompts'), { recursive: true });
  // Minimal valid StringsFile — { prompts: [] } — no real strings needed for these tests.
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
    lobotomizedDir: fixtureDir,          // unused by the subclass (no dir discovery)
    tweakccConfigDir: join(fixtureDir, 'tweakcc'),
    promptDirs: ['/fake/prompts/opus'],  // explicit, so discoverPromptDirs is not called
    ...extra,
  };
}

// ── Flag SET: isolation wiring ────────────────────────────────────────────────

describe('adopt() with isolateOverrides: true — isolation wiring (flag SET)', () => {
  it('fake seam observes setup: readlink + mkdtemp + symlinkSync called during adopt()', () => {
    const { seam, calls } = makeFakeSeam('/original/target');
    const env = new TestableEnv(makeConfig({ isolateOverrides: true }), seam, VERSION);
    env.adopt(VERSION);
    expect(calls.readlinkCalled).toBe(true);
    expect(calls.mkdtempCalled).toBe(true);
    expect(calls.symlinkTargets.length).toBeGreaterThanOrEqual(1);
  });

  it('fake seam observes teardown: rmSync called and symlink restored after adopt()', () => {
    const { seam, calls } = makeFakeSeam('/original/target');
    const env = new TestableEnv(makeConfig({ isolateOverrides: true }), seam, VERSION);
    env.adopt(VERSION);
    expect(calls.rmSyncCalled).toBe(true);
    // Teardown re-points the symlink back to the original target
    const lastTarget = calls.symlinkTargets.at(-1);
    expect(lastTarget).toBe('/original/target');
  });

  it('runVerification receives overrideDirs: [] (the isolated surface)', () => {
    const { seam } = makeFakeSeam('/original/target');
    const env = new TestableEnv(makeConfig({ isolateOverrides: true }), seam, VERSION);
    env.adopt(VERSION);
    expect(env.verifyCallArgs).toHaveLength(1);
    expect(env.verifyCallArgs[0]!.overrideDirs).toEqual([]);
  });

  it('returned signals carry isolationExplicit: true', () => {
    const { seam } = makeFakeSeam('/original/target');
    const env = new TestableEnv(makeConfig({ isolateOverrides: true }), seam, VERSION);
    const signals = env.adopt(VERSION);
    expect(signals.isolationExplicit).toBe(true);
  });

  it('returned signals carry auditNotRunReason: "not-run"', () => {
    const { seam } = makeFakeSeam('/original/target');
    const env = new TestableEnv(makeConfig({ isolateOverrides: true }), seam, VERSION);
    const signals = env.adopt(VERSION);
    expect(signals.auditNotRunReason).toBe('not-run');
  });

  it('isolation path: setup calls two symlinkSync calls (one setup, one teardown)', () => {
    // withIsolation calls symlinkSync twice: once to repoint at throwaway, once to restore.
    const { seam, calls } = makeFakeSeam('/original/target');
    const env = new TestableEnv(makeConfig({ isolateOverrides: true }), seam, VERSION);
    env.adopt(VERSION);
    expect(calls.symlinkTargets).toHaveLength(2);
    // First: throwaway dir (not the original target)
    expect(calls.symlinkTargets[0]).not.toBe('/original/target');
    // Second: restored to original
    expect(calls.symlinkTargets[1]).toBe('/original/target');
  });
});

// ── Flag SET + body throws: restore must still happen ────────────────────────

describe('adopt() with isolateOverrides: true — restore on throw', () => {
  it('teardown runs even when runVerification throws: rmSync is called', () => {
    const { seam, calls } = makeFakeSeam('/original/target');
    const env = new TestableEnv(makeConfig({ isolateOverrides: true }), seam, VERSION, 'throw');
    expect(() => env.adopt(VERSION)).toThrow('verification body failure');
    // Teardown must have run despite the throw
    expect(calls.rmSyncCalled).toBe(true);
  });

  it('teardown restores the symlink even when runVerification throws', () => {
    const { seam, calls } = makeFakeSeam('/original/target');
    const env = new TestableEnv(makeConfig({ isolateOverrides: true }), seam, VERSION, 'throw');
    expect(() => env.adopt(VERSION)).toThrow('verification body failure');
    // Symlink must be restored to the original target, not left at the throwaway
    const lastTarget = calls.symlinkTargets.at(-1);
    expect(lastTarget).toBe('/original/target');
  });
});

// ── Flag UNSET: unchanged path ────────────────────────────────────────────────

describe('adopt() with isolateOverrides unset — no isolation (flag UNSET)', () => {
  it('no seam setup calls when isolateOverrides is not set', () => {
    const { seam, calls } = makeFakeSeam('/original/target');
    const env = new TestableEnv(makeConfig(), seam, VERSION);
    env.adopt(VERSION);
    expect(calls.readlinkCalled).toBe(false);
    expect(calls.mkdtempCalled).toBe(false);
    expect(calls.rmSyncCalled).toBe(false);
    expect(calls.symlinkTargets).toHaveLength(0);
  });

  it('runVerification receives the explicit promptDirs, not []', () => {
    const { seam } = makeFakeSeam('/original/target');
    const promptDirs = ['/fake/prompts/opus', '/fake/prompts/sonnet'];
    const env = new TestableEnv(makeConfig({ promptDirs }), seam, VERSION);
    env.adopt(VERSION);
    expect(env.verifyCallArgs).toHaveLength(1);
    expect(env.verifyCallArgs[0]!.overrideDirs).toEqual(promptDirs);
  });

  it('returned signals carry no isolationExplicit flag', () => {
    const { seam } = makeFakeSeam('/original/target');
    const env = new TestableEnv(makeConfig(), seam, VERSION);
    const signals = env.adopt(VERSION);
    // The non-isolation path does not set isolationExplicit
    expect(signals.isolationExplicit).toBeUndefined();
  });

  it('returned signals carry no auditNotRunReason from the isolation wrapper', () => {
    // The non-isolation path does not forcibly set auditNotRunReason: 'not-run'.
    // (The verification layer may set it separately — but the isolation wrapper does not.)
    const { seam } = makeFakeSeam('/original/target');
    const env = new TestableEnv(makeConfig(), seam, VERSION);
    const signals = env.adopt(VERSION);
    // CLEAN_SIGNALS has no auditNotRunReason, so the result should not have it either
    expect(signals.auditNotRunReason).toBeUndefined();
  });
});
