/**
 * pairing-coherence-cli — the entry point for the standing cross-leaf pairing-coherence
 * check (#95). Transport, not a domain module: it runs {@link runPairingCoherence} over
 * the discovered matrix ({tf main × lcc main} ∪ {open PR pairs}), prints the record as
 * JSON, and exits 0 iff no pairing's audit found a mis-bind. Local-first (ADR 0003).
 *
 *   pnpm tsx src/pairing-coherence-cli.ts
 *
 * Leaf paths default to sibling clones under ~/repos; override with TWEAKCC_FIXED_DIR /
 * LOBOTOMIZED_DIR. Read-only against the leaves: fetches + `git show`, no apply, no
 * working-tree mutation, nothing pushed. A SKIPPED audit (no `/tmp/pieb-<ver>.json`
 * upstream dump on this box) is surfaced as `auditMisbindsPassed: undefined` — the
 * leaf's own non-failure — never as a clean-audit claim.
 */

import { runPairingCoherence, defaultPairingConfig } from './pairing-coherence.js';

function main(): void {
  const record = runPairingCoherence(defaultPairingConfig());
  console.log(JSON.stringify(record, null, 2));
  process.exit(record.pass ? 0 : 1);
}

main();
