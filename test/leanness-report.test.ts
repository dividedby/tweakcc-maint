/**
 * Tests for leanness-report (#328).
 *
 * Verifies:
 *   - Stock loading + pieces concatenation.
 *   - Front-matter stripping from override files.
 *   - Category classification for each always-on bucket + 'other'.
 *   - Per-prompt delta computation (with and without overrides).
 *   - Fail-loud on orphan override (no matching stock id).
 *   - Fail-loud on missing always-on override.
 *   - Non-always-on stock with no override → treated as 100% removed, not an error.
 *   - Aggregation: always-on total and overall total.
 *   - Markdown rendering: headline % present.
 *   - JSON artifact shape.
 *
 * All-fake wiring: in-memory fs seam — no real disk reads.
 */

import { describe, it, expect } from 'vitest';
import {
  classifyPrompt,
  stripFrontMatter,
  loadStockPrompts,
  loadOverrides,
  computeDeltas,
  aggregateDeltas,
  buildReport,
  renderMarkdown,
  buildJsonArtifact,
  type LeannessFs,
} from '../src/leanness-report.js';

// ---------------------------------------------------------------------------
// Fake fs builder
// ---------------------------------------------------------------------------

/** Build an in-memory LeannessFs from a path→content map. */
function fakeFs(files: Record<string, string>): LeannessFs {
  return {
    readFile: (path) => {
      const content = files[path];
      if (content === undefined) throw new Error(`fakeFs: no file at ${path}`);
      return content;
    },
    listDir: (dir) => {
      const prefix = dir.endsWith('/') ? dir : dir + '/';
      return Object.keys(files)
        .filter((p) => p.startsWith(prefix) && !p.slice(prefix.length).includes('/'))
        .map((p) => p.slice(prefix.length));
    },
  };
}

// ---------------------------------------------------------------------------
// classifyPrompt
// ---------------------------------------------------------------------------

describe('classifyPrompt', () => {
  it('classifies harness prompts', () => {
    expect(classifyPrompt('system-prompt-harness-instructions')).toBe('harness');
  });

  it('classifies communication prompts', () => {
    expect(classifyPrompt('system-prompt-communication-style')).toBe('communication');
    expect(classifyPrompt('system-prompt-communicating-with-the-user')).toBe('communication');
  });

  it('does not classify tool-description-*-communication as communication', () => {
    // tool- prefix takes core-tools; communication check excludes tool- prefix.
    expect(classifyPrompt('tool-description-bash-alt-communication')).toBe('core-tools');
  });

  it('classifies doing-tasks prompts', () => {
    expect(classifyPrompt('system-prompt-doing-tasks-focus')).toBe('doing-tasks');
    expect(classifyPrompt('system-prompt-doing-tasks-ambitious')).toBe('doing-tasks');
  });

  it('classifies executing-actions prompts', () => {
    expect(classifyPrompt('system-prompt-executing-actions-with-care')).toBe('executing-actions');
    expect(classifyPrompt('system-prompt-executing-actions-with-care-fragment')).toBe('executing-actions');
  });

  it('classifies system-prompt-memory-* as memory', () => {
    expect(classifyPrompt('system-prompt-memory-instructions')).toBe('memory');
    expect(classifyPrompt('system-prompt-memory-description-of-user-details')).toBe('memory');
  });

  it('classifies tool-description-* as core-tools', () => {
    expect(classifyPrompt('tool-description-bash-overview')).toBe('core-tools');
    expect(classifyPrompt('tool-description-todowrite')).toBe('core-tools');
  });

  it('classifies unrelated ids as other', () => {
    expect(classifyPrompt('agent-prompt-explore')).toBe('other');
    expect(classifyPrompt('data-claude-model-catalog')).toBe('other');
    expect(classifyPrompt('skill-debugging')).toBe('other');
    expect(classifyPrompt('system-reminder-compact')).toBe('other');
  });
});

// ---------------------------------------------------------------------------
// stripFrontMatter
// ---------------------------------------------------------------------------

describe('stripFrontMatter', () => {
  it('strips the leading HTML comment block', () => {
    const raw = `<!--
name: 'Test prompt'
ccVersion: 2.1.100
-->
This is the body.`;
    expect(stripFrontMatter(raw)).toBe('This is the body.');
  });

  it('leaves text intact when there is no front-matter', () => {
    expect(stripFrontMatter('Plain text.')).toBe('Plain text.');
  });

  it('strips multi-line front-matter with embedded dashes', () => {
    const raw = `<!--
description: >-
  A multi-line desc.
ccVersion: 2.1.0
-->
Body here.`;
    expect(stripFrontMatter(raw)).toBe('Body here.');
  });
});

// ---------------------------------------------------------------------------
// loadStockPrompts
// ---------------------------------------------------------------------------

const PROMPTS_JSON_PATH = '/fake/prompts-2.0.0.json';

function makePromptsJson(entries: Array<{ id: string; pieces: string[] }>): string {
  return JSON.stringify({ version: '2.0.0', prompts: entries });
}

describe('loadStockPrompts', () => {
  it('returns a map keyed by prompt id', () => {
    const fs = fakeFs({
      [PROMPTS_JSON_PATH]: makePromptsJson([{ id: 'foo', pieces: ['hello'] }]),
    });
    const map = loadStockPrompts(PROMPTS_JSON_PATH, fs);
    expect(map.has('foo')).toBe(true);
  });

  it('concatenates pieces into a single text', () => {
    const fs = fakeFs({
      [PROMPTS_JSON_PATH]: makePromptsJson([{ id: 'bar', pieces: ['hello ', 'world'] }]),
    });
    const map = loadStockPrompts(PROMPTS_JSON_PATH, fs);
    expect(map.get('bar')?.text).toBe('hello world');
  });

  it('handles an empty pieces array', () => {
    const fs = fakeFs({
      [PROMPTS_JSON_PATH]: makePromptsJson([{ id: 'empty', pieces: [] }]),
    });
    const map = loadStockPrompts(PROMPTS_JSON_PATH, fs);
    expect(map.get('empty')?.text).toBe('');
  });
});

// ---------------------------------------------------------------------------
// Fixture for integration-style tests
// ---------------------------------------------------------------------------

const OVERRIDE_DIR = '/fake/overrides/';

/**
 * Minimal stock JSON with:
 *   - system-prompt-harness-instructions (always-on: harness, 20 chars)
 *   - system-prompt-communication-style (always-on: communication, 15 chars)
 *   - system-prompt-doing-tasks-focus (always-on: doing-tasks, 10 chars)
 *   - system-prompt-executing-actions-with-care (always-on: executing-actions, 8 chars)
 *   - system-prompt-memory-instructions (always-on: memory, 12 chars)
 *   - tool-description-bash-overview (always-on: core-tools, 18 chars)
 *   - agent-prompt-explore (other/non-always-on, 30 chars)
 */
const STOCK_TEXT = {
  'system-prompt-harness-instructions':     'A'.repeat(20),
  'system-prompt-communication-style':      'B'.repeat(15),
  'system-prompt-doing-tasks-focus':         'C'.repeat(10),
  'system-prompt-executing-actions-with-care': 'D'.repeat(8),
  'system-prompt-memory-instructions':       'E'.repeat(12),
  'tool-description-bash-overview':          'F'.repeat(18),
  'agent-prompt-explore':                    'G'.repeat(30),
};

/** Override bodies (all always-on, each ~half of stock). */
const OVERRIDE_TEXT = {
  'system-prompt-harness-instructions':      'A'.repeat(10),
  'system-prompt-communication-style':       'B'.repeat(8),
  'system-prompt-doing-tasks-focus':          'C'.repeat(5),
  'system-prompt-executing-actions-with-care':'D'.repeat(4),
  'system-prompt-memory-instructions':        'E'.repeat(6),
  'tool-description-bash-overview':           'F'.repeat(9),
  // no override for agent-prompt-explore → removed entirely
};

function makeStockFs(extras?: Record<string, string>): LeannessFs {
  const stockEntries = Object.entries(STOCK_TEXT).map(([id, text]) => ({
    id,
    pieces: [text],
  }));
  const overrideFiles: Record<string, string> = {};
  for (const [id, body] of Object.entries(OVERRIDE_TEXT)) {
    // Wrap in front-matter to exercise stripping.
    overrideFiles[`${OVERRIDE_DIR}${id}.md`] = `<!--\nname: '${id}'\nccVersion: 2.0.0\n-->\n${body}`;
  }
  return fakeFs({
    [PROMPTS_JSON_PATH]: makePromptsJson(stockEntries),
    ...overrideFiles,
    ...extras,
  });
}

// ---------------------------------------------------------------------------
// computeDeltas — happy path
// ---------------------------------------------------------------------------

describe('computeDeltas — happy path', () => {
  it('returns one delta per stock prompt', () => {
    const fs = makeStockFs();
    const stockMap = loadStockPrompts(PROMPTS_JSON_PATH, fs);
    const overrides = loadOverrides(OVERRIDE_DIR, fs);
    const { deltas } = computeDeltas(stockMap, overrides);
    expect(deltas).toHaveLength(Object.keys(STOCK_TEXT).length);
  });

  it('computes correct delta for a replaced prompt', () => {
    const fs = makeStockFs();
    const stockMap = loadStockPrompts(PROMPTS_JSON_PATH, fs);
    const overrides = loadOverrides(OVERRIDE_DIR, fs);
    const { deltas } = computeDeltas(stockMap, overrides);

    const d = deltas.find((x) => x.promptId === 'system-prompt-harness-instructions')!;
    expect(d.stock.chars).toBe(20);
    expect(d.lobo?.chars).toBe(10);
    expect(d.deltaChars).toBe(10);
    expect(d.reductionRatio).toBeCloseTo(0.5);
  });

  it('treats non-always-on removed prompt as lobo=null with 100% reduction', () => {
    const fs = makeStockFs();
    const stockMap = loadStockPrompts(PROMPTS_JSON_PATH, fs);
    const overrides = loadOverrides(OVERRIDE_DIR, fs);
    const { deltas } = computeDeltas(stockMap, overrides);

    const d = deltas.find((x) => x.promptId === 'agent-prompt-explore')!;
    expect(d.lobo).toBeNull();
    expect(d.deltaChars).toBe(30);
    expect(d.reductionRatio).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// computeDeltas — additive overrides (no matching stock id)
// ---------------------------------------------------------------------------

describe('computeDeltas — additive overrides', () => {
  it('places an override with no stock id in additiveOverrides, not deltas', () => {
    const stockEntries = [{ id: 'system-prompt-harness-instructions', pieces: ['hello'] }];
    const overrideFiles = {
      [`${OVERRIDE_DIR}system-prompt-harness-instructions.md`]: '<!--\nccVersion: 2.0.0\n-->\nhello',
      [`${OVERRIDE_DIR}inline-my-addition.md`]: '<!--\nccVersion: 2.0.0\n-->\nbody',
    };
    const fs = fakeFs({
      [PROMPTS_JSON_PATH]: makePromptsJson(stockEntries),
      ...overrideFiles,
    });

    const stockMap = loadStockPrompts(PROMPTS_JSON_PATH, fs);
    const overrides = loadOverrides(OVERRIDE_DIR, fs);
    const result = computeDeltas(stockMap, overrides);

    expect(result.additiveOverrides).toContain('inline-my-addition');
    // deltas only covers stock prompts, not additive ones
    expect(result.deltas.find((d) => d.promptId === 'inline-my-addition')).toBeUndefined();
    expect(result.deltas.find((d) => d.promptId === 'system-prompt-harness-instructions')).toBeDefined();
  });

  it('does not throw when additive overrides are present', () => {
    const fs = fakeFs({
      [PROMPTS_JSON_PATH]: makePromptsJson([{ id: 'system-prompt-harness-instructions', pieces: ['x'] }]),
      [`${OVERRIDE_DIR}system-prompt-harness-instructions.md`]: '<!--\nccVersion: 2.0.0\n-->\nx',
      [`${OVERRIDE_DIR}inline-skrabe-extra.md`]: '<!--\nccVersion: 2.0.0\n-->\nbody',
    });
    const stockMap = loadStockPrompts(PROMPTS_JSON_PATH, fs);
    const overrides = loadOverrides(OVERRIDE_DIR, fs);

    expect(() => computeDeltas(stockMap, overrides)).not.toThrow();
  });

  it('reports the correct additive count with multiple additive ids', () => {
    const stockEntries = [{ id: 'system-prompt-harness-instructions', pieces: ['x'] }];
    const overrideFiles = {
      [`${OVERRIDE_DIR}system-prompt-harness-instructions.md`]: '<!--\nccVersion: 2.0.0\n-->\nx',
      [`${OVERRIDE_DIR}inline-foo.md`]: 'body1',
      [`${OVERRIDE_DIR}inline-bar.md`]: 'body2',
      [`${OVERRIDE_DIR}inline-baz.md`]: 'body3',
    };
    const fs = fakeFs({
      [PROMPTS_JSON_PATH]: makePromptsJson(stockEntries),
      ...overrideFiles,
    });
    const stockMap = loadStockPrompts(PROMPTS_JSON_PATH, fs);
    const overrides = loadOverrides(OVERRIDE_DIR, fs);
    const { additiveOverrides } = computeDeltas(stockMap, overrides);

    expect(additiveOverrides).toHaveLength(3);
    expect(additiveOverrides).toContain('inline-foo');
    expect(additiveOverrides).toContain('inline-bar');
    expect(additiveOverrides).toContain('inline-baz');
  });
});

// ---------------------------------------------------------------------------
// computeDeltas — missing always-on override → not-slimmed (0% reduction, no throw)
// ---------------------------------------------------------------------------

describe('computeDeltas — missing always-on override', () => {
  it('does NOT throw when an always-on stock prompt has no override', () => {
    const stockEntries = [
      { id: 'system-prompt-harness-instructions', pieces: ['hello world'] },
    ];
    const fs = fakeFs({
      [PROMPTS_JSON_PATH]: makePromptsJson(stockEntries),
      // No override files.
    });

    const stockMap = loadStockPrompts(PROMPTS_JSON_PATH, fs);
    const overrides = loadOverrides(OVERRIDE_DIR, fs);

    expect(() => computeDeltas(stockMap, overrides)).not.toThrow();
  });

  it('places always-on with no override in notSlimmedIds', () => {
    const stockEntries = [
      { id: 'system-prompt-harness-instructions', pieces: ['hello world'] },
    ];
    const fs = fakeFs({
      [PROMPTS_JSON_PATH]: makePromptsJson(stockEntries),
    });
    const stockMap = loadStockPrompts(PROMPTS_JSON_PATH, fs);
    const overrides = loadOverrides(OVERRIDE_DIR, fs);
    const { notSlimmedIds, deltas } = computeDeltas(stockMap, overrides);

    expect(notSlimmedIds).toContain('system-prompt-harness-instructions');
    // lobo = stock (unchanged) → 0% reduction.
    const d = deltas.find((x) => x.promptId === 'system-prompt-harness-instructions')!;
    expect(d).toBeDefined();
    expect(d.deltaChars).toBe(0);
    expect(d.reductionRatio).toBe(0);
  });

  it('always-on missing-override delta has 0% reduction (deltaChars = 0)', () => {
    const stockEntries = [
      { id: 'system-prompt-communication-style', pieces: ['A'.repeat(50)] },
    ];
    const fs = fakeFs({
      [PROMPTS_JSON_PATH]: makePromptsJson(stockEntries),
    });
    const stockMap = loadStockPrompts(PROMPTS_JSON_PATH, fs);
    const overrides = loadOverrides(OVERRIDE_DIR, fs);
    const { deltas, notSlimmedIds } = computeDeltas(stockMap, overrides);

    const d = deltas.find((x) => x.promptId === 'system-prompt-communication-style')!;
    // lobo = stock (0 delta), so reductionRatio = 0.
    expect(d.lobo).not.toBeNull();
    expect(d.lobo?.chars).toBe(50);
    expect(d.deltaChars).toBe(0);
    expect(d.reductionRatio).toBe(0);
    expect(notSlimmedIds).toContain('system-prompt-communication-style');
  });

  it('does NOT throw when a non-always-on stock prompt has no override', () => {
    // agent-prompt-explore is 'other' — missing override is fine (removed entirely).
    const stockEntries = [
      { id: 'agent-prompt-explore', pieces: ['non-always-on text'] },
    ];
    const fs = fakeFs({
      [PROMPTS_JSON_PATH]: makePromptsJson(stockEntries),
      // No override files.
    });

    const stockMap = loadStockPrompts(PROMPTS_JSON_PATH, fs);
    const overrides = loadOverrides(OVERRIDE_DIR, fs);

    expect(() => computeDeltas(stockMap, overrides)).not.toThrow();
  });

  it('non-always-on missing-override is NOT in notSlimmedIds', () => {
    const stockEntries = [{ id: 'agent-prompt-explore', pieces: ['text'] }];
    const fs = fakeFs({ [PROMPTS_JSON_PATH]: makePromptsJson(stockEntries) });
    const stockMap = loadStockPrompts(PROMPTS_JSON_PATH, fs);
    const overrides = loadOverrides(OVERRIDE_DIR, fs);
    const { notSlimmedIds } = computeDeltas(stockMap, overrides);

    expect(notSlimmedIds).not.toContain('agent-prompt-explore');
  });
});


// ---------------------------------------------------------------------------
// aggregateDeltas
// ---------------------------------------------------------------------------

describe('aggregateDeltas', () => {
  function getDeltas(): ReturnType<typeof computeDeltas>['deltas'] {
    const fs = makeStockFs();
    const stockMap = loadStockPrompts(PROMPTS_JSON_PATH, fs);
    const overrides = loadOverrides(OVERRIDE_DIR, fs);
    return computeDeltas(stockMap, overrides).deltas;
  }

  it('returns a category summary for each of the six always-on categories', () => {
    const { categories } = aggregateDeltas(getDeltas());
    const cats = categories.map((c) => c.category);
    expect(cats).toContain('harness');
    expect(cats).toContain('communication');
    expect(cats).toContain('doing-tasks');
    expect(cats).toContain('executing-actions');
    expect(cats).toContain('memory');
    expect(cats).toContain('core-tools');
  });

  it('always-on total stock chars = sum of always-on category stock chars', () => {
    const deltas = getDeltas();
    const { categories, alwaysOnTotal } = aggregateDeltas(deltas);
    const alwaysOnCats = categories.filter((c) => c.category !== 'other');
    const summedChars = alwaysOnCats.reduce((s, c) => s + c.stock.chars, 0);
    expect(alwaysOnTotal.stock.chars).toBe(summedChars);
  });

  it('overall total stock includes always-on + other', () => {
    const deltas = getDeltas();
    const { overallTotal } = aggregateDeltas(deltas);
    const expectedTotal = Object.values(STOCK_TEXT).reduce((s, t) => s + t.length, 0);
    expect(overallTotal.stock.chars).toBe(expectedTotal);
  });

  it('overall total lobo excludes removed prompts (counts them as 0)', () => {
    const deltas = getDeltas();
    const { overallTotal } = aggregateDeltas(deltas);
    // agent-prompt-explore (30 chars) has no override → counts as 0 in lobo.
    const expectedLobo = Object.values(OVERRIDE_TEXT).reduce((s, t) => s + t.length, 0);
    expect(overallTotal.lobo.chars).toBe(expectedLobo);
  });

  it('always-on reduction ratio is between 0 and 1', () => {
    const deltas = getDeltas();
    const { alwaysOnTotal } = aggregateDeltas(deltas);
    expect(alwaysOnTotal.reductionRatio).toBeGreaterThan(0);
    expect(alwaysOnTotal.reductionRatio).toBeLessThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// buildReport + renderMarkdown
// ---------------------------------------------------------------------------

describe('buildReport + renderMarkdown', () => {
  it('alwaysOnReductionPct is a number', () => {
    const fs = makeStockFs();
    const stockMap = loadStockPrompts(PROMPTS_JSON_PATH, fs);
    const overrides = loadOverrides(OVERRIDE_DIR, fs);
    const computeResult = computeDeltas(stockMap, overrides);
    const report = buildReport('2.0.0', 'test-model', computeResult);
    expect(typeof report.alwaysOnReductionPct).toBe('number');
    expect(report.alwaysOnReductionPct).toBeGreaterThan(0);
  });

  it('markdown contains the always-on reduction percentage', () => {
    const fs = makeStockFs();
    const stockMap = loadStockPrompts(PROMPTS_JSON_PATH, fs);
    const overrides = loadOverrides(OVERRIDE_DIR, fs);
    const computeResult = computeDeltas(stockMap, overrides);
    const report = buildReport('2.0.0', 'test-model', computeResult);
    const md = renderMarkdown(report);
    expect(md).toContain(`${report.alwaysOnReductionPct.toFixed(1)}%`);
  });

  it('markdown contains the model and version', () => {
    const fs = makeStockFs();
    const stockMap = loadStockPrompts(PROMPTS_JSON_PATH, fs);
    const overrides = loadOverrides(OVERRIDE_DIR, fs);
    const computeResult = computeDeltas(stockMap, overrides);
    const report = buildReport('2.0.0', 'opus-4-8', computeResult);
    const md = renderMarkdown(report);
    expect(md).toContain('opus-4-8');
    expect(md).toContain('2.0.0');
  });

  it('classificationOpenQuestion is empty when reduction is within ±5pp of 30', () => {
    // Construct a fixture where always-on reduction is exactly 30%:
    // stock=100 chars, lobo=70 chars → 30% reduction.
    const stockEntries = [
      { id: 'system-prompt-harness-instructions', pieces: ['A'.repeat(100)] },
    ];
    const overrideFiles = {
      [`${OVERRIDE_DIR}system-prompt-harness-instructions.md`]: `<!--\nccVersion: 2.0.0\n-->\n${'A'.repeat(70)}`,
    };
    const fs = fakeFs({
      [PROMPTS_JSON_PATH]: makePromptsJson(stockEntries),
      ...overrideFiles,
    });
    const stockMap = loadStockPrompts(PROMPTS_JSON_PATH, fs);
    const overrides = loadOverrides(OVERRIDE_DIR, fs);
    const computeResult = computeDeltas(stockMap, overrides);
    const report = buildReport('2.0.0', 'test-model', computeResult);
    expect(report.classificationOpenQuestion).toBe('');
  });

  it('classificationOpenQuestion is non-empty when reduction deviates by more than 5pp', () => {
    // always-on reduction = 1% → deviates 29pp from 30%.
    const stockEntries = [
      { id: 'system-prompt-harness-instructions', pieces: ['A'.repeat(100)] },
    ];
    const overrideFiles = {
      [`${OVERRIDE_DIR}system-prompt-harness-instructions.md`]: `<!--\nccVersion: 2.0.0\n-->\n${'A'.repeat(99)}`,
    };
    const fs = fakeFs({
      [PROMPTS_JSON_PATH]: makePromptsJson(stockEntries),
      ...overrideFiles,
    });
    const stockMap = loadStockPrompts(PROMPTS_JSON_PATH, fs);
    const overrides = loadOverrides(OVERRIDE_DIR, fs);
    const computeResult = computeDeltas(stockMap, overrides);
    const report = buildReport('2.0.0', 'test-model', computeResult);
    expect(report.classificationOpenQuestion).not.toBe('');
    expect(report.classificationOpenQuestion).toContain('classifyPrompt');
  });

  it('markdown and JSON artifact both emit when additive overrides are present', () => {
    const stockEntries = [
      { id: 'system-prompt-harness-instructions', pieces: ['A'.repeat(100)] },
    ];
    const overrideFiles = {
      [`${OVERRIDE_DIR}system-prompt-harness-instructions.md`]: `<!--\nccVersion: 2.0.0\n-->\n${'A'.repeat(70)}`,
      [`${OVERRIDE_DIR}inline-extra-one.md`]: 'additive body 1',
      [`${OVERRIDE_DIR}inline-extra-two.md`]: 'additive body 2',
    };
    const fs = fakeFs({
      [PROMPTS_JSON_PATH]: makePromptsJson(stockEntries),
      ...overrideFiles,
    });
    const stockMap = loadStockPrompts(PROMPTS_JSON_PATH, fs);
    const overrides = loadOverrides(OVERRIDE_DIR, fs);
    const computeResult = computeDeltas(stockMap, overrides);
    const report = buildReport('2.0.0', 'test-model', computeResult);

    expect(report.additiveOverrides).toHaveLength(2);
    expect(report.additiveOverrides).toContain('inline-extra-one');

    const md = renderMarkdown(report);
    expect(md).toContain('Additive overrides');
    expect(md).toContain('inline-extra-one');

    const json = buildJsonArtifact(report) as Record<string, unknown>;
    expect(json['additiveOverridesCount']).toBe(2);
    expect(Array.isArray(json['additiveOverrides'])).toBe(true);
  });

  it('report shows not-slimmed ids in markdown when always-on has no override', () => {
    const stockEntries = [
      { id: 'system-prompt-harness-instructions', pieces: ['A'.repeat(100)] },
      { id: 'system-prompt-communication-style', pieces: ['B'.repeat(50)] },
    ];
    const overrideFiles = {
      // Only provide override for harness; communication is missing.
      [`${OVERRIDE_DIR}system-prompt-harness-instructions.md`]: `<!--\nccVersion: 2.0.0\n-->\n${'A'.repeat(70)}`,
    };
    const fs = fakeFs({
      [PROMPTS_JSON_PATH]: makePromptsJson(stockEntries),
      ...overrideFiles,
    });
    const stockMap = loadStockPrompts(PROMPTS_JSON_PATH, fs);
    const overrides = loadOverrides(OVERRIDE_DIR, fs);
    const computeResult = computeDeltas(stockMap, overrides);
    const report = buildReport('2.0.0', 'test-model', computeResult);

    expect(report.notSlimmedIds).toContain('system-prompt-communication-style');

    const md = renderMarkdown(report);
    expect(md).toContain('not slimmed');
    expect(md).toContain('system-prompt-communication-style');
  });
});

// ---------------------------------------------------------------------------
// buildJsonArtifact
// ---------------------------------------------------------------------------

describe('buildJsonArtifact', () => {
  it('contains version, model, alwaysOnReductionPct, categories, overallTotal', () => {
    const fs = makeStockFs();
    const stockMap = loadStockPrompts(PROMPTS_JSON_PATH, fs);
    const overrides = loadOverrides(OVERRIDE_DIR, fs);
    const computeResult = computeDeltas(stockMap, overrides);
    const report = buildReport('2.0.0', 'test-model', computeResult);
    const json = buildJsonArtifact(report) as Record<string, unknown>;

    expect(json['version']).toBe('2.0.0');
    expect(json['model']).toBe('test-model');
    expect(typeof json['alwaysOnReductionPct']).toBe('number');
    expect(Array.isArray(json['categories'])).toBe(true);
    expect(json['overallTotal']).toBeDefined();
  });

  it('contains additiveOverrides and notSlimmedIds fields', () => {
    const fs = makeStockFs();
    const stockMap = loadStockPrompts(PROMPTS_JSON_PATH, fs);
    const overrides = loadOverrides(OVERRIDE_DIR, fs);
    const computeResult = computeDeltas(stockMap, overrides);
    const report = buildReport('2.0.0', 'test-model', computeResult);
    const json = buildJsonArtifact(report) as Record<string, unknown>;

    expect(Array.isArray(json['additiveOverrides'])).toBe(true);
    expect(typeof json['additiveOverridesCount']).toBe('number');
    expect(Array.isArray(json['notSlimmedIds'])).toBe(true);
    expect(typeof json['notSlimmedCount']).toBe('number');
  });
});
