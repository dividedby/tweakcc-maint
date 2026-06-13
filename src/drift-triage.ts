/**
 * drift-triage — Phase 3 of the Full adoption path (/adopt slice 2, #243).
 *
 * Classifies named-prompt override files as empty-stub (skip) or active (needs
 * drift check against the new pristine prompt text). Only the named-prompt
 * surface (`system-prompts-*` dirs) is identifierMap-checked here; inline-blob
 * and system-reminders surfaces are enumerated but not checked (CONTEXT.md →
 * "Three override surfaces").
 *
 * Pure core (`classifyOverride` / `triagePromptIds`) is unit-testable with
 * in-memory fakes; the real fs reads live in the transport layer.
 */

/** A raw named-prompt override file, content already read. */
export interface NamedOverrideFile {
  /** The prompt id (basename of the file without `.md`). */
  promptId: string;
  /** The model-set directory name (e.g. `system-prompts-fable-5`). */
  modelSet: string;
  /** Full file content — frontmatter comment + body. */
  content: string;
}

/** Whether the override body (non-frontmatter content) is substantive. */
export type OverrideClass = 'empty-stub' | 'active';

/** Classification result for one (promptId, modelSet) pair. */
export interface OverrideClassification {
  promptId: string;
  modelSet: string;
  class: OverrideClass;
  /**
   * When class is 'active': true iff the override content differs from the
   * pristine new-version prompt text (drift detected).
   */
  drifted?: boolean;
}

/**
 * The body text of a named-prompt override file: everything after the
 * frontmatter comment block (`<!-- … -->`). Returns the trimmed remainder, or
 * the whole content if no frontmatter block is present.
 */
export function extractOverrideBody(content: string): string {
  // Frontmatter is a leading `<!-- ... -->` block.
  const match = /^<!--[\s\S]*?-->\s*/m.exec(content);
  if (match === null) return content.trim();
  return content.slice(match.index + match[0].length).trim();
}

/**
 * Classify one override file as empty-stub or active. PURE — no I/O.
 *
 * An override is an empty-stub when its body (non-frontmatter content) is
 * blank after trimming. Active overrides are the ones the drift check applies
 * to.
 */
export function classifyOverride(file: NamedOverrideFile): OverrideClass {
  const body = extractOverrideBody(file.content);
  return body.length === 0 ? 'empty-stub' : 'active';
}

/** The pristine prompt text for one prompt id in the new version. */
export interface PristinePrompt {
  promptId: string;
  /** Concatenated text of all prompt pieces, as the extractor emits them. */
  text: string;
}

/** Triage result for one changed/new prompt id across all three model sets. */
export interface PromptTriage {
  promptId: string;
  /** Per-model-set classification. Empty when no override exists for this id in that set. */
  perModelSet: OverrideClassification[];
  /** True iff at least one model-set override is active AND drifted. */
  hasActiveDrift: boolean;
}

/**
 * Triage a set of changed/new prompt ids across all named-prompt override
 * files. For each prompt id:
 *   - classify each override file as empty-stub or active;
 *   - for active overrides, compare the override body to the new pristine text
 *     to determine drift;
 *   - emit `hasActiveDrift=true` when at least one active override has drifted.
 *
 * PURE — no I/O. The caller supplies override files and pristine prompts.
 */
export function triagePromptIds(
  promptIds: readonly string[],
  overrideFiles: readonly NamedOverrideFile[],
  pristinePrompts: readonly PristinePrompt[],
): PromptTriage[] {
  const pristineMap = new Map(pristinePrompts.map((p) => [p.promptId, p.text]));

  return promptIds.map((promptId) => {
    const files = overrideFiles.filter((f) => f.promptId === promptId);
    const pristine = pristineMap.get(promptId) ?? '';

    const perModelSet: OverrideClassification[] = files.map((file) => {
      const cls = classifyOverride(file);
      if (cls === 'empty-stub') {
        return { promptId, modelSet: file.modelSet, class: 'empty-stub' };
      }
      const body = extractOverrideBody(file.content);
      const drifted = body !== pristine.trim();
      return { promptId, modelSet: file.modelSet, class: 'active', drifted };
    });

    const hasActiveDrift = perModelSet.some((c) => c.class === 'active' && c.drifted === true);

    return { promptId, perModelSet, hasActiveDrift };
  });
}

/** Summary counts for the Phase 3 triage report. */
export interface TriageSummary {
  /** Total changed/new prompt ids evaluated. */
  total: number;
  /** Ids with at least one active+drifted override across any model set. */
  activeDrifted: number;
  /** Ids where all overrides are empty-stubs (or no overrides exist). */
  stubOnly: number;
}

/** Compute triage summary counts from a list of PromptTriage results. PURE. */
export function summarizeTriage(results: readonly PromptTriage[]): TriageSummary {
  let activeDrifted = 0;
  let stubOnly = 0;

  for (const r of results) {
    if (r.hasActiveDrift) {
      activeDrifted++;
    } else if (r.perModelSet.every((c) => c.class === 'empty-stub') || r.perModelSet.length === 0) {
      stubOnly++;
    }
  }

  return { total: results.length, activeDrifted, stubOnly };
}
