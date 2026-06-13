/**
 * RealAdoptionEnvironment — the prod adapter behind the AdoptionEnvironment seam
 * (PRD #20; issue #22). It is the real counterpart whose contract FakeAdoptionEnvironment
 * has been simulating: it shells out (synchronously) to the real leaf tools and packs
 * their output into a {@link CapturedSignals} for the UNCHANGED runGate → FourZerosVerdict
 * to interpret. Pointing the same gate at this instead of the Fake surfaces real runtime
 * breakage the unit tests structurally cannot see (ADR 0003).
 *
 * The `adopt` path + `listMatrix` are #22. The Restore-drill trio (`backupExists` /
 * `restore` / `isCleanStock`) is #23: it brackets the per-version flow against the real
 * filesystem using tweakcc-fixed's own backup/restore — confirm a real backup before apply,
 * run real `--restore`, verify the install is back to clean stock after. A missing backup
 * fails the run before apply; a dirty restore fails it even when Four-zeros passed.
 *
 * Cockpit guardrail (CONTEXT.md → Control plane): this only READS from and RUNS the leaves
 * locally — it never pushes to or mutates them. Credentials (`CLAUDE_CODE_OAUTH_TOKEN` /
 * `ANTHROPIC_API_KEY`) are read from the environment at run time; nothing is committed.
 */

import { homedir } from 'node:os';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { delimiter, join } from 'node:path';

import type { AdoptionEnvironment, RestoreOutcome } from './adoption-environment.js';
import type { CapturedSignals } from './four-zeros-verdict.js';
import { driverPresent, runDriverVerification } from './driver-verification.js';
import { runSync, runBootVerify, combinedOutput, normalizeBootVerify } from './leaf-shell.js';
import { runOrphanValidator, resolveStringsFilePath } from './orphan-validator.js';
import {
  withIsolation,
  productionIsolationFsSeam,
  type IsolationFsSeam,
} from './override-surface-isolation.js';

/**
 * Seam for leaf-dist build operations — injected so the stale-build check is unit-testable
 * without a real filesystem or a real `pnpm build` invocation (#261).
 *
 * The production seam walks the `src/` tree for the newest mtime, reads the `dist/index.mjs`
 * mtime, and shells out to `pnpm build` in the leaf directory. The test seam returns canned
 * timestamps and records build calls.
 */
export interface LeafBuildSeam {
  /** Newest mtime (ms since epoch) of any file under `<tweakccFixedDir>/src/`. */
  newestSrcMtime: (tweakccFixedDir: string) => number;
  /** mtime (ms since epoch) of `<tweakccFixedDir>/dist/index.mjs`. */
  distMtime: (distCli: string) => number;
  /** Run the leaf build tool (e.g. `pnpm build`) in the given directory. Throws on failure. */
  build: (tweakccFixedDir: string) => void;
}

/** Configuration for the real adapter — paths to the leaves and boot-verify knobs. */
export interface RealAdoptionEnvironmentConfig {
  /** Local clone of skrabe/tweakcc-fixed (built: `dist/index.mjs` must exist). */
  tweakccFixedDir: string;
  /** Local clone of skrabe/lobotomized-claude-code (the override source). */
  lobotomizedDir: string;
  /** Trivial boot-verify prompt (explicitly a real `claude -p` run, not `--version`). */
  bootVerifyPrompt?: string;
  /** Cheap model for boot-verify (alias accepted by `claude --model`). */
  bootVerifyModel?: string;
  /** Override dirs scanned by the Orphan-variable check (default: `system-prompts-*`). */
  promptDirs?: string[];
  /** tweakcc-fixed's config/backup dir — holds the backups + `config.json` (default `~/.tweakcc`). */
  tweakccConfigDir?: string;
  /**
   * When `true`, activate the ISOLATE_OVERRIDES capability (#263): repoint the runtime
   * `~/.tweakcc/system-prompts` symlink at a throwaway empty dir for the duration of the
   * run, and scan no override dirs (overrideDirs = []). Produces a clean patcher+prompts
   * Four-zeros record when lobotomized-claude-code overrides are stale (#26 class).
   * The symlink is always restored, even on throw.
   */
  isolateOverrides?: boolean;
}

/**
 * Walk a directory tree and return the newest mtime (ms since epoch) found under it.
 * Returns 0 when the directory is empty or unreadable — 0 is older than any real mtime,
 * so an empty/missing `src/` is treated as "dist is fresh enough" rather than forcing
 * a spurious rebuild (the existsSync check on dist still guards the not-built case).
 */
function newestMtimeUnder(dir: string): number {
  let newest = 0;
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true, recursive: true })) {
      if (!entry.isFile()) continue;
      // entry.parentPath is the directory containing the entry (Node ≥ 20.1 / 21.2).
      // Fall back to joining dir + entry.name for older Node versions.
      const parentPath = (entry as { parentPath?: string }).parentPath ?? dir;
      try {
        const mtime = statSync(join(parentPath, entry.name)).mtimeMs;
        if (mtime > newest) newest = mtime;
      } catch {
        // unreadable file — skip
      }
    }
  } catch {
    // unreadable dir — treat as empty
  }
  return newest;
}

/**
 * Production `LeafBuildSeam`: real fs mtimes + `pnpm build` shell-out (#261).
 * Exported so integrations can import it if needed, but the class defaults to it.
 */
export const productionLeafBuildSeam: LeafBuildSeam = {
  newestSrcMtime: (tweakccFixedDir) => newestMtimeUnder(join(tweakccFixedDir, 'src')),
  distMtime: (distCli) => {
    try {
      return statSync(distCli).mtimeMs;
    } catch {
      return 0;
    }
  },
  build: (tweakccFixedDir) => {
    const r = spawnSync('pnpm', ['build'], { cwd: tweakccFixedDir, encoding: 'utf8' });
    if (r.status !== 0) {
      throw new Error(
        `LeafBuildSeam: \`pnpm build\` failed in ${tweakccFixedDir}` +
          (r.stderr ? `:\n${r.stderr}` : ''),
      );
    }
  },
};

const DEFAULT_PROMPT = 'Reply with exactly the word: ok';
// Deliberate pin: keep boot-verify on the cheap haiku tier intentionally, but pin the exact
// snapshot rather than ride the floating `haiku` alias (verified current as of CC 2.1.170).
const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';
// `2.1.168 (Claude Code)` → `2.1.168`.
const SEMVER = /(\d+\.\d+\.\d+)/;
// tweakcc-fixed's backup filenames under its config dir (src/config.ts: CLIJS_BACKUP_FILE /
// NATIVE_BINARY_BACKUP_FILE) — one per install kind; either present means a backup exists.
const BACKUP_FILES = ['cli.js.backup', 'native-binary.backup'];

/**
 * Whether the install is byte-identical to the stock backup — the real clean-stock signal,
 * pure over the two sha256 digests so it is unit-testable. An `undefined` digest means a file
 * could not be located/read (cannot prove clean → not clean). This is the stronger check #23's
 * HITL run called for: tweakcc-fixed flips `config.json` `changesApplied` to `false` on EVERY
 * successful `--restore` exit, so that flag cannot tell a faithful restore from a dirty one
 * (restore exits 0 but the bytes differ — partial copy, wrong target); a digest compare can.
 */
export function isCleanFromHashes(
  installDigest: string | undefined,
  backupDigest: string | undefined,
): boolean {
  return installDigest !== undefined && installDigest === backupDigest;
}

export class RealAdoptionEnvironment implements AdoptionEnvironment {
  private readonly cfg: RealAdoptionEnvironmentConfig & {
    bootVerifyPrompt: string;
    bootVerifyModel: string;
  };
  private readonly isolationFsSeam: IsolationFsSeam;
  private readonly leafBuildSeam: LeafBuildSeam;
  private cachedVersion?: string;
  private cachedPromptDirs?: string[];

  /**
   * @param config - adapter configuration
   * @param isolationFsSeam - injected fs seam for symlink manipulation; defaults to the
   *   production seam (`productionIsolationFsSeam`). Inject a fake in tests to exercise
   *   the isolation wiring without real fs mutations (#263).
   * @param leafBuildSeam - injected seam for stale-build detection + `pnpm build`; defaults
   *   to the production seam (`productionLeafBuildSeam`). Inject a fake in tests to exercise
   *   the stale-build refresh path without a real build (#261).
   */
  constructor(
    config: RealAdoptionEnvironmentConfig,
    isolationFsSeam?: IsolationFsSeam,
    leafBuildSeam?: LeafBuildSeam,
  ) {
    // Default with `??` per field — a trailing `...config` spread would let an explicitly
    // passed `undefined` clobber a default (e.g. `--model undefined`).
    this.cfg = {
      ...config,
      bootVerifyPrompt: config.bootVerifyPrompt ?? DEFAULT_PROMPT,
      bootVerifyModel: config.bootVerifyModel ?? DEFAULT_MODEL,
    };
    this.isolationFsSeam = isolationFsSeam ?? productionIsolationFsSeam;
    this.leafBuildSeam = leafBuildSeam ?? productionLeafBuildSeam;
  }

  /** Path to the built tweakcc-fixed CLI entry. */
  private get tweakccCli(): string {
    return join(this.cfg.tweakccFixedDir, 'dist', 'index.mjs');
  }

  /** tweakcc-fixed's config/backup dir (holds the backups + `config.json`). */
  private get tweakccConfigDir(): string {
    return this.cfg.tweakccConfigDir ?? join(homedir(), '.tweakcc');
  }

  /** Override dirs scanned for orphans — explicit config, else discovered lazily (one scan). */
  private get promptDirs(): string[] {
    if (this.cfg.promptDirs !== undefined) return this.cfg.promptDirs;
    return (this.cachedPromptDirs ??= discoverPromptDirs(this.cfg.lobotomizedDir));
  }

  /**
   * The installed Claude Code version (from `claude --version`), read once and memoized.
   * `protected` so tests can subclass and override it without a real Claude Code install (#263).
   */
  protected installedVersion(): string {
    if (this.cachedVersion !== undefined) return this.cachedVersion;
    const r = runSync('claude', ['--version']);
    const m = SEMVER.exec(r.stdout);
    if (m === null) {
      throw new Error(
        `RealAdoptionEnvironment: could not read installed Claude Code version from ` +
          `\`claude --version\` (got: ${JSON.stringify(r.stdout.trim())}). Is Claude Code installed?`,
      );
    }
    return (this.cachedVersion = m[1]!);
  }

  /**
   * The Support matrix the environment knows about. Per #22 this is INSTALLED-version-only:
   * `tweakcc-fixed --apply` patches the one installed Claude Code, so the real matrix is the
   * single installed version. The caller builds the matrix from this and hands it to runGate.
   */
  listMatrix(): string[] {
    return [this.installedVersion()];
  }

  /**
   * Run the real leaf tools against the given `overrideDirs` and `stringsFile`, returning
   * the base signals (before isolation metadata is overlaid). Both the isolation and
   * non-isolation paths in {@link adopt} call this method; overriding it in tests replaces
   * the real shell-outs with a fake without touching the isolation wiring (#263).
   */
  protected runVerification(
    overrideDirs: string[],
    stringsFile: string,
    ccVersion: string,
  ): Pick<CapturedSignals, 'apply' | 'bootVerify' | 'validator'> &
    Partial<Pick<CapturedSignals, 'orphanReport' | 'auditMisbinds' | 'auditNotRunReason'>> {
    const sourced = driverPresent(this.cfg.tweakccFixedDir)
      ? runDriverVerification(this.cfg.tweakccFixedDir, ccVersion, stringsFile, overrideDirs)
      : { apply: combinedOutput(runSync('node', [this.tweakccCli, '--apply'])) };
    const bootVerify = normalizeBootVerify(
      runBootVerify(this.cfg.bootVerifyPrompt, this.cfg.bootVerifyModel),
    );
    const validator = runOrphanValidator(overrideDirs, stringsFile);
    return { ...sourced, bootVerify, validator };
  }

  /**
   * Adopt one version: run the real tools and capture their output. `ccVersion` must
   * match the installed version — the tool cannot target another (installed-version-only).
   *
   * Signal source (#80): when skrabe's published `skills/showtime/driver.mjs` is present
   * in the checkout, the CANONICAL driver supplies the apply / orphan / mis-bind signals
   * (`check` runs the idempotent `--apply` itself; `report` + `auditMisbinds.mjs` cover
   * zeros #3/#4) — see driver-verification.ts. When it is absent (older leaf checkout)
   * this falls back to the hand-rolled path, like the #31 consumer fallback:
   *  - apply  ← `node dist/index.mjs --apply` (raw combined output)
   * Both paths share:
   *  - boot-verify ← `claude -p "<prompt>"` on a cheap model, normalized to the marker
   *    (ADR 0005: runtime authority stays ours — the driver's smoke is inconclusive-tolerant
   *    and the gate's boot-verify carries the cost-ledger wiring)
   *  - validator ← the ADVISORY Orphan-variable authoring-drift pre-check (ADR 0005)
   */
  adopt(ccVersion: string): CapturedSignals {
    const installed = this.installedVersion();
    if (ccVersion !== installed) {
      throw new Error(
        `RealAdoptionEnvironment.adopt: asked to adopt ${ccVersion} but the installed Claude Code ` +
          `is ${installed}. This adapter patches the installed version only (#22); install ${ccVersion} first.`,
      );
    }
    if (!existsSync(this.tweakccCli)) {
      throw new Error(
        `RealAdoptionEnvironment.adopt: ${this.tweakccCli} not found — build tweakcc-fixed first ` +
          `(\`cd ${this.cfg.tweakccFixedDir} && pnpm install && pnpm build\`).`,
      );
    }

    // Stale-build check (#261): if src/ is newer than dist/index.mjs, rebuild before --apply
    // so the gate always exercises the current source. Runs for both isolation and non-isolation
    // paths — the build happens once here, before any symlink manipulation.
    this.buildOrAssertFresh();

    // Resolve the identifierMap strings file BEFORE the mutating `--apply` — a missing
    // prompts file fails fast rather than leaving the install patched with no record.
    const stringsFile = resolveStringsFilePath(this.cfg.tweakccFixedDir, ccVersion);

    // ISOLATE_OVERRIDES (#263): wrap the verification body in withIsolation so the runtime
    // `~/.tweakcc/system-prompts` symlink is repointed at a throwaway dir for the duration
    // of the run, and overrideDirs is empty. The symlink is restored on both success and
    // throw. isolationExplicit: true suppresses the unexpected-empty-overrides warning (#262).
    if (this.cfg.isolateOverrides) {
      return withIsolation(this.tweakccConfigDir, this.isolationFsSeam, (setup) => {
        const base = this.runVerification(setup.overrideDirs, stringsFile, ccVersion);
        return { ...base, auditNotRunReason: 'not-run' as const, isolationExplicit: true };
      });
    }

    // Non-isolation path — byte-for-byte unchanged from the original.
    // Resolve override dirs BEFORE the mutating `--apply` so a missing dir fails fast.
    return this.runVerification(this.promptDirs, stringsFile, ccVersion);
  }

  /**
   * Stale-build refresh step (#261): compare the newest mtime under `src/` against
   * `dist/index.mjs`. When stale, rebuild and re-check; if still stale or the build
   * errors, throw with an explicit message — never a silently-stale apply.
   *
   * `private` — called only from {@link adopt}, before the Driver shell-out. Extracted
   * as a named method so the intent is readable at the call site.
   */
  private buildOrAssertFresh(): void {
    const srcMtime = this.leafBuildSeam.newestSrcMtime(this.cfg.tweakccFixedDir);
    const distMtime = this.leafBuildSeam.distMtime(this.tweakccCli);

    if (srcMtime <= distMtime) {
      // dist is fresh — nothing to do
      return;
    }

    // src is newer: attempt a rebuild then re-check freshness.
    try {
      this.leafBuildSeam.build(this.cfg.tweakccFixedDir);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      throw new Error(
        `RealAdoptionEnvironment: leaf build failed in ${this.cfg.tweakccFixedDir} — ` +
          `cannot proceed with a stale dist/. Fix the build error and retry.\n${detail}`,
      );
    }

    // Re-check: if dist is still older than src the build didn't produce a fresh output.
    const distMtimeAfter = this.leafBuildSeam.distMtime(this.tweakccCli);
    const srcMtimeAfter = this.leafBuildSeam.newestSrcMtime(this.cfg.tweakccFixedDir);
    if (srcMtimeAfter > distMtimeAfter) {
      throw new Error(
        `RealAdoptionEnvironment: dist/ in ${this.cfg.tweakccFixedDir} is still stale after ` +
          `\`pnpm build\` — the build completed but did not refresh dist/index.mjs. ` +
          `Check the leaf's build configuration.`,
      );
    }
  }

  // ── Restore-drill trio (#23) — real backup/restore/verify-clean ──────────────────────
  // runGate brackets each version's apply with these (backup-exists → apply → Four-zeros →
  // restore → verify-clean). They are now real against tweakcc-fixed's own backup machinery.

  /**
   * Whether tweakcc-fixed holds a real backup of the install — `cli.js.backup` (npm) or
   * `native-binary.backup` (native) under its config dir. runGate checks this BEFORE apply:
   * with no backup, a bad adoption could brick the install with no way back, so it bails.
   */
  backupExists(_ccVersion: string): boolean {
    return BACKUP_FILES.some((f) => existsSync(join(this.tweakccConfigDir, f)));
  }

  /**
   * Run real `tweakcc-fixed --restore` to undo the adoption. Returns whether the restore
   * COMMAND succeeded (exit 0) — distinct from whether the install is clean afterward
   * ({@link isCleanStock}). A non-zero exit is a failed restore.
   */
  restore(_ccVersion: string): RestoreOutcome {
    return runSync('node', [this.tweakccCli, '--restore']).status === 0 ? 'ok' : 'failed';
  }

  /**
   * Whether the install is back to clean stock after a successful restore: the installed file
   * (the `claude` launcher on PATH, resolved through symlinks to its real target) is byte-
   * identical to tweakcc-fixed's stock backup under its config dir. A dirty restore — restore
   * exits 0 but the bytes differ — fails the run even when Four-zeros passed. Returns false if
   * either file can't be located/read (cannot prove clean). Replaces the earlier `config.json`
   * `changesApplied` flag, which `--restore` resets to clean on every success (#23 HITL finding).
   */
  isCleanStock(_ccVersion: string): boolean {
    const installFile = resolveInstallFile();
    const backupName = BACKUP_FILES.find((f) => existsSync(join(this.tweakccConfigDir, f)));
    const installDigest = installFile === undefined ? undefined : fileDigest(installFile);
    const backupDigest =
      backupName === undefined ? undefined : fileDigest(join(this.tweakccConfigDir, backupName));
    return isCleanFromHashes(installDigest, backupDigest);
  }
}

/**
 * The installed Claude Code file to hash: the `claude` launcher found on PATH, resolved through
 * any symlinks to its real target (native versioned binary or npm `cli.js`). Undefined if
 * `claude` is not on PATH or can't be resolved.
 */
function resolveInstallFile(): string | undefined {
  for (const dir of (process.env.PATH ?? '').split(delimiter)) {
    if (dir === '') continue;
    const candidate = join(dir, 'claude');
    if (existsSync(candidate)) {
      try {
        return realpathSync(candidate);
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

/** sha256 hex digest of a file, or undefined if it can't be read. */
function fileDigest(path: string): string | undefined {
  try {
    return createHash('sha256').update(readFileSync(path)).digest('hex');
  } catch {
    return undefined;
  }
}

/** Override dirs to scan for orphans: every `system-prompts-<model>` dir under the leaf. */
function discoverPromptDirs(lobotomizedDir: string): string[] {
  return readdirSync(lobotomizedDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name.startsWith('system-prompts-'))
    .map((e) => join(lobotomizedDir, e.name));
}

/** Default leaf locations: sibling clones under `~/repos` (overridable via env in the CLI). */
export function defaultLeafConfig(): RealAdoptionEnvironmentConfig {
  return {
    tweakccFixedDir: process.env.TWEAKCC_FIXED_DIR ?? join(homedir(), 'repos', 'tweakcc-fixed'),
    lobotomizedDir:
      process.env.LOBOTOMIZED_DIR ?? join(homedir(), 'repos', 'lobotomized-claude-code'),
    // Honor TWEAKCC_CONFIG_DIR so the gate's restore-drill reads backups from the same dir
    // tweakcc-fixed writes them to (its getConfigDir checks TWEAKCC_CONFIG_DIR first). Without
    // this, the leaf's multi-step dir resolution (e.g. ~/.claude/tweakcc on a runner where
    // claude created ~/.claude) diverges from the gate's hardcoded ~/.tweakcc → missing-backup.
    tweakccConfigDir: process.env.TWEAKCC_CONFIG_DIR?.trim() || undefined,
  };
}
