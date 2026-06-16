/**
 * leaf-pr-evidence-cli — the runnable entry point for the Phase 2 (#215/#305) leaf-PR
 * evidence artifact writer. Invocable as `pnpm tsx src/leaf-pr-evidence-cli.ts`.
 *
 * Transport only: reads two JSON input files, derives provenance from env vars,
 * calls the pure {@link renderLeafPrEvidence}, and WRITES the markdown artifact to
 * a file. NO auto-PR-open (cockpit rule: prepare, don't impose).
 *
 * Input contract (env var or argv):
 *   CC_VERSION (required) — the adopted CC version.
 *   ADOPTION_RECORD_PATH (optional, default adoption-record.json) — path to AdoptionRecord JSON.
 *   PROVE_VALUE_PATH (optional, default prove-value-result.json) — path to ProveValueResult JSON.
 *   OUTPUT_PATH (optional, default leaf-pr-evidence-<CC_VERSION>.md) — path to write markdown.
 *   PROVENANCE_TARBALL (optional) — override the tarball name in provenance.
 *   PROVENANCE_INTEGRITY (optional) — set the tarball integrity hash in provenance.
 *
 * Provenance derivation:
 *   // ponytail: tarball name follows the documented PristineProvenance convention
 *   // (`claude-code-<v>.tgz`, see leaf-pr-evidence.ts:34); override via PROVENANCE_TARBALL
 *   // if the published scoped-package tarball name differs. Determinism: with no overrides,
 *   // output depends only on the three inputs.
 *
 * Seam injection: {@link runLeafPrEvidenceCliFromPaths} takes all paths + optional sinks so
 * the test can drive it without a subprocess and without touching real argv/env/exit.
 * The thin {@link main} reads env, computes defaults, and calls it.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { isEntryPoint } from './cli-entrypoint.js';
import { renderLeafPrEvidence } from './leaf-pr-evidence.js';
import type { AdoptionRecord } from './integration-gate.js';
import type { ProveValueResult } from './prove-value-result.js';
import type { PristineProvenance } from './leaf-pr-evidence.js';

export interface LeafPrEvidenceCliArgs {
  ccVersion: string;
  adoptionRecordPath: string;
  proveValuePath: string;
  outputPath: string;
  provenanceTarball?: string;
  provenanceIntegrity?: string;
  log?: (line: string) => void;
}

/**
 * Path-driven, sink-injected entry point: reads the two JSON files, builds provenance,
 * calls {@link renderLeafPrEvidence}, and writes the markdown artifact to outputPath.
 * Throws on a missing/unreadable/!JSON input file (fail loud). Lets the renderer's
 * version-mismatch and missing-Four-zeros throws propagate.
 */
export function runLeafPrEvidenceCliFromPaths(args: LeafPrEvidenceCliArgs): void {
  const log = args.log ?? ((line: string) => console.log(line));

  const record = readJson<AdoptionRecord>(args.adoptionRecordPath);
  const proveValue = readJson<ProveValueResult>(args.proveValuePath);

  // ponytail: tarball name follows the documented PristineProvenance convention
  // (`claude-code-<v>.tgz`, see leaf-pr-evidence.ts:34); override via PROVENANCE_TARBALL
  // if the published scoped-package tarball name differs. Determinism: with no overrides,
  // output depends only on the three inputs.
  const provenance: PristineProvenance = {
    source: 'npm-pack',
    tarball: args.provenanceTarball ?? `claude-code-${args.ccVersion}.tgz`,
    ...(args.provenanceIntegrity !== undefined ? { integrity: args.provenanceIntegrity } : {}),
  };

  const markdown = renderLeafPrEvidence({ ccVersion: args.ccVersion, record, proveValue, provenance });

  writeFileSync(args.outputPath, markdown, 'utf8');
  log(`wrote leaf-PR evidence to ${args.outputPath}`);
}

/**
 * Read and JSON-parse a file, rethrowing with the path on failure so the caller
 * knows which input was missing or malformed (fail loud).
 */
function readJson<T>(filePath: string): T {
  const raw = readFileSync(filePath, 'utf8');
  try {
    return JSON.parse(raw) as T;
  } catch (err) {
    throw new Error(`leaf-pr-evidence: failed to parse JSON from ${filePath}: ${String(err)}`);
  }
}

function main(): void {
  const ccVersion = process.env.CC_VERSION;
  if (!ccVersion) {
    process.stderr.write('leaf-pr-evidence: CC_VERSION env var is required\n');
    process.exit(1);
  }

  const adoptionRecordPath = process.env.ADOPTION_RECORD_PATH ?? 'adoption-record.json';
  const proveValuePath = process.env.PROVE_VALUE_PATH ?? 'prove-value-result.json';
  const outputPath = process.env.OUTPUT_PATH ?? `leaf-pr-evidence-${ccVersion}.md`;
  const provenanceTarball = process.env.PROVENANCE_TARBALL;
  const provenanceIntegrity = process.env.PROVENANCE_INTEGRITY;

  runLeafPrEvidenceCliFromPaths({
    ccVersion,
    adoptionRecordPath,
    proveValuePath,
    outputPath,
    provenanceTarball,
    provenanceIntegrity,
    log: (line) => console.log(line),
  });
}

// Run only when invoked as the process entry point — never when imported (the transport
// test imports runLeafPrEvidenceCliFromPaths and must NOT trigger real fs writes or exit).
if (isEntryPoint(import.meta.url)) main();
