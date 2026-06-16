/**
 * FourZerosVerdict — interpret raw apply / boot-verify / orphan-validator output
 * into a structured Four-zeros result (CONTEXT.md → "Four-zeros bar").
 *
 * Pure function over captured strings. It does NOT know how the strings were
 * obtained (that is AdoptionEnvironment) nor how a verdict maps to a process
 * exit code (that is IntegrationGate).
 *
 * A verdict is "pass" iff: 0 failed patches, 0 missing system prompts,
 * 0 Orphan variables, and a passing Boot-verify — plus, when the mis-bind audit ran
 * (#80, skrabe's fourth zero), `auditMisbinds=0`.
 *
 * Orphan authority follows ADR 0005 / #31: the patcher's `--report-orphans` output
 * (`signals.orphanReport`) is the AUTHORITATIVE static orphan input — the fork owns the
 * apply-time `${...}` resolution. When that report is present its surviving-placeholder
 * set (deduped) is the hard orphan input. When it is absent/unsupported (the leaf has not
 * shipped #43 yet) the verdict falls back to Boot-verify as the runtime orphan authority
 * and does not treat the static authoring-drift check as a hard input. That static check
 * (`signals.validator`) is now ADVISORY only — surfaced as `advisoryOrphans`, never failing
 * the bar (it cannot see the runtime-scope class, e.g. `IS_TRUTHY_FN`, that Boot-verify does).
 */

import { parseOrphanReport } from './orphan-report.js';

/** Captured stdout/stderr of the tools that feed a Four-zeros verdict. */
export interface CapturedSignals {
  /** Output of `tweakcc-fixed --apply` (patches + system-prompt resolution). */
  apply: string;
  /** Output of the Boot-verify run (`claude -p "<prompt>"` against the patched binary). */
  bootVerify: string;
  /** Output of the lobotomized Orphan-variable validator — the ADVISORY authoring-drift check. */
  validator: string;
  /**
   * Output of the patcher's `--report-orphans` run — the AUTHORITATIVE static orphan signal
   * (ADR 0005). Absent when the leaf does not support the flag (#43 unlanded) → the verdict
   * falls back to Boot-verify as the orphan authority.
   */
  orphanReport?: string;
  /**
   * Output of the leaf's `tools/auditMisbinds.mjs` — skrabe's fourth zero (#80): an
   * override placeholder bound to the wrong identifierMap slot resolves to a valid-but-
   * wrong var (wrong content, no crash), invisible to the other three zeros. Absent when
   * the path that produced the signals did not run the audit (fake / hand-rolled
   * fallback) → not a hard input, mirroring the orphanReport fallback.
   *
   * Representation invariant (#262): `undefined` means not-asserted — either not-run
   * (no override dirs) or the fake/hand-rolled path. NEVER `""` for an empty audit.
   */
  auditMisbinds?: string;
  /**
   * Why the mis-bind audit was not asserted (#262, ADR 0005 addendum). Set by the producer
   * when the audit did not run (`'not-run'` — no override dirs) or SKIPPED itself
   * (`'SKIPPED'` — no upstream reference dump). Absent when the audit produced output.
   * The verdict preserves this in {@link FourZerosResult.auditNotRunReason} so the
   * Adoption record can distinguish the two sub-states.
   */
  auditNotRunReason?: 'not-run' | 'SKIPPED';
  /**
   * Whether the caller explicitly requested override isolation (e.g. the ISOLATE_OVERRIDES
   * capability, #263). When `true`, an empty override set is expected and no warning is
   * raised. When absent/false and `auditNotRunReason` is `'not-run'`, the verdict sets
   * {@link FourZerosResult.unexpectedEmptyOverrideDirs} to flag a possible path/config bug.
   */
  isolationExplicit?: boolean;
}

/** Where the verdict's hard orphan input came from (#31 source attribution). */
export type OrphanSource = 'patcher-report' | 'boot-verify-fallback';

export interface FourZerosResult {
  pass: boolean;
  /** Names of patches that failed to apply (`patch: <name>: failed to find …`). */
  failedPatches: string[];
  /** Names of system prompts the patcher could not find (`Could not find system prompt 'X'`). */
  missingSystemPrompts: string[];
  /**
   * The AUTHORITATIVE orphan set, deduped — surviving placeholders from the patcher report.
   * Empty in the Boot-verify-fallback regime (the report is unavailable; runtime-orphan
   * authority is Boot-verify, carried by {@link bootVerifyPassed}).
   */
  orphanVariables: string[];
  /** Which signal supplied {@link orphanVariables} — the patcher report or the Boot-verify fallback. */
  orphanSource: OrphanSource;
  /**
   * The static authoring-drift findings (deduped) — ADVISORY only (ADR 0005). Surfaced for
   * the reviewer but never failing the bar; the authoritative orphan input is the patcher
   * report ({@link orphanVariables}) or Boot-verify.
   */
  advisoryOrphans: string[];
  /** Whether Boot-verify proved the patched binary started and ran the patched path. */
  bootVerifyPassed: boolean;
  /**
   * Whether the leaf's mis-bind audit came back clean (`auditMisbinds=0`, skrabe's fourth
   * zero, #80). `undefined` when the audit is not a hard input for this run: the signal is
   * absent, or the audit SKIPPED itself (no upstream reference dump — the leaf exits 0).
   */
  auditMisbindsPassed?: boolean;
  /** The audit's mis-bind finding lines (`<id>: ${NAME} ours=slotX upstream=slotY`), deduped. */
  misbinds: string[];
  /**
   * Why the mis-bind audit was not asserted (#262). `'not-run'` when there were no override
   * dirs to audit; `'SKIPPED'` when the audit ran but had no upstream reference dump.
   * Absent when the audit ran and produced a definitive result (clean or with findings).
   * Preserved in the Adoption record so the record shows *why* the fourth zero did not
   * assert `0`, rather than collapsing both sub-states into a bare "not asserted."
   */
  auditNotRunReason?: 'not-run' | 'SKIPPED';
  /**
   * `true` when `auditNotRunReason` is `'not-run'` AND isolation was NOT explicitly
   * requested (#262, AC 5). Surfaced as a warning in the Adoption record — never a hard
   * fail — to flag a possible path/config bug that accidentally produced an empty override
   * set. `false` (or absent) when isolation was explicit or the audit ran normally.
   */
  unexpectedEmptyOverrideDirs?: boolean;
}

// `patch: <name>: failed to find …` — anything after "failed to" counts as a failure.
const FAILED_PATCH = /^patch:\s*(\S+):\s*failed to\b/gm;
// `Could not find system prompt 'X'`
const MISSING_PROMPT = /Could not find system prompt '([^']+)'/g;
// `ReferenceError: VAR is not defined` — an Orphan variable at runtime.
const ORPHAN_VAR = /ReferenceError:\s*(\S+) is not defined/g;
// Boot-verify must positively assert success; absence of this marker is a failure.
const BOOT_VERIFY_OK = /Boot-verify OK\b/;
// auditMisbinds.mjs markers: it must positively assert `mis-bind audit: 0`; SKIPPED
// (no upstream reference dump) exits 0 and is explicitly not a failure. Anything else
// (MIS-BINDS or garbage) must not false-pass.
const AUDIT_CLEAN = /mis-bind audit:\s*0\b/;
const AUDIT_SKIPPED = /mis-bind audit:\s*SKIPPED\b/;
const MISBINDS_FOUND = /MIS-BINDS:\s*\d+/;
// `  <id>: ${NAME} ours=slotX upstream=slotY` — the audit's per-finding lines.
const MISBIND_LINE = /^\s+(\S+:\s*\$\{[A-Z][A-Z0-9_]*\}.*)$/gm;

function captureAll(text: string, re: RegExp): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(re)) {
    if (m[1] !== undefined) out.push(m[1]);
  }
  return out;
}

/** First-seen-order dedup. */
function dedup(names: string[]): string[] {
  return [...new Set(names)];
}

export function evaluate(signals: CapturedSignals): FourZerosResult {
  const failedPatches = captureAll(signals.apply, FAILED_PATCH);
  const missingSystemPrompts = captureAll(signals.apply, MISSING_PROMPT);
  const bootVerifyPassed = BOOT_VERIFY_OK.test(signals.bootVerify);

  // The orphan report is the authoritative static orphan signal; its absence/malformity means
  // the leaf does not support the flag → fall back to Boot-verify as the runtime authority.
  // NOTE (#302): `signals.orphanReport` is currently populated by the in-repo control-plane
  // producer (`runOrphanReport`, driver-verification.ts), seeded from the PRISTINE prompts JSON
  // (pristine-extract-cli.ts). The `'patcher-report'` label is historical — named for the leaf
  // patcher's own `--report-orphans`, which it does not yet emit — so the source it really
  // reflects is the producer keyed to the committed identifierMap (ADR 0005).
  const reportFindings = parseOrphanReport(signals.orphanReport);
  const orphanSource: OrphanSource =
    reportFindings === undefined ? 'boot-verify-fallback' : 'patcher-report';
  const orphanVariables = dedup((reportFindings ?? []).map((f) => f.variable));

  // The static authoring-drift check is advisory only (ADR 0005) — surfaced, never failing.
  const advisoryOrphans = dedup(captureAll(signals.validator, ORPHAN_VAR));

  // The mis-bind audit (skrabe's fourth zero, #80): a hard input only when it ran and
  // did not SKIP itself; like Boot-verify it must positively assert cleanliness.
  // Representation invariant (#262): auditMisbinds is `undefined` (never `""`) when
  // not-asserted — the pass condition is `!== false`, so undefined passes through.
  const auditMisbindsPassed = parseAuditMisbinds(signals.auditMisbinds);
  const misbinds = signals.auditMisbinds === undefined ? [] : extractMisbinds(signals.auditMisbinds);

  // Derive the not-run reason (#262, AC 4): producer-set 'not-run' takes precedence;
  // 'SKIPPED' is inferred from the parsed audit output when the signal was present but
  // the audit skipped itself. Absent when the audit ran and produced a definitive verdict.
  const auditNotRunReason: 'not-run' | 'SKIPPED' | undefined =
    signals.auditNotRunReason === 'not-run'
      ? 'not-run'
      : signals.auditMisbinds !== undefined && auditMisbindsPassed === undefined
        ? 'SKIPPED'
        : undefined;

  // Unexpected-empty warning (#262, AC 5): not-run without an explicit isolation request
  // suggests a path/config bug; surfaced but never a hard fail.
  const unexpectedEmptyOverrideDirs =
    auditNotRunReason === 'not-run' && !signals.isolationExplicit;

  const pass =
    failedPatches.length === 0 &&
    missingSystemPrompts.length === 0 &&
    orphanVariables.length === 0 &&
    bootVerifyPassed &&
    auditMisbindsPassed !== false;

  return {
    pass,
    failedPatches,
    missingSystemPrompts,
    orphanVariables,
    orphanSource,
    advisoryOrphans,
    bootVerifyPassed,
    auditMisbindsPassed,
    misbinds,
    auditNotRunReason,
    unexpectedEmptyOverrideDirs,
  };
}

/**
 * `undefined` = not a hard input (signal absent, or every audit SKIPPED itself); else
 * clean? The signal may join several per-override-dir audit runs, so failure wins over
 * a clean assertion from another dir, which wins over SKIPPED.
 *
 * Exported so the cross-leaf pairing-coherence check (#95) reuses THE parser for skrabe's
 * audit vocabulary rather than growing a second one (ADR 0007 §4 — his tool, one reading).
 */
export function parseAuditMisbinds(raw: string | undefined): boolean | undefined {
  if (raw === undefined) return undefined;
  if (MISBINDS_FOUND.test(raw)) return false;
  if (AUDIT_CLEAN.test(raw)) return true;
  if (AUDIT_SKIPPED.test(raw)) return undefined;
  return false;
}

/** The audit's per-finding lines, deduped — shared with the pairing-coherence check (#95). */
export function extractMisbinds(raw: string): string[] {
  return dedup(captureAll(raw, MISBIND_LINE));
}
