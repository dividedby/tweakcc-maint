/**
 * provision-variants — the `provisionVariants()` producer (#178) that supplies the two
 * `cli.js` paths {@link RealVariantRunner} only stubs today. Copy-then-apply inside a
 * sandbox `HOME` + `TWEAKCC_CONFIG_DIR`:
 *
 *   - stock cli.js       = a pristine copy of the resolved live install.
 *   - lobotomized cli.js = a second copy, patched in place by `tweakcc-fixed --apply` with
 *     HOME/config redirected to the sandbox, so the patcher's backup lands in the sandbox
 *     and never touches `~/.tweakcc`.
 *
 * The live install is only ever READ (copied), never mutated — so the Integration gate's
 * Restore drill stays byte-clean (#178 AC). Both copies + the sandbox config live under a
 * single removable work root the cleanup handle drops (mirrors work-dir-stager.ts's R5 root).
 *
 * R1 (#175 spike): `HOME` + `TWEAKCC_CONFIG_DIR` alone do NOT redirect tweakcc-fixed discovery
 * — with a real `claude` on PATH it resolves the live install at the `which claude` tier first.
 * So the patch invocation MUST pin **`TWEAKCC_CC_INSTALLATION_PATH`** (highest-precedence target
 * env) to the lobo copy; `TWEAKCC_CONFIG_DIR` only isolates the backup off `~/.tweakcc`.
 * R3 (#175 spike): the live install is a native binary; v1 = copy-then-redirect on copies of
 * the native binary — the repack writes in place to the discovered copy, so redirecting
 * discovery redirects the write (no cli.js extraction).
 *
 * Before `--apply`, the sandbox config dir is SEEDED so the lobo arm is actually lobotomized
 * (#192): the tracked leaf's system-prompt + system-reminder overrides are SYMLINKED in
 * read-only (never copied or mutated — the leaf is the single source of truth), and the whole
 * prompt-data-cache dir is COPIED in (so whichever `prompts-<ver>.json` matches the install is
 * present). Without this seed `--apply` runs against an empty config, silently skips the
 * system-prompt customizations, and produces a degenerate stock-vs-stock verdict — so an unmapped
 * model is refused up front and a skipped `--apply` is refused in {@link defaultPatch}.
 *
 * The install resolver, the copy operation, and the patcher invocation are all injected so the
 * contract is tested with a fake patcher/copy seam — no real `--apply`, no 200 MB copy, no
 * live-install mutation. Defaults wire the production resolver (PATH `claude` → realpath, mirrors
 * real-adoption-environment.ts's `resolveInstallFile`) and real `node:fs`/`node:os`.
 */

import { spawnSync } from 'node:child_process';
import {
  cpSync,
  mkdtempSync,
  mkdirSync,
  rmSync,
  existsSync,
  realpathSync,
  symlinkSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { basename, delimiter, join } from 'node:path';

/** The `node:fs`/`node:os` subset the producer uses — a seam so tests run with no real fs. */
export interface ProvisionFsSeam {
  mkdtempSync: (prefix: string) => string;
  mkdirSync: (dir: string) => void;
  cpSync: (src: string, dest: string) => void;
  rmSync: (dir: string, options: { recursive: boolean; force: boolean }) => void;
  /** Symlink the tracked leaf overrides in read-only — never copied/mutated (#192). */
  symlinkSync: (target: string, path: string) => void;
  /** Probe a path so an unmapped model is refused before `--apply` runs (#192). */
  existsSync: (path: string) => boolean;
  tmpdir: () => string;
}

const defaultFs: ProvisionFsSeam = {
  mkdtempSync: (prefix) => mkdtempSync(prefix),
  mkdirSync: (dir) => void mkdirSync(dir, { recursive: true }),
  cpSync: (src, dest) => cpSync(src, dest, { recursive: true }),
  rmSync: (dir, options) => rmSync(dir, options),
  symlinkSync: (target, path) => symlinkSync(target, path),
  existsSync: (path) => existsSync(path),
  tmpdir,
};

/** The patch invocation the {@link patch} seam models — the env pins are the R1 contract. */
export interface PatchInvocation {
  /** The lobo copy to patch in place (R3: native repack writes here). */
  cliPath: string;
  /** The R1 env pins: sandbox HOME + config dir + the highest-precedence target-path env. */
  env: {
    /** Sandbox HOME, off the real home. */
    HOME: string;
    /** Sandbox backup/config dir — NOT `~/.tweakcc` (R1: isolates the backup). */
    TWEAKCC_CONFIG_DIR: string;
    /** Pins tweakcc-fixed discovery to the lobo copy (R1: highest-precedence target env). */
    TWEAKCC_CC_INSTALLATION_PATH: string;
  };
}

export interface ProvisionVariantsOptions {
  /** The fs boundary; defaults to real `node:fs`/`node:os`. Injected so tests run no real fs. */
  fs?: ProvisionFsSeam;
  /** Resolve the live install to copy; defaults to the PATH `claude` → realpath resolver. */
  resolveInstall?: () => string;
  /** Run `tweakcc-fixed --apply` against the lobo copy with the R1 env pins. Injected so the
   *  contract test runs no real `--apply`. */
  patch?: (invocation: PatchInvocation) => void;
  /** Held identical across both arms; selects which tracked override set seeds the lobo arm
   *  (#192). Defaults to `'claude-opus-4-8'`. */
  model?: string;
  /** The tracked lobotomized-claude-code clone the override sets + system-reminders live in. */
  lobotomizedDir?: string;
  /** The prompt-data-cache dir copied into the sandbox so a matching `prompts-<ver>.json` is present. */
  promptDataCacheDir?: string;
}

export interface ProvisionedVariants {
  /** Path to the stock-CC copy — pristine, never patched (feeds RealVariantRunner). */
  stockCliPath: string;
  /** Path to the lobotomized-CC copy — patched in place (feeds RealVariantRunner). */
  lobotomizedCliPath: string;
  /** The single removable work root both copies + the sandbox config live under. */
  workRoot: string;
  /** Remove the whole work root. Idempotent — safe to call from a `finally` (#179). */
  cleanup: () => void;
}

/**
 * Resolve the live install file to copy: the `claude` launcher on PATH, resolved through any
 * symlinks to its real target (native versioned binary or npm `cli.js`). Mirrors
 * real-adoption-environment.ts's `resolveInstallFile`; throws if `claude` can't be resolved.
 */
function resolveLiveInstall(): string {
  for (const dir of (process.env.PATH ?? '').split(delimiter)) {
    if (dir === '') continue;
    const candidate = join(dir, 'claude');
    if (existsSync(candidate)) return realpathSync(candidate);
  }
  throw new Error(
    'provisionVariants: could not resolve the live Claude Code install (`claude` not on PATH). ' +
      'Is Claude Code installed?',
  );
}

/** The tracked override sets the lobotomized-claude-code leaf ships (#192) — model slugs. */
const TRACKED_MODEL_SLUGS = ['opus-4-8', 'opus-4-7', 'fable-5'] as const;

/**
 * Provision the stock + lobotomized `cli.js` paths via copy-then-apply in a sandbox. The live
 * install is READ-only (copied twice, never mutated); only the lobo copy is patched in place,
 * with the patcher's backup steered into the sandbox config dir (NOT `~/.tweakcc`).
 */
export function provisionVariants(options: ProvisionVariantsOptions = {}): ProvisionedVariants {
  const fs = options.fs ?? defaultFs;
  const resolveInstall = options.resolveInstall ?? resolveLiveInstall;
  const patch = options.patch ?? defaultPatch;
  const model = options.model ?? 'claude-opus-4-8';
  const lobotomizedDir =
    options.lobotomizedDir ??
    process.env.LOBOTOMIZED_CLAUDE_CODE_DIR ??
    join(homedir(), 'repos', 'lobotomized-claude-code');
  const promptDataCacheDir =
    options.promptDataCacheDir ?? join(homedir(), '.tweakcc', 'prompt-data-cache');

  const liveInstall = resolveInstall();
  const binaryName = basename(liveInstall);

  const workRoot = fs.mkdtempSync(join(fs.tmpdir(), 'behavioral-ab-provision-'));
  const configDir = join(workRoot, '.tweakcc');
  const stockDir = join(workRoot, 'stock');
  const loboDir = join(workRoot, 'lobo');
  fs.mkdirSync(configDir);
  fs.mkdirSync(stockDir);
  fs.mkdirSync(loboDir);

  const stockCliPath = join(stockDir, binaryName);
  const lobotomizedCliPath = join(loboDir, binaryName);

  // Two pristine copies of the live install — the live install is only ever a copy SOURCE.
  fs.cpSync(liveInstall, stockCliPath);
  fs.cpSync(liveInstall, lobotomizedCliPath);

  // Seed the sandbox config so the lobo arm is actually lobotomized (#192). Without this,
  // `--apply` runs against an empty config, skips the system-prompt customizations, and yields
  // a degenerate stock-vs-stock verdict. Overrides are symlinked read-only from the tracked leaf
  // (single source of truth — never copied/mutated); the prompt-data-cache dir is copied in.
  const modelSlug = model.replace(/^claude-/, '');
  const overrideSrc = join(lobotomizedDir, `system-prompts-${modelSlug}`);
  if (!fs.existsSync(overrideSrc)) {
    throw new Error(
      `provisionVariants: no tracked override set for model "${model}" — looked up "${overrideSrc}". ` +
        `Refusing the run so the lobo arm is not silently stock-vs-stock. Tracked models: ` +
        `${TRACKED_MODEL_SLUGS.join(', ')}.`,
    );
  }
  fs.symlinkSync(overrideSrc, join(configDir, 'system-prompts'));
  fs.symlinkSync(join(lobotomizedDir, 'system-reminders'), join(configDir, 'system-reminders'));
  fs.cpSync(promptDataCacheDir, join(configDir, 'prompt-data-cache'));

  // Patch ONLY the lobo copy in place (R3). The R1 env pins steer discovery to the copy and the
  // backup into the sandbox config dir — never `~/.tweakcc`, so the Restore drill stays byte-clean.
  patch({
    cliPath: lobotomizedCliPath,
    env: {
      HOME: workRoot,
      TWEAKCC_CONFIG_DIR: configDir,
      TWEAKCC_CC_INSTALLATION_PATH: lobotomizedCliPath,
    },
  });

  return {
    stockCliPath,
    lobotomizedCliPath,
    workRoot,
    cleanup: () => fs.rmSync(workRoot, { recursive: true, force: true }),
  };
}

/**
 * True if `--apply` output carries the skip marker — i.e. the seeded overrides/prompt-data-cache
 * for the install version were not found and the system-prompt customizations were skipped, so
 * the lobo arm would be stock-vs-stock (#192). Matched case-insensitively on the warning's stable
 * core. Pure + exported so it is unit-tested separately from {@link defaultPatch}.
 */
export function applySkippedSystemPrompts(output: string): boolean {
  return /skipping system prompt customizations/i.test(output);
}

/**
 * The production patcher seam: shell out to `tweakcc-fixed --apply` with the R1 env pins. Kept
 * thin and unexercised by the contract test (which injects a fake) — the spike (#175) verified
 * the real invocation; #179/#180 wire and run it live.
 */
function defaultPatch(invocation: PatchInvocation): void {
  const tweakccCli = join(
    process.env.TWEAKCC_FIXED_DIR ?? join(homedir(), 'repos', 'tweakcc-fixed'),
    'dist',
    'index.mjs',
  );
  const r = spawnSync('node', [tweakccCli, '--apply'], {
    encoding: 'utf8',
    env: { ...process.env, ...invocation.env },
  });
  if (r.status !== 0) {
    throw new Error(
      `provisionVariants: tweakcc-fixed --apply failed (exit ${r.status}) patching ` +
        `${invocation.cliPath}: ${r.stderr ?? ''}`,
    );
  }
  if (applySkippedSystemPrompts((r.stdout ?? '') + (r.stderr ?? ''))) {
    throw new Error(
      'provisionVariants: tweakcc-fixed --apply skipped the system-prompt customizations — the ' +
        'lobo arm was NOT lobotomized (the overrides / prompt-data-cache for the install version ' +
        'are missing or unmatched). Refusing the run to avoid a degenerate stock-vs-stock verdict.',
    );
  }
}
