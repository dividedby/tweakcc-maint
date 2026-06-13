/**
 * Override-surface composition — the ISOLATE_OVERRIDES module (#263).
 *
 * Assembles the Three override surfaces for a gate run in isolated mode: points both
 * the runtime `~/.tweakcc/system-prompts` symlink AND the gate's override-scan dirs at
 * throwaway/empty locations so the run produces a clean patcher+prompts Four-zeros
 * record when lobotomized-claude-code overrides are stale (the #26 class).
 *
 * The load-bearing invariant (ADR 0005 addendum; design doc):
 *   - Teardown ALWAYS restores the original symlink target — on success and on throw
 *     (the prior art: repointing the symlink at a tracked work clone polluted it with
 *     ~60 runtime-written files; isolation uses a throwaway dir to prevent exactly that).
 *   - The throwaway dir is under os.tmpdir(), never inside a tracked clone.
 *
 * The empty override-scan surface (overrideDirs: []) feeds into the gate's driver
 * verification — zero override dirs → no audits → auditNotRunReason: 'not-run' →
 * pass-through (the #262 / ADR 0005 addendum contract). Pass isolationExplicit: true
 * into CapturedSignals to suppress the unexpected-empty-overrides warning.
 *
 * Pure over the injected {@link IsolationFsSeam} so the module is unit-testable without
 * real fs mutations. The production seam wires `node:fs` + `node:os`.
 */

import { readlinkSync, symlinkSync, mkdtempSync, rmSync, unlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * The `node:fs` / `node:os` subset used for symlink manipulation and throwaway dir
 * management — injected so the module is testable with a fake seam.
 */
export interface IsolationFsSeam {
  /** Read the current target of the `~/.tweakcc/system-prompts` symlink. */
  readlink: (path: string) => string;
  /** Point the symlink at a new target (atomically replacing the old one). */
  symlinkSync: (target: string, path: string) => void;
  /** Create a temporary directory for the isolated surface. */
  mkdtempSync: (prefix: string) => string;
  /** Remove the throwaway dir on teardown. */
  rmSync: (dir: string, options: { recursive: boolean; force: boolean }) => void;
}

/** Result of {@link setupIsolation} — consumed by the run body and {@link teardownIsolation}. */
export interface IsolationSetupResult {
  /**
   * The override-scan dirs to hand to the gate: always empty ([]) in isolation mode.
   * Zero dirs → no mis-bind audits → auditNotRunReason: 'not-run' → pass-through (#262).
   */
  overrideDirs: string[];
  /** The original `~/.tweakcc/system-prompts` symlink target, saved for restore. */
  savedSymlinkTarget: string;
  /** The throwaway empty dir the symlink now points at (under os.tmpdir()). */
  throwawayDir: string;
}

/** The symlink path inside the tweakcc config dir that tweakcc-fixed reads named-prompt overrides from. */
function symlinkPath(tweakccConfigDir: string): string {
  return join(tweakccConfigDir, 'system-prompts');
}

/**
 * Set up isolation: save the current `~/.tweakcc/system-prompts` symlink target, create
 * a throwaway empty dir under os.tmpdir(), and repoint the symlink at it. Returns the
 * setup result for the run body and teardown.
 *
 * Must be paired with {@link teardownIsolation} (or use {@link withIsolation}).
 */
export function setupIsolation(tweakccConfigDir: string, fs: IsolationFsSeam): IsolationSetupResult {
  const link = symlinkPath(tweakccConfigDir);
  const savedSymlinkTarget = fs.readlink(link);
  const throwawayDir = fs.mkdtempSync(join(tmpdir(), 'isolated-overrides-'));
  // Remove the existing symlink and create a new one pointing at the throwaway dir.
  // We do this by re-creating the symlink through the seam — the seam's symlinkSync is
  // responsible for replacing the existing link (the production seam uses unlinkSync first).
  fs.symlinkSync(throwawayDir, link);
  return { overrideDirs: [], savedSymlinkTarget, throwawayDir };
}

/**
 * Restore the original `~/.tweakcc/system-prompts` symlink target and remove the throwaway
 * dir. Always call this after {@link setupIsolation}, even on error (use {@link withIsolation}
 * to guarantee this via try/finally).
 */
export function teardownIsolation(
  tweakccConfigDir: string,
  setup: IsolationSetupResult,
  fs: IsolationFsSeam,
): void {
  const link = symlinkPath(tweakccConfigDir);
  // Restore the symlink: point it back at the original target.
  fs.symlinkSync(setup.savedSymlinkTarget, link);
  // Remove the throwaway dir — runtime writes that landed inside it are discarded.
  fs.rmSync(setup.throwawayDir, { recursive: true, force: true });
}

/**
 * Run `body` inside an isolated override surface, guaranteeing teardown runs on both
 * success and error. The body receives the {@link IsolationSetupResult} so it can use
 * the empty `overrideDirs` and `throwawayDir`.
 *
 * The gate MUST pass `isolationExplicit: true` into CapturedSignals to suppress the
 * unexpected-empty-overrides warning (ADR 0005 addendum, #262 AC 5).
 */
export function withIsolation<T>(
  tweakccConfigDir: string,
  fs: IsolationFsSeam,
  body: (setup: IsolationSetupResult) => T,
): T {
  const setup = setupIsolation(tweakccConfigDir, fs);
  try {
    return body(setup);
  } finally {
    teardownIsolation(tweakccConfigDir, setup, fs);
  }
}

/**
 * The production fs seam: wires `node:fs` + `node:os` for real symlink manipulation.
 * The symlinkSync implementation removes the existing link before creating the new one
 * (symlinks cannot be overwritten atomically on all platforms via `symlinkSync` alone).
 */
export const productionIsolationFsSeam: IsolationFsSeam = {
  readlink: (path) => readlinkSync(path, 'utf8'),
  symlinkSync: (target, path) => {
    // Remove the existing symlink if present, then create the new one.
    if (existsSync(path)) unlinkSync(path);
    symlinkSync(target, path);
  },
  mkdtempSync: (prefix) => mkdtempSync(prefix),
  rmSync: (dir, options) => rmSync(dir, options),
};
