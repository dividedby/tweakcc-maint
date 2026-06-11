/**
 * OrphanReportProducer — the PRODUCER half (#43) of the surviving-placeholder / Orphan
 * report (CONTEXT.md → "Orphan report"). Relocated here from a draft tweakcc-fixed PR
 * (tf#8): skrabe declined the tool into the leaf (same reasoning as the golden snapshot in
 * tf#6 — it duplicates gates he already runs and is "a need on your side of the fence"),
 * and redirected it to live in this maint repo against his PUBLISHED prompts JSONs. This is
 * that relocation. Its output is the JSON contract the consumer-half parser
 * ({@link parseOrphanReport} in `orphan-report.ts`, #31) already consumes:
 *   `{ version, prompts: { <promptId>: [VAR, ...] } }`.
 *
 * Where the Mis-bind audit (`auditMisbinds.mjs`) checks placeholders the override DOES bind
 * (right name, wrong slot — ADR 0007 §4, the leaf owns it), this enumerates the
 * complementary class: placeholders that bind to NOTHING — a `${...}` whose leading
 * identifier is not a known slot for its prompt, so it survives `--apply` as a raw
 * `${NAME}` into a live template literal and fires `ReferenceError: NAME is not defined` at
 * boot (an Orphan variable). The audit deliberately skips this set ("other gates cover it");
 * this is that other gate, as STATIC structured data so the gate maps each finding to its
 * ReferenceError signature without a live install (Boot-verify stays the runtime authority,
 * ADR 0005).
 *
 * Two things distinguish detection from a bare-`${NAME}` scan:
 *   1. It covers the EXPRESSION class, not just bare names. The crashing forms are
 *      interpolation expressions — `${!IS_TRUTHY_FN(PROCESS_OBJECT.env.X)&&…}`,
 *      `${ATTACHMENT_OBJECT.blockingError.command}`, `${ADDITIONAL_DREAM_GUIDANCE_FN()}`.
 *      The leading identifier of the expression is the one that must resolve in runtime
 *      scope, so that is what we extract — exactly the `IS_TRUTHY_FN` class that boot-crashed
 *      the lobotomized adoption on 2.1.168/.169 (#26/#58) and that the audit's flush-against-
 *      `${` regex misses entirely.
 *   2. Escaped `\${…}` is inert (the patcher emits it as a literal dollar-brace), so it is
 *      never an orphan and is not flagged (ADR/escape-mechanics rule).
 *
 * Known-slot set, per prompt: the prompt's own identifierMap values (the slots the patcher
 * can actually fill for that prompt). For an override whose id has no counterpart in the
 * published prompts JSON (a tweakcc-own prompt), fall back to the UNION of identifierMap
 * values across every prompt — the conservative floor that still flags names that are a slot
 * NOWHERE. No ALL_CAPS grammar guessing: the slot vocabulary comes only from the JSON.
 *
 * Adaptation vs the leaf draft: the leaf version defaulted its paths to the leaf's in-tree
 * `data/prompts/` + showtime override layout. Here the producer takes the already-resolved
 * published `prompts-<version>.json` data and override files as INPUTS (the same ones
 * `resolveStringsFilePath` / `readOverrideFiles` hand the authoring-drift pre-check), so it
 * runs against skrabe's published JSONs rather than any leaf in-tree file. TS+ESM via tsx, no
 * build step (ADR 0004): the wiring imports these helpers directly instead of shelling a
 * standalone `.mjs`.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';

/** The relevant slice of a published `prompts-<version>.json`. */
export interface PromptsData {
  version?: string;
  prompts: Array<{ id?: string; identifierMap?: Record<string, string> }>;
}

/** The known-slot model derived from a prompts JSON: the union and the per-id slot sets. */
export interface KnownSlots {
  /** Every identifierMap value across all prompts — the conservative floor. */
  union: Set<string>;
  /** Per-prompt-id slot sets (the precise, authoritative set when the id is in the JSON). */
  byId: Map<string, Set<string>>;
}

/** The `--report-orphans` JSON contract this producer emits (consumed by parseOrphanReport). */
export interface OrphanReportPayload {
  version?: string;
  prompts: Record<string, string[]>;
}

/** One override file, content already read (mirrors orphan-validator's OverrideFile shape). */
export interface OverrideFile {
  /** Path to the override; its basename (minus `.md`) is the prompt id used for matching. */
  path: string;
  /** Full file content, including any leading `<!-- … -->` frontmatter block. */
  content: string;
}

// The leading `<!-- … -->` HTML-comment frontmatter block lobotomized overrides use; the
// surviving-placeholder scan runs against the body after it (a `${…}` in frontmatter prose
// is not interpolated into the binary).
const FRONTMATTER = /^\s*<!--[\s\S]*?-->\n?/;

// A markdown fenced code block: an opening fence line of ``` or ~~~ (3+ of the char, with an
// optional info string), its body, and a matching-or-longer closing fence of the same char.
// `${...}` inside such a fence is DOCUMENTATION — it injects into a double-quoted JS string in
// the patched cli.js, where `${...}` is inert (JS interpolates only in backtick template
// literals), so it never binds a slot and never ReferenceErrors (boot-verify passes — the
// runtime authority, ADR 0005). The 'm' flag anchors fences to line starts; '[^\S\n]*' allows
// the leading indentation CommonMark permits (up to 3 spaces, kept loose here).
const FENCED_BLOCK = /^[^\S\n]*(`{3,}|~{3,})[^\n]*\n[\s\S]*?^[^\S\n]*\1[^\S\n]*$/gm;

/**
 * Blank the interior of every fenced code block, preserving the source length/offsets so the
 * escape lookbehind in {@link extractLeadingIdentifiers} stays correct. Replacing each fenced
 * span with same-length whitespace removes its `${...}` from the scan without shifting any
 * surviving offset.
 *
 * NB this fence-awareness fix is scoped to the fence case (the confirmed CC 2.1.172 false
 * orphans). The deeper latent gap — that `${...}` is also inert in any quote-delimited (vs
 * backtick) string in the patched binary, fenced or not — is NOT handled here; that broader
 * quote-vs-backtick delimiter mechanic stays a separate, unaddressed concern.
 */
function blankFencedBlocks(body: string): string {
  return body.replace(FENCED_BLOCK, (block) => block.replace(/[^\n]/g, ' '));
}

/**
 * Extract the leading identifier of every unescaped `${...}` interpolation in a body. The
 * leading identifier is the first `[A-Z][A-Z0-9_]+` token immediately inside the braces,
 * after any leading unary operators / whitespace (`!`, `~`, `+`, `-`, spaces) but before any
 * `(`, `.`, etc. — the name that must resolve in runtime scope for the expression to
 * evaluate. Returned in source order (the caller dedupes). Escaped `\${...}` is skipped via
 * the lookbehind; a lowercase-led interpolation (legitimate inline JS, never a slot) is
 * ignored. `${...}` inside a markdown fenced code block is documentation, inert in the patched
 * binary, and skipped (see {@link blankFencedBlocks}).
 */
export function extractLeadingIdentifiers(body: string): string[] {
  body = blankFencedBlocks(body);
  const out: string[] = [];
  const open = /(?<!\\)\$\{/g;
  let m: RegExpExecArray | null;
  while ((m = open.exec(body)) !== null) {
    const rest = body.slice(m.index + 2);
    const id = rest.match(/^[\s!~+\-]*([A-Z][A-Z0-9_]+)/);
    if (id) out.push(id[1]!);
  }
  return out;
}

/**
 * Build the known-slot model from a published prompts JSON: the union of every prompt's
 * identifierMap values, plus a per-id map of each prompt's own slots.
 */
export function buildKnownSlots(promptsData: PromptsData): KnownSlots {
  const union = new Set<string>();
  const byId = new Map<string, Set<string>>();
  for (const p of promptsData.prompts ?? []) {
    const slots = new Set(Object.values(p.identifierMap ?? {}));
    if (p.id !== undefined) byId.set(p.id, slots);
    for (const v of slots) union.add(v);
  }
  return { union, byId };
}

/**
 * The surviving-placeholder set for one override body, given its prompt id and the
 * known-slot model. Per-prompt slots are authoritative when the id is in the JSON; otherwise
 * fall back to the union. A leading identifier not in that set is a surviving placeholder (a
 * ReferenceError at runtime). Deduped, in source order.
 */
export function survivingPlaceholders(body: string, id: string, known: KnownSlots): string[] {
  const slots = known.byId.get(id) ?? known.union;
  const seen = new Set<string>();
  const orphans: string[] = [];
  for (const name of extractLeadingIdentifiers(body)) {
    if (slots.has(name) || seen.has(name)) continue;
    seen.add(name);
    orphans.push(name);
  }
  return orphans;
}

/** The prompt id an override matches: its filename without the `.md` extension. */
function promptIdOf(path: string): string {
  return basename(path).replace(/\.md$/, '');
}

/**
 * Build the Orphan report payload over a set of override files against a published prompts
 * JSON's known-slot model. `inline-*` overrides remap minified idents positionally, not by
 * name (the inline-blob surface — CONTEXT.md "Three override surfaces"), so the identifierMap
 * model does not apply to them and they are skipped (same carve-out as the Mis-bind audit).
 * A prompt with no surviving placeholders is omitted, so an empty `prompts` means a clean
 * report (the distinct "supported, zero orphans" state #31 keys on).
 */
export function buildOrphanReport(
  files: OverrideFile[],
  promptsData: PromptsData,
): OrphanReportPayload {
  const known = buildKnownSlots(promptsData);
  const prompts: Record<string, string[]> = {};
  for (const file of files) {
    const id = promptIdOf(file.path);
    if (id.startsWith('inline-')) continue;
    const body = file.content.replace(FRONTMATTER, '');
    const orphans = survivingPlaceholders(body, id, known);
    if (orphans.length > 0) prompts[id] = orphans;
  }
  return { version: promptsData.version, prompts };
}

// ── fs / JSON wrappers (mirrors orphan-validator's wrappers; HITL/gate-exercised) ──────────

/** Read every `*.md` override under the given directories (non-recursive). */
function readOverrideFiles(dirs: string[]): OverrideFile[] {
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

/** Load a published `prompts-<version>.json` from disk into {@link PromptsData}. */
function loadPromptsData(promptsJsonPath: string): PromptsData {
  return JSON.parse(readFileSync(promptsJsonPath, 'utf8')) as PromptsData;
}

/**
 * Produce the Orphan report (as the `--report-orphans` JSON string) for a set of override
 * dirs against a published prompts JSON on disk. This is the producer's top-level entry; the
 * gate feeds the returned string straight into the consumer parser ({@link parseOrphanReport})
 * as the `orphanReport` signal.
 */
export function runOrphanReport(dirs: string[], promptsJsonPath: string): string {
  const payload = buildOrphanReport(readOverrideFiles(dirs), loadPromptsData(promptsJsonPath));
  return JSON.stringify(payload);
}
