/**
 * OrphanValidator — the real Orphan-variable check for RealAdoptionEnvironment
 * (PRD #20, story 5; issue #22). It produces the `validator` string of a
 * {@link CapturedSignals}, which FourZerosVerdict then interprets — emitting one
 * `ReferenceError: <VAR> is not defined` line per Orphan variable, the exact signature
 * the verdict keys on.
 *
 * Definition (the PRD's): an Orphan variable is a variable a lobotomized override
 * DECLARES (its frontmatter `variables:` list — the backing it was authored against) that
 * is ABSENT from the target CC version's pristine `identifierMap` — i.e. renamed or
 * inlined upstream, so the override's `${VAR}` would resolve to nothing and crash the
 * patched binary. The check is therefore a cross-reference of each override's declared
 * variables against tweakcc-fixed's `prompts-<version>.json` (the `identifierMap` source
 * of truth), matched per prompt by id.
 *
 * An earlier draft scanned override BODIES for `${VAR}` and over-reported wildly (every
 * `${…}` in prose/quoted code counted) — the declared-vars-vs-identifierMap cross-
 * reference is the correct, low-noise check.
 *
 * Known approximation, documented for the HITL reviewer: synthetic POSITIONAL placeholder
 * names (`…_VAR_<n>`) are matched by index, not by name, so they never appear in
 * `identifierMap`'s (named) values — they are excluded rather than flagged. An override
 * matched to no prompt in the target version is skipped (cannot be validated here). The
 * fully-authoritative check is tweakcc-fixed's own apply-time resolution; this is the
 * static cross-reference the gate runs ahead of it.
 *
 * Pure core (`findOrphans` / `formatValidatorOutput` / `buildLegalMap`) is unit-tested with
 * fixtures; the fs/JSON wrappers are exercised by the HITL run.
 */

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';

/** One lobotomized override file, content already read. */
export interface OverrideFile {
  /** Path to the override; its basename (minus `.md`) is the prompt id used for matching. */
  path: string;
  /** Full file content, including the `<!-- … -->` frontmatter block. */
  content: string;
}

/** One Orphan variable: a declared variable absent from the target version's identifierMap. */
export interface OrphanFinding {
  /** The override file the orphan was declared in. */
  file: string;
  /** The unbacked variable name. */
  variable: string;
}

/** Shape of the relevant slice of a `prompts-<version>.json` strings file. */
export interface StringsFile {
  prompts: Array<{ id: string; identifierMap?: Record<string, string> }>;
}

// The leading `<!-- … -->` HTML-comment frontmatter block lobotomized overrides use.
const FRONTMATTER = /^\s*<!--([\s\S]*?)-->/;
const VARIABLES_KEY = /^variables:\s*$/;
const LIST_ITEM = /^\s*-\s*(\S+)/;
// Synthetic positional placeholder, e.g. `PROMPT_VAR_0` — matched by index, not by name.
const SYNTHETIC_POSITIONAL = /_VAR_\d+$/;

/** Extract the declared backing-variable whitelist from an override's frontmatter. */
export function parseAllowedVariables(content: string): string[] {
  const fm = FRONTMATTER.exec(content);
  if (fm === null) return [];

  const declared: string[] = [];
  let inList = false;
  for (const line of fm[1]!.split('\n')) {
    if (VARIABLES_KEY.test(line.trim())) {
      inList = true;
      continue;
    }
    if (!inList) continue;
    const item = LIST_ITEM.exec(line);
    if (item !== null) {
      const name = item[1]!.replace(/^['"]|['"]$/g, ''); // strip stray quotes
      if (name !== '') declared.push(name);
    } else if (line.trim() !== '') {
      inList = false; // next frontmatter key ends the variables block
    }
  }
  return declared;
}

/** The prompt id an override matches: its filename without the `.md` extension. */
export function promptIdOf(path: string): string {
  return basename(path).replace(/\.md$/, '');
}

/** Build the per-prompt legal-variable map (prompt id → identifierMap value set). */
export function buildLegalMap(strings: StringsFile): Map<string, Set<string>> {
  return new Map(
    strings.prompts.map((p) => [p.id, new Set(Object.values(p.identifierMap ?? {}))]),
  );
}

/**
 * Orphan variables across a set of overrides: each declared variable whose name is absent
 * from its prompt's identifierMap in the target version. Synthetic positional names
 * (`…_VAR_<n>`) are excluded; overrides matching no prompt in the target version are
 * skipped (cannot be validated). Each (file, variable) is reported once, in declaration
 * order.
 */
export function findOrphans(
  files: OverrideFile[],
  legalByPromptId: Map<string, Set<string>>,
): OrphanFinding[] {
  const orphans: OrphanFinding[] = [];
  for (const file of files) {
    const legal = legalByPromptId.get(promptIdOf(file.path));
    if (legal === undefined) continue; // no matching prompt in this version — skip
    for (const variable of parseAllowedVariables(file.content)) {
      if (legal.has(variable) || SYNTHETIC_POSITIONAL.test(variable)) continue;
      orphans.push({ file: file.path, variable });
    }
  }
  return orphans;
}

/**
 * The `validator` string for {@link CapturedSignals}: one `ReferenceError: <VAR> is not
 * defined` line per orphan (the signature FourZerosVerdict matches), tagged with its file;
 * or a clean "0 orphans" line carrying no `ReferenceError` when none.
 */
export function formatValidatorOutput(
  files: OverrideFile[],
  legalByPromptId: Map<string, Set<string>>,
): string {
  const orphans = findOrphans(files, legalByPromptId);
  if (orphans.length === 0) {
    return `Orphan-variable check: 0 orphans across ${files.length} overrides.`;
  }
  return orphans
    .map((o) => `# ${o.file}\nReferenceError: ${o.variable} is not defined`)
    .join('\n');
}

// ── fs / JSON wrappers (HITL-exercised) ──────────────────────────────────────────────

/** Read every `*.md` override under the given directories (non-recursive). */
export function readOverrideFiles(dirs: string[]): OverrideFile[] {
  const files: OverrideFile[] = [];
  for (const dir of dirs) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith('.md')) {
        const path = join(dir, entry.name);
        files.push({ path, content: readFileSync(path, 'utf8') });
      }
    }
  }
  return files;
}

/**
 * Locate the pristine `prompts-<version>.json` for a CC version: tweakcc-fixed's bundled
 * `data/prompts/` first (authoritative, same-day), then the user cache populated by a prior
 * `--apply` (`~/.tweakcc/prompt-data-cache/`). Throws with guidance if neither exists.
 */
export function resolveStringsFilePath(tweakccFixedDir: string, version: string): string {
  const candidates = [
    join(tweakccFixedDir, 'data', 'prompts', `prompts-${version}.json`),
    join(homedir(), '.tweakcc', 'prompt-data-cache', `prompts-${version}.json`),
  ];
  const found = candidates.find((p) => existsSync(p));
  if (found === undefined) {
    throw new Error(
      `OrphanValidator: no prompts-${version}.json found (looked in ${candidates.join(', ')}). ` +
        `Run \`tweakcc-fixed --apply\` once to populate the prompt-data cache for this version.`,
    );
  }
  return found;
}

/** Load the per-prompt legal-variable map from a `prompts-<version>.json` on disk. */
export function loadLegalMap(stringsFilePath: string): Map<string, Set<string>> {
  return buildLegalMap(JSON.parse(readFileSync(stringsFilePath, 'utf8')) as StringsFile);
}

/** Run the Orphan-variable check over the override dirs and return the `validator` string. */
export function runOrphanValidator(dirs: string[], stringsFilePath: string): string {
  return formatValidatorOutput(readOverrideFiles(dirs), loadLegalMap(stringsFilePath));
}
