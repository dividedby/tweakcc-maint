/**
 * Thin transport test for lobotomy-ranker-cli (Phase 4 CLI, #265).
 *
 * Tests the path→core→stdout boundary via {@link runLobotomyRankerCliFromPaths} with
 * a temp prompts-<v>.json fixture. Does NOT re-test rankByLobotomyPotential / scoreAxes /
 * anyClears logic (covered in lobotomy-ranker.test.ts).
 *
 * Stdout contract: newline-delimited JSON — one JSON object per line.
 * Each line is: { promptId, totalScore, clearsBar, inactivePenalty, axes: [...] }
 * Final summary line: { anyClears: boolean, count: number }
 *
 * Exit contract: exits 0 on success (including empty input); exits non-zero
 * ONLY on usage error (missing required argument).
 */

import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runLobotomyRankerCliFromPaths } from '../src/lobotomy-ranker-cli.js';

/** Create a temp dir, return its path, register cleanup. */
function makeTmpDir(): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'lobotomy-ranker-test-'));
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

/** Write a prompts JSON to a file and return the path. */
function writePromptsJson(
  dir: string,
  prompts: Array<{ id: string; pieces: string[] }>,
): string {
  const path = join(dir, 'prompts-test.json');
  writeFileSync(path, JSON.stringify({ version: 'test', prompts }), 'utf8');
  return path;
}

/** Run the CLI against the prompts JSON; collect log lines and exit codes. */
async function runCli(
  promptsJsonPath: string,
): Promise<{ logs: string[]; exitCode: number | undefined }> {
  const logs: string[] = [];
  let exitCode: number | undefined;
  await runLobotomyRankerCliFromPaths(promptsJsonPath, {
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

describe('runLobotomyRankerCliFromPaths — empty input', () => {
  it('exits 0 with anyClears=false and count=0 when prompts JSON has no entries', async () => {
    const { dir, cleanup } = makeTmpDir();
    try {
      const promptsJson = writePromptsJson(dir, []);
      const { logs, exitCode } = await runCli(promptsJson);

      expect(exitCode).toBe(0);
      const rows = parseLines(logs) as Array<{ anyClears?: boolean; count?: number }>;
      const summaryRow = rows.find((r) => 'anyClears' in r);
      expect(summaryRow).toMatchObject({ anyClears: false, count: 0 });
    } finally {
      cleanup();
    }
  });
});

// ---------------------------------------------------------------------------
// Stable stdout shape — path-driven
// ---------------------------------------------------------------------------

describe('runLobotomyRankerCliFromPaths — stdout contract', () => {
  it('emits one ranking row per prompt entry + a trailing summary row', async () => {
    const { dir, cleanup } = makeTmpDir();
    try {
      const promptsJson = writePromptsJson(dir, [
        // High-signal text: clears the bar (stub + deferral + hedge).
        { id: 'high-score', pieces: ['TODO: implement this. As a next step, add error handling. You may want to add retry logic later.'] },
        // Low-signal text: does not clear bar.
        { id: 'low-score', pieces: ['Execute task.'] },
      ]);

      const { logs, exitCode } = await runCli(promptsJson);

      expect(exitCode).toBe(0);
      const rows = parseLines(logs);
      // 2 ranking rows + 1 summary row.
      expect(rows).toHaveLength(3);
    } finally {
      cleanup();
    }
  });

  it('ranking row carries promptId, totalScore, clearsBar, inactivePenalty, axes', async () => {
    const { dir, cleanup } = makeTmpDir();
    try {
      const promptsJson = writePromptsJson(dir, [
        { id: 'p1', pieces: ['TODO: implement this. You may want to add the error handling later.'] },
      ]);

      const { logs } = await runCli(promptsJson);

      const rows = parseLines(logs) as Array<{
        promptId?: string;
        totalScore?: number;
        clearsBar?: boolean;
        inactivePenalty?: number;
        axes?: unknown[];
      }>;
      const rankRow = rows.find((r) => 'promptId' in r);
      expect(rankRow?.promptId).toBe('p1');
      expect(typeof rankRow?.totalScore).toBe('number');
      expect(typeof rankRow?.clearsBar).toBe('boolean');
      expect(typeof rankRow?.inactivePenalty).toBe('number');
      expect(Array.isArray(rankRow?.axes)).toBe(true);
      expect((rankRow?.axes as unknown[]).length).toBe(4);
    } finally {
      cleanup();
    }
  });

  it('ranking rows are sorted descending by totalScore', async () => {
    const { dir, cleanup } = makeTmpDir();
    try {
      const promptsJson = writePromptsJson(dir, [
        { id: 'low', pieces: ['Execute task.'] },
        { id: 'high', pieces: ['TODO: implement this. As a next step, add error handling. You may want to add retry logic later.'] },
      ]);

      const { logs } = await runCli(promptsJson);

      const rows = parseLines(logs) as Array<{ promptId?: string; totalScore?: number }>;
      const rankRows = rows.filter((r) => 'promptId' in r);
      expect(rankRows).toHaveLength(2);
      const [first, second] = rankRows as [{ totalScore: number }, { totalScore: number }];
      expect(first.totalScore).toBeGreaterThanOrEqual(second.totalScore);
    } finally {
      cleanup();
    }
  });

  it('summary row carries anyClears and count', async () => {
    const { dir, cleanup } = makeTmpDir();
    try {
      const promptsJson = writePromptsJson(dir, [
        { id: 'p1', pieces: ['TODO: implement this. As a next step, add error handling. You may want to add retry logic later.'] },
      ]);

      const { logs } = await runCli(promptsJson);

      const rows = parseLines(logs) as Array<{ anyClears?: boolean; count?: number }>;
      const summaryRow = rows.find((r) => 'anyClears' in r);
      expect(summaryRow?.anyClears).toBe(true);
      expect(summaryRow?.count).toBe(1);
    } finally {
      cleanup();
    }
  });

  it('anyClears=false when no prompt clears the bar', async () => {
    const { dir, cleanup } = makeTmpDir();
    try {
      const promptsJson = writePromptsJson(dir, [
        { id: 'p1', pieces: ['Execute task.'] },
        { id: 'p2', pieces: ['Process input.'] },
      ]);

      const { logs } = await runCli(promptsJson);

      const rows = parseLines(logs) as Array<{ anyClears?: boolean }>;
      const summaryRow = rows.find((r) => 'anyClears' in r);
      expect(summaryRow?.anyClears).toBe(false);
    } finally {
      cleanup();
    }
  });

  it('text is derived by joining pieces array from the prompts JSON', async () => {
    const { dir, cleanup } = makeTmpDir();
    try {
      // Multi-piece prompt: joined pieces produce anti-laziness signal (stub + deferral).
      const promptsJson = writePromptsJson(dir, [
        { id: 'multi-piece', pieces: ['TODO: implement this. ', 'As a next step, add the error case.'] },
      ]);

      const { logs } = await runCli(promptsJson);

      const rows = parseLines(logs) as Array<{ promptId?: string; totalScore?: number }>;
      const rankRow = rows.find((r) => 'promptId' in r);
      expect(rankRow?.promptId).toBe('multi-piece');
      // Joined pieces have stub + deferral signals, so totalScore > 0.
      expect((rankRow?.totalScore as number)).toBeGreaterThan(0);
    } finally {
      cleanup();
    }
  });
});

// ---------------------------------------------------------------------------
// Multiple prompt entries
// ---------------------------------------------------------------------------

describe('runLobotomyRankerCliFromPaths — multiple prompts', () => {
  it('emits one ranking row per prompt + one summary row', async () => {
    const { dir, cleanup } = makeTmpDir();
    try {
      const promptsJson = writePromptsJson(dir, [
        { id: 'id-1', pieces: ['Execute task.'] },
        { id: 'id-2', pieces: ['Execute task.'] },
        { id: 'id-3', pieces: ['Execute task.'] },
      ]);

      const { logs, exitCode } = await runCli(promptsJson);

      expect(exitCode).toBe(0);
      const rows = parseLines(logs);
      // 3 ranking rows + 1 summary row.
      expect(rows).toHaveLength(4);
    } finally {
      cleanup();
    }
  });
});
