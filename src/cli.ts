/**
 * cli — the human/HITL entry point that runs the real Integration gate (PRD #20; #22).
 * It builds the matrix from the environment (`env.listMatrix()`), runs the UNCHANGED
 * runGate against the RealAdoptionEnvironment, prints the Adoption record as JSON, and
 * exits with the gate's exit code. This is transport, not a domain module (design doc).
 *
 *   pnpm tsx src/cli.ts
 *
 * Leaf paths default to sibling clones under ~/repos; override with TWEAKCC_FIXED_DIR /
 * LOBOTOMIZED_DIR. Credentials are read from the environment (CLAUDE_CODE_OAUTH_TOKEN or
 * ANTHROPIC_API_KEY) — nothing is committed.
 *
 * SAFETY: the gate runs a real `--apply` and a real `--restore` (the Restore drill, #23) —
 * confirm-backup before, restore + verify-clean after. If the run ends dirty (e.g. a failed
 * or dirty restore, reported in the record), restore manually with `tweakcc-fixed --restore`.
 */

import { runGate, recordToExitCode } from './integration-gate.js';
import { RealAdoptionEnvironment, defaultLeafConfig } from './real-adoption-environment.js';

function hasCredentials(): boolean {
  return Boolean(process.env.CLAUDE_CODE_OAUTH_TOKEN ?? process.env.ANTHROPIC_API_KEY);
}

function main(): void {
  if (!hasCredentials()) {
    console.error(
      'No credentials in the environment — boot-verify (`claude -p`) will fail.\n' +
        'Set CLAUDE_CODE_OAUTH_TOKEN (or ANTHROPIC_API_KEY) and re-run.',
    );
    process.exit(2);
  }

  console.error(
    '⚠️  The gate runs a real `tweakcc-fixed --apply` AND a real `--restore` against your ' +
      'installed\n    Claude Code (the Restore drill). Ensure a backup exists. If the record ' +
      'reports a failed or\n    dirty restore, restore manually with `tweakcc-fixed --restore`.\n',
  );

  const env = new RealAdoptionEnvironment(defaultLeafConfig());
  const matrix = env.listMatrix();
  console.error(`Running the gate over the installed Support matrix: ${matrix.join(', ')}\n`);

  const record = runGate(matrix, env);
  console.log(JSON.stringify(record, null, 2));
  process.exit(recordToExitCode(record));
}

main();
