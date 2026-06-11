/**
 * behavioral-ab-cli — the runnable entry point for the Behavioral A/B benchmark (#179),
 * invocable as `pnpm tsx src/behavioral-ab-cli.ts`. It mirrors cli.ts / pairing-coherence-cli.ts
 * as transport (not a domain module): build a minimal {@link AdoptionRecord}, provision the two
 * `cli.js` arms ({@link provisionVariants}, #178), wire the {@link makeRunCli} spawn (#176) +
 * {@link makeWorkDirStager} stager (#177) into a {@link RealVariantRunner}, run
 * {@link runBehavioralAB}, and print the resulting {@link BehavioralVerdict}.
 *
 *   pnpm tsx src/behavioral-ab-cli.ts
 *
 * It is EVIDENCE, not a gate (ADR 0002; CONTEXT.md → "Behavioral A/B benchmark"): it ALWAYS
 * exits 0, and runs cleanup in a `finally` so a partial/thrown run never leaves the provisioned
 * work root behind. Credentials come from the environment (CLAUDE_CODE_OAUTH_TOKEN /
 * ANTHROPIC_API_KEY) OR Claude Code's stored OAuth, exactly as cli.ts.
 *
 * The wiring is split into {@link runBehavioralABCli}, which takes every real-vs-fake seam
 * (provision / runCli / judge panel / correctness judge) plus the log + exit sinks injected,
 * so the all-fake wiring test (#179) drives it end-to-end with NO real `claude` subprocess, NO
 * live judge call, NO real `--apply`/copy, and without calling the real `process.exit`. The
 * thin {@link main} binds the production seams and the real `process.exit`. The first real run
 * is the separate HITL slice (#180).
 */

import { provisionVariants } from './provision-variants.js';
import { makeRunCli } from './run-cli.js';
import { makeWorkDirStager } from './work-dir-stager.js';
import { RealVariantRunner } from './real-variant-runner.js';
import { runBehavioralAB } from './behavioral-ab-run.js';
import { RealJudgePanel } from './real-judge-panel.js';
import { RealCorrectnessJudge } from './real-correctness-judge.js';
import { detectCredentials, credentialMessage } from './credentials-preflight.js';
import { argv } from 'node:process';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { ProvisionedVariants } from './provision-variants.js';
import type { JudgePanelPort } from './judge-panel-port.js';
import type { CorrectnessJudgePort } from './correctness-judge-port.js';
import type { CliInvocation, CliResult } from '@dividedby/bench-core';
import type { AdoptionRecord } from './integration-gate.js';

export interface BehavioralABCliDeps {
  /** Provision the two `cli.js` arms; defaults to the real {@link provisionVariants}. Injected
   *  so the wiring test runs no real `--apply`/copy/live-install mutation. */
  provision: () => ProvisionedVariants;
  /** The judge panel; defaults to {@link RealJudgePanel}. Injected so the test runs no model call. */
  panel: JudgePanelPort;
  /** The open-ended correctness judge; defaults to {@link RealCorrectnessJudge}. Injected as above. */
  correctnessJudge: CorrectnessJudgePort;
  /** The CLI spawn boundary; defaults to {@link makeRunCli}. Injected so the test runs no subprocess. */
  runCli: (invocation: CliInvocation) => CliResult;
  /** Held identical across both arms — the only variable is which `cli.js` runs (ADR 0002). */
  model: string;
  /** Held identical across both arms (ADR 0002). */
  effort: string;
  /** Where the printed verdict goes; defaults to `console.log`. */
  log: (line: string) => void;
  /** The exit sink; defaults to `process.exit`. Injected so the test never exits the runner. */
  exit: (code: number) => void;
}

/** A minimal Adoption record to carry the verdict — this slice proves wiring, not a real adoption. */
function minimalRecord(): AdoptionRecord {
  return { pass: false, versions: [], date: new Date().toISOString() };
}

/**
 * The testable wiring: provision the arms, build the {@link RealVariantRunner} from the injected
 * runCli + a fresh work-dir stager, run {@link runBehavioralAB}, print the verdict, and exit 0.
 * ALWAYS exits 0 (evidence, not a gate); the provisioned work root is dropped in the `finally`
 * even on a thrown/partial run, so scratch dirs never accumulate.
 */
export async function runBehavioralABCli(deps: BehavioralABCliDeps): Promise<void> {
  let provisioned: ProvisionedVariants | undefined;
  try {
    provisioned = deps.provision();
    const stager = makeWorkDirStager();
    try {
      const runner = new RealVariantRunner({
        stockCliPath: provisioned.stockCliPath,
        lobotomizedCliPath: provisioned.lobotomizedCliPath,
        model: deps.model,
        effort: deps.effort,
        workDir: stager.workDir,
        runCli: deps.runCli,
      });

      const record = await runBehavioralAB(minimalRecord(), {
        runner,
        panel: deps.panel,
        correctnessJudge: deps.correctnessJudge,
      });

      deps.log(JSON.stringify(record, null, 2));
    } finally {
      stager.cleanup();
    }
  } catch (err) {
    // Evidence, never a gate: surface the failure but never let it become a non-zero exit.
    deps.log(`behavioral-ab-cli: run failed (evidence, not a gate): ${(err as Error).message}`);
  } finally {
    provisioned?.cleanup();
    deps.exit(0);
  }
}

async function main(): Promise<void> {
  const message = credentialMessage(detectCredentials());
  if (message) console.error(message);

  // Read the model once and hold it identical across both arms — the same value seeds the lobo
  // arm's overrides in provisionVariants and is the held model the runner passes to `claude` (#192).
  const model = process.env.BEHAVIORAL_AB_MODEL ?? 'claude-opus-4-8';

  await runBehavioralABCli({
    provision: () => provisionVariants({ model }),
    panel: new RealJudgePanel(),
    correctnessJudge: new RealCorrectnessJudge(),
    runCli: makeRunCli(),
    model,
    effort: process.env.BEHAVIORAL_AB_EFFORT ?? 'high',
    log: (line) => console.log(line),
    exit: (code) => process.exit(code),
  });
}

// Run only when invoked as the process entry point — never when imported (the all-fake wiring
// test imports {@link runBehavioralABCli} and must NOT trigger a real provision/exit).
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
