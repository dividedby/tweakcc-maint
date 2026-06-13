/**
 * Thin transport test for drift-triage-cli (Phase 3 CLI, #265).
 *
 * Tests the path→core→stdout boundary via {@link runDriftTriageCliFromPaths} with
 * a temp dir of fixture override files + a temp prompts JSON. Does NOT re-test
 * triagePromptIds / summarizeTriage logic (covered in drift-triage.test.ts).
 *
 * Stdout contract: newline-delimited JSON — one JSON object per line.
 * Each line is: { promptId, hasActiveDrift, perModelSet: [...] }
 * Final summary line: { summary: { total, activeDrifted, stubOnly } }
 *
 * Exit contract: exits 0 on success (including empty input); exits non-zero
 * ONLY on usage error (missing required argument).
 */

import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runDriftTriageCliFromPaths } from '../src/drift-triage-cli.js';

/** Create a temp dir, return its path, register cleanup. */
function makeTmpDir(): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'drift-triage-test-'));
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

/** Write a minimal prompts JSON to a file and return the path. */
function writePromptsJson(
  dir: string,
  prompts: Array<{ id: string; pieces: string[] }>,
): string {
  const path = join(dir, 'prompts-test.json');
  writeFileSync(path, JSON.stringify({ version: 'test', prompts }), 'utf8');
  return path;
}

/** Run the CLI against override dirs + prompts JSON; collect log lines and exit codes. */
async function runCli(
  overrideDirs: string[],
  promptsJsonPath: string,
): Promise<{ logs: string[]; exitCode: number | undefined }> {
  const logs: string[] = [];
  let exitCode: number | undefined;
  await runDriftTriageCliFromPaths(overrideDirs, promptsJsonPath, {
    log: (line) => logs.push(line),
    exit: (code) => { exitCode = code; },
  });
  return { logs, exitCode };
}

/** Parse all non-empty log lines as JSON. */
function parseLines(lines: string[]): unknown[] {
  return lines.filter((l) => l.trim().length > 0).map((l) => JSON.parse(l));
}

// ---------------------------------------------------------------------------
// Empty input
// ---------------------------------------------------------------------------

describe('runDriftTriageCliFromPaths — empty input', () => {
  it('exits 0 with summary total=0 when override dirs list is empty', async () => {
    const { dir, cleanup } = makeTmpDir();
    try {
      const promptsJson = writePromptsJson(dir, []);
      const { logs, exitCode } = await runCli([], promptsJson);

      expect(exitCode).toBe(0);
      const rows = parseLines(logs) as Array<{ summary?: { total: number } }>;
      const summary = rows.find((r) => 'summary' in r);
      expect(summary).toMatchObject({ summary: { total: 0, activeDrifted: 0, stubOnly: 0 } });
    } finally {
      cleanup();
    }
  });

  it('exits 0 with summary total=0 when override dir exists but contains no .md files', async () => {
    const { dir, cleanup } = makeTmpDir();
    try {
      const overrideDir = join(dir, 'system-prompts-fable-5');
      mkdirSync(overrideDir);
      const promptsJson = writePromptsJson(dir, []);
      const { logs, exitCode } = await runCli([overrideDir], promptsJson);

      expect(exitCode).toBe(0);
      const rows = parseLines(logs) as Array<{ summary?: { total: number } }>;
      const summary = rows.find((r) => 'summary' in r);
      expect(summary).toMatchObject({ summary: { total: 0, activeDrifted: 0, stubOnly: 0 } });
    } finally {
      cleanup();
    }
  });
});

// ---------------------------------------------------------------------------
// Stable stdout shape — path-driven
// ---------------------------------------------------------------------------

describe('runDriftTriageCliFromPaths — stdout contract', () => {
  it('emits one triage row per override file id + one trailing summary row', async () => {
    const { dir, cleanup } = makeTmpDir();
    try {
      const overrideDir = join(dir, 'system-prompts-fable-5');
      mkdirSync(overrideDir);
      // Active override: body differs from pristine → hasActiveDrift=true.
      writeFileSync(join(overrideDir, 'prompt-a.md'), '<!--\nname: x\n-->\nOld override text.', 'utf8');
      const promptsJson = writePromptsJson(dir, [{ id: 'prompt-a', pieces: ['New pristine text.'] }]);

      const { logs, exitCode } = await runCli([overrideDir], promptsJson);

      expect(exitCode).toBe(0);
      const rows = parseLines(logs);
      // 1 triage row + 1 summary row.
      expect(rows).toHaveLength(2);
    } finally {
      cleanup();
    }
  });

  it('triage row carries promptId, hasActiveDrift, perModelSet', async () => {
    const { dir, cleanup } = makeTmpDir();
    try {
      const overrideDir = join(dir, 'system-prompts-fable-5');
      mkdirSync(overrideDir);
      writeFileSync(join(overrideDir, 'prompt-a.md'), '<!--\nname: x\n-->\nOld override text.', 'utf8');
      const promptsJson = writePromptsJson(dir, [{ id: 'prompt-a', pieces: ['New pristine text.'] }]);

      const { logs } = await runCli([overrideDir], promptsJson);

      const rows = parseLines(logs) as Array<{ promptId?: string; hasActiveDrift?: boolean; perModelSet?: unknown[] }>;
      const triageRow = rows.find((r) => 'promptId' in r);
      expect(triageRow?.promptId).toBe('prompt-a');
      expect(triageRow?.hasActiveDrift).toBe(true);
      expect(Array.isArray(triageRow?.perModelSet)).toBe(true);
    } finally {
      cleanup();
    }
  });

  it('summary row carries total, activeDrifted, stubOnly', async () => {
    const { dir, cleanup } = makeTmpDir();
    try {
      const overrideDir = join(dir, 'system-prompts-fable-5');
      mkdirSync(overrideDir);
      writeFileSync(join(overrideDir, 'prompt-a.md'), '<!--\nname: x\n-->\nOld override text.', 'utf8');
      const promptsJson = writePromptsJson(dir, [{ id: 'prompt-a', pieces: ['New pristine text.'] }]);

      const { logs } = await runCli([overrideDir], promptsJson);

      const rows = parseLines(logs) as Array<{ summary?: { total: number; activeDrifted: number; stubOnly: number } }>;
      const summaryRow = rows.find((r) => 'summary' in r);
      expect(summaryRow).toMatchObject({ summary: { total: 1, activeDrifted: 1, stubOnly: 0 } });
    } finally {
      cleanup();
    }
  });

  it('non-drifted override (body matches pristine) yields hasActiveDrift=false', async () => {
    const { dir, cleanup } = makeTmpDir();
    try {
      const overrideDir = join(dir, 'system-prompts-fable-5');
      mkdirSync(overrideDir);
      // Body after frontmatter exactly matches pristine text.
      writeFileSync(join(overrideDir, 'prompt-b.md'), '<!--\nname: x\n-->\nExact pristine text.', 'utf8');
      const promptsJson = writePromptsJson(dir, [{ id: 'prompt-b', pieces: ['Exact pristine text.'] }]);

      const { logs } = await runCli([overrideDir], promptsJson);

      const rows = parseLines(logs) as Array<{ promptId?: string; hasActiveDrift?: boolean }>;
      const triageRow = rows.find((r) => 'promptId' in r);
      expect(triageRow?.promptId).toBe('prompt-b');
      expect(triageRow?.hasActiveDrift).toBe(false);
    } finally {
      cleanup();
    }
  });

  it('stub-only override (empty body after frontmatter) is reflected in stubOnly count', async () => {
    const { dir, cleanup } = makeTmpDir();
    try {
      const overrideDir = join(dir, 'system-prompts-fable-5');
      mkdirSync(overrideDir);
      writeFileSync(join(overrideDir, 'prompt-c.md'), '<!--\nname: x\n-->\n', 'utf8');
      const promptsJson = writePromptsJson(dir, []);

      const { logs } = await runCli([overrideDir], promptsJson);

      const rows = parseLines(logs) as Array<{ summary?: { stubOnly: number } }>;
      const summaryRow = rows.find((r) => 'summary' in r);
      expect(summaryRow?.summary?.stubOnly).toBe(1);
    } finally {
      cleanup();
    }
  });

  it('modelSet is derived from the override dir basename', async () => {
    const { dir, cleanup } = makeTmpDir();
    try {
      const overrideDir = join(dir, 'system-prompts-fable-5');
      mkdirSync(overrideDir);
      writeFileSync(join(overrideDir, 'prompt-a.md'), '<!--\nname: x\n-->\nBody.', 'utf8');
      const promptsJson = writePromptsJson(dir, [{ id: 'prompt-a', pieces: ['Pristine.'] }]);

      const { logs } = await runCli([overrideDir], promptsJson);

      const rows = parseLines(logs) as Array<{ perModelSet?: Array<{ modelSet?: string }> }>;
      const triageRow = rows.find((r) => 'perModelSet' in r);
      expect(triageRow?.perModelSet?.[0]?.modelSet).toBe('system-prompts-fable-5');
    } finally {
      cleanup();
    }
  });
});

// ---------------------------------------------------------------------------
// Multiple override dirs
// ---------------------------------------------------------------------------

describe('runDriftTriageCliFromPaths — multiple override dirs', () => {
  it('emits one triage row per unique override id across all dirs', async () => {
    const { dir, cleanup } = makeTmpDir();
    try {
      const dirA = join(dir, 'system-prompts-fable-5');
      const dirB = join(dir, 'system-prompts-sonnet-4');
      mkdirSync(dirA);
      mkdirSync(dirB);
      writeFileSync(join(dirA, 'id-1.md'), 'Body one.', 'utf8');
      writeFileSync(join(dirB, 'id-2.md'), 'Body two.', 'utf8');
      const promptsJson = writePromptsJson(dir, [
        { id: 'id-1', pieces: ['Pristine one.'] },
        { id: 'id-2', pieces: ['Pristine two.'] },
      ]);

      const { logs, exitCode } = await runCli([dirA, dirB], promptsJson);

      expect(exitCode).toBe(0);
      const rows = parseLines(logs);
      // 2 triage rows + 1 summary row.
      expect(rows).toHaveLength(3);
    } finally {
      cleanup();
    }
  });

  it('same promptId in multiple dirs collapses to one triage row with perModelSet entries for each', async () => {
    const { dir, cleanup } = makeTmpDir();
    try {
      const dirA = join(dir, 'system-prompts-fable-5');
      const dirB = join(dir, 'system-prompts-sonnet-4');
      mkdirSync(dirA);
      mkdirSync(dirB);
      writeFileSync(join(dirA, 'shared-id.md'), 'Body.', 'utf8');
      writeFileSync(join(dirB, 'shared-id.md'), 'Body.', 'utf8');
      const promptsJson = writePromptsJson(dir, [{ id: 'shared-id', pieces: ['Pristine.'] }]);

      const { logs } = await runCli([dirA, dirB], promptsJson);

      const rows = parseLines(logs) as Array<{ promptId?: string; perModelSet?: unknown[] }>;
      const triageRows = rows.filter((r) => 'promptId' in r);
      // One triage row for the one unique promptId.
      expect(triageRows).toHaveLength(1);
      // Two perModelSet entries (one per dir).
      expect((triageRows[0] as { perModelSet: unknown[] }).perModelSet).toHaveLength(2);
    } finally {
      cleanup();
    }
  });
});
