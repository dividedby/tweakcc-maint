import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { provisionVariants } from '../src/provision-variants.js';
import type { ProvisionFsSeam, PatchInvocation } from '../src/provision-variants.js';

/** A recorded copy — `(src → dest)`, asserted instead of a real 200 MB binary copy. */
interface CopyCall {
  src: string;
  dest: string;
}

/** A recorded `rm` — the cleanup handle's only side effect. */
interface RmCall {
  dir: string;
}

function fakeFs(state: {
  copies: CopyCall[];
  rms: RmCall[];
  dirs: string[];
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
    tmpdir: () => '/tmp',
  };
}

const LIVE_INSTALL = '/usr/local/bin/claude-native-binary';

describe('provisionVariants — stock + lobotomized cli.js producer (copy-then-apply)', () => {
  function run() {
    const copies: CopyCall[] = [];
    const rms: RmCall[] = [];
    const dirs: string[] = [];
    const patches: PatchInvocation[] = [];

    const result = provisionVariants({
      fs: fakeFs({ copies, rms, dirs }),
      resolveInstall: () => LIVE_INSTALL,
      patch: (invocation) => void patches.push(invocation),
    });

    return { result, copies, rms, dirs, patches };
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
    // Exactly two copies, both from the live install.
    expect(copies.map((c) => c.src)).toEqual([LIVE_INSTALL, LIVE_INSTALL]);
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
});
