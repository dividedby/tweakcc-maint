/**
 * drift-triage-cli — the runnable entry point for the Phase 3 drift-triage step (#265).
 * Invocable as `pnpm tsx src/drift-triage-cli.ts`.
 *
 * Transport only: paths → {@link triagePromptIds} + {@link summarizeTriage} → stdout.
 * The triage / classification logic stays in the pure core (drift-triage.ts).
 *
 * Input contract (env vars or argv):
 *   DRIFT_TRIAGE_OVERRIDE_DIRS (or argv[2]): colon-separated list of override dir paths
 *     (the `system-prompts-*` dirs whose *.md files are the override files to triage).
 *   DRIFT_TRIAGE_PROMPTS_JSON (or argv[3]): path to the resolved `prompts-<version>.json`
 *     (the new version's pristine prompt texts).
 *
 * Stdout contract (newline-delimited JSON, stable and parseable):
 *   - One JSON line per prompt id: { promptId, hasActiveDrift, perModelSet: [...] }
 *   - Final summary line: { summary: { total, activeDrifted, stubOnly } }
 *
 * Exit contract: exits 0 on success (including empty input); exits non-zero ONLY
 * on usage error (missing required input).
 *
 * Seam injection: the testable {@link runDriftTriageCli} takes all inputs + the log and
 * exit sinks injected — so the all-fake transport test drives it with no real fs or
 * process.exit. The path-driven {@link runDriftTriageCliFromPaths} wires the fs reads
 * and forwards to {@link runDriftTriageCli}. The thin {@link main} binds real paths
 * and sinks.
 */

import { argv } from 'node:process';
import { readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { triagePromptIds, summarizeTriage } from './drift-triage.js';
import { isEntryPoint } from './cli-entrypoint.js';
import type { NamedOverrideFile, PristinePrompt, PromptTriage } from './drift-triage.js';

export interface DriftTriageCliDeps {
  /** The changed/new prompt ids to triage. */
  promptIds: readonly string[];
  /** The named-prompt override files to classify (content already read). */
  overrideFiles: readonly NamedOverrideFile[];
  /** The pristine prompt texts from the new version's prompts JSON. */
  pristinePrompts: readonly PristinePrompt[];
  /** Where output goes; defaults to `console.log`. */
  log: (line: string) => void;
  /** The exit sink; defaults to `process.exit`. */
  exit: (code: number) => void;
}

/**
 * The testable wiring: triage the prompt ids, emit one JSON line per result,
 * then emit a summary line. Always exits 0 (usage errors are the only non-zero case,
 * and those are thrown before calling this fn).
 */
export async function runDriftTriageCli(deps: DriftTriageCliDeps): Promise<void> {
  const results: PromptTriage[] = triagePromptIds(
    deps.promptIds,
    deps.overrideFiles,
    deps.pristinePrompts,
  );

  for (const r of results) {
    deps.log(JSON.stringify({ promptId: r.promptId, hasActiveDrift: r.hasActiveDrift, perModelSet: r.perModelSet }));
  }

  const summary = summarizeTriage(results);
  deps.log(JSON.stringify({ summary }));

  deps.exit(0);
}

/** Minimal shape of a prompts JSON entry the CLI reads for pristine text. */
interface PromptsJsonEntry {
  id?: string;
  pieces?: unknown[];
}

/** Minimal shape of the top-level prompts JSON the CLI reads. */
interface PromptsJson {
  prompts?: PromptsJsonEntry[];
}

/**
 * Read override dirs into NamedOverrideFile[]. Each *.md file in a dir becomes one
 * entry: promptId = basename without .md, modelSet = dir basename, content = file text.
 * Transport-level reader — no I/O policy, no filtering.
 */
function readOverrideDirs(dirs: string[]): NamedOverrideFile[] {
  const files: NamedOverrideFile[] = [];
  for (const dir of dirs) {
    const modelSet = basename(dir);
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith('.md')) {
        const filePath = join(dir, entry.name);
        const promptId = entry.name.replace(/\.md$/, '');
        const content = readFileSync(filePath, 'utf8');
        files.push({ promptId, modelSet, content });
      }
    }
  }
  return files;
}

/**
 * Load a prompts-<version>.json into PristinePrompt[]. Each entry with an id becomes
 * one PristinePrompt; text is derived by joining the pieces array.
 */
function loadPristinePrompts(promptsJsonPath: string): PristinePrompt[] {
  const raw = JSON.parse(readFileSync(promptsJsonPath, 'utf8')) as PromptsJson;
  return (raw.prompts ?? [])
    .filter((p): p is PromptsJsonEntry & { id: string } => typeof p.id === 'string')
    .map((p) => ({
      promptId: p.id,
      text: Array.isArray(p.pieces) ? (p.pieces as string[]).join('') : '',
    }));
}

/**
 * Path-driven entry point: read override dirs + prompts JSON from disk, then call
 * {@link runDriftTriageCli}. Exported so the transport test can drive it with a temp
 * dir of fixture files and injected sinks.
 */
export async function runDriftTriageCliFromPaths(
  overrideDirs: string[],
  promptsJsonPath: string,
  sinks: { log: (line: string) => void; exit: (code: number) => void },
): Promise<void> {
  const overrideFiles = readOverrideDirs(overrideDirs);
  const pristinePrompts = loadPristinePrompts(promptsJsonPath);
  // promptIds = unique IDs found in the override files (the set being triaged).
  const promptIds = [...new Set(overrideFiles.map((f) => f.promptId))];
  await runDriftTriageCli({
    promptIds,
    overrideFiles,
    pristinePrompts,
    log: sinks.log,
    exit: sinks.exit,
  });
}

async function main(): Promise<void> {
  // Override dir paths: colon-separated env var or argv[2].
  // Prompts JSON path: env var or argv[3].
  const rawDirs = process.env.DRIFT_TRIAGE_OVERRIDE_DIRS ?? argv[2] ?? '';
  const promptsJsonPath = process.env.DRIFT_TRIAGE_PROMPTS_JSON ?? argv[3] ?? '';

  if (!promptsJsonPath) {
    process.stderr.write(
      'drift-triage: DRIFT_TRIAGE_PROMPTS_JSON (or argv[3]) is required — ' +
        'path to the resolved prompts-<version>.json\n',
    );
    process.exit(1);
  }

  const overrideDirs = rawDirs
    .split(':')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  await runDriftTriageCliFromPaths(
    overrideDirs,
    promptsJsonPath,
    {
      log: (line) => console.log(line),
      exit: (code) => process.exit(code),
    },
  );
}

// Run only when invoked as the process entry point — never when imported (the transport
// test imports runDriftTriageCli / runDriftTriageCliFromPaths and must NOT trigger a
// real process.exit).
if (isEntryPoint(import.meta.url)) void main();
