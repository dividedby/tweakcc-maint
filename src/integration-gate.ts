/**
 * IntegrationGate — verify a Release adoption and emit an Adoption record
 * (CONTEXT.md → "Integration gate", "Adoption record"; design doc → Module Map).
 *
 * Walking skeleton (#3): a Support matrix OF ONE version. It pulls the version's
 * captured signals from the AdoptionEnvironment seam, runs them through the REAL
 * FourZerosVerdict (pure), and emits a structured, machine-readable Adoption
 * record. A CLI (transport, not a domain module) maps the record to a process
 * exit code via {@link recordToExitCode}.
 *
 * Out of scope here: Support-matrix iteration (#4) and Restore-drill bracketing
 * (#5). The Behavioral A/B field is absent until slice 5.
 */

import { evaluate } from './four-zeros-verdict.js';
import type { FourZerosResult } from './four-zeros-verdict.js';
import type { AdoptionEnvironment } from './adoption-environment.js';

/**
 * The structured artifact the gate emits per run (CONTEXT.md → "Adoption record").
 * Machine-readable so slice-6 reporting can aggregate it. The Restore-drill and
 * Behavioral A/B fields are deferred (#5 / slice 5) and intentionally absent.
 */
export interface AdoptionRecord {
  /** The Claude Code version this run adopted. */
  ccVersion: string;
  /** The per-check Four-zeros result from the real FourZerosVerdict. */
  fourZeros: FourZerosResult;
  /** ISO-8601 timestamp of the run. */
  date: string;
}

/**
 * Run the gate for a single-version Support matrix and emit its Adoption record.
 * @throws if the matrix is not exactly one version (the skeleton is single-version;
 *   matrix iteration is #4).
 */
export function runGate(matrix: readonly string[], env: AdoptionEnvironment): AdoptionRecord {
  if (matrix.length !== 1) {
    throw new Error(
      `IntegrationGate.runGate: walking skeleton supports a matrix of exactly one version, got ${matrix.length}`,
    );
  }
  const ccVersion = matrix[0]!;
  const signals = env.adopt(ccVersion);
  const fourZeros = evaluate(signals);

  return {
    ccVersion,
    fourZeros,
    date: new Date().toISOString(),
  };
}

/** Map an Adoption record to a process exit code: 0 iff the Four-zeros bar passed. */
export function recordToExitCode(record: AdoptionRecord): number {
  return record.fourZeros.pass ? 0 : 1;
}
