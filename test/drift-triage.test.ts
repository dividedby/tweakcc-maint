/**
 * Unit tests for drift-triage (Phase 3 of the Full adoption path, #243).
 *
 * Verifies:
 *   - extractOverrideBody strips frontmatter correctly
 *   - classifyOverride distinguishes empty-stub from active
 *   - triagePromptIds correctly classifies and flags drift
 *   - summarizeTriage computes correct counts
 *
 * All-fake wiring: in-memory override files + pristine prompts — no fs, no gh.
 */

import { describe, it, expect } from 'vitest';
import {
  extractOverrideBody,
  classifyOverride,
  triagePromptIds,
  summarizeTriage,
  type NamedOverrideFile,
  type PristinePrompt,
} from '../src/drift-triage.js';

// ---------------------------------------------------------------------------
// extractOverrideBody
// ---------------------------------------------------------------------------

describe('extractOverrideBody', () => {
  it('strips a leading frontmatter block and returns the body', () => {
    const content = `<!--
name: 'My prompt'
ccVersion: 2.1.176
-->
Be terse. Do not hedge.`;
    expect(extractOverrideBody(content)).toBe('Be terse. Do not hedge.');
  });

  it('returns trimmed content unchanged when no frontmatter is present', () => {
    expect(extractOverrideBody('  Be terse.  ')).toBe('Be terse.');
  });

  it('returns empty string for an all-whitespace body after frontmatter', () => {
    const content = `<!--
name: 'Empty stub'
-->
   `;
    expect(extractOverrideBody(content)).toBe('');
  });

  it('handles frontmatter with no trailing newline gracefully', () => {
    const content = '<!--\nname: x\n-->Be terse.';
    expect(extractOverrideBody(content)).toBe('Be terse.');
  });
});

// ---------------------------------------------------------------------------
// classifyOverride
// ---------------------------------------------------------------------------

describe('classifyOverride', () => {
  function makeFile(content: string): NamedOverrideFile {
    return { promptId: 'test-id', modelSet: 'system-prompts-fable-5', content };
  }

  it('classifies a file with no body as empty-stub', () => {
    const file = makeFile('<!--\nname: x\n-->\n');
    expect(classifyOverride(file)).toBe('empty-stub');
  });

  it('classifies a file with only whitespace body as empty-stub', () => {
    const file = makeFile('<!--\nname: x\n-->\n   \n');
    expect(classifyOverride(file)).toBe('empty-stub');
  });

  it('classifies a file with substantive body as active', () => {
    const file = makeFile('<!--\nname: x\n-->\nDo not hedge.');
    expect(classifyOverride(file)).toBe('active');
  });

  it('classifies a file with no frontmatter but body as active', () => {
    const file = makeFile('Be terse and direct.');
    expect(classifyOverride(file)).toBe('active');
  });
});

// ---------------------------------------------------------------------------
// triagePromptIds
// ---------------------------------------------------------------------------

const MODEL_SETS = ['system-prompts-fable-5', 'system-prompts-opus-4-7', 'system-prompts-opus-4-8'];

function makeOverride(promptId: string, modelSet: string, body: string): NamedOverrideFile {
  return {
    promptId,
    modelSet,
    content: `<!--\nname: 'test'\nccVersion: 2.1.176\n-->\n${body}`,
  };
}

function makePristine(promptId: string, text: string): PristinePrompt {
  return { promptId, text };
}

describe('triagePromptIds', () => {
  it('returns one entry per prompt id', () => {
    const results = triagePromptIds(['id-a', 'id-b'], [], []);
    expect(results).toHaveLength(2);
    expect(results.map((r) => r.promptId)).toEqual(['id-a', 'id-b']);
  });

  it('sets hasActiveDrift=false when no override files exist for the id', () => {
    const results = triagePromptIds(['id-a'], [], [makePristine('id-a', 'pristine text')]);
    expect(results[0]!.hasActiveDrift).toBe(false);
    expect(results[0]!.perModelSet).toHaveLength(0);
  });

  it('classifies an empty-stub override and sets hasActiveDrift=false', () => {
    const overrides = [makeOverride('id-a', MODEL_SETS[0]!, '')];
    const results = triagePromptIds(['id-a'], overrides, [makePristine('id-a', 'pristine')]);
    const r = results[0]!;
    expect(r.perModelSet[0]!.class).toBe('empty-stub');
    expect(r.hasActiveDrift).toBe(false);
  });

  it('classifies an active override with matching pristine as active+not drifted', () => {
    const pristineText = 'Be terse and direct.';
    const overrides = [makeOverride('id-a', MODEL_SETS[0]!, pristineText)];
    const results = triagePromptIds(['id-a'], overrides, [makePristine('id-a', pristineText)]);
    const c = results[0]!.perModelSet[0]!;
    expect(c.class).toBe('active');
    expect(c.drifted).toBe(false);
    expect(results[0]!.hasActiveDrift).toBe(false);
  });

  it('classifies an active override that differs from pristine as active+drifted', () => {
    const overrides = [makeOverride('id-a', MODEL_SETS[0]!, 'Old override text.')];
    const results = triagePromptIds(
      ['id-a'],
      overrides,
      [makePristine('id-a', 'New pristine text that differs.')],
    );
    const c = results[0]!.perModelSet[0]!;
    expect(c.class).toBe('active');
    expect(c.drifted).toBe(true);
    expect(results[0]!.hasActiveDrift).toBe(true);
  });

  it('sets hasActiveDrift=true when any model-set override is drifted (others may be stubs)', () => {
    const overrides = [
      makeOverride('id-a', MODEL_SETS[0]!, ''),                  // empty-stub
      makeOverride('id-a', MODEL_SETS[1]!, 'Old text.'),          // active, drifted
    ];
    const results = triagePromptIds(
      ['id-a'],
      overrides,
      [makePristine('id-a', 'New text.')],
    );
    expect(results[0]!.hasActiveDrift).toBe(true);
  });

  it('handles a prompt id that has no pristine text (absent from new version)', () => {
    const overrides = [makeOverride('id-removed', MODEL_SETS[0]!, 'Some body.')];
    const results = triagePromptIds(['id-removed'], overrides, []);
    // Absent pristine → '' compared with 'Some body.' → drifted=true
    expect(results[0]!.perModelSet[0]!.drifted).toBe(true);
    expect(results[0]!.hasActiveDrift).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// summarizeTriage
// ---------------------------------------------------------------------------

describe('summarizeTriage', () => {
  it('reports zero counts for empty results', () => {
    const summary = summarizeTriage([]);
    expect(summary).toEqual({ total: 0, activeDrifted: 0, stubOnly: 0 });
  });

  it('increments activeDrifted when hasActiveDrift=true', () => {
    const results = [{ promptId: 'a', perModelSet: [], hasActiveDrift: true }];
    expect(summarizeTriage(results).activeDrifted).toBe(1);
  });

  it('increments stubOnly when all overrides are empty-stubs', () => {
    const results = [
      {
        promptId: 'b',
        perModelSet: [
          { promptId: 'b', modelSet: 'system-prompts-fable-5', class: 'empty-stub' as const },
        ],
        hasActiveDrift: false,
      },
    ];
    expect(summarizeTriage(results).stubOnly).toBe(1);
  });

  it('counts a prompt with no overrides in stubOnly', () => {
    const results = [{ promptId: 'c', perModelSet: [], hasActiveDrift: false }];
    expect(summarizeTriage(results).stubOnly).toBe(1);
  });

  it('reports correct total', () => {
    const results = [
      { promptId: 'a', perModelSet: [], hasActiveDrift: true },
      { promptId: 'b', perModelSet: [], hasActiveDrift: false },
      { promptId: 'c', perModelSet: [], hasActiveDrift: false },
    ];
    expect(summarizeTriage(results).total).toBe(3);
  });
});
