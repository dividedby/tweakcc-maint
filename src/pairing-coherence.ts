/**
 * PairingCoherence — the standing cross-leaf pairing-coherence check (#95; backlog L3).
 *
 * The leaves move on one release cycle but in TWO repos, and the proven failure window
 * sits between them: when tf PR #5 merged, the canonical-pipeline regen (`e335fb9`)
 * flipped slot bindings the lobotomized overrides had been validated against on the
 * pre-regen adopt branch (the `agent-prompt-worker-fork` mis-bind; roadmap #58 lesson).
 * Nothing on either leaf can see both repos' mains drift apart — only the control plane
 * holds the two-leaf view.
 *
 * Division of labor (ADR 0007 §4 — NEVER reimplement slot resolution): the control plane
 * contributes ONLY the pairing matrix ({tf main × lcc main} ∪ {open tf PR × open lcc PR})
 * and the fetch/materialize plumbing; for each pairing it invokes skrabe's own
 * `tools/auditMisbinds.mjs` with the tf ref's prompts JSON and the lcc ref's override
 * dirs, and keys on HIS exit code + marker vocabulary via the verdict's existing
 * `auditMisbinds` parser (#80) — the driver-verification precedent, attributed per
 * pairing. Surface-specificity is the audit's own: it skips `inline-*` overrides itself
 * (the Three-override-surfaces rule), and a SKIPPED audit (no upstream reference dump on
 * this box, the leaf's `/tmp/pieb-<ver>.json` convention) is the leaf's own non-failure.
 *
 * Cockpit guardrail (CONTEXT.md → Control plane): read-only fetches from the leaves —
 * nothing is pushed, no leaf working tree is mutated (refs are materialized via
 * `git show` into temp dirs).
 */

import { mkdtempSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';

import { parseAuditMisbinds, extractMisbinds } from './four-zeros-verdict.js';
import type { ShellResult } from './leaf-shell.js';
import { runSync, combinedOutput } from './leaf-shell.js';

/** The mains pairing — always in the matrix; the post-merge-regen window lives here. */
export const MAINS_LABEL = 'tf main × lcc main';

/** One open PR's head, as `gh pr list --json number,headRefOid` reports it. */
export interface PrHead {
  number: number;
  headRefOid: string;
}

/** One (tf ref × lcc ref) pairing the audit runs against. */
export interface LeafPairing {
  /** Human attribution for the record (`tf main × lcc main`, `tf#7 × lcc#6`). */
  label: string;
  /** Git ref in the tweakcc-fixed clone supplying the prompts JSON (oid or origin/main). */
  tweakccFixedRef: string;
  /** Git ref in the lobotomized clone supplying the override set (oid or origin/main). */
  lobotomizedRef: string;
}

/** The raw audit runs (one per override dir) collected for one pairing. */
export interface PairingAudit {
  pairing: LeafPairing;
  audits: ShellResult[];
}

/** One pairing's verdict — his audit's reading, attributed to the pairing (#80 input shape). */
export interface PairingResult {
  pairing: LeafPairing;
  /** The joined raw audit output — the verdict's existing `auditMisbinds` input vocabulary. */
  auditMisbinds: string;
  /** His audit's verdict: clean / mis-bound / `undefined` when every run SKIPPED itself. */
  auditMisbindsPassed?: boolean;
  /** His per-finding lines (`<id>: ${NAME} ours=slotX upstream=slotY`), deduped. */
  misbinds: string[];
}

/** The machine-readable record one pairing-coherence run emits. */
export interface PairingCoherenceRecord {
  /** True iff no pairing's audit found a mis-bind (SKIPPED is not a hard input). */
  pass: boolean;
  pairings: PairingResult[];
  /** ISO-8601 timestamp of the run. */
  date: string;
}

/**
 * The pairing matrix: {tf main × lcc main} ∪ {every open tf PR × every open lcc PR}.
 * PR pairings pin the head oids gh reported, so the record names exactly what was
 * audited even if the branch moves mid-run. A PR open on only one leaf adds no pairing —
 * there is no companion override-set/JSON to pair it with; its coherence against the
 * other leaf's main is the mains-side question only after merge.
 */
export function pairingMatrix(tfPrs: PrHead[], lccPrs: PrHead[]): LeafPairing[] {
  const matrix: LeafPairing[] = [
    { label: MAINS_LABEL, tweakccFixedRef: 'origin/main', lobotomizedRef: 'origin/main' },
  ];
  for (const tf of tfPrs) {
    for (const lcc of lccPrs) {
      matrix.push({
        label: `tf#${tf.number} × lcc#${lcc.number}`,
        tweakccFixedRef: tf.headRefOid,
        lobotomizedRef: lcc.headRefOid,
      });
    }
  }
  return matrix;
}

/** Parse `gh pr list --state open --json number,headRefOid` output into PR heads. */
export function parsePrHeads(json: string): PrHead[] {
  const entries = JSON.parse(json) as Array<{ number: number; headRefOid: string }>;
  return entries.map((e) => ({ number: e.number, headRefOid: e.headRefOid }));
}

// `data/prompts/prompts-2.1.170.json` → captures `2.1.170`.
const PROMPTS_FILE = /prompts-(\d+(?:\.\d+)*)\.json$/;

/**
 * The prompts JSON a tf ref carries: the highest `prompts-<version>.json` by NUMERIC
 * per-segment version compare — lexicographic order would rank 2.1.98 above 2.1.170.
 */
export function latestPromptsPath(names: string[]): string | undefined {
  let best: { path: string; segments: number[] } | undefined;
  for (const name of names) {
    const m = PROMPTS_FILE.exec(name);
    if (m === null) continue;
    const segments = m[1]!.split('.').map(Number);
    if (best === undefined || compareSegments(segments, best.segments) > 0) {
      best = { path: name, segments };
    }
  }
  return best?.path;
}

function compareSegments(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/**
 * Interpret the collected audits into the record: per pairing, the joined raw output is
 * the verdict's existing `auditMisbinds` input, read by THE shared parser (#80) — failure
 * wins over clean wins over SKIPPED within a pairing's override dirs. The run passes iff
 * no pairing read mis-bound; an all-SKIPPED pairing is surfaced as `undefined`, the
 * leaf's own non-failure, never a silent green claim of a clean audit.
 */
export function evaluatePairingCoherence(audited: PairingAudit[]): PairingCoherenceRecord {
  if (audited.length === 0) {
    throw new Error(
      'PairingCoherence: empty pairing matrix — refusing to report a vacuous pass',
    );
  }
  const pairings: PairingResult[] = audited.map(({ pairing, audits }) => {
    const auditMisbinds = audits.map(combinedOutput).join('\n');
    return {
      pairing,
      auditMisbinds,
      auditMisbindsPassed: parseAuditMisbinds(auditMisbinds),
      misbinds: extractMisbinds(auditMisbinds),
    };
  });
  return {
    pass: pairings.every((p) => p.auditMisbindsPassed !== false),
    pairings,
    date: new Date().toISOString(),
  };
}

// ── Real fetch/materialize plumbing (HITL-exercised, like RealAdoptionEnvironment) ──────

/** Configuration for the real runner — the local leaf clones and their gh slugs. */
export interface PairingCoherenceConfig {
  /** Local clone of skrabe/tweakcc-fixed (supplies prompts JSONs + his audit tool). */
  tweakccFixedDir: string;
  /** Local clone of skrabe/lobotomized-claude-code (supplies the override sets). */
  lobotomizedDir: string;
  /** gh repo slugs for open-PR discovery (default: skrabe's leaves). */
  tweakccFixedRepo?: string;
  lobotomizedRepo?: string;
}

const DEFAULT_TF_REPO = 'skrabe/tweakcc-fixed';
const DEFAULT_LCC_REPO = 'skrabe/lobotomized-claude-code';

/** Default leaf locations: sibling clones under `~/repos` (same convention as the gate). */
export function defaultPairingConfig(): PairingCoherenceConfig {
  const home = process.env.HOME ?? '';
  return {
    tweakccFixedDir: process.env.TWEAKCC_FIXED_DIR ?? join(home, 'repos', 'tweakcc-fixed'),
    lobotomizedDir:
      process.env.LOBOTOMIZED_DIR ?? join(home, 'repos', 'lobotomized-claude-code'),
  };
}

function git(dir: string, args: string[]): ShellResult {
  return runSync('git', ['-C', dir, ...args]);
}

function gitOrThrow(dir: string, args: string[], what: string): string {
  const r = git(dir, args);
  if (r.status !== 0) {
    throw new Error(`PairingCoherence: ${what} failed (git ${args.join(' ')}): ${r.stderr.trim()}`);
  }
  return r.stdout;
}

/** Open PR heads on one leaf, via `gh pr list` (read-only; the cockpit never writes). */
function discoverOpenPrHeads(repo: string): PrHead[] {
  const r = runSync('gh', [
    'pr', 'list', '-R', repo, '--state', 'open', '--json', 'number,headRefOid',
  ]);
  if (r.status !== 0) {
    throw new Error(`PairingCoherence: gh pr list -R ${repo} failed: ${r.stderr.trim()}`);
  }
  return parsePrHeads(r.stdout);
}

/** Materialize one ref's file into a temp path via `git show` — no working-tree mutation. */
function showToFile(dir: string, ref: string, path: string, dest: string): void {
  writeFileSync(dest, gitOrThrow(dir, ['show', `${ref}:${path}`], `read ${ref}:${path}`));
}

/** Files/dirs a ref carries at one tree level (`git ls-tree --name-only`). */
function lsTree(dir: string, ref: string, path?: string): string[] {
  const args = ['ls-tree', '--name-only', ref, ...(path === undefined ? [] : [path])];
  return gitOrThrow(dir, args, `list ${ref}${path === undefined ? '' : `:${path}`}`)
    .split('\n')
    .filter((l) => l !== '');
}

/**
 * Collect the audit runs for one pairing: materialize the tf ref's latest prompts JSON
 * and the lcc ref's `system-prompts-*` dirs into a temp dir, then invoke HIS audit once
 * per override dir (its positional CLI contract), with the upstream reference following
 * the leaf's own `/tmp/pieb-<ver>.json` convention — missing means the audit SKIPs
 * itself, by the leaf's design (exactly the driver-verification shape).
 */
function collectPairingAudits(cfg: PairingCoherenceConfig, pairing: LeafPairing): PairingAudit {
  const auditTool = join(cfg.tweakccFixedDir, 'tools', 'auditMisbinds.mjs');
  if (!existsSync(auditTool)) {
    throw new Error(
      `PairingCoherence: ${auditTool} not found — the pairing check only ever invokes ` +
        `skrabe's own audit (ADR 0007 §4); update the tweakcc-fixed clone.`,
    );
  }

  const tmp = mkdtempSync(join(tmpdir(), 'pairing-coherence-'));

  // The tf side of the pairing: the ref's latest prompts JSON (numeric version compare).
  const promptsTreePath = latestPromptsPath(
    lsTree(cfg.tweakccFixedDir, pairing.tweakccFixedRef, 'data/prompts/'),
  );
  if (promptsTreePath === undefined) {
    throw new Error(
      `PairingCoherence: no data/prompts/prompts-<ver>.json at ${pairing.tweakccFixedRef} ` +
        `in ${cfg.tweakccFixedDir} (pairing ${pairing.label})`,
    );
  }
  const promptsJson = join(tmp, basename(promptsTreePath));
  showToFile(cfg.tweakccFixedDir, pairing.tweakccFixedRef, promptsTreePath, promptsJson);
  const version = PROMPTS_FILE.exec(promptsTreePath)![1]!;
  const upstreamJson = join('/tmp', `pieb-${version}.json`);

  // The lcc side: every named-override dir the ref carries. `inline-*` files inside them
  // are the audit's own exclusion (Three-override-surfaces rule) — not re-filtered here.
  const overrideDirs = lsTree(cfg.lobotomizedDir, pairing.lobotomizedRef).filter((n) =>
    n.startsWith('system-prompts-'),
  );
  const audits: ShellResult[] = overrideDirs.map((dirName) => {
    const dest = join(tmp, dirName);
    mkdirSync(dest, { recursive: true });
    for (const file of lsTree(cfg.lobotomizedDir, pairing.lobotomizedRef, `${dirName}/`)) {
      if (!file.endsWith('.md')) continue;
      showToFile(cfg.lobotomizedDir, pairing.lobotomizedRef, file, join(tmp, file));
    }
    return runSync('node', [auditTool, promptsJson, upstreamJson, dest]);
  });

  return { pairing, audits };
}

/**
 * Run the standing check end-to-end: discover open PR pairs on both leaves, fetch the
 * refs into the local clones (mains + `pull/<n>/head`, read-only), audit every pairing
 * with skrabe's tool, and interpret via {@link evaluatePairingCoherence}.
 */
export function runPairingCoherence(cfg: PairingCoherenceConfig): PairingCoherenceRecord {
  const tfPrs = discoverOpenPrHeads(cfg.tweakccFixedRepo ?? DEFAULT_TF_REPO);
  const lccPrs = discoverOpenPrHeads(cfg.lobotomizedRepo ?? DEFAULT_LCC_REPO);

  // Fetch what the matrix will read: both mains, plus each open PR's head (GitHub serves
  // `pull/<n>/head`; fetching it makes the gh-reported head oid resolvable locally).
  gitOrThrow(cfg.tweakccFixedDir, ['fetch', '--quiet', 'origin', 'main'], 'fetch tf main');
  gitOrThrow(cfg.lobotomizedDir, ['fetch', '--quiet', 'origin', 'main'], 'fetch lcc main');
  for (const pr of tfPrs) {
    gitOrThrow(
      cfg.tweakccFixedDir,
      ['fetch', '--quiet', 'origin', `pull/${pr.number}/head`],
      `fetch tf PR #${pr.number}`,
    );
  }
  for (const pr of lccPrs) {
    gitOrThrow(
      cfg.lobotomizedDir,
      ['fetch', '--quiet', 'origin', `pull/${pr.number}/head`],
      `fetch lcc PR #${pr.number}`,
    );
  }

  const matrix = pairingMatrix(tfPrs, lccPrs);
  return evaluatePairingCoherence(matrix.map((pairing) => collectPairingAudits(cfg, pairing)));
}
