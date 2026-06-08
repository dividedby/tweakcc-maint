/**
 * OrphanValidator — the **authoring-drift pre-check** for RealAdoptionEnvironment
 * (PRD #20, story 5; issues #22, #27, #30; design in
 * docs/adr/0005-orphan-detection-belongs-to-the-patcher.md).
 *
 * This is NOT the authoritative Orphan-variable detector. Per ADR 0005 and the
 * CONTEXT.md `Orphan variable` term, runtime-orphan authority belongs to:
 *   - **Boot-verify** — the authoritative runtime detector; it sees the patched
 *     binary's actual runtime scope and FAILs on the runtime-only class (e.g.
 *     `IS_TRUTHY_FN`) that no static check can see, and
 *   - the **patcher's apply-time report** (future `--report-orphans` in
 *     tweakcc-fixed, consumed by the Integration gate) — the authoritative static
 *     report, because the fork owns the apply-time resolution that emits the
 *     surviving `${...}` set.
 *
 * What THIS check does, and only this: a cheap **authoring-drift** cross-reference.
 * It flags the narrow case of a variable a lobotomized override DECLARES (its
 * frontmatter `variables:` list — the backing it was authored against) that is ABSENT
 * from the target CC version's pristine `identifierMap` — i.e. a backing name upstream
 * renamed or inlined since the override was authored. It is matched per prompt by id
 * against tweakcc-fixed's `prompts-<version>.json` (the `identifierMap` source of truth).
 * It structurally CANNOT see runtime-scope orphans — that is Boot-verify's altitude.
 *
 * An earlier draft scanned override BODIES for `${VAR}` and over-reported wildly (every
 * `${…}` in prose/quoted code counted) — the declared-vars-vs-identifierMap cross-
 * reference is the correct, low-noise authoring-drift check.
 *
 * Bounds, documented for the HITL reviewer: synthetic POSITIONAL placeholder names
 * (`…_VAR_<n>`) are matched by index, not by name, so they never appear in
 * `identifierMap`'s (named) values — they are excluded rather than flagged. An override
 * matched to no prompt in the target version is skipped (cannot be validated here).
 *
 * It still produces the `validator` string of a {@link CapturedSignals} — one
 * `ReferenceError: <VAR> is not defined` line per finding, the exact signature
 * FourZerosVerdict keys on — so the verdict layer is unchanged.
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

/**
 * One authoring-drift finding: a declared backing variable absent from the target
 * version's identifierMap (renamed/inlined upstream). Not the authoritative orphan set —
 * see the module header (Boot-verify + the patcher report own that).
 */
export interface OrphanFinding {
  /** The override file the drift was found in. */
  file: string;
  /** The declared-but-unbacked variable name. */
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
 * Resolve the fork's tweakcc config directory, mirroring tweakcc-fixed's `getConfigDir`
 * (src/config.ts) so the validator reads from the same cache the fork writes to. Order:
 * `$TWEAKCC_CONFIG_DIR` → existing `~/.tweakcc` → `$XDG_CONFIG_HOME/tweakcc` → `~/.claude/tweakcc`
 * → `~/.tweakcc` (default). We mirror it (not import it) deliberately: deep-importing the
 * leaf's `export const` is the brittle coupling ADR 0005 rejects.
 */
function forkConfigDir(): string {
  const override = process.env.TWEAKCC_CONFIG_DIR?.trim();
  if (override !== undefined && override !== '') {
    return override.startsWith('~') ? join(homedir(), override.slice(1)) : override;
  }
  const defaultDir = join(homedir(), '.tweakcc');
  if (existsSync(defaultDir)) return defaultDir;
  const xdg = process.env.XDG_CONFIG_HOME?.trim();
  if (xdg !== undefined && xdg !== '') return join(xdg, 'tweakcc');
  const claudeDir = join(homedir(), '.claude', 'tweakcc');
  if (existsSync(claudeDir)) return claudeDir;
  return defaultDir;
}

/**
 * Locate the `prompts-<version>.json` the FORK would read, deferring to the patcher's
 * documented resolution order rather than the validator's own (ADR 0005): repo-local
 * `data/prompts/` wins (a fork's locally-extracted, same-day JSON is the authoritative
 * one), then the fork's config-dir cache populated by a prior `--apply`. The fork's third
 * tier — the network fetch — is the fork's alone; this offline pre-check does not fetch.
 * Reading from the same on-disk candidates the fork resolves keeps the pre-check from
 * disagreeing with the file the fork would actually apply. Throws with guidance if no
 * local file exists (the fork would fetch; the pre-check defers that to apply-time).
 */
export function resolveStringsFilePath(tweakccFixedDir: string, version: string): string {
  const candidates = [
    join(tweakccFixedDir, 'data', 'prompts', `prompts-${version}.json`),
    join(forkConfigDir(), 'prompt-data-cache', `prompts-${version}.json`),
  ];
  const found = candidates.find((p) => existsSync(p));
  if (found === undefined) {
    throw new Error(
      `OrphanValidator: no local prompts-${version}.json found (looked in ${candidates.join(', ')}). ` +
        `Run \`tweakcc-fixed --apply\` once to populate the prompt-data cache for this version ` +
        `(the fork would fetch it from the network at apply-time; this pre-check does not).`,
    );
  }
  return found;
}

/** Load the per-prompt legal-variable map from a `prompts-<version>.json` on disk. */
export function loadLegalMap(stringsFilePath: string): Map<string, Set<string>> {
  return buildLegalMap(JSON.parse(readFileSync(stringsFilePath, 'utf8')) as StringsFile);
}

/** Run the authoring-drift pre-check over the override dirs and return the `validator` string. */
export function runOrphanValidator(dirs: string[], stringsFilePath: string): string {
  return formatValidatorOutput(readOverrideFiles(dirs), loadLegalMap(stringsFilePath));
}
