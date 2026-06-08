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
 * Backup/restore (Restore drill) is part of this seam: #5 adds the capabilities the
 * drill needs — backupExists / restore / isCleanStock — so `runGate` can bracket the
 * apply with confirm-backup before and restore → verify-clean after. How they are
 * actually performed (filesystem mechanics) is the RealAdoptionEnvironment's job (#7),
 * not this seam's contract.
 */

import type { CapturedSignals } from './four-zeros-verdict.js';

/**
 * Outcome of running `--restore` for one version: whether the restore COMMAND itself
 * succeeded. Distinct from whether the install is clean stock afterwards (that is
 * {@link AdoptionEnvironment.isCleanStock}) — a restore can succeed yet leave the
 * install dirty, or fail outright.
 */
export type RestoreOutcome = 'ok' | 'failed';

export interface AdoptionEnvironment {
  /**
   * Whether a confirmed backup exists for this version's install — the escape hatch
   * the Restore drill proves. The gate checks this BEFORE apply: with no backup, a
   * bad adoption could brick the install with no way back, so the run fails pre-apply.
   */
  backupExists(ccVersion: string): boolean;

  /**
   * Apply the overrides to the given CC version, boot-verify the patched binary,
   * and run the Orphan-variable validator — returning the raw captured output of
   * each as a {@link CapturedSignals} for FourZerosVerdict to interpret.
   */
  adopt(ccVersion: string): CapturedSignals;

  /**
   * Run `--restore` to undo the adoption for this version, returning whether the
   * restore COMMAND succeeded. A failed restore is distinct from a restore that
   * succeeds but leaves the install non-clean (see {@link isCleanStock}).
   */
  restore(ccVersion: string): RestoreOutcome;

  /**
   * Whether the install for this version is back to clean stock — verified AFTER a
   * successful restore. A non-clean install (dirty restore) fails the run even when
   * Four-zeros passed.
   */
  isCleanStock(ccVersion: string): boolean;
}
