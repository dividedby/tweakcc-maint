/**
 * DriverVerification — the driver-backed signal source behind the CapturedSignals seam
 * (#80; design doc → "Four-zeros verdict authority"). skrabe's published
 * `skills/showtime/driver.mjs` (tweakcc-fixed, c5fabdf) is the CANONICAL verification
 * path: `check` runs the idempotent re-apply + parses its own apply log (zeros #1/#2),
 * `report` runs/parses his versionBumpReport (zero #3 + the UNKNOWN_N placeholder count),
 * and `tools/auditMisbinds.mjs` is his fourth zero. Sourcing the verdict from the driver
 * kills the #58 drift class: we stop maintaining a private reconstruction of his output
 * format and key on the driver's own exit codes instead.
 *
 * The mapping below is a NORMALIZATION layer in the leaf-shell tradition
 * (`normalizeBootVerify`): it translates driver exit/stdout into the marker vocabulary the
 * unchanged pure verdict keys on. On a clean run the driver's output passes through raw
 * for the audit trail; on failure a synthetic marker line in the verdict's vocabulary is
 * prepended, so pass/fail authority stays with the driver's exit code — never with a
 * re-parse of his prose.
 *
 * Boot-verify deliberately stays the control plane's own `claude -p` run (ADR 0005:
 * runtime orphans are Boot-verify's job): the driver's smoke step is inconclusive-tolerant
 * (mise/shell-function installs yield no output from node and it still passes), and the
 * gate's boot-verify carries the cost-ledger stream-json wiring CI depends on.
 *
 * When the driver is absent (an older leaf checkout), the caller falls back to the
 * hand-rolled path — exactly the #31 consumer-fallback shape ({@link driverPresent}).
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';

import type { CapturedSignals } from './four-zeros-verdict.js';
import type { ShellResult } from './leaf-shell.js';
import { runSync, combinedOutput } from './leaf-shell.js';
import { runOrphanReport } from './orphan-report-producer.js';

/** Where skrabe publishes the driver inside a tweakcc-fixed checkout. */
// Module-private: the Driver seam other modules consume is the shell-out
// (driverPresent/runDriverVerification), not this path helper (#125).
function driverPath(tweakccFixedDir: string): string {
  return join(tweakccFixedDir, 'skills', 'showtime', 'driver.mjs');
}

/**
 * The driver-absent fallback selector: present → the driver is the signal source;
 * absent (older leaf checkout) → the hand-rolled path, mirroring the #31 fallback.
 */
export function driverPresent(tweakccFixedDir: string): boolean {
  return existsSync(driverPath(tweakccFixedDir));
}

// `UNKNOWN placeholders: N` — the driver report's surviving-placeholder count (skrabe's
// vocabulary). It still gates the apply channel (a `report` failure explained by UNKNOWNs is
// the orphan bar's, carried below; one NOT explained is an apply failure). The orphan SET
// itself now comes from the relocated #43 producer, not this count.
const UNKNOWN_COUNT = /UNKNOWN placeholders:\s*(\d+)/;

/**
 * Map the driver's `check` / `report` results, the leaf's mis-bind audit runs, and the
 * relocated #43 producer's Orphan report onto the driver-sourced slice of
 * {@link CapturedSignals}. Pure over the captured results — unit-tested with a fake driver +
 * a pre-built report. `bootVerify` / `validator` are not produced here (see module doc); the
 * caller composes them in.
 *
 * `orphanReport` (#80 wiring): the surviving-placeholder SET is now the real per-prompt keys
 * the relocated producer (`orphan-report-producer.ts`) emits against skrabe's published
 * prompts JSON — replacing the prior `UNKNOWN_1..N` synthesis from the driver's scalar count.
 * The string is already in the consumer's `{ version, prompts }` contract, so the verdict's
 * orphan authority (#31) consumes it unchanged. Absent (no producer run on this call — older
 * fallback path) leaves the channel undefined and the verdict falls back to Boot-verify.
 */
export function driverSignals(
  check: ShellResult,
  report: ShellResult,
  audits: ShellResult[],
  orphanReport?: string,
  isolationExplicit?: boolean,
): Pick<CapturedSignals, 'apply' | 'orphanReport' | 'auditMisbinds' | 'auditNotRunReason' | 'isolationExplicit'> {
  // Representation invariant (#262): no override dirs to audit → not-run, represented as
  // `undefined` (never `""`). A non-empty audits array → join the per-dir outputs normally.
  const notRun = audits.length === 0;
  return {
    apply: applySignal(check, report),
    orphanReport,
    auditMisbinds: notRun ? undefined : audits.map(combinedOutput).join('\n'),
    auditNotRunReason: notRun ? 'not-run' : undefined,
    isolationExplicit: notRun ? isolationExplicit : undefined,
  };
}

/**
 * The `apply` signal: the driver's exit codes are the authority. A failing `check` (zeros
 * #1/#2) or a failing `report` not explained by its UNKNOWN count (e.g. inline anchor
 * issues — carried by the orphan channel when UNKNOWN > 0) prepends a marker line in the
 * verdict's failed-patch vocabulary; a clean run passes the driver's output through raw.
 */
function applySignal(check: ShellResult, report: ShellResult): string {
  const lines: string[] = [];
  if (check.status !== 0) {
    lines.push(`patch: driver-check: failed to pass the driver health check (exit ${check.status})`);
  }
  if (report.status !== 0 && unknownCount(report) === 0) {
    lines.push(`patch: driver-report: failed to pass the version-bump report (exit ${report.status})`);
  }
  lines.push(combinedOutput(check));
  return lines.join('\n');
}

function unknownCount(report: ShellResult): number {
  const m = UNKNOWN_COUNT.exec(combinedOutput(report));
  return m === null ? 0 : Number(m[1]);
}

/**
 * Shell the canonical driver + audit for one adoption. `TWEAKCC_REPO` pins the driver to
 * the configured checkout (its repo discovery would otherwise walk up from cwd); `report`
 * is given no previous-version argument so the driver's own default (the repo's
 * second-latest prompts JSON) stays authoritative. The audit runs once per override dir
 * with explicit paths (its positional CLI contract), against the caller's already-resolved
 * `prompts-<version>.json` (the fork's repo-local-wins order, ADR 0005) — SKIPPED output
 * (no upstream reference dump on this box) is the leaf's own non-failure and the verdict
 * honors it.
 *
 * The surviving-placeholder SET (zero #3) comes from the relocated #43 producer
 * ({@link runOrphanReport}) over the same `overrideDirs` + already-resolved published
 * `prompts-<version>.json`, in-process (TS, no shell-out — ADR 0004). It supersedes the
 * `UNKNOWN_N`-count synthesis: the verdict now keys on real per-prompt keys.
 */
export function runDriverVerification(
  tweakccFixedDir: string,
  ccVersion: string,
  promptsJson: string,
  overrideDirs: string[],
): Pick<CapturedSignals, 'apply' | 'orphanReport' | 'auditMisbinds' | 'auditNotRunReason'> {
  const driver = driverPath(tweakccFixedDir);
  const env = { ...process.env, TWEAKCC_REPO: tweakccFixedDir };
  const check = runSync('node', [driver, 'check'], env);
  const report = runSync('node', [driver, 'report'], env);
  const audit = join(tweakccFixedDir, 'tools', 'auditMisbinds.mjs');
  // The upstream reference dump path follows the driver's own convention (`/tmp/pieb-<v>.json`,
  // SKILL.md); when no dump exists on this box the audit SKIPs itself, by the leaf's design.
  const upstreamJson = join('/tmp', `pieb-${ccVersion}.json`);
  const audits = overrideDirs.map((dir) =>
    runSync('node', [audit, promptsJson, upstreamJson, dir], env),
  );
  const orphanReport = runOrphanReport(overrideDirs, promptsJson);
  return driverSignals(check, report, audits, orphanReport);
}
