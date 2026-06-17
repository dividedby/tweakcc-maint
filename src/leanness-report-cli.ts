/**
 * leanness-report-cli — thin invoker for the leanness-report tool (#328).
 * Invocable as `pnpm tsx src/leanness-report-cli.ts <version> <model>`.
 *
 * Emits:
 *   - Markdown report to stdout.
 *   - JSON artifact to stdout (after the markdown, separated by a delimiter).
 *
 * Args:
 *   argv[2]: CC version, e.g. 2.1.179
 *   argv[3]: model dir suffix, e.g. opus-4-8
 *
 * Paths resolved relative to the standard repo layout:
 *   ~/repos/tweakcc-fixed/data/prompts/prompts-<version>.json
 *   ~/repos/lobotomized-claude-code/system-prompts-<model>/
 */

import { argv } from 'node:process';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { isEntryPoint } from './cli-entrypoint.js';
import {
  runLeannessReport,
  renderMarkdown,
  buildJsonArtifact,
  LeannessError,
} from './leanness-report.js';

async function main(): Promise<void> {
  const version = argv[2] ?? '';
  const model = argv[3] ?? '';

  if (!version || !model) {
    process.stderr.write(
      'leanness-report: argv[2]=<version> argv[3]=<model> are required\n' +
        '  e.g. pnpm tsx src/leanness-report-cli.ts 2.1.179 opus-4-8\n',
    );
    process.exit(1);
  }

  const tweakccFixedDir =
    process.env.TWEAKCC_FIXED_DIR ?? join(homedir(), 'repos', 'tweakcc-fixed');
  const lobotomizedDir =
    process.env.LOBOTOMIZED_DIR ?? join(homedir(), 'repos', 'lobotomized-claude-code');

  const promptsJsonPath = join(tweakccFixedDir, 'data', 'prompts', `prompts-${version}.json`);
  const overrideDir = join(lobotomizedDir, `system-prompts-${model}`);

  try {
    const report = runLeannessReport({ promptsJsonPath, overrideDir, version, model });

    console.log(renderMarkdown(report));
    console.log('');
    console.log('<!-- JSON artifact -->');
    console.log(JSON.stringify(buildJsonArtifact(report), null, 2));

    if (report.classificationOpenQuestion) {
      process.stderr.write(`\nWARN: ${report.classificationOpenQuestion}\n`);
    }
    if (report.additiveOverrides.length > 0) {
      process.stderr.write(
        `\nINFO: ${report.additiveOverrides.length} additive override(s) not in stock at ${version} — listed in report, excluded from delta math.\n`,
      );
    }
    if (report.notSlimmedIds.length > 0) {
      process.stderr.write(
        `\nINFO: ${report.notSlimmedIds.length} always-on prompt(s) have no override (0% reduction) — listed in report.\n`,
      );
    }
  } catch (err) {
    if (err instanceof LeannessError) {
      process.stderr.write(`leanness-report: [${err.kind}] ${err.message}\n`);
      process.exit(2);
    }
    // Surface raw I/O errors with a clean message.
    if (err instanceof Error && (err as NodeJS.ErrnoException).code === 'ENOENT') {
      process.stderr.write(`leanness-report: file not found — ${err.message}\n`);
      process.exit(2);
    }
    throw err;
  }
}

if (isEntryPoint(import.meta.url)) void main();
