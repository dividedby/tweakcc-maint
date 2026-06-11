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
 * The install resolver, the copy operation, and the patcher invocation are all injected so the
 * contract is tested with a fake patcher/copy seam — no real `--apply`, no 200 MB copy, no
 * live-install mutation. Defaults wire the production resolver (PATH `claude` → realpath, mirrors
 * real-adoption-environment.ts's `resolveInstallFile`) and real `node:fs`/`node:os`.
 */

import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, mkdirSync, rmSync, existsSync, realpathSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { basename, delimiter, join } from 'node:path';

/** The `node:fs`/`node:os` subset the producer uses — a seam so tests run with no real fs. */
export interface ProvisionFsSeam {
  mkdtempSync: (prefix: string) => string;
  mkdirSync: (dir: string) => void;
  cpSync: (src: string, dest: string) => void;
  rmSync: (dir: string, options: { recursive: boolean; force: boolean }) => void;
  tmpdir: () => string;
}

const defaultFs: ProvisionFsSeam = {
  mkdtempSync: (prefix) => mkdtempSync(prefix),
  mkdirSync: (dir) => void mkdirSync(dir, { recursive: true }),
  cpSync: (src, dest) => cpSync(src, dest, { recursive: true }),
  rmSync: (dir, options) => rmSync(dir, options),
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

/**
 * Provision the stock + lobotomized `cli.js` paths via copy-then-apply in a sandbox. The live
 * install is READ-only (copied twice, never mutated); only the lobo copy is patched in place,
 * with the patcher's backup steered into the sandbox config dir (NOT `~/.tweakcc`).
 */
export function provisionVariants(options: ProvisionVariantsOptions = {}): ProvisionedVariants {
  const fs = options.fs ?? defaultFs;
  const resolveInstall = options.resolveInstall ?? resolveLiveInstall;
  const patch = options.patch ?? defaultPatch;

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
}
