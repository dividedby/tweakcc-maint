/**
 * leaf-shell — synchronous shell-outs to the leaf tools plus the normalization layer
 * that turns their real output into the marker vocabulary FourZerosVerdict keys on
 * (PRD #20; issue #22). Honors the sync seam contract (`spawnSync`), so runGate /
 * FourZerosVerdict / FakeAdoptionEnvironment need no async refactor.
 *
 * The verdict is a pure regex parser over captured strings: it asserts the PRESENCE of
 * `Boot-verify OK` for boot-verify, and the ABSENCE of failure signatures for apply. A
 * real `claude -p` prints the model's reply, never that marker — so `normalizeBootVerify`
 * translates the subprocess result into the marker the verdict expects. The apply output
 * is passed through RAW (combined stdout+stderr): the verdict's failed-patch / missing-
 * prompt regexes were written against tweakcc-fixed's phrasing, and the HITL "break a
 * bump" run is precisely what confirms the real output trips them.
 */

import { spawnSync } from 'node:child_process';

/** The captured result of one synchronous shell-out. */
export interface ShellResult {
  /** Process exit code, or null if the process was killed by a signal / failed to spawn. */
  status: number | null;
  stdout: string;
  stderr: string;
}

/** Run a command synchronously, capturing stdout/stderr as UTF-8 text. */
export function runSync(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
): ShellResult {
  const r = spawnSync(command, args, { encoding: 'utf8', env });
  return {
    status: r.status,
    stdout: r.stdout ?? '',
    stderr: r.stderr ?? '',
  };
}

/** Combined stdout+stderr — what feeds `signals.apply` (failures often land on stderr). */
export function combinedOutput(r: ShellResult): string {
  return [r.stdout, r.stderr].filter((s) => s.length > 0).join('\n');
}

/**
 * Translate a `claude -p` boot-verify result into the `bootVerify` signal. A clean run
 * (exit 0 with a non-empty reply) emits the `Boot-verify OK` marker the verdict requires;
 * anything else emits a failure line that deliberately lacks the marker, so the verdict
 * fails boot-verify. The model's reply is recorded for the audit trail but never echoed
 * in the failure branch (so a fluke reply can't smuggle the marker into a failed run).
 */
export function normalizeBootVerify(r: ShellResult): string {
  const reply = r.stdout.trim();
  if (r.status === 0 && reply.length > 0) {
    return `Boot-verify OK: patched binary booted and replied.\n${reply}`;
  }
  const detail = r.stderr.trim() || `exit ${r.status}, no reply`;
  return `Boot-verify failed: ${detail}`;
}
