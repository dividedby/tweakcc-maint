/**
 * lobotomy-ranker-cli — the runnable entry point for the Phase 4 lobotomy-ranking step (#265).
 * Invocable as `pnpm tsx src/lobotomy-ranker-cli.ts`.
 *
 * Transport only: path → {@link rankByLobotomyPotential} + {@link anyClears} → stdout.
 * The scoring / ranking logic stays in the pure core (lobotomy-ranker.ts).
 *
 * Input contract (env var or argv):
 *   LOBOTOMY_RANKER_PROMPTS_JSON (or argv[2]): path to the resolved `prompts-<version>.json`
 *     (source of new/changed prompt ids and their pristine texts).
 *
 * Stdout contract (newline-delimited JSON, stable and parseable):
 *   - One JSON line per candidate, sorted descending by totalScore:
 *     { promptId, totalScore, clearsBar, inactivePenalty, axes: [...] }
 *   - Final summary line: { anyClears: boolean, count: number }
 *
 * Exit contract: exits 0 on success (including empty input); exits non-zero ONLY
 * on usage error (missing required input).
 *
 * Seam injection: the testable {@link runLobotomyRankerCli} takes all inputs + the log and
 * exit sinks injected — so the all-fake transport test drives it with no real fs or
 * process.exit. The path-driven {@link runLobotomyRankerCliFromPaths} wires the fs read
 * and forwards to {@link runLobotomyRankerCli}. The thin {@link main} binds real paths
 * and sinks.
 */

import { argv } from 'node:process';
import { readFileSync } from 'node:fs';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { rankByLobotomyPotential, anyClears } from './lobotomy-ranker.js';
import type { PromptCandidate, LobotomyRanking } from './lobotomy-ranker.js';

export interface LobotomyRankerCliDeps {
  /** The new/changed prompt candidates to rank. */
  candidates: readonly PromptCandidate[];
  /** Where output goes; defaults to `console.log`. */
  log: (line: string) => void;
  /** The exit sink; defaults to `process.exit`. */
  exit: (code: number) => void;
}

/**
 * The testable wiring: rank the candidates, emit one JSON line per ranking
 * (sorted descending by totalScore), then emit a summary line.
 * Always exits 0 (usage errors are the only non-zero case, and those are thrown
 * before calling this fn).
 */
export async function runLobotomyRankerCli(deps: LobotomyRankerCliDeps): Promise<void> {
  const rankings: LobotomyRanking[] = rankByLobotomyPotential(deps.candidates);

  for (const r of rankings) {
    deps.log(JSON.stringify({
      promptId: r.promptId,
      totalScore: r.totalScore,
      clearsBar: r.clearsBar,
      inactivePenalty: r.inactivePenalty,
      axes: r.axes,
    }));
  }

  const summary = {
    anyClears: anyClears(rankings),
    count: rankings.length,
  };
  deps.log(JSON.stringify(summary));

  deps.exit(0);
}

/** Minimal shape of a prompts JSON entry the CLI reads. */
interface PromptsJsonEntry {
  id?: string;
  pieces?: unknown[];
}

/** Minimal shape of the top-level prompts JSON. */
interface PromptsJson {
  prompts?: PromptsJsonEntry[];
}

/**
 * Load a prompts-<version>.json into PromptCandidate[]. Each entry with an id becomes
 * one candidate; text is derived by joining the pieces array. `inactive` is not
 * determinable from the JSON alone and is left undefined (no penalty applied).
 */
function loadPromptCandidates(promptsJsonPath: string): PromptCandidate[] {
  const raw = JSON.parse(readFileSync(promptsJsonPath, 'utf8')) as PromptsJson;
  return (raw.prompts ?? [])
    .filter((p): p is PromptsJsonEntry & { id: string } => typeof p.id === 'string')
    .map((p) => ({
      promptId: p.id,
      text: Array.isArray(p.pieces) ? (p.pieces as string[]).join('') : '',
    }));
}

/**
 * Path-driven entry point: read the prompts JSON from disk, derive PromptCandidate[],
 * then call {@link runLobotomyRankerCli}. Exported so the transport test can drive it
 * with a temp prompts JSON file and injected sinks.
 */
export async function runLobotomyRankerCliFromPaths(
  promptsJsonPath: string,
  sinks: { log: (line: string) => void; exit: (code: number) => void },
): Promise<void> {
  const candidates = loadPromptCandidates(promptsJsonPath);
  await runLobotomyRankerCli({
    candidates,
    log: sinks.log,
    exit: sinks.exit,
  });
}

async function main(): Promise<void> {
  // Prompts JSON path: env var or argv[2].
  const promptsJsonPath = process.env.LOBOTOMY_RANKER_PROMPTS_JSON ?? argv[2] ?? '';

  if (!promptsJsonPath) {
    process.stderr.write(
      'lobotomy-ranker: LOBOTOMY_RANKER_PROMPTS_JSON (or argv[2]) is required — ' +
        'path to the resolved prompts-<version>.json\n',
    );
    process.exit(1);
  }

  await runLobotomyRankerCliFromPaths(
    promptsJsonPath,
    {
      log: (line) => console.log(line),
      exit: (code) => process.exit(code),
    },
  );
}

// Run only when invoked as the process entry point — never when imported (the transport
// test imports runLobotomyRankerCli / runLobotomyRankerCliFromPaths and must NOT trigger
// a real process.exit).
function isEntryPoint(): boolean {
  const entry = argv[1];
  if (entry === undefined) return false;
  try {
    return realpathSync(entry) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
}

if (isEntryPoint()) void main();
