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
import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { delimiter, join } from 'node:path';

import type { AdoptionEnvironment, RestoreOutcome } from './adoption-environment.js';
import type { CapturedSignals } from './four-zeros-verdict.js';
import { runSync, runBootVerify, combinedOutput, normalizeBootVerify } from './leaf-shell.js';
import { runOrphanValidator, resolveStringsFilePath } from './orphan-validator.js';

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
}

const DEFAULT_PROMPT = 'Reply with exactly the word: ok';
const DEFAULT_MODEL = 'haiku';
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
  private cachedVersion?: string;
  private cachedPromptDirs?: string[];

  constructor(config: RealAdoptionEnvironmentConfig) {
    // Default with `??` per field — a trailing `...config` spread would let an explicitly
    // passed `undefined` clobber a default (e.g. `--model undefined`).
    this.cfg = {
      ...config,
      bootVerifyPrompt: config.bootVerifyPrompt ?? DEFAULT_PROMPT,
      bootVerifyModel: config.bootVerifyModel ?? DEFAULT_MODEL,
    };
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

  /** The installed Claude Code version (from `claude --version`), read once and memoized. */
  private installedVersion(): string {
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
   * Adopt one version: run the three real tools and capture their output. `ccVersion` must
   * match the installed version — the tool cannot target another (installed-version-only).
   *  - apply  ← `node dist/index.mjs --apply` (raw combined output)
   *  - boot-verify ← `claude -p "<prompt>"` on a cheap model, normalized to the marker
   *  - validator ← the real Orphan-variable check over the override dirs
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

    // Resolve the read-only inputs (override dirs, identifierMap strings file) BEFORE the
    // mutating `--apply`, so a missing prompts file / override dir fails fast rather than
    // leaving the install patched with no record (the stubbed restore would not undo it).
    const overrideDirs = this.promptDirs;
    const stringsFile = resolveStringsFilePath(this.cfg.tweakccFixedDir, ccVersion);

    const apply = combinedOutput(runSync('node', [this.tweakccCli, '--apply']));
    const bootVerify = normalizeBootVerify(
      runBootVerify(this.cfg.bootVerifyPrompt, this.cfg.bootVerifyModel),
    );
    const validator = runOrphanValidator(overrideDirs, stringsFile);

    return { apply, bootVerify, validator };
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
