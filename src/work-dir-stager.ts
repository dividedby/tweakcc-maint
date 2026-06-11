/**
 * work-dir-stager — the `workDir` stager the {@link RealVariantRunner} injects (#177; design
 * doc → Seams). RealVariantRunner expects `workDir(fixtureId, variant) => string`: a fresh,
 * isolated scratch directory for ONE cell's run, so concurrent or sequential arms never collide
 * on filesystem state (the caller stages the fixture copy into the returned dir).
 *
 * Every cell dir lives under a single removable work root so teardown can drop the whole tree at
 * once (R5) — repeated runs must not accumulate scratch dirs. `cleanup()` removes that root and is
 * idempotent so a `finally` can call it unconditionally (mirrors #179's `finally` cleanup intent).
 *
 * The fs boundary is injected (mirroring run-cli.ts's `spawn` seam) so the contract is unit-tested
 * without leaking real temp dirs where convenient — by default it uses real `node:fs`/`node:os`.
 */

import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Variant } from './variant-runner.js';

/** The `node:fs`/`node:os` subset the stager uses — a seam so tests can run without real fs. */
export interface WorkDirFsSeam {
  mkdtempSync: (prefix: string) => string;
  mkdirSync: (dir: string) => void;
  rmSync: (dir: string, options: { recursive: boolean; force: boolean }) => void;
  tmpdir: () => string;
}

const defaultFs: WorkDirFsSeam = {
  mkdtempSync: (prefix) => mkdtempSync(prefix),
  mkdirSync: (dir) => void mkdirSync(dir, { recursive: true }),
  rmSync: (dir, options) => rmSync(dir, options),
  tmpdir,
};

export interface MakeWorkDirStagerOptions {
  /** The fs boundary; defaults to real `node:fs`/`node:os`. Injected so tests run no real fs. */
  fs?: WorkDirFsSeam;
}

export interface WorkDirStager {
  /** The single removable work root every cell dir is created under. */
  readonly root: string;
  /** Matches the {@link RealVariantRunner} injection: a fresh isolated dir per cell. */
  workDir: (fixtureId: string, variant: Variant) => string;
  /** Remove the whole work root (R5). Idempotent — safe to call from a `finally`. */
  cleanup: () => void;
}

/**
 * Build a {@link WorkDirStager}: create the removable work root up front, then hand out a fresh
 * isolated directory per `(fixtureId, variant)` cell beneath it. `cleanup()` drops the root.
 */
export function makeWorkDirStager(options: MakeWorkDirStagerOptions = {}): WorkDirStager {
  const fs = options.fs ?? defaultFs;
  const root = fs.mkdtempSync(join(fs.tmpdir(), 'behavioral-ab-'));

  // Per-cell uniqueness even when the same cell runs twice: a monotonic suffix keeps each call's
  // dir distinct without a wall-clock collision window.
  let seq = 0;
  const workDir = (fixtureId: string, variant: Variant): string => {
    const dir = join(root, `${fixtureId}-${variant}-${seq++}`);
    fs.mkdirSync(dir);
    return dir;
  };

  const cleanup = (): void => fs.rmSync(root, { recursive: true, force: true });

  return { root, workDir, cleanup };
}
