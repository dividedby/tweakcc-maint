/**
 * FakeAdoptionEnvironment — the test double for the AdoptionEnvironment seam
 * (design doc → Seams; fake contract: must drive failed-patch, missing-prompt,
 * orphan-var, boot-crash, dirty-restore, and missing-backup per version).
 *
 * It holds canned {@link CapturedSignals} per CC version and returns them from
 * `adopt`. The raw strings are still interpreted by the REAL FourZerosVerdict, so
 * the fake drives a breach by emitting output that matches that tool's signatures.
 *
 * The Restore-drill capabilities (backupExists / restore / isCleanStock) are
 * controllable per version via the constructor's `perVersion` overrides; by default
 * every configured version has a backup, restores OK, and is clean stock — so the
 * drill is invisible to tests that don't care about it. It does NOT model HOW backup
 * or restore is performed (filesystem mechanics are #7); it only sets the seam's
 * observable outcomes.
 */

import type { AdoptionEnvironment, RestoreOutcome } from './adoption-environment.js';
import type { CapturedSignals } from './four-zeros-verdict.js';

/** Per-version overrides for the Restore-drill seam outcomes. */
export interface RestoreDrillOverride {
  /** Whether a backup exists (default true). */
  backupExists?: boolean;
  /** Outcome of `--restore` (default 'ok'). */
  restoreOutcome?: RestoreOutcome;
  /** Whether the install verifies clean stock after restore (default true). */
  cleanStock?: boolean;
}

/** Optional knobs for the fake beyond the canned signals. */
export interface FakeAdoptionEnvironmentOptions {
  /**
   * The Support matrix this environment reports from {@link FakeAdoptionEnvironment.listMatrix}.
   * Defaults to the configured signals' versions (`Object.keys(signals)`), so the common case
   * needs no extra config; set it explicitly to drive an empty or order-specific matrix.
   */
  matrix?: string[];
  /** Per-version Restore-drill outcome overrides, keyed by CC version. */
  perVersion?: Record<string, RestoreDrillOverride>;
  /** Spy hook invoked with each seam method name as it is called, in order. */
  onCall?: (method: 'backupExists' | 'adopt' | 'restore' | 'isCleanStock') => void;
}

/** The four Four-zeros breach kinds the fake contract must be able to drive. */
export type BreachKind = 'failedPatch' | 'missingPrompt' | 'orphanVar' | 'bootCrash';

const CLEAN: CapturedSignals = {
  apply: 'patch: spinnerWords: applied\npatch: thinkingVerb: applied\nAll patches applied.',
  bootVerify: 'Boot-verify OK: patched binary responded to prompt.',
  validator: 'Orphan-variable check: 0 orphans across 42 overrides.',
};

/** Mutate a clean signal set to carry exactly one Four-zeros breach. */
function withBreach(kind: BreachKind): CapturedSignals {
  switch (kind) {
    case 'failedPatch':
      return { ...CLEAN, apply: 'patch: thinkingVerb: failed to find anchor string' };
    case 'missingPrompt':
      return { ...CLEAN, apply: "Could not find system prompt 'main-loop'" };
    case 'orphanVar':
      return { ...CLEAN, validator: 'ReferenceError: TODAYS_DATE is not defined' };
    case 'bootCrash':
      return { ...CLEAN, bootVerify: 'SyntaxError: Unexpected token — claude failed to start' };
  }
}

export class FakeAdoptionEnvironment implements AdoptionEnvironment {
  private readonly signals: Readonly<Record<string, CapturedSignals>>;
  private readonly matrix: readonly string[];
  private readonly perVersion: Readonly<Record<string, RestoreDrillOverride>>;
  private readonly onCall: FakeAdoptionEnvironmentOptions['onCall'];

  constructor(
    signals: Record<string, CapturedSignals>,
    options: FakeAdoptionEnvironmentOptions = {},
  ) {
    this.signals = signals;
    this.matrix = options.matrix ?? Object.keys(signals);
    this.perVersion = options.perVersion ?? {};
    this.onCall = options.onCall;
  }

  /** The configured Support matrix (no real discovery — that is RealAdoptionEnvironment, #22). */
  listMatrix(): string[] {
    return [...this.matrix];
  }

  private override(ccVersion: string): RestoreDrillOverride {
    return this.perVersion[ccVersion] ?? {};
  }

  backupExists(ccVersion: string): boolean {
    this.onCall?.('backupExists');
    return this.override(ccVersion).backupExists ?? true;
  }

  restore(ccVersion: string): RestoreOutcome {
    this.onCall?.('restore');
    return this.override(ccVersion).restoreOutcome ?? 'ok';
  }

  isCleanStock(ccVersion: string): boolean {
    this.onCall?.('isCleanStock');
    return this.override(ccVersion).cleanStock ?? true;
  }

  /** Convenience: an env whose single version yields exactly one breach kind. */
  static breach(ccVersion: string, kind: BreachKind): FakeAdoptionEnvironment {
    return new FakeAdoptionEnvironment({ [ccVersion]: withBreach(kind) });
  }

  /**
   * Canned {@link CapturedSignals} carrying exactly one breach kind — for composing
   * per-version outcomes in a multi-version matrix, e.g.
   * `{ '1.2.3': cleanSignals, '1.2.4': FakeAdoptionEnvironment.breachSignals('bootCrash') }`.
   */
  static breachSignals(kind: BreachKind): CapturedSignals {
    return withBreach(kind);
  }

  adopt(ccVersion: string): CapturedSignals {
    this.onCall?.('adopt');
    const signals = this.signals[ccVersion];
    if (signals === undefined) {
      throw new Error(`FakeAdoptionEnvironment: no signals configured for version '${ccVersion}'`);
    }
    return signals;
  }
}
