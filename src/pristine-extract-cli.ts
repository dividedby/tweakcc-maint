/**
 * pristine-extract-cli — the composition root that seeds the gate's strings file from a
 * PRISTINE source (#211), invocable as `pnpm tsx src/pristine-extract-cli.ts`.
 *
 * The gate previously sourced `prompts-<version>.json` from the leaf's own `--apply`/`--restore`
 * cache, and `resolveStringsFilePath` (orphan-validator.ts) reads from that cache — a PATCHED
 * tree. Two consecutive realign drafts (lcc#9 + the 2.1.172 false 14-anchor set) were closed by
 * skrabe as contaminated diagnoses sourced from exactly this path. This entry replaces that
 * source: it runs `extractPristineStringsFile` (a fresh `npm pack`, never `--apply`-ed) and
 * writes the result into the leaf's `data/prompts/` — the highest-priority candidate
 * `resolveStringsFilePath` already prefers (its "repo-local, locally-extracted same-day JSON is
 * authoritative" tier) — so the driver + orphan checks downstream consume the pristine file
 * with NO change to their seam.
 *
 * As a tripwire it also runs the differential patched-vs-pristine guard
 * (`assertPristineStringsFile`) against any pre-existing `--apply` cache file for this version,
 * using the fresh pristine extract as the reference: if a leftover cache carries spliced override
 * text the pristine does not, the run fails HERE (loudly) rather than letting a contaminated
 * source reach a leaf PR.
 *
 * Transport only: the logic lives behind `extractPristineStringsFile` + `assertPristineStringsFile`.
 * The real native-binary parse (`realPromptExtractorAdapter`) is integration-verified by a gate
 * dispatch.
 */

import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { argv } from 'node:process';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import {
  assertPristineStringsFile,
  extractPristineStringsFile,
  loadOverrideBodies,
  realPromptExtractorAdapter,
  stringsFileName,
} from './strings-file-extractor.js';

/** Override dirs the guard fingerprints on: every `system-prompts-*` dir under the leaf. */
function discoverOverrideDirs(lobotomizedDir: string): string[] {
  return readdirSync(lobotomizedDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name.startsWith('system-prompts-'))
    .map((e) => join(lobotomizedDir, e.name));
}

/**
 * tweakcc-fixed's `--apply` prompt-data cache file for a version — the OLD (possibly patched)
 * source `resolveStringsFilePath` falls back to. We diff it against the pristine extract as a
 * tripwire. Mirrors forkConfigDir's `$TWEAKCC_CONFIG_DIR` → `~/.tweakcc` default.
 */
function applyCacheFile(version: string): string {
  const configDir = process.env.TWEAKCC_CONFIG_DIR?.trim() || join(homedir(), '.tweakcc');
  return join(configDir, 'prompt-data-cache', stringsFileName(version));
}

async function main(): Promise<void> {
  const version = process.env.CC_VERSION ?? argv[2];
  if (!version) {
    throw new Error(
      'pristine-extract: CC_VERSION env var (or argv[2]) is required — the version to extract.',
    );
  }
  const tweakccFixedDir =
    process.env.TWEAKCC_FIXED_DIR ?? join(homedir(), 'repos', 'tweakcc-fixed');
  const lobotomizedDir =
    process.env.LOBOTOMIZED_DIR ?? join(homedir(), 'repos', 'lobotomized-claude-code');

  // resolveStringsFilePath prefers tweakcc-fixed/data/prompts first — write the pristine extract
  // there so the gate's driver + orphan checks read it ahead of the --apply cache.
  const outDir = join(tweakccFixedDir, 'data', 'prompts');
  const pristinePath = await extractPristineStringsFile(
    version,
    outDir,
    realPromptExtractorAdapter(tweakccFixedDir),
  );
  console.log(`pristine strings file written: ${pristinePath}`);

  // Tripwire: if a prior --apply left a cache file for this version, fail closed when it carries
  // spliced override text the pristine reference does not (a contaminated source).
  const cachePath = applyCacheFile(version);
  if (existsSync(cachePath)) {
    const overrides = loadOverrideBodies(discoverOverrideDirs(lobotomizedDir));
    assertPristineStringsFile({
      candidatePath: cachePath,
      pristineReferencePath: pristinePath,
      overrides,
    });
    console.log(`--apply cache passed the patched-vs-pristine guard: ${cachePath}`);
  }
}

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
