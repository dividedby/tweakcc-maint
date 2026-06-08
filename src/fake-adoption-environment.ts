/**
 * FakeAdoptionEnvironment — the test double for the AdoptionEnvironment seam
 * (design doc → Seams; fake contract: must drive failed-patch, missing-prompt,
 * orphan-var, and boot-crash per version).
 *
 * It holds canned {@link CapturedSignals} per CC version and returns them from
 * `adopt`. The raw strings are still interpreted by the REAL FourZerosVerdict, so
 * the fake drives a breach by emitting output that matches that tool's signatures.
 */

import type { AdoptionEnvironment } from './adoption-environment.js';
import type { CapturedSignals } from './four-zeros-verdict.js';

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

  constructor(signals: Record<string, CapturedSignals>) {
    this.signals = signals;
  }

  /** Convenience: an env whose single version yields exactly one breach kind. */
  static breach(ccVersion: string, kind: BreachKind): FakeAdoptionEnvironment {
    return new FakeAdoptionEnvironment({ [ccVersion]: withBreach(kind) });
  }

  adopt(ccVersion: string): CapturedSignals {
    const signals = this.signals[ccVersion];
    if (signals === undefined) {
      throw new Error(`FakeAdoptionEnvironment: no signals configured for version '${ccVersion}'`);
    }
    return signals;
  }
}
