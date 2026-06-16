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
  existsSync,
  readFileSync,
  writeFileSync,
  mkdtempSync,
  rmSync,
  readdirSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { homedir, tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
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

/** Minimal shape of a published prompts JSON file. */
interface ParsedStringsFile {
  version?: string;
  prompts?: Array<{ pieces?: unknown; id?: unknown; identifierMap?: unknown }>;
}

/**
 * The number of prompts in a parsed (or path-identified) strings file.
 * Accepts either a pre-parsed object or an absolute file path.
 */
export function promptCount(parsedOrPath: ParsedStringsFile | string): number {
  const parsed: ParsedStringsFile =
    typeof parsedOrPath === 'string'
      ? (JSON.parse(readFileSync(parsedOrPath, 'utf8')) as ParsedStringsFile)
      : parsedOrPath;
  return (parsed.prompts ?? []).length;
}

/**
 * How many prompts the curated committed file may legitimately lag the native extraction before
 * we treat it as a coverage regression. A committed file may omit a handful of brand-new-version
 * prompts that skrabe hasn't curated yet, but a difference larger than this indicates a lossy
 * extraction problem.
 *
 * ponytail: flat constant; upgrade path is a ratio if version churn makes a flat slack too tight
 * (e.g. if prompt counts grow above ~500 the proportion 8/N < 2% starts being a meaningful cut).
 */
const COVERAGE_SLACK = 8;

/**
 * Fail closed when the source file's prompt count has regressed below the native extraction's
 * completeness floor. `sourcePath` is the file under review (e.g. the committed prompts JSON);
 * `referencePath` is the trusted native extraction (lower bound). `slack` allows the source to
 * legitimately lag by that many prompts (newly-added prompts skrabe hasn't yet curated).
 */
export function assertCoverage(
  sourcePath: string,
  referencePath: string,
  slack: number = COVERAGE_SLACK,
): void {
  const sourceCount = promptCount(sourcePath);
  const referenceCount = promptCount(referencePath);
  if (sourceCount + slack < referenceCount) {
    throw new Error(
      `pristine-extract: committed prompts file has ${sourceCount} prompts but the native ` +
        `extraction has ${referenceCount} — source regressed below coverage floor ` +
        `(sourceCount + SLACK=${slack} < referenceCount). The committed file is too lossy to ` +
        `serve as the pristine source. Check that the committed file is complete (#302).`,
    );
  }
}

/** Inputs for {@link selectPristineSource}. */
export interface SelectPristineSourceInputs {
  /** Absolute path to `<tweakccFixedDir>/data/prompts/prompts-<version>.json`. */
  committedPath: string;
  /** Absolute path to the native extraction written into a temp dir. */
  nativeExtractPath: string;
  /** The CC version being gated (e.g. `"2.1.178"`). */
  version: string;
}

/** Result of {@link selectPristineSource}. */
export interface SelectPristineSourceResult {
  sourcePath: string;
  mode: 'committed' | 'native-fallback';
}

/**
 * Decide which prompts JSON to use as the pristine strings-file SOURCE for the gate run.
 *
 * - `committed`: the committed `data/prompts/` file exists AND its internal version matches.
 *   Throws (fail-closed) on a version mismatch — a wrong-version identifierMap lobotomizes
 *   against the wrong vocab.
 * - `native-fallback`: no committed file yet for this version (brand-new release skrabe
 *   hasn't extracted yet); fall back to the native extraction.
 *
 * Coverage and contamination checks (assertCoverage / assertPristineStringsFile) are the
 * caller's responsibility and must follow a 'committed' result before trusting the source.
 */
export function selectPristineSource(
  inputs: SelectPristineSourceInputs,
): SelectPristineSourceResult {
  const { committedPath, nativeExtractPath, version } = inputs;

  if (!existsSync(committedPath)) {
    return { sourcePath: nativeExtractPath, mode: 'native-fallback' };
  }

  // Version mismatch → fail closed. A committed file for the wrong version carries the wrong
  // identifierMap and would silently lobotomize against a stale vocab.
  const committedParsed = JSON.parse(readFileSync(committedPath, 'utf8')) as ParsedStringsFile;
  if (committedParsed.version !== version) {
    throw new Error(
      `pristine-extract: committed prompts file at ${committedPath} carries internal version ` +
        `"${String(committedParsed.version)}" but the gate is running for version "${version}" — ` +
        `version mismatch, refusing to use a wrong-version identifierMap as the pristine source. ` +
        `Ensure the committed file is for the correct CC version (#302).`,
    );
  }

  return { sourcePath: committedPath, mode: 'committed' };
}

/** A leaf override body, frontmatter already stripped, used as a patched-source fingerprint. */
export interface OverrideBody {
  /** The override filename (for the error message). */
  name: string;
  /** The override's prose with its `<!-- … -->` frontmatter stripped. */
  body: string;
}

/** A candidate extract plus the trusted pristine reference the guard diffs it against. */
export interface PristineGuardInputs {
  /** Path to the strings file under suspicion (e.g. a suspected-patched cache file). */
  candidatePath: string;
  /** Path to a trusted-pristine `prompts-<version>.json` to diff against (e.g. the native-install extract). */
  pristineReferencePath: string;
  /** The leaf's override bodies — the fingerprint corpus. */
  overrides: readonly OverrideBody[];
}

/**
 * Length (chars) of the contiguous override slice the guard fingerprints on. Long enough that a
 * differential match is the spliced override body, not an incidental phrase shared with upstream.
 */
const FINGERPRINT_LEN = 120;

/** Strip an override's leading `<!-- … -->` frontmatter, returning the prose body. */
export function stripFrontmatter(content: string): string {
  const end = content.indexOf('-->');
  return content.startsWith('<!--') && end !== -1 ? content.slice(end + 3).trim() : content.trim();
}

/** Concatenated, whitespace-collapsed prompt-piece text of a strings file (the guard's haystack). */
function stringsBodyText(stringsFilePath: string): string {
  const parsed = JSON.parse(readFileSync(stringsFilePath, 'utf8')) as ParsedStringsFile;
  return (parsed.prompts ?? [])
    .map((p) => (Array.isArray(p.pieces) ? p.pieces.join('') : ''))
    .join('\n')
    .replace(/\s+/g, ' ');
}

/**
 * Reject a strings file sourced from an already-`--apply`-ed (patched) tree. Provenance is the
 * primary defense — {@link extractStringsFile} sources its cli.js from the freshly-installed
 * native binary, a tree that has never been patched — but this content guard fails closed if a caller hands a
 * contaminated extract anyway (the lcc#9 / 2.1.172 failure mode: anchor evidence derived from a
 * local `--apply` against an installed/backed-up tree).
 *
 * Mechanism — DIFFERENTIAL, not a literal-marker sniff. tweakcc splices each override BODY into
 * the cli.js at apply time, so a re-extraction from a patched tree carries that body in its
 * prompt pieces while a pristine extract does not. The guard fingerprints each override on
 * {@link FINGERPRINT_LEN}-char slices and flags a slice that appears in the CANDIDATE but NOT in
 * the trusted `pristineReference` — i.e. spliced, not native.
 *
 * IMPORTANT (the lcc#9 / #211 trap): a reference is REQUIRED because the markers named in the
 * issue do not work absolutely. Minified apply-time names (`uJq` / `B6T(`) are version-specific
 * identifiers that occur natively in a pristine build; the `<…_to_replace>` sentinel tag ships in
 * upstream's OWN pristine prompts as the default placeholder; and most override prose is COPIED
 * from upstream (the "two lineages converged" finding), so it is present in a pristine extract
 * too. An absolute (reference-free) content guard therefore false-positives on a pristine extract
 * — verified empirically on the 2.1.172 pair. Only the differential (present-in-candidate,
 * absent-in-pristine) signal is sound. Overrides whose text fully converged onto upstream are
 * silently indistinguishable even differentially; the un-converged ones catch the patched source.
 */
export function assertPristineStringsFile(inputs: PristineGuardInputs): void {
  const candidate = stringsBodyText(inputs.candidatePath);
  const pristine = stringsBodyText(inputs.pristineReferencePath);

  for (const override of inputs.overrides) {
    const prose = override.body.replace(/\s+/g, ' ').trim();
    if (prose.length < FINGERPRINT_LEN) continue;
    for (let i = 0; i + FINGERPRINT_LEN <= prose.length; i += FINGERPRINT_LEN) {
      const slice = prose.slice(i, i + FINGERPRINT_LEN);
      // The splice tell: distinctive override prose in the candidate that pristine never carries.
      if (candidate.includes(slice) && !pristine.includes(slice)) {
        throw new Error(
          `strings-file extraction: ${stringsFileName(version_of(inputs.candidatePath))} carries the ` +
            `spliced override body of ${override.name} (text absent from the pristine reference) — ` +
            `its source tree was already \`--apply\`-ed (patched), not pristine. Extract from the ` +
            `freshly-installed native binary (or trust the CI gate runner), never from a backed-up/patched tree (#211).`,
        );
      }
    }
  }
}

/** Best-effort version label for an error message: the `version` field of the strings file. */
function version_of(stringsFilePath: string): string {
  try {
    return String((JSON.parse(readFileSync(stringsFilePath, 'utf8')) as { version?: unknown }).version);
  } catch {
    return basename(stringsFilePath);
  }
}

/**
 * Load the leaf's override bodies (frontmatter stripped) from its `system-prompts-*` dirs — the
 * fingerprint corpus {@link assertPristineStringsFile} keys on. Non-recursive per dir.
 */
export function loadOverrideBodies(overrideDirs: readonly string[]): OverrideBody[] {
  const bodies: OverrideBody[] = [];
  for (const dir of overrideDirs) {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      continue;
    }
    for (const name of entries) {
      if (!name.endsWith('.md')) continue;
      const path = join(dir, name);
      bodies.push({ name, body: stripFrontmatter(readFileSync(path, 'utf8')) });
    }
  }
  return bodies;
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
