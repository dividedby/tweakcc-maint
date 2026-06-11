import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  extractStringsFile,
  extractPristineStringsFile,
  assertPristineStringsFile,
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

describe('extractPristineStringsFile', () => {
  let outDir: string;

  beforeEach(() => {
    outDir = mkdtempSync(join(tmpdir(), 'pristine-extractor-'));
  });
  afterEach(() => {
    rmSync(outDir, { recursive: true, force: true });
  });

  it('hands the pristine native binary path straight to the adapter (no npm pack)', async () => {
    const adapter = fakeAdapter();
    const out = await extractPristineStringsFile(
      '/home/runner/.local/bin/claude',
      '2.1.173',
      outDir,
      adapter,
    );

    expect(out).toBe(join(outDir, 'prompts-2.1.173.json'));
    expect(adapter.calls).toEqual([
      {
        binaryPath: '/home/runner/.local/bin/claude',
        version: '2.1.173',
        outputPath: join(outDir, 'prompts-2.1.173.json'),
      },
    ]);
  });

  it('throws on internal-version mismatch (the version-match assert)', async () => {
    const adapter = fakeAdapter('2.1.172');
    await expect(
      extractPristineStringsFile('/path/to/native-cc', '2.1.173', outDir, adapter),
    ).rejects.toThrow(/2\.1\.173.*2\.1\.172|version mismatch/i);
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
