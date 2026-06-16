/**
 * pristine-extract-cli — the composition root that seeds the gate's strings file from a
 * PRISTINE source (#211, #302), invocable as `pnpm tsx src/pristine-extract-cli.ts`.
 *
 * Source model (two-tier):
 *   1. PREFERRED SOURCE — the committed `tweakcc-fixed/data/prompts/prompts-<version>.json`.
 *      skrabe's curated, complete prompts JSON is the highest-fidelity identifierMap we have.
 *      `resolveStringsFilePath` already prefers this tier. When present and version-matched we
 *      leave it in place (no overwrite) and use it as the pristine source downstream.
 *
 *   2. NATIVE FALLBACK — `extractStringsFile` against the freshly-installed native binary, used
 *      ONLY when no committed file exists yet for this version (brand-new release skrabe hasn't
 *      extracted yet). In that case the native extract is written into `data/prompts/` so
 *      `resolveStringsFilePath` finds it.
 *
 * The native binary extraction is ALWAYS performed, but into a TEMPORARY dir, not into
 * `data/prompts/` when a committed file is present. It serves two roles regardless of mode:
 *   a. Coverage tripwire (defense-in-depth, #302 part B): fail loud if the chosen source
 *      regressed below the native extraction's completeness floor (i.e. the committed file is
 *      too lossy — 312 vs 410 prompts on 2.1.178 was exactly this failure).
 *   b. `--apply`-cache contamination tripwire: if a prior `--apply` left a cache file for this
 *      version, `assertPristineStringsFile` diffs it against the native extract as the trusted-
 *      pristine reference and fails closed if it carries spliced override text.
 *
 * The #211 problem this solves: the native SEA-bytecode extraction is LOSSY (312 vs 410 prompts
 * on 2.1.178 — drops `tool-description-workflow`, `agent-prompt-memory-synthesis`, …). When the
 * gate wrote the native extract into `data/prompts/`, `orphan-report-producer` read that
 * incomplete identifierMap and falsely flagged valid 2.1.177 slots as orphans, blocking
 * four-zeros. The committed file is the source; native is the tripwire reference.
 *
 * Transport only: logic lives behind `extractStringsFile`, `selectPristineSource`,
 * `assertCoverage`, `assertPristineStringsFile`. Real native-binary parse
 * (`realPromptExtractorAdapter`) is integration-verified by a gate dispatch.
 */

import { existsSync, readdirSync, copyFileSync, mkdtempSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { argv } from 'node:process';
import { join } from 'node:path';
import { isEntryPoint } from './cli-entrypoint.js';
import {
  assertCoverage,
  assertPristineStringsFile,
  extractStringsFile,
  loadOverrideBodies,
  promptCount,
  realPromptExtractorAdapter,
  selectPristineSource,
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
 * source `resolveStringsFilePath` falls back to. We diff it against the native extract as a
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
  // The freshly-installed native binary the leaf's extractClaudeJsFromNativeInstallation parses —
  // pristine here because the gate seeds the strings file BEFORE its first --apply. Defaults to the
  // gate's native install (~/.local/bin/claude); CC_NATIVE_BINARY overrides for a non-default path.
  const nativeBinary =
    process.env.CC_NATIVE_BINARY ?? join(homedir(), '.local', 'bin', 'claude');

  // Step 1: Extract native binary into a TEMP dir (not data/prompts). The native extract is the
  // trusted-pristine REFERENCE for tripwires; it is never the preferred source when the committed
  // file exists. Writing it to a temp dir avoids overwriting the committed file (#302).
  const tmpDir = mkdtempSync(join(tmpdir(), 'pristine-extract-'));
  const nativeExtractPath = await extractStringsFile(
    nativeBinary,
    version,
    tmpDir,
    realPromptExtractorAdapter(tweakccFixedDir),
  );
  const nativeCount = promptCount(nativeExtractPath);
  console.log(`native extraction: ${nativeCount} prompts → ${nativeExtractPath} (reference only)`);

  // Step 2: Determine source — committed file (preferred) or native fallback.
  const committedPath = join(tweakccFixedDir, 'data', 'prompts', stringsFileName(version));
  const { mode } = selectPristineSource({
    committedPath,
    nativeExtractPath,
    version,
  });

  const outDir = join(tweakccFixedDir, 'data', 'prompts');
  let pristinePath: string;

  if (mode === 'committed') {
    // Step 3a: Committed file present + version-matched.
    // Coverage tripwire (part B): fail closed if the committed file is too far below the native floor.
    assertCoverage(committedPath, nativeExtractPath);
    // Contamination check: ensure the committed file itself isn't carrying spliced override text.
    // (Unlikely path — the committed file is skrabe's curated export — but fail-closed is correct.)
    const overrides = loadOverrideBodies(discoverOverrideDirs(lobotomizedDir));
    assertPristineStringsFile({
      candidatePath: committedPath,
      pristineReferencePath: nativeExtractPath,
      overrides,
    });
    // Leave the committed file in place — do NOT overwrite it.
    pristinePath = committedPath;
    console.log(
      `pristine source: committed data/prompts (${promptCount(committedPath)} prompts) — ${committedPath}`,
    );
  } else {
    // Step 3b: No committed file for this version yet — copy native extract into data/prompts so
    // resolveStringsFilePath finds it. (This is the original #211 fallback path.)
    copyFileSync(nativeExtractPath, join(outDir, stringsFileName(version)));
    pristinePath = join(outDir, stringsFileName(version));
    console.log(
      `pristine source: native extraction (committed file absent) — ${nativeCount} prompts → ${pristinePath}`,
    );
  }

  // Step 4: --apply-cache contamination tripwire. The trusted-pristine reference is ALWAYS the
  // native extract (not the committed file), so a pre-existing cache is checked against pristine
  // native bytecodes regardless of which source mode was chosen.
  const cachePath = applyCacheFile(version);
  if (existsSync(cachePath)) {
    const overrides = loadOverrideBodies(discoverOverrideDirs(lobotomizedDir));
    assertPristineStringsFile({
      candidatePath: cachePath,
      pristineReferencePath: nativeExtractPath,
      overrides,
    });
    console.log(`--apply cache passed the patched-vs-pristine guard: ${cachePath}`);
  }
}

if (isEntryPoint(import.meta.url)) void main();
