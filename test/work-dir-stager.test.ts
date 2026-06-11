import { describe, it, expect, afterEach } from 'vitest';
import { existsSync, rmSync, statSync } from 'node:fs';
import { makeWorkDirStager } from '../src/work-dir-stager.js';

/** Track every work root the test creates so a failure never leaks scratch dirs. */
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function stager() {
  const s = makeWorkDirStager();
  roots.push(s.root);
  return s;
}

describe('makeWorkDirStager — per-cell scratch dirs under a removable work root', () => {
  it('gives two distinct cells distinct, freshly-created directories', () => {
    const { workDir } = stager();

    const a = workDir('fixture-a', 'stock');
    const b = workDir('fixture-a', 'lobotomized');

    expect(a).not.toBe(b);
    expect(statSync(a).isDirectory()).toBe(true);
    expect(statSync(b).isDirectory()).toBe(true);
  });

  it('gives the same cell a fresh directory on each call (no reuse)', () => {
    const { workDir } = stager();

    const first = workDir('fixture-a', 'stock');
    const second = workDir('fixture-a', 'stock');

    expect(first).not.toBe(second);
    expect(existsSync(first)).toBe(true);
    expect(existsSync(second)).toBe(true);
  });

  it('roots every cell dir under the single removable work root', () => {
    const s = stager();

    const a = s.workDir('fixture-a', 'stock');
    const b = s.workDir('fixture-b', 'lobotomized');

    expect(a.startsWith(s.root)).toBe(true);
    expect(b.startsWith(s.root)).toBe(true);
  });

  it('cleanup removes the whole work root (R5)', () => {
    const s = stager();
    const cell = s.workDir('fixture-a', 'stock');
    expect(existsSync(s.root)).toBe(true);
    expect(existsSync(cell)).toBe(true);

    s.cleanup();

    expect(existsSync(s.root)).toBe(false);
    expect(existsSync(cell)).toBe(false);
  });

  it('cleanup is idempotent — a second call after teardown does not throw', () => {
    const s = stager();
    s.workDir('fixture-a', 'stock');

    s.cleanup();
    expect(() => s.cleanup()).not.toThrow();
  });

  it('exposes a `workDir` matching the RealVariantRunner injection shape', () => {
    const { workDir } = stager();
    // (fixtureId: string, variant: Variant) => string
    const dir: string = workDir('fixture-a', 'stock');
    expect(typeof dir).toBe('string');
  });
});
