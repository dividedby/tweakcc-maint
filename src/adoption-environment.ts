/**
 * AdoptionEnvironment — the seam between IntegrationGate's environment-agnostic
 * logic and the real world (CONTEXT.md → "Integration gate"; design doc → Seams).
 *
 * It produces, for one Support-matrix version, the raw captured output of the
 * three tools that feed a Four-zeros verdict: `tweakcc-fixed --apply`, the
 * Boot-verify run, and the Orphan-variable validator. It does NOT interpret that
 * output (that is FourZerosVerdict) nor decide pass/fail (that is IntegrationGate).
 *
 * Tests drive it via FakeAdoptionEnvironment; prod will shell out via
 * RealAdoptionEnvironment (#7, HITL). The same `runGate` runs identically against
 * either (ADR 0003).
 *
 * Backup/restore (Restore drill) is part of this seam in the design, but the
 * walking skeleton (#3) only exercises apply → boot-verify → orphan-detect.
 * Restore-drill bracketing lands in #5.
 */

import type { CapturedSignals } from './four-zeros-verdict.js';

export interface AdoptionEnvironment {
  /**
   * Apply the overrides to the given CC version, boot-verify the patched binary,
   * and run the Orphan-variable validator — returning the raw captured output of
   * each as a {@link CapturedSignals} for FourZerosVerdict to interpret.
   */
  adopt(ccVersion: string): CapturedSignals;
}
