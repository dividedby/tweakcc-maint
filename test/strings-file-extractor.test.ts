import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  extractStringsFile,
  assertPristineStringsFile,
  assertCoverage,
  selectPristineSource,
  promptCount,
  loadOverrideBodies,
  stripFrontmatter,
} from '../src/strings-file-extractor.js';
import type { PromptExtractorAdapter, OverrideBody } from '../src/strings-file-extractor.js';

/**
 * A fake leaf prompt-extractor adapter: records its call args and writes a canned
 * `prompts-<version>.json` to the path the wrapper hands it — no real dynamic-import,
 * shell-out, or native-binary parse. `internalVersion` lets a test force a mismatch.
 */
function fakeAdapter(internalVersion?: string): PromptExtractorAdapter & {
  calls: { binaryPath: string; version: string; outputPath: string }[];
} {
  const calls: { binaryPath: string; version: string; outputPath: string }[] = [];
  return {
    calls,
    async extract(binaryPath, version, outputPath) {
      calls.push({ binaryPath, version, outputPath });
      writeFileSync(
        outputPath,
        JSON.stringify({ version: internalVersion ?? version, prompts: [] }),
      );
    },
  };
}

describe('extractStringsFile', () => {
  let outDir: string;

  beforeEach(() => {
    outDir = mkdtempSync(join(tmpdir(), 'strings-extractor-'));
  });
  afterEach(() => {
    rmSync(outDir, { recursive: true, force: true });
  });

  it('writes prompts-<version>.json into outDir and returns its path', async () => {
    const adapter = fakeAdapter();
    const out = await extractStringsFile('/path/to/native-cc', '2.1.180', outDir, adapter);

    expect(out).toBe(join(outDir, 'prompts-2.1.180.json'));
    expect(existsSync(out)).toBe(true);
  });

  it('invokes the injected adapter with (binaryPath, version, outputPath)', async () => {
    const adapter = fakeAdapter();
    await extractStringsFile('/path/to/native-cc', '2.1.180', outDir, adapter);

    expect(adapter.calls).toEqual([
      {
        binaryPath: '/path/to/native-cc',
        version: '2.1.180',
        outputPath: join(outDir, 'prompts-2.1.180.json'),
      },
    ]);
  });

  it("the produced strings file's internal version equals the requested version", async () => {
    const adapter = fakeAdapter();
    const out = await extractStringsFile('/path/to/native-cc', '2.1.180', outDir, adapter);

    const parsed = JSON.parse(readFileSync(out, 'utf8'));
    expect(parsed.version).toBe('2.1.180');
  });

  it('throws when the extracted internal version does not match the requested version', async () => {
    const adapter = fakeAdapter('2.1.179');
    await expect(
      extractStringsFile('/path/to/native-cc', '2.1.180', outDir, adapter),
    ).rejects.toThrow(/2\.1\.180.*2\.1\.179|version mismatch/i);
  });
});

/**
 * The patched-vs-pristine guard (#211). It is DIFFERENTIAL: a candidate extract is patched iff it
 * carries a distinctive override slice that the trusted-pristine reference does NOT — because most
 * override prose is copied from upstream and so appears in a pristine extract too (the lcc#9 trap).
 * These fakes carry only the distinctive slice; the real apply-time corruption is integration-only.
 */
describe('assertPristineStringsFile (patched-vs-pristine guard)', () => {
  let dir: string;
  // A 120+-char override slice distinctive enough to be a real splice tell (> FINGERPRINT_LEN).
  const OVERRIDE_SLICE =
    'high blast radius for that individual even when nobody else is affected, ' +
    'so deleting one is a destructive irreversible action you must refuse to perform';
  const overrides: OverrideBody[] = [{ name: 'inline-memory.md', body: OVERRIDE_SLICE }];

  function writeStrings(name: string, pieces: string[]): string {
    const path = join(dir, name);
    writeFileSync(path, JSON.stringify({ version: '2.1.180', prompts: [{ pieces }] }));
    return path;
  }

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'guard-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('throws when the candidate carries an override slice the pristine reference lacks (patched)', () => {
    const candidate = writeStrings('candidate.json', [`some upstream prose\n${OVERRIDE_SLICE}\nmore`]);
    const pristine = writeStrings('pristine.json', ['some upstream prose\nmore']);
    expect(() =>
      assertPristineStringsFile({ candidatePath: candidate, pristineReferencePath: pristine, overrides }),
    ).toThrow(/inline-memory\.md|patched|#211/);
  });

  it('passes when the override slice is ALSO in the pristine reference (converged, not spliced)', () => {
    // The same override prose present in both → converged-with-upstream, not an apply-time splice.
    const candidate = writeStrings('candidate.json', [`prose ${OVERRIDE_SLICE} tail`]);
    const pristine = writeStrings('pristine.json', [`prose ${OVERRIDE_SLICE} tail`]);
    expect(() =>
      assertPristineStringsFile({ candidatePath: candidate, pristineReferencePath: pristine, overrides }),
    ).not.toThrow();
  });

  it('passes a clean candidate carrying none of the override prose', () => {
    const candidate = writeStrings('candidate.json', ['entirely unrelated pristine prompt text']);
    const pristine = writeStrings('pristine.json', ['entirely unrelated pristine prompt text']);
    expect(() =>
      assertPristineStringsFile({ candidatePath: candidate, pristineReferencePath: pristine, overrides }),
    ).not.toThrow();
  });
});

describe('stripFrontmatter / loadOverrideBodies', () => {
  it('strips a leading <!-- … --> frontmatter block', () => {
    expect(stripFrontmatter('<!--\nname: x\nccVersion: 2.1.180\n-->\n## Body\ntext')).toBe(
      '## Body\ntext',
    );
  });

  it('returns trimmed content unchanged when there is no frontmatter', () => {
    expect(stripFrontmatter('  no frontmatter here  ')).toBe('no frontmatter here');
  });

  it('loads *.md bodies (frontmatter stripped) from override dirs, skipping missing dirs', () => {
    const od = mkdtempSync(join(tmpdir(), 'overrides-'));
    try {
      writeFileSync(join(od, 'a.md'), '<!--\nccVersion: 2\n-->\nAlpha body');
      writeFileSync(join(od, 'note.txt'), 'ignored');
      const bodies = loadOverrideBodies([od, join(od, 'does-not-exist')]);
      expect(bodies).toEqual([{ name: 'a.md', body: 'Alpha body' }]);
    } finally {
      rmSync(od, { recursive: true, force: true });
    }
  });
});

/**
 * Regression tests for the #302 fix: selectPristineSource, assertCoverage, promptCount.
 *
 * Fixture helpers write minimal `{ version, prompts: [...] }` JSON files with a controllable
 * number of prompt entries — no real binary or adapter involved.
 */
describe('selectPristineSource / assertCoverage / promptCount (#302)', () => {
  let dir: string;

  /** Write a minimal prompts JSON with `count` stub prompts and return its absolute path. */
  function writePromptsJson(name: string, version: string, count: number): string {
    const path = join(dir, name);
    const prompts = Array.from({ length: count }, (_, i) => ({ id: `prompt-${i}` }));
    writeFileSync(path, JSON.stringify({ version, prompts }));
    return path;
  }

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'source-select-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  // Test 1: committed present, complete (count >= native), version match → mode 'committed',
  // sourcePath = committedPath, committed file NOT modified.
  it('returns mode committed when the committed file exists, version matches, and count >= native', () => {
    const native = writePromptsJson('native.json', '2.1.178', 312);
    const committed = writePromptsJson('committed.json', '2.1.178', 410);
    const contentBefore = readFileSync(committed, 'utf8');

    const result = selectPristineSource({
      committedPath: committed,
      nativeExtractPath: native,
      version: '2.1.178',
    });

    expect(result.mode).toBe('committed');
    expect(result.sourcePath).toBe(committed);
    // The committed file must NOT have been overwritten.
    expect(readFileSync(committed, 'utf8')).toBe(contentBefore);
  });

  // Test 2: committed present but lossy (count well below native - SLACK) → assertCoverage throws.
  it('assertCoverage throws when source prompt count is too far below the native reference', () => {
    // native=410, source=312, default SLACK=8 → 312+8=320 < 410 → must throw
    const native = writePromptsJson('native.json', '2.1.178', 410);
    const source = writePromptsJson('source.json', '2.1.178', 312);

    expect(() => assertCoverage(source, native)).toThrow(/coverage floor|regressed|#302/);
  });

  // Test 3: committed present, version mismatch → selectPristineSource throws, message names both.
  it('throws on version mismatch, naming both the committed and requested versions', () => {
    const native = writePromptsJson('native.json', '2.1.178', 410);
    // committed file carries the wrong version internally
    const committed = writePromptsJson('committed.json', '2.1.177', 410);

    expect(() =>
      selectPristineSource({
        committedPath: committed,
        nativeExtractPath: native,
        version: '2.1.178',
      }),
    ).toThrow(/2\.1\.177.*2\.1\.178|2\.1\.178.*2\.1\.177|version mismatch/i);
  });

  // Test 4: committed absent → mode 'native-fallback', sourcePath = nativeExtractPath.
  it('returns mode native-fallback when no committed file exists', () => {
    const native = writePromptsJson('native.json', '2.1.178', 312);
    const absent = join(dir, 'does-not-exist.json');

    const result = selectPristineSource({
      committedPath: absent,
      nativeExtractPath: native,
      version: '2.1.178',
    });

    expect(result.mode).toBe('native-fallback');
    expect(result.sourcePath).toBe(native);
  });

  it('promptCount returns the number of prompts in a file path', () => {
    const f = writePromptsJson('p.json', '2.1.178', 7);
    expect(promptCount(f)).toBe(7);
  });

  it('assertCoverage passes when source count + slack >= reference count', () => {
    // source=402, native=410, slack=8 → 402+8=410 >= 410 → should NOT throw
    const native = writePromptsJson('native.json', '2.1.178', 410);
    const source = writePromptsJson('source.json', '2.1.178', 402);
    expect(() => assertCoverage(source, native)).not.toThrow();
  });
});
