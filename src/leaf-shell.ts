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
import { appendFileSync } from 'node:fs';

/** The captured result of one synchronous shell-out. */
export interface ShellResult {
  /** Process exit code, or null if the process was killed by a signal / failed to spawn. */
  status: number | null;
  stdout: string;
  stderr: string;
}

/**
 * Run a command synchronously, capturing stdout/stderr as UTF-8 text. `input`, when given,
 * is written to the child's stdin (used to pass the boot-verify prompt headlessly, since
 * `claude`'s `--allowedTools` is variadic and would swallow a trailing positional prompt).
 */
// spawnSync's default maxBuffer (1 MiB) silently truncates and kills the child; the
// pairing-coherence check reads multi-megabyte prompts JSONs via `git show` (#95).
const MAX_CAPTURE = 64 * 1024 * 1024;

export function runSync(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
  input?: string,
): ShellResult {
  const r = spawnSync(command, args, { encoding: 'utf8', env, input, maxBuffer: MAX_CAPTURE });
  return {
    status: r.status,
    stdout: r.stdout ?? '',
    stderr: r.stderr ?? '',
  };
}

/**
 * Pull the assistant's final reply text out of `claude -p --output-format stream-json`
 * output: the last `type:"result"` event carries `.result` (and `total_cost_usd`). Lines
 * that don't parse as JSON are skipped. An errored result (`is_error`) yields '' so the
 * boot-verify marker treats it as a failure. Pure — unit-tested.
 */
export function extractResultText(streamJson: string): string {
  let reply = '';
  for (const line of streamJson.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const ev = JSON.parse(trimmed);
      if (ev && ev.type === 'result') {
        reply = ev.is_error ? '' : String(ev.result ?? '');
      }
    } catch {
      // not a JSON event line — ignore
    }
  }
  return reply;
}

/**
 * Boot-verify via headless `claude -p` in stream-json mode, so the final `type:"result"`
 * event (carrying `total_cost_usd` / `num_turns`) lands in the captured output for the
 * cross-repo cost ledger. The raw stream is appended to `GATE_AGENT_LOG` when that env var
 * is set (the CI workflow surfaces `total_cost_usd` from it) — kept off the gate's stdout,
 * which is reserved for the Adoption record. The returned `ShellResult.stdout` is the
 * extracted reply so {@link normalizeBootVerify} keeps working unchanged; if the stream
 * carried no result event but the run still succeeded, the raw stdout is the fallback.
 */
export function runBootVerify(
  prompt: string,
  model: string,
  env: NodeJS.ProcessEnv = process.env,
): ShellResult {
  const r = runSync(
    'claude',
    ['-p', '--output-format', 'stream-json', '--verbose', '--model', model, '--max-budget-usd', '1.00'],
    env,
    prompt,
  );
  const log = env.GATE_AGENT_LOG;
  if (log && r.stdout) {
    try {
      appendFileSync(log, r.stdout.endsWith('\n') ? r.stdout : `${r.stdout}\n`);
    } catch {
      // a missing/unwritable sidecar path must never fail the gate — cost tracking is best-effort
    }
  }
  const reply = extractResultText(r.stdout) || r.stdout.trim();
  return { status: r.status, stdout: reply, stderr: r.stderr };
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
