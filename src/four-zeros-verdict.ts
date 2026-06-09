/**
 * FourZerosVerdict — interpret raw apply / boot-verify / orphan-validator output
 * into a structured Four-zeros result (CONTEXT.md → "Four-zeros bar").
 *
 * Pure function over captured strings. It does NOT know how the strings were
 * obtained (that is AdoptionEnvironment) nor how a verdict maps to a process
 * exit code (that is IntegrationGate).
 *
 * A verdict is "pass" iff: 0 failed patches, 0 missing system prompts,
 * 0 Orphan variables, and a passing Boot-verify.
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
}

// `patch: <name>: failed to find …` — anything after "failed to" counts as a failure.
const FAILED_PATCH = /^patch:\s*(\S+):\s*failed to\b/gm;
// `Could not find system prompt 'X'`
const MISSING_PROMPT = /Could not find system prompt '([^']+)'/g;
// `ReferenceError: VAR is not defined` — an Orphan variable at runtime.
const ORPHAN_VAR = /ReferenceError:\s*(\S+) is not defined/g;
// Boot-verify must positively assert success; absence of this marker is a failure.
const BOOT_VERIFY_OK = /Boot-verify OK\b/;

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

  // The patcher report is the authoritative orphan signal; its absence/malformity means the
  // leaf does not support the flag → fall back to Boot-verify as the runtime authority.
  const reportFindings = parseOrphanReport(signals.orphanReport);
  const orphanSource: OrphanSource =
    reportFindings === undefined ? 'boot-verify-fallback' : 'patcher-report';
  const orphanVariables = dedup((reportFindings ?? []).map((f) => f.variable));

  // The static authoring-drift check is advisory only (ADR 0005) — surfaced, never failing.
  const advisoryOrphans = dedup(captureAll(signals.validator, ORPHAN_VAR));

  const pass =
    failedPatches.length === 0 &&
    missingSystemPrompts.length === 0 &&
    orphanVariables.length === 0 &&
    bootVerifyPassed;

  return {
    pass,
    failedPatches,
    missingSystemPrompts,
    orphanVariables,
    orphanSource,
    advisoryOrphans,
    bootVerifyPassed,
  };
}
