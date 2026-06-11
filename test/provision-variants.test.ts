import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { provisionVariants, applySkippedSystemPrompts } from '../src/provision-variants.js';
import type { ProvisionFsSeam, PatchInvocation } from '../src/provision-variants.js';

/** A recorded copy — `(src → dest)`, asserted instead of a real 200 MB binary copy. */
interface CopyCall {
  src: string;
  dest: string;
}

/** A recorded symlink — `(target → path)`, asserted instead of a real fs symlink (#192). */
interface SymlinkCall {
  target: string;
  path: string;
}

/** A recorded `rm` — the cleanup handle's only side effect. */
interface RmCall {
  dir: string;
}

function fakeFs(state: {
  copies: CopyCall[];
  symlinks: SymlinkCall[];
  rms: RmCall[];
  dirs: string[];
  exists?: (path: string) => boolean;
}): ProvisionFsSeam {
  return {
    mkdtempSync: (prefix) => {
      const root = `${prefix}fake0`;
      state.dirs.push(root);
      return root;
    },
    mkdirSync: (dir) => void state.dirs.push(dir),
    cpSync: (src, dest) => void state.copies.push({ src, dest }),
    rmSync: (dir) => void state.rms.push({ dir }),
    symlinkSync: (target, path) => void state.symlinks.push({ target, path }),
    existsSync: (path) => (state.exists ? state.exists(path) : true),
    tmpdir: () => '/tmp',
  };
}

const LIVE_INSTALL = '/usr/local/bin/claude-native-binary';
const LOBO_DIR = '/repos/lobotomized-claude-code';

describe('provisionVariants — stock + lobotomized cli.js producer (copy-then-apply)', () => {
  function run(overrides: Partial<Parameters<typeof provisionVariants>[0]> = {}) {
    const copies: CopyCall[] = [];
    const symlinks: SymlinkCall[] = [];
    const rms: RmCall[] = [];
    const dirs: string[] = [];
    const patches: PatchInvocation[] = [];

    const result = provisionVariants({
      fs: fakeFs({ copies, symlinks, rms, dirs }),
      resolveInstall: () => LIVE_INSTALL,
      patch: (invocation) => void patches.push(invocation),
      model: 'claude-opus-4-8',
      lobotomizedDir: LOBO_DIR,
      promptDataCacheDir: '/home/.tweakcc/prompt-data-cache',
      ...overrides,
    });

    return { result, copies, symlinks, rms, dirs, patches };
  }

  it('returns stock + lobotomized cli paths plus a cleanup handle', () => {
    const { result } = run();
    expect(typeof result.stockCliPath).toBe('string');
    expect(typeof result.lobotomizedCliPath).toBe('string');
    expect(typeof result.cleanup).toBe('function');
  });

  it('stock = a pristine copy of the resolved live install (not the lobo copy)', () => {
    const { result, copies } = run();
    const stockCopy = copies.find((c) => c.dest === result.stockCliPath);
    expect(stockCopy).toBeDefined();
    // Copied FROM the live install — a pristine copy, never patched.
    expect(stockCopy!.src).toBe(LIVE_INSTALL);
  });

  it('lobotomized = a second copy of the live install, then patched in place', () => {
    const { result, copies, patches } = run();
    const loboCopy = copies.find((c) => c.dest === result.lobotomizedCliPath);
    expect(loboCopy).toBeDefined();
    expect(loboCopy!.src).toBe(LIVE_INSTALL);
    // The patcher's target is the lobo copy (patched in place — R3 native repack).
    expect(patches).toHaveLength(1);
    expect(patches[0]!.cliPath).toBe(result.lobotomizedCliPath);
  });

  it('copies the live install twice (stock + lobo) and patches ONLY the lobo copy', () => {
    const { result, copies, patches } = run();
    // Exactly two copies OF the live install (the prompt-data-cache copy has a different src).
    expect(copies.filter((c) => c.src === LIVE_INSTALL).map((c) => c.src)).toEqual([
      LIVE_INSTALL,
      LIVE_INSTALL,
    ]);
    // The live install is never a copy DEST and never the patch target — read-only.
    expect(copies.some((c) => c.dest === LIVE_INSTALL)).toBe(false);
    expect(patches[0]!.cliPath).not.toBe(LIVE_INSTALL);
    expect(patches[0]!.cliPath).toBe(result.lobotomizedCliPath);
    // The stock copy is never patched.
    expect(patches.some((p) => p.cliPath === result.stockCliPath)).toBe(false);
  });

  it('pins the three R1 env vars on the patch invocation', () => {
    const { result, patches } = run();
    const env = patches[0]!.env;
    // HOME sandboxed off the real home.
    expect(env.HOME).toBe(result.workRoot);
    // The backup lands in the sandbox config dir, NOT ~/.tweakcc.
    expect(env.TWEAKCC_CONFIG_DIR).toBe(join(result.workRoot, '.tweakcc'));
    expect(env.TWEAKCC_CONFIG_DIR).not.toBe(join(process.env.HOME ?? '/home/user', '.tweakcc'));
    // The highest-precedence target-path env pins discovery to the lobo copy (R1).
    expect(env.TWEAKCC_CC_INSTALLATION_PATH).toBe(result.lobotomizedCliPath);
  });

  it('the patcher backup dir is the sandbox config dir, not ~/.tweakcc', () => {
    const { result, patches } = run();
    const configDir = patches[0]!.env.TWEAKCC_CONFIG_DIR;
    // Under the work root the cleanup handle removes — so the backup never touches ~/.tweakcc.
    expect(configDir!.startsWith(result.workRoot)).toBe(true);
  });

  it('both cli paths live under the single removable work root', () => {
    const { result } = run();
    expect(result.stockCliPath.startsWith(result.workRoot)).toBe(true);
    expect(result.lobotomizedCliPath.startsWith(result.workRoot)).toBe(true);
  });

  it('cleanup removes the whole work root', () => {
    const { result, rms } = run();
    result.cleanup();
    expect(rms.map((r) => r.dir)).toContain(result.workRoot);
  });

  it('seeds a system-prompts symlink → the model override set under lobotomizedDir (#192)', () => {
    const { result, symlinks } = run();
    const configDir = join(result.workRoot, '.tweakcc');
    const link = symlinks.find((s) => s.path === join(configDir, 'system-prompts'));
    expect(link).toBeDefined();
    expect(link!.target).toBe(join(LOBO_DIR, 'system-prompts-opus-4-8'));
  });

  it('seeds a system-reminders symlink → the leaf system-reminders (#192)', () => {
    const { result, symlinks } = run();
    const configDir = join(result.workRoot, '.tweakcc');
    const link = symlinks.find((s) => s.path === join(configDir, 'system-reminders'));
    expect(link).toBeDefined();
    expect(link!.target).toBe(join(LOBO_DIR, 'system-reminders'));
  });

  it('copies the prompt-data-cache dir into the sandbox config dir (#192)', () => {
    const { result, copies } = run();
    const configDir = join(result.workRoot, '.tweakcc');
    const cacheCopy = copies.find((c) => c.dest === join(configDir, 'prompt-data-cache'));
    expect(cacheCopy).toBeDefined();
    expect(cacheCopy!.src).toBe('/home/.tweakcc/prompt-data-cache');
  });

  it('refuses an unmapped model: throws when the override set does not exist (#192)', () => {
    expect(() =>
      run({ fs: fakeFs({ copies: [], symlinks: [], rms: [], dirs: [], exists: () => false }) }),
    ).toThrow(/no tracked override set for model "claude-opus-4-8"/);
  });

  it('override sources are symlinked read-only, never copied (#192)', () => {
    const { copies } = run();
    // The override sets + system-reminders are only ever symlink targets, never copy sources.
    expect(copies.some((c) => c.src === join(LOBO_DIR, 'system-prompts-opus-4-8'))).toBe(false);
    expect(copies.some((c) => c.src === join(LOBO_DIR, 'system-reminders'))).toBe(false);
  });
});

describe('applySkippedSystemPrompts', () => {
  it('is true on the real --apply skip warning string (#192)', () => {
    const warning = '⚠ System prompts not available - skipping system prompt customizations';
    expect(applySkippedSystemPrompts(warning)).toBe(true);
  });

  it('is false on normal apply output (#192)', () => {
    expect(applySkippedSystemPrompts('✓ Applied system prompt customizations')).toBe(false);
  });
});
