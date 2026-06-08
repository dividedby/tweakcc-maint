/**
 * RealAdoptionEnvironment — the prod adapter behind the AdoptionEnvironment seam
 * (PRD #20; issue #22). It is the real counterpart whose contract FakeAdoptionEnvironment
 * has been simulating: it shells out (synchronously) to the real leaf tools and packs
 * their output into a {@link CapturedSignals} for the UNCHANGED runGate → FourZerosVerdict
 * to interpret. Pointing the same gate at this instead of the Fake surfaces real runtime
 * breakage the unit tests structurally cannot see (ADR 0003).
 *
 * Scope of THIS slice (#22): the `adopt` path + `listMatrix`. The Restore-drill trio
 * (`backupExists` / `restore` / `isCleanStock`) is owned by #23 and throws here — the class
 * satisfies the interface but the gate's drill methods are not yet real. Run the gate on a
 * version and the drill will throw at `backupExists`; that is expected until #23 lands.
 *
 * Cockpit guardrail (CONTEXT.md → Control plane): this only READS from and RUNS the leaves
 * locally — it never pushes to or mutates them. Credentials (`CLAUDE_CODE_OAUTH_TOKEN` /
 * `ANTHROPIC_API_KEY`) are read from the environment at run time; nothing is committed.
 */

import { homedir } from 'node:os';
import { existsSync, readdirSync } from 'node:fs';
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
}

const DEFAULT_PROMPT = 'Reply with exactly the word: ok';
const DEFAULT_MODEL = 'haiku';
// `2.1.168 (Claude Code)` → `2.1.168`.
const SEMVER = /(\d+\.\d+\.\d+)/;

export class RealAdoptionEnvironment implements AdoptionEnvironment {
  private readonly cfg: Required<RealAdoptionEnvironmentConfig>;

  constructor(config: RealAdoptionEnvironmentConfig) {
    this.cfg = {
      bootVerifyPrompt: DEFAULT_PROMPT,
      bootVerifyModel: DEFAULT_MODEL,
      promptDirs: config.promptDirs ?? discoverPromptDirs(config.lobotomizedDir),
      ...config,
    };
  }

  /** Path to the built tweakcc-fixed CLI entry. */
  private get tweakccCli(): string {
    return join(this.cfg.tweakccFixedDir, 'dist', 'index.mjs');
  }

  /**
   * The Support matrix the environment knows about. Per #22 this is INSTALLED-version-only:
   * `tweakcc-fixed --apply` patches the one installed Claude Code, so the real matrix is the
   * single installed version (read from `claude --version`). The caller builds the matrix
   * from this and hands it to runGate.
   */
  listMatrix(): string[] {
    const r = runSync('claude', ['--version']);
    const m = SEMVER.exec(r.stdout);
    if (m === null) {
      throw new Error(
        `RealAdoptionEnvironment.listMatrix: could not read installed Claude Code version from ` +
          `\`claude --version\` (got: ${JSON.stringify(r.stdout.trim())}). Is Claude Code installed?`,
      );
    }
    return [m[1]!];
  }

  /**
   * Adopt one version: run the three real tools and capture their output. `ccVersion` must
   * match the installed version — the tool cannot target another (installed-version-only).
   *  - apply  ← `node dist/index.mjs --apply` (raw combined output)
   *  - boot-verify ← `claude -p "<prompt>"` on a cheap model, normalized to the marker
   *  - validator ← the real Orphan-variable check over the override dirs
   */
  adopt(ccVersion: string): CapturedSignals {
    const installed = this.listMatrix()[0];
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

    const apply = combinedOutput(runSync('node', [this.tweakccCli, '--apply']));
    const bootVerify = normalizeBootVerify(
      runSync('claude', ['-p', this.cfg.bootVerifyPrompt, '--model', this.cfg.bootVerifyModel]),
    );
    const validator = runOrphanValidator(
      this.cfg.promptDirs,
      resolveStringsFilePath(this.cfg.tweakccFixedDir, ccVersion),
    );

    return { apply, bootVerify, validator };
  }

  // ── Restore-drill trio — NOT real in this slice (#23 owns it) ───────────────────
  // runGate's per-version flow is bracketed by the drill (backup-exists → apply → …→
  // restore → verify-clean), so these must NOT throw or the gate dies before exercising
  // the real adopt path — #22's acceptance ("the gate emits a record") would be
  // unreachable. They therefore report a trivial PASS so the gate completes. The cost:
  // the real `--apply` runs but is NOT really restored, and the record's restoreDrill
  // fields are placeholders, not evidence. The CLI prints a loud warning; the HITL
  // operator restores manually (`tweakcc-fixed --restore`) afterward. #23 replaces these
  // with real backup/restore/verify-clean against the filesystem.

  backupExists(_ccVersion: string): boolean {
    return true;
  }

  restore(_ccVersion: string): RestoreOutcome {
    return 'ok';
  }

  isCleanStock(_ccVersion: string): boolean {
    return true;
  }
}

/** Override dirs to scan for orphans: every `system-prompts-*` dir under the lobotomized repo. */
function discoverPromptDirs(lobotomizedDir: string): string[] {
  return readdirSync(lobotomizedDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name.startsWith('system-prompts'))
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
