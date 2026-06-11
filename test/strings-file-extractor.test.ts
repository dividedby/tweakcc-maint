import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { extractStringsFile } from '../src/strings-file-extractor.js';
import type { PromptExtractorAdapter } from '../src/strings-file-extractor.js';

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
