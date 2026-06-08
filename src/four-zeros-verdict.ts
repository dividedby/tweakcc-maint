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
 */

/** Captured stdout/stderr of the three tools that feed a Four-zeros verdict. */
export interface CapturedSignals {
  /** Output of `tweakcc-fixed --apply` (patches + system-prompt resolution). */
  apply: string;
  /** Output of the Boot-verify run (`claude -p "<prompt>"` against the patched binary). */
  bootVerify: string;
  /** Output of the lobotomized Orphan-variable validator. */
  validator: string;
}

export interface FourZerosResult {
  pass: boolean;
  /** Names of patches that failed to apply (`patch: <name>: failed to find …`). */
  failedPatches: string[];
  /** Names of system prompts the patcher could not find (`Could not find system prompt 'X'`). */
  missingSystemPrompts: string[];
  /** Orphan variables surfaced by the validator (`ReferenceError: VAR is not defined`). */
  orphanVariables: string[];
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

export function evaluate(signals: CapturedSignals): FourZerosResult {
  const failedPatches = captureAll(signals.apply, FAILED_PATCH);
  const missingSystemPrompts = captureAll(signals.apply, MISSING_PROMPT);
  const orphanVariables = captureAll(signals.validator, ORPHAN_VAR);
  const bootVerifyPassed = BOOT_VERIFY_OK.test(signals.bootVerify);

  const pass =
    failedPatches.length === 0 &&
    missingSystemPrompts.length === 0 &&
    orphanVariables.length === 0 &&
    bootVerifyPassed;

  return { pass, failedPatches, missingSystemPrompts, orphanVariables, bootVerifyPassed };
}
