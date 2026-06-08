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
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { AdoptionEnvironment, RestoreOutcome } from './adoption-environment.js';
import type { CapturedSignals } from './four-zeros-verdict.js';
import { runSync, combinedOutput, normalizeBootVerify } from './leaf-shell.js';
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
 * Whether tweakcc-fixed's `config.json` reports the install as clean stock — its own source
 * of truth, set to `changesApplied: false` after a successful `--restore`. Pure over the file
 * content so it is unit-testable. (A byte-for-byte hash of the install against the backup is a
 * stronger check worth adding during #23's HITL verification; the flag is the primary signal.)
 */
export function isCleanFromConfig(configJson: string): boolean {
  return (JSON.parse(configJson) as { changesApplied?: boolean }).changesApplied === false;
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
      runSync('claude', ['-p', this.cfg.bootVerifyPrompt, '--model', this.cfg.bootVerifyModel]),
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
   * Whether the install is back to clean stock after a successful restore, per tweakcc-fixed's
   * `config.json` (`changesApplied: false`). A dirty restore fails the run even when Four-zeros
   * passed. Returns false if the config is missing/unreadable (cannot prove clean).
   */
  isCleanStock(_ccVersion: string): boolean {
    const configPath = join(this.tweakccConfigDir, 'config.json');
    if (!existsSync(configPath)) return false;
    try {
      return isCleanFromConfig(readFileSync(configPath, 'utf8'));
    } catch {
      return false;
    }
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
  };
}
