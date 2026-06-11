/**
 * RealVariantRunner — the prod adapter behind the {@link VariantRunner} seam (design doc
 * → Seams; #138). It produces one arm's output for a fixture by driving a version-pinned
 * Claude Code install through bench `executeRun`, binding the run's `runCli` to the
 * correct `cli.js` for the variant (stock vs lobotomized) while holding model, effort,
 * and prompt identical across arms — the only difference is which `cli.js` runs (CONTEXT.md
 * → "Stock CC / lobotomized-CC"; design doc → Invariants).
 *
 * Both arms MUST run at the same version/model/effort/prompt; an install/version mismatch
 * (a non-zero CLI exit or an unparseable reply) is SURFACED as a thrown error rather than
 * silently mispaired into a verdict — a mispaired arm would poison the evidence. The real
 * spawn is injected (`runCli`) so the contract is unit-tested with no `claude` subprocess.
 */

import { executeRun } from '@dividedby/bench-core';
import type { CliInvocation, CliResult, RunResult } from '@dividedby/bench-core';
import type { Variant, VariantOutput, VariantRunner } from './variant-runner.js';

export interface RealVariantRunnerOptions {
  /** Path to the stock-CC install's `cli.js`. */
  stockCliPath: string;
  /** Path to the lobotomized-CC install's `cli.js`. */
  lobotomizedCliPath: string;
  /** Shared across both arms — never varied per variant. */
  model: string;
  /** Shared across both arms — never varied per variant. */
  effort: string;
  /** A fresh working directory for one run (the caller stages the fixture copy here). */
  workDir: (fixtureId: string, variant: Variant) => string;
  /** The CLI spawn boundary; injected so tests run no real subprocess. */
  runCli: (invocation: CliInvocation) => CliResult;
}

/**
 * Surface the child CLI's captured stderr/stdout (bench `executeRun` fills `raw` when the reply
 * doesn't parse — the non-zero-exit case) so a real arm failure is diagnosable instead of being
 * mislabeled. Trimmed and capped; empty when nothing was captured. (#180: a generic
 * "install/version mismatch" message that discarded the child stderr masked a `node`-vs-native
 * launcher bug.)
 */
function formatChildOutput(raw: RunResult['raw']): string {
  const parts: string[] = [];
  const stderr = raw?.stderr?.trim();
  const stdout = raw?.stdout?.trim();
  if (stderr) parts.push(`stderr: ${stderr.slice(0, 2000)}`);
  if (stdout) parts.push(`stdout: ${stdout.slice(0, 2000)}`);
  return parts.length > 0 ? ` Child output — ${parts.join(' | ')}` : '';
}

export class RealVariantRunner implements VariantRunner {
  constructor(private readonly opts: RealVariantRunnerOptions) {}

  private cliPath(variant: Variant): string {
    return variant === 'stock' ? this.opts.stockCliPath : this.opts.lobotomizedCliPath;
  }

  async run(fixtureId: string, prompt: string, variant: Variant): Promise<VariantOutput> {
    const cliPath = this.cliPath(variant);
    const result: RunResult = await executeRun(
      {
        task: { id: fixtureId, prompt },
        model: this.opts.model,
        effort: this.opts.effort,
        workDir: this.opts.workDir(fixtureId, variant),
      },
      {
        // Prepend this variant's cli.js so the SAME bench args run against the right install.
        runCli: (invocation) =>
          this.opts.runCli({ args: [cliPath, ...invocation.args], cwd: invocation.cwd }),
      },
    );

    if (result.exitCode !== 0) {
      throw new Error(
        `RealVariantRunner: ${variant} arm exited ${result.exitCode} for fixture "${fixtureId}" ` +
          `(${cliPath}) — refusing to mispair.${formatChildOutput(result.raw)}`,
      );
    }
    const text = (result.result as { result?: unknown } | null)?.result;
    if (typeof text !== 'string') {
      throw new Error(
        `RealVariantRunner: ${variant} arm produced no parseable result for fixture "${fixtureId}" ` +
          `(${cliPath}) — refusing to mispair an empty output.${formatChildOutput(result.raw)}`,
      );
    }
    return { variant, output: text };
  }
}
