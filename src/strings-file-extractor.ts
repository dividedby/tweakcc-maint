/**
 * strings-file-extractor — produce a `prompts-<version>.json` strings file for a
 * just-shipped CC version from its freshly-installed pristine native binary, into the
 * gate's `prompt-data-cache` (#198; design → docs/design/auto-adopt-pipeline.md).
 *
 * Why this exists: a just-shipped version's strings file 404s on upstream's
 * `data/prompts/` for hours after release (the #180 linchpin, generalized), and npm no
 * longer ships a readable `cli.js` — so the only source is the native binary. The output
 * is EPHEMERAL for the gate run: it seeds `prompt-data-cache` so `--apply` can lobotomize
 * the new version, and is NEVER committed to a leaf (cockpit rule — the leaf's committed
 * `data/prompts/` stays skrabe's to regenerate).
 *
 * The leaf extraction tool is injected as a single seam ({@link PromptExtractorAdapter})
 * so the wrapper's contract — input → output path, version-mismatch throw — is unit-tested
 * with a fake that writes canned bytes: no real dynamic-import, shell-out, or native-binary
 * parse. The real adapter ({@link realPromptExtractorAdapter}) wires the leaf's
 * `extractClaudeJsFromNativeInstallation` → `promptExtractor`; that path (incl.
 * `@babel/parser` and native parsing) is integration-verified by a real gate dispatch.
 */

import { spawnSync } from 'node:child_process';
import {
  readFileSync,
  writeFileSync,
  copyFileSync,
  mkdtempSync,
  rmSync,
  readdirSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * The leaf prompt-extractor adapter seam: given the pristine binary path, the requested
 * version, and the absolute path to write to, produce the `prompts-<version>.json` strings
 * file at `outputPath`. Encapsulates the leaf's `extractClaudeJsFromNativeInstallation` →
 * `promptExtractor` chain so the wrapper stays free of leaf internals.
 */
export interface PromptExtractorAdapter {
  extract(binaryPath: string, version: string, outputPath: string): Promise<void>;
}

/** The `prompts-<version>.json` filename for a version — the gate seeds these into cache. */
export function stringsFileName(version: string): string {
  return `prompts-${version}.json`;
}

/**
 * Produce `prompts-<version>.json` into `outDir` from the pristine `binaryPath`, returning
 * the written path. Asserts the extracted file's internal `version` equals the requested
 * version — a mismatched strings file would silently lobotomize against the wrong vocab, so
 * the wrapper throws rather than seed it.
 */
export async function extractStringsFile(
  binaryPath: string,
  version: string,
  outDir: string,
  adapter: PromptExtractorAdapter,
): Promise<string> {
  const outputPath = join(outDir, stringsFileName(version));
  await adapter.extract(binaryPath, version, outputPath);

  const parsed = JSON.parse(readFileSync(outputPath, 'utf8')) as { version?: unknown };
  if (parsed.version !== version) {
    throw new Error(
      `strings-file extraction version mismatch: requested ${version} but the extracted ` +
        `${stringsFileName(version)} carries internal version ${String(parsed.version)}`,
    );
  }

  return outputPath;
}

/** The native-binary loader the real adapter pulls from the leaf's built `dist/`. */
interface NativeExtractFn {
  (
    binaryPath: string,
    version?: string,
  ): Promise<{ data: Buffer | null; clearBytecode: boolean }>;
}

/**
 * Resolve the leaf's `extractClaudeJsFromNativeInstallation` out of its built `dist/`. The
 * chunk filename is content-hashed (`nativeInstallation-<hash>.mjs`), so glob for it rather
 * than pin a hash that breaks on every leaf rebuild. Throws a directed message if the leaf
 * isn't built — the gate must build tweakcc-fixed first.
 */
async function loadNativeExtract(tweakccFixedDir: string): Promise<NativeExtractFn> {
  const distDir = join(tweakccFixedDir, 'dist');
  let chunk: string | undefined;
  try {
    chunk = readdirSync(distDir).find(
      (name) => /^nativeInstallation-.*\.mjs$/.test(name),
    );
  } catch {
    chunk = undefined;
  }
  if (chunk === undefined) {
    throw new Error(
      `strings-file extraction: no built nativeInstallation chunk under ${distDir} — ` +
        'build tweakcc-fixed first (its `--apply` path needs the same dist).',
    );
  }
  const mod = (await import(pathToFileURL(join(distDir, chunk)).href)) as {
    extractClaudeJsFromNativeInstallation?: NativeExtractFn;
  };
  if (typeof mod.extractClaudeJsFromNativeInstallation !== 'function') {
    throw new Error(
      `strings-file extraction: ${chunk} does not export extractClaudeJsFromNativeInstallation`,
    );
  }
  return mod.extractClaudeJsFromNativeInstallation;
}

/**
 * The production {@link PromptExtractorAdapter}: native binary → cli.js bytes (via the leaf's
 * `extractClaudeJsFromNativeInstallation`) → `prompts-<version>.json` (via the leaf's
 * `tools/promptExtractor.js`). Mirrors `versionBumpReport.js`'s `runExtraction`: stage the
 * cli.js into a temp dir beside a `package.json` carrying the version (promptExtractor reads
 * the version from that sibling), then shell the extractor.
 *
 * The `@babel/parser` availability fix (#198): promptExtractor `require`s `@babel/parser`,
 * which the leaf's own `node_modules` may not install — so we put THIS package's
 * `node_modules` (which depends on `@babel/parser`) on the child's `NODE_PATH`, resolving it
 * for the leaf tool regardless of the leaf's install state.
 *
 * Unit tests inject a fake adapter; this real path (native parsing + babel) is
 * integration-verified by a gate dispatch, never by the unit (design → Testing strategy).
 */
export function realPromptExtractorAdapter(
  tweakccFixedDir = process.env.TWEAKCC_FIXED_DIR ??
    join(homedir(), 'repos', 'tweakcc-fixed'),
): PromptExtractorAdapter {
  return {
    async extract(binaryPath, version, outputPath) {
      const extractNative = await loadNativeExtract(tweakccFixedDir);
      const { data } = await extractNative(binaryPath, version);
      if (data === null) {
        throw new Error(
          `strings-file extraction: could not extract cli.js from ${binaryPath} ` +
            '(node-lief unavailable or not a native install).',
        );
      }

      const stageDir = mkdtempSync(join(tmpdir(), 'tweakcc-strings-'));
      try {
        const cliPath = join(stageDir, 'cli.js');
        writeFileSync(cliPath, data);
        // promptExtractor reads the version from a sibling package.json (not its argv).
        writeFileSync(
          join(stageDir, 'package.json'),
          JSON.stringify({ name: '@anthropic-ai/claude-code', version }),
        );

        const extractor = join(tweakccFixedDir, 'tools', 'promptExtractor.js');
        // Put this package's node_modules on NODE_PATH so the leaf tool's `require('@babel/parser')`
        // resolves even when the leaf hasn't installed it (#198 babel-availability fix).
        const require = createRequire(import.meta.url);
        // require.resolve → .../node_modules/@babel/parser/lib/index.js; NODE_PATH wants the
        // node_modules root, so climb lib → parser → @babel → node_modules (4 dirnames).
        const babelDir = dirname(
          dirname(dirname(dirname(require.resolve('@babel/parser')))),
        );
        const env = {
          ...process.env,
          NODE_PATH: [babelDir, process.env.NODE_PATH]
            .filter((p): p is string => Boolean(p))
            .join(process.platform === 'win32' ? ';' : ':'),
        };
        const r = spawnSync(
          process.execPath,
          [extractor, cliPath, outputPath],
          { encoding: 'utf8', env },
        );
        if (r.status !== 0) {
          throw new Error(
            `strings-file extraction: promptExtractor failed (exit ${r.status}):\n` +
              `${r.stdout ?? ''}\n${r.stderr ?? ''}`,
          );
        }
      } finally {
        rmSync(stageDir, { recursive: true, force: true });
      }
    },
  };
}
