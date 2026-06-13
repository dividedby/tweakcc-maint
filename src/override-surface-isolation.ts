/**
 * Override-surface composition — the ISOLATE_OVERRIDES module (#263).
 *
 * Assembles the Three override surfaces for a gate run in isolated mode: points both
 * the runtime `~/.tweakcc/system-prompts` symlink AND the gate's override-scan dirs at
 * throwaway/empty locations so the run produces a clean patcher+prompts Four-zeros
 * record when lobotomized-claude-code overrides are stale (the #26 class).
 *
 * The load-bearing invariant (ADR 0005 addendum; design doc):
 *   - Teardown ALWAYS restores the original state — on success and on throw — for all
 *     three possible states of `~/.tweakcc/system-prompts`:
 *       1. Symlink → save target, repoint; teardown restores the symlink.
 *       2. Real directory → rename aside; teardown renames back.
 *       3. Absent → create empty dir; teardown removes it.
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

import {
  lstatSync,
  readlinkSync,
  symlinkSync,
  mkdtempSync,
  mkdirSync,
  renameSync,
  rmSync,
  unlinkSync,
  existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * The `node:fs` / `node:os` subset used for symlink manipulation and throwaway dir
 * management — injected so the module is testable with a fake seam.
 *
 * The `unlinkSync`, `rename`, and `mkdir` fields are optional: only needed when setup
 * may encounter a non-symlink or absent path. The production seam always provides all
 * fields.
 */
export interface IsolationFsSeam {
  /**
   * Stat the path without following symlinks. Throws ENOENT when absent.
   * Returns an object with `isSymbolicLink()`.
   */
  lstat: (path: string) => { isSymbolicLink: () => boolean };
  /** Read the current target of the `~/.tweakcc/system-prompts` symlink. */
  readlink: (path: string) => string;
  /** Point the symlink at a new target (replacing the old one if present). */
  symlinkSync: (target: string, path: string) => void;
  /**
   * Remove the symlink (used when restoring a real-dir or absent state).
   * Optional: only needed when setup may find a non-symlink path.
   */
  unlinkSync?: (path: string) => void;
  /**
   * Rename (move) a path — used to move a real dir aside and back.
   * Optional: only needed when setup finds a real directory.
   */
  rename?: (oldPath: string, newPath: string) => void;
  /**
   * Create a directory at the given path (used for the empty isolated surface).
   * Optional: only needed when setup finds a real directory or absent path.
   */
  mkdir?: (path: string) => void;
  /** Create a temporary directory for the isolated surface. */
  mkdtempSync: (prefix: string) => string;
  /** Remove the throwaway dir on teardown. */
  rmSync: (dir: string, options: { recursive: boolean; force: boolean }) => void;
}

// ── Discriminated setup result ────────────────────────────────────────────────

/**
 * Setup recorded a symlink — original target saved for restore.
 * Teardown: repoint symlink to savedTarget; rmSync throwawayDir.
 */
export interface IsolationSetupSymlink {
  kind: 'symlink';
  overrideDirs: string[];
  /** The original symlink target, for restore. */
  savedTarget: string;
  /** The throwaway empty dir the symlink now points at. */
  throwawayDir: string;
}

/**
 * Setup found a real directory — moved it aside to savedPath.
 * Teardown: rmSync throwawayDir (the empty isolated surface at the link path);
 *           rename savedPath back to link path.
 */
export interface IsolationSetupDirectory {
  kind: 'directory';
  overrideDirs: string[];
  /** The path where the original real dir was renamed to (under tmpdir). */
  savedPath: string;
  /** The throwaway empty dir placed at the link path as the isolated surface. */
  throwawayDir: string;
}

/**
 * Setup found the path absent — created an empty dir as the isolated surface.
 * Teardown: rmSync the created dir; path goes back to absent.
 */
export interface IsolationSetupAbsent {
  kind: 'absent';
  overrideDirs: string[];
  /** The path of the empty dir created as the isolated surface (same as link path). */
  throwawayDir: string;
}

/** Discriminated union — teardown reverses exactly the recorded case. */
export type IsolationSetupResult =
  | IsolationSetupSymlink
  | IsolationSetupDirectory
  | IsolationSetupAbsent;

// ── Helpers ───────────────────────────────────────────────────────────────────

/** The `system-prompts` path inside the tweakcc config dir. */
function symlinkPath(tweakccConfigDir: string): string {
  return join(tweakccConfigDir, 'system-prompts');
}

/**
 * Detect which of the three states `link` is in.
 * Returns 'symlink' | 'directory' | 'absent'.
 */
function detectState(link: string, fs: IsolationFsSeam): 'symlink' | 'directory' | 'absent' {
  try {
    const stat = fs.lstat(link);
    return stat.isSymbolicLink() ? 'symlink' : 'directory';
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return 'absent';
    throw err;
  }
}

// ── Core API ──────────────────────────────────────────────────────────────────

/**
 * Set up isolation: detect the current state of `<tweakccConfigDir>/system-prompts`,
 * preserve it, and put an empty isolated surface at that path.
 *
 * Returns a discriminated {@link IsolationSetupResult} — pass to {@link teardownIsolation}
 * to reverse exactly what was done.
 *
 * Must be paired with {@link teardownIsolation} (or use {@link withIsolation}).
 */
export function setupIsolation(tweakccConfigDir: string, fs: IsolationFsSeam): IsolationSetupResult {
  const link = symlinkPath(tweakccConfigDir);
  const state = detectState(link, fs);

  if (state === 'symlink') {
    const savedTarget = fs.readlink(link);
    const throwawayDir = fs.mkdtempSync(join(tmpdir(), 'isolated-overrides-'));
    // Repoint the symlink at the throwaway dir.
    fs.symlinkSync(throwawayDir, link);
    return { kind: 'symlink', overrideDirs: [], savedTarget, throwawayDir };
  }

  if (state === 'directory') {
    // Move the real dir aside so we can place an empty isolated surface at its path.
    if (!fs.rename || !fs.mkdir) {
      throw new Error(
        'IsolationFsSeam must provide rename and mkdir to handle a real-directory system-prompts path',
      );
    }
    const savedPath = fs.mkdtempSync(join(tmpdir(), 'isolated-overrides-saved-'));
    fs.rename(link, savedPath);
    // Create the empty isolated surface at the original path.
    fs.mkdir(link);
    return { kind: 'directory', overrideDirs: [], savedPath, throwawayDir: link };
  }

  // state === 'absent'
  // Create an empty dir at the path as the isolated surface.
  if (!fs.mkdir) {
    throw new Error(
      'IsolationFsSeam must provide mkdir to handle an absent system-prompts path',
    );
  }
  fs.mkdir(link);
  return { kind: 'absent', overrideDirs: [], throwawayDir: link };
}

/**
 * Reverse exactly the setup that {@link setupIsolation} recorded.
 * Always call this after {@link setupIsolation}, even on error (use {@link withIsolation}).
 */
export function teardownIsolation(
  tweakccConfigDir: string,
  setup: IsolationSetupResult,
  fs: IsolationFsSeam,
): void {
  const link = symlinkPath(tweakccConfigDir);

  if (setup.kind === 'symlink') {
    // Restore the original symlink, then remove the throwaway dir.
    fs.symlinkSync(setup.savedTarget, link);
    fs.rmSync(setup.throwawayDir, { recursive: true, force: true });
    return;
  }

  if (setup.kind === 'directory') {
    // Remove the empty isolated surface placed at the link path.
    fs.rmSync(setup.throwawayDir, { recursive: true, force: true });
    // Rename the saved real dir back to the original path.
    if (!fs.rename) {
      throw new Error(
        'IsolationFsSeam must provide rename to teardown a real-directory system-prompts path',
      );
    }
    fs.rename(setup.savedPath, link);
    return;
  }

  // kind === 'absent': remove the empty dir we created; path returns to absent.
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
  lstat: (path) => lstatSync(path),
  readlink: (path) => readlinkSync(path, 'utf8'),
  symlinkSync: (target, path) => {
    // Remove the existing symlink if present, then create the new one.
    if (existsSync(path)) unlinkSync(path);
    symlinkSync(target, path);
  },
  unlinkSync: (path) => unlinkSync(path),
  rename: (oldPath, newPath) => renameSync(oldPath, newPath),
  mkdir: (path) => mkdirSync(path, { recursive: true }),
  mkdtempSync: (prefix) => mkdtempSync(prefix),
  rmSync: (dir, options) => rmSync(dir, options),
};
