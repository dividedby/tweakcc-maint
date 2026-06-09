/**
 * IntegrationGate — verify a Release adoption across the Support matrix and emit
 * an Adoption record (CONTEXT.md → "Integration gate", "Support matrix",
 * "Adoption record"; design doc → Module Map).
 *
 * It iterates every version in the Support matrix: for each, it pulls the version's
 * captured signals from the AdoptionEnvironment seam, runs them through the REAL
 * FourZerosVerdict (pure), and records a per-version Four-zeros result. A Release
 * adoption passes iff EVERY matrix version passes; any breach fails the whole run
 * (CONTEXT.md → "Support matrix"). A CLI (transport, not a domain module) maps the
 * record to a process exit code via {@link recordToExitCode}.
 *
 * Each version's flow is bracketed by the Restore drill (CONTEXT.md → "Restore drill"):
 * backup-exists → apply → Four-zeros → restore → verify-clean. The Behavioral A/B
 * field is absent until slice 5.
 */

import { evaluate } from './four-zeros-verdict.js';
import type { FourZerosResult } from './four-zeros-verdict.js';
import type { AdoptionEnvironment } from './adoption-environment.js';

/**
 * Why a version's Restore drill landed where it did. Exactly one terminal status per
 * version, distinguishing the three non-pass failure modes the gate must tell apart:
 * - `pass` — backup existed, restore succeeded, install verified clean stock.
 * - `missing-backup` — no backup; the gate bailed BEFORE apply (no Four-zeros run).
 * - `restore-failed` — the `--restore` command itself failed.
 * - `dirty-restore` — restore succeeded but the install did NOT return to clean stock.
 */
export type RestoreDrillStatus = 'pass' | 'missing-backup' | 'restore-failed' | 'dirty-restore';

/** One Support-matrix version's Restore-drill outcome (CONTEXT.md → "Restore drill"). */
export interface RestoreDrillResult {
  /** True iff backup existed, restore succeeded, and the install verified clean stock. */
  pass: boolean;
  /** The terminal status — names which phase decided the outcome. */
  status: RestoreDrillStatus;
  /** Whether a confirmed backup existed before apply. */
  backupExists: boolean;
  /** Whether the `--restore` command succeeded (false if backup missing or restore failed). */
  restored: boolean;
  /** Whether the install verified clean stock after restore (false unless restore ran and was clean). */
  cleanStock: boolean;
}

/** One Support-matrix version's outcome within a run. */
export interface VersionResult {
  /** The Claude Code version this entry adopted. */
  ccVersion: string;
  /**
   * The per-check Four-zeros result from the real FourZerosVerdict. Absent when the
   * Restore drill bailed before apply (missing backup) — there is no verdict to report.
   */
  fourZeros?: FourZerosResult;
  /** The Restore-drill outcome bracketing this version's apply. */
  restoreDrill: RestoreDrillResult;
}

/**
 * The structured artifact the gate emits per run (CONTEXT.md → "Adoption record").
 * It covers the whole Support matrix: a per-version Four-zeros result and Restore-drill
 * result, plus a run-level pass that is true iff EVERY version passed BOTH bars.
 * Machine-readable so slice-6 reporting can aggregate it. The Behavioral A/B field is
 * deferred (slice 5) and intentionally absent.
 */
export interface AdoptionRecord {
  /** True iff every Support-matrix version passed both its Four-zeros bar and Restore drill. */
  pass: boolean;
  /** Per-version results, in matrix order. */
  versions: VersionResult[];
  /** ISO-8601 timestamp of the run. */
  date: string;
}

/**
 * Run the per-version flow for one Support-matrix version, bracketing the apply with
 * the Restore drill: backup-exists → apply → Four-zeros → restore → verify-clean.
 *
 * The drill short-circuits: a missing backup bails BEFORE apply (no Four-zeros), and a
 * failed `--restore` skips verify-clean. The three failure modes (missing-backup,
 * restore-failed, dirty-restore) are recorded distinctly.
 */
function runVersion(ccVersion: string, env: AdoptionEnvironment): VersionResult {
  if (!env.backupExists(ccVersion)) {
    // No proven way back — fail before touching the install.
    return {
      ccVersion,
      restoreDrill: {
        pass: false,
        status: 'missing-backup',
        backupExists: false,
        restored: false,
        cleanStock: false,
      },
    };
  }

  const fourZeros = evaluate(env.adopt(ccVersion));

  if (env.restore(ccVersion) === 'failed') {
    return {
      ccVersion,
      fourZeros,
      restoreDrill: {
        pass: false,
        status: 'restore-failed',
        backupExists: true,
        restored: false,
        cleanStock: false,
      },
    };
  }

  const cleanStock = env.isCleanStock(ccVersion);
  return {
    ccVersion,
    fourZeros,
    restoreDrill: {
      pass: cleanStock,
      status: cleanStock ? 'pass' : 'dirty-restore',
      backupExists: true,
      restored: true,
      cleanStock,
    },
  };
}

/**
 * True iff this version cleared BOTH the Four-zeros bar and the Restore drill.
 * The gate is the sole author of this pass condition — consumers (e.g. the
 * Adoption-history aggregator) import it rather than redefining it.
 */
export function versionPassed(v: VersionResult): boolean {
  return v.restoreDrill.pass && v.fourZeros?.pass === true;
}

/**
 * Run the gate across the whole Support matrix and emit its Adoption record. Each
 * version runs the Restore-drill-bracketed flow (backup-exists → apply → Four-zeros →
 * restore → verify-clean); the run passes iff EVERY version clears both the Four-zeros
 * bar and the Restore drill (any breach fails the whole run — CONTEXT.md → "Support
 * matrix").
 * @throws if the matrix is empty (an empty matrix errors rather than reporting a
 *   vacuous pass).
 */
export function runGate(matrix: readonly string[], env: AdoptionEnvironment): AdoptionRecord {
  if (matrix.length === 0) {
    throw new Error(
      'IntegrationGate.runGate: empty Support matrix — refusing to report a vacuous pass',
    );
  }

  const versions: VersionResult[] = matrix.map((ccVersion) => runVersion(ccVersion, env));

  return {
    pass: versions.every(versionPassed),
    versions,
    date: new Date().toISOString(),
  };
}

/** Map an Adoption record to a process exit code: 0 iff every version passed. */
export function recordToExitCode(record: AdoptionRecord): number {
  return record.pass ? 0 : 1;
}
