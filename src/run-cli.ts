/**
 * run-cli — the production `runCli` spawn wrapper the {@link RealVariantRunner}
 * injects through the {@link VariantRunner} seam (#176; design doc → Seams). It spawns the
 * adopted Claude Code install HEADLESSLY, dispatching the launcher off the resolved install
 * file the provisioner copied (#178): the fork ships in two lineages and the live install can
 * be EITHER —
 *
 *   - npm `cli.js`        → `node <cliPath> -p --output-format json --model <M> --effort <E> …`
 *   - native binary       → `<cliPath> -p …` directly (a Mach-O/ELF the provisioner copied;
 *                            `node <native-binary>` exits 1 parsing it as JS — #180).
 *
 * The bench `executeRun` already built `[-p, prompt, --model, M, --effort, E, --output-format,
 * json]` and RealVariantRunner prepended the variant's `cliPath`; this wrapper picks the
 * launcher by `cliPath`'s extension (`.js`/`.mjs`/`.cjs` → `node`, else exec the binary).
 * Holding model/effort/prompt constant across both arms is the caller's job — the ONLY
 * variable here is which install runs (ADR 0002).
 *
 * It mirrors {@link runSync}'s sync shell-out boundary (`spawnSync`, the same 64 MiB capture
 * cap) so a multi-line reply is not silently truncated at spawnSync's 1 MiB default.
 *
 * R4: the credential env must stay explicit on the spawn even when `HOME` is sandboxed.
 * Provisioning steers the adopted install's discovery via a sandbox `HOME`, but a sandboxed
 * `HOME` would strip the stored OAuth the run authenticates with — so the credential env vars
 * (`CLAUDE_CODE_OAUTH_TOKEN` / `ANTHROPIC_API_KEY`) are re-asserted on the spawn env explicitly.
 */

import { spawnSync } from 'node:child_process';
import type { CliInvocation, CliResult } from '@dividedby/bench-core';

/**
 * 64 MiB — mirrors {@link runSync}'s `MAX_CAPTURE`. spawnSync's 1 MiB default silently
 * truncates and kills the child; a multi-line `claude -p --output-format json` reply (#176)
 * must land intact, exactly as the sync shell-out boundary already guarantees.
 */
export const RUN_CLI_MAX_BUFFER = 64 * 1024 * 1024;

/** The credential env vars the run authenticates with — re-asserted explicitly under R4. */
const CREDENTIAL_ENV_VARS = ['CLAUDE_CODE_OAUTH_TOKEN', 'ANTHROPIC_API_KEY'] as const;

/** JS entrypoint extensions that must be launched via `node`; anything else is run directly. */
const JS_ENTRYPOINT_EXTENSIONS = ['.js', '.mjs', '.cjs'] as const;

/**
 * Pick the spawn `command` + `args` for the install at `args[0]` (the cliPath RealVariantRunner
 * prepended). An npm `cli.js` lineage runs under `node`; a native-binary lineage is executed
 * directly — `node <native-binary>` exits 1 parsing the executable as JS (#180).
 */
function dispatchLauncher(args: string[]): { command: string; args: string[] } {
  const cliPath = args[0] ?? '';
  const isJsEntrypoint = JS_ENTRYPOINT_EXTENSIONS.some((ext) => cliPath.endsWith(ext));
  return isJsEntrypoint ? { command: 'node', args } : { command: cliPath, args: args.slice(1) };
}

/** The `spawnSync` subset this wrapper uses — a seam so the contract is unit-tested with no subprocess. */
export type SpawnSeam = (
  command: string,
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv; maxBuffer?: number; encoding?: string },
) => { status: number | null; stdout: string; stderr: string };

/**
 * The default spawn boundary: `spawnSync` pinned to its string-encoding overload (we always
 * pass `encoding: 'utf8'`), so {@link SpawnSeam}'s string result type holds without a cast.
 */
const defaultSpawn: SpawnSeam = (command, args, options) =>
  spawnSync(command, args, { ...options, encoding: 'utf8' });

export interface MakeRunCliOptions {
  /** The spawn boundary; defaults to `spawnSync`. Injected so tests run no real subprocess. */
  spawn?: SpawnSeam;
  /** Base environment for the spawn; defaults to `process.env`. */
  env?: NodeJS.ProcessEnv;
  /** The sandbox HOME the adopted install's discovery is steered to (R4). Omit to inherit. */
  home?: string;
}

/**
 * Build the production `runCli` matching the injected `(invocation: CliInvocation) => CliResult`
 * shape. The returned wrapper spawns `node` with the invocation's argv (already cli.js-prefixed),
 * in the run's `cwd`, with the credential env explicit even under a sandboxed `HOME` (R4).
 */
export function makeRunCli(options: MakeRunCliOptions = {}): (invocation: CliInvocation) => CliResult {
  const spawn: SpawnSeam = options.spawn ?? defaultSpawn;
  const baseEnv = options.env ?? process.env;

  // Re-assert HOME (when sandboxed) and the credential env on top of the base, so a sandboxed
  // HOME never strips the stored credential the run needs.
  const env: NodeJS.ProcessEnv = { ...baseEnv };
  if (options.home !== undefined) env.HOME = options.home;
  for (const name of CREDENTIAL_ENV_VARS) {
    if (baseEnv[name] !== undefined) env[name] = baseEnv[name];
  }

  return (invocation: CliInvocation): CliResult => {
    const { command, args } = dispatchLauncher(invocation.args);
    const r = spawn(command, args, {
      cwd: invocation.cwd,
      env,
      encoding: 'utf8',
      maxBuffer: RUN_CLI_MAX_BUFFER,
    });
    return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
  };
}
