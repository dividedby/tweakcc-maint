/**
 * leanness-report — deterministic always-on prompt-size delta tool (#328).
 *
 * Computes the char/token delta between stock Claude Code prompts (from a
 * prompts-<v>.json) and the lobotomized overrides for one model, with no model
 * calls and no network I/O.
 *
 * Six always-on categories (lobotomized README, §"What you get"):
 *   harness · communication · doing-tasks · executing-actions · memory · core-tools
 *
 * Fail-loud policy (I/O errors only — fs layer throws on unreadable files):
 *   - Override id absent from stock → additive bucket (listed in report, excluded from delta math).
 *   - Always-on stock id with no override → shown at 0% reduction in "not slimmed" list.
 *   - Non-always-on stock id with no override → treated as 100% removed (correct).
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The six always-on categories from the lobotomized README. */
export type AlwaysOnCategory =
  | 'harness'
  | 'communication'
  | 'doing-tasks'
  | 'executing-actions'
  | 'memory'
  | 'core-tools';

export interface PromptSizes {
  chars: number;
  // ponytail: deliberate approximation Math.ceil(chars/4); upgrade path = swap in a real
  // tokenizer if a future need demands exactness (comparative ratio is tokenizer-robust, #328).
  tokens: number;
}

export interface PromptDelta {
  promptId: string;
  category: AlwaysOnCategory | 'other';
  stock: PromptSizes;
  /** null = no override (prompt removed entirely; 100% reduction in overall total). */
  lobo: PromptSizes | null;
  deltaChars: number;
  deltaTokens: number;
  /** Reduction in [0..1]. null when stock is empty (no meaningful ratio). */
  reductionRatio: number | null;
}

export interface CategorySummary {
  category: AlwaysOnCategory | 'other';
  stock: PromptSizes;
  lobo: PromptSizes;
  deltaChars: number;
  deltaTokens: number;
  reductionRatio: number | null;
}

export interface LeannessTotals {
  stock: PromptSizes;
  lobo: PromptSizes;
  deltaChars: number;
  deltaTokens: number;
  reductionRatio: number | null;
}

export interface LeannessReport {
  version: string;
  model: string;
  alwaysOnReductionPct: number;
  alwaysOnTotal: LeannessTotals;
  overallTotal: LeannessTotals;
  categories: CategorySummary[];
  perPrompt: PromptDelta[];
  /** Non-empty when the always-on reduction is outside the stated tolerance. */
  classificationOpenQuestion: string;
  /**
   * Override ids that have no matching stock entry at this version (e.g. inline-*
   * additions by skrabe, or prompts removed from stock). Excluded from delta math.
   */
  additiveOverrides: string[];
  /**
   * Always-on stock prompt ids that have no lobotomized override. Included in the
   * measured set at 0% reduction (no slimming).
   */
  notSlimmedIds: string[];
}

/** Thrown only for genuine I/O errors (unreadable files, missing dirs). */
export class LeannessError extends Error {
  constructor(
    public readonly kind: 'io-error',
    message: string,
  ) {
    super(message);
    this.name = 'LeannessError';
  }
}

// ---------------------------------------------------------------------------
// Category classification
// ---------------------------------------------------------------------------

/**
 * Classify a prompt id into an always-on category or 'other'.
 *
 * Rules map directly to the six categories named in the lobotomized README:
 *   harness          → ids containing "harness"
 *   communication    → ids containing "communication" that aren't tool-* prefixed
 *   doing-tasks      → ids containing "doing-task"
 *   executing-actions→ ids containing "executing-action"
 *   memory           → ids starting with "system-prompt-memory"
 *   core-tools       → ids starting with "tool-description-"
 *   anything else    → 'other'
 */
export function classifyPrompt(promptId: string): AlwaysOnCategory | 'other' {
  if (promptId.includes('harness')) return 'harness';
  if (promptId.includes('doing-task')) return 'doing-tasks';
  if (promptId.includes('executing-action')) return 'executing-actions';
  if (promptId.startsWith('system-prompt-memory')) return 'memory';
  if ((promptId.includes('communication') || promptId.includes('communicating')) && !promptId.startsWith('tool-')) return 'communication';
  if (promptId.startsWith('tool-description-')) return 'core-tools';
  return 'other';
}

export function isAlwaysOn(category: AlwaysOnCategory | 'other'): category is AlwaysOnCategory {
  return category !== 'other';
}

// ---------------------------------------------------------------------------
// Size helpers
// ---------------------------------------------------------------------------

function toSizes(chars: number): PromptSizes {
  return {
    chars,
    // ponytail: deliberate approximation Math.ceil(chars/4); upgrade path = swap in a real
    // tokenizer if a future need demands exactness (comparative ratio is tokenizer-robust, #328).
    tokens: Math.ceil(chars / 4),
  };
}

// ---------------------------------------------------------------------------
// I/O helpers — injectable via deps for testing
// ---------------------------------------------------------------------------

/** Minimal shape of one entry from a prompts-<v>.json. */
interface PromptJsonEntry {
  id: string;
  pieces: unknown[];
}

/** Minimal shape of the prompts-<v>.json top level. */
interface PromptsJson {
  version?: string;
  prompts: PromptJsonEntry[];
}

export interface LeannessFs {
  readFile: (path: string) => string;
  listDir: (dir: string) => string[];
}

export const realLeannessFs: LeannessFs = {
  readFile: (path) => readFileSync(path, 'utf8'),
  listDir: (dir) => readdirSync(dir),
};

// ---------------------------------------------------------------------------
// Stock loading
// ---------------------------------------------------------------------------

/**
 * Concatenate all pieces from a prompt entry into a single string.
 * Pieces may include non-string elements (placeholder markers); stringify them.
 */
function joinPieces(pieces: unknown[]): string {
  return pieces.map((p) => (typeof p === 'string' ? p : String(p))).join('');
}

export interface StockPrompt {
  id: string;
  text: string;
}

/** Load all prompts from a prompts-<v>.json. Returns a map id→StockPrompt. */
export function loadStockPrompts(
  promptsJsonPath: string,
  fs: LeannessFs,
): Map<string, StockPrompt> {
  const raw = JSON.parse(fs.readFile(promptsJsonPath)) as PromptsJson;
  const map = new Map<string, StockPrompt>();
  for (const entry of raw.prompts ?? []) {
    if (typeof entry.id === 'string') {
      map.set(entry.id, {
        id: entry.id,
        text: joinPieces(entry.pieces ?? []),
      });
    }
  }
  return map;
}

// ---------------------------------------------------------------------------
// Override loading
// ---------------------------------------------------------------------------

const FRONT_MATTER_RE = /^\s*<!--[\s\S]*?-->\s*/;

/**
 * Strip the leading HTML-comment front-matter block from a lobotomized override
 * file. The remaining text is the effective lobotomized prompt body.
 */
export function stripFrontMatter(raw: string): string {
  return raw.replace(FRONT_MATTER_RE, '');
}

export interface OverrideSet {
  /** Map from prompt id → effective override body (front-matter stripped). */
  byId: Map<string, string>;
}

/**
 * Load all `.md` overrides from an override dir.
 * Filename minus `.md` is the prompt id.
 */
export function loadOverrides(overrideDir: string, fs: LeannessFs): OverrideSet {
  const files = fs.listDir(overrideDir).filter((f) => f.endsWith('.md'));
  const byId = new Map<string, string>();
  for (const file of files) {
    const id = file.slice(0, -3); // strip .md
    const raw = fs.readFile(join(overrideDir, file));
    byId.set(id, stripFrontMatter(raw));
  }
  return { byId };
}

// ---------------------------------------------------------------------------
// Core computation
// ---------------------------------------------------------------------------

export interface ComputeDeltasResult {
  deltas: PromptDelta[];
  /** Override ids with no matching stock entry — listed in report, excluded from delta math. */
  additiveOverrides: string[];
  /** Always-on stock prompt ids that have no override — measured at 0% reduction. */
  notSlimmedIds: string[];
}

/**
 * Partition overrides/stock and compute per-prompt deltas.
 *
 * - Override id absent from stock → goes into additiveOverrides (not measured, listed in report).
 * - Always-on stock id with no override → included in deltas at 0% reduction; id added to notSlimmedIds.
 * - Non-always-on stock id with no override → PromptDelta with lobo=null (removed, 100% reduction in total).
 */
export function computeDeltas(
  stockMap: Map<string, StockPrompt>,
  overrides: OverrideSet,
): ComputeDeltasResult {
  // 1. Partition override ids: additive = not in stock at this version.
  const additiveOverrides: string[] = [];
  const measuredOverrides = new Map<string, string>();
  for (const [oid, body] of overrides.byId) {
    if (!stockMap.has(oid)) {
      additiveOverrides.push(oid);
    } else {
      measuredOverrides.set(oid, body);
    }
  }

  // 2. Build per-prompt deltas over all stock ids.
  const deltas: PromptDelta[] = [];
  const notSlimmedIds: string[] = [];

  for (const [id, prompt] of stockMap) {
    const category = classifyPrompt(id);
    const stockSizes = toSizes(prompt.text.length);
    const overrideBody = measuredOverrides.get(id) ?? null;

    let loboSizes: PromptSizes | null;
    if (overrideBody !== null) {
      // Override present: measure the actual override body.
      loboSizes = toSizes(overrideBody.length);
    } else if (isAlwaysOn(category)) {
      // Always-on with no override: treat lobo = stock (0% reduction, prompt unchanged).
      // Flag it for the "not slimmed" report section.
      notSlimmedIds.push(id);
      loboSizes = stockSizes;
    } else {
      // Non-always-on with no override: prompt removed entirely (100% reduction in overall).
      loboSizes = null;
    }

    // For removed prompts (lobo=null), treat lobo size as 0 for delta purposes.
    const loboChars = loboSizes?.chars ?? 0;
    const loboTokens = loboSizes?.tokens ?? 0;

    const deltaChars = stockSizes.chars - loboChars;
    const deltaTokens = stockSizes.tokens - loboTokens;
    const reductionRatio =
      stockSizes.chars > 0 ? deltaChars / stockSizes.chars : null;

    deltas.push({ promptId: id, category, stock: stockSizes, lobo: loboSizes, deltaChars, deltaTokens, reductionRatio });
  }

  return { deltas, additiveOverrides, notSlimmedIds };
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

function addSizes(a: PromptSizes, b: PromptSizes): PromptSizes {
  return { chars: a.chars + b.chars, tokens: a.tokens + b.tokens };
}

function sumSizes(items: PromptSizes[]): PromptSizes {
  return items.reduce(addSizes, { chars: 0, tokens: 0 });
}

function makeTotals(stockSizes: PromptSizes, loboSizes: PromptSizes): LeannessTotals {
  const deltaChars = stockSizes.chars - loboSizes.chars;
  const deltaTokens = stockSizes.tokens - loboSizes.tokens;
  const reductionRatio = stockSizes.chars > 0 ? deltaChars / stockSizes.chars : null;
  return { stock: stockSizes, lobo: loboSizes, deltaChars, deltaTokens, reductionRatio };
}

const ALL_ALWAYS_ON_CATEGORIES: AlwaysOnCategory[] = [
  'harness',
  'communication',
  'doing-tasks',
  'executing-actions',
  'memory',
  'core-tools',
];

/** Aggregate per-prompt deltas into per-category summaries + totals. */
export function aggregateDeltas(deltas: PromptDelta[]): {
  categories: CategorySummary[];
  alwaysOnTotal: LeannessTotals;
  overallTotal: LeannessTotals;
} {
  // Per-category aggregation (always-on categories + 'other').
  const catGroups = new Map<AlwaysOnCategory | 'other', PromptDelta[]>();
  for (const delta of deltas) {
    const group = catGroups.get(delta.category) ?? [];
    group.push(delta);
    catGroups.set(delta.category, group);
  }

  const categories: CategorySummary[] = [...ALL_ALWAYS_ON_CATEGORIES, 'other' as const]
    .map((cat) => {
      const group = catGroups.get(cat) ?? [];
      const stock = sumSizes(group.map((d) => d.stock));
      // Lobo size: removed prompts (lobo=null) count as 0 chars.
      const lobo = sumSizes(group.map((d) => d.lobo ?? { chars: 0, tokens: 0 }));
      const deltaChars = stock.chars - lobo.chars;
      const deltaTokens = stock.tokens - lobo.tokens;
      const reductionRatio = stock.chars > 0 ? deltaChars / stock.chars : null;
      return { category: cat, stock, lobo, deltaChars, deltaTokens, reductionRatio };
    });

  // Always-on total: sum across the six always-on categories only.
  const alwaysOnDeltas = deltas.filter((d) => isAlwaysOn(d.category));
  const aoStock = sumSizes(alwaysOnDeltas.map((d) => d.stock));
  const aoLobo = sumSizes(alwaysOnDeltas.map((d) => d.lobo ?? { chars: 0, tokens: 0 }));
  const alwaysOnTotal = makeTotals(aoStock, aoLobo);

  // Overall total: all stock prompts.
  const allStock = sumSizes(deltas.map((d) => d.stock));
  const allLobo = sumSizes(deltas.map((d) => d.lobo ?? { chars: 0, tokens: 0 }));
  const overallTotal = makeTotals(allStock, allLobo);

  return { categories, alwaysOnTotal, overallTotal };
}

// ---------------------------------------------------------------------------
// Report assembly
// ---------------------------------------------------------------------------

/** Tolerance for the always-on headline figure vs README ~30%. ±5 percentage points. */
const ALWAYS_ON_TOLERANCE_PP = 5;
const ALWAYS_ON_README_PCT = 30;

function pct(ratio: number | null): string {
  if (ratio === null) return 'n/a';
  return `${(ratio * 100).toFixed(1)}%`;
}

export function buildReport(
  version: string,
  model: string,
  computeResult: ComputeDeltasResult,
): LeannessReport {
  const { deltas, additiveOverrides, notSlimmedIds } = computeResult;
  const { categories, alwaysOnTotal, overallTotal } = aggregateDeltas(deltas);
  const alwaysOnReductionPct =
    alwaysOnTotal.stock.chars > 0
      ? (alwaysOnTotal.deltaChars / alwaysOnTotal.stock.chars) * 100
      : 0;

  const deviation = Math.abs(alwaysOnReductionPct - ALWAYS_ON_README_PCT);
  const classificationOpenQuestion =
    deviation > ALWAYS_ON_TOLERANCE_PP
      ? `Always-on reduction ${alwaysOnReductionPct.toFixed(1)}% deviates from README ~${ALWAYS_ON_README_PCT}% by ${deviation.toFixed(1)}pp (tolerance ±${ALWAYS_ON_TOLERANCE_PP}pp). ` +
        `Review always-on category classification rules in src/leanness-report.ts (classifyPrompt).`
      : '';

  return {
    version,
    model,
    alwaysOnReductionPct,
    alwaysOnTotal,
    overallTotal,
    categories,
    perPrompt: deltas,
    classificationOpenQuestion,
    additiveOverrides,
    notSlimmedIds,
  };
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function renderSizes(s: PromptSizes): string {
  return `${s.chars.toLocaleString()} chars / ${s.tokens.toLocaleString()} tok`;
}

/** Render the report as a markdown artifact suitable for a leaf-PR body. */
export function renderMarkdown(report: LeannessReport): string {
  const { version, model, alwaysOnReductionPct, alwaysOnTotal, overallTotal, categories } = report;
  const lines: string[] = [];

  lines.push(`## Leanness report — ${model} @ ${version}`);
  lines.push('');
  lines.push(
    `**Always-on reduction: ${alwaysOnReductionPct.toFixed(1)}%** ` +
      `(stock ${renderSizes(alwaysOnTotal.stock)} → lobo ${renderSizes(alwaysOnTotal.lobo)}, ` +
      `−${alwaysOnTotal.deltaChars.toLocaleString()} chars / −${alwaysOnTotal.deltaTokens.toLocaleString()} tok)`,
  );
  lines.push('');
  lines.push(
    'Less always-on prompt means a faster first-response prefill, more context headroom ' +
      'before compaction, and reduced drift from contradictory rules — without losing anything ' +
      'the model relies on.',
  );
  lines.push('');

  if (report.classificationOpenQuestion) {
    lines.push(`> **Open question:** ${report.classificationOpenQuestion}`);
    lines.push('');
  }

  lines.push('### Always-on breakdown by category');
  lines.push('');
  lines.push('| Category | Stock | Lobo | Delta | Reduction |');
  lines.push('|---|---|---|---|---|');

  const alwaysOnCats = categories.filter((c) => isAlwaysOn(c.category));
  for (const cat of alwaysOnCats) {
    lines.push(
      `| ${cat.category} | ${renderSizes(cat.stock)} | ${renderSizes(cat.lobo)} | −${cat.deltaChars.toLocaleString()} chars | ${pct(cat.reductionRatio)} |`,
    );
  }

  lines.push(`| **always-on total** | **${renderSizes(alwaysOnTotal.stock)}** | **${renderSizes(alwaysOnTotal.lobo)}** | **−${alwaysOnTotal.deltaChars.toLocaleString()} chars** | **${alwaysOnReductionPct.toFixed(1)}%** |`);
  lines.push('');

  lines.push('### Overall total (all stock prompts)');
  lines.push('');
  const otherCat = categories.find((c) => c.category === 'other');
  if (otherCat) {
    lines.push(
      `Includes ${otherCat.stock.chars.toLocaleString()} chars from "other" (non-always-on) prompts; ` +
        `removed entirely or partially overridden.`,
    );
    lines.push('');
  }
  lines.push(`| Stock | Lobo | Delta | Reduction |`);
  lines.push(`|---|---|---|---|`);
  lines.push(
    `| ${renderSizes(overallTotal.stock)} | ${renderSizes(overallTotal.lobo)} | −${overallTotal.deltaChars.toLocaleString()} chars | ${pct(overallTotal.reductionRatio)} |`,
  );
  lines.push('');

  // Additive overrides section (not-in-stock-at-V, excluded from delta math).
  if (report.additiveOverrides.length > 0) {
    lines.push(`### Additive overrides — not in stock at ${version} (${report.additiveOverrides.length})`);
    lines.push('');
    lines.push(
      'These override files have no matching stock prompt id at this version ' +
        '(skrabe additions such as `inline-*`, or prompts removed from stock). ' +
        'They are **not included** in the reduction percentages above.',
    );
    lines.push('');
    for (const id of report.additiveOverrides.slice().sort()) {
      lines.push(`- \`${id}\``);
    }
    lines.push('');
  }

  // Not-slimmed section (always-on stock prompts with no override).
  if (report.notSlimmedIds.length > 0) {
    lines.push(`### Always-on prompts with no override — not slimmed (${report.notSlimmedIds.length})`);
    lines.push('');
    lines.push(
      'These always-on stock prompts have no lobotomized override; they contribute at 0% reduction.',
    );
    lines.push('');
    for (const id of report.notSlimmedIds.slice().sort()) {
      lines.push(`- \`${id}\``);
    }
    lines.push('');
  }

  lines.push(
    `_Token counts are approximate (⌈chars/4⌉). The comparative reduction ratio is ` +
      `tokenizer-robust. Upgrade path: swap in a real tokenizer if exactness is needed._`,
  );

  return lines.join('\n');
}

/** Build the structured JSON artifact. */
export function buildJsonArtifact(report: LeannessReport): object {
  return {
    version: report.version,
    model: report.model,
    alwaysOnReductionPct: parseFloat(report.alwaysOnReductionPct.toFixed(1)),
    alwaysOnTotal: report.alwaysOnTotal,
    overallTotal: report.overallTotal,
    categories: report.categories.map((c) => ({
      category: c.category,
      stockChars: c.stock.chars,
      stockTokens: c.stock.tokens,
      loboChars: c.lobo.chars,
      loboTokens: c.lobo.tokens,
      deltaChars: c.deltaChars,
      reductionPct: c.reductionRatio !== null ? parseFloat((c.reductionRatio * 100).toFixed(1)) : null,
    })),
    classificationOpenQuestion: report.classificationOpenQuestion,
    additiveOverrides: report.additiveOverrides,
    additiveOverridesCount: report.additiveOverrides.length,
    notSlimmedIds: report.notSlimmedIds,
    notSlimmedCount: report.notSlimmedIds.length,
  };
}

// ---------------------------------------------------------------------------
// Top-level runner
// ---------------------------------------------------------------------------

export interface LeannessRunOptions {
  promptsJsonPath: string;
  overrideDir: string;
  version: string;
  model: string;
  fs?: LeannessFs;
}

/**
 * Full run: load stock + overrides, partition, compute, build report.
 * Only throws (LeannessError or raw fs error) on genuine I/O failures.
 * Additive overrides and not-slimmed always-on prompts are surfaced in the
 * report rather than causing a hard exit.
 */
export function runLeannessReport(opts: LeannessRunOptions): LeannessReport {
  const fsImpl = opts.fs ?? realLeannessFs;
  const stockMap = loadStockPrompts(opts.promptsJsonPath, fsImpl);
  const overrides = loadOverrides(opts.overrideDir, fsImpl);
  const computeResult = computeDeltas(stockMap, overrides);
  return buildReport(opts.version, opts.model, computeResult);
}
