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
 * Out of scope here: Restore-drill bracketing (#5). The Behavioral A/B field is
 * absent until slice 5.
 */

import { evaluate } from './four-zeros-verdict.js';
import type { FourZerosResult } from './four-zeros-verdict.js';
import type { AdoptionEnvironment } from './adoption-environment.js';

/** One Support-matrix version's Four-zeros outcome within a run. */
export interface VersionResult {
  /** The Claude Code version this entry adopted. */
  ccVersion: string;
  /** The per-check Four-zeros result from the real FourZerosVerdict. */
  fourZeros: FourZerosResult;
}

/**
 * The structured artifact the gate emits per run (CONTEXT.md → "Adoption record").
 * It covers the whole Support matrix: a per-version Four-zeros result plus a
 * run-level pass that is true iff EVERY version passed. Machine-readable so slice-6
 * reporting can aggregate it. The Restore-drill and Behavioral A/B fields are
 * deferred (#5 / slice 5) and intentionally absent.
 */
export interface AdoptionRecord {
  /** True iff every Support-matrix version passed its Four-zeros bar. */
  pass: boolean;
  /** Per-version results, in matrix order. */
  versions: VersionResult[];
  /** ISO-8601 timestamp of the run. */
  date: string;
}

/**
 * Run the gate across the whole Support matrix and emit its Adoption record. Every
 * version is adopted and evaluated; the run passes iff EVERY version passes (any
 * breach fails the whole run — CONTEXT.md → "Support matrix").
 * @throws if the matrix is empty (an empty matrix errors rather than reporting a
 *   vacuous pass).
 */
export function runGate(matrix: readonly string[], env: AdoptionEnvironment): AdoptionRecord {
  if (matrix.length === 0) {
    throw new Error(
      'IntegrationGate.runGate: empty Support matrix — refusing to report a vacuous pass',
    );
  }

  const versions: VersionResult[] = matrix.map((ccVersion) => ({
    ccVersion,
    fourZeros: evaluate(env.adopt(ccVersion)),
  }));

  return {
    pass: versions.every((v) => v.fourZeros.pass),
    versions,
    date: new Date().toISOString(),
  };
}

/** Map an Adoption record to a process exit code: 0 iff every version passed. */
export function recordToExitCode(record: AdoptionRecord): number {
  return record.pass ? 0 : 1;
}
